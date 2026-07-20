"""
generate_krea2.py — Krea2 handler (t2i / i2i / edit, plus detailer / upscaler).

Krea2 needs NO op split: ONE universal graph serves t2i + i2i + pose-reference + EDIT,
switched at RUNTIME by injected values. EDIT is mask-based: an optional Input_Mask
(painted in the History workspace) drives a masked crop; empty → whole-image edit.
Input_HiRes_Mode (edit only) forces the masked crop to 1024px when a mask is present.
It ships across ONE axis → TWO runtime files per template:

  content : SFW | NSFW

Tier is NOT a file axis (MPI-316). Both tiers run from the same Raw weight — the
`Accelerator Lora` (turbo-distill, an SVD delta extracted FROM Raw) reconstructs the old
Turbo transformer at strength 1.0, gated by an MpiMath off Input_Tier. So the app's
krea2Turbo toggle injects the tier per run, and the two Turbo transformers were dropped,
collapsing the Krea2 library from 4 cards to 2.

The source templates route here (registry `krea2_` prefix):
  krea2_t2i_template.json       -> _sfw / _nsfw
  krea2_detailer_template.json  -> _sfw / _nsfw
  krea2_upscaler_template.json  -> _sfw / _nsfw

Per output this handler bakes the three things a hand-export cannot be trusted to carry:

  1. UNETLoader weight (titled `Load Diffusion Model`) — the content-variant Raw weight.
  2. Input_Tier.int — a SAFE DEFAULT of 1 (High); the krea2Turbo toggle is the authority.
  3. Input_Bypass_Filter_Lora.strength_model — SFW 1.0 / NSFW 0.0 (content-filter bypass).

  (MPI-272: the optional Input_Image is now a self-gating MpiLoadImageFromPath — a
  plain t2i leaves its `string` empty; no placeholder stamp needed. Input_Mask (edit
  crop) + Input_HiRes_Mode + Input_Negative are likewise runtime-injected — NOT baked.
  Input_Mask's baked widget is force-CLEARED at build so a no-mask edit self-gates.)

  3. ASSERT the style rack is coherent (t2i only; detailer/upscaler have no rack, so the
     assert is a no-op there). Selecting style N drives BOTH the LoRA (via an MpiMath
     gate `b if a == N else 0.0`) and the trigger phrase (via MpiPromptList.specific_item,
     1-indexed). Two lists, one integer — if their lengths drift, style N loads its LoRA
     but appends no trigger: a SILENT half-application that reads as "the LoRA feels weak".

Orchestrated: build(source_path, out_dir) — called by orchestrate.py after the `krea2_`
prefix routes here (registry.py).
Standalone:  python generate_krea2.py

Node lookup is by `_meta.title` (MPI-116 naming law) — never by node id.
"""

import json
import re
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/

UNET_LOADER_TITLE = "Load Diffusion Model"
TIER_TITLE = "Input_Tier"

# Krea2 ships TWO runtime files per template = {content}. One universal graph serves
# t2i / i2i / edit (edit = optional Input_Mask crop, runtime-injected). Both tiers now run
# from the SAME Raw weight: the `Accelerator Lora` (turbo-distill, extracted as an SVD
# delta FROM Raw) reconstructs the old Turbo transformer at strength 1.0, so tier is a
# RUNTIME choice, not a separate file (MPI-316). Each file bakes THREE things:
#
#   1. UNETLoader weight   — the content-variant Raw diffusion weight
#   2. Input_Tier.int      — baked to 1 (High) as a SAFE DEFAULT only; see _bake_tier
#   3. Input_Bypass_Filter_Lora.strength_model — SFW 1.0 / NSFW 0.0 (content-filter bypass)
#
# Tier map (now runtime-injected by the krea2Turbo toggle, NOT baked per file):
#   Tier 1 = HIGH     — cfg 3, working negatives, accelerator LoRA gated OFF (strength 0)
#   Tier 2 = BALANCED — cfg 1, accelerator LoRA at 1.0, negative computed then discarded
#
# The weight filenames are loader-relative (diffusion_models/) names; they MUST match the
# dep `filename` tails in dependencies.js and the on-disk / R2 locations (playbook §3).
#
# `bypass`: the SFW weight ships the model's built-in content filter, so the always-on
# bypass LoRA must be ACTIVE (1.0) to match the NSFW output. The NSFW weight already
# unfilters itself, so bypass is redundant there (0.0). The LoRA is a dep of BOTH — only
# the baked strength differs. (Present on t2i only; a no-op where the node is absent.)
#
# ONE map for every krea2 template now — t2i, detailer and upscaler all fan to sfw/nsfw
# on Raw weights. The old LEGACY_VARIANTS (turbo detailer/upscaler) died with the Turbo
# transformers; their templates were deleted from raw/ and GEN_DIR.
VARIANTS = {
    "sfw":  {"weight": "krea2_raw_int8_convrot.safetensors",            "bypass": 1.0},
    "nsfw": {"weight": "lustify-v10-krea-raw-int8_convrot.safetensors", "bypass": 0.0},
}

BYPASS_LORA_TITLE = "Input_Bypass_Filter_Lora"

# MPI-272: the optional Input_Image is now a self-gating MpiLoadImageFromPath —
# a plain t2i just leaves its `string` empty; no placeholder stamp needed.

STYLE_SLOT_RE = re.compile(r"^Input_style_lora_(\d+)$")
GATE_RE = re.compile(r"b\s+if\s+a\s*==\s*(\d+)\s+else")


def _find_by_title(workflow: dict, title: str) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return node
    return None


def _bake_weight(workflow: dict, weight: str) -> None:
    """Bake the variant's diffusion weight into the UNETLoader. This is the single field
    that distinguishes the SFW and NSFW runtime files."""
    node = _find_by_title(workflow, UNET_LOADER_TITLE)
    if node is None:
        raise SystemExit(f"[FAIL] No UNETLoader titled '{UNET_LOADER_TITLE}' — graph changed?")
    before = node["inputs"].get("unet_name")
    node["inputs"]["unet_name"] = weight
    if before != weight:
        print(f"  [WEIGHT] {before!r} -> {weight!r}")


def _bake_bypass_strength(workflow: dict, strength: float) -> None:
    """Force the always-on content-filter-bypass LoRA's strength per variant (SFW 1.0,
    NSFW 0.0). Present on t2i only — a graph without the node (detailer/upscaler) just
    has no filter to bypass, so this is a no-op there. Forced, never trusted from the
    exported template (same rule as the diffusion weight)."""
    node = _find_by_title(workflow, BYPASS_LORA_TITLE)
    if node is None:
        return
    before = node["inputs"].get("strength_model")
    node["inputs"]["strength_model"] = strength
    if before != strength:
        print(f"  [BYPASS] {BYPASS_LORA_TITLE}.strength_model: {before!r} -> {strength}")


# Every runtime-INJECTED input node → its safe baked default. The app overrides each of
# these per-run (prompt/seed/image path/style/mode flags); the exported template carries
# whatever the user last TESTED with, so we scrub them at build. Without this, a leaked
# test value (a baked seed, a Downloads/ image path, Style 10, Is_Edit true) ships in the
# runtime file and corrupts a fresh gen. (title, widget_key, safe_value). Mode flags that
# are already safe-false in the graph are listed too — cheap and self-documenting.
_INJECTED_INPUT_DEFAULTS = [
    ("Input_Positive",       "string",  ""),      # MpiText stores the prompt in `string`; app injects it
    ("Input_Negative",       "string",  ""),      # MpiText negative, app injects
    ("Input_Seed",           "int",     0),       # random per-gen, NEVER baked (no-seed-UI law)
    ("Input_Image",          "string",  ""),      # path node, self-gates empty; app injects path
    ("Input_Mask",           "string",  ""),      # edit crop, self-gates empty
    ("Input_Style",          "int",     0),       # 0 = No Style; app injects selection
    ("Input_Is_Edit",        "boolean", False),   # app injects true on the edit op only
    ("Input_Is_i2i",         "boolean", False),   # app injects true on the i2i op only
    ("Input_depth_reference", "boolean", False),   # app injects true on the depth op only
    ("Input_HiRes_Mode",     "boolean", False),   # app injects true when the Hi-Res toggle is on
    ("Input_enhance_prompt", "boolean", False),   # MpiIfElse gate; app injects on toggle
]


def _sanitize_injected_inputs(workflow: dict) -> None:
    """Reset every runtime-injected input to its safe default so no leaked test value
    (baked seed, local image path, Style 10, Is_Edit true) ships in the runtime file.
    Injected weights (Tier/weight/bypass/LoRAs) are baked by their own helpers, not here."""
    for title, key, safe in _INJECTED_INPUT_DEFAULTS:
        node = _find_by_title(workflow, title)
        if node is None:
            continue
        before = node["inputs"].get(key)
        if before != safe:
            node["inputs"][key] = safe
            print(f"  [SCRUB]  {title}.{key}: {before!r} -> {safe!r}")


def _bake_tier(workflow: dict, tier: int = 1) -> None:
    """Bake Input_Tier.int as a SAFE DEFAULT of 1 (High). The app's krea2Turbo toggle is
    the real authority and injects 1 or 2 per run — but injection fails SILENTLY when a
    title stops matching, so a baked 1 degrades a broken injection to the quality tier
    instead of shipping whatever the user last exported. Forced, never trusted from the
    exported template (same rule as the diffusion weight)."""
    node = _find_by_title(workflow, TIER_TITLE)
    if node is None:
        raise SystemExit(f"[FAIL] No MpiInt titled '{TIER_TITLE}' — graph changed?")
    before = node["inputs"].get("int")
    node["inputs"]["int"] = tier
    if before != tier:
        print(f"  [TIER]   {TIER_TITLE}.int: {before!r} -> {tier}")


def _assert_style_rack(workflow: dict) -> int:
    """Style slot N must be gated by `b if a == N`, and the trigger list must have one
    line per slot. Raises SystemExit on any drift — a wrong build must never ship.
    Returns 0 for a graph with no style rack (detailer/upscaler)."""
    slots: dict[int, dict] = {}
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        m = STYLE_SLOT_RE.match(node.get("_meta", {}).get("title", ""))
        if m:
            slots[int(m.group(1))] = node
    if not slots:
        return 0  # a model with no style rack is fine; nothing to check

    n = len(slots)
    if sorted(slots) != list(range(1, n + 1)):
        raise SystemExit(f"[FAIL] style slots are not 1..{n}: found {sorted(slots)}")

    # Each slot's strength_model must come from an MpiMath whose gate index == the slot.
    for idx, node in sorted(slots.items()):
        src = node["inputs"].get("strength_model")
        if not isinstance(src, list):
            raise SystemExit(f"[FAIL] Input_style_lora_{idx}.strength_model is a widget, "
                             f"not linked to an MpiMath gate")
        gate = workflow.get(src[0], {})
        expr = gate.get("inputs", {}).get("math_expression", "")
        gm = GATE_RE.search(expr)
        if not gm:
            raise SystemExit(f"[FAIL] Input_style_lora_{idx}: gate node {src[0]} has no "
                             f"`b if a == N else` expression (got {expr!r})")
        if int(gm.group(1)) != idx:
            raise SystemExit(f"[FAIL] Input_style_lora_{idx} is gated by a == {gm.group(1)} "
                             f"— slot and gate index must match, or the wrong LoRA loads")

    # One trigger line per slot. A missing line = silent half-application (playbook §9).
    prompt_list = next((nd for nd in workflow.values()
                        if isinstance(nd, dict) and nd.get("class_type") == "MpiPromptList"), None)
    if prompt_list is None:
        raise SystemExit("[FAIL] style rack present but no MpiPromptList supplies the triggers")
    lines = [ln for ln in prompt_list["inputs"].get("options", "").split("\n") if ln.strip()]
    if len(lines) != n:
        raise SystemExit(f"[FAIL] {n} style LoRAs but {len(lines)} trigger lines — "
                         f"style {len(lines) + 1}+ would load its LoRA and append NO trigger "
                         f"(reads as 'the LoRA is weak', not as an error)")
    return n


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Emit the runtime files for this template — always 2
    (sfw/nsfw) on Raw weights. Tier is no longer a file axis; the krea2Turbo toggle
    injects it at runtime, and _bake_tier writes only a safe default."""
    # krea2_t2i_template.json -> krea2_t2i
    base = source_path.name[: -len("_template.json")]
    print(f"Template: {source_path.name}")

    out_paths: list[Path] = []
    for suffix, spec in VARIANTS.items():
        workflow = json.loads(source_path.read_text(encoding="utf-8"))
        _bake_weight(workflow, spec["weight"])
        # Tierless graphs (no Input_Tier node) skip this — _bake_tier raises if the node
        # is required-but-missing, so only call it where the node actually exists.
        if _find_by_title(workflow, TIER_TITLE) is not None:
            _bake_tier(workflow)
        _bake_bypass_strength(workflow, spec["bypass"])
        _sanitize_injected_inputs(workflow)
        n_styles = _assert_style_rack(workflow)

        out_path = out_dir / f"{base}_{suffix}.json"
        out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
        print(f"  [OK]   {out_path.name} ({len(workflow)} nodes, {n_styles} style LoRAs)")
        out_paths.append(out_path)
    return out_paths


def main() -> None:
    """Standalone: rebuild every krea2 template alongside this script."""
    templates = sorted(SCRIPTS_DIR.glob("krea2_*_template.json"))
    if not templates:
        print("[SKIP] No krea2_*_template.json found.")
        return
    for t in templates:
        build(t, WORKFLOWS_DIR)
    print("\nDone.")


if __name__ == "__main__":
    main()
