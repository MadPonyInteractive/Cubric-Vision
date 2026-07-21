# B — Remote Engine (findings)

## Connect edge
- shell.js:1238 _initDataRegistries listens remote:connection; connected&&phase==null → shell.js:1250 syncModelInstalled() + _maybeNotifyArchChange().
- syncModelInstalled (modelRegistry.js:82) → POST /comfy/models/check → comfy.js:615 → remoteModels.remoteModelsCheck (remoteModels.js:215).
- remoteModelsCheck partitions: _isImageResident(d)→installed inline; else POST /wrapper/models/status. entry.installed = deps.every(installed) remoteModels.js:258.
- DRIFT slots inside remoteModelsCheck after wrapper status, before fold-back. Volume drift→mark installed:false (or remoteInstallDep). Baked drift→ui:warning, NOT installed:false, NO volume heal.

## remoteInstallDep remoteModels.js:271
- async remoteInstallDep(dep,{sizeBytes=0,force=false}). custom_nodes body: {id,type,filename,url,install_command?,requirements_only?}. force→body.force=true.
- POST /wrapper/models/install → 202 started / 200 already. Fire-and-forget, SSE progress. requirements_only re-runs pip w/o redownload.
- DRIFT reinstall = remoteInstallDep(dep,{force:true}).

## R2 delta
- dep.url = GitHub archive today. Wrapper fetches whatever url given (host-agnostic). R2 = new source:'r2' in lockUrl OR app builds R2 url for volume nodes.
- Commit embedded in GitHub url today; R2 zip → commit must be conveyed separately (new `commit` field in install body → wrapper stores as marker). Field doesn't exist yet.

## Discriminator retarget — ⚠️ SCOPE CONFLICT
- _universalNodeFilenames remoteModels.js:157, regex /installOnEngine:\s*true/ L175; _isImageResident L192. NODES only.
- getUniversalWorkflowDepIds shared.js:481 filter installOnEngine===true = SHARED local+remote (engine install/uninstall AND remote baked partition). Retargeting to installRequirements CHANGES LOCAL.
- RECOMMEND: keep getUniversalWorkflowDepIds on installOnEngine for LOCAL; retarget only _universalNodeFilenames (remote) to installRequirements. Flag can't fully die without a local replacement discriminator.
- _universalNodeNames cache module-level, populated once, never invalidated (fine, deps.js static at runtime).

## Manifest — node commit marker home
- GET /wrapper/manifest (remotePodState.js:101,138-163). Shape {manifest_schema_version:1, models:[], ...}. models[] defined but EMPTY. schema>MAX(1) blocks gen w/ modal. Cached per podId (_healthVerdict), cleared on swap.
- No _manifest_record_model/.mpi_ app-side (wrapper writes, app reads).
- RECOMMEND Option A: extend manifest w/ nodes[] {filename,commit,installed_at}. Reuse cached single-fetch. Bump schema→2. Drift check reads cached manifest in/near _evaluatePodHealth.
- Option B: new GET /wrapper/nodes/status (extra endpoint + retry budget).

## Pinned commit app-side
- node_lock.json = repo root dev_configs. Backend CJS require('../../dev_configs/node_lock.json') direct → nodeLock.nodes[id].commit. No network. Compare vs wrapper-reported.

## ui:warning = toast (confirmed)
- events.js:108 ui:warning→StatusBar.notify. statusBar.js:571 → MpiToast warning. NOT error dialog (ui:error=bug-reporter modal shell.js:340).
- Baked-drift warn = Events.emit('ui:warning',{message:'Image stale — pod needs rebuild'}). Non-blocking. Emission client-side after syncModelInstalled resolves; server comparison conveyed via new field on /comfy/models/check response OR separate endpoint.

## Timing — connect does NOT block gen
- syncModelInstalled fire-and-forget from event bus. Gen gated by comfyController._ensureRemoteReady, not sync.
- remoteInstallDep returns 202 fast; wrapper install async via SSE. 3 volume cold-installs at connect = background.
- comfy:needs-restart→state.remoteComfyNeedsRestart→_ensureRemoteReady POST /proxy/restart-comfy + poll comfyReady before gen. Gen naturally gated until nodes load.
- Cold 3 nodes: install near-instant trigger, dl+extract few s each (PainterI2Vadvanced 144KB), restart gate ~15-30s → ~30-60s before FIRST gen on fresh Pod. Connect path itself <1s, no held HTTP. Subsequent connects skip (present on volume).
- _starting flag cleared before drift-reinstall (after connected:true) — no interaction.

## FLAGS
- getUniversalWorkflowDepIds shared local+remote → separate remote helper, don't retarget shared.
- No manifest node marker today — new wrapper build populates nodes[] OR new endpoint.
- Commit not in R2 install body — add field.
- gen gating chain works unchanged for drift-reinstalled volume nodes.
