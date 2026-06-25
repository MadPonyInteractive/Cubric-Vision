"""
generate_ltx.py
LTX-2.3 handler: from ONE i2v+t2v API export, produce FOUR app workflow files:
  LTX_i2v.json         — stage-1, Input_Text_to_video=false, Input_Is_Continue=false
  LTX_i2v_stage2.json  — derived: Input_Is_Continue flipped true
  LTX_t2v.json         — stage-1, Input_Text_to_video=true,  Input_Is_Continue=false
  LTX_t2v_stage2.json  — derived: Input_Is_Continue flipped true

ALL node lookup is by `_meta.title` — never by node id (ids change on re-export).

Two LTX-specific differences from the WAN handler:

  1. FAN-OUT. The single source drives both modes via the `Input_Text_to_video`
     MpiSimpleBoolean gate. We stamp it per output file (i2v=false, t2v=true);
     the app injects nothing mode-related — the op->file map encodes the mode.
     FF/LF rides the i2v file's `Input_Use_End_Image` gate (not a separate file).

  2. NO bypass-splice. Unlike WAN (which deletes its stage-1 sampler and rewires
     consumers), the LTX graph bakes the stage-2 switch in: `Input_Is_Continue`
     (#71) drives MpiIfElse gates that select the loaded video/audio latents over
     the live stage-1 latents. The stage-1 sampler stays in the graph; ComfyUI
     skips it because nothing consumes its output once the switch flips. So the
     stage-2 derivation is just: flip `Input_Is_Continue` -> true. No deletion,
     no slot-map, no rewiring.

Authoring contract (you, once per workflow, in the ComfyUI graph):
  - Title the i2v/t2v mode gate MpiSimpleBoolean -> "Input_Text_to_video"
  - Title the stage-2 gate MpiBoolean            -> "Input_Is_Continue" (baked false)
  - Save (API), drop LTX_*_template.json in this folder.
"""

import json
import copy
from pathlib import Path

T2V_GATE_TITLE = "Input_Text_to_video"   # MpiSimpleBoolean: false=i2v, true=t2v
IS_CONTINUE_TITLE = "Input_Is_Continue"  # MpiBoolean: false=stage-1, true=stage-2

# Titles that MUST survive into every output (sanity gate). Each entry is a set
# of acceptable alternatives (any one present passes).
REQUIRED_TITLES = [
    {"Output_Video"},          # final capture (SaveVideo)
    {"Output_Preview"},        # tier-2 preview capture (SaveVideo)
    {"Input_Video_Latent"},    # stage-2 loaded video latent
    {"Input_Audio_Latent"},    # stage-2 loaded audio latent (LTX saves TWO latents)
    {IS_CONTINUE_TITLE},
    {T2V_GATE_TITLE},
]


def _find_node_id_by_title(wf: dict, title: str) -> str | None:
    for nid, node in wf.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _set_boolean(wf: dict, title: str, value: bool) -> None:
    nid = _find_node_id_by_title(wf, title)
    if nid is None:
        raise SystemExit(
            f"[FAIL] No node titled {title!r}. Title the gate {title!r} in the "
            f"ComfyUI graph and re-export the API JSON."
        )
    inputs = wf[nid].setdefault("inputs", {})
    if "boolean" not in inputs:
        raise SystemExit(
            f"[FAIL] Node titled {title!r} has no 'boolean' input (got "
            f"{sorted(inputs)}); cannot stamp it."
        )
    inputs["boolean"] = value


def _check_required(wf: dict, label: str) -> None:
    present = {n.get("_meta", {}).get("title") for n in wf.values() if isinstance(n, dict)}
    for alts in REQUIRED_TITLES:
        if not (alts & present):
            raise SystemExit(f"[FAIL] {label} missing a required node titled one of {sorted(alts)}.")


def _variant(template: dict, t2v: bool) -> dict:
    """Stage-1 file for one mode: stamp the mode gate, ensure Is_Continue=false."""
    wf = copy.deepcopy(template)
    _set_boolean(wf, T2V_GATE_TITLE, t2v)
    _set_boolean(wf, IS_CONTINUE_TITLE, False)
    return wf


def _derive_stage2(stage1: dict) -> dict:
    """Stage-2 = stage-1 with Input_Is_Continue flipped true. Nothing else."""
    wf = copy.deepcopy(stage1)
    _set_boolean(wf, IS_CONTINUE_TITLE, True)
    return wf


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. source = i2v+t2v API export. Writes 4 files."""
    template = json.loads(source_path.read_text(encoding="utf-8"))
    _check_required(template, "Source template")

    written: list[Path] = []
    for name, t2v in (("LTX_i2v", False), ("LTX_t2v", True)):
        stage1 = _variant(template, t2v)
        s1_out = out_dir / f"{name}.json"
        s1_out.write_text(json.dumps(stage1, indent=2), encoding="utf-8")
        print(f"  [OK]   {s1_out.name} (stage-1, {T2V_GATE_TITLE}={t2v})")
        written.append(s1_out)

        stage2 = _derive_stage2(stage1)
        _check_required(stage2, f"{name}_stage2")
        s2_out = out_dir / f"{name}_stage2.json"
        s2_out.write_text(json.dumps(stage2, indent=2), encoding="utf-8")
        print(f"  [OK]   {s2_out.name} (derived, {IS_CONTINUE_TITLE}=true)")
        written.append(s2_out)

    return written
