# MPI-446 — seed the E2E profile past the first-run engine install

Split out of MPI-444, which shipped `.github/workflows/tests.yml`. Two desktop specs
are `test.fixme`'d on CI to keep the new gate meaningful; this card removes both
fixmes.

## What happens

`npm run test:desktop` on a windows-latest runner: **15 passed, 2 failed**.

- `tests/desktop/app-close-destroys-instance.spec.js:18` — `locator('.mpi-base-app')`
  resolved to 0 elements, 9× over 5s
- `tests/desktop/mask-persist-roundtrip.spec.js:246` — "Timed out waiting for preview mask"

Both pass locally. The uploaded `test-failed-1.png` settles it in one look: the app is
sitting on the first-run **"Welcome — Let's Set Up ComfyUI"** modal, models folder
`D:\a\Cubric-Vision\Cubric-Vision\engi…`.

## Root cause

`js/shell.js:261-290` — the boot gate fetches `/engine/version-check`, and on
`needsInstall` it shows `_engineInstall` and then **parks boot on an `await new Promise`**
that only resolves on `engine:ready` or `engine:install-skipped`. A profile with no
engine never emits either, so `initShell` never finishes and nothing that depends on a
booted shell exists.

Every CI profile is that profile: `CUBRIC_E2E_USER_DATA` points at a fresh
`testInfo.outputPath('user-data')` and the runner has no engine. Locally the repo's
`engine/` is present, `needsInstall` is false, and the gate never shows — which is
exactly why this was invisible until it ran on a runner.

**This is a fixture gap, not an app bug.** The app is correctly showing onboarding to a
machine with no engine. The 15 passing specs pass because they drive components directly
and never need boot to complete.

## Candidate fix

`skipLocalEngine` already exists for precisely this shape (MPI-390): set, it logs
"Local engine gate skipped" and boots to landing with no engine. It lives in the renderer's
runpod config (`Storage.getRunpodConfig()`), so the fixture has to get it into the profile
BEFORE `initShell` reads it — seeding localStorage in the user-data dir, or a launch-time
signal the shell honours. `main.js` already branches on `process.env.CUBRIC_E2E` in two
places, so an E2E-aware boot gate is consistent with what is there; check whether the
renderer can see that env before inventing a channel for it.

Whatever the mechanism, it belongs in `tests/desktop/launch.js` so every future spec gets
it — the two failing specs predate that helper and inline their own launch block.

## Done when

- Both `test.fixme(!!process.env.CI, …)` calls are gone and the specs pass on the runner.
- The fix lives in the shared launcher, not copy-pasted per spec.
- `npm run test:desktop` is 17/17 on a clean runner profile AND still green locally.
