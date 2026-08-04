# MPI-375 — checklist

Derived from `plan.md` (compact plan → one stable step). The five plan items are
the detail; the step flips when all five are verified and `## Remaining Work` is
empty.

- [x] **Implementation**
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
  - [x] `docs/painting.md`, the `docs/masking-undo.md` mutation set, routing,
        UNRELEASED.md. **2026-08-03, docs only — no code changed.** Self-verified:
        every identifier in the new doc grepped out of source, both routing entries
        added (`docs/README.md` + CLAUDE.md Context Router), suite still 342/0.
