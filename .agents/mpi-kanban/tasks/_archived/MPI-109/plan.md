# MPI-109 — Plan

1. Guard in `startGeneration` (generationService.js) → verify: required slot with no media aborts. ✓
2. Toast not dialog → verify: `ui:warning` emitted, no `ui:error`. ✓
3. Covers all dispatch paths (Q/Cue/loop) → verify: guard sits at the single chokepoint. ✓
