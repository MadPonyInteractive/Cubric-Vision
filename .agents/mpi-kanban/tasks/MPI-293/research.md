# MPI-293 — Pod bare after create (missing MpiNodes) + create 502 abort

## Root cause (confirmed)
The 67 "nodes missing" errors were NOT MpiNodes-absent. MpiNodes IS installed
(volume node, connect-time). The Pod's pinned commit was STALE:

- Pod build copy `node_lock.json`: MpiNodes `2d409b54` = **v1.1.4**
- App SOT `dev_configs/node_lock.json`: MpiNodes `0391e34c` = **v1.2.2**
- Remote HEAD: `ba9e1569` = **v1.2.5**

Current compiled workflows use loader nodes added AFTER v1.1.4:
`MpiLoadImageFromPath`, `MpiBlockIfEmpty`, `MpiLoadAudio`, `MpiLoadVideo`
(added in b496c5c "fast image/video loader nodes", v1.1.6). Pod v1.1.4
predates them → missing-node errors. Verified all 36 used Mpi* classes are
present in HEAD v1.2.5.

## Fix shipped
1. Bumped MpiNodes pin in SOT `dev_configs/node_lock.json`:
   `0391e34c` → `ba9e1569` (v1.2.5). v1.2.2→v1.2.5 is bug-fixes + additive
   nodes + removal of dead BETA combo nodes — no breaking changes for us.
   App auto-picks up via nodesDeps.js `import`.
2. Synced SOT → Pod build copy `mpi-ci/cubric-vision-pod/node_lock.json`
   (was ALSO missing `comfyui-inpaint-cropandstitch` + `comfyui-krea2edit`).
   `/build-pod-image` copies SOT into the build context, so keeping them
   identical is the correct steady state.
3. Hardened `client.createPod` (routes/runpodRemote.js): transient RunPod
   gateway 502/503/504 now retries (2 retries, linear backoff). A 4xx real
   reject (enum lag / stock / schema) is NOT retried. Fixes the "502 aborted
   the whole connect" secondary symptom.

## Takes effect
- MpiNodes pin: next Pod boot (wrapper volume-reinstalls at connect) + app
  restart (re-import). NO image rebuild (MpiNodes is a volume/code-only node).
- createPod retry: app restart.

## Not done / operational
- A Pod already running with the stale pin needs a reconnect (or the app's
  node-drift heal) to re-pull the new commit.
- User-verify on a real Pod rent deferred (was blocked on stock at time of fix).

## UPDATE — the REAL main bug (found on user verify)
User connected a FRESH volume and pressed Install on Krea 2 Turbo. Error:
`Failed to download Krea 2 Turbo: [Errno 2] No such file or directory:
'/workspace/comfyui/custom_nodes/comfyui_controlnet_aux'`

This is the PRIMARY issue; the MpiNodes pin was secondary. Root cause:
`routes/downloadManager.js` baked-node guard (MPI-244) was gated on
`alreadyInstalled && custom_nodes && _isImageResident(dep)`. On a FRESH volume
the wrapper scans /workspace and reports the baked `comfyui_controlnet_aux` as
NOT installed (it lives in the image at /opt, invisible to the volume scan) →
`alreadyInstalled=false` → guard skipped → dep sent to wrapper →
`requirements_only` self-heal cd's into the nonexistent volume folder → Errno 2.
Fires on EVERY model install with a baked CN dep (Krea2 family) on a fresh volume.

### Fix
Hoisted the `_isImageResident` check ABOVE the `alreadyInstalled` branch — a
baked node settles 'complete' regardless of what the volume scan reports.
`_isImageResident` is pure (dep shape + universal-node-filename set), safe
unconditionally. Self-check (scratchpad/baked-branch.mjs) covers all 6 branch
cases. downloadManager.js imports clean.

### Takes effect
App restart. Install routing is app-side — same fresh volume, no reconnect.

## UPDATE 2 — the TRUE root cause (app.log analysis)
User restarted + retried; SAME Errno2. app.log revealed:
- `ComfyUI-Krea2-ControlNet: complete`, `comfyui-kjnodes: complete`,
  `comfyui-krea2edit: complete` — but `comfyui_controlnet_aux: failed`.
- `comfyui_controlnet_aux: failed → queued (remote node requeue) — rejected`
  (once failed, installStore blocks requeue → no self-recovery).

### THE bug: universal/baked node set was silently EMPTY
`routes/remoteModels.js` `_universalNodeFilenames()` parsed
`js/data/modelConstants/dependencies.js` for per-dep blocks with
`type:'custom_nodes' + installRequirements:true`. But dependencies.js only
SPREADS `...nodesDeps` (line 32) — the actual custom_nodes block text lives in
`nodesDeps.js`, NOT inline. So the regex matched ZERO blocks → the baked-node
set was EMPTY → `_isImageResident()` returned false for EVERY baked node →
`comfyui_controlnet_aux` (installRequirements:true, image-baked) was routed to
the wrapper → wrapper's requirements self-heal cd'd into the nonexistent
`/workspace/.../comfyui_controlnet_aux` → Errno 2. Proven: parse(dependencies.js)
= [] vs parse(nodesDeps.js) = [7 baked nodes incl controlnet_aux].

### Fix
`remoteModels.js`: parser now reads `nodesDeps.js` (where the blocks are).
Verified `_isImageResident('comfyui_controlnet_aux')` → true; code-only
`ComfyUI-Krea2-ControlNet` → false (still volume-installs). This is the primary
fix. The earlier downloadManager.js hoist is complementary — on a fresh volume
the wrapper reports a baked node not-installed, so the guard must fire on
`_isImageResident` regardless of `alreadyInstalled`; now that the set is
populated the guard actually fires.

### Why the prior restart "didn't take"
app.log newest line was 23:26 (prior day) — routes/*.js is main-process, NO hot
reload (tool_main_process_no_hot_reload). The failing screenshot ran pre-fix
code. Needs a FULL app quit + npm start, not Ctrl+R.

### Files (this session)
- routes/remoteModels.js  — parser target dependencies.js → nodesDeps.js (THE fix)
- routes/downloadManager.js — hoist _isImageResident above alreadyInstalled
- routes/runpodRemote.js — createPod 502/503/504 retry
- dev_configs/node_lock.json + mpi-ci Pod copy — MpiNodes pin ba9e1569
