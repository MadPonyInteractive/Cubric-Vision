# MPI-640 Checklist

- [x] `BACKGROUND_LAUNCH` flag in `main.js` — `CUBRIC_E2E` or `CUBRIC_BACKGROUND`, with `CUBRIC_BACKGROUND=0` as the force-visible escape hatch
- [x] Splash skipped under the flag (it is `alwaysOnTop` + centred on the primary monitor)
- [x] Reveal parks the window below every monitor and uses `showInactive()` instead of `show()`; maximize/fullscreen restore skipped; `saveWindowState` no-ops so the off-screen spot is never persisted
- [x] Minimize REJECTED on measurement - a minimized window composites at 2 fps and stalls CSS transitions (failed the toast spec); off-screen runs at 77 fps
- [x] `scripts/launch-instance.mjs` sets `CUBRIC_BACKGROUND=1`, caller env still wins
- [x] Probe: minimized window still renders + screenshots (the user's actual concern)
- [x] `npm run test:desktop` green - 38 passed (2.7m)
- [x] `docs/testing.md` + `docs/testing-harnesses.md` record the flag and the screenshot answer
