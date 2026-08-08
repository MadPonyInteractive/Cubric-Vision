# MPI-450 Checklist — 1.4 release readiness

Reasoning per line is in `brief.md`. A line is ticked only when it is verified, not
when it is believed.

## ON PICKUP — do these three before anything else

The card was HELD on **2026-08-05** behind Gate E. Ticks below were made under
assumptions that time may have invalidated.

- [ ] **1. Look up today's date.** `gh api rate_limit -i` → the `Date:` header is ground
      truth (the local clock is untrustworthy when the VPN is on — see `CLAUDE.md` § VPN).
- [ ] **2. Is that date, or the expected cut date, on or after 2026-08-10?**
      - **Before 08-10** → MPI-433's tick in Gate C still holds. Move on.
      - **On or after 08-10** → **the tick is void.** Reopen MPI-433: re-upload the
        13.15 GB `krea2-raw-transformer-nsfw` weight to HF at the same object path,
        verify by hash, and only then let the notes freeze. It is the 1-of-97 dep with
        a single route, and the "downloads now have a second route" fix bullet is false
        without it.
- [ ] **3. Is Gate E actually done?** MPI-449, MPI-451 and MPI-452 all closed and the
      engine bumped 0.29.2 → 0.30.x. If not, this card is still blocked — do not unblock it.
      If yes, move it `todo/blocked` → `doing/in-progress` and start with the Gate B
      re-read (it was scoped against a 0.29.2 engine).

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
- [ ] **MPI-461** — ADDED 2026-08-08 (opened after the gate list was written). One helper
      settles `PHASES.ERROR` before returning, replacing all TWELVE bare `exec.onError`
      early returns in `commandExecutor` — not just the workflow-fetch 404 that was hit
      live on 2026-08-06. Verified by a failed dispatch leaving the lane free: the next
      cue drains instead of sitting on QUEUED behind an unsettled job.
- [ ] **MPI-479** — ADDED 2026-08-08 (reported live the same day). `_snapshotControlState`
      records what actually RAN, backfilling each op-declared component through the
      op/model/global default layers when the key is absent, so Reuse Prompt can pull a
      control back DOWN to its default. Shared primitive — verified on more than the
      reported control (`refImageSize` plus at least one of `previewStage` / `denoise` /
      `useGrid`). Lower severity than MPI-461: the known-issue line is an acceptable
      outcome here, a silent skip is not.
- [ ] Any Gate A card NOT fixed is written into the 1.4 release notes as a known issue

## Gate C — must decide (before the notes are frozen)

- [ ] **MPI-433 date RE-CHECK** — the tick below assumed a cut before 2026-08-10 and the
      card was held behind H3 on 2026-08-05. Settle it with § **ON PICKUP** step 2 above
      before trusting it.
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

## Gate E — release CONTENT: MiniMax H3 (added 2026-08-05 by the user)

1.4 is the H3 release. Hard chain, no reordering. The bump waits on all three.

- [ ] **MPI-449** — close the research: weight variant chosen WITH its reason, the bench
      workflow producing video AND audio saved under the task folder, and the go/no-go on
      moving the engine off the 0.29.2 pin. Runnability is already answered — measured on
      the 4060 Ti 16 GB. **A peer agent has been working this card — coordinate before
      picking it up.**
- [ ] **MPI-451** — the licence gate. Blocks MPI-452 and cannot be waived: our H3
      authorization is conditioned on binding each user to terms at least as protective
      as the Use Restrictions and AUP. Descriptor-driven on the ModelDef (Flux is next),
      per-model acceptance that survives a restart, licensor's own authorization route
      for the territory restriction, and models without a descriptor completely
      unaffected.
- [ ] **MPI-452** — wire H3: engine bump 0.29.2 → 0.30.x with the custom-node pairing
      check run FIRST, weights from the publisher's repo (never R2), an op producing video
      AND its audio track in the app, licence text + NOTICE reachable in-app.
- [ ] Gate B re-read AFTER MPI-452 — it was scoped against a 0.29.2 engine, and the
      MPI-249 Linux leg now provisions 0.30.x.
- [ ] H3 `whatIsNew` bullet + licence attribution written into `UNRELEASED.md`

## Bump

- [ ] `/mpi-version-bump` → 1.4.0 (appVersion.js, package.json, package-lock.json, operation registry, model mappings, operation_registry.json)
- [ ] `UNRELEASED.md` folded into `RELEASE_NOTES['1.4.0']` + `docs/releases/2026-MM-DD-v1.4.0.md`, file cleared back to its header
- [ ] `npm run release:check` → passed at 1.4.0
- [ ] `release:approve --yes`, approved hash changed
- [ ] CI artifacts built (all three OS)

## Gate B — must verify (against the REAL artifacts, after the bump)

- [ ] `npm test` green
- [ ] `npm run test:desktop` green
- [ ] **MPI-458 confirmation run** — ADDED 2026-08-08. NOT a blocker and NOT a gate: the
      card closed as **not a defect** (`a5320d67`), measured three ways on Electron 41.1.1,
      so `docs/testing.md`'s "the suite runs alongside your open app" guarantee holds with
      no waiver and no release-note line. What is owed is one confirmation run — full
      `npm run test:desktop` concurrent with `npm start`, both surviving — deferred only
      because the live smoke run held the machine. No source was changed, so nothing here
      can regress 1.4; it is listed so the deferral is visible rather than forgotten.
      **Inherited decision: the `CUBRIC_E2E` lock exemption was deliberately NOT shipped.**
      It fixes nothing and would let a spec that forgot `CUBRIC_E2E_USER_DATA` boot against
      the user's real profile. Reject it if it resurfaces as "hardening".
      Parallel app instances are safe but need BOTH their own profile
      (`CUBRIC_E2E_USER_DATA` / `CUBRIC_USER_DATA_ROOT`) AND their own `CUBRIC_PORT`; a bare
      second `npm start` still dies in ~2s, exit 0, silently — that is the lock working.
- [ ] **MPI-249 Linux leg** — real `CubricVision-linux-x64-v1.4.0.tar.gz` extracted on the Linux box, LOCAL uv engine provisioned, nodes installed, one model per family generated. A Pod run does not count
- [x] **MPI-432** — WAIVED by the user 2026-08-08, card parked to `done`. The release-note
      entry is the only deliverable he wants and it is already in `UNRELEASED.md:347` under
      `## fixes`. No Mac is rented: the removal is platform-wide, the bullet claims no
      verified macOS outcome, and a broken UI-zoom shortcut is reported within minutes by
      the tester waiting on 1.4. Closed as a DECISION, not a verification.

## Cut

- [ ] Every gate above reads closed, or waived by the user with the waiver recorded on this card
- [ ] `/mpi-release` — GitHub Release published (full builds + update bundles), `1.4.0` branch cut from master
- [ ] Docs-site coverage noted on the `Cubric Studio (Docs)` board (that repo is a hard no-push — note only)
