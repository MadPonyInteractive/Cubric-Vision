"""Same route, Klein 9B, on the winning box only. Answers Fabio's "9B is better" positively."""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from run_lp import TAGS, VARIANTS, build

O = L.O
UNET9 = "flux-2-klein-9b-int8-convrot.safetensors"
CLIP9 = "qwen_3_8b_int8_convrot.safetensors"  # 9B needs the 8B embedder (MPI-600 research/format.md)
VARIANT = sys.argv[1] if len(sys.argv) > 1 else "auto"

rows = []
for tag in TAGS:
    photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
    stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
    bb, size = L.changed_bbox(photo, stamped)
    o, d = VARIANTS[VARIANT]
    box = L.grow_box(bb, size, o, d)
    mp = "%s/box_%s_%s.png" % (L.LP, tag, VARIANT)
    L.write_mask(box, size, mp)
    prefix = "mpi567_lp9b_%s_%s" % (tag, VARIANT)
    try:
        r = L.queue(build(stamped, mp, prefix, unet=UNET9, clip=CLIP9))
    except Exception as e:
        print("%-9s FAILED %s" % (tag, str(e)[:300])); continue
    fn = r["files"][-1]
    m = L.seam(photo, O + "/" + fn)
    print("%-9s %5.1fs  fill %.3f  bg %5.2f  %s" % (tag, r["secs"], m["fill"], m["bg_mean"], fn))
    rows.append({"tag": tag, "variant": VARIANT, "box": list(box), "file": fn,
                 "auto": m, "secs": r["secs"]})
json.dump(rows, open(L.LP + "/results_9b.json", "w", encoding="utf-8"), indent=1)
print("wrote results_9b.json")
