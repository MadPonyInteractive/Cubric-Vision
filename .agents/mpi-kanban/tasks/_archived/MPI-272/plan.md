# Media-load system migration — path-into-string cleanup

Migrate the app off the OLD media-loading system (ComfyUI input slots +
`placeholder.png` / `ltx_silence.wav` staging + `_uploadImage` upload-name
branch) onto the NEW path-into-string system that the workflows already use.

## Current State

**Project mode:** `scalable-foundation` — full guardrails, no prototype shortcuts.

**The migration is already half-done, on the workflow side and partially in the injector:**

- All workflow templates + runtime files now use path-into-string media nodes:
  `MpiLoadImageFromPath`, `MpiLoadAudio`, `MpiLoadVideo`, or a plain `MpiString`
  feeding an `MpiLoad*`. Every media input is titled `Input_*` and takes its full
  file PATH in a single `string` widget. Nodes **self-gate** on empty string — no
  placeholder needed.
- `comfyController.js` ALREADY has the new path (`imagepath` kind, lines 1100–1126):
  a node titled like the param whose `class_type === 'MpiLoadImageFromPath'` is
  routed through `_resolveMediaPath` (local) / `_uploadRemoteMedia` (Pod), same as
  video/audio. **This branch works end-to-end for local AND remote today.**

**What remains OLD and must go (except latents):**

1. **Injector — image/mask upload branch** (`comfyController.js` 1129–1173):
   `image`/`mask` kinds still upload to ComfyUI `input/` via `_uploadImage` and
   inject a basename. Must move to the `imagepath` path-resolve branch.
   **CRITICAL:** this branch holds the reuse-404 soft-error (`input_asset_deleted`,
   1162–1170) — that error handling MUST be carried to the imagepath branch or
   reuse-prompt loses its user-facing "assets no longer exist" toast.
2. **Placeholder/silence staging** (`routes/comfy.js` 46–67, 210–250;
   `commandExecutor.js` 96–130): `WORKFLOW_INPUT_DEFAULTS` includes
   `placeholder.png` + `ltx_silence.wav`; `_prepareWorkflowInputs` fires on
   `_MEDIA_INPUT_CLASSES` (`LoadImage`/`LoadImageMask`/`LoadAudio`/`LoadLatent`).
3. **Generator STAMP steps** (`generate_ltx.py` 76–78, `generate_wan.py` 50–51,
   `PLACEHOLDER`/silence consts in generate_chroma/krea2/sdxl/wan5b): stamp
   `placeholder.png`/`ltx_silence.wav` into old `image`/`audio` inputs — these
   FAIL on `MpiLoadImageFromPath` (no `image` input; got `['channel','string']`).
   This is what blocks a clean `orchestrate.py` run.
4. **Placeholder source files** in `comfy_workflows/input/`.
5. **Injection-rules docs** (`.claude/rules/comfy_injection.md`,
   `docs/workflow-authoring/`) still describe the old slot/placeholder contract.

**KEEP — latents (no path-string node exists):**
`.latent` files (`ComfyUI_00001_.latent`, `ltx_video_latent_00001_.latent`,
`ltx_audio_latent_00001_.latent`) still stage into ComfyUI `input/` because
`LoadLatent` reads from there and has no path-string variant. Keep
`WORKFLOW_INPUT_DEFAULTS` (latents only), `_prepareWorkflowInputs`,
`_MEDIA_INPUT_CLASSES` (latents only), `stage-preview-latent`, and the
`Input_*_Latent` param wiring UNTOUCHED.

**Path source law:** every injected path comes from the PROJECT FOLDER (gallery or
`.preview-assets` via `/project-file?path=`), never a raw filesystem path — reuse-prompt
resolves against the project store and fails hard otherwise. `_resolveMediaPath`
already decodes `/project-file?path=` → local path; keep it.

**Side tooling built this session (finish + wire in, lower priority than the cleanup):**
`scripts/workflow-to-api.mjs` (LiteGraph→API converter, verified on 4 workflows)
and `scripts/sync-raw-workflows.mjs` (convert `raw/` → API → orchestrate → commit,
with a dirty-tree guard). Reference from the add-model + add-app playbooks.

**Open risk / constraint:**
- `MpiLoadImageFromPath` self-gates but ComfyUI still *validates* nodes behind a
  gate. Confirm on a live run that a t2v gen (no start frame) no longer needs a
  staged placeholder — the whole premise. This is the first verify.
- Removing placeholder staging must not break the LATENT staging that shares the
  same route + class-set. Scope every edit to placeholder/silence only.

## Completed

- [x] **Phase 1 (generators)** — committed `bde02016`. All 7 `generate_*.py` no
  longer stamp `placeholder.png`/`ltx_silence.wav`; `orchestrate.py --all` runs
  clean (0 STAMP/FAIL); regenerated runtime files now match the migrated templates
  (the committed runtime in `3cec75ef` was stale/pre-migration — orchestrate healed
  it: `LoadImage`+`ImageResizeKJv2` → `MpiLoadImageFromPath`+`MpiCrop`). Workflows
  committed with the user first (`3cec75ef`).

### DRIFT — two runtime workflows still on OLD `LoadImage` (plan assumed all migrated)

`comfy_workflows/App_sdxl_regen.json` (Image Regen app, node 1571) and
`comfy_workflows/remove_background.json` still carry `LoadImage` + `image:"placeholder.png"`.
Neither is orchestrated (no template/generator), neither was in the user's ~30-file
sweep. **Phase 3 removes the `_uploadImage` upload branch these two depend on** — they
MUST be migrated to `MpiLoadImageFromPath` (via `scripts/workflow-to-api.mjs` from their
`raw/` source, or hand-edit) BEFORE Phase 3 deletes the branch, or i2i on those two
breaks. Decision surfaced to user.

## Remaining Work

Phases are ordered by dependency: generators first (unblocks orchestrate + gives
a clean tree to test the injector against), then backend staging removal, then the
injector rewrite (the risky one), then docs, then the side tooling, then end-to-end
verify. Injector + generators touch disjoint files but the injector's verify needs a
clean generated tree, so generators come first — not a parallel batch.

## Phase 1: Generators — drop placeholder/silence STAMP

- [ ] Remove the STAMP steps + `PLACEHOLDER`/silence constants from every
  `comfy_workflows/scripts/workflow_generation/generate_*.py`
  (ltx 76–78, wan 50–51, chroma/krea2/sdxl/wan5b `PLACEHOLDER`). Leave latent
  staging and every other bake step intact. The new `MpiLoad*FromPath` nodes need
  no stamped default.
  **Verify:** `cd comfy_workflows/scripts/workflow_generation && python orchestrate.py --all`
  runs to completion with **zero** `[STAMP]`/`[FAIL]` lines and regenerates every
  runtime file. Spot-check one LTX runtime file: `Input_Start_Frame` is
  `MpiLoadImageFromPath` with an empty `string`, no placeholder.

### Phase 2 — DONE (`2afe11ea`)

`WORKFLOW_INPUT_DEFAULTS` = latents only; `_MEDIA_INPUT_CLASSES` = `LoadLatent` only.
Grep clean (only the MPI-272 doc-comment mentions the dropped placeholders).

### Phase 3 — CODED, awaiting user live-app verify (NOT committed)

`comfyController.js`: image+mask now flip to `imagepath` when the target is
`MpiLoadImageFromPath` (a detailer mask is that class with `channel:'mask'`); the
unified branch runs `_resolveMediaPath` + remote `_uploadRemoteMedia` for image/
mask/video/audio. Deleted `_uploadImage`. Added `_assertMediaSourceExists` (HEAD on
`/project-file?path=`; 404 → tagged `input_asset_deleted` soft-error) to preserve the
reuse-404 WARNING toast — the old branch got it from the upload 404, the path branch
has no fetch so it needs an explicit existence probe. Injector logic self-checked
(`/tmp/mpi272_injector_check.mjs`, all pass). `_inject` writes the resolved path into
the node's `string` field (present) and skips `image`/`mask` (absent on path nodes).
**USER VERIFY (live app) before commit:** i2i (Input_Image), detailer (Input_Mask,
channel), reuse-prompt on a gallery card, delete a reused card's `.preview-assets`
source → reuse → WARNING toast (not crash dialog), one remote-Pod image gen.

---

## Phase 2: Backend — strip placeholder/silence staging (keep latents)

- [ ] `routes/comfy.js`: drop `placeholder.png` + `ltx_silence.wav` from
  `WORKFLOW_INPUT_DEFAULTS` (61–67); leave the three latents. Update the header
  comment (46–60) to describe latents-only staging. `/comfy/prepare-workflow-inputs`
  (210–250) stays but now only stages latents.
- [ ] `commandExecutor.js`: narrow `_MEDIA_INPUT_CLASSES` (96) to latent classes
  only (`LoadLatent`) so `_prepareWorkflowInputs` (98–130) only fires for latents.
  Drop `LoadImage`/`LoadImageMask`/`LoadAudio` — no workflow uses them now.
  **Verify:** grep shows no `placeholder.png`/`ltx_silence.wav` references remain in
  `routes/` or `js/services/` except the deletion of the input source files (Phase 4).
  A latent-staging `_ms` (stage-2) submit still stages its `.latent` (read the code
  path; confirm the three latent names still flow through prepare-workflow-inputs).

## Phase 3: Injector — image/mask onto the path-resolve branch (RISKY)

- [ ] `comfyController.js`: route `image`/`mask` kinds through the same
  path-resolve branch as `video`/`audio`/`imagepath` (1113–1126) instead of the
  `_uploadImage` upload-name branch (1129–1173). All media nodes now read a full
  path from `string`. Simplest: fold the `image`/`mask` detection so it produces
  `imagepath` kind whenever the target node is a path node (it always is now), then
  delete the dead `_uploadImage` upload branch + `staticName`.
- [ ] Carry the reuse-404 soft-error (`input_asset_deleted`, currently 1162–1170)
  into the path-resolve branch so a deleted `/project-file?path=` source still
  surfaces the WARNING toast, not the bug-reporter dialog. `_resolveMediaPath` /
  `_uploadRemoteMedia` must detect the missing source and throw the tagged error.
- [ ] Remove `_uploadImage` (1519–1545) if no other caller remains (grep first).
  `_uploadRemoteMedia` + `_resolveMediaPath` STAY.
- [ ] Sweep the now-dead old-node sniffing: `mediaParamKinds` slot detection by
  `inputs.image`/`.mask` (1059–1074) is redundant once everything is path-based, but
  the title-regex forced-kind sweep (1084–1088) is the KEEPER that routes `MpiString`
  fan-out nodes — do not remove it. Simplify, don't over-cut; keep mask `channel`
  behavior (detailer masks inject the same as before, just to `string`).
  **Verify (user-ux):** live app. Run i2i (Input_Image), a detailer (Input_Image +
  Input_Mask, mask channel), and reuse-prompt on a real gallery card — each injects
  the project-folder path into the node's `string` and generates. Then delete a
  reused card's `.preview-assets` source and re-run reuse → WARNING toast
  "assets no longer exist", not the crash dialog. Remote (Pod) path: one image gen
  on a connected Pod injects the Pod-absolute path.

### Phase 4 — DONE (this session, awaiting /mpi-end commit)

`git rm comfy_workflows/input/placeholder.png` + `ltx_silence.wav` (3 latents kept).
Docs rewritten to path→string contract: `docs/workflow-authoring/media-inputs.md`
(full rewrite), `.claude/rules/comfy_injection.md` (validation trap → latents-only),
`generator-patterns.md`, `injection.md`, `workflow-authoring/README.md`,
`add-model/README.md` + `01-workflow-split.md`, `docs/models/wan/two-stage-sigmas.md`.
Grep clean: no live placeholder/silence/STAMP refs outside archive/task/historical.

### Phase 5 — DONE (this session)

`sync-raw-workflows.mjs` referenced in `add-model/01-workflow-split.md` §0a and
`add-app/README.md` §0a (raw→API→validate→orchestrate→stage; raw/ user-owned).
Converter verified on LTX + Chroma raw templates (118 / 33 nodes, 0 errors).
No npm alias added (script conventions don't warrant one — node invocation is clear).

## Phase 4: Remove dead placeholder assets + doc rewrite

- [ ] Delete `comfy_workflows/input/placeholder.png` and
  `comfy_workflows/input/ltx_silence.wav` (git rm). Keep the `.latent` sources.
- [ ] Rewrite the media-input contract in `.claude/rules/comfy_injection.md` and
  `docs/workflow-authoring/` (+ `docs/playbooks/add-model/` and `add-app/` where they
  describe placeholder staging / `image` slot injection / the STAMP step): the new
  law is "app writes the full project-folder path into the `Input_*` node's `string`
  widget; nodes self-gate; latents still stage into ComfyUI input/". Note the mask
  `channel` (alpha for image, mask-channel for detailer masks) is fixed per-node, not
  injected.
  **Verify:** grep the docs tree for `placeholder.png`/`ltx_silence`/`STAMP` — only
  historical/changelog mentions remain; the live injection rule describes path→string.
  `docs/README.md` line budget (≤200/doc) respected.

## Phase 5: Finish + wire the raw→API tooling

- [ ] Finalize `scripts/sync-raw-workflows.mjs`: reconcile the dirty-tree guard with
  the user's workflow (they want an agent to just run it — decide: guard OFF by
  default with a `--safe` opt-in, or snapshot-then-run). Confirm
  `scripts/workflow-to-api.mjs` handles every node family in `raw/` (run it over all
  `raw/*.json`, expect 0 missing-required / 0 dangling on each).
- [ ] Add a reference to the raw→API command in `docs/playbooks/add-model/` and
  `docs/playbooks/add-app/` (the workflow-authoring step): "author in the ComfyUI
  browser, drop the LiteGraph export in `comfy_workflows/raw/`, run the sync command
  to convert → orchestrate → commit". Add an `npm run` alias if it fits the repo's
  script conventions.
  **Verify:** `node scripts/workflow-to-api.mjs raw/<each>.json` succeeds for every
  raw file; playbooks link the command; add-model + add-app both mention it in their
  workflow-authoring section.

## Verification

**Verify mode:** user-ux

Phase 3 has a UI/UX surface the user must exercise in the running app (i2i, detailer
mask, reuse-prompt, remote Pod). Phases 1, 2, 4, 5 are `auto`-verifiable (orchestrate
run, grep, converter run). `mpi-continue` should stop for the user only on Phase 3.

End-to-end done when:
- `orchestrate.py --all` runs clean (no STAMP/FAIL); all runtime files regenerate.
- No `placeholder.png`/`ltx_silence.wav` references or source files remain (latents kept).
- Live app: i2i, detailer (mask channel), t2v-with-no-frame, video, audio, and
  reuse-prompt all generate on LOCAL engine, injecting project-folder paths into
  `string`. Reuse of a deleted-asset card → WARNING toast, not crash dialog.
- One remote (Pod) image gen injects the Pod path and generates.
- Injection-rules docs describe the path→string contract; playbooks reference the
  raw→API command.

## Plan Drift

- **Two straggler workflows** (App_sdxl_regen.json, remove_background.json) were still on
  old LoadImage — plan assumed all migrated. Migrated to MpiLoadImageFromPath (`72eeeae6`).
- **krea2 crop fix** was skipped by the first sync (its raw was an accidental API export,
  older mtime). User re-exported LiteGraph backup; processed `e33ca17e` (MpiCrop→ImageResizeKJv2).
- **Phase 5 (raw→API tooling) EXPANDED far beyond the plan** into a full pipeline rebuild
  (user-driven): raw/ is now TRACKED in git (`4d62d586`, 23 sources). `sync-raw-workflows.mjs`
  rewritten git-driven (not mtime): git-diff raw vs HEAD → commit raw FIRST → convert →
  **VALIDATE-GATE** → orchestrate → leave generated STAGED for /mpi-end (`5921e30d`). NEW
  `scripts/validate-injection-rules.mjs` (title-prefix law / capture / seed-convention /
  integrity) gates every converted API before bake; STOP + name node on violation, never
  auto-fix. raw/ hard-protected read-only in both converters (`f918c907`).
- **raw/ is USER-OWNED, read-only to all tooling** — new law. [[feedback_raw_workflows_user_owned]]
- **NEW BUG FOUND by the validator** (uncarded follow-up): NVIDIA_PID had 4 SamplerCustom with
  baked noise_seed + no Input_Seed (MPI-257 violation). USER FIXED in ComfyUI (added MpiInt
  titled Input_Seed → 4 samplers), re-exported. Validated clean. No card yet — consider one if
  other workflows need the same audit.

## Session state @ 2026-07-13 (context full → handoff)

**COMMITTED (branch 1.2.0):** P1 generators (`bde02016`), stragglers (`72eeeae6`), P2 backend
staging (`2afe11ea`), reconvert-post-crop (`5bb4d47b`), raw-guards (`f918c907`), krea2 (`e33ca17e`),
tooling rewrite (`5921e30d`), raw sources tracked (`4d62d586`).

**STAGED, uncommitted (→ /mpi-end):** 20 generated workflow files (API templates + orchestrated
runtime) from the full sync bootstrap. Do NOT re-run orchestrate on this dirty tree.

**Phase 3 (injector) = COMMITTED + LIVE-VERIFIED (`47bac3b8`).** DONE.
Final approach EVOLVED past the plan: route media by **TARGET NODE CLASS**, not title guessing.
Any param whose same-titled node is a path-reading loader (`MpiLoadImageFromPath`, `MpiLoadAudio`,
`MpiLoadVideo`, `VHS_LoadVideoPath`, `MpiString` fan-out) → `imagepath` kind → `_resolveMediaPath`
+ remote `_uploadRemoteMedia`. The OLD title-pattern sweep (input_image/video/audio only) MISSED
the video frame slots `Input_Start_Frame`/`Input_End_Frame` → raw URL reached the path node
unresolved → self-gate → "no output returned". Class-driven routing is title-agnostic (covers
all current + future slots). Also: `_uploadImage` deleted; `_assertMediaSourceExists` added
(reuse-404 soft-error). Data-URL staging route `POST /comfy/stage-media-data-url` (auto-mask
painted mask is a data: URL; path node needs a file). Audio slot title `Input_Audio_File` →
`Input_audio` (3 registry entries, case-insensitive match). node_lock MpiNodes `2d409b54` →
`0391e34` (Pod needs path/audio/blocklist nodes). LTX i2v/t2v rebaked off renamed audio node.
**VERIFIED LIVE:** i2i, detailer+mask (local), t2v + i2v start/end frame (local Wan), reuse,
**start+end+audio on remote Pod LTX** (the `_uploadRemoteMedia` twin + fresh MpiNodes pin).
Deleted-asset warning-toast = OTHER AGENT (empty-media/missing-link, triggers on Q).

**TWO BUGS FOUND + FIXED THIS SESSION (converter, not migration):**
- **Seed-phantom control_after_generate** (`7571fe2e`): the LiteGraph→API converter never skipped
  the phantom `control_after_generate` value the frontend synthesizes for INT widgets named
  `seed`/`noise_seed` when `/object_info` omits the flag (RES4LYF ClownsharKSampler_Beta, Impact
  MaskDetailerPipe, MpiPromptList). Every later widget shifted → `steps:"fixed"`, `sampler_mode:"fixed"`,
  `probability:"fixed"`, `batch_size:0.2`, `refiner_ratio:10`. Fix matches frontend rule EXACTLY:
  `control = inputSpec.control_after_generate ?? ['seed','noise_seed'].includes(inputSpec.name)`.
  Regen krea2/Chroma t2i + all 8 detailers (`582650bc`). Detail → [[tool_litegraph_to_api_converter]].
- **auto-mask no-detection crash**: user added `MpiBlockIfEmptyList` (guards empty-SEGS IndexError);
  converted + shipped in `582650bc`.

**Still pending: P4** (git rm `comfy_workflows/input/placeholder.png` + `ltx_silence.wav`; rewrite
injection-rules docs to path→string contract). **P5 docs** (reference raw→API sync command in
add-model/add-app playbooks — tooling already built). **/mpi-end** (commit 20 pre-staged generated
files, if still staged — may have been swept by the release agent; re-check).

**DEFERRED (NOT a MPI-272 regression — user to test):** LTX-2.3 audio gen ran with correct sound
but **wrong duration** — 1s → ~500ms, 2s → same ~500ms (timing ignored/clamped). Could be
duration-inject dead (node 75 `Input_Duration`→76 `MpiWanSeconds`→frames), audio-length driving
video length, OR a LoRA strength. Duration IS wired app-side (PromptBoxControls.js:534 emits
`{Input_Duration:v}`). **Discriminator test the user will run next Pod connect:** (1) t2v NO audio,
1s vs 2s — if lengths differ, duration works + audio is the override; if same, duration inject/wiring
is the bug. (2) audio gen in the BROWSER — if browser is ALSO short → workflow issue (not conversion);
if browser correct + app wrong → conversion/injection bug. User: "we fixed this during build, can't
remember how." Trace start points: duration chain 75→76→`LTXVEmptyLatentAudio.frames_number`; audio
path `LTXVReferenceAudio`(274)/`LTXVEmptyLatentAudio`(144)/`LTXVAudioVAEEncode`(198).

## Preservation Notes

- **Memory:** `feedback_check_both_engine_paths` — the injector change touches the
  local/remote twin; verify BOTH (local path-inject + Pod `_uploadRemoteMedia`).
  `feedback_download_uses_a_download_not_ipc` unrelated. Consider a new feedback
  memory: "media injection is now path→string only; nodes self-gate; latents are the
  sole staging survivor" once shipped.
- **Docs homes:** injection contract → `.claude/rules/comfy_injection.md`;
  authoring → `docs/workflow-authoring/`; playbook traps → `docs/playbooks/add-model/`
  + `add-app/`. Latent-staging survivor note belongs in `docs/comfy.md` or the
  injection rule so a future agent doesn't "finish the cleanup" by killing latents too.
- **Tree state at plan time:** ~30 workflow files are modified (user's migration, mid-flight)
  + this session's regen. That's expected in-progress work, not damage — do not
  `git checkout` them. Commit workflow changes with the user before/with Phase 1.
- **Do NOT run `orchestrate.py` on a dirty tree unguarded** — it global-rebuilds and
  overwrote in-progress files once this session. Commit or stash first, or use the
  guarded sync script.
- **Reuse-404 soft-error is load-bearing** — MPI-227/225 history. Losing it regresses
  reuse UX to the bug-reporter dialog.
