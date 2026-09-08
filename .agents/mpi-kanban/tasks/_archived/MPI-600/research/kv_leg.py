"""MPI-600 Leg D - the KV multi-reference SPEED leg. Re-scoped by Fabio 2026-08-22.

    python kv_leg.py --dry          # print the commands, run nothing
    python kv_leg.py                # the whole 2x2 x 2 ref counts x 2 seeds matrix
    python kv_leg.py --arm distilled,kv-node

Shape (Fabio's, verbatim): EDIT ONLY - `wf_type` 4 with NO mask. The localised edit is
finished and is not part of this. THREE images: an empty background plate plus two different
people, placing both into the plate. A single-reference test is not worth running, because
FluxKVCache caches REFERENCE tokens and the speedup scales with reference count.

Why the matrix is 2x2 rather than "distilled vs kv": FluxKVCache is a plain MODEL->MODEL
patch with nothing weight-specific in it, and a header diff of the two weights shows an
IDENTICAL key set (425 tensors, same shapes/dtypes, no `__index_timestep_zero__` marker) -
only the values differ. So the cache node is required either way, and crossing weight x node
is what answers whether the separate 9.4 GB `kv` file earns its place in MPI-598.

    weight (distilled | kv)  x  FluxKVCache (off | on)

THE TIMING INSTRUMENT IS SAMPLER-ONLY SECONDS, not wall clock. Measured on this bench, a
1024^2 4-step t2i is 4 s of sampling inside a 16.5 s wall clock - ~73% of the wall is constant
RAM->VRAM load, which would crush any speed ratio toward 1.00x. run.py now reads the sampler's
own tqdm bar off /internal/logs/raw.

ponytail: shells run.py like sweep.py does, and writes its own results file. sweep.py owns the
three LOCKED quality scenarios and results.md ends in a VOID section, so appending there would
file these rows under VOID.
"""

import argparse
import io
import os
import re
import subprocess
import sys
import time
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
HOST = "http://127.0.0.1:8188"
PLATES = "D:/WORK/Images/Outputs/klein_9b/plates"
RESULTS = os.path.join(HERE, "results_kv.md")

PLATE = PLATES + "/plate_empty_road_00001_.png"   # EMPTY - no person in it
REF_A = PLATES + "/ref_man_00001_.png"            # reused from the S2 leg
REF_B = PLATES + "/ref_woman_00001_.png"

DISTILLED = "flux-2-klein-9b-int8-convrot.safetensors"
KV_WEIGHT = "flux-2-klein-9b-kv_int8_convrot.safetensors"

# arm -> (unet, kv_cache_node, slug)
# kv_cache_node rewires 170.model from node 100 to node 900 (FluxKVCache). Node 900 has no
# consumer otherwise, and ComfyUI never executes an unreferenced node - so one graph serves
# both the cached and uncached arms with no fork.
ARMS = {
    "distilled":      (DISTILLED, False, "kvleg-distilled"),
    "distilled+node": (DISTILLED, True,  "kvleg-distilled-node"),
    "kv":             (KV_WEIGHT, False, "kvleg-kv"),
    "kv+node":        (KV_WEIGHT, True,  "kvleg-kv-node"),
}

# cell -> (refs, img2, img3, prompt)
# refs counts the PLATE too: branch 4 chains 172 RefLatent 1 (plate) -> 178 RefLatent 2 (img2)
# -> 176 RefLatent 3 (img3). Plate + two people = 3 references.
CELLS = {
    "2ref": (2, REF_A, "",
             "place the man from the second image standing on the dirt road"),
    "3ref": (3, REF_A, REF_B,
             "place the man from the second image and the woman from the third image "
             "standing together on the dirt road"),
}

SEEDS = [101, 202]
STEPS, CFG = "4", "1.0"


def free_bench():
    req = urllib.request.Request(
        HOST + "/free",
        data=b'{"unload_models":true,"free_memory":true}',
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=60).read()
    time.sleep(2)


def run_one(arm, cell, seed, dry=False, record=True):
    unet, kv_node, slug = ARMS[arm]
    refs, img2, img3, prompt = CELLS[cell]
    label = "%s %s seed %d%s" % (arm, cell, seed, "" if record else " (WARMUP, not recorded)")
    prefix = "klein_9b/%s/%s_%d" % (slug, cell, seed) if record else \
             "klein_9b/%s/warmup" % slug
    cmd = [PY, os.path.join(HERE, "run.py"), "--label", label,
           "--set", "27.unet_name=" + unet,
           "--set", "99.lora_name=None",
           "--set", "52.boolean=true",          # cfg is 1.0 on both weights, so the negative
           "--set", "203.math_expression=" + STEPS,   # swap (trap 1) is irrelevant here
           "--set", "204.math_expression=" + CFG,
           "--set", "304.int=4",                # kleinEdit
           "--set", "33.int=%d" % seed,
           "--set", "474.string=" + PLATE,
           "--set", "298.string=",              # NO MASK - whole-image edit
           "--set", "236.string=" + img2,
           "--set", "233.string=" + img3,
           "--set", "93.string=" + prompt,
           "--set", "111.filename_prefix=" + prefix]
    if kv_node:
        cmd += ["--link", "170.model=900,0"]
    if dry:
        print(" ".join(cmd))
        return None

    free_bench()
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    print(out[-800:].encode("ascii", "replace").decode("ascii"))

    def grab(pat, default="?"):
        m = re.search(pat, out)
        return m.group(1) if m else default

    status = grab(r"status\s+: (\S+)")
    wall = grab(r"wall clock\s+: ([\d.]+)s")
    samp = grab(r"sampler only\s+: (\S+) s")
    ptot = grab(r"prompt executed: (\S+) s")
    peak = grab(r"VRAM idle/peak\s+: \d+ / (\d+) MiB")
    idle = grab(r"VRAM idle/peak\s+: (\d+) /")
    cached = grab(r"execution_cached: (\d+) nodes")
    paths = re.findall(r"output\s+: (\S.*?) EXISTS", out)
    result = paths[-1] if paths else ""

    if not record:
        print("   warmup done (%s s sampler) - not recorded" % samp)
        return None

    res = "-"
    if result and os.path.exists(result):
        with Image.open(result) as im:
            res = "%dx%d" % im.size
    attributable = (int(peak) - int(idle)) if peak.isdigit() and idle.isdigit() else "?"

    row = "| %s | %s | %s | %d | %d | %s | %s | %s | %s | %s | %s MiB (%s peak) | %s |" % (
        arm, "on" if kv_node else "off", cell, refs, seed, res,
        samp, ptot, wall, cached, attributable, peak,
        os.path.basename(result) or "**FAILED %s**" % status)
    with io.open(RESULTS, "a", encoding="utf-8", newline="\n") as f:
        f.write(row + "\n")
    print(row)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", default=None)
    ap.add_argument("--cell", default=None)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--no-warmup", action="store_true")
    args = ap.parse_args()

    for p in (PLATE, REF_A, REF_B):
        if not os.path.exists(p):
            sys.exit("missing fixed input: %s" % p)

    arms = args.arm.split(",") if args.arm else list(ARMS)
    cells = args.cell.split(",") if args.cell else list(CELLS)
    seeds = [args.seed] if args.seed else SEEDS

    total = len(arms) * len(cells) * len(seeds)
    print("=== KV leg: %d scored runs (%s) ===" % (total, ", ".join(arms)))
    n = 0
    t0 = time.time()
    for arm in arms:
        # One unrecorded warmup per arm. A weight swap makes the first run cold, and this leg
        # is a SPEED measurement - warm against warm, or the first cell of every arm carries
        # the disk load.
        if not (args.dry or args.no_warmup):
            print("\n[warmup] %s" % arm)
            run_one(arm, "3ref", 999, record=False)
        for cell in cells:
            for seed in seeds:
                n += 1
                print("\n[%d/%d  %.1f min] %s %s %d" % (n, total, (time.time() - t0) / 60, arm, cell, seed))
                run_one(arm, cell, seed, dry=args.dry)
    print("\n=== done, %.1f min ===" % ((time.time() - t0) / 60))


if __name__ == "__main__":
    main()
