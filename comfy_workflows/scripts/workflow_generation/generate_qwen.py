"""
generate_qwen.py
Qwen-Image-Edit-2511 handler: one template → ONE runtime file.

Unlike Boogu (which bakes a different UNET + a fixed Input_Tier per tier file),
Qwen-Edit uses the SAME int8 transformer for every tier — the only thing that
changes per tier is which accelerator Lightning LoRA the graph's MpiAnySwitch
picks, and that switch is driven by `Input_Tier`, which the app INJECTS AT
RUNTIME via the `qwenTier` prompt-box radio (Quality=1 raw / Turbo=2 8-step /
Hyper=3 4-step). So there is no per-tier file and no tier bake here — one card,
one workflow, tier chosen at submit time.

MPI-365: the template became a THREE-op master graph — 1 edit / 2 depth / 3 pose,
selected by `Input_wf_type` (injected by the app's opInject). Depth and pose are new and
bring `comfyui_controlnet_aux` with them (AIO_Preprocessor + OpenposePreprocessor); there
is NO ControlNet checkpoint, the maps feed Qwen's own image conditioning.

This handler strips the authoring bench (A/B comparers, per-tier PreviewImage taps,
leftover scaffolding) that ComfyUI would still validate at prompt time, bakes a safe
Input_wf_type default, and emits the single runtime graph.

Input_Image is REQUIRED (an edit needs a source) → no placeholder stamping.

Standalone:  python generate_qwen.py
Orchestrated: build(source_path, out_dir)

Node lookup is by `_meta.title` — never by node id (ids change on every re-export).
"""

import json
import copy
from pathlib import Path

# template filename → runtime output name
MODEL_VARIANTS = {
    "qwen_edit_template.json": "qwen_edit.json",
}

CAPTURE_TITLE = "Output_Image"
# MPI-365: the branch selector (1 edit / 2 depth / 3 pose). Fatal if absent — see
# _bake_wf_type.
WF_TYPE_TITLE = "Input_wf_type"
SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/


def _find_id_by_title(workflow: dict, title: str) -> str | None:
    for nid, node in workflow.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _prune_to_capture(workflow: dict) -> None:
    """Drop every node NOT upstream of Output_Image. The authoring bench carries A/B
    compare widgets (rgthree comparers, per-tier PreviewImage taps, bypassed
    pose/depth-reference scaffolding) that are dead in a shipped run but ComfyUI still
    validates their class at prompt time — keeping them would force extra node-pack deps
    for nodes the app never renders. All three tier LoRA paths remain (they feed the
    MpiAnySwitch → Output_Image)."""
    cap = _find_id_by_title(workflow, CAPTURE_TITLE)
    if cap is None:
        return
    keep: set[str] = set()

    def walk(nid: str) -> None:
        if nid in keep or nid not in workflow:
            return
        keep.add(nid)
        for v in workflow[nid]["inputs"].values():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                walk(v[0])

    walk(cap)
    dropped = [nid for nid in workflow if nid not in keep]
    for nid in dropped:
        del workflow[nid]
    if dropped:
        print(f"  [PRUNE] dropped {len(dropped)} bench node(s) not upstream of {CAPTURE_TITLE}")


def _bake_wf_type(workflow: dict, wf_type: int = 1) -> None:
    """Bake Input_wf_type.int to 1 (edit) as a SAFE DEFAULT, and FAIL LOUDLY if the node
    is missing (MPI-365).

    Qwen's three ops — 1 edit / 2 depth / 3 pose — are branches of this ONE graph, chosen
    by the app's `opInject`. Injection fails SILENTLY on a title mismatch, and a silent
    failure here does not error: it runs a DIFFERENT OPERATION and returns a plausible
    wrong image.

    Two specifics make the assert load-bearing rather than decorative:
      * the authoring graph bakes 3 (pose), so an un-baked export would make a broken
        injection run POSE for every op — the least obvious of the three to spot.
      * this runs AFTER _prune_to_capture, so it doubles as proof the selector is
        genuinely upstream of Output_Image and did not get pruned away as bench scaffolding.
    """
    nid = _find_id_by_title(workflow, WF_TYPE_TITLE)
    if nid is None:
        raise SystemExit(
            f"[FAIL] No node titled '{WF_TYPE_TITLE}' survived the prune — this template "
            f"drives EVERY op off it (1 edit / 2 depth / 3 pose). Without it the app "
            f"cannot select a branch and every op runs the graph's baked default."
        )
    before = workflow[nid]["inputs"].get("int")
    workflow[nid]["inputs"]["int"] = wf_type
    if before != wf_type:
        print(f"  [WFTYPE] {WF_TYPE_TITLE}.int: {before!r} -> {wf_type}")


def _generate_one(template_path: Path, output_name: str, out_dir: Path) -> Path | None:
    workflow = copy.deepcopy(json.loads(template_path.read_text(encoding="utf-8")))

    if _find_id_by_title(workflow, CAPTURE_TITLE) is None:
        print(f"  [WARN] No '{CAPTURE_TITLE}' node in {template_path.name} — skipping {output_name}")
        return None

    _prune_to_capture(workflow)
    _bake_wf_type(workflow)

    out_path = out_dir / output_name
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {output_name}")
    return out_path


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Build the ONE runtime file for the template."""
    output_name = MODEL_VARIANTS.get(source_path.name)
    if output_name is None:
        print(f"  [WARN] {source_path.name} not in MODEL_VARIANTS — nothing to do")
        return []
    print(f"Template: {source_path.name}")
    p = _generate_one(source_path, output_name, out_dir)
    return [p] if p is not None else []


def main() -> None:
    """Standalone: rebuild the Qwen template from files alongside this script."""
    for template_name in MODEL_VARIANTS:
        template_path = SCRIPTS_DIR / template_name
        if not template_path.exists():
            template_path = WORKFLOWS_DIR / template_name
        if not template_path.exists():
            print(f"\n[SKIP] Template not found: {template_name}")
            continue
        print()
        build(template_path, WORKFLOWS_DIR)
    print("\nDone.")


if __name__ == "__main__":
    main()
