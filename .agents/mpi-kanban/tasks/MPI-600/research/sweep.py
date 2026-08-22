"""MPI-600 Leg A/B/C sweep driver - run an arm x scenario x seed matrix and append rows.

    python sweep.py --leg A                  # the whole Leg A matrix
    python sweep.py --leg A --arm base       # one arm
    python sweep.py --leg A --dry            # print the commands, run nothing

Frees the bench before EVERY run, so every VRAM number on every row is real (see format.md
trap 2). That makes wall-clock include a constant RAM->VRAM load for every arm alike.

S2 rows are scored by shelling seam.py against the plate and mask.

ponytail: shells out to run.py rather than importing it - run.py stays the single place that
knows how to talk to the bench.
"""

import argparse
import io
import os
import re
import subprocess
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
HOST = "http://127.0.0.1:8188"
PLATES = "D:/WORK/Images/Outputs/klein_9b/plates"
PLATE = PLATES + "/plate_dirt_road.png"
# A BOX, not an oval (Fabio, 2026-08-22). A rectangular mask proves two things at once - that
# the model does not shift the colour, and that it can place a character properly - because a
# hard straight edge shows a seam an oval hides. It also tends to produce better localised
# edits. Same footprint as the old ellipse (x175-395, y300-905), 12.8% of frame vs 10.0%.
MASK = PLATES + "/mask_standing_box.png"
RESULTS = os.path.join(HERE, "results.md")

BASE_W = "flux-2-klein-base-9b-int8-convrot-comfy.safetensors"
TURBO = "klein_9B_Turbo_r128.safetensors"

# arm -> (unet, lora, strength, steps, cfg, prefix-slug)
ARMS = {
    "base":        (BASE_W, "None", 1.0, "20", "5.0", "base"),
    "turbo-100":   (BASE_W, TURBO,  1.0, "8",  "1.0", "base-turbo-100"),
    "turbo-070":   (BASE_W, TURBO,  0.7, "10", "1.5", "base-turbo-070"),
    "turbo-035":   (BASE_W, TURBO,  0.35, "8", "3.5", "base-turbo-035"),
    "distilled":   ("flux-2-klein-9b-int8-convrot.safetensors", "None", 1.0, "4", "1.0", "distilled"),
    "kv":          ("flux-2-klein-9b-kv_int8_convrot.safetensors", "None", 1.0, "4", "1.0", "kv"),
}

LEGS = {
    "A": ["base", "turbo-100", "turbo-070", "turbo-035"],
    "B": ["distilled"],
    "C": ["kv"],
}

# scenario -> (wf_type, prompt, uses_mask)
#
# THE MASK is what makes an edit localised - wf_type 4 with a mask is the localised edit, wf_type
# 4 without one is the whole-image edit (Fabio, 2026-08-22). Branch 4 feeds Input_Mask to 581
# InpaintCropImproved / 584 MpiMaskSquareBbox, gated by 297 MpiAnyChecker on node 298.
#
# S2 ran as wf_type 5 until 2026-08-22 and every one of those rows is void. wf_type 5 is the
# INPAINT branch: it green-fills the mask (261 ImageCompositeMasked, colour 65280) and relies on
# node 259, the flux2-klein-4b-OUTPAINT LoRA at strength 1.1, to regenerate the fill. That LoRA is
# 4B and cannot apply to a 9B base, so the bench bypassed it (README edit #8) - which left the
# branch running without the component the fill depends on. The surviving green was that missing
# LoRA, not a weight verdict. Never bench a 9B arm on branch 5.
# S2 is a REFERENCE-DRIVEN placement, not text inpainting: the man comes from image 2 (node 236
# Input_Image_2) and is placed into the masked region of image 1 (node 474, the plate). Fabio,
# 2026-08-22. Testing "inpaint a man from a prompt" was never the ask.
#
# scenario -> (wf_type, prompt, uses_mask, ref2)
SCENARIOS = {
    "S1": (4, "change the woman's grey t-shirt to a bright red long-sleeve blouse", False, ""),
    "S2": (4, "place the man from the second image standing on the dirt road beside the woman",
           True, PLATES + "/ref_man_00001_.png"),
    "S3": (4, "the woman is now sitting cross-legged on the dirt road", False, ""),
}

SEEDS = [101, 202, 303]


def free_bench():
    req = urllib.request.Request(
        HOST + "/free",
        data=b'{"unload_models":true,"free_memory":true}',
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=60).read()
    time.sleep(2)


def seam_signed(result_path):
    """Return the 0-8 / 8-16 / 16-32 signed steps from seam.py, as a display string."""
    out = subprocess.run([PY, os.path.join(HERE, "seam.py"), PLATE, result_path, MASK],
                         capture_output=True, text=True).stdout
    rings = {}
    for line in out.splitlines():
        m = re.match(r"\s*(\d+)-\s*(\d+)px .* signed ([+-][\d.]+)", line)
        if m:
            rings["%s-%s" % (m.group(1), m.group(2))] = m.group(3)
    return " / ".join(rings.get(k, "?") for k in ("0-8", "8-16", "16-32"))


def guard(path):
    """Cheap sanity read of the image itself - both Leg A pass 1 faults show up here.

    green = the pure-green fill branch 5 paints into the mask and then fails to regenerate.
    clip  = channel-clipped pixels, the tell of amplifying against a ZEROED negative (node 52).
    Neither fault raised an error or moved a timing/VRAM number in pass 1.
    """
    im = Image.open(path)
    a = np.asarray(im.convert("RGB")).astype(int)
    # GREEN DOMINANCE, not "near pure green". A first attempt tested g>200 & r<80 & b<80 and
    # scored a visibly half-green frame at 0.00% - a partly-denoised fill reads (125,192,64),
    # which fails r<80 while still being green to any eye. Dominance catches both.
    green = ((a[..., 1] - np.maximum(a[..., 0], a[..., 2])) > 60).mean() * 100
    clip = ((a == 255) | (a == 0)).mean() * 100
    return "%dx%d" % im.size, "green %.2f%% / clip %.1f%%" % (green, clip)


def run_one(arm, scen, seed, dry=False, tag=""):
    unet, lora, strength, steps, cfg, slug = ARMS[arm]
    wf, prompt, uses_mask, ref2 = SCENARIOS[scen]
    label = "%s %s seed %d" % (arm, scen, seed)
    # Node 52 (Input_is_Turbo) drives MpiIfElse 57/212/222, which swap the NEGATIVE between
    # ConditioningZeroOut (true) and the real CLIPTextEncode (false). Left true, any arm at
    # cfg > 1 amplifies against a zero negative and blows out. At cfg 1.0 it is irrelevant.
    real_neg = float(cfg) > 1.0
    prefix = "klein_9b/%s/%s_%d%s" % (slug, scen, seed, ("_" + tag) if tag else "")
    cmd = [PY, os.path.join(HERE, "run.py"), "--label", label,
           "--set", "27.unet_name=" + unet,
           "--set", "99.lora_name=" + lora,
           "--set", "99.strength_model=%s" % strength,
           "--set", "52.boolean=%s" % ("false" if real_neg else "true"),
           "--set", "203.math_expression=" + steps,
           "--set", "204.math_expression=" + cfg,
           "--set", "304.int=%d" % wf,
           "--set", "33.int=%d" % seed,
           "--set", "474.string=" + PLATE,
           "--set", "93.string=" + prompt,
           "--set", "298.string=" + (MASK if uses_mask else ""),
           "--set", "236.string=" + ref2,
           "--set", "111.filename_prefix=" + prefix]
    if dry:
        print(" ".join(cmd))
        return None

    free_bench()
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    print(out[-700:])

    def grab(pat, default="?"):
        m = re.search(pat, out)
        return m.group(1) if m else default

    status = grab(r"status\s+: (\S+)")
    wall = grab(r"wall clock\s+: ([\d.]+)s")
    peak = grab(r"VRAM idle/peak\s+: \d+ / (\d+) MiB")
    idle = grab(r"VRAM idle/peak\s+: (\d+) /")
    paths = re.findall(r"output\s+: (\S.*?) EXISTS", out)
    result = paths[-1] if paths else ""

    seam = seam_signed(result) if (scen == "S2" and result) else "-"
    attributable = (int(peak) - int(idle)) if peak.isdigit() and idle.isdigit() else "?"
    res, checks = guard(result) if result and os.path.exists(result) else ("-", "-")

    row = "| %s | %s | %s | %d | %s | %s | %s | %ss | %s MiB (%s peak) | %s | %s | %s |" % (
        arm, "real" if real_neg else "zeroed", scen, seed,
        steps, cfg, res, wall, attributable, peak, checks, seam,
        os.path.basename(result) or "**FAILED %s**" % status)
    with io.open(RESULTS, "a", encoding="utf-8", newline="\n") as f:
        f.write(row + "\n")
    print(row)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--leg", default="A", choices=sorted(LEGS))
    ap.add_argument("--arm", default=None)
    ap.add_argument("--scenario", default=None)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--tag", default="", help="suffix on the output prefix, e.g. p2 for pass 2")
    args = ap.parse_args()

    arms = args.arm.split(",") if args.arm else LEGS[args.leg]
    scens = args.scenario.split(",") if args.scenario else list(SCENARIOS)
    seeds = [args.seed] if args.seed else SEEDS

    total = len(arms) * len(scens) * len(seeds)
    print("=== sweep: %d runs (%s) ===" % (total, ", ".join(arms)))
    n = 0
    t0 = time.time()
    for arm in arms:
        for scen in scens:
            for seed in seeds:
                n += 1
                print("\n[%d/%d  %.1f min elapsed] %s %s %d" % (n, total, (time.time() - t0) / 60, arm, scen, seed))
                run_one(arm, scen, seed, dry=args.dry, tag=args.tag)
    print("\n=== done, %.1f min ===" % ((time.time() - t0) / 60))


if __name__ == "__main__":
    main()
