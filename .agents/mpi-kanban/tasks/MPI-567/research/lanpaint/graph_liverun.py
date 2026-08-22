"""MPI-567 session 9: prove the REBUILT graph executes, by running its own stage 2.

The parity check (graph_parity.py) proves the shipped twin CARRIES seamfix's f096
wiring. This proves that wiring still RUNS after the raw -> API round trip, which
is where a shifted widgets_values would finally bite.

Method: take stage 2 straight out of `comfy_workflows/flow_scribble_object.json`
(not a hand-copy), feed it the same stamped plate seamfix fed its own build(), set
Input_Box to the same auto box and Input_Seed to seamfix's SEED, and compare the
output against session 8's f096 file already on disk.

THE PASS IS PIXEL IDENTITY, NOT BYTE IDENTITY. ComfyUI embeds the dispatched
prompt in a PNG tEXt chunk, so two files holding the same picture still hash
differently whenever the graph's node ids differ -- which they do here by
construction. Measured 2026-08-22: both plates came back `mean abs 0.0, max 0,
0 px differ` against a differing sha. Gate on the pixels.

Stage 1 is deliberately NOT run: this rebuild did not touch nodes 1-35, and they
were proven on the bench in session 7.

  python graph_liverun.py            # sun + overcast, ~16s each
  python graph_liverun.py sun        # one plate
"""
import hashlib
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lp_lib as L  # noqa: E402

REPO = r"c:\AI\Mpi\Cubric-Vision"
TWIN = os.path.join(REPO, "comfy_workflows", "flow_scribble_object.json")
O = L.O
AUTO = (0.25, 0.60)
SEED = 134002004938138          # the seed seamfix measured f096 on

# Stage 2 as it stands in the shipped twin, plus the loaders it hangs off.
STAGE2 = ["100", "101", "102", "103", "104", "105", "106", "107", "108",
          "146", "160", "161", "162", "163", "164", "165", "166", "167",
          "168", "169"]


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def size_of(path):
    return L.Image.open(path).size


def mean_abs_diff(a, b):
    """Fallback when the bytes differ: a few LSBs is GPU noise, structure is a bug."""
    ia = L.Image.open(a).convert("RGB")
    ib = L.Image.open(b).convert("RGB")
    if ia.size != ib.size:
        return None, "size %s vs %s" % (ia.size, ib.size)
    d = L.ImageChops.difference(ia, ib).convert("L")
    hist = d.histogram()
    total = sum(hist)
    mean = sum(i * n for i, n in enumerate(hist)) / max(1, total)
    return round(mean, 4), "max %d, %d px differ" % (
        max(i for i, n in enumerate(hist) if n), total - hist[0])


def find_ref(tag):
    """Session 8's f096 output for this plate."""
    got = sorted(f for f in os.listdir(O)
                 if f.startswith("mpi567_sf_f096_%s" % tag) and f.endswith(".png"))
    return os.path.join(O, got[-1]) if got else None


def build_from_twin(stamped, box, prefix):
    with open(TWIN, encoding="utf-8-sig") as f:
        twin = json.load(f)

    g = {k: twin[k] for k in STAGE2}

    # Stage 1's stamped composite (node 35) is replaced by the fixture on disk.
    # MpiLoadImageFromPath is the same loader seamfix used.
    g["900"] = {"class_type": "MpiLoadImageFromPath",
                "inputs": {"string": stamped, "channel": "alpha",
                           "block_if_empty": False},
                "_meta": {"title": "stamped fixture"}}
    for nid in ("161", "163"):
        assert g[nid]["inputs"]["image"] == ["35", 0], g[nid]["inputs"]["image"]
        g[nid]["inputs"]["image"] = ["900", 0]

    # Input_Box: the same auto box (+25% out, +60% down) seamfix drew as a PNG.
    # OFF BY ONE ON PURPOSE. `write_mask` paints with PIL's rectangle, whose x1/y1
    # are INCLUSIVE and clipped at the last pixel, while MpiBoxMask slices
    # [y:y+h, x:x+w] exclusively. Matching the harness exactly is what makes a
    # byte comparison meaningful; the app supplies x/y/w/h directly and never
    # goes through this conversion.
    x0, y0, x1, y1 = box
    W, H = size_of(stamped)
    g["160"]["inputs"].update({"x": x0, "y": y0,
                               "width": min(x1, W - 1) - x0 + 1,
                               "height": min(y1, H - 1) - y0 + 1})

    # Input_Seed is stage 1's node, so pin it here rather than in the graph.
    g["26"] = {"class_type": "MpiInt", "inputs": {"int": SEED},
               "_meta": {"title": "Input_Seed"}}
    assert g["167"]["inputs"]["seed"] == ["26", 0], g["167"]["inputs"]["seed"]

    g["146"]["inputs"]["filename_prefix"] = prefix

    # Nothing in the extracted set may still point at a stage-1 node.
    live = set(g)
    for nid, node in g.items():
        for name, v in node["inputs"].items():
            if isinstance(v, list) and len(v) == 2 and v[0] not in live:
                raise SystemExit("node %s.%s dangles at %s" % (nid, name, v))
    return g


def main():
    plates = sys.argv[1:] or ["sun", "overcast"]
    rows = []
    for tag in plates:
        photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
        stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
        for p in (photo, stamped):
            if not os.path.exists(p):
                raise SystemExit("missing fixture: %s" % p)

        bb, size = L.changed_bbox(photo, stamped)
        box = L.grow_box(bb, size, *AUTO)
        prefix = "mpi567_s9_twin_%s" % tag
        g = build_from_twin(stamped, box, prefix)

        print("\n=== %s  box=%s ===" % (tag, box))
        r = L.queue(g)
        mine = [f for f in r["files"] if f.startswith(prefix)]
        if not mine:
            # A pruned branch reports success in ~0.2s with nothing sampled. Never
            # let that read as a result.
            raise SystemExit(
                "plate %r: SaveImage produced nothing in %.1fs (files=%s). The "
                "sampler branch never ran -- check every widget against "
                "/object_info for an out-of-range value." % (tag, r["secs"], r["files"]))
        out = os.path.join(O, mine[-1])
        ref = find_ref(tag)
        if not ref:
            raise SystemExit("plate %r: no f096 reference on disk to compare against" % tag)
        mean, detail = mean_abs_diff(out, ref)
        same = mean == 0
        print("  %.1fs  out=%s  sha %s" % (r["secs"], os.path.basename(out), sha(out)))
        print("  ref=%s  sha %s  (differs: the prompt is baked into a tEXt chunk)"
              % (os.path.basename(ref), sha(ref)))
        print("  pixels: mean abs %s (%s)  ->  %s"
              % (mean, detail, "IDENTICAL" if same else "DIFFERS"))
        rows.append((tag, r["secs"], same, "mean abs %s (%s)" % (mean, detail)))

    print("\n--- summary ---")
    for tag, secs, same, note in rows:
        print("  %-9s %5.1fs  %s" % (tag, secs,
                                     "OK - pixel-identical to f096" if same
                                     else "FAIL - %s" % note))
    if not all(r[2] for r in rows):
        sys.exit(1)


main()
