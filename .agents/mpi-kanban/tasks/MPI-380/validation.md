# MPI-380 Validation

Scope shipped: the POINTS PATH only. SAM 1 is kept for the segment-branch refine.

## PASSED (automated, this session)

**R2 + dependency entry**
- `sha256sum` of the local weight: `9ba99c92703c2e8b4f47de2d34a539bb8e18923049e238b780d70dbe6368eb03`,
  size `1745546848` — matches the brief's recorded byte count exactly.
- Uploaded to `cubric-r2:cubric-models/vision/models/checkpoints/` (serialized,
  `--transfers 1 --bwlimit 3M`, `--s3-no-check-bucket`).
- `rclone lsl` on the remote reports `1745546848 sam3.1_multiplex_fp16.safetensors`.
- `HEAD https://models.cubric.studio/vision/models/checkpoints/sam3.1_multiplex_fp16.safetensors`
  -> `HTTP/1.1 200`, `Content-Length: 1745546848`. Public URL live, bytes match.
- `sam3-multiplex` declared in `assetDeps.js` as `engineAsset: true`.

**Open question from the plan — ANSWERED, no code needed.** An EXISTING install does
pick up a newly-added engineAsset: `checkUniversalWorkflowDepsStatus()`
(`routes/shared.js:598`) derives its dep list from the LIVE `DEPS` map and reports any
whose file is absent as `missing`, which routes to the `/engine/repair-deps` ladder
(`routes/engine.js:365` and `:558`). Direct precedent is recorded in `assetDeps.js`
on the `rife47` entry: "As a tracked engineAsset it now boot-installs when missing +
self-heals." `resolveComfyPath` joins the models root with `dep.filename` verbatim, so
`checkpoints/` needs no type mapping.

**Schema gate (before authoring, per the standing rule)**
- Probed the LIVE engine `/object_info/SAM3_Detect` rather than trusting the brief.
  Confirmed: `positive_coords` / `negative_coords` are `forceInput` STRING; widget
  order is `[threshold, refine_iterations, individual_masks]`; outputs `MASK` +
  `BOUNDING_BOX`. Point path ignores `threshold` (`nodes_sam3.py:186-191`).
- `/object_info/CheckpointLoaderSimple` lists `sam3.1_multiplex_fp16.safetensors`.

**Workflow**
- `node scripts/workflow-to-api.mjs comfy_workflows/raw/img_auto_mask.json` (explicit
  path — never the no-arg form): exit 0, empty stderr, **0 dangling links**.
- SAM 1 chain deleted: nodes 1650 `MpiLoadImageFromPath`, 1651 `ImageToMask`, 1652
  `MaskToSEGS`, 1653 `SAMDetectorCombined`. Erode/dilate cleanup pair and the picker
  chain below are untouched (links 2303 / 2308 RETARGETED, not recreated).
- Raw graph keeps its ComfyUI-export format: 2-space indent, CRLF, no trailing newline.

**App side**
- `grep -rn "pointsThreshold|pointsMask|getPointsMaskDataURL|Input_Points_Mask|Input_Points\.threshold|pointRadius|POINT_R_"`
  over `js/ routes/ tests/ scripts/ comfy_workflows/` returns NOTHING.
- `node --check` clean on all 7 touched JS files; `eslint` clean (no output).
- Orphaned Scope-slider CSS removed (orphaned BY this change, not pre-existing).

**Suite: 232 pass / 9 fail — the failure LIST is unchanged**, which is the real check
(green was never the baseline). Failures remain exactly: `optional-media-placeholder`,
`permodel-key-allowlist` x3, `resolve-model-deps`, `remoteProxy` x4. Test count rose
238 -> 241 (the 3 new guards).

**New guard: `tests/auto-mask-inject-titles.test.cjs`, 3/3.** The auto-mask path does
not go through `commandRegistry.injectParams`, so the existing
`inject-params-titles.test.cjs` never covered it — and MPI-380 renamed three of its
title keys at once. Negative-controlled in FIVE directions, each proven to fail:
1. node title typo'd -> 2 fail
2. `positive_coords` turned into a literal instead of a link -> 1 fail
3. `SAMLoader` (SAM 1) deleted -> 1 fail
4. retired `Input_Points_Mask` param resurrected -> 2 fail
5. `MpiText` reverted to `MpiString` -> 1 fail
All restored to 3/3 afterwards; `git diff --stat` confirmed no residue.

## DEFECT CAUGHT PRE-SHIP (worth keeping)

The first cut wired the coords through **`MpiString`** — and `MpiString` is a member of
`comfyController`'s `PATH_MEDIA_CLASSES` (`js/services/comfyController.js:1128`). Any
param whose same-titled node is in that set is classified `imagepath` and pushed through
`_resolveMediaPath()` and, on a remote engine, `_uploadRemoteMedia()`. The JSON coord
string would have been treated as a file path — so the REMOTE leg (an explicit
acceptance item) would have failed while local ran fine.

Fixed structurally with the repo's own existing convention rather than a special case:
**`MpiString` = a media path, `MpiText` = plain text** (klein_t2i already uses `MpiText`
for `Input_Positive` / `Input_Negative`). Coordinates are data, not a path. Assertion 5
above now pins it.

## USER-VERIFIED LOCAL — 2026-07-29

User ran the Points tool live across several images (people in a pool, a man in a
rocking chair, poolside pair). Verdict: **"Everything here seems to be working fine"**
and *"this point system is more precise"*. Scope dial gone, dots place and remove,
right-click negatives work, Add accumulates, green preview correct.

**Characterised, NOT a defect:** SAM3 needs MORE points than expected — especially
NEGATIVE ones — or it over-selects. Thin/strappy subjects (bikini, purse, straps) are
its weak spot; a face can take ~6 points. This is model behaviour, not wiring. The
existing info text already says to place more dots; no code change taken.

That weakness is what motivated the text tool (see MPI-384): SAM3 given the object's
NAME nails exactly the subjects points struggle with — user proved `bikini:2` in the
node graph returning two clean per-object masks.

## Findings for the deferred Pod leg (researched, not run)

- **No image rebuild needed to TEST.** `SAM3_Detect` is core ComfyUI 0.28, baked at
  image build; the dev image `v0.17.0-dev-cu130` is already on 0.28 —
  MPI-341's validation digest-verified `/opt/ComfyUI/comfyui_version.py ->
  __version__ = "0.28.0"`. A dev app run boots the dev tag.
- **The weight is a normal R2 dep**, already uploaded — no image involvement.
- **Released users are a separate matter:** stable is its own tag and MPI-342
  deliberately left the stable pins untouched, so the 0.28 image must be promoted
  before this reaches them. Release decision, not this card's.
- **UNVERIFIED for the Pod:** that the remote model-install path picks up a NEWLY ADDED
  engineAsset (the local path does — `checkUniversalWorkflowDepsStatus` -> repair-deps).
  Check this first when the Pod leg runs; it is the likeliest failure.

## Cross-platform (Mac / Linux) — CLEAR

`nodes_sam3.py` imports only `torch`, `torch.nn.functional`, `comfy.*`, `folder_paths`,
`comfy_api` and `av`. **No `onnxruntime`**, no platform-specific wheel — so this is NOT
the MPI-370 class of breakage (controlnet_aux needing `onnxruntime-gpu`, which has no
macOS wheel). Nothing to drop or gate for Mac/Linux.

## STILL OUTSTANDING

- **Remote Pod leg** — deferred by the user until the mask feature set lands. Points mask
  on a Pod plus confirmation the points PNG upload is gone from staging.
- **Large-image sanity check** — a smoke check only; no retirement claim rides on it
  (SAM 1 stays), so not the 4K bake-off the original acceptance list demanded.

> **The Pod leg is queued on [MPI-385](../MPI-385/brief.md)** — the RunPod verification
> umbrella. It runs FIRST in that session: the newly-added `engineAsset` on the remote
> install path is the likeliest failure of the whole sweep.

## REMOTE LEG: BLOCKED — the weight has no route to a Pod (found 2026-07-29, MPI-385 item 1)

Answered from CODE, before spending a Pod. **The earlier "Open question - ANSWERED, no code
needed" note above is right about LOCAL and wrong about REMOTE.** Recording both so the
mistake is not repeated: `checkUniversalWorkflowDepsStatus()` is a LOCAL-only function
(`getCustomRoot()` + `fs.pathExists`, called only from `routes/engine.js:434/614/634`). It
never runs for a Pod, so it proves nothing about the remote path.

Proof chain, each link grep-verified:

1. `sam3-multiplex` (`assetDeps.js:314`, `engineAsset: true`) is referenced NOWHERE else.
   `grep -rn "sam3-multiplex" js/ routes/ tests/` returns only its own declaration.
2. The remote install path sees ONLY per-model deps: `remoteModelsCheck` (`remoteModels.js:329`)
   partitions `m.deps`, and the client builds those via `resolveModelDeps.resolve` which
   composes the MODEL, OPERATION and ENGINE axes by union — **no engineAsset injection**.
   A weight that belongs to no model is never in the list handed to `/wrapper/models/status`.
3. On remote, engineAssets reach a Pod ONLY by being baked into the image:
   `cubric-vision-pod/Dockerfile` bakes rife47, 4x_NMKD-Siax, 4x-AnimeSharp, face_yolov8n,
   sam_vit_b and birefnet. **`sam3.1_multiplex_fp16.safetensors` is absent.** That block's own
   comment names `dependencies.js engineAsset entries` as its source of truth and says to keep
   them in lockstep — MPI-380 added the entry and never touched the Dockerfile.

Consequence: SAM3 points AND text (MPI-384) fail on a Pod — `CheckpointLoaderSimple` cannot
see a weight that is on neither the volume nor the image. Deleting/recreating the network
volume does not help; the weight was never eligible to land there.

**The brief's "No image rebuild needed" conflated two different things** — the NODE
(`SAM3_Detect`, core ComfyUI 0.28, genuinely needs no rebuild) with the WEIGHT (an
engineAsset, which on remote had no delivery mechanism at all).

Fix direction (cheaper than a rebuild, NOT yet implemented): `checkpoints:` IS volume-mapped
(`cubric-vision-pod/start.sh:60`) and `remoteInstallDep` already accepts an arbitrary
`{id, type, filename, url, size, sha256}`. So the remote path can install engineAssets onto
the volume — nothing asks it to today. An image rebuild would also work but costs a rebuild
per engineAsset added, forever.

### FIX SHIPPED (local verification complete, Pod leg still pending)

Chose the **derived** fix over baking sam3 into the image. Baking is what the design
documented, but it costs +1.75GB on every Pod image pull forever, a dev image build on
both legs (MPI-340), a `POD_IMAGE_VERSION_DEV` bump and an app restart — and the NEXT
engineAsset added repeats the whole dance, so the bug class survives. Volume-installing
makes remote derive from `DEPS` exactly as local does, closing the class permanently.

Four files:

- `js/data/modelConstants/assetDeps.js` — `bakedOnPod: true` on the 5 weights the
  Dockerfile really bakes (4x-NMKD-Siax, 4x-AnimeSharp, birefnet, face-yolov8n,
  sam-vit-b). `rife47` needs no flag: `targetPath` already reports image-resident.
  The legend at the top of the file states the rule and why **unflagged is the safe
  default** — a wrong flag makes a weight unreachable on remote and the failure is a
  503 mid-generation on a billed Pod, not a build error.
- `routes/remoteModels.js` — `_isImageResident` returns true for `bakedOnPod`, so a
  baked weight is never re-downloaded onto the volume (~950MB of duplicate bytes).
- `js/shell.js` — `_installRemoteEngineAssets()` on the SAME first-connect latch as
  `_healRemoteNodeDrift`, running after it (a node re-clone is KB-scale, an engine
  asset can be GB-scale, and the install chain is serial). Sends the non-baked
  engineAsset set through the ORDINARY remote install path, which already owns the
  hard parts: volume pre-check + dedupe (warm volume = no-op), the serial install
  chain that stops a CPU Pod being starved by parallel aria2c jobs, and SSE/stall
  reporting. Job id `engine:assets`, namespaced like `plugin:<id>` / `app:<id>` so it
  cannot collide with a model id; no consumer renders a card for an unknown id, so
  the heal stays silent by construction.
- `tests/remote-engine-assets.test.cjs` — 6 assertions.

Blast radius swept: `_isImageResident` has 3 call sites. `downloadManager.js:1799` is
guarded by `dep.type === 'custom_nodes'` so a weight flag cannot reach it; `:2376` is a
doc reference only; `remoteModelsCheck`'s partition is the sole behavioural consumer.
`foldBackWrapperStatus` reports folded-back resident ids `installed: true`, which is what
makes the baked skip work end to end.

**Verification (local):**
- Full suite **280/280, zero failures** (279 baseline + this file). Runner
  `node --test tests/*.test.cjs`.
- Negative-controlled BOTH directions, each restored clean afterwards and confirmed by
  `git diff --stat`: (A) strip the `bakedOnPod` branch from `_isImageResident` -> fails
  on `sam-vit-b ... must report image-resident`; (B) wrongly flag sam3 as baked -> fails
  on `sam3-multiplex must be volume-installed`.
- Assertion 6 is a LOCKSTEP GUARD that reads the real
  `mpi-ci/cubric-vision-pod/Dockerfile` and checks the flag both ways (flagged must be
  in the image, unflagged must NOT be). It passes against the live file, which
  independently confirms the 5/3 split rather than trusting my reading of it. Skips with
  a printed note when the sibling repo is absent, so CI stays green.
- Resolved install set printed from the live `DEPS`: **volume-installs 3**
  (hand-yolov8n 5.9MB, person-yolov8n-seg 6.9MB, sam3-multiplex 1.75GB), **skips 6**.
  The two yolo variants were a latent gap of the same shape - engineAssets the
  Dockerfile deliberately never baked, so no Pod has ever had them.
- ESLint + `node --check` clean on all four files.

**STILL PENDING: the Pod leg.** None of the above proves the wrapper accepts a
`checkpoints/` install or that ComfyUI then resolves the weight. That is MPI-385 item 1,
now a test of a real code path rather than a test of nothing.
