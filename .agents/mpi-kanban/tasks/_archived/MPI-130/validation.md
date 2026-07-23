# MPI-130 Validation

**Verify mode:** user-ux (inline-edit DOM flow + nav-survival require a human eye).

## Result: PASSED — user-verified in running app (2026-06-25)

User confirmed: "your implementation is verified."

### What was verified
- Right-click gallery card → **Rename** → inline MpiInput swaps the name span.
- Enter / blur commits; the custom name sticks on the card.
- Escape cancels (restores prior name).
- Empty/whitespace commit clears `customName` → card falls back to the derived label (un-rename).
- Custom name shows in the History-workspace breadcrumb.
- **Chip-label survival fix:** a PromptBox chip with a custom name now KEEPS that
  name after navigating into the History workspace and back (previously reverted
  to the original filename — root cause: `_saveMedia` snapshot dropped `item.name`).

### Automated checks
- `node --check` + `npx eslint` clean on all touched files.
- Data round-trip assert (scratchpad `mpi130_check.mjs`): `customName` survives the
  `persistGroups` serialize whitelist + reconciler spread; null falls back to derived;
  a set value wins the label.

### Coordination
- Overlapped MPI-127 (audio media, Phase 4.5). Resolved by message thread
  (504b4526 ↔ 59c66a16): MPI-127's MpiGalleryGrid audio edits were frozen; no
  click-handler collision (right-click Rename vs left-click play/stop); MPI-127
  pre-prepped the customName seam on the PromptBox chip; group keys never stripped.
- Commit `3c43455` bundles MPI-130 + intermixed MPI-127 audio hunks in the shared
  files (projectModel.js, MpiGalleryBlock.js, MpiPromptBox.js) per user decision —
  the two features were entangled uncommitted in the same files.
