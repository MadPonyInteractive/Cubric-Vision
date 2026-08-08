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
- [ ] **MPI-483** — ADDED 2026-08-08. Gates because **the 1.4 notes cite it as the
      trustworthy case.** The wake-up-install bullet (`UNRELEASED.md:245`) reassures the
      reader: *"Genuine failures — a bad file, **a full disk** — still report exactly as
      before."* The full-disk report is the counterexample the whole bullet leans on, and
      it is wrong: the gate subtracts `du -sb` **apparent** bytes, inflated by aria2's
      preallocated `.part` files, so a user with any interrupted download can be told the
      disk is full when it is not — measured here as a 48.65 GB phantom, refusing an
      install with "39.4 GB free" when ~91 GB was. The message they get is the MPI-100
      toast telling them to free space, which is not the remedy. Either fix it or reword
      that bullet; shipping both as they stand is the one thing this card exists to stop.
- [ ] **MPI-482** — ADDED 2026-08-08, **prerequisite for MPI-483**. Declared dep sizes are
      hand-written estimates (95 installed deps declare 195.7 GB against 259 GB of real
      blocks; one dep declared 160 bytes; one declared two different sizes under two
      models). A corrected gate fed by wrong sizes is just precisely wrong. Independently
      user-visible: `modelJob.totalBytes` is summed from these strings on BOTH engines, so
      every install progress bar in 1.4 is denominated by a guess. The fix is a sibling
      pass in `scripts/computeDepHashes.py`, which already HEADs every dep —
      `Content-Length` is in the response it already reads.
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
- [x] **Claim audit** — DONE (read half), 2026-08-08. Full per-bullet verdict table:
      **`claim-audit.md`** in this folder. All 61 bullets graded LIVE / TEST / DECL, with
      the evidence pointer per bullet. **Scope correction:** the 2026-08-05 pass had read
      `## fixes` ONLY — `## whatIsNew` (15) and `## importantChanges` (11) had never been
      audited at all, and `## fixes` had since grown 23 → 35.
      **Four corrections applied to `UNRELEASED.md`:** the LTX Balanced size (20GB → 21.5GB
      — the declared string is GiB-derived while the files it is compared against are
      decimal GB, so the saving read ~5GB when it is ~3GB); the Wan t2v size (27GB → 29GB,
      both halves HEAD-measured at 14.55GB); the full-disk example dropped from the
      wake-up-install bullet, which settles the fourth soft spot **without** waiting on
      MPI-483 (put the phrase back if 483 lands); and the "if you have been avoiding LTX"
      sign-off moved back under the LTX-dead bullet, where `56902d53` had displaced it.
      **One soft spot CLEARED, not settled — it was never a gap:** "Resize Video works on
      a cloud GPU" IS live-verified — MPI-438's validation, Pod `vhks7b6fl1x57h`, prompt
      `81b0399f`, `status: success`.
      **One soft spot got WORSE on inspection:** the preview-decoder bullet. The note said
      "Klein verified, Wan not"; MPI-420's validation leaves **all three** live checks
      unticked and the card was bulk-closed (`5f27d3cb`) without them, so the "looks like
      your picture" claim is unobserved on every model. Moved to Gate B below.
      Remaining FLAGs (install-screen flicker, MPI-480 #3, MPI-481, H3's unrun 4K rung,
      the two first-run bullets) are named in `claim-audit.md` and are decisions for the
      fold, not defects in the prose. Only the fold into `RELEASE_NOTES['1.4.0']` is left.

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
- [ ] **One FLUX.2 Klein + one Wan 2.2 generation, watching the live preview** — ADDED
      2026-08-08 by the Gate C claim audit. The `UNRELEASED.md:377` bullet says the live
      preview "looks like your picture, not a colour blob"; nobody has ever seen it. The
      decoders themselves are proven (on R2, HEAD-verified, strict-load under the engine
      python, wired as `vae_approx/` engineAssets with two negative-controlled tests) — the
      VISUAL outcome is what is unobserved. MPI-420 carried these two checks and was
      bulk-closed without them, so they have no other home. If they cannot be run before
      the cut, reword the bullet to the install claim (the decoders now ship) and drop the
      "looks like your picture" promise.
- [ ] **Post-smoke throwaway-Pod session — closes MPI-480 #3 AND MPI-481 in one go.**
      ADDED 2026-08-08. Both need the same rig and NEITHER can run beside a live smoke
      run: MPI-481's fix is in `routes/`, which is read at server fork, so the app must
      be RESTARTED before it is even testable — and the app is what drives the smoke
      run. A second instance is not a way around it: per **MPI-485**, an instance that
      touches the remote engine reaps the other's Pod through the name-based orphan
      sweep, which is what destroyed run 3 today.
      Recipe, ~10 min on a **10 GB** throwaway volume (not `aghcuvg7nl`) and one small dep:
      1. Restart the app so the MPI-481 fix is loaded.
      2. Cold `__cpu__` Pod → POST an install the instant `/health` goes green (window
         ~0.2s, do not wait on `status.ready`). Expect a warning TOAST, not the
         Download Failed + REPORT ON GITHUB dialog → **MPI-480 #3**.
      3. Let the install run, then DELETE the Pod mid-install and press Install again.
         Expect a real `/wrapper/models/install` to fire, log tell
         `stale in-flight record for <depId> — the wrapper has no such install;
         reinstalling` → **MPI-481**.
      4. Delete the Pod and the throwaway volume. **Never** `aghcuvg7nl`.
      Hazard that has NOT changed: cancelling a download with a Pod still attached calls
      `remoteUninstallDep` and deletes partials off the volume. Delete the Pod FIRST.
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
