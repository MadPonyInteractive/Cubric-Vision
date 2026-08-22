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

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
HOST = "http://127.0.0.1:8188"
PLATES = "D:/WORK/Images/Outputs/klein_9b/plates"
PLATE = PLATES + "/plate_dirt_road.png"
MASK = PLATES + "/mask_standing_left.png"
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
SCENARIOS = {
    "S1": (4, "change the woman's grey t-shirt to a bright red long-sleeve blouse", False),
    "S2": (5, "a man in a blue denim jacket and jeans standing on the dirt road", True),
    "S3": (4, "the woman is now sitting cross-legged on the dirt road", False),
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


def run_one(arm, scen, seed, dry=False, s2_regime=False):
    unet, lora, strength, steps, cfg, slug = ARMS[arm]
    wf, prompt, uses_mask = SCENARIOS[scen]
    label = "%s %s seed %d" % (arm, scen, seed)
    cmd = [PY, os.path.join(HERE, "run.py"), "--label", label,
           "--set", "27.unet_name=" + unet,
           "--set", "99.lora_name=" + lora,
           "--set", "99.strength_model=%s" % strength,
           "--set", "203.math_expression=" + steps,
           "--set", "204.math_expression=" + cfg,
           "--set", "304.int=%d" % wf,
           "--set", "33.int=%d" % seed,
           "--set", "474.string=" + PLATE,
           "--set", "93.string=" + prompt,
           "--set", "298.string=" + (MASK if uses_mask else ""),
           "--set", "111.filename_prefix=klein_9b/%s/%s_%d" % (slug, scen, seed)]
    if s2_regime:
        # The wf_type 5 branch samples through 252, whose sigmas come from 267 (steps HARDCODED
        # to 2) and whose guider 254 has cfg HARDCODED to 1 - nodes 203/204 never reach it. This
        # variant drives 267/254 directly so S2 runs in the ARM'S OWN regime. No graph edit.
        cmd += ["--set", "267.steps=" + steps, "--set", "254.cfg=" + cfg]
        cmd[cmd.index("111.filename_prefix=klein_9b/%s/%s_%d" % (slug, scen, seed))] = \
            "111.filename_prefix=klein_9b/%s/%sR_%d" % (slug, scen, seed)
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

    shown_steps, shown_cfg = (steps, cfg) if (scen != "S2" or s2_regime) else ("2*", "1.0*")
    row = "| %s | int8+convrot | %s | %d | %s | %s | %s | %ss | %s MiB (%s peak) | %s | %s |" % (
        arm, scen + ("R" if s2_regime else ""), seed, shown_steps, shown_cfg, "1024x1024",
        wall, attributable, peak, seam,
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
    ap.add_argument("--s2-regime", action="store_true",
                    help="S2 only: drive the hardcoded 267.steps / 254.cfg with the arm's own regime")
    args = ap.parse_args()

    arms = [args.arm] if args.arm else LEGS[args.leg]
    scens = [args.scenario] if args.scenario else list(SCENARIOS)
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
                run_one(arm, scen, seed, dry=args.dry, s2_regime=args.s2_regime)
    print("\n=== done, %.1f min ===" % ((time.time() - t0) / 60))


if __name__ == "__main__":
    main()
