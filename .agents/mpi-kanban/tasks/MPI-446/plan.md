# MPI-446 Plan — seed the E2E profile past the first-run engine gate

Compact plan. Root cause is settled in `brief.md`; this is the mechanism + proof.

## Mechanism (decided 2026-08-05)

`localStorage` seeding is a dead end — `Storage.getRunpodConfig()` reads Chromium's
LevelDB under the fresh `CUBRIC_E2E_USER_DATA` dir, which is written before any
Playwright hook can reach it, and there is no preload script to seed it from.

The window runs `nodeIntegration: true` + `contextIsolation: false`
(`main.js:361-364`), so the renderer can read `process.env.CUBRIC_E2E` directly —
the same env `main.js` already branches on twice. That extends MPI-390's existing
`skipLocalEngine` branch instead of inventing a channel.

## Steps

1. **Reproduce the runner locally.** Point `CUBRIC_ENGINE_ROOT` at an empty dir so
   `/engine/version-check` returns `needsInstall: true` (`routes/engine.js:707`) and
   boot parks exactly as it does on CI. Safe: `show('installing')` waits for a click,
   it does not auto-download.
2. **Skip the gate under E2E.** `js/shell.js:259` — extend the `skipLocalEngine`
   branch with an E2E check. The local path stays byte-identical when the env is absent.
3. **Un-fixme both specs through the shared launcher.** Convert
   `app-close-destroys-instance.spec.js` and the third test in
   `mask-persist-roundtrip.spec.js` to `launchApp`/`closeApp` from
   `tests/desktop/launch.js`, and delete both `test.fixme(!!process.env.CI, …)` calls.

## Verification

**Verify mode:** auto

- Negative control, both directions: with `CUBRIC_ENGINE_ROOT` at an empty dir the two
  specs FAIL before step 2 and PASS after. A fix that cannot be made to fail proves nothing.
- `npm run test:desktop` on a normal local profile → 17/17.
- Port 3000 must be free first, or the specs silently drive the already-running server.
