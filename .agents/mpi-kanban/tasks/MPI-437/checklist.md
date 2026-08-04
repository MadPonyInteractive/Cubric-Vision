# MPI-437 — checklist

- [x] **Implementation** — `compositeThroughMask()` requires an explicit
      `fillHoles: true`; the route JSDoc and `fillMaskHoles()`'s own doc comment
      record why the old default died with MPI-431; `tests/mask-composite.test.cjs`
      inverted and extended to guard BOTH directions; `docs/masking-adjust.md` and
      `UNRELEASED.md` updated.
- [x] **User check with the original repro** — PASSED 2026-08-04. — the edge-band composite that started
      this. **The Express server must be RESTARTED first**; a reload does not pick
      up `services/` or `routes/`.
