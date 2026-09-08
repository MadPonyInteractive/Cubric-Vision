# MPI-629 — checklist

Shape settled by Fabio 2026-08-27, and it is narrower than the brief's suggestion:
the mute becomes an explicit **"Don't ask again"** checkbox rather than a silent
3-strike count, and the Settings control is **only present when an update is due**
— no permanent "Check for updates" row.

- [x] `updateChecker.js` — drop `DISMISS_LIMIT`; mute only on an explicit
      `Don't ask again` tick. Prompt on EVERY boot until then.
- [x] `updateChecker.js` — cache the pending update so Settings can read it
      (`getPendingUpdate()`), and export the run-update call so both surfaces
      share one path.
- [x] `MpiOkCancel` — `cancel` must carry the checkbox state (today only `ok`
      does). One line + its two doc blocks.
- [x] Popup copy points at Settings ("you can update later from Settings").
- [x] `MpiSettings` — an Update section as the FIRST section, hidden unless an
      update is due. Shows current -> latest and an Update now button.
- [x] A muted user still sees the Settings row (mute silences the popup only).
- [x] Dev/non-portable: no row (nothing is due); a failed `run-update` surfaces
      its reason rather than a silent no-op.

## Verify

- [x] Tick `Don't ask again` -> reload -> silent. Untouched -> prompts every boot.
- [x] With it muted, Settings still shows the Update section and it still updates.
- [x] `mpi_dev_force_update` drives both surfaces in a dev run.
