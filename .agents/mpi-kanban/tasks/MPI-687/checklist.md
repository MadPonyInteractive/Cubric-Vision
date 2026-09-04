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
- [x] BOTH H3 runtimes rebuilt via `sync-raw-workflows.mjs` against 48188 (NOT the bench —
      the engine's schema is the one the graph must satisfy). `minimax_h3_fl2va.json`
      66 nodes / 2 `MpiH3ImageToVideo`; `minimax_h3_r2va.json` 84 nodes / 2 `MpiH3References`
- [x] Refine reference encoder retitled `Refine_Refs` — two nodes titled `Input_Refs` is an
      injection-rule violation, and it would have overwritten the refine's baked `max`
- [x] `generate_h3.py` updated for the new shape: dropped the `Input_Single_Pass` bake
      (node deleted by the rebuild), fl2va branch class → `MpiH3ImageToVideo`, both
      variants `branch_count` 1→2, core's `MiniMaxH3ImageToVideo` named explicitly in the
      forbidden set so the half-converted-graph check still fires
- [x] VERIFIED AGAINST GROUND TRUTH, not the converter's own `OK`: shipped r2va diffed
      node-by-node against `AnimateDiff_00046`'s embedded prompt. All three SigmaShifts
      (4.0/2.0/0.5), the 3-step sigmas, both encoders' match/max, EasyCache,
      ModelAttentionBackend and both IfElse arms byte-identical. Only the LoRA subfolder
      differs — the user's own move into `loras/minimax-h3/`
- [x] EasyCache→attention is correct in the rebuilt graphs (came in from the bench, so the
      old shipped bug is gone rather than separately patched)
- [x] App engine sees all three new weights and both new node classes — nothing to download
- [x] Stage-1 preview audio SHIPS — `VAEDecodeAudio` off `MpiStageLatents` output 1
      (`denoised`) into `Output_Preview`, `use_audio` true, on both graphs. The first
      re-export had the nodes connected but the flag false: connected-but-inert, the run
      costs the same and the preview is silent. Nothing in the app injects `use_audio`,
      so it is set in the RAW source (the authoring truth) with the generator bake kept
      only as a safety net
- [x] Message sent to MPI-591 about the `flow_h3_extend` LoRA swap —
      `state/messages/9e108c32-…json`
- [ ] **USER TEST**: run fl2va and r2va in the app
- [ ] `Refine_Refs` needs doing ONCE in the bench graph — a title cannot be baked (the
      injection gate keys on it), so every re-export from an unrenamed bench re-breaks it.
      It has now been re-applied to raw twice

- [x] **BUG 2 FIXED** — `MpiH3ImageToVideo` cover-crops BOTH keyframes to the canvas
      before delegating (`ComfyUi-MpiNodes/h3.py`, `_cover_crop`). Crop, never pad, on the
      user's call. MpiNodes 1.2.10 pushed (`8505769`), Action 33916139497 success, registry
      PUT HTTP 200, pin moved in `dev_configs/node_lock.json`. r2va needed no change
- [x] **BUG 1's OPEN QUESTION ANSWERED, and it was not `adapt_canvas`** — the two-pass
      halving node was `floor(a / 64) * 32`, so the final output was always
      `floor(target / 64) * 64` and every canvas not divisible by 64 lost 32px. That is the
      1376 -> 1344, AND the 448x448 the 1:1 request came back as. Six of the 21 dimensions
      in `MINIMAX_H3_RATIOS` were affected, `low` (the default tier) on every axis. Fixed to
      `floor(a / 32) * 16` in both raw templates, both runtimes rebuilt
- [x] `very_high` and `2k` were NOT silently clamped — every dimension in both is /64, so
      they always came out at the labelled size. `2k`/`4k` likewise. The mis-sized six were
      `very_low` 352/608, `low` 480/864, `medium` 1376, `very_high` 800
- [ ] **USER TEST of the crop**: restart the app so the engine installs MpiNodes 1.2.10
      (a `custom_nodes` dep installs at BOOT), then feed fl2va a 9:16 image on a 1:1 canvas
- [ ] **USER TEST of the sizing**: any `low` or `very_low` tier run — the card's dimensions
      must now match the status bar instead of coming back 32px short
