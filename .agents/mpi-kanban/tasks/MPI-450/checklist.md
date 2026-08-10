# MPI-450 Checklist — 1.4 release readiness

Reasoning per line is in `brief.md`. A line is ticked only when it is verified, not
when it is believed.

## ⚠ SCOPE CHANGE 2026-08-10 — 1.4 now carries a ComfyUI bump to 0.31.0

**Fabio's call, taken after the notes were already folded.** He installed 0.31.0 on the
bench and H3 with the turbo LoRA came back at ~40s against ~70s on 0.30.0. His reasoning,
which is the reason this is not deferred: two ComfyUI releases landed while 1.4 was being
fixed, and shipping visibly slower than every other app keeps us behind. **The W4A8 low
tier is NOT in 1.4** — it is a new model tier (add-model playbook, R2 upload, licence
gate) and Fabio is starting it in a parallel session for 1.5.

**Everything below the bump section was already done and still stands.** The bump does not
invalidate the code, the tests, or the notes copy — only the smoke evidence and the Pod
image, both of which are engine-scoped. Do not redo the audit; do add the new claims to it.

### What 0.31.0 actually brings (researched 2026-08-10, gate 0 — do not re-derive)

32 commits, 47 files, `v0.30.0...v0.31.0`. It is an unusually H3-heavy release:

- `Support asym w4a8_int` (kijai #15308) — the quant the 1.5 low tier needs. **This is why
  0.31 is a prerequisite for that card, not merely nice to have.**
- `Support int8_convrot VAE for MiniMax-H3` (kijai #15334)
- `Fix sampler issues for audio with minimax, support more samplers` (kijai #15243)
- `Fix full offload on minimax audio vae` (#15377), `Fix MiniMax H3 audio corruption with
  EasyCache` (kijai #15390), `Fix MiniMax H3 noise mask sampling` (#15322),
  `cast raw parameters to input device in H3 VAEs` (#15268)
- `Speedup LTX and Wan` (kijai #15138) — **not only H3.** Worth a release-notes line.

**NOT in 0.31.0:** kijai's H3 VAE peak-memory PR (#15446) merged 2026-08-09, the day AFTER
0.31.0 shipped. Do not write a note claiming the decode-memory win — it lands in the NEXT
engine, and it is the reason a 1.5 bump may be worth it too. See the non-gating section.

### Two traps found in the research — both cost real time if missed

1. **`node_lock.json` pins the FRONTEND as well as core — three pins move, not one.**
   `comfyui-frontend-package` 1.47.11 → **1.48.7** and `comfyui-workflow-templates`
   0.11.27 → **0.11.34**, both read from v0.31.0's own `requirements.txt`. The playbook's
   "bump the pin in BOTH files" means node_lock + system_dependencies and does NOT mention
   these; they sit inside node_lock and are easy to leave behind.
2. **`res_multistep` changed how it consumes RNG (#15339) and FOUR shipped graphs use it**
   — `chroma_t2i`, `chroma_hyper_t2i`, `minimax_h3_fl2va`, `minimax_h3_r2va`. The noise gate
   moved from `if sigmas[i + 1] > 0` to `if sigma_up > 0`. Where `sigma_up == 0` the old
   code still CALLED `noise_sampler` and multiplied by zero — invisible, but the RNG
   advanced. The new code skips the call, so the seed→image mapping can shift.
   **UNVERIFIED — prove it empirically at the local gate** (same seed, same graph, 0.30 vs
   0.31) before writing or omitting a release note. If it does shift, users with saved seeds
   get different pictures and that IS an importantChanges line.

### The bump, in playbook gate order (`docs/playbooks/bump-engine/README.md`)

- [x] **Gate 0 — research the breaking surfaces.** Done, above.
- [x] **Gate 1 — target reachable.** `v0.31.0` has 4 Comfy-Org portable assets, published
      2026-08-08, and is the NEWEST release, so it is the ceiling. (The `v0.30.1`/`v0.30.2`
      no-asset trap does not bite here.)
- [x] **Gate 2 — no version desync to repair.** Both files agreed at 0.30.0 before the bump:
      `node_lock.json` `v0.30.0` / commit `b1693ecb`, `system_dependencies.json` `0.30.0`.
- [ ] **Gate 3 — bump the pins.** `node_lock.json` core `tag` + `commit`, PLUS the two
      frontend pins above, PLUS `system_dependencies.json`. Grep all and confirm they agree.
- [ ] **Gate 4 — re-check every pinned custom node against the new core.** MPI-465's break
      was a node calling a changed core API while its own pin was innocent. Note #15277
      "Harden some nodes against potential issues related to combos" touches `nodes.py`
      (+14-5) — core input validation, the shape of thing that bites a custom node.
- [ ] **Gate 5 — LOCAL gate.** Upgrade the engine to the new pin, boot it, then
      `node scripts/engine-floor-check.mjs` (48188 = app engine). Empirical, never a reading
      of release notes. **Do the res_multistep seed check here too.**
- [ ] **Gate 6 — sync BOTH files into mpi-ci, THEN rebuild the DEV image.**
      `node_lock.json` AND `python_deps.txt` → `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`,
      committed with `git -C`. Then `build-pod-image` at `v<ver>-dev-<profile>`, bumping
      **ONLY** `POD_IMAGE_VERSION_DEV` / `_CPU_DEV`. **NEVER the user-facing tag** — that
      breaks every user's Pod on next boot. Re-run `--plan` immediately before the smoke:
      both files are live working-tree state and a card landing mid-bump re-drifts them.
      **NOTE: `0c4ded6` in the pod repo is committed but NOT pushed** (a prior sync).
- [ ] **Gate 7 — assert the Pod reports 0.31.0** before smoking. The runner hard-fails on
      this itself; do not bypass it.
- [ ] **⚠ BEFORE GATE 8 — WAIT FOR FABIO'S NEW H3 VAE DEP.** Told 2026-08-10: a new,
      smaller, faster H3 VAE just shipped and takes H3 to ~27s (from ~40s on 0.31, ~70s on
      0.30). He is adding it in a **parallel session** as a dependency change and will
      continue the handoff when it is in. It is almost certainly what `Support int8_convrot
      VAE for MiniMax-H3` (kijai #15334) enables, so it requires 0.31 and belongs in 1.4
      alongside the bump. **THE TRAP:** `release:check` gates the evidence on the ENGINE
      version but **not** on the dep set, so a matrix run before the VAE lands looks
      perfectly valid while describing a model that no longer exists — and the entire rented
      matrix is wasted. Same shape as the playbook's "sync LAST" lesson. **Confirm the VAE
      dep is in the tree, then smoke.**
- [ ] **Gate 8 — full smoke matrix.** Not `--retry-failed`: the evidence is engine-scoped
      and `release-health-check.mjs:463` refuses a file produced against a different engine,
      so all 35 rows are void. Cheaper than this morning's run — the H3 ops now clamp
      `Input_Duration` to 1 (~22 frames, was ~73) and the volume is warm at 327GB.
- [ ] **Gate 9 — evidence written**, `npm run release:check` satisfied.
- [ ] **STABLE Pod image rebuild — MANDATORY, and it is NOT the dev one.** An engine bump
      makes the release-time rebuild compulsory: ship the app at 0.31 while the released
      image is still 0.30 and every remote user silently runs two different ComfyUI
      versions. Promotion is a **clean rebuild at a real version, never a dev tag renamed**,
      so there is no const to promote — `POD_IMAGE_VERSION` is a manual edit.
      `mpi-release`'s "a dev-only Pod IMAGE tag needs no action" is explicitly untrue here.
      **That means TWO image builds this release.**

### Then, and only then, the release chain

- [ ] Re-fold the notes: the `RELEASE_NOTES['1.4.0']` block is ALREADY WRITTEN (18/38/11 +
      1 engineNote) but its engineNote says 0.30.0 and must be rewritten for 0.31.0 —
      including the H3 speedup, the LTX/Wan speedup, and the res_multistep outcome if gate 5
      proves it. `UNRELEASED.md` is still intact, so the fold re-runs from the script in the
      handoff.
- [ ] Archival `docs/releases/2026-08-<dd>-v1.4.0.md` — never written yet.
- [ ] `npm run release:approve -- --yes` (writes `.approved-1.4.0.json`; commit it).
      **Approve LAST** — the token hashes the rendered notes, so any later copy edit
      re-blocks the build.
- [ ] `npm run release:check`, `npm test`, `npm run test:desktop`, `npm run release:deps`.
- [ ] CI artifacts (all three OS) → MPI-249's Linux leg on the REAL
      `CubricVision-linux-x64-v1.4.0.tar.gz` → `/mpi-release`, PROMOTE at the manifest stop.

## ON PICKUP — do these three before anything else

The card was HELD on **2026-08-05** behind Gate E. Ticks below were made under
assumptions that time may have invalidated.

- [x] **1. Look up today's date.** GitHub ground truth **`Sun, 09 Aug 2026 07:31:02 GMT`**
      (`gh api rate_limit -i`, taken before the VPN went on this session — the local clock
      is untrustworthy while it is, see `CLAUDE.md` § VPN).
- [x] **2. Is that date, or the expected cut date, on or after 2026-08-10?** — **SETTLED,
      and step 2's own premise turned out to be stale. The date gate no longer voids
      anything.** It was written on 2026-08-05 *before* the Gate C pass reworded the
      bullet. `UNRELEASED.md:412` now reads "**Most** model downloads now have a second
      route" and, at `:423`, "**Four files still have a single route**". That sentence is
      true before 08-10 and true after it, so **the notes are date-proof and MPI-433 is
      not a notes blocker in either direction.**
      What the date actually changes is only whether MPI-433 becomes *actionable*: before
      08-10 the upload is FORBIDDEN (coyotte's paid window), on/after it is permitted —
      and even then MPI-433's own brief gates it on checking CivitAI 573152 first, because
      the point is the window opening, not the calendar. The card stays `todo/blocked`.
      **Do not reopen MPI-433 on the strength of step 2's original wording.**
- [x] **3. Is Gate E actually done?** YES — MPI-449, MPI-451 and MPI-452 are all `done`,
      the engine is on 0.30.0, and the H3 bullets are in `UNRELEASED.md:123/135/147`. The
      card is `doing/in-progress`. The Gate B re-read against 0.30.x is still owed.

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
- [x] **MPI-461** — CLOSED 2026-08-08. Shipped in `f006dc4f` (structural half MPI-463); closed on code + test evidence in `80d6b05c`. Two negative-controlled tests in `tests/lane-settle-on-bail.test.cjs` plus T21 in `tests/generation-store.test.cjs` proving a queued→error settle frees the lane and the next job dispatches. Nobody watched the dialog paint — closed at the user's call, the emit is the same `ui:error` path that did paint this session.
      ORIGINAL TEXT: ADDED 2026-08-08 (opened after the gate list was written). One helper
      settles `PHASES.ERROR` before returning, replacing all TWELVE bare `exec.onError`
      early returns in `commandExecutor` — not just the workflow-fetch 404 that was hit
      live on 2026-08-06. Verified by a failed dispatch leaving the lane free: the next
      cue drains instead of sitting on QUEUED behind an unsettled job.
- [x] **MPI-479** — CLOSED 2026-08-08 on the user's own live recall test (`5f487a9b`). `_snapshotControlState` is live at `js/services/generationService.js:424`, called at `:499`.
      ORIGINAL TEXT: ADDED 2026-08-08 (reported live the same day). `_snapshotControlState`
      records what actually RAN, backfilling each op-declared component through the
      op/model/global default layers when the key is absent, so Reuse Prompt can pull a
      control back DOWN to its default. Shared primitive — verified on more than the
      reported control (`refImageSize` plus at least one of `previewStage` / `denoise` /
      `useGrid`). Lower severity than MPI-461: the known-issue line is an acceptable
      outcome here, a silent skip is not.
- [x] **MPI-483 — CLOSED 2026-08-10 `done/complete`, and the premise it was opened on is
      DISPROVEN.** One request settled it: `GET /remote/pod/ls` sampled every 1.5s through a
      14.31GB aria2/R2 install on a throwaway 40GB volume — `phantomBytes` never left ±15MB
      (0.1% of the file). 2.4s in, with 50MB fetched, the `.part` was already 13.43GB
      apparent **and** 13.43GB of allocated blocks: a RunPod network volume charges the full
      declared length immediately, so `du -sb` and `du -s --block-size=1` agree. **The flag
      swap is a correctness tidy, not a 48.65GB fix — do not let that phrasing reach the
      release notes.** The 307.65 vs 259 GB gap is explained by the two figures not being
      sampled at the same instant (48GB ≈ 2-3 minutes of lag at 250-460 MB/s). Bug 2's
      free-space gate is untouched and stays. **Consequence for the standing decision
      below: the full-disk phrase stays OUT of the wake-up-install bullet permanently** —
      not "until the Pod check passes", but because the check ran and the mechanism it
      would have cited is not real. Two corrections fell out, both in
      `docs/download-manager.md`: the HF path stages INSIDE MODELS_DIR (`.part.hfstage`),
      and a killed install strands that tree with nothing to sweep it.
      ORIGINAL TEXT: FIXED 2026-08-09, card `doing/validating`. Both accountings: the
      wrapper's `du -sb` (apparent bytes — and the comment above it claimed the opposite,
      which is why two rewrites of that route missed it) is now `du -s --block-size=1` at
      BOTH call sites, wrapper 0.2.44; and the smoke preflight gained a measured-free-space
      gate that refuses to rent. 7 asserts with a negative control. **One Pod check still
      owed** — fold it into the Gate B throwaway-Pod session below; the number only differs
      on a real network volume with a sparse `.part`. See `tasks/MPI-483/validation.md`.
      **Decision for the fold:** the full-disk phrase the claim audit removed from the
      wake-up-install bullet stays OUT until that Pod check passes. The fix is unproven
      live, and the bullet's whole job was to be the trustworthy counterexample.
      ORIGINAL TEXT: ADDED 2026-08-08. Gates because **the 1.4 notes cite it as the
      trustworthy case.** The wake-up-install bullet (`UNRELEASED.md:245`) reassures the
      reader: *"Genuine failures — a bad file, **a full disk** — still report exactly as
      before."* The full-disk report is the counterexample the whole bullet leans on, and
      it is wrong: the gate subtracts `du -sb` **apparent** bytes, inflated by aria2's
      preallocated `.part` files, so a user with any interrupted download can be told the
      disk is full when it is not — measured here as a 48.65 GB phantom, refusing an
      install with "39.4 GB free" when ~91 GB was. The message they get is the MPI-100
      toast telling them to free space, which is not the remedy. Either fix it or reword
      that bullet; shipping both as they stand is the one thing this card exists to stop.
- [x] **MPI-482** — CLOSED 2026-08-08 (`af829e0f`), and it INVERTED its own premise mid-flight: the hand-typed strings were 4.1% OVER true, not under — HuggingFace decimal GB copied into a field every consumer parses as 1024-based. All 107 sizes now regenerated from measured `Content-Length` by `scripts/computeDepHashes.py`; the 14 custom_nodes have none (git repos, no measurable length). Consequence for the notes: a GB figure is right only if it matches `DEPS[...].size`, never a publisher's page.
      ORIGINAL TEXT: ADDED 2026-08-08, **prerequisite for MPI-483**. Declared dep sizes are
      hand-written estimates (95 installed deps declare 195.7 GB against 259 GB of real
      blocks; one dep declared 160 bytes; one declared two different sizes under two
      models). A corrected gate fed by wrong sizes is just precisely wrong. Independently
      user-visible: `modelJob.totalBytes` is summed from these strings on BOTH engines, so
      every install progress bar in 1.4 is denominated by a guess. The fix is a sibling
      pass in `scripts/computeDepHashes.py`, which already HEADs every dep —
      `Content-Length` is in the response it already reads.
- [ ] Any Gate A card NOT fixed is written into the 1.4 release notes as a known issue

## Gate C — must decide (before the notes are frozen)

- [x] **MPI-433 date RE-CHECK** — DONE 2026-08-09, see § ON PICKUP step 2. The re-check
      found the gate no longer bites: the Gate C rewording made the bullet true on both
      sides of 08-10, so the notes do not depend on the cut date. MPI-433 stays
      `todo/blocked` and is not a blocker for this release either way.
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
- [x] **Claim audit, SECOND PASS — the `mpi-kanban:claim-auditor` agent, 2026-08-10, run
      BEFORE the fold as MPI-511's message asked.** Audited all 524 lines against
      `v1.3.1..HEAD` (593 commits): **~45 PROVEN, 1 FALSE, 4 OVERSTATED, 1 UNPROVABLE.**
      Every finding was re-verified against git by hand before any edit — which mattered,
      because **one finding was itself wrong**: it claimed `ltx-23` declares
      VideoHelperSuite and wanted the notes to say "Wan 2.2 or LTX 2.3". The two
      declarations sit inside `wan-22` (models.js:1106) and `wan22-5b` (:1454); `ltx-23`
      has none. Applying that "fix" would have PUT a false claim into a public changelog.
      Treat this agent as evidence, never as truth.
      **Applied:** the FALSE one (Chroma's Control op DOES follow the source image — both
      Chroma cards declare `imageSizedOps: ['control','detail','upscale']`; the
      Depth→Control rename left the line stale); the six progress bars restated as the TWO
      root causes they had (`fa7f2dc1` sibling-billing on 2 bars, `be00aee7` orphan
      collection on the other 4); "both Qwen models" → "Qwen", there being exactly one.
      **CUT on Fabio's call:** the whole "LTX video generation works again" bullet. It
      claimed every LTX generation had failed since 1.3.0, but **v1.3.0 AND v1.3.1 both
      pinned ComfyUI v0.29.2** and the breaking change is in v0.30.0, pinned only in this
      cycle — so no released user ever had broken LTX. The bullet described a regression
      created and fixed inside the dev cycle, invisible to everyone.
      **REWRITTEN on Fabio's call:** the H3 Turbo bullet no longer carries any specific
      number. The "2m15s instead of 4m15s on a 16GB card" figure had no committed backing
      (`turbo.md` holds only the 2-second lightx2v measurement and a 5s table for the OTHER
      LoRA — the turbo LoRA was swapped mid-cycle, MPI-505 → MPI-508). Turbo is now
      described qualitatively. Standing rule from Fabio: **no numeric claims for turbo
      LoRAs.**
- [x] **Claim audit** — DONE (read half), 2026-08-08. Full per-bullet verdict table:
      **`claim-audit.md`** in this folder. All 61 bullets graded LIVE / TEST / DECL, with
      the evidence pointer per bullet. **Scope correction:** the 2026-08-05 pass had read
      `## fixes` ONLY — `## whatIsNew` (15) and `## importantChanges` (11) had never been
      audited at all, and `## fixes` had since grown 23 → 35.
      **Four corrections applied to `UNRELEASED.md`:** two size claims restated in the
      units the tiles actually show (LTX Balanced "20GB instead of **22–23.5GB**", not
      24–25GB; H3 "**50GB** of weights", not 53GB); the full-disk example dropped from the
      wake-up-install bullet, which settles the fourth soft spot **without** waiting on
      MPI-483 (put the phrase back if 483 lands); and the "if you have been avoiding LTX"
      sign-off moved back under the LTX-dead bullet, where `56902d53` had displaced it.
      **The size half was corrected twice.** MPI-482 landed mid-audit (`af829e0f`) and
      inverted its own premise: the hand-typed strings were 4.1% **over** true, not under
      — HuggingFace's decimal display copied into a field every consumer parses as
      1024-based — and all 107 are now regenerated from measured bytes as GiB. So a GB
      figure in the notes is right only if it matches `DEPS[...].size`, never a publisher's
      page. Wan's "27GB" was right all along and is restored.
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
- [ ] **When `mpi-release` stops on the dev/stable manifest diff, the answer is PROMOTE.**
      Not a new gate — `mpi-release/SKILL.md:53` already diffs the manifests and stops on a
      sha mismatch, and it never auto-promotes. The shas WILL differ on this release (dev
      `0.2.43`, stable `0.2.40`, verified live 2026-08-08), so that stop is going to fire.
      What the skill supplies is the prompt, not the consequence: someone without this
      context can answer "dev is deliberately not shipping" and cut 1.4 quite reasonably.
      Declining ships MiniMax H3 — a headline 1.4 feature — at **1.66 MB/s, ~10 hours for
      the ~46GB set** instead of ~2.5 minutes, and nobody reports that as a bug because it
      just looks like a big model. Remote/Pod installs and the six huggingface.co deps only.
      **The GPU-image `_download_hf` number (MPI-467) comes before the promote answer.**

## Bump

- [ ] `/mpi-version-bump` → 1.4.0 (appVersion.js, package.json, package-lock.json, operation registry, model mappings, operation_registry.json)
- [ ] `UNRELEASED.md` folded into `RELEASE_NOTES['1.4.0']` + `docs/releases/2026-MM-DD-v1.4.0.md`, file cleared back to its header
- [ ] `npm run release:check` → passed at 1.4.0
- [ ] `release:approve --yes`, approved hash changed
- [ ] CI artifacts built (all three OS)

## Gate B — must verify (against the REAL artifacts, after the bump)

- [x] `npm test` green — **530/530, 2026-08-09 19:00Z.** It was RED for part of the day and
      the cause is worth keeping: `0b15f342` (MPI-505, H3 turbo) made `stagesFor` floor the
      TOTAL at 1 so H3 can pass a `-1` delta for its single-pass run, which broke
      `output-prompt-capture`'s pinned *"negative/garbage deltas must not corrupt a real
      count"*. MPI-505 shipped without updating it and closed, so the break had no card.
      Resolved by re-pinning to `1` rather than adding a clamp: the sole caller
      (`commandExecutor.js:1551`, `_enhanceBars + _singlePassBars`) can only ever emit
      `-1`, `0` or `+1`, so a garbage delta is unreachable and clamping it would be
      defending against nothing. A second assertion now pins the REAL case (`-1` -> 1).
      **This is the sibling-agent pattern again** — family work lands in this repo with its
      tests unswept. Worth a glance at `npm test` after any Cubric-Prompt/H3 session.
- [x] `npm run test:desktop` green — **17/17, exit 0, 2026-08-09 20:04Z.** Ran on port
      63434 with Fabio's own app live on `:3000` throughout, and `:3000` still answered 200
      afterwards. The suite prints its own proof of the isolation: *"port 63434 — a dev app
      on 3000 is left alone."* **That one run also closes the MPI-458 line below** — the
      confirmation it was owed is precisely "full `test:desktop` concurrent with a live app,
      both surviving".
- [x] **One FLUX.2 Klein generation, watching the live preview.** — **PASS, observed
      2026-08-09 20:25Z.** The bullet's promise holds: the preview is a photograph, not a
      colour blob. Evidence kept at `klein-live-preview.png` in this folder.
      Method (it matters, because the naive version proves nothing): a browser renderer on
      the live app subscribed to `Events.on('preview:frame')` — the bus in
      `docs/preview-bus.md` — and captured all **4** frames of a 4-step Klein Low t2i
      (`Prompt executed in 15.99 seconds`). Watching for `<img>` elements first found
      nothing: the bus hands out **blob URLs and revokes the previous one**, so only the
      newest frame is still resolvable, which is why steps 1-3 render broken in the
      screenshot. That is the bus behaving, not a defect.
      **Three things pin it as the TAESD preview rather than the finished image:** the
      frame arrived on `preview:frame` with `engine: 'local'`; it is **422x512 against an
      896x1088 output**, i.e. downscaled; and `app.log` carries **no**
      `TAESD previews enabled, but could not find models/vae_approx/None` warning anywhere
      in the 20:22-20:27 window, so `taef2_decoder` was found and loaded. (That warning
      appears 19 times overall in the log — that is the documented Latent2RGB fallback for
      every latent format with `taesd_decoder_name = None`, H3 among them. Expected.)
      Two images landed in the **Test Chips** project as a side effect of the two cue
      runs; harmless, delete at will.
      ORIGINAL TEXT: **One FLUX.2 Klein generation, watching the live preview.** — **RESCOPED
      2026-08-09: the Wan 2.2 half was checking a claim the notes deliberately do NOT
      make, so running it would have manufactured a bug report.** `UNRELEASED.md:440-442`
      already carves it out in the same bullet: *"A few models still show the rough
      preview on purpose: Krea 2, both Qwen models and Wan 2.2 share a preview decoder
      with a known bug that corrupts the real generation."* The code agrees and says why
      at length — `js/data/modelConstants/assetDeps.js:506-521`, *"DO NOT ADD THE
      `lighttaew*` DECODERS"*, ComfyUI issue #13366 still open, fix PR #13383 still
      unmerged. Only THREE preview decoders ship as `engineAsset` (`taesdxl_decoder`,
      `taef1_decoder`, `taef2_decoder`), so **there is no Wan 2.2 sharp preview to look
      at in 1.4 by design.** What is left to verify is the half the bullet does claim:
      **FLUX.2 Klein must show a recognisable preview**, which is `taef2_decoder` doing
      its job. Wan 2.2 is worth one glance only as a NEGATIVE CONTROL — a rough preview
      there is the carve-out being honest, not a defect. If Klein cannot be run before
      the cut, reword the bullet to the install claim (the decoders now ship) and drop
      the "looks like your picture" promise.
      **Checked on the way past, no action needed:** the live engine's `vae_approx/`
      (`G:\CubricModels`, shared with the bench) holds `taeh3.safetensors` and
      `taeh3_ollin.safetensors`, neither of which is an app dep. They are INERT on
      engine 0.30.0 — `comfy/latent_formats.py` has no `taeh3` decoder name anywhere and
      `MiniMaxH3Video` (:570) inherits `taesd_decoder_name = None`, so H3 previews are
      Latent2RGB and nothing loads those files. No `lighttaew*` is present, which is the
      one that would corrupt real generations. Worth re-checking after any engine bump:
      the hazard is a file in that folder becoming loadable, not the file existing.
      ORIGINAL TEXT: **One FLUX.2 Klein + one Wan 2.2 generation, watching the live
      preview** — ADDED 2026-08-08 by the Gate C claim audit. The `UNRELEASED.md:377` bullet says the live
      preview "looks like your picture, not a colour blob"; nobody has ever seen it. The
      decoders themselves are proven (on R2, HEAD-verified, strict-load under the engine
      python, wired as `vae_approx/` engineAssets with two negative-controlled tests) — the
      VISUAL outcome is what is unobserved. MPI-420 carried these two checks and was
      bulk-closed without them, so they have no other home. If they cannot be run before
      the cut, reword the bullet to the install claim (the decoders now ship) and drop the
      "looks like your picture" promise.
- [~] **Post-smoke throwaway-Pod session — RUN 2026-08-09 21:00-21:30Z, and NEITHER card
      closed.** Six CPU Pods created, all six deleted and verified gone (404 each); two
      throwaway volumes created and deleted; `aghcuvg7nl` never touched. What it DID
      settle: **wrapper 0.2.44 is published to the dev channel and boots** (every Pod
      reported `wrapperVersion: 0.2.44`), so `mpi-release`'s manifest-diff stop will read
      dev `0.2.44` vs stable `0.2.40` — answer still PROMOTE. And the old blocker is
      gone: all three teardown verbs work from an agent session now.
      **2026-08-10 — BOTH CLOSED.** MPI-483 measured (phantom ≈ 0, premise disproven) and
      MPI-481 proven live twice (`stale in-flight record … reinstalling` at 04:18:22Z on the
      HF path and 04:24:05Z / 04:26:13Z on the R2 path, after a Pod **STOP** rather than a
      delete). One throwaway Pod + one 40GB volume, both deleted and verified gone;
      `aghcuvg7nl` never attached. The two blocks below are the superseded 2026-08-09 state.
      **MPI-483 — inconclusive, and `/remote/pod/disk` is the wrong instrument.** Two runs
      of the same experiment disagreed (13.61 GB attributed to a 14.1s-old `.part` in one,
      0.00 GB to a 7.6s-old one in the other). Causes: `/wrapper/disk` caches `du` for 60s
      and is invalidated only by an install completing or a delete; the app's
      `downloadedBytes` lags by seconds, which is GBs at the 250-460 MB/s R2 delivers; and
      a Pod delete takes longer to land than the download takes to finish. `GET
      /wrapper/ls` already returns BOTH accountings for the same file at the same instant
      and would settle it in one call — no app route surfaces it and the Pod proxy is not
      reachable from a shell here (curl 000). **Next step is that small route, not another
      Pod.** Full detail + a finding that may undercut the card's own premise (an in-flight
      HF install does not touch the volume at all) in `tasks/MPI-483/validation.md`.
      **MPI-481 — not proven: the corpse would not stay dead.** The download keeps running
      for seconds after `delete-active` returns `{deleted:true}`, so a 2.15 GB dep finished
      at 99.96% and a 14.31 GB dep killed at 29% was at 59% minutes later. Next attempt
      must use a SLOW (huggingface-hosted) dep, or STOP the Pod rather than delete it.
      See `tasks/MPI-481/validation.md`.
      ORIGINAL TEXT: **Post-smoke throwaway-Pod session — closes MPI-480 #3 AND MPI-481 in one go.**
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
- [x] **MPI-458 confirmation run** — **DONE 2026-08-09 20:04Z, on the same
      `test:desktop` pass above.** 17/17 on port 63434 while the user's app held `:3000`;
      both alive at the end. `docs/testing.md`'s "the suite runs alongside your open app"
      guarantee holds with no waiver and no release-note line, exactly as the card
      predicted when it closed as **not a defect**.
      ORIGINAL TEXT: ADDED 2026-08-08. NOT a blocker and NOT a gate: the
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
- [ ] **RE-SMOKE MiniMax H3 — LAST, and only once the graph stops moving.** ADDED
      2026-08-09. `dev_configs/smoke-evidence.json` was written at **04:21:46Z**; the H3
      graphs were re-authored at **10:06, 11:30, 12:33, 12:53 and 13:19Z** (turbo LoRA,
      single-pass, EasyCache gate — MPI-505, `2b2df03f` … `0b15f342`). **Its two H3 rows
      therefore describe a superseded graph**, and `release:check` cannot tell: its guards
      are the engine tag and `node_lock.json`'s commit date, not graph content, so the file
      passes while two of its 35 rows are stale.
      **Fabio's instruction, 2026-08-09: the H3 workflow is still being touched, so defer
      every H3 test to one of the LAST steps before the cut.** Do not re-smoke it now — the
      run would be invalidated by the next edit.
      When the graph is frozen: `node scripts/smoke-workflows.mjs --models minimax-h3
      --keep-volume --volume aghcuvg7nl`. That is a ~7-minute L4 leg, not a matrix, and it
      MERGES into the existing evidence (MPI-467) instead of replacing it. Back up
      `dev_configs/smoke-run.txt` with `cp` first — ANY invocation truncates it.
- [ ] **NEW CONTENT ANNOUNCED 2026-08-09 21:35Z BY FABIO — none of it is tested, and two
      pieces touch things this card already verified.** Added verbatim so the cut cannot
      quietly ship them unexercised:
      1. **PID becomes FOUR plugins** (was one). Sibling board cards MPI-506/507 are the
         live work — MPI-507's own log already claims the workflow-generation half passes.
      2. **SeedVR2 arrives as THREE more plugins.**
      3. **MiniMax H3 gained a new LoRA and a new decoder for video preview.**
      4. **The LTX workflows gained a Tiny VAE decoder.**
      5. **Krea 2 NSFW goes up to HuggingFace today** — that RESTORES its fallback route.
      **Two interactions to check before the notes freeze, both cheap:**
      - *(3) and (4) versus the preview bullet.* If either decoder is meant to drive the
        LIVE PREVIEW, dropping a file into `vae_approx/` is not enough on engine 0.30.0:
        `comfy/latent_formats.py` has no `taeh3` name anywhere and `MiniMaxH3Video` (:570)
        inherits `taesd_decoder_name = None`, so H3 previews are Latent2RGB and nothing
        loads such a file. If instead they are DECODE NODES inside the graph, the previewer
        is not involved and this is a non-issue — but `UNRELEASED.md:434-442` names exactly
        which models show a rough preview on purpose, so that bullet has to be re-read
        either way. **And `lighttaew*` must still never be installed** (ComfyUI #13366
        corrupts the real generation, still open).
      - *(5) versus the second-route bullet.* `UNRELEASED.md:423` says "**Four files still
        have a single route**". A Krea 2 NSFW upload changes that count, so re-check the
        number and MPI-433's status once it lands. The bullet was deliberately written to
        be true on both sides of 2026-08-10, so this is an accuracy tidy, not a blocker.
      **All five need a smoke pass, and per the standing instruction the H3 leg goes LAST.**
- [~] **FULL SMOKE MATRIX RUN 2026-08-10 07:05-07:45Z - 34 PASS / 0 SKIP / 1 FAIL.**
      Forced to the full matrix, not the LTX+H3 subset: `smoke-evidence.json` (2026-08-09
      04:21Z) predated the `node_lock.json` commit, so `loadMergeBase` refused a scoped run
      (a subset would have had to MERGE into evidence describing the old engine). No override
      flag exists, by design - the gate mirrors `release-health-check.mjs`.
      **Pre-rent gate found a real blocker:** the pod repo's `node_lock.json` still pinned
      MpiNodes `43a976f`, two commits BEFORE `MpiVideoSamplingPreview` and `MpiTinyVaeLoader`
      existed - the H3 graphs would have died on `missing_node_type`. Synced + committed
      (`0c4ded6` in cubric-vision-pod). **No image rebuild was needed** and the runner says why
      itself: MpiNodes is code-only (`installRequirements:false`), so since MPI-222 it installs
      to the VOLUME and the manifest-v2 drift check reinstalls it when the pin moves.
      **LTX 2.3 previews proven on a Pod for the first time** - `ltx-23-balanced` t2v_ms 74s,
      i2v_ms 38s, the new `taeltx2_3` wiring executing remotely.
      **The one FAIL is MPI-501's failure recurring**, identical to MPI-467's:
      `minimax-h3/t2v_ms - prompt orphaned after 162s` (was 169s). See the two entries below.
- [~] **MPI-501 REOPENS IN EFFECT - its guard had a six-second hole, now fixed (unit-proven).**
      MPI-501 sits in `done/complete` while its own `validation.md` still reads
      *"Not proven yet: the live half."* Its live proof was the dev radial on the LOCAL engine,
      which is the ONE caller where the bug cannot appear. `comfyController.waitForIdleQueue`
      returned `true` after THREE unreadable `/queue` polls - six seconds - so an
      app-initiated restart fired into a live prompt. Local `/queue` is a localhost call that
      never blips; the failing path is the automatic REMOTE one, where `/queue` crosses the
      RunPod proxy while the heaviest op saturates the GPU.
      FIXED by splitting the escape hatch per caller: unreadable is UNKNOWN, so every
      app-initiated restart REFUSES (`comfyController.js`, plus the server-side twin in
      `routes/remoteModels.js`, whose doc comment already claimed this while the code did the
      opposite); only the dev radial (`navigation.js`) opts in via `unreachableMeansIdle:true`,
      so a human can still repair a wedged engine. `tests/restart-drain-wait.test.cjs` pins
      BOTH branches. `npm test` 535/535.
      **NOT live-proven, and must not be closed as if it were.** A competing cause fits the
      same evidence: `start.sh:193`'s supervisor relaunches a dead ComfyUI child, which looks
      identical from outside (prompt gone, comfyReady=true, Pod alive). H3 loads
      `h3-qwen3vl-32b-clip` at **24.55GB on a 24GB L4**, and the budget shrinks the image, not
      the text encoder; the failing op is always the FIRST H3 op, paying the cold load, while
      i2v_ms and ref2v_ms pass warm right after. **The distinguishing test:**
      `node scripts/smoke-workflows.mjs --retry-failed --keep-volume --volume aghcuvg7nl` with
      the Pod's ComfyUI log captured - an OOM line means the fix is VRAM-side, not the guard.
- [x] **LTX 2.3 card stuck at a full bar while NOT installed - FIXED.** Found by Fabio during
      the run. The node-drift heal POSTed an install for `ltx-23` carrying ONE 1.76MB node, so
      `modelJob.totalBytes` was SET from that request while `modelJob.deps` (which ACCUMULATES)
      still held a 2.3GB shared weight attached by MPI-97 - 2312149072/1845493.76 = **125,286%**,
      clamped to a full bar, settling `complete` on a model with no transformer, VAE or CLIP.
      Seven sibling models held the same phantom job. Two fixes, both structural:
      `_healRemoteNodeDrift` now uses a namespaced `engine:node-drift` job id (the pattern
      `ENGINE_ASSETS_JOB_ID` twelve lines below it already established for exactly this - a heal
      must not render a model card) and unions N per-model jobs into one, since a custom node
      lives ONCE on the volume; and both `startModelDownload` twins now derive numerator AND
      denominator from `modelJob.deps` via `_byteRatioExcludingNodes`, the same helper the
      progress ticks use, so start and tick agree by construction. MPI-276 G12 still holds
      (summing a dep set deduped by id is idempotent). `tests/download-job-denominator.test.cjs`.
- [x] **RunPod safety: you cannot delete what you cannot see - FIXED.** During this session an
      agent looking for a pod LIST called `POST /runpod/pods`, which CREATES, made stray Pods,
      and then could not remove them: the only sweep filters `p.name === 'cubric-vision'`, so a
      Pod the app did not name is unreapable, and the key is decryptable only by Electron's main
      process. Fabio cleared them by hand from the console (stop is instant; terminate needs a
      typed confirmation - a console guard only, the REST deletePod has none). Added
      `GET /runpod/pods` (read-only inventory: count, costPerHrTotal, pods) and an opt-in
      `{all:true, keepActive:false}` mode on `/remote/pod/cleanup-orphans` that drops the name
      filter. `all` is never automatic - MPI-485 already has the name-filtered sweep killing a
      peer session's live Pod. Both verified live after the app restart: `{"count":0,...}`.
- [ ] **MPI-249 Linux leg** — real `CubricVision-linux-x64-v1.4.0.tar.gz` extracted on the Linux box, LOCAL uv engine provisioned, nodes installed, one model per family generated. A Pod run does not count
- [x] **MPI-432** — WAIVED by the user 2026-08-08, card parked to `done`. The release-note
      entry is the only deliverable he wants and it is already in `UNRELEASED.md:347` under
      `## fixes`. No Mac is rented: the removal is platform-wide, the bullet claims no
      verified macOS outcome, and a broken UI-zoom shortcut is reported within minutes by
      the tester waiting on 1.4. Closed as a DECISION, not a verification.

## The H3 t2v FAIL — settled 2026-08-10, and NOT the way the handoff predicted

**Outcome: `--retry-failed` PASSED (153s, 1 out). Evidence merged: 35 PASS / 0 SKIP / 0 FAIL
across 35 ops.** The failure did not reproduce. That is NOT the same as a root cause found,
and this line exists so nobody later reads 35/35 as proof that something was fixed.

**Both handoff candidates are dead, and each was checked before a GPU was rented:**

1. ~~The MPI-501 drain-wait hole (fixed in `2ad444a2`)~~ — **never reached on the failing
   run.** The app's only server-side restart caller is `routes/remoteModels.js:906`, gated on
   `out.installed.length`. The app log for that run reads
   `[2026-08-10T07:13:05.983Z] [INFO] [runpod] universal nodes: 7/7 already on volume`, so
   nothing installed, `_waitForIdleQueue` never ran, and no restart fired. That one line is
   the ONLY entry in the whole 07:13–07:44Z window. `2ad444a2` is a correct fix for a real
   hole; it is not the fix for this.
2. ~~"ComfyUI died and `start.sh:193`'s supervisor relaunched it"~~ — **that supervisor does
   not exist.** `:193` is the node-dedupe block. `ComfyManager._supervise`
   (`wrapper/wrapper.py:304`) calls `os._exit(1)` on an unexpected ComfyUI death and
   `start.sh` ends in `exec uvicorn` with no respawn, so a crash takes the container DOWN.
   There is no relaunch path to produce a live Pod with a missing prompt.

**The VRAM theory is also dead, on Fabio's argument, not on a measurement:** H3 t2v runs on
his local 16GB card, and `i2v_ms` — which carries the same 24.55GB text encoder PLUS an image
path, so it cannot be cheaper — passes on the same Pod minutes after t2v fails. Memory does
not explain a pass immediately after a fail. Do not re-open the "bigger card for H3's leg"
line from the handoff.

**What was actually found — a false-positive path in the detector itself.** `orphanReason`
declares an orphan on two readings, absent-from-queue AND absent-from-history. The queue read
is guarded (*"a queue read we could not make is not evidence the prompt left"*); the history
re-read was NOT. `app()` throws alike on a relay 502 and on a network error, so
`.catch(() => null)` collapsed "could not read" into "absent" — and one failed read declared
an orphan. That read is the likeliest to fail: it lands at the completion boundary. The op
takes **153s**; the FAIL was declared at **162s**.

**This is not proof that the guard is what bit us** — a Pod cannot be re-questioned after it
is deleted, and the run that would prove it is the one that passed. It IS a defect that can
manufacture this exact verdict, in the runner, found by reading it. Fixed + mutation-verified:
`tests/smoke-orphan-guard.test.cjs`, 5 tests incl. a negative control proving a REAL absence
still reports. `npm test` 540/540 (was 535; the +5 is this file).

**Also corrected: the runner's own diagnostic string, which is what cost the last session.**
It asserted *"only POST /wrapper/restart-comfy does that, a crash would have taken the Pod
down"* — naming a caller that provably did not fire. The wrapper half of that claim is sound
and is kept in the comment; the CONCLUSION is gone. The message now reports the observation
and names both readings a reader should check.

**Residual, honestly stated:** an intermittent verdict that has now appeared twice (2026-08-08
MPI-467, 2026-08-10) and passed once under scrutiny. If it recurs, the instrument to reach for
is a `/remote/comfy/status` poll alongside the run — `ready` staying true through a
`comfyReady` dip is a requested restart, the wrapper vanishing is a container death (MPI-107).
That poll ran for this whole retry and showed an UNDISTURBED Pod: `ready:true, comfyReady:true`
unbroken from 11:25:07Z to 11:28:10Z across the entire 153s op.

## Surfaced by this umbrella, deliberately NOT gating 1.4

- **The frame budget never reached MiniMax H3, and the smoke has been paying for it.**
  `TITLE_RULES` clamps `Input_Frames`, but H3 expresses length in SECONDS: `Input_Duration`
  (`MpiInt`) feeds `MpiH3Length`, which converts at 24fps onto H3's `n % 17 == 5` grid. So
  no rule matched, the `frames: 1` budget silently skipped H3, and `t2v_ms` smoked a
  **3-second, ~73-frame video** while every other op ran a single frame — which is the plain
  reason H3 takes 153s against 4-38s elsewhere, on every matrix run, on a rented GPU.
  **FIXED 2026-08-10** (`Input_Duration -> 1`, ~22 frames; 1 is the floor an INT node can
  express and the shipped r2va graph already bakes exactly it). Verified against both real
  graphs, plus a self-check assertion. Found only because Fabio brought PR #15446 and it
  prompted a look at what frame count H3 was actually running.
- **ComfyUI PR #15446 (kijai) — "Optimize MiniMax-H3 VAE", merged 2026-08-09.** H3 decode
  peak memory grew LINEARLY with video length (full video in VRAM + a float32 copy + a CPU
  duplicate in `sd.py`); the PR streams it chunked. Measured 3485MB -> 607MB VRAM and
  +7089MB -> +2320MB RAM at 175 frames, bitwise-identical output. **We do not have it:** it
  merged after v0.31.0 and we pin v0.30.0. **It does NOT explain this card's smoke FAIL** —
  a length-dependent peak cannot kill a 128px op — but it is a strong argument for the next
  engine bump, and it is what revised MPI-516's severity upward: a real user CAN reach the
  hang by OOMing H3 decode on a long video.
- **The smoke evidence gates on ENGINE but not on GPU, and `gpu` is one top-level scalar.**
  `loadMergeBase` refuses a scoped run whose recorded engine differs from the pin
  (`smoke-workflows.mjs:1088`) and refuses one older than the last `node_lock` move — both
  correct. Nothing checks the CARD. So `--gpu "RTX 4090"` on a retry merges one fresh row
  into 34 rows measured on an L4 and rewrites `gpu` for the whole file, which then reads as
  "35 ops proven on a 4090". Found 2026-08-10 while choosing a card for the H3 retry; it is
  why that retry deliberately stayed on the L4. **Not a gate:** no run has done it, and the
  same-card path is unaffected. The honest fix is per-row `gpu`, not a refusal — a retry on
  a different card is a legitimate thing to want. **NOT carded** — Fabio was asked and the
  answer was to ship 1.4; raise it again when someone actually wants a cross-card retry.
- **MPI-516** — a destroyed prompt hangs the app forever (created 2026-08-10, deferred to
  1.5 on Fabio's call). The only user-facing half of this card's whole H3 investigation.
- **MPI-509** — a remote install can report success having installed nothing: when
  `_filterDepsForEngine` empties the request, `POST /comfy/models/download/start` still
  answers `{success:true}` with a 0/0 job that settles to `complete`. Found 2026-08-09
  during this card's throwaway-Pod session, which lost two Pod legs to it. **Not a gate:**
  pre-existing, not a regression, and the renderer resolves per-engine correctly so no user
  path reaches it. Carded so the next person does not rediscover it the same way.
- **MPI-510** — an interrupted remote install strands its partial on the volume (an aria2
  `.part` at its FULL declared length, or the HuggingFace `.part.hfstage` tree: 11.5GB
  measured), nothing sweeps it (the wrapper delete handles `dest` + `.part` only; the orphan
  sweep maps files to deps), and the free-space gate then refuses the retry on that same
  space — `need 13.3 GB, have 12.0 GB free` for the dep whose own leftover was the occupant.
  Third symptom on the same route: a gate-blocked install sits at `queued` indefinitely with
  no error state. Found 2026-08-10 closing MPI-483/481. **Not a gate:** needs a Pod
  stop/kill mid-install, which is not a user path, and both cards closed without it.
- **The companion finding got a card too, and yesterday's version of this line was WRONG.**
  It said the HF path "stages OFF the volume" on the strength of a 49,664-byte reading —
  which was `/remote/pod/disk`'s 60s `du` cache answering with the pre-install number. HF
  stages into `<dest>.part.hfstage` **inside** MODELS_DIR by design. Corrected in
  `docs/download-manager.md` 2026-08-10; sample volume usage with `/remote/pod/ls`, never
  `/remote/pod/disk`, while anything is downloading.

## Cut

- [ ] Every gate above reads closed, or waived by the user with the waiver recorded on this card
- [ ] `/mpi-release` — GitHub Release published (full builds + update bundles), `1.4.0` branch cut from master
- [ ] Docs-site coverage noted on the `Cubric Studio (Docs)` board (that repo is a hard no-push — note only)

## Gate audit — 2026-08-09 (`/mpi-project-refresh`)

Every card this checklist names was resolved against the board and the code. Three Gate A
ticks above were stale: **MPI-461, MPI-479 and MPI-482 all closed on 2026-08-08** and the
list still read them as open, as did the 04:55 handoff's resume prompt ("Gate A's four open
cards"). Verified on disk, not from the card text:

| card | evidence |
|---|---|
| MPI-461 | `f006dc4f` + `tests/lane-settle-on-bail.test.cjs` |
| MPI-479 | `generationService.js:424` `_snapshotControlState`, called at `:499` |
| MPI-482 | `scripts/computeDepHashes.py` reads `Content-Length`; 107 sizes regenerated |

**Gate A now has exactly ONE open card: MPI-483** (its prerequisite MPI-482 is done, so it
is unblocked and ready to start). Gate E is fully closed — MPI-449, MPI-451 and MPI-452 all
`done`, the H3 bullets are in `UNRELEASED.md:123/135/147`, and the smoke gate cleared with
MPI-467/468.

Still genuinely open, in the order the release needs them:

1. ~~**The 2026-08-10 date gate**~~ — **SETTLED 2026-08-09**, see § ON PICKUP steps 1-3.
   It does not bite: the Gate C rewording made the second-route bullet true on both sides
   of the date, so the notes are date-proof. MPI-433 stays blocked either way.
2. ~~**MPI-483** — the last Gate A card.~~ **CLOSED 2026-08-10 `done/complete`.** The Pod
   check ran: phantom ≈ 0, so bug 1's sparse-`.part` premise is disproven and the flag swap
   is a tidy, not a 48.65GB fix. Bug 2's free-space gate stands. **Gate A has NO open card.**
3. ~~**`npm test` IS RED ON MASTER**~~ — **FIXED 2026-08-09, 530/530.** Detail on the
   Gate B line.
4. **Gate B** — ~~`test:desktop`~~ (17/17 20:04Z, which also closed MPI-458's
   confirmation run), ~~the Klein preview look~~ (PASS 20:25Z; the Wan half was rescoped — a
   deliberate carve-out in the notes, not a check), ~~the throwaway-Pod session~~
   (**DONE 2026-08-10** — MPI-480 #3, MPI-481 and MPI-483 all closed; Pod and volume
   deleted and verified gone), MPI-458's confirmation run, the MPI-249 Linux leg, and
   **the H3 re-smoke LAST** — the graph moved after the evidence was written and Fabio is
   still editing it. `npm test` is done (530/530).
5. ~~**MPI-501**~~ — **CLOSED 2026-08-09 20:05Z, `done/complete`.** The toast was
   confirmed by a real-pixel probe on the live app: `mpi-toast--warning` carrying the exact
   refusal string, zero elements matching REPORT ON GITHUB / Error Summary, screenshot kept
   at `tasks/MPI-501/restart-refusal-toast.png`. A real restart was deliberately not
   re-driven — the engine root is shared with the user's live app.
   ORIGINAL TEXT: **PROVEN LIVE 2026-08-09 19:00Z.** Generation running on the local
   engine, dev radial restart, refusal, ComfyUI survived. The run also caught the refusal
   rendering as the `ui:error` crash dialog (REPORT ON GITHUB, for correct behaviour) —
   moved to a `ui:warning` toast and reworded. One look left to confirm the toast, then
   the card closes. See `tasks/MPI-501/validation.md`.
6. **The promote answer** at `mpi-release`'s manifest-diff stop. Its blocker (MPI-467) is
   closed, so nothing defers it any more. **The dev sha WILL move before the cut**:
   MPI-483 bumped the wrapper SOURCE to 0.2.44 but has NOT published it — the dev channel
   still serves 0.2.43 until `publish-runtime.sh dev` runs as part of MPI-483's Pod check.
   Once it does, this stop reports `0.2.44` vs stable `0.2.40`, and the answer is still
   PROMOTE.
