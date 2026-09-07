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
