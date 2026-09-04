# MPI-687 checklist

- [x] Read the sibling procedure — `.claude/skills/mpi-node/SKILL.md` routes new-node to
      `.claude/commands/new-node.md` (the skill is newer than the command file and is the
      entry point; the command file remains the source of truth for the steps)
- [x] Drift check on `ComfyUi-MpiNodes`: working tree clean, HEAD 9 commits AHEAD of
      `origin/main`, app pin at `origin/main` (`ccc25d1`)
- [x] Stale claim on `h3.py` superseded — owner session `ef56856f` (MPI-591) is
      `"status": "closed"`, heartbeat 2026-08-31
- [x] `MpiH3ImageToVideo` added to `h3.py`, beside `MpiH3References` whose pattern it mirrors
- [x] Registered in `__init__.py` — import, `NODE_CLASS_MAPPINGS`, `NODE_DISPLAY_NAME_MAPPINGS`
- [x] `README.md` row added
- [x] `changelog.md` bullet added under the bottom-most version header (no version bump —
      that is `/release`)
- [x] Smoke-tested offline: registration, input/output shape, delegation kwargs checked
      against core's real signature, blank detection on all three cases
- [x] Committed in the node repo — `39c31ca`, explicit pathspec
- [ ] **Pushed** — deliberately not done, release pending (user, 2026-09-04)
- [ ] **Pin moved** in `dev_configs/node_lock.json` — blocked on the push
- [ ] Workflow rewired to drop the boolean lattice — user
- [ ] Second conditioning at upscaled dims wired for the latent-upscaler refine — user

No `class_type` was removed or renamed, so no `comfy_workflows/` grep was required.

## Bench tuning (rides on this card, 2026-09-04)

- [x] r2va non-turbo arm run and measured — `AnimateDiff_00046`, single-variable vs
      `00042` (only `444` differs). Evidence in `validation.md`
- [x] User verdict on 00046: ships. Background better, footstep is a bare foot not a heel
- [x] EasyCache traced: non-turbo branch ONLY, by construction (`519 -> 520 -> 523`;
      turbo `519 -> 521` direct). 8/25 stage 1, 0/3 refine
- [x] fl2va bench template verified CURRENT against render `00029` — identical on every
      settled value, and already minus the two dangling `VHS_VideoCombine` (521, 522).
      Port source is clean
- [x] Two 8-step LoRAs + the latent-upscaler weight uploaded to R2, all three HTTP 200 at
      the exact byte count. Every hash verified against the HF LFS oid BEFORE upload, so
      R2 / mirror / bench are provably the same bytes
- [x] Deps wired: `loraDeps.js` (2 new, 4-step entries KEPT for the orphan sweep),
      `assetDeps.js` (upscaler weight), `nodesDeps.js` + `node_lock.json`
      (`Comfyui_Minimax_h3_latent_Upscaler` @ `d7c01b9`), `models.js` (both H3 models)
- [x] `node scripts/check-dep-urls.mjs` — all 299 URLs reachable; no dangling dep ids
- [x] MpiNodes 1.2.9 committed locally (`e00086a`): README synced, changelog header
      appended, `pyproject.toml` bumped. **Push held** — it triggers the public registry
      publish
- [x] MpiNodes 1.2.9 PUSHED and published — Action `33909777481` success, registry PUT
      HTTP 200. Pin moved to `e00086a92720cc5e7bbc70cac371ae7325b8b086`
- [x] "Reference detail" (`refImageSize`) radio REMOVED — `PromptBoxControls.js`,
      `commandRegistry.js` components list, `promptControlDefaults.js`,
      `docs/models/h3/ref2va.md`. Historical release notes deliberately untouched
- [x] `flow_h3_extend.json` (+ raw) swapped to the 8-step ref2v LoRA. Caught by
      `tests/flow-model-choice.test.cjs` — the flow was loading a weight that is no longer
      a dependency of `minimax-h3-ref2va`, so a fresh install would never download it.
      **NOT re-judged on the 8-step**; the two-pass sweep of the H3 flows is MPI-688
- [x] `npm test` — 883 pass, 0 fail. `eslint` clean on the three edited JS files
- [ ] Port fl2va into `comfy_workflows/` (+ `raw/` template)
- [ ] Port r2va
- [ ] Fix shipped EasyCache -> `ModelAttentionBackend` link (fl2va 321, r2va 456,
      flow_h3_extend 909 — all three read the pre-attention model)
- [ ] Stage-1 preview audio nodes
