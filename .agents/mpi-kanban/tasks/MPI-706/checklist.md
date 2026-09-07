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

## Phase 2 — non-Flow image models (Fabio: "B", 2026-09-07)
- [ ] MPI-615 — SDXL family + Krea 2 inpaint, LTX stage 2. 12 graph files clean;
      hand-merge `models.js`, `commandRegistry.js`, krea2 README
- [ ] MPI-598 — Klein 9B ships (new model: weights, deps, LoRA rack)
- [ ] MPI-609 — Klein style LoRA renames
- [ ] MPI-575 — LTX preview junk frames
- [ ] MPI-605 — LTX comfy kitchen attention (card still `doing`; node already on branch)
- [ ] `node_lock`: add LanPaint + whatever MPI-598 needs. NOT ChatterBox,
      audio-separation, MelodramaBox, SplatKit, Mickmumpitz
- [ ] Confirm no Flow deps came across (`chatterbox-*`, `dramabox-*`, `minimax-music3-*`,
      `stable-audio-*`)
- [ ] `npm test` + `release:deps` green from the worktree

## Phase 3 — the gates
- [ ] Release notes rewritten (drop "10 GB less"; keep the R2-hosting half; 62 → 64; add
      re-tier, windowed sampler, thumbnails, uninstall, remote-download trio, Phase 2)
- [ ] Fabio's own H3 tests on the 5090, **app launched from the worktree**
- [ ] Full smoke on 0.34 from the branch, Klein 9B included in the matrix
- [ ] `npm run release:check` green
- [ ] Stamp 1.4.4 → 1.5.0 (`/mpi-version-bump`)
- [ ] Build + GitHub release (`/mpi-release`)
- [ ] Push the branch (5 commits unpushed as of 2026-09-07)
