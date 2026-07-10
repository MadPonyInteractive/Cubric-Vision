"""
generate_krea2.py — Krea2 Turbo handler (t2i / detailer / upscaler).

Krea2 needs NO op split (one t2i graph serves t2i + i2i + pose-reference, switched
at RUNTIME by injected booleans). But it DOES ship in two content variants that ride
the SAME graphs — SFW and NSFW — differing ONLY in the diffusion weight the UNETLoader
loads (playbook: LTX-balanced two-card pattern). So every krea2 template emits TWO
runtime files: `<base>_sfw.json` (the fp8_scaled weight, already on R2) and
`<base>_nsfw.json` (the int8_convrot weight). Each becomes its own ModelDef card.

The three source templates all route here (registry `krea2_` prefix):
  krea2_turbo_t2i_template.json      -> _sfw / _nsfw
  krea2_turbo_detailer_template.json -> _sfw / _nsfw
  krea2_turbo_upscaler_template.json -> _sfw / _nsfw

Per output this handler does the two things a hand-export cannot be trusted to carry:

  1. BAKE the variant's diffusion weight into the UNETLoader (titled `Load Diffusion
     Model`). This is the ONLY difference between the two runtime files.

  2. STAMP the optional media input. `Input_Image` on the t2i graph can run with NO
     image (plain t2i injects nothing), so ComfyUI validates the BAKED filename. A raw
     export carries whatever test image was open. Reset it to the staged placeholder.
     (Harmless on the detailer/upscaler graphs, where Input_Image is required and gets
     overwritten at submit — a required input's baked value is never read.)

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

# The two content variants. filename suffix -> diffusion weight baked into UNETLoader.
# The weight filenames are the loader-relative (diffusion_models/) names; they MUST match
# the dep `filename` tails in dependencies.js and the on-disk / R2 locations (playbook §3).
VARIANTS = {
    "sfw":  "krea2_turbo_fp8_scaled.safetensors",
    "nsfw": "lustify-v10-krea-turbo-int8_convrot.safetensors",
}

# The ONLY optional media input: t2i can run with no image at all.
# i2i / pose-reference inject a real image over this before submit.
OPTIONAL_IMAGE_TITLE = "Input_Image"
PLACEHOLDER = "placeholder.png"        # staged by routes/comfy.js WORKFLOW_INPUT_DEFAULTS

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


def _stamp_placeholder(workflow: dict) -> None:
    """Reset the optional LoadImage to the staged placeholder, so a plain t2i (which
    injects nothing into it) passes ComfyUI's graph validation. Skips graphs that have no
    such node (required-input graphs overwrite theirs at submit — stamping is harmless but
    not needed; a graph with no LoadImage at all just has nothing to stamp)."""
    node = _find_by_title(workflow, OPTIONAL_IMAGE_TITLE)
    if node is None:
        return
    before = node["inputs"].get("image")
    node["inputs"]["image"] = PLACEHOLDER
    if before != PLACEHOLDER:
        print(f"  [STAMP] {OPTIONAL_IMAGE_TITLE}: {before!r} -> {PLACEHOLDER!r}")


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
    """Orchestrator entry. Emit one SFW + one NSFW runtime file for this template,
    differing only in the baked diffusion weight."""
    # krea2_turbo_t2i_template.json -> krea2_turbo_t2i
    base = source_path.name[: -len("_template.json")]
    print(f"Template: {source_path.name}")

    out_paths: list[Path] = []
    for suffix, weight in VARIANTS.items():
        workflow = json.loads(source_path.read_text(encoding="utf-8"))
        _bake_weight(workflow, weight)
        _stamp_placeholder(workflow)
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
