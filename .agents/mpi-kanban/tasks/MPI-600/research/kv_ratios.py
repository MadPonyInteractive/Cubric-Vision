"""MPI-600 Leg D - turn results_kv.md rows into the honest multiplier, per reference count.

    python kv_ratios.py

Reports sampler-only seconds per (arm x cell), the speedup against the SAME weight with the
node off, and how the speedup moves from 2 refs to 3 - which is the claim under test. BFL's
2.5x headline is 4 refs at 512; a bare multiplier with no ref count and no resolution attached
is meaningless, so both are printed on every line.

ponytail: parses the markdown table rather than keeping a second copy of the data.
"""

import io
import os
import re
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results_kv.md")

rows = []
for line in io.open(RESULTS, encoding="utf-8"):
    if not line.startswith("| distilled") and not line.startswith("| kv"):
        continue
    c = [x.strip() for x in line.strip().strip("|").split("|")]
    # arm | node | cell | refs | seed | res | sampler | prompt | wall | cached | vram | output
    if len(c) < 12 or not c[6].isdigit():
        print("SKIPPED (no sampler figure):", line.strip()[:90])
        continue
    rows.append({"arm": c[0], "node": c[1], "cell": c[2], "refs": int(c[3]), "seed": c[4],
                 "res": c[5], "sampler": int(c[6]), "prompt": float(c[7]), "out": c[11]})

if not rows:
    raise SystemExit("no rows in %s" % RESULTS)

res = {r["res"] for r in rows}
print("rows: %d | resolutions present: %s" % (len(rows), ", ".join(sorted(res))))
if len(res) > 1:
    print("*** MIXED RESOLUTIONS - a speedup across these rows is not comparable ***")


def med(arm, cell, key="sampler"):
    v = [r[key] for r in rows if r["arm"] == arm and r["cell"] == cell]
    return statistics.median(v) if v else None


cells = sorted({r["cell"] for r in rows}, key=lambda c: int(re.match(r"(\d+)", c).group(1)))
arms = [a for a in ("distilled", "distilled+node", "kv", "kv+node") if any(r["arm"] == a for r in rows)]

print("\n--- sampler-only seconds (median of the seeds) ---")
print("%-16s %s" % ("arm", "  ".join("%8s" % c for c in cells)))
for a in arms:
    print("%-16s %s" % (a, "  ".join("%8s" % (med(a, c) if med(a, c) is not None else "-") for c in cells)))

print("\n--- KV speedup, node ON vs the SAME weight node OFF ---")
for base, cached in (("distilled", "distilled+node"), ("kv", "kv+node")):
    for c in cells:
        b, k = med(base, c), med(cached, c)
        refs = next((r["refs"] for r in rows if r["cell"] == c), "?")
        if b and k:
            print("%-16s %-6s (%d refs, %s): %5.1fs -> %5.1fs = %.2fx"
                  % (base, c, refs, next(r["res"] for r in rows if r["cell"] == c), b, k, b / k))

print("\n--- weight-only effect, node OFF (is the separate kv file worth hosting?) ---")
for c in cells:
    d, k = med("distilled", c), med("kv", c)
    if d and k:
        print("%-6s distilled %5.1fs vs kv %5.1fs = %.2fx" % (c, d, k, d / k))

print("\n--- and with the node ON ---")
for c in cells:
    d, k = med("distilled+node", c), med("kv+node", c)
    if d and k:
        print("%-6s distilled+node %5.1fs vs kv+node %5.1fs = %.2fx" % (c, d, k, d / k))
