# MPI-422 — checklist

## Code fixes (land BEFORE 1.4.0)

- [x] **Log file.** `win-update.cjs` tees every diagnostic to `<root>/update/update.log`,
      truncated per run, including both helpers' stdout AND stderr (`runHelper` now pipes
      both instead of `'inherit'`-ing them from a NUL parent). VERIFIED live: the
      fetch-release failure text appeared in the log for the first time.
- [x] **Relaunch on success.** Targets `<root>/CubricVision.exe` — by construction the
      freshly written image — and deletes `ELECTRON_RUN_AS_NODE` from the child env.
      VERIFIED live: 0 processes before, 6 after, with a fresh boot in `app.log`.
      **This brief's premise was wrong:** `process.execPath` would also have worked.
      Measured 2026-08-03 — with the running image renamed aside mid-flight, a live
      electron-as-node process still reported `…\CubricVision.exe`, because Node captures
      execPath once at bootstrap and eviction leaves that path holding the NEW binary.
      Root path kept for being explicit, not because execPath is broken.
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
- [x] **A second update applied from the new layout.** Done 2026-08-03: the fixed updater
      was staged into the 1.3.1 install and re-applied the 1.3.1 delta from the
      `resources/app` layout (second rollback dir `2026-08-03T04-02-29-164Z`, since
      removed).
- [x] **`evictBusyFile`.** EXERCISED 2026-08-03, first time ever. No GitHub upload and no
      zip needed: `apply-update.cjs` accepts an already-extracted DIRECTORY as its bundle
      (the MPI-62 Safari path), so a directory holding a copy of `CubricVision.exe` plus a
      two-line manifest listing only that one file is a complete update bundle. Run
      through `CubricVision.exe` as node, the target is genuinely busy. Result: the Aug 1
      image moved to `CubricVision.exe.old` and the new one landed at the original path;
      exe restored afterwards and hash-matched the shipped manifest
      (`0108b24d…4bd677`).
- [x] **In-app button, end-to-end, against a genuinely newer release.** PASSED 2026-08-03.
      No fake release and no GitHub upload: `check-for-update` reads
      `require('./package.json').version`, so setting the install's `package.json` (and
      `appVersion.js`, for the header) back to `1.3.0` makes the LIVE 1.3.1 release
      genuinely newer. Everything else was real — real semver compare, real prompt, real
      user click, real fetch, real apply, real relaunch:

      ```
      04:17:11 [update] user accepted update to v1.3.1 — launching updater
      04:17:12 update.log: Downloading … / Applying … / Applied … / Relaunched Cubric Vision.
      04:17:14 [update] portable check — current=1.3.1 latest=1.3.1
      ```

      Button to running-again in ~3s, confirmed on screen by the user. Install restored
      to pristine 1.3.1 afterwards (three files hash-matched `HEAD~1`).
- [x] Incidental: the relaunched app logged
      `update-last-result IPC failed: No handler registered` — the 1.3.1 delta carries
      `main.js` but NOT `updateChecker.js`, so the test install briefly ran a fixed
      renderer against a released main. A staging artifact, not a product bug, and it
      shows the renderer degrades to a warning instead of throwing when the handler is
      absent — which is what a 1.3.1 → 1.4.0 user will hit.

## Still unverified

- The Linux/macOS updaters were changed but never RUN — no box to hand. `sh -n` only.
- The failure dialog has been proven from a planted marker and the marker from a real
  bogus-repo failure, but never both ends in one continuous run.

## The fix cannot help the next update

The updater that runs is the one already on disk. A 1.3.1 user pressing Update for 1.4.0
executes **1.3.1's** `win-update.cjs` — still silent, still no relaunch. These fixes first
take effect 1.4.0 → 1.5.0, the same structural reason the pre-1.3.0 batch could not be
repaired by shipping code. **1.4.0's release notes must tell users to reopen the app
manually after updating.** Recorded in
`docs/releases/portable-distribution-contract.md` § The updater logs and relaunches.
