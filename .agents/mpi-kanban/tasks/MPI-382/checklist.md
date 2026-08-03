# MPI-382 — checklist

Derived from `plan.md` § Implementation.

- [x] **The preview contract** — one discard seam in `mountOptions()`; an unapplied
      preview never outlives its tool. **User-verified in the app 2026-08-02**: no
      flicker on a preview-less switch, brush strokes survive, undo still correct.
- [x] **The Adjust tool** — Grow/Shrink + Edge band, live preview, Apply/Reset.
      **User-verified in the app 2026-08-03**, plus one UX round: Edge became a mode radio
      that GATES the sliders, and the tool moved below Detect in the rail.

Both steps verified. The card is ready to close on the user's word; the graph-refills-the-mask
problem it surfaced is **MPI-431**, not unfinished work here.
