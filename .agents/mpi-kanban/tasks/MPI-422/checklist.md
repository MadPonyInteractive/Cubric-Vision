# MPI-422 — checklist

## Code fixes (land BEFORE 1.4.0)

- [x] **Log file.** `win-update.cjs` tees every diagnostic to `<root>/update/update.log`,
      truncated per run, including both helpers' stdout AND stderr (`runHelper` now pipes
      both instead of `'inherit'`-ing them from a NUL parent). VERIFIED live: the
      fetch-release failure text appeared in the log for the first time.
- [x] **Relaunch on success.** Targets `<root>/CubricVision.exe`, NOT `process.execPath`,
      and deletes `ELECTRON_RUN_AS_NODE` from the child env. VERIFIED live: 0 processes
      before, 6 after, with a fresh boot in `app.log`.
- [x] **Relaunch on failure too, and say why.** Updater writes
      `<root>/update/update-result.json` carrying the last helper *stderr* line (the bare
      `"fetch-release.cjs exited with code 1"` is useless to a user). New `main.js`
      `update-last-result` IPC reads-and-deletes it; `updateChecker.js` raises `showError`
      and skips the update prompt that boot so two dialogs never stack.
- [x] **Same two gaps on Linux/macOS.** `update.sh` / `update.command` get the same
      marker + relaunch, and `exec >>"$LOG" 2>&1` only when stdout is NOT a tty — a
      double-clicked run keeps its terminal output and its real exit status (piping to
      `tee` would have replaced it with `tee`'s). Not runtime-tested: no box to hand.
- [x] Stale comment at `main.js` `run-update` claiming the script "applies + relaunches"
      corrected — now true.
- [x] `parseArgs` no longer throws on an unknown argument: it ran BEFORE the log was
      open, so a bad argument would have skipped both the log and the relaunch — the exact
      failure mode this card exists to kill.

## Validation

- [x] **In-app fetch+spawn on the new `win-update.cjs` path.** PASSED live 2026-08-03.
      Shipped 1.3.0 portable at `D:\cubric-install-test\CubricVision-windows-x64-v1.3.0`,
      user took the prompt and pressed Update. Fetched
      `CubricVision-windows-x64-update-v1.3.1.zip` (1166674 bytes), backed up to
      `update/rollback/2026-08-03T03-44-16-461Z/`, wrote `resources/app` at
      `APP_VERSION = '1.3.1'`. Relaunch by hand showed **V1.3.1** in the app header.
      The user's report of "nothing happened" was gaps 1+2, not a failed update.
- [x] **`loadExtractZip`'s `resources/app` branch.** Exercised by the same run (the 1.3.0
      install is the new layout).
- [ ] **`evictBusyFile`.** STILL unexercised — the 1.3.1 delta shipped no
      `CubricVision.exe`, so nothing busy was ever hit. Needs a release whose Windows
      delta replaces the binary.
- [x] **A second update applied from the new layout.** Done 2026-08-03: the fixed updater
      was staged into the 1.3.1 install and re-applied the 1.3.1 delta from the
      `resources/app` layout (second rollback dir `2026-08-03T04-02-29-164Z`, since
      removed). `evictBusyFile` still untouched — no exe in the delta.
- [ ] Relaunch + failure dialog verified from a REAL newer release. Both halves were
      proven here against the 1.3.1 install (bogus-repo failure run → log + marker +
      relaunch; real-repo success run → apply + cold relaunch; planted marker → app
      logged `previous update run failed` and raised the dialog), but never yet end-to-end
      from the in-app button against a genuinely newer version.

## The fix cannot help the next update

The updater that runs is the one already on disk. A 1.3.1 user pressing Update for 1.4.0
executes **1.3.1's** `win-update.cjs` — still silent, still no relaunch. These fixes first
take effect 1.4.0 → 1.5.0, the same structural reason the pre-1.3.0 batch could not be
repaired by shipping code. **1.4.0's release notes must tell users to reopen the app
manually after updating.** Recorded in
`docs/releases/portable-distribution-contract.md` § The updater logs and relaunches.
