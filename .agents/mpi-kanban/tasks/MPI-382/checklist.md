# MPI-382 — checklist

Derived from `plan.md` § Implementation.

- [x] **The preview contract** — one discard seam in `mountOptions()`; an unapplied
      preview never outlives its tool. **User-verified in the app 2026-08-02**: no
      flicker on a preview-less switch, brush strokes survive, undo still correct.
- [ ] **The Adjust tool** — Grow/Shrink + Edge band, live preview, Apply/Reset.

Verify mode is `user-ux`: the slider has to be felt in the app before this closes.
Full gate in `plan.md` § Verification.
