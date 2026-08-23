"""Structural diff: the converted flow_scribble_object API graph vs the measured
route in research/lanpaint/seamfix.py build(feather=96) -- config `f096`.

A mis-ordered widgets_values is silent (the converter shifts every later value and
ComfyUI still validates), so this compares class_type and every input, node for
node, against the wiring that was actually measured.

Deviations that are DELIBERATE and stated in the plan are listed in ALLOW and are
reported rather than failed.
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = r"c:\AI\Mpi\Cubric-Vision"
LPDIR = os.path.join(REPO, ".agents", "mpi-kanban", "tasks", "MPI-567",
                     "research", "lanpaint")
sys.path.insert(0, LPDIR)
import seamfix  # noqa: E402

CONVERTED = (sys.argv[1] if len(sys.argv) > 1
             else os.path.join(REPO, "comfy_workflows", "flow_scribble_object.json"))

# seamfix node id -> flow graph node id
MAP = {
    "1": "35",    # stamped composite: loaded from disk on the bench, made in-graph here
    "2": "161",   # box mask: a PNG on the bench, MpiBoxMask(Input_Box) here
    "3": "162",
    "4": "163",
    "5": "106",
    "6": "101",
    "7": "107",
    "8": "100",
    "9": "104",
    "10": "108",
    "11": "166",
    "12": "105",
    "19": "164",  # the f096 feather
    "13": "165",
    "14": "102",
    "15": "167",
    "16": "168",
    "17": "169",
    "18": "146",
}

# Output-slot remap for the two substituted sources. `MpiLoadImageFromPath` is a
# PreviewImage subclass and puts its MASK on slot 1; `MpiBoxMask` returns the mask
# first, so every consumer of seamfix's 2:1 reads 161:0 here. Same wire.
SLOT_MAP = {("2", 1): 0, ("1", 0): 0}

# Stated deviations: (seamfix id, input name) -> why.
ALLOW = {
    ("1", "string"): "stamped image is stage 1's own output, not a baked path",
    ("1", "channel"): "ditto",
    ("1", "block_if_empty"): "ditto",
    ("2", "string"): "box mask comes from Input_Box, not a baked PNG",
    ("2", "channel"): "ditto",
    ("2", "block_if_empty"): "ditto",
    ("9", "text"): "prompt is wired from the MpiText node, compared separately",
    ("15", "seed"): "wired to Input_Seed (node 26) - what the old graph did",
    ("18", "filename_prefix"): "flow keeps its own Output_Image prefix",
    # MPI-567, 2026-08-23 (Fabio): the flow was the ONLY graph in comfy_workflows/
    # with no MpiClearVram. Node 170 now sits between the stitch and the output,
    # the same place Head Swap (115) and Outpaint (493) put theirs, so the output
    # is fed by 170 rather than 169 directly. The bench route is unchanged - this
    # is an app-side release of the transformer's VRAM before the image is handed
    # back, and seamfix has no reason to know about it.
    ("18", "images"): "output is fed through MpiClearVram 170, as every other workflow does",
    # MPI-567, 2026-08-23 (Fabio): the flow now carries a SIX-SLOT USER LoRA RACK per
    # model phase - Input_Lora_Phase2_1..6 (nodes 177-182, MpiLoraModel) chained between
    # Input_Edit_Model (102) and the sampler, exactly as klein_t2i.json does it. Every
    # slot bakes lora_name "None" and passes the model through untouched, so the bench
    # route is bit-identical until a user picks one; seamfix has no user and therefore no
    # rack. The params that fill these land with MPI-608.
    ("15", "model"): "model passes through the Input_Lora_Phase2_1..6 rack (nodes 177-182)",
}

expected = seamfix.build("STAMPED", "MASKPNG", "PREFIX", feather=96)
with open(CONVERTED, encoding="utf-8-sig") as f:
    got = json.load(f)

fails, notes = [], []

for eid, enode in expected.items():
    gid = MAP.get(eid)
    if gid is None:
        fails.append("seamfix node %s (%s) has no counterpart" % (eid, enode["class_type"]))
        continue
    if gid not in got:
        fails.append("flow node %s missing (seamfix %s = %s)" % (gid, eid, enode["class_type"]))
        continue
    gnode = got[gid]
    if (eid, "__class__") not in ALLOW and gnode["class_type"] != enode["class_type"]:
        if eid in ("1", "2"):
            notes.append("%s -> %s: class %s vs %s (source substitution)"
                         % (eid, gid, enode["class_type"], gnode["class_type"]))
        else:
            fails.append("%s -> %s: class %s != %s"
                         % (eid, gid, gnode["class_type"], enode["class_type"]))
            continue

    for name, ev in enode["inputs"].items():
        if (eid, name) in ALLOW:
            notes.append("%s.%s allowed: %s" % (gid, name, ALLOW[(eid, name)]))
            continue
        if name not in gnode["inputs"]:
            fails.append("%s (%s): input %r MISSING" % (gid, gnode["class_type"], name))
            continue
        gv = gnode["inputs"][name]
        if isinstance(ev, list):                      # a link
            want = MAP.get(ev[0])
            want_slot = SLOT_MAP.get((ev[0], ev[1]), ev[1])
            if not isinstance(gv, list):
                fails.append("%s.%s: expected a link to %s, got widget %r"
                             % (gid, name, want, gv))
            elif [gv[0], gv[1]] != [want, want_slot]:
                fails.append("%s.%s: link %s != expected %s"
                             % (gid, name, gv, [want, want_slot]))
        else:
            if gv != ev:
                fails.append("%s.%s: %r != expected %r" % (gid, name, gv, ev))

    extra = set(gnode["inputs"]) - set(enode["inputs"])
    for name in sorted(extra):
        notes.append("%s.%s = %r (not in seamfix; engine default)"
                     % (gid, name, gnode["inputs"][name]))

# The prompt the route was measured on must survive verbatim.
prompt_node = got.get("103", {}).get("inputs", {}).get("string")
if prompt_node != seamfix.BLEND_PHYSICS2:
    fails.append("node 103 blend instruction differs from seamfix BLEND_PHYSICS2")

# The tail this rebuild exists to delete must be gone.
census = {}
for n in got.values():
    census[n["class_type"]] = census.get(n["class_type"], 0) + 1
for cls, want in (("LanPaint_KSampler", 1), ("InpaintCropImproved", 1),
                  ("InpaintStitchImproved", 1), ("GrowMaskWithBlur", 1),
                  ("SetLatentNoiseMask", 1), ("MpiBoxMask", 1), ("MpiBox", 1),
                  ("ImageBlend", 0), ("ThresholdMask", 0), ("MaskComposite", 0),
                  ("CFGGuider", 0), ("SamplerCustomAdvanced", 0),
                  ("Flux2Scheduler", 0), ("RandomNoise", 0)):
    have = census.get(cls, 0)
    if have != want:
        fails.append("census: %s = %d, expected %d" % (cls, have, want))

print("nodes in converted graph:", len(got))
for n in notes:
    print("  note:", n)
if fails:
    print()
    for f_ in fails:
        print("  FAIL:", f_)
    print("\n%d FAILURES" % len(fails))
    sys.exit(1)
print("\nPARITY OK - every seamfix f096 node matches, tail is gone.")
