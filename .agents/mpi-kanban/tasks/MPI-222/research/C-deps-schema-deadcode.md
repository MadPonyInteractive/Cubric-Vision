# C — DEPS schema / dead code (findings)

## DEPS custom_nodes inventory (dependencies.js)
| id | filename | installReqs | installOnEngine(DEPS) | pipPins | reqCmd | url |
|---|---|---|---|---|---|---|
| ComfyUI-LTXVideo | ComfyUI-LTXVideo | T | ABSENT | kornia==0.8.2 | - | lockUrl git-commit |
| ComfyUI-MpiNodes | ComfyUI-MpiNodes | F | true | - | - | lockUrl |
| ComfyUI-PainterI2Vadvanced | same | F | ABSENT | - | - | RAW github refs/heads/main.zip (NOT locked) |
| ComfyUI-VideoHelperSuite | comfyui-videohelpersuite | F | true | - | - | lockUrl |
| ComfyUI-Impact-Pack | comfyui-impact-pack | T | true | NONE | - | lockUrl |
| comfyui-kjnodes | comfyui-kjnodes | T | true | NONE | - | lockUrl |
| ComfyUI-UltimateSDUpscale | comfyui_ultimatesdupscale | F | true | - | - | lockUrl |
| ComfyUI-Frame-Interpolation | comfyui-frame-interpolation | T | true | NONE | python install.py | lockUrl |
| ComfyUI-Impact-Subpack | ComfyUI-Impact-Subpack | T | true | NONE | - | lockUrl |
| RES4LYF | RES4LYF | T | ABSENT | opencv-python==5.0.0.93,numpy==2.5.1 | - | lockUrl |

## installOnEngine consumers (node-role removal impact)
- getUniversalWorkflowDepIds shared.js:481 — filter installOnEngine===true. BOTH nodes+weights. Type-agnostic → no code change; weights (face/hand/person-yolov8n, sam-vit-b, 4x-NMKD, 4x-Anime) KEEP flag.
- getInstalledModelNodeDeps shared.js:524-599 (excludes engineSet) — returns [] once all nodes in engineSet. Deletable.
- _runEngineDownload engine.js:364-370 — calls both; comment stale after.
- downloadManager.js:1852 Rule1 preserve universal (_universalDepIds). BOTH. Weights MUST stay.
- downloadManager.js:1863 `type==='custom_nodes' && installRequirements===true` keep-pip guard — redundant after (all nodes in universal) but harmless.
- remoteModels.js:157-198 _universalNodeFilenames/_isImageResident — NODES only, regex `installOnEngine:\s*true` on DEPS source text. RETARGET discriminator to installRequirements. (see B)
- comments only: dependencies.js:7, universal_workflows.js:6.

## getInstalledModelNodeDeps callers
- SOLE: engine.js:369 (import :15). Delete fn body+export(shared.js:694)+import+call. Nothing replaces (universal path covers).

## nodeset_version
- ZERO consumers app + mpi-ci (Dockerfile reads lock['nodes'] only). node_lock.json:3 both copies. Safe drop/repurpose.

## lockUrl() dependencies.js:19-32
- registry→cdn.comfy.org zip; git-tag→archive/refs/tags; git-commit→archive/<sha>.zip. ALL nodes = git-commit today.
- NODE ZIPS = GITHUB, not R2. Only weights on models.cubric.studio. R2-staged node zips = NEW: add `r2` source type OR full R2 url field in node_lock + upload step.

## pipPins
- carried _createDepJob downloadManager.js:236 (MPI-149). Applied L1574-1587 AFTER reqs (corrective).
- 4 need pins: Impact-Pack, kjnodes, Frame-Interpolation(python install.py), Impact-Subpack. Versions NOT in repo → LIVE-DETERMINE via `pip install -r requirements.txt --dry-run` on live engine.
- known: LTXVideo(kornia), RES4LYF(opencv/numpy).

## Guard tests
- NONE for installOnEngine/deps-status/custom_nodes install. Pattern: tests/resolve-model-deps.test.cjs + comfy-needs-restart.test.cjs (node:test + assert/strict, no framework, mock deps). New tests/*.test.cjs.

## node_lock branch/_doc
- _doc says "RunPod branch only" — STALE. Live on branch 1.2, imported dependencies.js:13. Label needs update.
- mpi-ci copy stale (MpiNodes 780c7c3, missing RES4LYF) = the bug live.

## CONTRADICTIONS
A. LTXVideo installOnEngine:true in node_lock but ABSENT in DEPS → baked on Pod, per-model locally. Collapse fixes.
B. "RunPod branch only" label false (on 1.2).
C. mpi-ci node_lock stale — build-pod-image sync required.
D. PainterI2Vadvanced NOT in node_lock, raw main.zip → if →installOnEngine, MUST add node_lock entry w/ pinned commit first (can't lockUrl without it).
E. installRequirements must stay synced node_lock↔DEPS (Dockerfile reads node_lock's).
