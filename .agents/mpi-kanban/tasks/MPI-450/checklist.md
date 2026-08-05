# MPI-450 Checklist — 1.4 release readiness

Reasoning per line is in `brief.md`. A line is ticked only when it is verified, not
when it is believed.

## Gate D — hygiene (do first, costs minutes)

- [x] MPI-440 closed — all members done, MPI-435 last (`e6229bd3`)
- [x] MPI-4 moved out of `doing` (untouched since 2026-06-27, not in 1.4)
- [x] MPI-259 moved out of `doing` (untouched since 2026-07-22, not in 1.4)
- [x] `validate_board.py .` from the repo root → exit 0, not read through a pipe

## Gate A — must fix (code)

- [x] **MPI-420** — shipped the decoders (user's call). **The card's premise was wrong**: a
      missing decoder falls back to Latent2RGB, so previews were the colour blob, not absent.
      Real gaps were FLUX.2 Klein + Wan 2.2 on every platform, and everything on macOS/Linux.
      Four engineAssets on R2. Needs one Klein + one Wan generation to confirm the quality change.
- [x] **MPI-453** — BUILT 2026-08-05, commit `4bc39fbb`, card in `doing` as `validating`.
      Availability gate (`installedOpsForContext` + `firstInstalledOp`, the three
      `MpiGalleryBlock` fallbacks, the History op list, and a pre-dispatch gate in
      `commandExecutor`) plus the error surface (`weights_missing_local`/`_remote` off the
      shared `js/utils/comfyValidationError.js`). 451 node tests + 17 desktop tests pass.
      Needs the user's live check: Wan 2.2 with only i2v installed must land on i2v and
      never open the REPORT ON GITHUB dialog.
- [x] **MPI-404** — decision: the models root stays ENGINE-OWNED, so the hero must not claim
      a count it cannot have. BUILT 2026-08-05, card in `doing` as `validating`. The models
      slot renders `—` while `hasNoEngine()` (the existing MPI-390 predicate) is true, and the
      absorbed MPI-405 half hides the Stage-all-models plate behind the API key. **Zero server
      changes.** 451 node + 17 desktop tests pass; the extended `runpod-settings-extract` spec
      has a proven negative control. Needs the user's cloud-only first-run look (validation.md).
- [x] **MPI-410** - REPRODUCED and fixed 2026-08-05, card in `doing` as `validating`.
      Root: the main window's `ready-to-show` fires on Chromium's error page, so the
      splash was closed 1.1s BEFORE the server bound (and destroyed mid-`loadFile` on a
      slow disk - the `ERR_FAILED (-2)`). Reveal now needs paint + a real HTTP response +
      a finished load, with two backstops against MPI-407's black window. The absorbed
      MPI-412 strobe is fixed at two roots (job-level `indeterminate` on both engine
      twins; one owner for the install screen's info line). 451 node + 17 desktop tests,
      proven negative control. The strobe half has never been SEEN fire - it needs a real
      engine install (validation.md).
- [x] **MPI-374** — UI size survives a full restart; key in `js/core/storageKeys.js`; no resize flash; Browser Mode no-ops. Needs the user's own restart.
- [ ] Any Gate A card NOT fixed is written into the 1.4 release notes as a known issue

## Gate C — must decide (before the notes are frozen)

- [x] **MPI-433** — date CHECKED 2026-08-05: 1.4 ships BEFORE 2026-08-10, so nothing is
      uploaded and the card keeps its date (`maturity: blocked`). The decision that
      mattered was the note: the bullet now reads "**Most** model downloads now have a
      second route" and names what does not. **The audit found three MORE single-route
      deps than MPI-433 knew about** — the MPI-420 preview decoders, permanently
      `noMirror` by nature, not by licence timing. Recorded on MPI-433's brief and in
      `docs/download-manager.md`, whose mirror table said "1 today" and was stale.
- [x] **MPI-416** — dangling `@cubric/connector` symlink FIXED in the build: the
      `@cubric` scope is excluded from the staged app tree, and `assertNoDanglingSymlinks`
      now walks the WHOLE staged tree (the earlier check was scoped to `Electron.app`,
      which is why a verified 1.3.0 artifact shipped a dangling link). Two node tests with
      a proven negative control, plus a real local Windows stage: 6444 files, check clean,
      `node_modules/@cubric` absent.
- [x] **MPI-416** — Xcode Command Line Tools requirement shipped as a known issue in
      `UNRELEASED.md` § importantChanges (`xcode-select --install` before first setup).
      The card is `deferred`, NOT fixed — the tarball-instead-of-clone candidate is not
      established to remove the requirement (CLT also supplies clang). See its brief.
- [ ] **Claim audit** — PARTIAL. All 23 fix bullets were read and the two that were
      false were corrected: the mirror bullet (claimed the whole catalogue) and the Mac
      pinch bullet (asserted a macOS outcome nobody has run — MPI-432 exists to run it).
      **What remains is per-bullet verification against what was actually executed**, and
      it belongs with the fold into `RELEASE_NOTES['1.4.0']` at bump time. Known soft
      spots to settle there: the preview-decoder bullet (Klein verified, Wan not), the
      install-screen flicker bullet (fixed and unit-tested, never SEEN fire), and
      "Resize Video works on a cloud GPU" (no remote run recorded).

## Bump

- [ ] `/mpi-version-bump` → 1.4.0 (appVersion.js, package.json, package-lock.json, operation registry, model mappings, operation_registry.json)
- [ ] `UNRELEASED.md` folded into `RELEASE_NOTES['1.4.0']` + `docs/releases/2026-MM-DD-v1.4.0.md`, file cleared back to its header
- [ ] `npm run release:check` → passed at 1.4.0
- [ ] `release:approve --yes`, approved hash changed
- [ ] CI artifacts built (all three OS)

## Gate B — must verify (against the REAL artifacts, after the bump)

- [ ] `npm test` green
- [ ] `npm run test:desktop` green
- [ ] **MPI-249 Linux leg** — real `CubricVision-linux-x64-v1.4.0.tar.gz` extracted on the Linux box, LOCAL uv engine provisioned, nodes installed, one model per family generated. A Pod run does not count
- [ ] **MPI-432** — Windows/Linux half proven: Ctrl+wheel changes nothing anywhere, Ctrl+plus / Ctrl+minus still change UI size. Mac half either run or the note reworded to what was verified

## Cut

- [ ] Every gate above reads closed, or waived by the user with the waiver recorded on this card
- [ ] `/mpi-release` — GitHub Release published (full builds + update bundles), `1.4.0` branch cut from master
- [ ] Docs-site coverage noted on the `Cubric Studio (Docs)` board (that repo is a hard no-push — note only)
