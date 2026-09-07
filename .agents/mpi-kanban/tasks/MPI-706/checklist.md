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
- [ ] **RELEASE BLOCKER — the STABLE image is still `v0.21.0` (ComfyUI 0.31.0).**
      `_devMode` is false in every released portable, so a 1.5.0 user gets a 0.34.0 local
      engine against a 0.31.0 Pod and hits the same rejection. Needs a clean
      release-version rebuild at 0.34.0, BOTH legs (GPU + CPU in lockstep, or CPU download
      Pods 404 at boot and the app blames a bad host). Master carries the same note; this
      is the release that has to act on it. Do it BEFORE the smoke — the smoke should run
      on the image users get.
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
- [ ] Fabio's own H3 tests on the 5090, **app launched from the worktree**
- [ ] Full smoke on 0.34 from the branch, Klein 9B included in the matrix
- [ ] `npm run release:check` green
- [ ] Stamp 1.4.4 → 1.5.0 (`/mpi-version-bump`)
- [ ] Build + GitHub release (`/mpi-release`)
- [ ] Push the branch (5 commits unpushed as of 2026-09-07)
