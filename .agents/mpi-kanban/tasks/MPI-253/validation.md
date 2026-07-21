# MPI-253 Validation

## Root cause (confirmed via instrumented console)
Selecting the Resize tool mounts MpiToolOptionsResize, which fires its OWN
`previewOnly` resize generation on mount (thumbnail live-preview). That gen
registers in generationStore → `state.generationQueueCount` → 1 →
`_syncQueueBlockedTools` saw `cueBusy=true` and DISABLED resize + reverted it to
crop. The tool defeated itself on its own preview. Console proof:
`activate resize` → `cueBusy=true count=1` → `REVERTING resize->crop` →
`activate crop`.

The MaskManager null-ctx throw was a SECONDARY symptom (canvas destroyed on the
crop swap while the mask img was mid-decode), not the revert cause.

## Fixes
1. `js/services/commandExecutor.js` — `generationStore.register` now tags
   `previewOnly` jobs with `display: { previewKind: 'preview' }` so gates can
   tell tool-internal previews from real Cue jobs.
2. `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` —
   `_syncQueueBlockedTools` now derives `cueBusy` from the store snapshot
   filtered to non-preview running/pending jobs, instead of the raw
   `generationQueueCount`. Resize no longer reverts on its own preview.
3. `js/components/Primitives/MpiCanvas/managers/MaskManager.js` (kept) —
   `setManualFromDataURL` + `setSubtractFromDataURL` bail on null ctx
   (canvas destroyed mid-decode). Defensive; mirrors `_recomposite` guard.

## Verified (static)
- `node --check` on all three files → OK. No DBG residue.

## Needs in-app confirm (user-ux)
1. History workspace, image mode. Click Resize (Transform).
2. EXPECT: resize tool STAYS selected; options + live preview show; no crop revert.
3. Start a REAL gen (Cue), then click Resize while it runs → SHOULD still disable
   (revert to crop) — the gate must still block on genuine jobs.
4. Mask tool afterwards → prior mask restores, no console throw.
