# MPI-706 — 1.5.0 release umbrella

## Current State

1.5.0 is **built and pushed through Phase 2**. It lives on branch `1.4.2`, worktree
`C:/AI/Mpi/Cubric-Vision-1.4.x`, now at `2603f668`. Version is still stamped **1.4.4** —
the 1.5.0 stamp is deliberately the LAST step, after the smoke.

**Read `## The five facts` below before doing anything.** Four of them were rediscovered
the hard way in the 2026-09-07 session because an earlier handoff had lost them.

Next action: **the four gates in `## Phase 3`**, in this order — release notes, then
Fabio's own 5090 H3 runs (app launched FROM THE WORKTREE), then the full 0.34 smoke with
Klein 9B in the matrix, then stamp and release. Nothing in Phase 2 remains.

## The five facts

1. **1.5.0 IS NOT A MASTER CUT.** It is branched from the last released tag as a
   deliberate deviation from the 2.0 roadmap, so users get faster/better H3 without
   waiting for 2.0. Master is untouched and stays on the 2.0 road — Flows are its
   headline and `navigation.js:74` confirms the Flow Library is **no longer dev-gated**,
   so master cannot ship with Flows hidden. Assuming a master cut is what made this
   argument reopen five times; it is now in
   `~/.claude/projects/C--AI-Mpi-Cubric-Vision/memory/project_release_model_github_only.md`.
2. **The low tier is OUT** (Fabio, 2026-09-06). Every handoff before that says the low
   tier is the road to 1.5.0. Superseded. Do not start it.
3. **The NVFP4 text encoder is DROPPED** (Fabio, 2026-09-07). MPI-698 is closed
   `rejected`, the R2 object is deleted (verified 404), and the branch has been reverted
   to the int8_convrot Heretic build. It was rejected on ~10 generations of entity
   duplication, not on speed.
4. **Master is a SUPERSET of the 1.4.x line.** All four hotfix cards (MPI-673, 674, 675,
   685) have commits on master. Nothing needs back-merging.
5. **After 1.5.0 the next release is 2.0**, with Flows and whatever else has accumulated
   (Fabio, 2026-09-07). MPI-595 is that umbrella; it does NOT gate this one.

## Completed

### Phase 0 — master-side cleanup (on `master`)
- `da89739e` MPI-698 closed `rejected`. R2 object deleted and verified (404 on the
  dropped weight, 200 on the live Heretic one). Dep entry KEPT but stripped of
  `url`/`mirrorUrl` — `_orphanedDepIds` keys off `filename` so the sweep still reclaims
  the 14.61GB, while `check-dep-urls.mjs:52` skips a dep with no `url` so the deleted
  object cannot redden `release:deps`. Both URLs preserved as comment text.
- `90687ead` Board validation repaired — 5 malformed event lines (MPI-704 ×4, MPI-699
  ×1) written without `schema` and keying the card as `task` rather than `id`;
  `validate_board.py --fix` cannot repair that class. Plus a stale state record.

### Phase 1 — the H3 cut (on `1.4.2`)
- `efdc2766` MPI-698 revert + MPI-703 pin + MPI-699 sampler + MPI-704 re-tier.
  The branch had NVFP4 as the LIVE encoder while master had reverted — as built, 1.5.0
  would have shipped the rejected encoder. The four H3 graph files were taken from master
  wholesale after checking the class_type delta was exactly one node
  (`MpiWindowedSampler`, supplied by the MPI-703 pin) and nothing else.
- `0b212534` MPI-682 uninstall fix + MPI-689 **cheap half only** — see `## Decisions`.
- `dee5445c` MPI-667 + MPI-690/691 remote download. 667 was not requested but is what
  makes 690/691 apply: it creates the `remotePodLifecycle.js` context the hunk expects.
- `365476d7` Pod RAM floor → **64** (Fabio's number, see `## Decisions`).

State: **644/644 tests**, **236/236 dep URLs reachable**, 5 commits unpushed.

### Phase 2 — the non-Flow image-model port (Fabio, 2026-09-07: "B")
`2603f668`, pushed. Five cards in one commit: MPI-598 (Klein 9B — new model, 9 display
webps, `klein_9b_t2i.json`, the seven-slot style rack), MPI-615 (SDXL/Illustrious/Pony/
Krea 2 inpaint on the LanPaint path + `krea2Turbo` on the op), MPI-609 (style LoRAs named
for their labels), MPI-575 (LTX preview ring, non-Flow half) and MPI-605 (both LTX
runtimes take `ModelAttentionBackend`). LanPaint added to `node_lock` — 16 packs.

**659/659 tests, 259/259 dep URLs, eslint clean, smoke `--self-check` OK.**

**Method that worked, and is worth repeating for any later port.** Classify each file by
its whole history since the merge-base: a file touched ONLY by the cards being ported was
`cp`'d from master's working tree (bytes intact, CRLF/LF preserved — 38 files); everything
shared with out-of-scope work went through `git apply --3way` per commit, in master's own
order. The mixed set is exactly the registries the Flow work also lives in — `models.js`,
`assetDeps.js`, `loraDeps.js`, `commandRegistry.js` — which is why a wholesale copy of any
of them would have dragged Flows across.

Two things rode along, both deliberate and both recorded in `## Plan Drift`: **MPI-619**
and **`c4208de8`**.

Not ported: MPI-575's `flow_ltx_extend`/`flow_ltx_foley` half (absent here) and MPI-603's
outpaint-LoRA retirement (4B keeps its LoRA on this line — the Character Sheet Flow that
blocks the retirement does not exist here). `docs/models/klein/9b.md` was corrected on both
points rather than shipped with master's claims.

## Remaining Work

### Phase 3 — the four gates
1. **Release notes.** Drafted in `docs/releases/UNRELEASED.md` on the branch, still marked
   *"agent draft, NOT approved copy — Fabio rewrites this before it ships."*
   Corrections owed: drop **"downloads about 10 GB less"** (that was the NVFP4 saving,
   now moot — but KEEP the "from our own servers rather than HuggingFace" half, which is
   still true and verified); change **"at least 62 GB"** to **64**; ADD the quality-tier
   re-tier, the windowed sampler, the gallery video thumbnails, the uninstall fix, the
   remote-download trio, and everything Phase 2 brings.
2. **Full smoke on 0.34, run FROM THE BRANCH.** See `## Decisions` for why master's
   smoke does not substitute.
3. **Stamp 1.4.4 → 1.5.0** (`/mpi-version-bump`).
4. **Build + GitHub release** (`/mpi-release`).

## Decisions

- **MPI-689 shipped as its cheap half, deliberately.** Master's fix puts video posters on
  MPI-633's rendition ladder (small + 1280 hover proxy); that ladder is not on this branch
  and porting it means 18 files, ~1200 lines, a 270-line rewrite of `routes/projects.js`,
  conflicting in four places. What shipped instead: the branch had video posters at 256px
  while image thumbs were 512, which is exactly why videos read soft beside images — both
  are 512 now. The full ladder goes to 2.0.
- **RAM floor is 64, not master's 80** (Fabio, 2026-09-07). The generic worry behind 80 is
  that RunPod filters on an ADVERTISED figure higher than the container receives (an L4
  advertised 62, delivered 54, and OOM-killed H3 with `code -9`). In this datacentre that
  middle host does not exist: RTX 5090 machines come at 54 or 90 and nothing between, so
  64 excludes the 54 and lands the 90 — what 80 achieves, without refusing 64-80 hosts
  that run H3 fine. Residual risk is recorded in `storage.js`: if a host advertising 64-70
  ever appears, raise the number.
- **The floor was 62 and that was a real defect**, caught by re-reading the drafted notes
  against the reverted encoder. 62 was calibrated for NVFP4's ~35GB staging pair; with
  Heretic back the pair is ~45GB, so 62 would have kept placing users on the box measured
  to die.
- **MASTER'S SMOKE DOES NOT SUBSTITUTE, and the reason is not what it looks like.** The
  premise "the only difference is Flows" is false: **23 shipped workflow files differ**
  between master and this branch, and five of the twelve smoke-set models ship a different
  graph here. The differences are structural — master's `t2i_sdxl_nsfw.json` carries seven
  node types the branch's does not (`LanPaint_KSampler`, `LanPaint_ImageEncode/Decode`,
  `InpaintCropImproved`, `InpaintStitchImproved`, `MpiLatentUpscale`,
  `MpiMaskSquareBbox`). Master's smoke proves master's graphs run on 0.34.0; it says
  nothing about the older graphs this branch ships. That is exactly MPI-465.
  **Phase 2 does not fix this** — it moves the branch's graphs toward master's, but the
  port itself then becomes the thing needing execution, and `release:check` anchors
  evidence freshness to `node_lock`'s commit time, which Phase 2 moves again.
- **The branch's own smoke evidence is `0.31.0`, 35/35, 2026-08-10.** The 37/37 at 0.34.0
  file is MASTER's. Do not confuse them — an earlier read in that session did.

## Plan Drift

- **2026-09-07 (Phase 2):** two commits outside the five-card list were ported, each because
  leaving it out would have shipped a defect rather than saved scope.
  **MPI-619** (`dbf00cf4`, two string literals) — both Klein cards were named "FLUX.2
  Klein", so the app told them apart with an L/B size letter, and that is exactly how a 9B
  style LoRA got picked for a 4B run (MPI-614). 9B reaches a user for the first time in
  1.5.0, so shipping the shared name would ship that bug on its debut.
  **`c4208de8`** (the pod-lock gate) — `checkPodLock` compared the two node locks wholesale
  and hard-blocked on any difference. LanPaint is `installRequirements: false`, a pack the
  Dockerfile never bakes, so without this fix the Phase 3 smoke refuses to start over a
  node that cannot affect the image. THIS branch's newer python_deps check (coverage, not
  equality — MPI-698) was kept over master's older byte-compare.
- **2026-09-07 (Phase 2):** the Phase 2 table said MPI-605's node was "ALREADY on the
  branch". It was not — only the two H3 graphs carried `ModelAttentionBackend`; both LTX
  runtimes had zero. Ported for real.
- **2026-09-07 (board):** the `doing` column was 14 cards and is now 9. Fabio's rule —
  only Flow work, or work meant to become a Flow, stays ongoing. MPI-605, MPI-662, MPI-687
  and MPI-500 closed `complete` on their commits (each gained a `validation.md` written
  from those commits); MPI-367 went back to `todo`, unstarted rather than done. MPI-678 is
  the one non-Flow card left in `doing`, and only because it has uncommitted work in the
  master tree.
- **2026-09-07:** scope widened from "H3 + small fixes" to include the non-Flow
  image-model work and Klein 9B, at Fabio's request ("B"). He accepted that this may mean
  a larger smoke, including adding Klein 9B to the matrix. Klein 9B shipped to master
  2026-08-27 but master has not been released since v1.4.2 (2026-08-15), so **no user has
  ever seen it** — it is genuinely new in 1.5.0.
- **2026-09-07:** the handoff that opened that session (`b36b3674`) framed 1.5.0 as a
  master version bump and had lost the entire 1.4.x branch, the built release, and the
  drafted notes. Recovered by grepping the handoff directory. If a handoff ever again
  describes 1.5.0 as a master stamp, it is wrong — check `git worktree list`.

## Verification

**Verify mode:** auto for the ports (tests + `release:deps`), **user-ux** for anything
touching output quality — Fabio judges H3 clips himself, on his own 5090.

- `npm test` from the worktree
- `npm run release:deps` from the worktree
- `npm run release:check` — the release gate; needs fresh smoke evidence at 0.34.0
- The smoke: from the worktree, delete its stale `dev_configs/smoke-evidence.json` first
  (it records 0.31.0 and the runner refuses to merge a scoped run across engines)

## Coordination notes

- **The app on :3000 is a shared, single-slot resource.** The smoke runner drives it, and
  ends by deleting the active Pod — so it cannot overlap with Fabio's own generations or
  with another agent's. Order agreed 2026-09-07: whoever is generating finishes → Fabio
  runs **the branch app, launched from `C:/AI/Mpi/Cubric-Vision-1.4.x`** for his 5090 H3
  tests (launching from master would test master, not the cut) → then the smoke.
- `guard-gpu` blocks `smoke-workflows.mjs` unless wrapped in `gpu_lease.py run --`, except
  for `--plan` and `--self-check`. Run it as a BACKGROUND Bash call so waiting is free.
