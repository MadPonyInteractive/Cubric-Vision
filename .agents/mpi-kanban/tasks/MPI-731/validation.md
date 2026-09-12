# MPI-731 Validation

Card is open. Evidence per item, newest last.

## Item 1 — `MpiProgressBar` vertical (`eeef13dc`)

- `tests/desktop/flow-audio-player.spec.js` test 1 green in a real Electron window;
  falsified (without `direction: rtl` a bottom click reads 100). Re-run green 2026-09-12
  ~19:35Z by the resuming session.

## Item 2 — `MpiVolumeControl` (uncommitted)

- `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-audio-player.spec.js`
  → **2 passed** (18.7s), 2026-09-12 ~19:38Z.
- Test 2 mounts the compound in a real `MpiVideoControlBar`'s right cluster and measures
  computed visibility plus `elementFromPoint`, not classes: hidden before hover, open on
  hover, still open after the pointer travels up into it, top click > 80, bottom click < 20,
  mute click emits `['mute-toggle', true]`, `setMuted` / `setValue` emit nothing, closed
  after leaving.
- **Falsified:** `:has(:focus-visible)` swapped to `:focus-within` → fails on
  "leaving closes the flyout" (Expected hidden, Received visible). Restored, re-run green.
- `npx eslint` clean on `MpiVolumeControl.js` and the spec.
- `grep -rc "MpiProgressBar.mount" js/` = 24 (23 before + the new mount).
- Real-window screenshot sent to Fabio (flyout 140px, travel 112px). **His sign-off on
  height / travel / wheel is still owed** before item 5 mounts it in the video bar.
