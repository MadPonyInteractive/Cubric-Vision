"""
generate_wan5b.py — Wan 2.2 5B (TI2V) handler.

The 5B is single-stage and combined-op: one template
(Wan22_5B_ti2v_template.json) holds both t2v and i2v, switched by the
MpiSimpleBoolean titled 'Input_Text_to_video' (feeds an MpiIfElse). The app cannot
inject that boolean at runtime (baked at build time, like LTX), so we stamp it into
two runtime files. No stage-2 / gguf / engine variants exist for 5B.

Orchestrated: build(source_path, out_dir) — called by orchestrate.py after the
Wan22_5B_ prefix routes here (registry.py; MUST sit before the generic Wan22_ rule).
Standalone:  python generate_wan5b.py

Node lookup is by `_meta.title` (MPI-116 naming law) — never by node id.
"""

import json
import copy
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
WORKFLOWS_DIR = SCRIPTS_DIR.parent.parent  # comfy_workflows/
TEMPLATE_NAME = "Wan22_5B_ti2v_template.json"

T2V_GATE_TITLE = "Input_Text_to_video"     # MpiSimpleBoolean
# MPI-272: frame inputs are self-gating MpiLoadImageFromPath nodes — no placeholder stamp.

# (output_name, Input_Text_to_video value)
OUTPUTS = (
    ("Wan5B_t2v.json", True),
    ("Wan5B_i2v.json", False),
)


def _find_by_title(workflow: dict, title: str) -> dict | None:
    for node in workflow.values():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return node
    return None


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. Stamp the t2v boolean → two runtime files."""
    template = json.loads(source_path.read_text(encoding="utf-8"))
    gate = _find_by_title(template, T2V_GATE_TITLE)
    if gate is None:
        print(f"  [WARN] No '{T2V_GATE_TITLE}' node in {source_path.name} — nothing to do")
        return []

    print(f"Template: {source_path.name}")
    written: list[Path] = []
    for output_name, is_t2v in OUTPUTS:
        wf = copy.deepcopy(template)
        _find_by_title(wf, T2V_GATE_TITLE)["inputs"]["boolean"] = is_t2v
        out_path = out_dir / output_name
        out_path.write_text(json.dumps(wf, indent=2), encoding="utf-8")
        print(f"  [OK]   {output_name} ({T2V_GATE_TITLE}={is_t2v})")
        written.append(out_path)
    return written


def main() -> None:
    """Standalone: rebuild from the template alongside this script."""
    template_path = SCRIPTS_DIR / TEMPLATE_NAME
    if not template_path.exists():
        print(f"[SKIP] Template not found: {TEMPLATE_NAME}")
        return
    build(template_path, WORKFLOWS_DIR)
    print("\nDone.")


if __name__ == "__main__":
    main()
