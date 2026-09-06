# Validation — MPI-702

**Decided by:** Fabio, on the bench, 2026-09-06.
**Verdict:** REJECTED. VDN-H3 is not adopted.

## The decision

> "VDN was a good try, but it's rejected. It's slower, and it's giving the same results as
> Turbo, basically just slower and using more VRAM."

Same quality as the turbo LoRA that already ships, at more wall clock and more VRAM.
Nothing about the node is broken — it does not buy anything this app needs.

## What the card delivered

`docs/models/h3/vdn.md` — the full record, so this is not re-run from scratch in six
months. It carries the licence posture (weights are MiniMax CLA, not Apache-2.0), the
pruned/curve adaln mechanism, the S-to-stage mapping, the OOM ceiling and its real
condition, the retention knobs, and two traps that will catch the next evaluation of any
base-stage model patch on this app:

1. **Double turbo.** `ApplyVDNH3Advanced` applies its own turbo adapter by default while
   every H3 graph here already carries the turbo LoRA at strength 1.
2. **The erasing refine.** VDN touches only the base stage; the balanced tier then runs a
   turbo-only refine from sigma 0.9035 that VDN never sees. The balanced tier is
   structurally incapable of showing a base-stage difference.

## Not done, and deliberately not carded

The retention lever (`branch_weights=stream` + `retain_buffers=off` against the 1920×1088
OOM that missed by 557 MiB) dies with the card — it is a property of VDN, and nothing in
the shipped path depends on it.

## Closed, not open: the upscale+refine pays for itself

Briefly recorded here as an open cost question, on a misreading — the "extra 100 seconds"
Fabio described was **VDN's premium over turbo**, not the upscaler's cost.

Fabio then tested it directly (2026-09-06): single-stage sampling at the same output
resolution as the multi-stage path gives a very similar result and takes **longer**. So
base-at-low-res + 3D upscale + short refine is the *cheaper* route to that canvas, not
overhead. Nothing to card.
