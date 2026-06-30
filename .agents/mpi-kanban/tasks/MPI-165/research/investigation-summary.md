# MPI-165 Investigation Summary (4 parallel read-only agents, 2026-06-30)

Source: 4 Explore agents mapped workflow-swap, deps-resolver, server-boundaries, engine-signal.
Findings consolidated here (agents were read-only, couldn't write /tmp).

## The live bug (root cause — workflow-swap agent)

`commandExecutor.js` `runCommand` swaps the LTX workflow `LTX_t2v.json → LTX_t2v_gguf.json`
for a remote run via `_model?.ggufWhenRemote && _remoteRun` where
`_remoteRun = payload.forceLocal !== true && remoteEngineClient.isRemote()` (line ~869).

`remoteEngineClient.isRemote()` returns `_active`, a STALE mirror updated only by `refresh()`.
`refresh()` runs LATER, inside `ensureServerRunning()` (called at ~line 1339, AFTER the swap).
So the swap reads `_active` from the PREVIOUS gen. On the first gen right after Pod connect/
reconnect, `_active` is still `false` → swap skipped → bf16 filename locked → THEN refresh sets
remote=true → bf16 workflow runs on the Pod → ComfyUI rejects (`unet_name ...bf16... not in []`).
The `comfyController.js:31-33` comment already documents this exact race for DEPS; it bit the
workflow swap too. Every LTX gen path goes through this one swap block (no path bypasses it).

## Three engine signals that disagree (engine-signal + server agents)

1. `remoteEngineClient.isRemote()` (renderer) = `_active`, no podId check. STALE between refreshes.
2. `remoteModels.isRemoteActive()` (server) = `active && podId` (stricter). Fresh (reads in-process `_mode`).
3. `forceLocal` (per-gen MPI-74 override). Reaches the workflow swap + `getEngine()`, but NOT the deps
   resolver — so when force-local is on, `isModelUsable`/`_engine()` still assess the Pod engine.

Disagreement windows: after connect (renderer `_active` false before first refresh), after
disconnect+DELETE (MPI-156 wedge), `active:true && podId:null` boot-gate (renderer true, server false).

## Engine-variant smeared across 3 mechanisms (deps + workflow agents)

Same concept ("this is the Pod variant") expressed 3 ways:
- DEPS: `localDeps` / `remoteDeps` on the model (structural, MPI-163).
- WORKFLOW: `ggufWhenRemote` bool + `_toGgufFilename` string surgery.
- THREADING: every consumer calls `isRemote()` independently (the smear).

## Deps call-site census (deps-resolver agent) — post-MPI-163 state

CORRECT (engine passed): syncModelInstalled (modelRegistry:97), isModelUsable (:259),
isOperationInstalled (:287), _installedOpsOf (MpiModelManager:167), _draftDepIds (:212),
size/vram (:410/412), _findModelNotLocal (commandExecutor:412 hardcoded 'local'),
_filterDepsForEngine (downloadManager:66), node-restore (shared:559 hardcoded 'local').

INTENTIONAL UNION (shared-dep protection): _findOtherModelsUsingDep (downloadManager:79),
_remoteSharedDepIds (:100), getModelDependencies (modelRegistry:216, display-only).

RESIDUAL UNION RISK (beyond original MPI-163, found by this investigation):
- `_confirmWholeUninstall` (MpiModelManager:241) sends UNION (14 deps) to uninstall; the uninstall
  route has NO server-side engine filter. Low-harm locally (gguf absent → no-op trash) but
  semantically wrong, and on a Pod it logs bf16 as "removed". → fix in Phase C.
- `_opUninstallDepIds` (MpiModelManager:221-222) UNION — LATENT (no current op-keyed+engine-split model).
- `MpiPromptBox:137` deriveInstalledOps no engine — guarded by `if(!model?.operations) return` (LTX flat
  exits early); LATENT for future op-keyed+engine-split.

## Server side (server-boundaries agent)

Server DEPS resolution is engine-correct everywhere (the two unions are intentional). `_filterDepsForEngine`
is a server defense vs a stale client. `/comfy/models/check*` does NOT re-resolve — renderer owns that
engine filter (a gap if renderer sends a wrong-engine list). ComfyUI-GGUF (now in remoteDeps) flows
correctly to the Pod via `_startRemoteDownload → remoteInstallDep → /wrapper/models/install` with
`requirements_only` self-heal. Server signal `isRemoteActive()` is fresh; can disagree with renderer.

## comfy_engine rule is STALE

`.claude/rules/comfy_engine.md` never mentions engine-split, localDeps/remoteDeps, ggufWhenRemote, or
the workflow swap. Agents reading it get a model that doesn't match the code. → rewrite in Phase C.
