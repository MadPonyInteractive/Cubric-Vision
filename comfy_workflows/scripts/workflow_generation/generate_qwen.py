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

This handler's only job is to strip the authoring bench (A/B comparers, per-tier
PreviewImage taps, bypassed pose/depth-reference scaffolding) that ComfyUI would
still validate at prompt time, and emit the single runtime graph.

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


def _generate_one(template_path: Path, output_name: str, out_dir: Path) -> Path | None:
    workflow = copy.deepcopy(json.loads(template_path.read_text(encoding="utf-8")))

    if _find_id_by_title(workflow, CAPTURE_TITLE) is None:
        print(f"  [WARN] No '{CAPTURE_TITLE}' node in {template_path.name} — skipping {output_name}")
        return None

    _prune_to_capture(workflow)

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
