# MPI-424 - umbrella checklist

This card holds no implementation of its own. It is done when all five ship.

- [x] **MPI-425** Canvas tool taxonomy - Mask group as brush + the floating
      Detect strip. **SHIPPED 2026-08-02**, verified in the app;
      `tasks/MPI-425/plan.md`. The groups every other card mounts into now exist,
      and a group member may carry `collapse` + `sub[]`.
- [ ] **MPI-382** Adjust - grow/shrink + edge band, live preview, Apply/Reset.
      **PLANNED 2026-08-02**, `tasks/MPI-382/plan.md`. Grew a step 1: the preview
      contract (see Standing constraints in brief.md), because Adjust cannot be
      designed against a composite that still carries someone else's unapplied
      preview. Card still `todo/planned` - implementation runs through
      `mpi-continue`.
- [ ] **MPI-368** Shape gizmo - one gizmo, two mounts (mask + paint).
- [ ] **MPI-375** Paint - RGBA layer, brush-engine extraction, alpha brushes.
- [ ] **MPI-373** Composite group - Mask Comp + Paint Comp, pasted slots,
      retires the MPI-362 modal.
- [ ] Re-read the order after MPI-425 ships. It is allowed to change what the
      later cards need.

**MPI-421** (auto-mask run cost) is in this family but independent of the order -
it can land at any point.

**MPI-379** is closed `rejected`, not pending. Do not re-open it.
