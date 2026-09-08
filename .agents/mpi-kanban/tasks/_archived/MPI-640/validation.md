# MPI-640 Validation

## What changed

`main.js` gains `BACKGROUND_LAUNCH` (`CUBRIC_E2E` ‖ `CUBRIC_BACKGROUND`, with
`CUBRIC_BACKGROUND=0` as the force-visible override). Under it:

- the family splash is not created at all (it is `alwaysOnTop` + centred on the primary
  monitor — the worst offender),
- the reveal parks the shell below every monitor (`backgroundSpot()`) and uses
  `showInactive()` instead of `show()`, so focus stays where the user left it,
- the saved maximize/fullscreen state is not restored, and `saveWindowState()` is a
  no-op so the off-screen position never poisons the profile.

`scripts/launch-instance.mjs` sets `CUBRIC_BACKGROUND=1` (caller env still wins).

## The rejected approach, and why — minimize does not composite

First implementation minimized the window. It failed
`tests/desktop/toast-serial-countdown.spec.js`: after the first toast left, the sample
read `['three','four']` instead of `['two','three','four']` — two toasts had vanished in
the same instant. Attributed by running that spec alone both ways: **minimized → fail,
`CUBRIC_BACKGROUND=0` → pass in 5.6s.**

Probe (`electron.launch` + CDP, minimized):

| measure | minimized | parked off-screen |
|---|---|---|
| `setTimeout` — 20 × 25ms | 520ms (fine) | 517–521ms |
| sustained rAF | **2 frames/s** | **77 frames/s** |
| `page.screenshot()` | 2.1s | **126ms** |

Timers were never throttled; **frames** were. Windows never asks a minimized window for
frames, so CSS transitions stall and complete in a batch — and `MpiToast` removes a toast
from the DOM on `transitionend`, which is exactly how two of them left together.

`backgroundThrottling: false` and the `disable-backgrounding-occluded-windows` /
`disable-renderer-backgrounding` / `disable-background-timer-throttling` switches were
each tried against the minimized window: **2 fps regardless**. Both were then removed —
re-measured at 77 fps and 128ms screenshots without them, so neither earns its line.

## Evidence

- **Screenshots work off-screen** (the user's stated concern): 1280×800 PNG of the real
  UI captured from a parked window, channel stdev `[40.5, 32.6, 35.7]`, and
  `document.visibilityState` `visible` throughout. Playwright captures the renderer
  surface over CDP, never the desktop.
- **Window is where it should be**: `{"x":40,"y":1122,...}` — below the monitor — with
  `focused: false`, and only one window (no splash).
- **`npm run test:desktop` → 38 passed (2.7m)**, 2026-08-28. Same run before the fix:
  37 passed / 1 failed (3.9m).
- **`npm test`** → 774 passed, 0 failed (17.0s), 2026-08-28.
