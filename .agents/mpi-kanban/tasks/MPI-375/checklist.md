# MPI-375 — checklist

Derived from `plan.md` (compact plan → one stable step). The five plan items are
the detail; the step flips when all five are verified and `## Remaining Work` is
empty.

- [ ] **Implementation**
  - [x] Extract the shared dab (`stampDab` + stroke interpolation), then build
        `PaintManager` — RGBA layer at image-native size, undo wired through the
        existing `UndoStack`. **USER-VERIFIED 2026-08-03.**
  - [x] `MpiToolOptionsPaint` + the rail entry, and the `MpiMaskStrip` sweep
        across all five existing mask-tool consumers. **USER-VERIFIED 2026-08-03.**
  - [x] Split `_isMaskTool()`'s three jobs so paint keeps the PromptBox without
        becoming a mask tool. **USER-VERIFIED 2026-08-03** — plus the
        `_enterMode` half-wire the user caught, fixed at the cause with two new
        guards (`validation.md` § Round 1).
  - [x] Persist per entry (temp PNG) and Apply through a sibling server route.
        **USER-VERIFIED 2026-08-03** — plus Apply now bakes at the opacity slider,
        on the user's request. The first run failed on a STALE build, not on code
        (`main.js` needs a restart, not a reload) — `validation.md` § Round 3.
  - [ ] `docs/painting.md`, the `docs/masking-undo.md` mutation set, routing,
        UNRELEASED.md.
