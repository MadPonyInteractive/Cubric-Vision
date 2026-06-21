"""
generate_wan.py
WAN 2.2 handler: from ONE stage-1 API export, produce both app workflow files:
  <name>.json          — stage-1, copied verbatim
  <name>_stage2.json   — derived: bypass the stage-1 sampler + flip Is_Continue

ALL node lookup is by `_meta.title` — never by node id (ids change on re-export).

Authoring contract (you, once per workflow, in the ComfyUI graph):
  - Title the motion-preview sampler node  -> "Stage1_Bypass"
  - Title the stage-2 gate MpiBoolean      -> "Is_Continue"  (baked false)
  - Save (API), drop the file in the App folder.

The stage-2 derivation replicates ComfyUI's bypass-splice for exactly the node
class we bypass: each consumer of an output slot is rewired to the bypassed
node's INPUT of the same role. The slot->input map is per class_type and is the
only WAN-specific knowledge here. Unmapped consumed slot => hard fail (never a
silent miswire).
"""

import json
import copy
from pathlib import Path

BYPASS_TITLE = "Stage1_Bypass"
IS_CONTINUE_TITLE = "Is_Continue"

# class_type -> {output_slot_index: input_name_that_feeds_it}
# Verified empirically against the committed Wan22_*_stage2.json:
#   SamplerCustom out slot 0 (denoised LATENT) splices to its "model" feeder? NO —
#   ComfyUI maps a bypassed node's output to the input of matching TYPE. For this
#   graph only slots 0 and 1 are consumed; their observed splice targets are:
#     slot 0 -> "model"     (consumer 846/888 "false" input)
#     slot 1 -> "positive"  (consumer 768 "input" input)
#   We map ONLY the slots actually consumed. A consumed slot not in this map
#   raises (asserts the graph didn't grow a new bypass edge we don't understand).
SLOT_TO_INPUT = {
    "SamplerCustom": {0: "model", 1: "positive"},
}

# Titles that MUST survive into stage-2 (sanity gate on the derived file).
# Each entry is a set of acceptable alternatives (any one present passes).
REQUIRED_TITLES = [
    {"Output", "Output_Video"},  # final capture (native SaveVideo or legacy Output)
    {"LoadLatent"},
    {IS_CONTINUE_TITLE},
]


def _find_node_id_by_title(wf: dict, title: str) -> str | None:
    for nid, node in wf.items():
        if isinstance(node, dict) and node.get("_meta", {}).get("title") == title:
            return nid
    return None


def _iter_input_refs(node: dict):
    """Yield (input_name, [src_id, slot]) for every link-style input on a node."""
    for name, val in node.get("inputs", {}).items():
        if isinstance(val, list) and len(val) == 2 and isinstance(val[1], int):
            yield name, val


def _derive_stage2(stage1: dict) -> dict:
    wf = copy.deepcopy(stage1)

    bypass_id = _find_node_id_by_title(wf, BYPASS_TITLE)
    if bypass_id is None:
        raise SystemExit(
            f"[FAIL] No node titled {BYPASS_TITLE!r}. Title the stage-1 sampler "
            f"{BYPASS_TITLE!r} in the ComfyUI graph and re-export the API JSON."
        )
    bypass_node = wf[bypass_id]
    cls = bypass_node.get("class_type")
    slot_map = SLOT_TO_INPUT.get(cls)
    if slot_map is None:
        raise SystemExit(f"[FAIL] No SLOT_TO_INPUT entry for bypassed class {cls!r}.")

    # Resolve each output slot to the bypassed node's own input feeder (by name).
    feeder_for_slot = {}
    for slot, input_name in slot_map.items():
        feeder = bypass_node.get("inputs", {}).get(input_name)
        if not (isinstance(feeder, list) and len(feeder) == 2):
            raise SystemExit(
                f"[FAIL] Bypass node {BYPASS_TITLE!r} input {input_name!r} is not a "
                f"link (got {feeder!r}); cannot splice output slot {slot}."
            )
        feeder_for_slot[slot] = feeder

    # Rewire every consumer of the bypassed node; fail on any unmapped slot.
    rewired = 0
    for nid, node in wf.items():
        if not isinstance(node, dict):
            continue
        for name, ref in _iter_input_refs(node):
            if str(ref[0]) == bypass_id:
                slot = ref[1]
                if slot not in feeder_for_slot:
                    raise SystemExit(
                        f"[FAIL] Node {nid} consumes {BYPASS_TITLE!r} output slot {slot}, "
                        f"which has no SLOT_TO_INPUT mapping for {cls!r}. Add the mapping "
                        f"(or the workflow changed in a way the deriver doesn't model)."
                    )
                node["inputs"][name] = list(feeder_for_slot[slot])
                rewired += 1

    # Delete the bypassed node.
    del wf[bypass_id]

    # Flip the stage-2 gate.
    cont_id = _find_node_id_by_title(wf, IS_CONTINUE_TITLE)
    if cont_id is None:
        raise SystemExit(f"[FAIL] No node titled {IS_CONTINUE_TITLE!r} to flip.")
    wf[cont_id]["inputs"]["boolean"] = True

    # Sanity: required titles present, and no dangling ref to the deleted node.
    present = {n.get("_meta", {}).get("title") for n in wf.values() if isinstance(n, dict)}
    for alts in REQUIRED_TITLES:
        if not (alts & present):
            raise SystemExit(f"[FAIL] Stage-2 missing a required node titled one of {sorted(alts)}.")
    for nid, node in wf.items():
        if not isinstance(node, dict):
            continue
        for _, ref in _iter_input_refs(node):
            if str(ref[0]) == bypass_id:
                raise SystemExit(f"[FAIL] Dangling ref to deleted node {bypass_id} in {nid}.")

    print(f"  [stage2] bypassed {BYPASS_TITLE!r} ({cls}), rewired {rewired} consumer input(s), flipped {IS_CONTINUE_TITLE}")
    return wf


def build(source_path: Path, out_dir: Path) -> list[Path]:
    """Orchestrator entry. source = stage-1 API export. Writes stage-1 + stage-2."""
    name = source_path.stem.removesuffix("_template")  # Wan22_i2v_template -> Wan22_i2v
    stage1 = json.loads(source_path.read_text(encoding="utf-8"))

    stage1_out = out_dir / f"{name}.json"
    stage1_out.write_text(json.dumps(stage1, indent=2), encoding="utf-8")
    print(f"  [OK]   {stage1_out.name} (stage-1, verbatim)")

    stage2 = _derive_stage2(stage1)
    stage2_out = out_dir / f"{name}_stage2.json"
    stage2_out.write_text(json.dumps(stage2, indent=2), encoding="utf-8")
    print(f"  [OK]   {stage2_out.name} (derived)")

    return [stage1_out, stage2_out]
