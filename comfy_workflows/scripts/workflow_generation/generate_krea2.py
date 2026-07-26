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
     assert is a no-op there). The rack is ONE MpiStyleSelector titled
     `Input_Style_Selector` (selector int + one trigger line per style) chained into
     MpiStyleLoras banks of five lora slots each; style N = trigger line N = the Nth slot
     along the chain. If the line count and the slot count drift, style N loads its LoRA
     but appends no trigger (or the reverse): a SILENT half-application that reads as
     "the LoRA feels weak".

Orchestrated: build(source_path, out_dir) — called by orchestrate.py after the `krea2_`
prefix routes here (registry.py).
Standalone:  python generate_krea2.py

Node lookup is by `_meta.title` (MPI-116 naming law) — never by node id.
"""

import json
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

STYLE_SELECTOR_TITLE = "Input_Style_Selector"
STYLE_BANK_SLOTS = 5   # MpiStyleLoras exposes lora_1..lora_5


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
    ("Input_Style_Selector", "selector", 0),      # 0 = No Style; app injects selection
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
    """New rack (MPI-359): ONE MpiStyleSelector titled `Input_Style_Selector` feeding a
    chain of MpiStyleLoras banks (lora_1..lora_5 each). Style N = trigger line N = the
    Nth lora slot walking the chain, so the two lists cannot drift apart on their own —
    what CAN drift is the line count vs the slot count, and a bank that hangs off nothing.
    Raises SystemExit on any drift — a wrong build must never ship.
    Returns 0 for a graph with no style rack (detailer/upscaler)."""
    selectors = [(nid, nd) for nid, nd in workflow.items()
                 if isinstance(nd, dict) and nd.get("class_type") == "MpiStyleSelector"]
    banks = [(nid, nd) for nid, nd in workflow.items()
             if isinstance(nd, dict) and nd.get("class_type") == "MpiStyleLoras"]
    if not selectors:
        if banks:
            raise SystemExit(f"[FAIL] {len(banks)} MpiStyleLoras bank(s) but no MpiStyleSelector "
                             f"— the rack has no head, nothing selects a style")
        return 0  # a model with no style rack is fine; nothing to check
    if len(selectors) > 1:
        raise SystemExit(f"[FAIL] {len(selectors)} MpiStyleSelector nodes — the app injects ONE "
                         f"selector title; a second rack would never be driven")

    sel_id, sel = selectors[0]
    title = sel.get("_meta", {}).get("title", "")
    if title != STYLE_SELECTOR_TITLE:
        # The app addresses the two knobs as `Input_Style_Selector.selector` /
        # `.strength_model`. A wrong title is a SILENT no-op: the style picker moves and
        # nothing happens, which reads exactly like strength 0.
        raise SystemExit(f"[FAIL] MpiStyleSelector is titled {title!r}, must be "
                         f"{STYLE_SELECTOR_TITLE!r} — the title IS the injection contract")
    for widget in ("selector", "strength_model"):
        if isinstance(sel["inputs"].get(widget), list):
            raise SystemExit(f"[FAIL] {STYLE_SELECTOR_TITLE}.{widget} is linked, not a widget "
                             f"— the app injects into it, so it must be a plain value")

    # Walk the chain from the selector: each bank takes `style` from the previous node.
    chain: list[dict] = []
    by_upstream = {}
    for nid, nd in banks:
        src = nd["inputs"].get("style")
        if not isinstance(src, list):
            raise SystemExit(f"[FAIL] MpiStyleLoras {nid} has no `style` link — an orphan bank "
                             f"never sees the selector")
        by_upstream.setdefault(src[0], []).append((nid, nd))
    cur = sel_id
    while cur in by_upstream:
        nxt = by_upstream.pop(cur)
        if len(nxt) > 1:
            raise SystemExit(f"[FAIL] node {cur} feeds {len(nxt)} MpiStyleLoras banks — the rack "
                             f"is a CHAIN; a fork silently drops one branch's LoRAs")
        cur, nd = nxt[0]
        chain.append(nd)
    if len(chain) != len(banks):
        raise SystemExit(f"[FAIL] {len(banks) - len(chain)} MpiStyleLoras bank(s) hang off "
                         f"something other than the {STYLE_SELECTOR_TITLE} chain")

    # One trigger line per style, and a lora slot to land on. A style index past the last
    # slot appends its trigger and loads NOTHING — a silent half-application (playbook §9).
    lines = [ln for ln in sel["inputs"].get("triggers", "").split("\n") if ln.strip()]
    if not lines:
        raise SystemExit(f"[FAIL] {STYLE_SELECTOR_TITLE}.triggers is empty — every style would "
                         f"load its LoRA and append NO trigger")
    slots = len(chain) * STYLE_BANK_SLOTS
    if len(lines) > slots:
        raise SystemExit(f"[FAIL] {len(lines)} trigger lines but only {slots} lora slots "
                         f"({len(chain)} bank(s) x {STYLE_BANK_SLOTS}) — style {slots + 1}+ would "
                         f"append its trigger and load NO LoRA")
    if len(chain) != -(-len(lines) // STYLE_BANK_SLOTS):
        raise SystemExit(f"[FAIL] {len(lines)} trigger lines need "
                         f"{-(-len(lines) // STYLE_BANK_SLOTS)} bank(s), graph has {len(chain)} "
                         f"— a spare bank means slots the picker can never reach")
    return len(lines)


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
