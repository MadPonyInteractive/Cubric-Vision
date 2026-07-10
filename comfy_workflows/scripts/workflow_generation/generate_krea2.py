"""
generate_krea2.py — Krea2 Turbo (t2i) handler.

Krea2 needs NO op split: one graph serves t2i + i2i + pose-reference, switched at
RUNTIME by injected booleans (Input_Is_i2i, Input_pose_reference), not baked at build
time. So this handler emits exactly one runtime file. Its real job is the two things a
hand-export cannot be trusted to carry:

  1. STAMP the optional media input. Input_Image is the only LoadImage on a graph that
     can run with NO image (plain t2i injects nothing into it), so ComfyUI validates the
     BAKED filename. A raw export carries whatever test image was open — a local scratch
     file that exists on no other machine. Reset it to the staged placeholder.
     (Same reason as generate_ltx.py / generate_wan5b.py. This is why those never break.)

  2. ASSERT the style rack is coherent. Selecting style N drives BOTH the LoRA (via an
     MpiMath gate `b if a == N else 0.0`) and the trigger phrase (via
     MpiPromptList.specific_item, 1-indexed). Two lists, one integer — if their lengths
     drift, style N loads its LoRA but appends no trigger. That is a SILENT
     half-application which reads as "the LoRA feels weak", not as an error.
     Krea2 shipped 8 trigger lines for 9 LoRAs once. Fail the build instead.

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
TEMPLATE_NAME = "krea2_turbo_t2i_template.json"
OUTPUT_NAME = "krea2_turbo_t2i.json"

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


def _stamp_placeholder(workflow: dict) -> None:
    """Reset the optional LoadImage to the staged placeholder, so a plain t2i (which
    injects nothing into it) passes ComfyUI's graph validation. Without this the export
    carries a local scratch filename and every t2i fails at prompt time."""
    node = _find_by_title(workflow, OPTIONAL_IMAGE_TITLE)
    if node is None:
        raise SystemExit(f"[FAIL] No node titled '{OPTIONAL_IMAGE_TITLE}' — graph changed?")
    before = node["inputs"].get("image")
    node["inputs"]["image"] = PLACEHOLDER
    if before != PLACEHOLDER:
        print(f"  [STAMP] {OPTIONAL_IMAGE_TITLE}: {before!r} -> {PLACEHOLDER!r}")


def _assert_style_rack(workflow: dict) -> int:
    """Style slot N must be gated by `b if a == N`, and the trigger list must have one
    line per slot. Raises SystemExit on any drift — a wrong build must never ship."""
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
    """Orchestrator entry. Stamp the placeholder, assert the style rack, write one file."""
    workflow = json.loads(source_path.read_text(encoding="utf-8"))

    print(f"Template: {source_path.name}")
    _stamp_placeholder(workflow)
    n_styles = _assert_style_rack(workflow)

    out_path = out_dir / OUTPUT_NAME
    out_path.write_text(json.dumps(workflow, indent=2), encoding="utf-8")
    print(f"  [OK]   {OUTPUT_NAME} ({len(workflow)} nodes, {n_styles} style LoRAs)")
    return [out_path]


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
