# MPI-551 — Validation

## What was verified, and how

**Tables (automated, `tests/video-cinematic-ratio.test.cjs`)**
- Every one of the 22 video tiers has EXACTLY one 21:9 entry. This is the check
  that matters most: `low` is a substring of `very_low`, and a naive key search
  put two entries in `very_low` and none in `low` during implementation. A
  per-table count passed while the per-tier truth was wrong.
- Every value sits on its model's grid — LTX /64, H3 and WAN-5B /32, WAN /16.
- Every 21:9 is wider than its own tier's 16:9, and lands in 2.25–2.55.
- Megapixels rise monotonically across tiers, per table.
- H3 2k/4k carry the note on EVERY ratio; tiers below 2k carry none.
- Both MpiOptionSelector render paths interpolate the note.

**Mutation-checked.** Four independent breakages were introduced one at a time and
each was confirmed to FAIL the suite, then reverted: an off-grid LTX width
(1024→1020), a duplicated entry inside a tier, a dropped note on an H3 4k entry,
and the runtime render path no longer appending the note. A test that cannot fail
proves nothing, so this was run rather than assumed.

**Live app (isolated instance, port 57114 — the user's :3000 was never touched)**
- All four models render the new entry with correct dimensions:
  h3/high `1536x640`, h3/medium `1376x576`, ltx/high `1664x704`, wan/medium `1120x480`.
- H3 4k popup shows the note on all four ratios:
  `1:1 — 2176×2176 (Experimental - High VRAM)` … `21:9 — 5120×2176 (…)`.
- The note survives a RUNTIME re-render (the `updateUI` path reached by clicking
  the trigger), not just first paint — the template/runtime-twin trap.
- Tiers below 2k render no note.
- Selecting 21:9 emits `{value:"21:9", ratio:2.4, w:1536, h:640}`, so real
  dimensions reach the generation path.

**Suite:** `npm test` — 582/582 pass (576 pre-existing + 6 new).

## Not verified

**No generation was run at 21:9 on any model.** Every check above is of the canvas
the app hands the engine, never of what comes back. The grids are honoured, so no
size will silently shrink, but image quality at these canvases is unmeasured except
for H3, where Fabio's own A/B chose 1536x640 over 1376x576.

Specifically open:
- **LTX t2v may letterbox on top of the 21:9 canvas.** Documented, pre-existing and
  seed-dependent (`docs/models/ltx/black-bars-and-nag.md`); i2v is clean. Untested
  at 21:9 — flagged in the table comment so it is not re-diagnosed as a 21:9 bug.
- **H3 2k/4k at 21:9 are almost certainly OOM-prone** on anything short of a very
  large card — that is what the note says, and MPI-549 is the fix.
- **WAN-5B is not wired to a shipped model card**, so its entries are unreachable
  in the UI today; they exist so the table stays consistent when the 5B lands.
