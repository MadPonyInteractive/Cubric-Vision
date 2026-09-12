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
- Real-window screenshot sent to Fabio (flyout 140px, travel 112px). **Signed off
  2026-09-12**: height and upward direction as built; the wheel must be on and fast.

## Item 2 addendum — the wheel (uncommitted)

- `WHEEL_STEP = 5`, always on, one capture listener on the root, so it works over the mute
  button AND the panel; the slider mounts `wheel: false`; the `wheel` prop is gone.
- Test 2 now mounts the compound bare (the bar stand-in is gone, test 3 covers the bar) and
  asserts: one tick up over the button 30→35 emitting `[input 35, change 35]`; two ticks down
  over the panel →25; clamps at 100 and a tick that cannot move emits nothing.
- **Falsified:** `WHEEL_STEP = 1` → test 2 fails at "one wheel tick UP over the mute button
  is +5" and test 3 at "two ticks up put the video at 60%". Restored byte-identical (`cmp`).

## Item 5 — `MpiVideoControlBar` adopts `MpiVolumeControl` (uncommitted)

- Bar's `muteBtn` + horizontal `volumeSlider` + `.mpi-video-control-bar__volume*` wrapper and
  its 5 CSS rules removed; `MpiVolumeControl` mounted in the slot. `mute-toggle` and the `M`
  hotkey both call `_toggleMute()`; `input`/`change` → `_doVolume`; attach + `volumechange`
  mirror back through `setValue`/`setMuted`. Arrow hotkeys untouched.
- `MpiVolumeControl.css` registered in `js/shell/preloadStyles.js` (item 8's line, pulled
  forward so the flyout does not flash open on first mount for users).
- New test 3 against a REAL `MpiVideoSurface` (no src): old pair gone, right cluster = 4
  buttons + ONE vertical slider and no leftover width, left 3 buttons, trim mounted;
  attach paints 50%; button mutes/unmutes the `<video>`; two wheel ticks → 60%; `M` mutes and
  unmutes with the button following; ArrowDown → 50, ArrowUp → 60 with the slider following.
- **Falsified:** `hk('video.mute')` → no-op fails exactly at "M mutes, and the control
  follows the element" (the button click above it still passes). Restored byte-identical.
- `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-audio-player.spec.js`
  → **3 passed** (29.3s) after both restores. `npx eslint` clean on all four touched JS files.
- **Fabio's live look, 2026-09-12: "It works great"** — screenshot of the Group History video
  workspace with the flyout open above the speaker, unclipped.

## Zero reads as muted (uncommitted)

- Test 2: `setValue(10)`, three wheel ticks down over the speaker → 0 and the speaker shows
  muted; clicking it → 10 again, not muted, log exactly `[input 10, change 10]` (no
  `mute-toggle`); `setValue(0)` shows muted, `setValue(40)` shows sound. The earlier mute-click
  now starts from `setValue(50)` so it can never land on the restore path.
- Test 3 (real `MpiVideoSurface`): from 60%, twelve wheel ticks → `{ volume 0, muted false,
  slider 0, btnActive true }`; clicking the speaker → `{ volume 60, muted false, slider 60,
  btnActive false }` — the video actually gets its sound back.
- **Falsified twice:** `_paint` without `|| _value() === 0` fails test 2 at "the speaker shows
  MUTED at zero" and test 3 at "wheeled to zero…"; the restore branch disabled fails test 2 at
  "clicking it brings back the level the gesture started from". Restored byte-identical.
- Final: `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-audio-player.spec.js`
  → **3 passed** (32.2s); `npx eslint` clean on the compound and the spec.
