# MPI-410 — checklist

- [x] Reproduce before fixing (the brief's own instruction). Deterministic harness, not
      a cold cache: hold `app.listen` so `server-ready` lands after the 5s fallback.
- [x] Settle the two candidate causes. **Candidate 1 confirmed** (main window's
      `ready-to-show` fires on Chromium's error page); **candidate 2 disproven** (the
      splash loaded in 81 ms — it was never starved).
- [x] Fix at the root: reveal on first-paint + a real HTTP response + a finished load,
      never on `ready-to-show` alone. `did-navigate` is the only event that separates
      the error page from the app — both measured.
- [x] Backstops so the fix cannot become MPI-407's black window: reveal at the retry
      cap, and a 30s timer for a load that hangs without failing.
- [x] Verified on BOTH paths — slow boot (splash survives, reveal after the server
      answers) and normal boot (no regression). 17 desktop boots + 451 node tests pass.
- [x] Absorbed MPI-412 half 1: `indeterminate` is a JOB-level flag, not a per-tick one.
      Fixed on BOTH engine twins (local `_wireProgress` + remote `_onRemoteInstallEvent`)
      per the engine-split sweep rule, reusing `isNodeTickPending` from the already-tested
      `routes/install/computeProgress.js` instead of a third copy of the rule.
- [x] Absorbed MPI-412 half 2: `engine:extracting` and the UW byte ticks no longer fight
      over the same element — the info line belongs to whoever has honest bytes.
- [x] Consumer sweep on the changed flag: `MpiEngineInstall.setProgress` and
      `MpiModelManager` (its tile render key includes `indeterminate`) — both were
      strobing off the same broadcast, both fixed by the one source change.
- [x] Regression check + proven negative control (`tests/install-progress.test.cjs`).
- [x] Every temporary repro edit removed — `git diff` on `server.js` is empty and no
      `MPI410`/`CUBRIC_DELAY_LISTEN_MS` string survives in the tree.
- [x] Docs: `docs/DEVELOPMENT.md`, `docs/testing.md` (both said the splash dies on
      `ready-to-show`), `docs/download-manager.md` § MPI-231, two `UNRELEASED.md` bullets.
- [ ] LIVE: the strobe half has never been seen fire — it needs a real engine install.
      See `validation.md` § What is NOT proven.
