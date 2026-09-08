# MPI-706 Checklist — 1.5.0

## Phase 0 — master-side cleanup
- [x] MPI-698 closed `rejected`; revert verified in place (`da89739e`)
- [x] NVFP4 R2 object deleted, HEAD 404 confirmed, Heretic still 200
- [x] Dep entry kept, `url`/`mirrorUrl` dropped so `release:deps` stays green
- [x] Board validation repaired (`90687ead`)

## Phase 1 — the H3 cut on `1.4.2`
- [x] MPI-698 encoder revert ported (branch was shipping the rejected encoder)
- [x] MPI-703 MpiNodes pin 8505769 → 287edb83 (v1.2.11)
- [x] MPI-699 windowed sampler
- [x] MPI-704 quality-ladder re-tier + `js/utils/ratios.js`
- [x] MPI-682 uninstall frees engine-anchored weights (test fixture adapted to `rife47`)
- [x] MPI-689 video posters 256 → 512 (cheap half — full ladder is 2.0)
- [x] MPI-667 + MPI-690/691 remote download
- [x] Pod RAM floor → 64
- [x] `npm test` 644/644 · `npm run release:deps` 236/236

## Phase 2 — non-Flow image models (Fabio: "B", 2026-09-07) — DONE, `2603f668`
- [x] MPI-615 — SDXL family + Krea 2 inpaint, LTX stage 2. Graphs copied whole;
      `commandRegistry.js` hand-merged (took 615's text + `krea2Turbo`), krea2 README
      resolved to 615's seven-op table
- [x] MPI-598 — Klein 9B ships (new model, `klein_9b_t2i.json`, 9 display webps, weights,
      deps, the seven-slot LoRA rack)
- [x] MPI-609 — Klein style LoRA renames (`loraDeps.js`, both Klein graphs, generator)
- [x] MPI-575 — LTX preview ring, **non-Flow half only**: `flow_ltx_extend`/`flow_ltx_foley`
      do not exist on this line. Its `node_lock` hunk was correctly REJECTED by the 3-way —
      it would have moved MpiNodes backwards to `5e07043`; the pin holds at `287edb83`
- [x] MPI-605 — LTX kitchen attention. **The checklist note was wrong**: the branch's LTX
      graphs had NO `ModelAttentionBackend` (only the H3 pair did). Node 641 is in both
      runtimes now
- [x] `node_lock`: LanPaint added, 16 packs. NOT ChatterBox, audio-separation,
      MelodramaBox, SplatKit, Mickmumpitz
- [x] Confirm no Flow deps came across — grep for `chatterbox-`, `dramabox-`,
      `minimax-music3-`, `stable-audio-` in `js/data/modelConstants/` returns nothing
- [x] `npm test` **659/659** (644 + 15 new) · `release:deps` **259/259** · eslint clean ·
      smoke runner `--self-check` OK
- [x] Rode along, both deliberate: **MPI-619** (Klein 4B/9B carry their size in the name —
      without it 9B ships under a shared name and the L/B letter, which is how a 9B style
      LoRA got picked for a 4B run) and **`c4208de8`** (the pod-lock gate stops demanding a
      rebuild for `installRequirements:false` nodes — without it the Phase 3 smoke refuses
      over LanPaint)

## Phase 2b — live findings + the master fix sweep (2026-09-07 PM)
- [x] **`24d4905f` — DEV Pod image was still v0.21.0-dev = ComfyUI 0.31.0.** Caught live on
      Fabio's 5090 run: `Node 'ModelAttentionBackend' not found`. It is a CORE node absent
      from 0.31.0, so all four graphs carrying it ran locally and rejected on the Pod.
      Ported `d3a10f15` + `ced5253f` → v0.23.0-dev. Confirmed in his Pod log. The network
      volume is NOT the cause and reusing it is right — core ships in the IMAGE, only
      weights and code-only nodes live on the volume.
- [x] **RELEASE BLOCKER CLEARED** - the stable Pod image was `v0.21.0` (ComfyUI 0.31.0)
      while 1.5.0 ships graphs carrying `ModelAttentionBackend`, a CORE node absent from
      0.31.0. `_devMode` is false in every released portable, so a 1.5.0 user would have
      hit the exact rejection Fabio hit live. Rebuilt at 0.34.0, BOTH legs in one dispatch
      (CI 34163882224); pins bumped v0.21.0 -> v0.23.0 in `18a9b921`.
      **No prep was needed and that was measured, not assumed:** mpi-ci HEAD `b3d2434`
      was already the right context - core `v0.34.0`/`12d52794`, python_deps 125/125
      covered by the image 150, every baked pack commit-identical - and it is the exact
      tree the proven `v0.23.0-dev` tag was built from.
      **The plan's "rebuild BEFORE the smoke" reasoning was WRONG** and is corrected in
      plan.md: the smoke runs the app from source, so `_devMode` is true and it resolves
      `POD_IMAGE_VERSION_DEV` - it can never exercise the stable tag by ordering alone.
      **Verifying a pushed tag: do NOT use an anonymous GHCR pull probe.** It 404s the
      production `v0.21.0-cpu` too. Use `gh api user/packages/container/cubric-vision-pod`
      (visibility) and `.../versions` (tag list).
- [x] `f8a3096e` — twelve master fixes swept in, none touching `node_lock`, a graph or a
      dep set, so smoke evidence stays valid: MPI-576 (the toast storm Fabio hit),
      MPI-637 + MPI-651 (console windows), MPI-655, MPI-654, MPI-657, MPI-650,
      MPI-670 ×2, MPI-660 ×2, MPI-523, MPI-570, MPI-597
- [ ] **MPI-556 owed** — the sidecar recording the run's controls rather than the
      project's. Fix is wanted; its test loads MpiButton, which imports
      `/js/utils/icons.js` root-absolute and resolves to `C:\js\...` under this line's
      harness. Port it WITH a working check, never with the check disabled.
- [x] **RAM floor DECIDED on real stock → 56** (`4fb37af2`). At 64 there was NO 5090
      available at all; a host advertising 60 delivers 55.88 GiB, and 20 consecutive H3
      runs passed on it — ref2va + fl2va, 1344x768 / 768x768 / 768x1344 at 5s, 2K and 4K
      at 3s turbo, medium quality, cold and warm, t2v on both. No OOM. The plan's premise
      ("5090s come at 54 or 90, nothing between") was wrong — a 60 tier exists.
      **The caveat is now IN the code comment, deliberately, for the smoke agent:** those
      runs were on a 5090 (32GB VRAM); the box measured to die was an L4 (24GB), and that
      8GB decides how much of the ~45GB staging pair spills to system RAM. So 56 does not
      generalise to a smaller card — `gpuTypeId` is the protection there, not this number.
      **H3 DOES run on an L4, just not on the first try. One OOM in an L4 smoke is NOT a
      release blocker and must not be reported as one** (Fabio, 2026-09-07).
- [x] **Master fix sweep is EXHAUSTED — measured, not assumed.** Of 849 master-only
      commits, only 8 `fix`/`perf` touch no `node_lock`/graph/dep-set AND touch only files
      that exist on this line; the other 73 are Flow/2.0 work that cannot come across.
      Of those 8: `c4208de8` already ported, `15143dcc` + `3f9966c8` are Flow-only,
      `fa5f6cd5` is kanban files, and `c965daf6` + `19ec5c65` (H3 tier ladder) are
      SUPERSEDED by this line's own MPI-704 re-tier — porting them would fight it.
      One genuinely applied and is in: `5c6d160d` (`510bf1b3`).
      Not ported, on purpose: MPI-504's FLUX 8:5 fix (1280x768 → 1280x800). Real
      correctness bug, but it changes the canvas a saved selection reopens at, and this
      release already ships one such change (the tier rename). Goes to 2.0.
- [ ] **Reuse-chip bugs — DEFERRED by Fabio (2026-09-07), not fixed.** Two, both real,
      both on master too (nothing to port — MPI-555's `a47a318f`/`8a40dd57` are already on
      this line, and no master-only commit touches the reuse path except MPI-556).
      (1) CONFIRMED: `clearMedia()` sits inside `if (_wantImages || _wantVideo ||
      _wantAudio)` at `MpiGalleryBlock.js:1187` and its twin, so reusing a card with no
      media skips the clear and stale chips ride into the next Cue. Verified against real
      data — `ref2v_ms_001/002/005/006` carry 0 image mediaItems. MPI-555's surviving fix
      can't catch it: `setOperation` only drops chips the new op has NO slot for, and
      `ref2v_ms` declares nine. One-line fix, both blocks.
      (2) NOT root-caused: a card WITH a reference image injects no chip and fires no
      toast, though the sidecar is healthy (`role=inputImage`, `status=available`, file
      present in `.preview-assets`). Both toast paths would have fired, so it needs the
      live `includes` value. The playwright probe was blocked by the auto-mode classifier.

- [x] **Two blockers found by accident, both would have shipped.**
      (1) `getFilePrefix` was imported by `generationService.js` and never exported by
      `commandRegistry.js` - broken since the `f8a3096e` sweep, which ported MPI-660's
      consumer without its producer. **The app did not boot**: the renderer threw
      SyntaxError and died, leaving a landing page whose spinner never resolved. It hid
      for hours because a RUNNING renderer already holds its modules, so only the next
      restart pays - and a shipped 1.5.0 would have failed on first launch for every
      user. Neither `npm test` (never loads the renderer graph) nor eslint (does not
      resolve cross-module exports) could see it. Fixed + gated in `5b607418` by
      `tests/named-imports-resolve.test.cjs`: ~1300 named imports checked in ~290ms,
      negative-controlled.
      (2) The smoke runner died on the FIRST create refusal whenever the caller passed no
      `nextGpu` - which the CPU download Pod always does - so a capacity blip aborted a
      37-op run and the `attempt 1/3` banner was a lie on that path. Fixed `3d1126f9`.
- [x] **Two GPU Pods were leaked, and the teardown ordering is fixed** (`4ba6241c`). The
      runner asked "Delete the volume? [y/N]" and deleted the Pod on the NEXT line, so a
      headless run - the documented way to run it - stopped at the prompt and never
      deleted the Pod, while still exiting 0. Fabio found them on RunPod. The Pod now
      dies FIRST, and a no-TTY run keeps the volume with a printed note.
      **The 340GB `cubric-smoke` volume is now DISPOSABLE** (Fabio, 2026-09-08, reversing
      the old never-delete rule): he rebuilds an 80GB one when filming.
## Phase 3 — the gates
- [x] Release notes rewritten — `f9566b6f`. "10 GB less" deleted, 62 → 64, and the new
      bullets Gate 0'd against v1.4.4 one by one: Klein 9B, inpaint on SDXL/Krea 2, the
      tier RENAME (Important change — a saved project reopens at a different canvas),
      faster long LTX clips, uninstall, video posters, the LTX preview flash, the
      remote-download trio. Still marked *agent draft, NOT approved copy*.
      **The R2-hosting half was FALSE and is now true.** The handoff said to keep it as
      "still true and verified" — it was not: MPI-653 moved the encoder to R2 on MASTER
      only, and Phase 1's revert restored the ethanfel HuggingFace url with no mirror,
      byte-identical to v1.4.4. Ported `9d724386`'s dep half (R2 primary, HF fallback,
      0.66 MB/s → 35.7-37.4 MB/s) so the sentence describes what ships. `release:deps`
      is 260/260
- [x] Fabio's own H3 tests on the 5090, **app launched from the worktree**
- [x] Full smoke on 0.34 from the branch, Klein 9B included - 44 ops, 0 FAIL (9a978c56)
- [x] `npm run release:check` green
- [x] Stamp 1.4.4 → 1.5.0 - `aa57e379`. Notes APPROVED by Fabio, token `a8691834`.
- [x] Tag `v1.5.0` -> `a8691834`, portable built (CI 34168398093 at ref=v1.5.0), all six
      artifacts downloaded to `D:/CubricStudio/Vision/Builds/v1.5.0/`. A duplicate build
      was cancelled: the tag push fires the Vision repo’s own dispatcher, so a manual
      mpi-ci dispatch is redundant.
- [x] **DRAFT the GitHub release** - created 2026-09-08, 6 assets, `isDraft: true`,
      target pinned to `a8691834`. Body gained the mandatory `## First launch` block
      (checklist says it must appear in EVERY body; it was missing) and the opening line
      is now "Klein 9B" per Fabio. Gate 2 still HIS - he reads it in the draft.
      Evidence + URL: `validation.md`.
- [x] **Install the built Windows portable on Fabio's box and test LOCALLY - PASSED.**
      Extract, launch, version, artifact provenance (`BUILD_HASH` == tag), engine in-place
      0.29.2 -> 0.34.0 with HEAD == the pin, 16 node packs 0 IMPORT FAILED, ComfyUI
      0.34.0 serving, floor check 42 workflows / 194 class_types / 0 missing, and a
      **generate smoke whose PIXELS were opened and checked** - `sdxl-realistic` t2i,
      768x1024 in 72.5s, a coherent photograph, landed as a real card with sidecar and
      thumbnail. Instance torn down, no orphans. Full evidence: `validation.md`.
      Untested here and stated as such: SAC is OFF on this box and the exe has no MOTW;
      `git` is on PATH so the git-less path never ran; GPU is a 4060 Ti, not the 5090.
- [x] **PUBLISHED 2026-09-08 09:03:51Z** —
      https://github.com/MadPonyInteractive/Cubric-Vision/releases/tag/v1.5.0
      Reachability check green: `releases/latest` reports `v1.5.0` / `draft: false` /
      `prerelease: false`. The update prompt was OBSERVED firing on a real 1.4.0 install
      (`update available: v1.4.0 -> v1.5.0, prompting`); Update was NOT pressed, so the
      in-place apply + relaunch leg is still unobserved.
- [x] Post-publish: `release-baselines/*.json` restamped 1.4.4 -> 1.5.0 on BOTH branches
      from the published full builds; maintenance branch `1.5.0` cut at `v1.5.0`, pushed.
- [x] The boilerplate that produced the false Linux/macOS claims is fixed AT SOURCE:
      `docs/releases/github-release-checklist.md` § Platform Disclosure is a RULE now, the
      Contributor Validation Request section is deleted, and the two mpi-release pointers
      say "follow the rule" not "include the block". Both branches.
- [x] Push the branch (5 commits unpushed as of 2026-09-07)
