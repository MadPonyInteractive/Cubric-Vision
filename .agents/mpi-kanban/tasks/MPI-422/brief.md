# MPI-422 — Windows in-app updater: silent on failure, never reopens, and unvalidated

Spun out of MPI-387 on 2026-08-01, after the 1.2.0 → 1.3.0 in-app update was run
live for the first time and failed. Everything here is measured, not inferred.

## Background — why the path changed at all

MPI-387 fix D replaced the Windows in-app update path. `run-update` in `main.js`
used to spawn `update.bat`; Smart App Control hard-blocks `.bat` on a clean
Windows 11 install, so it was a dead end for exactly the users who most needed it.
It now spawns:

```js
spawn(process.execPath, [scriptPath, '--root', portableRoot], {
  cwd: portableRoot, detached: true, stdio: 'ignore',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
```

where `scriptPath` is `<root>/update/win-update.cjs`. No cmd, no PowerShell, no
blocked hop. `update.bat` survives as a second entry point onto the same file for
non-SAC machines.

**The replacement is immune to the bug that killed the old one** — see MPI-387's
`validation.md` § D in-app fetch+spawn for the full root cause. Short version:
`stdio: 'ignore'` gives the child a NUL stdout, so the old batch's
`powershell … > latest-update-path.txt` capture was always 0 bytes and
`update-from-zip.bat` was always called with an empty argument.
`win-update.cjs` uses `spawnSync(script, args, { stdio: ['ignore','pipe','inherit'] })`
and reads `result.stdout` in-process, which does not depend on the parent's
handle, plus it hard-fails on `!bundle || !fs.existsSync(bundle)`.

**Do not "fix" this by re-introducing a shell redirect.** That is the bug.

## 1. Silent by construction

`main.js` spawns detached with `stdio: 'ignore'`, so unlike the old path there is
**no console window at all** now. `win-update.cjs` writes its diagnostics with
`console.error` (`Checking for updates…`, `Applying update…`, `Update failed: …`)
and stdio 3 is `'inherit'` from a NUL parent — all of it goes nowhere. It writes
no log file either.

Failure mode for the user: press Update, the app quits, nothing ever comes back.
Indistinguishable from a crash, and there is nothing to send in a bug report. This
is the same class of defect MPI-369 was raised for (`a fatal boot writes no
evidence`), reappearing on the updater path.

Fix shape: have `win-update.cjs` tee its own output to `<root>/update/update.log`
(or the user-data logs folder that support instructions already name), and surface
a failure to the user rather than exiting into silence. Keep it small — this is a
~98-line script.

## 2. The prompt says the app will reopen, and it does not

`js/services/updateChecker.js` shows an `MpiOkCancel` reading *"The app will
close, update, and reopen."* Nothing relaunches:

- `win-update.cjs` `main()` ends at `console.error('Update applied successfully.')`.
- `update-from-zip.bat` — both the 1.2.0-era and the current copy — ends at
  `exit /b %ERRORLEVEL%`.

Either relaunch at the end of a successful apply, or change the copy. Relaunching
is the better product answer and is what the user already expects; note that on
Windows the updater runs *through* `CubricVision.exe`, which `apply-update.cjs`
may have renamed to `<file>.old` (`evictBusyFile`), so a relaunch must target the
freshly written image, not `process.execPath`.

## 3. Validation gated on 1.4.0

Two items inherited from MPI-387. Windows deltas resume at 1.4.0 (the 1.3.0
Windows update bundle was pulled — see below), so 1.4.0 is the first release that
can settle either:

- **A SECOND update applied from the new layout.** This is the only thing that
  exercises `loadExtractZip`'s `resources/app` branch (`apply-update.cjs`) and
  `evictBusyFile`. A *first* update passes without touching either, so the 1.2.0 →
  1.3.0 transition proved nothing about them.
- **In-app fetch+spawn on the new `win-update.cjs` path.** Never run against a
  real newer release. The 2026-08-01 test exercised the OLD path only.

The two code fixes above should land BEFORE 1.4.0, so that if the validation
fails there is something to read.

## Context: why there is no Windows 1.3.0 update bundle

The 1.2.0-era in-app updater is broken on every pre-1.3.0 Windows install that
can launch (Windows 10, or Windows 11 with SAC off), and it cannot be repaired by
shipping anything — the batch is already on their disk. Its only artifact, the
451 MB Windows update bundle, was deleted from the v1.3.0 release on 2026-08-01;
without it the old updater throws `No matching update asset found` and exits at
once instead of spending 451 MB to do nothing. macOS (3.3 MB) and Linux (2.8 MB)
bundles use `curl`-based updaters on a different code path and were kept.

Durable record: `docs/releases/portable-distribution-contract.md` § In-app update
prompt.
