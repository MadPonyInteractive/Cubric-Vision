/**
 * routes/downloadManager.js — Non-blocking, single-stream download manager.
 *
 * Endpoints:
 *   POST /comfy/models/download/start   — enqueue a model's deps
 *   POST /comfy/models/download/cancel  — clean stop + remove partial (user intent)
 *   GET  /comfy/downloads/status         — full queue snapshot
 *   GET  /comfy/downloads/stream         — SSE stream
 *
 * Resume contract (MPI-317): cancel is INTENT → partial deleted; failure/stall/app
 * shutdown is ACCIDENT → partial kept, next attempt resumes via Range. Safe because
 * the installed NDH clears __isResumed on a 200-not-206 answer and reopens the file
 * in truncate (not append) mode — the MPI-258 Bug 2 corruption (full 200 body
 * appended onto a partial) cannot recur on this version. A resumed stream skips the
 * MPI-296 incremental hash (it'd only see the tail) and falls back to the full disk
 * re-read in _verifySha256; a hash mismatch still scrubs the file, so a corrupt
 * partial costs one failed verify, never a corrupt install.
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
// trash@8 is ESM-only; lazy-load via dynamic import for CommonJS interop
let _trashFn = null;
async function _trash(p) {
    if (!_trashFn) {
        const mod = await import('trash');
        _trashFn = mod.default;
    }
    return _trashFn(p);
}
const crypto = require('crypto');
const nodeStream = require('stream'); // MPI-296 — Writable hash-sink for streaming SHA256
const { createRequire } = require('module');
const logger = require('./logger');
const { checkOnline } = require('./netCheck');
// runCustomCommand dropped here with the per-node requirements step (MPI-413); it is
// still exported from shared.js and used by the remote path's Pod wrapper contract.
const { resolveComfyPath, getCustomRoot, cleanEmptyDirs, getUniversalWorkflowDepIds, getDefaultModelsRoot, processState, writeNodeCommitMarker } = require('./shared');
const { getComfyPath, getEngineRoot } = require('./platformEngine');
// MPI-410: the indeterminate/sweep rule lives here — one contract, node-tested.
const { isNodeTickPending } = require('./install/computeProgress');
const {
    isCompleteOnDisk,
    isNodeInstalledOnDisk,
    isDepInstalledOnDisk,
    markDownloadInProgress,
    clearDownloadMarker,
    getPartialDownloadState,
    getPartialBytes,
    getDownloadMarkerPath,
} = require('./downloadCompletion');
const { DownloaderHelper } = require('node-downloader-helper');
const remoteModels = require('./remoteModels');
const { createInstallStore } = require('./install/installStore');
const { createReconciler } = require('./install/reconciler');

const _require = createRequire(__filename);
let _extractZip = null;

// Extract a custom-node archive (GitHub /archive/ or Comfy Registry zip).
// Fast path: native `tar` (bsdtar on Windows/macOS = libarchive, reads zip) —
// ~2.7x faster than pure-JS extract-zip on Windows (the villain was extract-zip's
// single-file JS write loop, not decompression), and streams one entry at a time
// in a separate process = constant RAM regardless of file count. GNU tar on Linux
// can't read zip, so ANY tar failure falls back to extract-zip (Linux keeps today's
// exact behaviour). Remote/Pod nodes are image-resident and never reach this path.
// See MPI-248 for measurements + the bite-back watchlist.
async function _extractZipArchive(zipPath, extractDir) {
    const dir = path.resolve(extractDir);
    try {
        const { execFile } = _require('child_process');
        const { promisify } = _require('util');
        await promisify(execFile)('tar', ['-xf', zipPath, '-C', dir], { windowsHide: true });
        return;
    } catch (err) {
        logger.warn('download', `native tar extract failed (${err.message}) — falling back to extract-zip`);
    }
    if (!_extractZip) {
        _extractZip = _require('extract-zip');
    }
    await _extractZip(zipPath, { dir });
}

// MPI-243: is a custom-node folder actually EXTRACTED, or just a shell created by a
// `targetPath` weight that lands under it? MPI-387 F1 moved the predicate to
// downloadCompletion.js — the same test decides install state in three other places.
const _nodeFolderHasFiles = isNodeInstalledOnDisk;

// MPI-387: build the end-of-batch failure message from the two failure kinds a
// node install can hit. Extraction and pip are different problems with different
// user actions, and the old single sentence claimed "extractions failed" for both.
function _describeNodeInstallFailures(extractFailures, installFailures) {
    const parts = [];
    if (extractFailures.length) {
        parts.push(`could not extract ${extractFailures.length} custom node(s): ${extractFailures.join('; ')}`);
    }
    if (installFailures.length) {
        parts.push(`dependency install failed for ${installFailures.length} custom node(s): ${installFailures.join('; ')}`);
    }
    return `Custom node install failed — ${parts.join(' and ')} — see logs`;
}

const ENGINE_ROOT = getEngineRoot();

// ── Engine-aware dep filter (server-side defense) ─────────────────────────────
// The renderer resolves a model's deps for the target engine before POSTing, but
// a stale client / direct API call could send the wrong set. Re-resolve the
// model's engine-correct universe and keep only incoming deps whose id is in it.
// Unknown model (universal/no entry) → pass dependencies through unchanged. (MPI-163)
function _filterDepsForEngine(modelId, dependencies, engine) {
    if (!Array.isArray(dependencies)) return [];
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return dependencies;
    const allowed = new Set(resolveFullUniverse(model, null, engine));
    return dependencies.filter(d => d && allowed.has(d.id));
}

// MPI-179 — intersecting alone cannot HEAL a wrong-engine request: a renderer
// with a stale engine mirror resolves the OTHER engine's universe, so the set
// it sends simply lacks this engine's required weights. The intersect then
// silently installs a partial model (live 2026-07-02: a No-GPU download Pod
// install of LTX dropped the bf16 but never added the GGUF transformer — the
// model read INSTALLED with no transformer on the volume). engines[engine]
// extraDeps are required for this engine regardless of drafted ops — union any
// missing ones back in; install dedupe still skips deps already on disk/volume.
function _withEngineExtraDeps(modelId, dependencies, engine) {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const model = MODELS.find(m => m.id === modelId);
    const extraIds = model?.engines?.[engine]?.extraDeps || [];
    const have = new Set(dependencies.map(d => d.id));
    const missing = extraIds.filter(id => !have.has(id)).map(id => DEPS[id]).filter(Boolean);
    return missing.length ? dependencies.concat(missing) : dependencies;
}

// ── Shared-dep helper ─────────────────────────────────────────────────────────

// Local variant of the shared-dep guard (MPI-216). The old `_findOtherModelsUsingDep`
// filtered on `m.installed === true` — a RENDERER-ONLY flag (set by syncModelInstalled)
// that is NEVER defined in the backend (Node) process, so the guard ALWAYS returned []
// and a local uninstall deleted SHARED deps. That is the exact bug MPI-122 fixed for the
// REMOTE path (`_remoteSharedDepIds`, which checks the Pod volume) but the local path was
// never given the fix: uninstalling LTX-2.3 high trashed the Gemma + VAEs + LoRAs that the
// balanced tier shares. Here we stat the LOCAL disk (same custom-root + default-root +
// recursive-search + completeness logic as /comfy/models/check) to learn which OTHER model
// is WHOLE-MODEL installed (every dep complete on disk), and protect that model's deps —
// plus any dep with a live in-flight install job. Returns depId → [modelName, …].
// MPI-258 replaced the earlier per-dep on-disk test (see the loop below for why).
async function _localSharedDepsMap(excludeModelId) {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse, deriveInstalledOps, resolveDeps } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const comfyRoutes = _require('./comfy.js');
    // Stat against the FULL universe so per-op completeness can be derived below —
    // deriveInstalledOps needs the disk status of every op's deps, not just one op's.
    const others = MODELS
        .filter(m => m.id !== excludeModelId)
        .map(m => ({ model: m, depIds: resolveFullUniverse(m) }))
        .filter(o => o.depIds.length > 0);
    const checkModels = others.map(({ model, depIds }) => ({
        id: model.id,
        deps: depIds.map(depId => {
            const d = DEPS[depId] || {};
            return { id: depId, type: d.type, filename: d.filename };
        }),
    }));
    const map = new Map(); // depId → Set<modelName>
    const multiModelDeps = _multiModelDepIds();
    const results = await comfyRoutes.localModelsCheck(checkModels);
    for (const { model } of others) {
        const entry = results[model.id];
        if (!entry) continue;
        // MPI-276: protect the deps of the OPS this model actually has on disk, not
        // the whole universe. The old gate (`entry.installed !== true`) required
        // EVERY op complete, so an op-partial install (e.g. Wan 2.2 Smooth with only
        // I2V installed) counted as "not installed" and protected NOTHING — a sibling
        // uninstall then trashed the shared clip/VAE both models need, cascading the
        // op-partial model out too. deriveInstalledOps gives fullyInstalled (common +
        // ≥1 op complete) and the installed-op list; we protect commonDeps + those
        // ops' deps only.
        //
        // MPI-310: "is this model a live install" must be answered from its EXCLUSIVE
        // deps, never from the shared ones. Both previous rules conflated the two and
        // each was circular in an opposite direction:
        //
        //   - per-dep on-disk (pre-MPI-258): a shared file counted as proof for every
        //     model that declares it, so a tier family protected the SAME idle copy
        //     from both sides while neither was installed → ~19GB undeletable (258 B1).
        //   - fullyInstalled (MPI-258/276): a shared COMMON dep is itself an input to
        //     the gate, so the instant that weight went missing every model needing it
        //     stopped defending it and the next uninstall deleted it for good, cascading
        //     across the family (MPI-310 — 5.24GB of user data destroyed).
        //
        // Exclusive deps break both cycles. A dep no other model declares cannot be
        // someone else's footprint, so it is honest evidence THIS model is installed;
        // and because it is exclusive it can never be the shared file under judgement,
        // so the answer no longer depends on the file being protected. An absent-
        // transformer tier has no exclusive footprint → protects nothing → still
        // deletable (258 B1 stays fixed). A model whose shared encoder was deleted
        // still has its own transformer → still defends what it declares (310 fixed).
        //
        // Models with NO exclusive deps at all (a pure subset of another card) fall
        // back to any-footprint: there is no exclusive evidence to demand, and the
        // tier cycle needs a shared-only pair to form.
        const depStatus = new Map((entry.deps || []).map(d => [d.id, d.installed === true]));
        const { installedOps } = deriveInstalledOps(model, id => depStatus.get(id) === true, 'local');
        const exclusive = (entry.deps || []).filter(d => !multiModelDeps.has(d.id));
        const evidence = exclusive.length ? exclusive : (entry.deps || []);
        if (!evidence.some(d => d.installed === true)) continue;
        // null engine → union of both engine sets (never delete a weight the remote
        // engine also needs), matching the pre-MPI-276 protection stance.
        const protectedDeps = resolveDeps(model, installedOps.length ? installedOps : null, null, null);
        for (const depId of protectedDeps) {
            if (!map.has(depId)) map.set(depId, new Set());
            map.get(depId).add(model.name);
        }
    }
    // Mid-install protection (was the reason for the old per-dep test): a dep that is
    // ACTIVELY downloading/queued for another model right now must never be trashed.
    // MPI-276: the refCount lie is gone — liveness is now a STORE query. A dep is
    // in-flight iff some NON-TERMINAL model job still references it
    // (store.activeModelsForDep). That replaces the old `_depJobs.status` map read
    // (which lingered as 'complete'/'idle' and could mis-protect). We exclude the
    // model being uninstalled so its own just-cancelled job never self-protects.
    for (const depId of _inFlightDepIds(excludeModelId)) {
        if (!map.has(depId)) map.set(depId, new Set());
        map.get(depId).add('(installing)');
    }
    // MPI-304 — a flow's own deps belong to no model, so nothing above protects them.
    for (const depId of _flowRequiredDepIds()) {
        if (!map.has(depId)) map.set(depId, new Set());
        map.get(depId).add('(flow)');
    }
    // MPI-310 — same gap one entity further out: a PLUGIN's deps belong to no model
    // AND no flow, so neither sweep above protects them.
    for (const depId of _pluginRequiredDepIds(excludeModelId)) {
        if (!map.has(depId)) map.set(depId, new Set());
        map.get(depId).add('(plugin)');
    }
    return map;
}

// ── Orphan sweep (MPI-462) ────────────────────────────────────────────────────
//
// Uninstall only ever considers the deps of the model being uninstalled. A dep that
// was KEPT because a sibling defended it (the MPI-310 exclusive-evidence rule in
// _localSharedDepsMap) is never revisited when that sibling later stops being
// installed — no code path re-asks "does anyone still want this?". The file is then
// stranded: owned by no installed model, and offered to no uninstall, because a
// not-installed model's card shows Install and never Uninstall.
//
// That is how MPI-462 accumulated 15.91GB (a 10.59GB Boogu text encoder + the Chroma
// ControlNet and style LoRAs), and how MPI-314 accumulated 18.62GB of LTX deps before
// it. MPI-314 reclaimed its files BY HAND and closed calling them "a one-time fossil,
// not a live leak" — 19 days later a different model family stranded a fresh 15.91GB,
// so that verdict was wrong and this is the missing collector.
//
// The orphan test asks the SAME protection primitive the uninstall guard uses, with
// NOTHING excluded: `_localSharedDepsMap(null)` already unions every installed model's
// deps, live install jobs, flow deps and plugin deps. A dep on disk that is absent from
// that map is wanted by nobody. Deliberately NOT a second, parallel notion of "orphan"
// — one wrong answer here deletes user weights (MPI-310 destroyed 5.24GB that way).
function _orphanedDepIds(protectedMap) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const universal = new Set(getUniversalWorkflowDepIds());
    return Object.keys(DEPS).filter((id) => {
        const d = DEPS[id];
        if (!d || !d.filename) return false;
        // WEIGHTS ONLY. A custom_nodes entry is work-not-bytes (it stays on disk after
        // uninstall by design). Node folders are never swept — the dev machine used to
        // link ComfyUI-MpiNodes straight at its source repo here, and a sweep would have
        // destroyed it; the link is gone, the exclusion still stands on its own merit.
        // targetPath deps are engine-anchored, outside the models root this may touch.
        if (d.type === 'custom_nodes' || d.targetPath) return false;
        return !protectedMap.has(id) && !universal.has(id);
    });
}

// Trash every orphaned dep that is really on disk inside the managed models root.
// Same trash-then-permanent-delete fallback as the uninstall loop (a 25GB weight
// exceeds the Recycle Bin quota, and a sweep that silently no-ops frees nothing).
async function _sweepOrphanedDeps(managedModelsRoot, defaultModelsRoot, customRoot) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const protectedMap = await _localSharedDepsMap(null);
    const swept = [];
    for (const depId of _orphanedDepIds(protectedMap)) {
        const d = DEPS[depId];
        let localPath;
        if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: d.type, filename: d.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, d.filename);
        }
        if (!_isInsidePath(managedModelsRoot, localPath)) continue;
        if (!(await fs.pathExists(localPath))) continue;
        try {
            try {
                await _trash(localPath);
                logger.info('download', `sweep: moved to trash ${localPath}`);
            } catch (trashErr) {
                await fs.remove(localPath);
                logger.warn('download', `sweep: trash failed (${trashErr.message}) — permanently deleted ${localPath}`);
            }
            await cleanEmptyDirs(localPath, managedModelsRoot);
            await clearDownloadMarker(localPath).catch(() => {});
            _depJobs.delete(depId);
            swept.push({ depId, depName: d.name || depId });
        } catch (err) {
            logger.error('download', `sweep: failed to trash ${localPath}`, err);
        }
    }
    return swept;
}

// MPI-310 — dep ids declared by MORE THAN ONE model, computed over the WHOLE registry.
// Used by BOTH engine guards to split a model's deps into shared vs EXCLUSIVE, so "is
// this model actually installed" is answered only from files that belong to it alone.
// See the local guard for why both earlier rules were circular without this split.
//
// MUST be computed over every model, NOT over the guard's `others` list: `others` omits
// the model being uninstalled, which would make ITS shared deps look exclusive to the
// sibling that also declares them — exactly the tier pair (LTX-2.3 High/Balanced) whose
// mutual protection stranded ~19GB in MPI-258 B1. Exclusivity is a property of the
// registry, never of who happens to be uninstalling.
function _multiModelDepIds() {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const seen = new Set();
    const shared = new Set();
    for (const m of MODELS) {
        for (const depId of (resolveFullUniverse(m) || [])) {
            if (seen.has(depId)) shared.add(depId);
            else seen.add(depId);
        }
    }
    return shared;
}

// MPI-310 — dep ids required by a PLUGIN. Mirror of _flowRequiredDepIds below, for the
// third entity: see js/data/pluginsRegistry.js for why plugins are neither models nor
// apps. Same both-engines requirement.
//
// UNLIKE the app twin this honours `excludeUninstallId`, because plugins are the first
// entity with a user-facing Uninstall button. Protecting a plugin's deps unconditionally
// would make its own uninstall a no-op — the guard cannot otherwise tell "some unrelated
// model is being uninstalled, keep this" from "the OWNER is being uninstalled, delete
// it". That is the same self-protection problem `excludeModelId` already solves for
// models (see the in-flight sweep above), so it is solved the same way rather than with
// a second uninstall route that would duplicate every shared-dep check.
//
// Deps stay protected here when ANOTHER plugin also requires them, so a shared weight
// survives until its last owner is gone.
function _pluginRequiredDepIds(excludeUninstallId) {
    const { PLUGINS, pluginDepKey } = _require('../js/data/pluginsRegistry.js');
    const out = new Set();
    for (const plugin of PLUGINS) {
        if (pluginDepKey(plugin.id) === excludeUninstallId) continue;
        for (const depId of (plugin.requiredDeps || [])) out.add(depId);
    }
    return out;
}

// MPI-304 — dep ids required by an APP. Both uninstall guards below build their
// protected set from MODELS only, so a dep that no model requires (an app-only LoRA,
// detector or node pack) is invisible to them and gets trashed by the next model
// uninstall — the app then silently breaks with a "lora not found" deep in ComfyUI.
// Apps have no engine-split weights and no per-op resolution, so this is a flat union
// of every app's requiredDeps, protected for BOTH engines.
//
// Protection is unconditional (not gated on "is this app installed"): unlike a model,
// a flow has no install state of its own — its deps ARE its install state, so gating
// protection on their presence would be circular.
function _flowRequiredDepIds() {
    const { FLOWS } = _require('../js/data/flowsRegistry.js');
    const out = new Set();
    for (const flow of FLOWS) {
        for (const depId of (flow.requiredDeps || [])) out.add(depId);
    }
    return out;
}

// Dep ids held by a live (non-terminal) model job OTHER than excludeModelId.
// The store is the SOT for "is this dep still being installed right now" (G5:
// refCount deleted). Used by BOTH engine uninstall guards.
function _inFlightDepIds(excludeModelId) {
    const out = new Set();
    for (const job of store.allModelJobs()) {
        if (job.modelId === excludeModelId) continue;
        if (store.MODEL_TERMINAL.has(job.status)) continue;
        for (const d of job.deps) out.add(d.id);
    }
    return out;
}

// Remote variant of the shared-dep guard. `_findOtherModelsUsingDep` trusts the
// renderer-only `MODELS[].installed` flag, which is NEVER set in the backend
// (Node) process — `installed` is resolved at runtime by the renderer's
// syncModelInstalled(). So in remote mode that guard always returned 0 and a
// remote uninstall deleted SHARED deps (e.g. uninstalling Wan I2V trashed the
// wan_2.1_vae + umt5 text-encoder that Wan T2V also needs → T2V went PARTIAL).
// Here we resolve "other model is installed" from the actual Pod VOLUME via the
// wrapper (remoteModelsCheck) instead of the dead flag. Returns the set of dep
// ids that ARE still needed by another volume-installed model (must be kept).
async function _remoteSharedDepIds(excludeModelId) {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse, deriveInstalledOps, resolveDeps } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    // Full dep universe per model (commonDeps + every op) so op-specific + common
    // deps of another volume-installed model are kept, not the gone flat list. (MPI-122)
    const others = MODELS
        .filter(m => m.id !== excludeModelId)
        .map(m => ({ model: m, depIds: resolveFullUniverse(m) }))
        .filter(o => o.depIds.length > 0);
    // Ask the wrapper which of those models are installed on the volume. Pass each
    // model's deps as { id, type, filename } (remoteModelsCheck owns the split).
    const checkModels = others.map(({ model, depIds }) => ({
        id: model.id,
        deps: depIds.map(depId => {
            const d = DEPS[depId] || {};
            return { id: depId, type: d.type, filename: d.filename };
        }),
    }));
    const keep = new Set();
    const multiModelDeps = _multiModelDepIds();
    try {
        const out = await remoteModels.remoteModelsCheck(checkModels);
        const results = (out && out.results) || {};
        for (const { model } of others) {
            const entry = results[model.id];
            if (!entry) continue;
            // MPI-276: protect the deps of the OPS this model has on the volume, not
            // the whole universe. Old gate (`installed === true`) required EVERY op
            // complete, so an op-partial volume install protected nothing and a
            // sibling uninstall trashed the shared clip/VAE both need. Mirrors the
            // local guard — including MPI-310 replacing the CIRCULAR fullyInstalled gate
            // with EXCLUSIVE-dep evidence (a shared common dep fed the gate that decided
            // whether to protect it, so a missing weight disarmed its own protection;
            // the pre-258 per-dep rule was circular the other way and stranded ~19GB).
            // See the local twin for the full reasoning; these two must stay identical.
            const depStatus = new Map((entry.deps || []).map(d => [d.id, d.installed === true]));
            const { installedOps } = deriveInstalledOps(model, id => depStatus.get(id) === true, 'remote');
            const exclusive = (entry.deps || []).filter(d => !multiModelDeps.has(d.id));
            const evidence = exclusive.length ? exclusive : (entry.deps || []);
            if (!evidence.some(d => d.installed === true)) continue;
            const protectedDeps = resolveDeps(model, installedOps.length ? installedOps : null, null, null);
            for (const depId of protectedDeps) keep.add(depId);
        }
    } catch (err) {
        // Fail SAFE: if we cannot confirm volume state, keep nothing extra here —
        // the caller still falls back to the universal guard. (Better to leave an
        // orphan dep than to delete a shared one we could not verify; see below —
        // the caller treats an empty set as "no protection" only when the check
        // genuinely returned, so a thrown check is surfaced, not silently trusted.)
        logger.warn('download', `remote shared-dep check failed: ${err.message}`);
        throw err;
    }
    // MPI-276: remote uninstall previously had NO in-flight protection — a dep
    // actively installing for another model on the volume could be trashed mid-
    // download. Mirror the local guard: keep any dep a live (non-terminal) model
    // job still references. Store is the SOT (refCount deleted, G5).
    for (const depId of _inFlightDepIds(excludeModelId)) keep.add(depId);
    // MPI-304 — mirror of the local guard: app-only deps belong to no model, so the
    // MODELS sweep above cannot protect them. Fixed in the SAME pass as the local twin
    // (CLAUDE.md engine-split rule — a one-engine fix here is a false done).
    for (const depId of _flowRequiredDepIds()) keep.add(depId);
    // MPI-310 — plugin twin, fixed in the same pass for the same reason. Honours the
    // exclusion so a plugin's own uninstall can actually delete its weight (see the
    // local twin's comment for why this differs from the app guard above).
    for (const depId of _pluginRequiredDepIds(excludeModelId)) keep.add(depId);
    return keep;
}

// ── Orphan sweep, REMOTE twin (MPI-464) ───────────────────────────────────────
//
// MPI-462 shipped the collector on the LOCAL uninstall route only; the remote branch
// returns before it, so a Pod volume strands the same ownerless weights — and the
// volume PERSISTS across Pod restarts, so the user keeps paying for the disk. Exactly
// the half-wire the engine-split rule exists to stop (.claude/rules/comfy_engine.md).
//
// Same primitive, no second notion of "orphan": `_remoteSharedDepIds(null)` is the
// remote twin of `_localSharedDepsMap(null)` (it already unions every VOLUME-installed
// model's deps, live install jobs, flow deps and plugin deps), and `_orphanedDepIds`
// is reused UNCHANGED — it only calls `.has`, which a Set answers exactly like a Map,
// so both engines classify through one function and its refusals (never custom_nodes,
// never targetPath, never universal) apply here for free.
//
// The one piece with no local analogue is the inventory: the local sweep gets "is it
// really there" free from fs.pathExists, and there is no such stat for the volume.
// It needs NO new wrapper endpoint — remoteModelsCheck accepts a pseudo-model, which
// is how the reconciler already asks (see _reconcileOutstandingRemoteDeps).
async function _sweepOrphanedDepsRemote() {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const protectedIds = await _remoteSharedDepIds(null);
    // `bakedOnPod` weights live in the Pod IMAGE, not on the volume — remoteModelsCheck
    // reports them installed (_isImageResident) but the wrapper cannot delete them, so
    // asking would be a guaranteed not_found. This is the remote face of the local
    // `targetPath` refusal (a targetPath dep is image-resident here too, and
    // _orphanedDepIds already dropped it).
    const candidates = _orphanedDepIds(protectedIds).filter((id) => !DEPS[id].bakedOnPod);
    if (!candidates.length) return [];
    const out = await remoteModels.remoteModelsCheck([{
        id: '__sweep__',
        deps: candidates.map((id) => ({ id, type: DEPS[id].type, filename: DEPS[id].filename })),
    }]);
    const entry = (out && out.results && out.results.__sweep__) || {};
    const onVolume = (entry.deps || []).filter((d) => d.installed === true);
    // The classification, logged BEFORE anything is deleted. This is deletion aimed at a
    // user's Pod volume, so the audit line is the record of what the classifier decided —
    // read it in app.log when this fires, the same way the local sweep's per-file lines
    // are read. `swept 0` is a healthy result; a jump in `onVolume` is what to question.
    logger.info('download', `remote sweep: ${protectedIds.size} protected, ${candidates.length} eligible, ${onVolume.length} on volume`);
    const swept = [];
    for (const d of onVolume) {
        const dep = DEPS[d.id];
        if (!dep) continue;
        try {
            const res = await remoteModels.remoteUninstallDep({ id: d.id, type: dep.type, filename: dep.filename });
            // An older Pod image has no delete endpoint. That is a no-op for the whole
            // sweep, not an error and not a per-dep retry — stop asking.
            if (res && res.status === 'unsupported') break;
            logger.info('download', `remote sweep: deleted ${d.id} (${dep.filename}) from the volume`);
            _depJobs.delete(d.id);
            swept.push({ depId: d.id, depName: dep.name || d.id });
        } catch (err) {
            logger.error('download', `remote sweep: failed to delete ${d.id}: ${err.message}`);
        }
    }
    return swept;
}

function _isInsidePath(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

// Uninstall path derivation (MPI-276). For a custom_nodes dep the install path
// extracts to the FOLDER `custom_nodes/<dep.filename>/` and the zip is removed
// right after (see _runCustomNodeInstall: targetDir = extractDir/dep.filename,
// fs.remove(zipPath)). The old uninstall re-derived `custom_nodes/<name>.zip` —
// the long-gone zip — so the delete no-op'd yet the loop still reported the dep
// in removed[] and logged a lie. Target the extracted folder instead. Weight
// deps are unchanged (resolved by the caller against the models roots).
function _customNodeUninstallPath(dep, customNodesRoot) {
    return path.join(customNodesRoot, dep.filename);
}

// ── Job Storage ────────────────────────────────────────────────────────────────
const _depJobs = new Map();       // depId → DepJob
const _modelJobs = new Map();     // modelId → DownloadJob
const _activeDownloaders = new Map(); // depId → FileDownloader (actively downloading)
// 3 parallel deps. Was 1 (commit 47e924a) only because parallel HF/Xet streams
// fought over throttled bandwidth and made each other worse. Now that all MPI
// weights are on R2 (free egress, no wave-throttle, MPI-129), parallel pulls no
// longer self-throttle, so multi-dep installs (Wan = 4 files + encoders) finish
// faster. Kept modest — a single R2 stream already saturates a typical link, so
// 3 overlaps small deps with large ones without thrashing. (MPI-140)
const LOCAL_DOWNLOAD_CONCURRENCY = 3;

function _createDepJob(dep) {
    return {
        id: dep.id,
        url: dep.url,
        type: dep.type || null,
        filename: dep.filename || null,
        localPath: null,
        status: 'queued',
        downloadedBytes: 0,
        totalBytes: 0,
        // MPI-95 — registry-size floor for the aggregate denominator. The wrapper
        // reports each dep's REAL `total` only once its install emits a first tick;
        // until then totalBytes can be 0. Summing only arrived totals shrinks the
        // denominator so the bar hits 100% while other deps are still pending
        // ("sits at 100%"). seedBytes keeps every dep counted at its best-known
        // size from the moment the job is created.
        seedBytes: _parseSizeToBytes(dep.size),
        error: null,
        sha256Expected: dep.sha256 || null,
        // MPI-429 — explicit second origin for deps whose byte-identical copy lives in a
        // third-party repo under a different path AND filename, so no rewrite can reach
        // it. Generated from the classification sweep; absent for everything the generic
        // prefix rewrite already covers. See _mirrorUrlsFor.
        mirrorUrl: dep.mirrorUrl || null,
        noMirror: dep.noMirror || false,
    };
}

// MPI-95 — a dep's best-known total for the aggregate denominator: the wrapper's
// real total once it has arrived, else the registry seed, so a not-yet-emitting
// dep is never counted as 0 (which would let the bar reach 100% early).
// MPI-164 — real total WINS over the seed (no Math.max): when the declared
// registry size overestimates the real bytes, max() kept the inflated seed in
// the denominator and the remote bar finished short (~95-98% on the LTX GGUF
// set). Same rule the local path already uses in _wireProgress.
function _depDenominator(d) {
    return d.totalBytes || d.seedBytes || 0;
}

// MPI-231 — byte-ratio for the download bar, custom_nodes EXCLUDED (work-not-bytes).
// A GitHub `/archive/` zip has no Content-Length (denominator falls back to a tiny
// registry seed) while the numerator counts real streamed bytes, and the requirements
// pip phase pulls ~200MB of wheels with no honest total up-front — a node's bytes make
// a determinate bar overshoot (RES4LYF read "203 MB / 15 MB"). Summing only weight deps
// keeps both sides honest; the emitting tick decides whether to show the sweep instead.
// `active` = 'local' (seed fallback) | 'remote' (real-total-or-seed via _depDenominator).
function _byteRatioExcludingNodes(deps, active = 'local') {
    let downloaded = 0;
    let total = 0;
    for (const d of deps) {
        if (d.type === 'custom_nodes') continue;
        downloaded += d.downloadedBytes || 0;
        total += active === 'remote' ? _depDenominator(d) : (d.totalBytes || d.seedBytes || 0);
    }
    return { downloaded, total };
}

function _createModelJob(modelId, deps) {
    return {
        id: modelId,
        modelId,
        status: 'queued',
        totalBytes: 0,
        downloadedBytes: 0,
        speed: '',
        deps: [],
        progress: 0,
        installCustomNodes: deps.some(d => d.type === 'custom_nodes'),
    };
}

// ── FileDownloader (node-downloader-helper wrapper) ──────────────────────────
// Plain single-stream NDH wrapper: start, cancel (clean stop + remove), no
// pause/resume — resume was removed (MPI-258 Bug 2, the 200-vs-206 append
// corruption); the class was renamed from ResumableDownloader to match (MPI-276).
// NDH itself stays — it downloads every engine + model file.

class FileDownloader {
    constructor(depJob, localPath) {
        this.depJob = depJob;
        this.localPath = localPath;
        // MPI-429 — depJob.url is MUTATED by a mirror failover, so the url at failure time
        // is whichever mirror died last. The user-facing error must keep naming the origin
        // they recognise (models.cubric.studio) — a hostname they have never seen sends
        // them straight back to the GitHub bug report MPI-427 exists to prevent. Which
        // mirrors were tried is a log concern, not an error-message one.
        this._originUrl = depJob.url;
        this._downloader = null;
        this.onProgress = null;
        this._eventsBound = false;
        // MPI-291 — byte-flow stall watchdog. Last moment a progress tick moved bytes.
        // Seeded at construction so a downloader that never emits a single tick (dead
        // socket from the start, distinct from the timeout:30000 no-response case) is
        // still caught. _watchdogSweep() force-errors any downloader quiet past the window.
        this._lastByteTs = Date.now();
        this._lastBytes = -1;
        // MPI-460 — same-url retry budget (see the 'error' handler). Counts only
        // in-place restarts of THIS dep; a mirror failover spends its own walk.
        this._attempts = 0;
        this._retryTimer = null;
        // MPI-296 — SHA256 computed incrementally while the file streams in, so the
        // post-download verify never re-reads the whole file (killed a 35s wall on a
        // 6.6GB weight). Valid only for FRESH streams (pipe sees every byte once, in
        // order); a RESUMED stream (MPI-317) nulls the hash in the 'download' handler
        // and _verifySha256 falls back to the disk re-read. Reset on each 'download'
        // (DHL re-emits it on retry after clearing __pipes). _streamHashHex holds the
        // final digest for _verifySha256's in-memory fast path; null → disk re-read.
        this._streamHash = null;
        this._streamHashHex = null;
    }

    _bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        // MPI-296 — attach an incremental SHA256 sink to the download stream. DHL pipes
        // the HTTP response through registered pipes BEFORE the file write, so this sees
        // the same bytes the file gets. Fires at each stream start (incl. retry, where
        // DHL clears __pipes and re-emits 'download'), so re-create the hash + re-register.
        // DHL chains registered pipes IN SERIES ahead of the file write
        // (response → pipe1 → … → fileStream), so this MUST be a Transform that
        // forwards every chunk unchanged — a Writable would swallow the bytes and
        // starve the file stream. Hash on the way through, pass the chunk along.
        this._downloader.on('download', (evt) => {
            // MPI-317: on a RESUMED stream the pipe only sees bytes from the resume
            // offset — an incremental hash would be tail-only garbage that fails
            // verify and scrubs a good file. Null the hash instead; _verifySha256
            // falls back to its full disk re-read (slower, correct). Fresh (non-
            // resumed) starts keep the MPI-296 fast path.
            if (evt && evt.isResumed) {
                this._streamHash = null;
                this._streamHashHex = null;
                return;
            }
            this._streamHash = crypto.createHash('sha256');
            this._streamHashHex = null;
            const hashPass = new nodeStream.Transform({
                transform: (chunk, _enc, cb) => { this._streamHash.update(chunk); cb(null, chunk); },
            });
            this._downloader.pipe(hashPass);
        });

        // Progress — forwarded to our onProgress callback
        this._downloader.on('progress', (stats) => {
            const speed = stats.speed || 0;
            // MPI-291 — only a real byte advance resets the stall clock. A repeated
            // same-total tick with no new bytes must NOT count as liveness.
            if (stats.downloaded > this._lastBytes) {
                this._lastBytes = stats.downloaded;
                this._lastByteTs = Date.now();
            }
            this.depJob.downloadedBytes = stats.downloaded;
            this.depJob.totalBytes = stats.total;
            this.depJob.speed = _formatSpeed(speed);
            if (this.onProgress) {
                this.onProgress(stats.downloaded, stats.total, this.depJob.speed);
            }
        });

        // Download finished successfully
        this._downloader.on('end', async () => {
            _activeDownloaders.delete(this.depJob.id);
            // MPI-296 — finalize the incrementally-computed digest so _verifySha256
            // can compare in-memory instead of re-reading the whole file from disk.
            if (this._streamHash) {
                this._streamHashHex = this._streamHash.digest('hex');
                this._streamHash = null;
            }
            try {
                // sha256 re-reads the whole file (~20-60s for 6GB, ~1-2min for Wan's
                // 14GB) with no byte progress — the bar would sit at a dead 100%. Flip
                // each owning model card to the indeterminate "Verifying…" sweep first,
                // reusing the same download:progress {indeterminate, phase} contract the
                // remote path uses (downloadService.js reads phase==='verifying'). (MPI-140)
                //
                // MPI-216: gate the model-level sweep behind allBytesDone, mirroring the
                // remote path (MPI-164). A per-dep verify mid-install (this dep finished,
                // hashing it, while OTHER deps still download) must NOT flip the whole-model
                // bar to an indeterminate "Verifying…" at <100% — the user reads it as a
                // stall. This dep just ended (byte-complete), so mark it complete for the
                // check; custom_nodes are work-not-bytes (excluded, same as remote).
                if (this.depJob.sha256Expected) {
                    this.depJob.downloadedBytes = this.depJob.totalBytes || this.depJob.downloadedBytes;
                    for (const modelJob of _modelJobs.values()) {
                        if (!modelJob.deps.some(d => d.id === this.depJob.id)) continue;
                        const allBytesDone = modelJob.deps.every(d =>
                            d.id === this.depJob.id
                            || d.status === 'complete'
                            || d.type === 'custom_nodes'
                            || (d.downloadedBytes || 0) >= _depDenominator(d));
                        _broadcast('download:progress', {
                            modelId: modelJob.modelId,
                            depId: this.depJob.id,
                            downloadedBytes: allBytesDone ? modelJob.totalBytes : modelJob.downloadedBytes,
                            totalBytes: modelJob.totalBytes,
                            progress: allBytesDone ? 1 : modelJob.progress,
                            indeterminate: allBytesDone,
                            phase: allBytesDone ? 'verifying' : undefined,
                        });
                    }
                }
                await _verifySha256(this.localPath, this.depJob.sha256Expected, this._streamHashHex);
                await clearDownloadMarker(this.localPath);
                _setDepStatus(this.depJob, 'complete', 'downloader end');
                _broadcast('download:complete', { depId: this.depJob.id, modelId: null });
                _checkModelJobsComplete();
                _startPendingDeps();
            } catch (err) {
                // SHA256 mismatch — clean up and mark failed
                await fs.remove(this.localPath).catch(() => {});
                await clearDownloadMarker(this.localPath).catch(() => {});
                _setDepStatus(this.depJob, 'failed', 'downloader fail');
                this.depJob.error = err.message;
                _broadcast('download:failed', { depId: this.depJob.id, error: err.message });
                _checkModelJobsComplete();
                _startPendingDeps();
            }
        });

        // Error occurred — partial is KEPT (removeOnFail:false) so a retry resumes.
        this._downloader.on('error', (err) => {
            _activeDownloaders.delete(this.depJob.id);
            if (this.depJob.status === 'paused' || this.depJob.status === 'cancelled') return;
            // MPI-317: 416 Range Not Satisfiable = the on-disk partial is LARGER than
            // the real file (garbage). Kept, it would 416 on every retry forever —
            // scrub it so the next attempt starts clean. Only this status; a kept
            // partial is the whole point of removeOnFail:false.
            if (err && err.status === 416) {
                fs.remove(this.localPath).catch(() => {});
                clearDownloadMarker(this.localPath).catch(() => {});
            }
            // MPI-427 — a transport failure is the one case worth a SECOND ROUTE before
            // giving up: the object is fine, the path to it is not. Try each mirror
            // origin once, keeping the on-disk partial (path-equal, so MPI-317 resumes
            // it rather than scrapping it). Only transport errors qualify — a SHA256
            // mismatch or a 404 would fail identically on every mirror.
            const blocked = _describeTransportError(err, this._originUrl || this.depJob.url);
            // MPI-429 — remember it, because the RETRY may die for an unrelated reason.
            // A mirror that 404s (a dep we could not re-host, a repo edit) is not a
            // transport error, so without this the user who is genuinely network-blocked
            // gets "downloader error" instead of the VPN remedy — the failover would
            // have COST him the readable message. The original diagnosis still stands:
            // the first route was blocked, and a tunnel is still what fixes it.
            if (blocked) this._blockedMsg = blocked;
            if (blocked) {
                logger.warn('download', `${this.depJob.id}: network-blocked — ${this.depJob.url} — raw: ${err.message}`);
                this._triedUrls = this._triedUrls || new Set([this.depJob.url]);
                // MPI-429 — ALWAYS derive from the ORIGIN url, never from the mutated
                // depJob.url. Two bugs otherwise: the origin gate would reject the second
                // hop (the url is a mirror by then, not an R2 object), and a mirror
                // pathname already carries the previous base's PREFIX, so the next
                // rewrite would double it. _triedUrls is what stops the walk repeating.
                const next = _mirrorUrlsFor(this._originUrl || this.depJob.url, this.depJob)
                    .find(u => !this._triedUrls.has(u));
                if (next) {
                    this._triedUrls.add(next);
                    logger.info('download', `${this.depJob.id}: failing over to mirror ${new URL(next).host}`);
                    this.depJob.url = next;
                    this._rearm();
                    this.download().catch(() => {});   // errors re-enter this handler
                    return;
                }
            }
            // MPI-460 — a transient blip is not a verdict. The stall watchdog's own error
            // (MPI-291) matches no transport pattern, so the failover above never fires for
            // it, and the next statement used to be `failed` — one 60s hiccup discarded a
            // 25GB weight 8.4GB in (live 2026-08-06, origin healthy throughout). Re-enter
            // download(): the MPI-317 resume contract picks the partial back up via Range,
            // so a retry costs seconds, not the bytes. Only an exhausted budget is terminal.
            // A definite 4xx fails identically on every attempt and is not worth one — 416
            // excepted, because the scrub above just made the next attempt a clean start.
            //
            // The gate is BYTES ON DISK, and it is what keeps MPI-427 intact: that user's
            // ISP killed every connection in under 200ms, 44 times, zero bytes landed — for
            // him a retry budget is 22s of silence bought before the remedy he needs to
            // read. Retry defends PROGRESS; it does not argue with a route that never
            // delivered anything.
            const httpStatus = Number(err && err.status) || 0;
            const permanent = httpStatus >= 400 && httpStatus < 500 && httpStatus !== 416;
            const hasProgress = (this.depJob.downloadedBytes || 0) > 0;
            const delay = RETRY_BACKOFF_MS[this._attempts];
            if (hasProgress && !permanent && delay !== undefined) {
                this._attempts += 1;
                logger.warn('download', `${this.depJob.id}: ${err.message} — retry ${this._attempts}/${RETRY_BACKOFF_MS.length} in ${delay / 1000}s (resumes from disk)`);
                this._rearm();
                this._retryTimer = setTimeout(() => {
                    this._retryTimer = null;
                    // A cancel/pause during the backoff wins — cancel() already deleted the
                    // partial, so restarting here would resurrect a download the user killed.
                    if (this.depJob.status === 'cancelled' || this.depJob.status === 'paused') return;
                    this.download().catch(() => {});   // errors re-enter this handler
                }, delay);
                return;
            }
            _setDepStatus(this.depJob, 'failed', 'downloader error');
            this.depJob.error = blocked || this._blockedMsg || err.message;
            this.depJob.networkBlocked = Boolean(blocked || this._blockedMsg);
            _broadcast('download:failed', {
                depId: this.depJob.id,
                error: this.depJob.error,
                networkBlocked: this.depJob.networkBlocked,
            });
            _checkModelJobsComplete();
            _startPendingDeps();
        });
    }

    // MPI-460 — put this downloader back on the active register and restart its byte-flow
    // clock before any IN-PLACE restart (mirror failover or retry). `_activeDownloaders`
    // is written in exactly ONE place (_startPendingDeps), so a restart that only nulled
    // `_downloader` went invisible: no stall watchdog (it iterates the register), no user
    // cancel or uninstall (they look the dep up in it), no shutdown stopKeep — while the
    // launcher counted the freed slot and handed it to another dep. That was MPI-429's
    // failover for its whole life; the retry path would have inherited it.
    _rearm() {
        this._downloader = null;
        this._eventsBound = false;
        this._lastBytes = -1;
        this._lastByteTs = Date.now();
        _activeDownloaders.set(this.depJob.id, this);
        _startStallWatchdog();
    }

    async _ensureDownloader() {
        if (this._downloader) return;
        await fs.ensureDir(path.dirname(this.localPath));

        const fileName = path.basename(this.localPath);
        const destDir = path.dirname(this.localPath);

        // MPI-317 resume contract (resume itself is EXPLICIT — download() calls
        // resumeFromFile on a marker-blessed partial; no resumeIfFileExists here, so
        // NDH never resumes a file the marker doesn't vouch for). Safe on this NDH:
        // a 200-not-206 answer clears __isResumed and truncates instead of appending
        // (the MPI-258 Bug 2 corruption). override:true so a stale COMPLETE file
        // (size === total) is truncated and re-downloaded in place — never a
        // " (1)" duplicate (MPI-243). removeOnStop/removeOnFail:false — NDH must
        // never delete bytes on its own; deletion is OURS and happens only on user
        // cancel (cancel()), url-mismatch scrub, 416 scrub, and SHA256 mismatch.
        this._downloader = new DownloaderHelper(this.depJob.url, destDir, {
            fileName: fileName,
            override: true,
            removeOnStop: false,
            removeOnFail: false,
            // NDH default timeout is -1 (no socket timeout) → a black-hole route
            // (DNS resolves but the server never responds) hangs at 0% forever.
            // 30s socket timeout makes a stalled connection emit 'error' instead
            // of hanging silently. Does NOT cap total download time — it's an
            // inactivity timeout on the socket. (MPI-120)
            timeout: 30000,
        });

        this._bindEvents();
    }

    async download() {
        await this._ensureDownloader();
        // MPI-317: a marker-blessed partial (stall/crash/shutdown left both the file
        // AND its .cubricdl marker) resumes via an explicit Range request — see the
        // header for the full contract and the constructor comment for why the
        // MPI-258 Bug 2 append-corruption cannot recur. Resume ONLY when the marker's
        // url matches this dep's url (a repointed R2 object must not be Range-read
        // into a stale partial — lenient: legacy markers without a url still resume,
        // the SHA256 verify is the net). Everything else — no marker, empty file,
        // url mismatch, stale COMPLETE file (MPI-243) — starts clean; override:true
        // truncates in place, never a " (1)" duplicate.
        const partial = await getPartialDownloadState(this.localPath);
        let markerUrl = null;
        let markerSha = null;
        if (partial.resumable) {
            const marker = await fs.readJson(getDownloadMarkerPath(this.localPath)).catch(() => ({}));
            markerUrl = marker.url || null;
            markerSha = marker.sha256 || null;
        }
        await markDownloadInProgress(this.localPath, {
            depId: this.depJob.id,
            url: this.depJob.url,
            // MPI-429 — the object's real identity. A mirror URL may carry a path prefix
            // (our HF re-host) or a different repo AND filename entirely (a third-party
            // byte-identical copy), so NO url comparison can decide "same object" once a
            // failover has happened — and getting it wrong deletes the partial the
            // failover exists to preserve. The hash can decide it, and does.
            sha256: this.depJob.sha256Expected || null,
        });
        if (partial.resumable && _shouldResumePartial({ sha256: markerSha, url: markerUrl }, this.depJob)) {
            this.depJob.downloadedBytes = partial.downloaded;
            logger.info('download', `resuming ${this.depJob.id} from ${(partial.downloaded / 1073741824).toFixed(2)}GB on disk`);
            // Not awaited (same idiom as start() below): the promise resolves only
            // when the whole download finishes — events drive completion. Errors
            // surface through the 'error' handler; the catch just silences the
            // duplicate floating rejection.
            this._downloader.resumeFromFile(this.localPath, {
                downloaded: partial.downloaded,
                fileName: partial.fileName,
            }).catch(() => {});
            return;
        }
        if (partial.resumable) {
            logger.info('download', `discarding unusable partial for ${this.depJob.id} (marker url mismatch) — clean start`);
            await fs.remove(this.localPath).catch(() => {});
        }
        // Same idiom as resumeFromFile above, and for the same reason: start() returns a
        // promise that settles only when the whole download does. Errors are handled by
        // the 'error' handler; this catch silences the DUPLICATE floating rejection.
        // Without it every non-resume failure escaped to the process-level handler in
        // server.js and printed "[ERROR] [system] Unhandled promise rejection" with a raw
        // driver string — which is a large part of why the MPI-427 reporter read a
        // network condition as the app crashing. The resume path was guarded; this one
        // was not (MPI-427).
        this._downloader.start().catch(() => {});
    }

    // MPI-317: cancel is user INTENT — stop the stream AND delete the partial +
    // marker. stop() itself no longer removes anything (removeOnStop:false), so
    // the deletion here is the only one on this path.
    async cancel() {
        clearTimeout(this._retryTimer);  // MPI-460 — a pending retry must not outlive the cancel
        if (this._downloader) {
            await this._downloader.stop().catch(() => false);
        }
        await fs.remove(this.localPath).catch(() => {});
        await clearDownloadMarker(this.localPath).catch(() => {});
    }

    // MPI-317: shutdown/teardown stop — stream closed, partial + marker KEPT so the
    // next app start resumes via Range. Used by cancelAllDownloads (SIGTERM/SIGINT),
    // never by the user-cancel route.
    async stopKeep() {
        clearTimeout(this._retryTimer);  // MPI-460 — shutdown outranks a pending retry
        if (this._downloader) {
            await this._downloader.stop().catch(() => false);
        }
    }

    // MPI-291 — driven by _watchdogSweep when the socket goes quiet mid-stream past
    // the stall window. NDH's timeout:30000 promises this but does NOT fire on a
    // mid-stream quiet socket (v2.1.11). Stop the stream and route into the EXISTING
    // 'error' → _setDepStatus('failed') → retry/report path — never a raw store poke.
    async forceStall() {
        // stop() prevents NDH from emitting its own late 'end'/'error'; then we
        // synthesize the error so the bound 'error' handler runs the failed path
        // (_setDepStatus('failed') → retry/report). NDH extends EventEmitter, so emit
        // always reaches the handler _bindEvents wired.
        if (!this._downloader) return;
        await this._downloader.stop().catch(() => false);
        this._downloader.emit('error', new Error('Download stalled — no data received.'));
    }
}

// MPI-291 — byte-flow stall watchdog. Self-idling backstop (mirrors
// MpiModelManager._pumpBackstop): runs only while a download is active, stops when
// _activeDownloaders drains. If a downloader hasn't advanced a byte in STALL_MS it's
// force-errored into the existing failed/retry path. Window is longer than NDH's
// timeout:30000 so this is a genuine backstop, not a double-fire.
const STALL_MS = 60_000;
// MPI-460 — same-url retry schedule. Length IS the budget: three restarts, then the
// failure is real and the user sees it. Spaced so a router reboot or a CDN edge blip
// has time to clear, and short enough that a genuinely dead route is not a 5-minute wait.
const RETRY_BACKOFF_MS = [2_000, 5_000, 15_000];
let _watchdogTimer = null;

function _startStallWatchdog() {
    if (_watchdogTimer) return;
    _watchdogTimer = setInterval(_watchdogSweep, 15_000);
}

function _watchdogSweep() {
    if (_activeDownloaders.size === 0) {
        clearInterval(_watchdogTimer);
        _watchdogTimer = null;
        return;
    }
    const now = Date.now();
    for (const [depId, dl] of _activeDownloaders) {
        if (now - dl._lastByteTs < STALL_MS) continue;
        logger.warn('download', `stall watchdog: ${depId} no byte movement in ${STALL_MS}ms — forcing failure`);
        dl.forceStall().catch(err =>
            logger.error('download', `forceStall(${depId}) threw: ${err.message}`));
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// MPI-296 — `precomputed` is the SHA256 computed incrementally while the file
// streamed in (DownloadManager's pipe sink). When present it's an exact hash of
// the same bytes written to disk (no resume ever — MPI-258), so compare it in
// memory and skip re-reading the whole file (killed a 35s wall on a 6.6GB weight).
// null/absent → fall back to the disk re-read below (repair paths, edge cases).
async function _verifySha256(filePath, expected, precomputed) {
    if (!expected) return;
    if (precomputed) {
        if (precomputed !== expected) {
            throw new Error(`SHA256 mismatch: expected ${expected}, got ${precomputed}`);
        }
        return;
    }
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => {
            const actual = hash.digest('hex');
            if (actual !== expected) {
                reject(new Error(`SHA256 mismatch: expected ${expected}, got ${actual}`));
            } else {
                resolve();
            }
        });
        stream.on('error', reject);
    });
}

// MPI-427 — a download that never reaches the host is a NETWORK condition, not a bug,
// and the raw driver text says so in a language no user reads. A real report:
//   write EPROTO 108544:error:100000f7:SSL routines:OPENSSL_internal:
//   WRONG_VERSION_NUMBER:..\..\third_party\boringssl\src\ssl\tls_record.cc:127:
// That user's 44 model downloads all died under 200ms while all 45 GitHub downloads
// succeeded — a DNS/filter/middlebox intercepting one hostname. He read it as the app
// being broken and re-ran the installer for a day. Name the host and the remedy.
// Returns null for anything not transport-level, so real bugs keep their real message.
const _TRANSPORT_ERROR_PATTERNS = [
    // TLS answered by something that isn't TLS — DNS hijack, captive portal, filter.
    'wrong_version_number', 'eproto', 'packet_length_too_long',
    // Certificate substituted — an intercepting proxy or AV TLS scanner.
    'self_signed_cert_in_chain', 'unable_to_verify_leaf_signature',
    'cert_authority_invalid', 'err_tls_cert_altname_invalid',
    // Never resolved / refused / black-holed.
    'enotfound', 'eai_again', 'econnrefused', 'econnreset', 'etimedout', 'ehostunreach',
];

// MPI-427 — every model weight is served from ONE hostname, so an ISP or filter that
// blocks or throttles that host takes the entire catalogue with it and the app has no
// second route. MIRRORS are alternate ORIGINS for the same object paths: a failed
// transport attempt retries the identical path against the next entry before the dep is
// declared failed.
//
// TO ENABLE A MIRROR: add its base to _DEFAULT_MODEL_MIRRORS below. A base is an origin
// OPTIONALLY followed by a path prefix, and the dep's object path is appended to it —
// see _mirrorUrlsFor. CUBRIC_MODEL_MIRRORS (comma-separated) REPLACES the default for
// testing without a rebuild.
//
// A same-provider mirror only defeats HOSTNAME-keyed blocking. The 2026-08-02 report
// behind this card was deep-packet interference that killed the stream at ~20%, and a
// second Cloudflare hostname is NOT proven to survive that — MPI-429 therefore picked an
// off-Cloudflare origin: Hugging Face, which defeats FQDN-, domain- AND provider-keyed
// filtering. It is NOT proven against that reporter's transfer-stage DPI.
//
// MPI-429 — the prefix is why the base is not just an origin: HF serves at
// `huggingface.co/<repo>/resolve/main/<path>`, so an origin-only swap would produce
// `huggingface.co/vision/models/…` and 404 on every dep. Our 31 re-hosted weights sit at
// the SAME object path under that prefix, so this one base covers all of them with no
// per-dep data. The other 65 deps are byte-identical copies in THIRD-PARTY repos under
// different paths and different filenames — no rewrite can reach those, so they carry an
// explicit `mirrorUrl` (generated from the sweep, never hand-written) which takes
// precedence and suppresses the prefix rewrite for that dep.
// MPI-429 — the generic rewrite is only valid for objects whose PATH we re-hosted. The
// other two things FileDownloader pulls come from github.com: the engine archive
// (engine.js) and the custom-node zips. MPI-427 measured github at 45/45 succeeded
// against models.cubric.studio 0/44, so they neither need a mirror nor have one — and
// rewriting a github release path onto our HF repo would spend a retry on a certain 404.
// Keyed on the path, not the host, because the host is the thing a failover CHANGES.
const _MIRRORED_PATH_PREFIX = '/vision/models/';
const _DEFAULT_MODEL_MIRRORS = ['https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main'];
const _MODEL_MIRRORS = (process.env.CUBRIC_MODEL_MIRRORS
    ? process.env.CUBRIC_MODEL_MIRRORS.split(',')
    : _DEFAULT_MODEL_MIRRORS)
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

/**
 * Alternate URLs for `url`, in order, skipping the origin it already uses.
 * `dep` is optional; when it carries a `mirrorUrl` that URL is the ONLY alternate —
 * the object does not exist at our own path, so the generic rewrite would only spend
 * a second attempt on a guaranteed 404.
 *
 * URL pathnames only. `new URL().pathname` is `/`-separated by spec on every platform,
 * so nothing here is affected by `path.sep` — the filesystem side (localPath) is built
 * separately with path.join and is untouched by a mirror swap.
 */
function _mirrorUrlsFor(url, dep) {
    let parsed;
    try { parsed = new URL(url); } catch { return []; }
    // MPI-429 — a dep on R2 with no HF copy. The prefix rewrite would hand it a URL that
    // 404s, spending a retry to reach the same failure. Any dep added to R2 without being
    // re-hosted must carry this; the sweep script is what proves which ones those are.
    if (dep && dep.noMirror) return [];
    const out = [];
    const push = (u) => {
        try { if (new URL(u).origin !== parsed.origin && !out.includes(u)) out.push(u); } catch { /* skip */ }
    };
    if (dep && dep.mirrorUrl) {
        push(dep.mirrorUrl);
        return out;
    }
    if (!parsed.pathname.startsWith(_MIRRORED_PATH_PREFIX)) return out;
    for (const base of _MODEL_MIRRORS) {
        let parsedBase;
        try { parsedBase = new URL(base); } catch { continue; }
        if (parsedBase.origin === parsed.origin) continue;
        const prefix = parsedBase.pathname.replace(/\/+$/, '');
        push(`${parsedBase.origin}${prefix}${parsed.pathname}${parsed.search}`);
    }
    return out;
}

/**
 * True when two URLs address the SAME object across mirrors — same path, origin may
 * differ. MPI-317 resume compares the marker's url to the dep's url and DELETES the
 * partial on a mismatch (a repointed R2 object must not be Range-read into stale bytes).
 * A mirror swap changes the origin, so a plain string compare would scrap exactly the
 * partial a failover exists to preserve — the 2026-08-02 user lost his 20% to a retry
 * and reported it as "it jumped back down to 8". Path equality keeps the SHA256 verify
 * as the real net.
 *
 * MPI-429 — this is now only the FALLBACK for legacy markers. The marker records the
 * dep's sha256, and that is the real object identity (see the resume site); URL shape
 * cannot be, because a mirror may carry a path prefix or a different filename entirely.
 * The suffix test covers the prefix case (`/vision/models/x` under
 * `/<repo>/resolve/main/vision/models/x`), which a strict equality check would scrap.
 */
function _isSameObjectUrl(a, b) {
    if (a === b) return true;
    try {
        const pa = new URL(a).pathname;
        const pb = new URL(b).pathname;
        return pa === pb || pa.endsWith(pb) || pb.endsWith(pa);
    } catch { return false; }
}

/**
 * MPI-429 — may an existing partial be Range-resumed for this dep?
 *
 * The marker's sha256 IS the object's identity: same hash, same bytes, safe to resume
 * from whatever origin is now in play. This replaced a URL comparison, which cannot
 * answer the question once a mirror is in the picture — our HF re-host serves the same
 * object under a path PREFIX, and a third-party copy under a different repo AND
 * filename, so a URL-shaped test would scrap exactly the partial the failover exists to
 * preserve (MPI-317's data loss, re-armed).
 *
 * URL comparison survives only as the fallback for markers written before the sha256
 * field existed and for deps that carry no sha256 at all (custom-node zips).
 */
function _shouldResumePartial(marker, depJob) {
    const markerSha = marker && marker.sha256;
    const want = depJob && depJob.sha256Expected;
    if (markerSha && want) return String(markerSha).toLowerCase() === String(want).toLowerCase();
    const markerUrl = (marker && marker.url) || null;
    return !markerUrl || _isSameObjectUrl(markerUrl, depJob.url);
}

function _describeTransportError(err, url) {
    const raw = String((err && (err.message || err.code)) || '').toLowerCase();
    if (!_TRANSPORT_ERROR_PATTERNS.some(p => raw.includes(p))) return null;
    let host = 'the download server';
    try { host = new URL(url).host; } catch { /* malformed url — keep the generic noun */ }
    // The remedy order here is MEASURED, not guessed. The user who reported this tested
    // a DNS switch on its own with the app restarted: the download still died partway
    // (~20%), and one dep died as a 30s stall — so the interference is on the sustained
    // stream, not just on name resolution. A tunnel was the only thing that worked for
    // him. Lead with it. Do NOT restore "set your DNS to 1.1.1.1" as the first remedy;
    // that advice was disproven against the exact network this message exists for.
    return `Your network blocked the connection to ${host}. This is a network condition — `
        + 'an ISP filter, a DNS server, a parental/network filter, or antivirus web protection '
        + '— not a problem with the app or your computer. The fix that usually works is to turn '
        + 'on a VPN for the whole download (Cloudflare WARP is free), then retry. Changing your '
        + 'DNS alone is often not enough. A phone hotspot will confirm whether your network is '
        + 'the cause.';
}

function _formatSpeed(bytesPerSec) {
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${bytesPerSec.toFixed(0)} B/s`;
}

function _modelSpeedLabel(modelJob) {
    const now = Date.now();
    const bytes = modelJob.downloadedBytes || 0;
    const prev = modelJob._speedSample;
    if (!prev) {
        modelJob._speedSample = {
            bytes,
            t: now,
            rate: 0,
            label: modelJob.speed || '',
        };
        return modelJob._speedSample.label;
    }

    const dt = (now - prev.t) / 1000;
    const dBytes = bytes - prev.bytes;
    if (dt < 1 || dBytes <= 0) return prev.label;

    const instantRate = dBytes / dt;
    const rate = prev.rate > 0 ? (prev.rate * 0.65) + (instantRate * 0.35) : instantRate;
    const label = _formatSpeed(rate);
    modelJob._speedSample = { bytes, t: now, rate, label };
    return label;
}

function _resetModelSpeed(modelJob) {
    if (!modelJob) return;
    delete modelJob._speedSample;
    modelJob.speed = '';
}

function _parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/^([\d\.]+)\s*(GB|MB|KB|B)$/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers = { 'GB': 1024 ** 3, 'MB': 1024 ** 2, 'KB': 1024, 'B': 1 };
    return val * (multipliers[unit] || 0);
}

async function _getFileSizeFromUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? require('https') : require('http');
        const request = protocol.request(url, { method: 'HEAD' }, (res) => {
            const size = parseInt(res.headers['content-length'], 10);
            resolve(isNaN(size) ? 0 : size);
        });
        request.on('error', (err) => {
            logger.warn('downloadManager', `HEAD request failed for ${url}: ${err.message}`);
            resolve(0);
        });
        request.setTimeout(5000, () => {
            request.abort();
            resolve(0);
        });
        request.end();
    });
}

// ── SSE Clients ───────────────────────────────────────────────────────────────
const _sseClients = new Set();

function _broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch (e) { _sseClients.delete(res); }
    }
}

// ── installStore SOT (MPI-276 Phase 2b.3) ────────────────────────────────────
// The store owns lifecycle state + progress + the monotonic snapshot version.
// SHADOW STAGE: populated alongside _modelJobs/_depJobs and used for the READ
// paths (status endpoint, snapshot); the maps stay write-authoritative until the
// write-flip commit. The maps remain the transport carriers (url, localPath,
// sha256Expected — fields the pure store deliberately omits). `broadcast` is
// late-bound so it is defined by call time.
const store = createInstallStore({
    broadcast: (event, data) => _broadcast(event, data),
    logger,
    now: Date.now,
});

// Runtime→store status translation. The runtime maps use a few strings the pure
// store doesn't model: a model's terminal success is 'complete' here but 'done' in
// the store, and 'idle' (disk-full / rejected pre-register) has no store state.
const _MODEL_STATUS_TO_STORE = {
    queued: 'queued', downloading: 'downloading', verifying: 'verifying',
    installing: 'installing', complete: 'done', done: 'done',
    failed: 'failed', cancelled: 'cancelled',
    // idle: intentionally absent — the model is never registered in the store on
    // that path (it 400s before register), so there is nothing to transition.
};
const _DEP_STATUS_TO_STORE = {
    queued: 'queued', downloading: 'downloading', verifying: 'verifying',
    complete: 'complete', failed: 'failed', cancelled: 'cancelled',
};

// Write the runtime map field (unchanged behavior) AND drive the store in lockstep
// (MPI-276 2b.3). SHADOW STAGE: both writes happen; the map is still authoritative.
// A status with no store equivalent (e.g. 'idle') updates the map only. transition*
// no-ops safely if the store has no such job yet (register happens at start).
function _setModelStatus(modelJob, status, reason) {
    modelJob.status = status;
    const to = _MODEL_STATUS_TO_STORE[status];
    const sj = store.modelJob(modelJob.modelId);
    // MPI-317 F5: on a RESUMED install the reconciler can settle the store job to a
    // terminal state from disk truth (invariant #3) while this legacy map is still
    // walking its downloading→installing→complete tail — the map drives real trailing
    // work (node requirements re-verify + the model-level download:complete broadcast),
    // so the walk must continue. But pushing its trailing statuses into an
    // already-settled store just gets a (correct) 'Illegal transition … rejected' warn
    // per resumed install. Terminal is terminal: once the store has settled, the map
    // finishes its walk without writing to the store. Dies with the MPI-318 write-flip
    // (map status-writes deleted).
    if (sj && store.MODEL_TERMINAL.has(sj.status)) return;
    if (to && sj) store.transitionModel(modelJob.modelId, to, reason);
}
function _setDepStatus(depJob, status, reason) {
    depJob.status = status;
    const to = _DEP_STATUS_TO_STORE[status];
    // MPI-427 — 'queued' on an existing dep is always an explicit retry requeue (all
    // four callers: local reset, remote node, remote, uw). A terminal dep cannot reach
    // 'queued' through the transition table by design, so route it to the store's
    // dedicated requeue instead of taking a rejected-transition warn on every retry.
    if (to === 'queued' && store.depJob(depJob.id)) {
        store.requeueDep(depJob.id, reason);
    } else if (to && store.depJob(depJob.id)) {
        store.transitionDep(depJob.id, to, reason);
    }
    // Stamp last-activity on the store model job so the reconciler's orphan-fail
    // gate (G11) measures staleness from real progress, not registration alone.
    const sj = store.modelJob(depJob.modelId);
    if (sj) sj.lastTickAt = Date.now();
}

// Mirror a map modelJob's freshly-recomputed progress/bytes into the store (4c) so
// snapshot()/the download:snapshot broadcast reflect live progress, not just
// lifecycle. Called right after each map-side progress recompute. Status stays owned
// by _setModelStatus/_setDepStatus; this touches numbers only.
function _syncStoreProgress(modelJob) {
    if (!store.modelJob(modelJob.modelId)) return;
    store.syncProgress(modelJob.modelId, {
        progress: modelJob.progress,
        totalBytes: modelJob.totalBytes,
        downloadedBytes: modelJob.downloadedBytes,
        speed: modelJob.speed,
        deps: modelJob.deps.map(d => ({ id: d.id, downloadedBytes: d.downloadedBytes, totalBytes: d.totalBytes })),
    });
}

// Register (or REPLACE) the store record for a runtime modelJob, translating its
// deps into the store's spec. Called once per start on both engines. The store
// holds lifecycle+progress+version; the runtime maps keep the transport fields.
function _registerModelInStore(modelJob, engine) {
    store.registerModelJob({
        modelId: modelJob.modelId,
        engine,
        deps: modelJob.deps.map(d => ({
            depId: d.id,
            type: d.type || 'model',
            size: d.size || '',
            seedBytes: d.seedBytes || 0,
            totalBytes: d.totalBytes || 0,
            downloadedBytes: d.downloadedBytes || 0,
            alreadyInstalled: d.status === 'complete',
        })),
    });
    // Stamp the grace-window anchor for the reconciler's orphan-fail gate (G11).
    const sj = store.modelJob(modelJob.modelId);
    if (sj) { sj.registeredAt = Date.now(); sj.lastTickAt = Date.now(); }
    reconciler.start(); // idempotent; self-idles when no jobs are active
}

// ── Reconciler SOT-driver (MPI-276 Phase 3, G11) ─────────────────────────────
// Polls disk/volume truth while the store has active jobs, settles wedged jobs
// (missed-terminal SSE), fails orphans, prunes terminal jobs, broadcasts the
// snapshot. Generalises the remote-only recovery to BOTH engines. Disk truth is
// injected so the module stays pure/testable.

// Resolve installed-truth for a batch of the store's active model jobs. Groups
// by engine: local jobs → localModelsCheck (disk), remote jobs → remoteModelsCheck
// (volume). Returns Map<depId, boolean>. Any dep whose model can't be checked is
// simply absent from the map (treated as not-yet-installed — never a false settle).
async function _reconcilerCheckInstalled(jobs) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const comfyRoutes = _require('./comfy.js');
    const truth = new Map();

    const toCheckModel = (job) => ({
        id: job.modelId,
        deps: job.deps.map(d => {
            const def = DEPS[d.id] || {};
            return { id: d.id, type: def.type, filename: def.filename };
        }),
    });
    const absorb = (results) => {
        if (!results) return;
        for (const modelId of Object.keys(results)) {
            const deps = (results[modelId] && results[modelId].deps) || [];
            for (const d of deps) if (d && d.id) truth.set(d.id, d.installed === true);
        }
    };

    const localJobs = jobs.filter(j => j.engine !== 'remote');
    const remoteJobs = jobs.filter(j => j.engine === 'remote');

    if (localJobs.length) {
        absorb(await comfyRoutes.localModelsCheck(localJobs.map(toCheckModel)));
    }
    if (remoteJobs.length && remoteModels.isRemoteActive()) {
        const out = await remoteModels.remoteModelsCheck(remoteJobs.map(toCheckModel));
        absorb(out && out.results);
    }
    return truth;
}

const reconciler = createReconciler({
    store,
    checkInstalled: _reconcilerCheckInstalled,
    now: Date.now,
    logger,
});

router.get('/comfy/downloads/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    _sseClients.add(res);
    req.on('close', () => { _sseClients.delete(res); });
    // G11: reconcile against truth, then hand the fresh client the current
    // snapshot so it rebuilds state.downloadJobs wholesale (kills cold-boot
    // phantom cards). Runs only when jobs are live; otherwise emits an empty
    // snapshot so the FE clears any stale bars. Errors are non-fatal.
    (store.hasActiveJobs()
        ? reconciler.reconcileOnce().catch((err) => logger.warn('download', `SSE-connect reconcile failed: ${err.message}`))
        : Promise.resolve()
    ).finally(() => store.broadcastSnapshot());
});

// ── Status Endpoint ───────────────────────────────────────────────────────────

// Serialize one model job for the wire — the shape the FE mirror consumes from
// both GET /downloads/status and the register-before-respond /download/start body
// (MPI-276 G8). Single serializer so the two never drift.
//
// MPI-276 4c NOTE: sourced from the runtime MAP job, NOT store.snapshot(). Live
// progress/bytes are recomputed onto the map job at ~15 tick sites and are NOT yet
// mirrored into the store (the store tracks lifecycle+status, mirrored in lockstep;
// progress-mirror is the remaining gap). So a pull-read off store.snapshot() would
// report 0% mid-download. The store-sourced SOT path is the `download:snapshot`
// BROADCAST (reconciler, P3) + the FE snapshot consumer (4a); this pull endpoint
// stays map-backed until progress is mirrored. Map `status` vocabulary is already
// correct ('complete'); the FE mirror handles both it and the store's 'done'.
function _serializeModelJob(job) {
    return {
        id: job.id,
        modelId: job.modelId,
        status: job.status,
        totalBytes: job.totalBytes,
        downloadedBytes: job.downloadedBytes,
        speed: job.speed,
        progress: job.progress,
        deps: job.deps.map(d => ({
            id: d.id,
            status: d.status,
            downloadedBytes: d.downloadedBytes,
            totalBytes: d.totalBytes,
            error: d.error,
        })),
    };
}

router.get('/comfy/downloads/status', (req, res) => {
    const jobs = Array.from(_modelJobs.values()).map(_serializeModelJob);
    // G9: monotonic snapshot version from the store (the FE version-gates deltas
    // against it). Jobs stay map-sourced for live progress (see _serializeModelJob).
    res.json({ success: true, version: store.version(), jobs });
});

router.get('/comfy/downloads/active', (req, res) => {
    const models = Array.from(_modelJobs.values())
        .filter(job => ['queued', 'downloading', 'paused', 'installing'].includes(job.status))
        .filter(job => job.modelId !== '__universal_workflow__')
        .map(job => ({
            modelId: job.modelId,
            status: job.status,
            deps: job.deps
                .filter(dep => ['queued', 'downloading', 'paused'].includes(dep.status))
                .map(dep => ({
                    id: dep.id,
                    status: dep.status,
                    downloadedBytes: dep.downloadedBytes || 0,
                    totalBytes: dep.totalBytes || 0,
                })),
        }));
    res.json({
        success: true,
        models,
        engine: !!_activeEngineDownloader,
    });
});

// ── Start Endpoint ────────────────────────────────────────────────────────────

router.post('/comfy/models/download/start', async (req, res) => {
    const { modelId, dependencies } = req.body;
    if (!modelId || !Array.isArray(dependencies)) {
        return res.status(400).json({ error: 'modelId + dependencies required' });
    }

    // Offline pre-flight (MPI-120): downloads (local or remote-Pod install) all
    // need real internet. Fail fast with a distinct offline flag so the renderer
    // shows a "you're offline" toast instead of a stuck/0% job or a cryptic
    // getaddrinfo error dialog.
    if (!(await checkOnline())) {
        logger.warn('download', 'Download blocked: host appears offline');
        return res.status(503).json({ error: 'offline', offline: true });
    }

    // Remote engine: install onto the Pod volume via the wrapper instead of
    // downloading to the local filesystem. Same modelJob/SSE shape, so the
    // renderer download UI is unchanged.
    if (remoteModels.isRemoteActive()) {
        return _startRemoteDownload(modelId, dependencies, res);
    }

    // LOCAL path: keep only deps the LOCAL engine installs (drop the Pod-only GGUF
    // transformer + node). The renderer already resolves per-engine, but a stale
    // client / direct API call could send the remote set — defend server-side by
    // intersecting against the model's local-engine universe. (MPI-163;
    // MPI-179 — union the local extraDeps back in so a stale-engine request heals)
    const localDeps = _withEngineExtraDeps(modelId, _filterDepsForEngine(modelId, dependencies, 'local'), 'local');

    let modelJob = _modelJobs.get(modelId);
    if (!modelJob) {
        modelJob = _createModelJob(modelId, localDeps);
        _modelJobs.set(modelId, modelJob);
    }

    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    // totalBytes is computed AFTER the dep loop, from modelJob.deps — see the note
    // beside the recalculation below for why it cannot be pre-summed from localDeps.

    for (const dep of localDeps) {
        let localPath;
        let installedCheckPath;
        if (dep.targetPath) {
            // MPI-222: in-node weight — engine-anchored regardless of customRoot.
            const { localPath: lp } = await resolveComfyPath(dep, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else if (dep.type === 'custom_nodes') {
            // GitHub archives download as .zip; after extraction the zip is deleted.
            // Use the extracted folder path to check if already installed.
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
            installedCheckPath = path.join(defaultCustomNodesRoot, dep.filename);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
            installedCheckPath = localPath;
        }

        // MPI-387 F1: type-aware — a custom_nodes folder can be a weight-only shell.
        // Bare pathExists here marked the dep `complete`, then the node download moved
        // it to `downloading` → installStore logged an illegal complete→downloading.
        const isInstalled = await isDepInstalledOnDisk(dep, installedCheckPath);

        let depJob = _depJobs.get(dep.id);
        if (!depJob) {
            depJob = _createDepJob(dep);
            depJob.localPath = localPath;
            _depJobs.set(dep.id, depJob);
        }

        if (!modelJob.deps.find(d => d.id === dep.id)) {
            modelJob.deps.push(depJob);
        }

        // Mark installed deps as complete immediately (they contribute to progress but not to active downloads)
        if (isInstalled) {
            _setDepStatus(depJob, 'complete', 'local already-installed');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else if (depJob.status !== 'queued' && depJob.status !== 'downloading') {
            // Reset any terminal state (complete, failed, cancelled) back to queued.
            // MPI-427: credit the KEPT partial instead of zeroing. removeOnFail:false
            // leaves the bytes on disk and download() resumes them from the marker, so
            // zeroing made the bar fall backwards on every retry — a user watching a
            // flaky ISP kill his transfer reported it as "it got 20% ... and it jumped
            // back down to 8", i.e. as lost progress. getPartialBytes returns 0 unless
            // the partial is genuinely marker-blessed and resumable, so a non-resumable
            // leftover still reads as 0 and nothing is over-reported.
            _setDepStatus(depJob, 'queued', 'local reset requeue');
            depJob.downloadedBytes = await getPartialBytes(localPath);
            depJob.error = null;
        }
    }

    // Recalculate progress from completed deps before broadcasting.
    //
    // BOTH sides come from modelJob.deps, and that is the fix. SET-never-+= (MPI-276
    // G12) stopped a re-POST doubling the denominator, but it set the denominator from
    // the REQUEST while the numerator summed modelJob.deps — which ACCUMULATES across
    // POSTs. A POST carrying a SUBSET of a model's deps therefore divided an
    // accumulated numerator by a partial denominator. Live 2026-08-10: a node-drift
    // heal sent one 1.76MB node for `ltx-23`, whose job already held a 2.3GB shared
    // weight (MPI-97 attach), and the card read 2312149072/1845493.76 = 125,286%,
    // clamped to a full bar on a model that is not installed.
    // _byteRatioExcludingNodes is the SAME function the progress ticks use, so start
    // and tick now agree by construction rather than by two matching hand-sums; it
    // also keeps MPI-231's custom_nodes exclusion on both sides. Summing modelJob.deps
    // is deduped by id, so it is idempotent and G12 still holds.
    const startRatio = _byteRatioExcludingNodes(modelJob.deps, 'local');
    modelJob.downloadedBytes = startRatio.downloaded;
    modelJob.totalBytes = startRatio.total;
    modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;

    // ── Disk-full pre-flight gate (MPI-99) ──────────────────────────────────
    // Refuse a local install that won't fit on the target drive instead of
    // starting a doomed download that fails partway with a cryptic write error.
    // Only the deps still queued (not already complete-on-disk) need new space;
    // a 5% margin covers temp/.part overhead. A failed statfs is non-fatal — we
    // skip the gate rather than block a legitimate install.
    // Use seedBytes (declared size, known NOW), NOT totalBytes — totalBytes is the
    // real Content-Length which is still 0 at install-start (it only arrives mid-
    // download). Summing totalBytes made neededBytes 0, the gate never fired, the
    // download started anyway, and the first write to a full disk crashed the
    // server with an unhandled ENOSPC. (MPI-140; was the MPI-99 gate's blind spot.)
    const neededBytes = modelJob.deps
        .filter(d => d.status === 'queued')
        .reduce((sum, d) => sum + (d.totalBytes || d.seedBytes || 0), 0);
    if (neededBytes > 0) {
        const targetDir = customRoot || defaultModelsRoot;
        const freeBytes = await _freeDiskBytes(targetDir);
        if (freeBytes !== null && freeBytes < neededBytes * 1.05) {
            _setModelStatus(modelJob, 'idle', 'disk-full idle');
            logger.warn('download', `install blocked — disk full: need ${_fmtGb(neededBytes)} free, have ${_fmtGb(freeBytes)} at ${targetDir}`);
            return res.status(400).json({
                error: `Not enough disk space to install this model. ${_fmtGb(neededBytes)} needed, ${_fmtGb(freeBytes)} free.`,
            });
        }
    }

    // Register in the store now that the disk-full gate has passed (MPI-276 2b.3).
    // registerModelJob REPLACES on a re-POST (kills totalBytes accumulation) and
    // credits already-installed deps at full size. Done before the status flip so the
    // transition below lands on a live store job.
    _registerModelInStore(modelJob, 'local');

    _setModelStatus(modelJob, 'downloading', 'download start');
    _resetModelSpeed(modelJob);
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });

    _startPendingDeps();

    // Register-before-respond (MPI-276 G8): the job is fully in _modelJobs before we
    // reply, and the reply carries its snapshot — the FE mirror renders the card from
    // the response, never racing the SSE stream open (the MPI-241 race class).
    res.json({ success: true, jobId: modelId, version: store.version(), job: _serializeModelJob(modelJob) });
});

// Free bytes available on the filesystem holding `dir`. Returns null on any
// failure so callers can treat "unknown" as "don't block". (MPI-99)
async function _freeDiskBytes(dir) {
    try {
        const stats = await fs.statfs(dir);
        return stats.bavail * stats.bsize;
    } catch (err) {
        logger.warn('download', `statfs failed for ${dir}: ${err.message}`);
        return null;
    }
}

function _fmtGb(bytes) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// ── Pending Deps Launcher ──────────────────────────────────────────────────────

async function _startPendingDeps() {
    const pending = Array.from(_depJobs.values()).filter(d =>
        d.status === 'queued'
        && _depHasActiveDownloadConsumer(d.id)
    );
    const slots = Math.max(0, LOCAL_DOWNLOAD_CONCURRENCY - _activeDownloaders.size);
    logger.info('download', `_startPendingDeps: ${pending.length} queued deps, ${_activeDownloaders.size}/${LOCAL_DOWNLOAD_CONCURRENCY} active`);
    if (slots <= 0) return;

    let started = 0;
    for (const depJob of pending) {
        if (started >= slots) break;
        if (_activeDownloaders.has(depJob.id)) {
            continue;
        }

        _setDepStatus(depJob, 'downloading', 'local dep start');
        const downloader = new FileDownloader(depJob, depJob.localPath);
        _activeDownloaders.set(depJob.id, downloader);
        _startStallWatchdog(); // MPI-291 — self-idles when _activeDownloaders drains

        _wireProgress(depJob, downloader);
        logger.info('download', `Starting download for ${depJob.id} from ${depJob.url}`);
        downloader.download().catch(err => {
            logger.error('download', `downloader.download() caught error for ${depJob.id}: ${err.message}`);
        });
        started += 1;
    }
}

function _wireProgress(depJob, downloader) {
    downloader.onProgress = (downloadedBytes, totalBytes) => {
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depJob.id);
            if (!myDep) continue;
            myDep.downloadedBytes = downloadedBytes;
            myDep.totalBytes = totalBytes;
            // MPI-231 — custom_nodes are WORK, not bytes: a GitHub `/archive/` zip is
            // served with no Content-Length (totalBytes stays 0 → denominator falls
            // back to the tiny registry seed) while the numerator counts real streamed
            // bytes, and the following pip requirements phase pulls ~200MB of wheels
            // that no honest total covers up-front. Both make a determinate bar a lie
            // (RES4LYF read "203 MB / 15 MB"). Exclude custom_nodes from BOTH sides of
            // the ratio; when the active tick is a node download, show the indeterminate
            // "Preparing…" sweep — the same work-not-bytes rule the verify aggregate
            // already applies (MPI-164).
            // Denominator tracks each weight dep's REAL Content-Length once known, not
            // the declared `size:` estimate — else the bar finishes short (e.g. Wan
            // declared 15GB but is 14.3GB → caps ~91% then jumps to done). Prefer real
            // total; fall back to seedBytes only while real is still 0 (dep not yet
            // emitting). NB: NOT _depDenominator's Math.max(real,seed) — when the seed
            // over-declares, max() keeps the inflated seed and the bar finishes short.
            const ratio = _byteRatioExcludingNodes(modelJob.deps, 'local');
            modelJob.downloadedBytes = ratio.downloaded;
            modelJob.totalBytes = ratio.total;
            modelJob.speed = _modelSpeedLabel(modelJob);
            // A node-only job has a 0 byte-denominator — keep the sweep going rather
            // than a static 0 MB / 0 MB.
            //
            // MPI-410 (absorbed MPI-412): this used to be `isNodeTick || total <= 0`,
            // which made the DISPLAY MODE depend on which dep happened to tick last.
            // Nodes and weights stream concurrently, so the engine install screen
            // alternated "Preparing dependencies…" with a byte readout on every event
            // — the reported strobe — and a model tile re-renders on the same flag
            // (MpiModelManager's render key). The ratio above already excludes
            // custom_nodes from BOTH sides, so a node tick cannot pollute it; MPI-231's
            // "203 MB / 15 MB" lie is prevented by that exclusion, not by this flag.
            // Sweep when the JOB has no honest total, or when the node phase is the
            // only thing left — the rule routes/install/computeProgress.js already
            // encodes and tests. Same shape as MPI-164 one level up: a per-dep
            // condition must not drive a whole-job display.
            const indeterminate = modelJob.totalBytes <= 0 || isNodeTickPending(modelJob.deps);
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _syncStoreProgress(modelJob); // 4c: mirror live progress into the store SOT
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId: depJob.id,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: modelJob.speed,
                progress: modelJob.progress,
                indeterminate,
                phase: indeterminate ? 'preparing' : undefined,
            });
        }
    };
}

function _depHasActiveDownloadConsumer(depId) {
    for (const modelJob of _modelJobs.values()) {
        if (modelJob.status !== 'downloading') continue;
        if (modelJob.deps.some(d => d.id === depId)) return true;
    }
    return false;
}

// True if a model OTHER than excludeModelId is actively downloading/installing this
// dep right now — the real "don't stop the downloader" test for cancel (MPI-258 Bug
// B). refCount can't be trusted here (it leaks up on successful installs).
function _otherActiveModelUsesDep(depId, excludeModelId) {
    for (const modelJob of _modelJobs.values()) {
        if (modelJob.modelId === excludeModelId) continue;
        if (modelJob.status !== 'downloading' && modelJob.status !== 'queued' && modelJob.status !== 'installing') continue;
        if (modelJob.deps.some(d => d.id === depId)) return true;
    }
    return false;
}

// ── Remote (RunPod wrapper) install driver ──────────────────────────────────
//
// In remote mode the wrapper streams installs onto the Pod volume. We reuse the
// same _modelJobs/_depJobs maps and _broadcast events so the renderer's download
// UI works unchanged. One wrapper SSE stream serves all active remote installs;
// it is torn down when no remote installs remain. There is no local .part file,
// so pause/resume are not supported remotely (see the pause/resume routes).

let _remoteEventStream = null;       // AbortController for the wrapper SSE stream
const _remoteDepIds = new Set();     // dep ids currently installing remotely
let _remoteReconnectTimer = null;    // MPI-97 — pending SSE reconnect timer
let _remoteReconnectAttempt = 0;     // MPI-97 — backoff counter (reset on a clean open)

// MPI-136 — silent-SSE-stall watchdog. MPI-97 recovers a CLOSED stream, but a
// stream that stays OPEN while the Pod's download loop is wedged on a zombie
// socket stops emitting progress with no close event → a permanent ghost bar.
// We stamp the last progress tick and, on a timer, treat a long tick-silence as
// a stall: run the SAME reconcile+reconnect recovery as a close. The wrapper's
// own chunk-deadline (v0.2.21) then surfaces a clean install-error; reconcile
// settles any dep that actually finished during the silence.
const _REMOTE_STALL_MS = 90_000;     // no tick this long on an open stream = stalled
const _REMOTE_STALL_POLL_MS = 15_000;
let _remoteLastTickAt = 0;           // monotonic-ish: Date.now() of last progress tick
let _remoteStallTimer = null;        // setInterval handle

function _markRemoteTick() { _remoteLastTickAt = Date.now(); }

function _startRemoteStallWatchdog() {
    if (_remoteStallTimer) return;
    _markRemoteTick(); // grace period before the first tick
    _remoteStallTimer = setInterval(() => {
        if (_remoteDepIds.size === 0) return;
        // MPI-539 — remote mode can go inactive with NO stream close to trigger
        // _onRemoteStreamClosed (a disconnect from Settings, or the generation-path
        // teardown this card also fixes). This guard used to just `return`, so the
        // watchdog spun forever against deps nothing would ever settle. Same verdict as
        // the close path: no remote target, no recovery — fail them.
        if (!remoteModels.isRemoteActive()) { _failOutstandingRemoteDeps('remote inactive'); return; }
        if (_remoteReconnectTimer) return; // a reconnect already in flight

        // MPI-255: LOST-COMPLETION backstop, independent of the 90s stall gate.
        // A dep whose bytes are 100% in (downloadedBytes >= totalBytes > 0) but whose
        // status is still 'downloading' has a MISSED terminal SSE — the wrapper fired
        // models:install-complete into a not-yet-attached / dropped stream, so it never
        // settled and the model hangs at 100% forever. This hits any fast-settling dep
        // (a `requirements_only` node pip no-op, OR a weight whose final tick was lost),
        // NOT just stalls — and waiting the full 90s stall window to notice is the
        // user-visible "tanking at 100%" hang. Reconcile against volume truth NOW, on
        // the normal 15s poll. Reconcile only settles deps the wrapper reports
        // installed:true, so an in-flight download is never force-completed.
        let allBytesInButUnsettled = false;
        for (const depId of _remoteDepIds) {
            const dj = _depJobs.get(depId);
            if (dj && dj.status === 'downloading' && dj.totalBytes > 0
                && (dj.downloadedBytes || 0) >= dj.totalBytes) { allBytesInButUnsettled = true; break; }
        }
        if (allBytesInButUnsettled) {
            _reconcileOutstandingRemoteDeps().catch((err) =>
                logger.warn('download', `lost-completion reconcile failed: ${err.message}`));
            return; // volume-truth reconcile settles it; skip the stall/abort path this poll
        }

        if (Date.now() - _remoteLastTickAt < _REMOTE_STALL_MS) return;
        logger.warn('download', `remote install silent for ${Math.round((Date.now() - _remoteLastTickAt) / 1000)}s with ${_remoteDepIds.size} dep(s) outstanding — treating as stalled`);
        _markRemoteTick(); // don't re-fire every poll while recovery runs
        // Reuse the close-recovery path: reconcile completions + abort/reconnect
        // the (wedged) stream so a re-subscribe picks up the wrapper's error.
        if (_remoteEventStream) {
            _remoteEventStream.abort();
            _remoteEventStream = null;
        }
        _onRemoteStreamClosed('silent-stall');
    }, _REMOTE_STALL_POLL_MS);
}

function _stopRemoteStallWatchdog() {
    if (_remoteStallTimer) {
        clearInterval(_remoteStallTimer);
        _remoteStallTimer = null;
    }
}

function _ensureRemoteEventStream() {
    if (_remoteEventStream) return;
    _startRemoteStallWatchdog();
    _remoteEventStream = remoteModels.openInstallEventStream(
        (evt) => {
            // A live event means the stream is healthy — clear backoff + stamp tick.
            _remoteReconnectAttempt = 0;
            _markRemoteTick();
            _onRemoteInstallEvent(evt);
        },
        (reason) => _onRemoteStreamClosed(reason),
    );
}

// MPI-97 — the wrapper install SSE can drop mid-install (observed live as
// "remote install SSE closed"); previously the stream just died and the card
// hung at its last % with no completion event. Recover: if installs are still
// outstanding, reconcile missed completions against the volume, then reconnect
// the stream with backoff. Once no installs remain (or remote went inactive),
// let it stay closed.
function _onRemoteStreamClosed(reason) {
    _remoteEventStream = null;
    if (_remoteDepIds.size === 0) { _stopRemoteStallWatchdog(); return; } // clean close
    // MPI-539 — remote mode went inactive with installs STILL OUTSTANDING. This used to
    // `return` and the deps were simply abandoned: they stayed in _depJobs as
    // 'downloading' forever, so GET /comfy/downloads/status kept serving the Pod's last
    // snapshot and the Model Library painted a frozen "424.7 MB/s · 4.2 / 49.4 GB · ~2
    // min left" (with a live Cancel) over a model the LOCAL disk already had — remote
    // progress on top of local installed-state, on the same card. Silence read as
    // progress for a whole session. Nothing can recover these, so fail them loudly.
    if (!remoteModels.isRemoteActive()) { _failOutstandingRemoteDeps(reason); return; }
    if (_remoteReconnectTimer) return;             // a reconnect is already scheduled

    logger.warn('download', `remote install SSE closed (${reason}); ${_remoteDepIds.size} dep(s) outstanding — recovering`);

    // Backstop: a dep may have COMPLETED during the dead window, so its
    // models:install-complete was missed and the card would hang forever. Settle
    // those against the volume via the existing models/status check (no new
    // wrapper endpoint) before/independently of the reconnect.
    _reconcileOutstandingRemoteDeps().catch((err) =>
        logger.warn('download', `remote dep reconcile failed: ${err.message}`));

    if (_remoteDepIds.size === 0) return;          // reconcile may have settled them all

    const delay = Math.min(1000 * 2 ** _remoteReconnectAttempt, 15000); // 1s,2s,4s… cap 15s
    _remoteReconnectAttempt += 1;
    _remoteReconnectTimer = setTimeout(() => {
        _remoteReconnectTimer = null;
        if (_remoteDepIds.size === 0 || !remoteModels.isRemoteActive()) return;
        _ensureRemoteEventStream();
    }, delay);
}

// MPI-539 — settle every outstanding remote dep as FAILED when the remote target is
// gone for good. Both recovery paths above (SSE reconnect, stall watchdog) can only
// work while remote mode is active; once it is not, an outstanding dep has no owner
// and must not keep reporting live progress. Terminal + broadcast, so the card shows a
// real end state (and a working Retry) instead of a frozen Pod snapshot the app can
// never advance. Compare the reconcile below, which is the OPPOSITE case: the target
// is still there, so volume truth can settle deps as complete.
const _REMOTE_ABANDON_MSG = 'Remote engine disconnected before the install finished.';
function _failOutstandingRemoteDeps(reason) {
    const outstanding = Array.from(_remoteDepIds);
    logger.warn('download', `remote target inactive (${reason}); failing ${outstanding.length} outstanding dep(s) — no remote target left to recover to`);
    for (const depId of outstanding) {
        const depJob = _depJobs.get(depId);
        if (depJob) {
            depJob.error = _REMOTE_ABANDON_MSG;
            _setDepStatus(depJob, 'failed', 'remote target inactive');
        }
        _remoteDepIds.delete(depId);
        _broadcast('download:failed', { depId, error: _REMOTE_ABANDON_MSG });
    }
    _stopRemoteStallWatchdog();
}

// Settle outstanding remote deps against the actual volume state. Used to
// recover completions missed while the install SSE was down. Reuses
// remoteModelsCheck (/wrapper/models/status) — no new wrapper endpoint.
async function _reconcileOutstandingRemoteDeps() {
    if (_remoteDepIds.size === 0) return;
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    // Build a one-model check carrying every outstanding dep so the wrapper
    // reports each dep's real installed state on the volume.
    const outstanding = Array.from(_remoteDepIds);
    const deps = outstanding.map((depId) => {
        const d = DEPS[depId] || {};
        return { id: depId, type: d.type, filename: d.filename };
    });
    let results;
    try {
        const out = await remoteModels.remoteModelsCheck([{ id: '__reconcile__', deps }]);
        results = (out && out.results && out.results['__reconcile__'] && out.results['__reconcile__'].deps) || [];
    } catch (err) {
        throw err; // surfaced by caller; reconnect still proceeds
    }
    const byId = Object.fromEntries(results.map((d) => [d.id, d]));
    for (const depId of outstanding) {
        const entry = byId[depId];
        if (entry && entry.installed === true) {
            const depJob = _depJobs.get(depId);
            if (depJob) {
                _setDepStatus(depJob, 'complete', 'local complete');
                depJob.downloadedBytes = depJob.totalBytes || depJob.downloadedBytes;
            }
            _remoteDepIds.delete(depId);
            _broadcast('download:complete', { depId, modelId: null });
        }
    }
    _checkModelJobsComplete();
}

function _teardownRemoteEventStreamIfIdle() {
    if (_remoteDepIds.size > 0) return;
    if (_remoteReconnectTimer) {
        clearTimeout(_remoteReconnectTimer);
        _remoteReconnectTimer = null;
    }
    _remoteReconnectAttempt = 0;
    _stopRemoteStallWatchdog(); // MPI-136 — no installs left, stop polling
    if (_remoteEventStream) {
        _remoteEventStream.abort();
        _remoteEventStream = null;
    }
}

// Map a wrapper models:install-* event onto the dep + its model jobs.
function _onRemoteInstallEvent(evt) {
    const data = evt.data || {};
    const depId = data.id;
    if (!depId) return;
    const depJob = _depJobs.get(depId);
    if (!depJob) return;

    if (evt.type === 'models:install-progress') {
        const downloaded = Number(data.bytes) || 0;
        const total = Number(data.total) || depJob.totalBytes || 0;
        // Per-dep bytes are physically monotonic (a download never un-downloads).
        // A wrapper restart-from-0 (fast-path→fallback handoff) or an SSE
        // reconnect can report a LOWER `bytes` for a tick; assigning it absolutely
        // walked the whole-model aggregate BACKWARDS ("97% → 37%"). Clamp so the
        // numerator only ever climbs within an install. Reset paths (cancel,
        // fresh start) rebuild the depJob, so this never wedges a stale high.
        depJob.downloadedBytes = Math.max(depJob.downloadedBytes || 0, downloaded);
        if (total) depJob.totalBytes = total;
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depId);
            if (!myDep) continue;
            // MPI-95 fix: re-derive BOTH sides of the ratio from the per-dep jobs
            // every tick. The wrapper's _resolve_total corrects each dep's real
            // `total` (line above); we sum the per-dep DENOMINATOR (real total when
            // known, else the registry seed — _depDenominator) so the bar neither
            // snaps to ~80% on the first tick (numerator outran a rounded
            // denominator) NOR sits at 100% while a not-yet-emitting dep counts as 0
            // in the denominator. Every dep is always counted at its best-known size.
            // MPI-231 — exclude custom_nodes from both sides (work-not-bytes): a node
            // re-clone can report git bytes with no honest total vs a tiny seed, and a
            // requirements pip run has no up-front total (twin of the local overshoot).
            const ratio = _byteRatioExcludingNodes(modelJob.deps, 'remote');
            modelJob.totalBytes = ratio.total;
            modelJob.downloadedBytes = ratio.downloaded;
            // MPI-410: the local twin's strobe fix, applied here too (engine-split
            // sweep) — see the long note on the local tick. Per-dep `isNodeTick` made
            // the mode flip on whichever dep ticked last.
            const nodeIndeterminate = modelJob.totalBytes <= 0 || isNodeTickPending(modelJob.deps);
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _syncStoreProgress(modelJob); // 4c: mirror live progress into the store SOT
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: '',
                progress: modelJob.progress,
                // MPI-95: a real weight-progress tick definitively clears the
                // Preparing… sweep (covers a HEAD-slower-than-first-tick race).
                // MPI-231: a custom_node tick (no honest total) stays indeterminate.
                indeterminate: nodeIndeterminate,
                phase: nodeIndeterminate ? 'preparing' : undefined,
            });
        }
    } else if (evt.type === 'models:install-verifying') {
        // The wrapper finished downloading this dep and is now hashing it (sha256
        // re-reads the whole file — seconds on a CPU Pod, no byte progress). Flip the
        // bar to the indeterminate "Verifying…" sweep so the otherwise-silent stall
        // at 100% is explained — matching the LOCAL path (see download:verifying emit
        // in FileDownloader.on('end')). Keeps remote + local consistent.
        // (MPI-140; supersedes the MPI-95 park-at-100% determinate choice.)
        const total = Number(data.total) || depJob.totalBytes || 0;
        if (total) depJob.totalBytes = total;
        depJob.downloadedBytes = total || depJob.downloadedBytes;
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depId);
            if (!myDep) continue;
            modelJob.totalBytes = modelJob.deps.reduce((s, d) => s + _depDenominator(d), 0);
            modelJob.downloadedBytes = modelJob.deps.reduce((s, d) => s + (d.downloadedBytes || 0), 0);
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            // MPI-164 — the model-level "Verifying…" sweep belongs ONLY once EVERY
            // dep is byte-complete: a per-dep verify of one dep mid-install was
            // flipping the whole-model bar to an indeterminate "Verifying…" while
            // other deps were still downloading (user read it as a stall/failure).
            // While any dep still has bytes to fetch, keep the tick determinate.
            // When all deps ARE byte-complete, pin the bar to a FULL 100% under
            // the sweep (MPI-140 contract: download fills the bar, THEN verify).
            // custom_nodes deps are WORK, not bytes — a requirements-only node
            // re-install sits at 0 bytes through its whole pip run (minutes),
            // which gated the sweep off for the entire final weight hash (live
            // 2026-07-02: bar hung full+determinate, then snapped to INSTALLED).
            // Their few MB are invisible next to multi-GB weights; exclude them.
            const allBytesDone = modelJob.deps.every(d =>
                d.status === 'complete'
                || d.type === 'custom_nodes'
                || (d.downloadedBytes || 0) >= _depDenominator(d));
            if (allBytesDone) {
                modelJob.downloadedBytes = modelJob.totalBytes;
                modelJob.progress = 1;
            }
            _syncStoreProgress(modelJob); // 4c: mirror live progress into the store SOT
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: '',
                progress: modelJob.progress,
                indeterminate: allBytesDone,
                phase: allBytesDone ? 'verifying' : undefined,
            });
        }
    } else if (evt.type === 'models:install-complete') {
        depJob.downloadedBytes = Number(data.size_bytes) || depJob.totalBytes || 0;
        depJob.totalBytes = depJob.downloadedBytes;
        _setDepStatus(depJob, 'complete', 'remote complete');
        _remoteDepIds.delete(depId);
        _broadcast('download:complete', { depId, modelId: null });
        // A per-model custom_node landed on the volume; ComfyUI only scans
        // custom_nodes at startup, so the Pod must warm-cycle before the new
        // node loads (Design B+). Surface it so the app can prompt/reconnect.
        if (data.needs_comfy_restart) {
            _broadcast('comfy:needs-restart', { depId, remote: true });
        }
        _checkModelJobsComplete();
        _teardownRemoteEventStreamIfIdle();
    } else if (evt.type === 'models:install-error') {
        _remoteDepIds.delete(depId);
        if (data.error === 'cancelled') {
            _setDepStatus(depJob, 'cancelled', 'remote cancelled');
        } else {
            _setDepStatus(depJob, 'failed', 'remote failed');
            depJob.error = data.message || data.error || 'remote install failed';
            _broadcast('download:failed', { depId, error: depJob.error });
        }
        _checkModelJobsComplete();
        _teardownRemoteEventStreamIfIdle();
    }
}

async function _startRemoteDownload(modelId, dependencies, res) {
    // REMOTE path: keep only deps the POD engine installs (drop the 41GB bf16
    // transformer the local engine uses). Renderer already resolves per-engine;
    // defend server-side by intersecting against the model's remote universe.
    // (MPI-163 — engine-aware resolution, replaces the old per-dep-tag post-filter;
    //  MPI-179 — union the remote extraDeps back in so a stale-engine request heals)
    dependencies = _withEngineExtraDeps(modelId, _filterDepsForEngine(modelId, dependencies, 'remote'), 'remote');

    let modelJob = _modelJobs.get(modelId);
    if (!modelJob) {
        modelJob = _createModelJob(modelId, dependencies);
        _modelJobs.set(modelId, modelJob);
    }
    // Remote installs never run local custom-node extraction — custom_nodes are
    // image-resident on the Pod, so completion must not route through
    // _runCustomNodeInstall (which extracts a local zip that does not exist).
    modelJob.installCustomNodes = false;

    // Resolve which deps are already installed on the volume up-front so the
    // progress bar starts at the right place (matches the local path's behavior).
    let statusResults = {};
    try {
        // Pass raw app deps (subdir filename) — remoteModelsCheck owns the split.
        const checkModels = [{ id: modelId, deps: dependencies.map(d => ({ id: d.id, type: d.type, filename: d.filename })) }];
        const out = await remoteModels.remoteModelsCheck(checkModels);
        statusResults = (out && out.results && out.results[modelId] && out.results[modelId].deps) || [];
        statusResults = Object.fromEntries(statusResults.map(d => [d.id, d]));
    } catch (err) {
        // Non-fatal: treat as nothing installed and let install dedupe handle it.
        logger.warn('download', `remote pre-check failed: ${err.message}`);
    }

    // MPI-481 — fresh truth for the ATTACH guard's IN-FLIGHT arms, the way
    // statusResults above is fresh truth for its 'complete' arm. `_remoteDepIds`
    // and a dep job's 'downloading' are module-level state scoped to ONE Pod
    // instance, and nothing settles them when that Pod dies, is deleted, or
    // warm-cycles: the wrapper emits no terminal event for an install that died
    // with the host. So every dep of the dead run stays 'downloading' forever and
    // the next Install ATTACHES to a corpse — no /wrapper/models/install fires at
    // all, the bar sits where the dead run left it, and only an app restart clears
    // it. The wrapper's install registry knows what is really running.
    // NOTE this cannot be answered by statusResults: a dep the volume reports as
    // installed:false is EITHER a corpse OR a genuinely live download, and reading
    // that as "not in flight" would fire a duplicate install for every real
    // shared-dep attach — which the wrapper 409s ("this model is already
    // downloading"), i.e. exactly the Download-Failed dialog MPI-97 removed.
    // null = could not ask (unreachable / old wrapper) → keep trusting the cache;
    // a false attach only delays, a false duplicate install fails the whole model.
    let wrapperInFlight = null;
    try {
        wrapperInFlight = await remoteModels.remoteActiveInstallIds();
    } catch (err) {
        logger.warn('download', `remote in-flight check failed: ${err.message}`);
    }

    // SET, never += (MPI-276 G12) — a re-POST must not accumulate the denominator.
    // totalBytes is computed AFTER the dep loop, from modelJob.deps — the remote twin
    // of the local rule; see the note beside the recalculation below.

    const toInstall = [];
    for (const dep of dependencies) {
        let depJob = _depJobs.get(dep.id);
        if (!depJob) {
            depJob = _createDepJob(dep);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
            _depJobs.set(dep.id, depJob);
        }
        if (!modelJob.deps.find(d => d.id === dep.id)) modelJob.deps.push(depJob);

        // MPI-97 — shared-dep ATTACH. When this dep is already installing for
        // ANOTHER model (its wrapper install is in flight: `_remoteDepIds` holds
        // it, or its job is mid-download/already-finished this session), model B
        // must NOT fire a second `/wrapper/models/install` — the wrapper rejects a
        // duplicate ("this model is already downloading") and B's whole install
        // was failing with a Download-Failed + Report-on-GitHub dialog. Instead B
        // ATTACHES: the dep stays in B's
        // modelJob.deps, and the shared install SSE (_onRemoteInstallEvent loops
        // EVERY modelJob owning this dep id) fills B's bar from A's stream. B
        // settles via _checkModelJobsComplete when the shared dep lands. We do not
        // touch the dep's live status/bytes here and we do NOT add it to toInstall.
        // MPI-100 — a cached `complete` is only trustworthy if the volume STILL
        // has the file. After an uninstall (deleteFiles), the module-level
        // _depJobs entry keeps its stale 'complete' from a prior install; without
        // this, the ATTACH guard below short-circuits the re-install, toInstall
        // ends empty, no /wrapper/models/install fires, and the card flips to a
        // FALSE green INSTALLED while the weight is gone. The up-front
        // remoteModelsCheck (statusResults) is fresh wrapper truth (real on-disk
        // existence+size), so prefer it: a dep the volume reports as NOT installed
        // must not read 'complete' from cache. statusResults absent (pre-check
        // failed) → fall back to the cached status (install dedupe still guards).
        // MPI-481 — both in-flight arms are the SAME Pod-scoped cache (they are
        // set and cleared together), so one cross-check covers both: the wrapper
        // must still own this install. Anything it disowns is a corpse and falls
        // through to a real install below.
        const freshStatus = statusResults[dep.id];
        const reallyComplete = depJob.status === 'complete'
            && (freshStatus ? freshStatus.installed === true : true);
        const cachedInFlight = _remoteDepIds.has(dep.id) || depJob.status === 'downloading';
        const reallyInFlight = cachedInFlight
            && (wrapperInFlight ? wrapperInFlight.has(dep.id) : true);
        if (cachedInFlight && !reallyInFlight) {
            // Drop the record too, or _remoteDepIds never empties: the stall
            // watchdog keeps polling and _teardownRemoteEventStreamIfIdle never
            // closes the SSE, both for a dep no wrapper is installing.
            _remoteDepIds.delete(dep.id);
            logger.warn('download', `stale in-flight record for ${dep.id} — the wrapper has no such install; reinstalling`);
        }
        if (reallyInFlight || reallyComplete) {
            // Attach only — leave the shared dep's live state alone.
            continue;
        }

        // remoteModelsCheck already reports universal (image-resident) nodes as
        // installed and per-model nodes/weights by their real volume state, so
        // trust `installed`: anything not present is installed via the wrapper
        // (per-model custom_nodes now install onto the volume — Design B+).
        const alreadyInstalled = !!(statusResults[dep.id] && statusResults[dep.id].installed);
        // MPI-244: a BAKED (image-resident) custom_node lives in the Pod IMAGE at
        // /opt/ComfyUI/custom_nodes, NOT on the /workspace volume. Its pip
        // requirements already ran at image-build time. The `requirements_only`
        // self-heal below `cd`s into the volume node folder to re-run pip -r — but
        // a baked node has NO volume folder, so the wrapper dies with
        // "[Errno 2] No such file or directory: '/workspace/.../comfyui_controlnet_aux'"
        // and the whole model install fails with a Download-Failed dialog. Baked
        // nodes are already present + already have their deps: settle complete,
        // never send them to the wrapper. (comfyui_controlnet_aux is the first baked
        // node a model DECLARES as a dep — LTX/Impact/etc. are implicit engine deps,
        // never in a model's `deps`, so this path was never hit before Krea2.)
        // MPI-293: the image-resident check must run REGARDLESS of alreadyInstalled.
        // On a FRESH volume the wrapper scans /workspace and reports a baked node as
        // NOT installed (it lives in the image at /opt, invisible to the volume scan),
        // so `alreadyInstalled` is false — but sending it to the wrapper still dies
        // with the Errno-2 above because there is no volume folder to cd into. A baked
        // node is present + its pip deps ran at build time: settle complete either way.
        if (dep.type === 'custom_nodes' && remoteModels._isImageResident(dep)) {
            _setDepStatus(depJob, 'complete', 'remote baked complete');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else if (alreadyInstalled && dep.type === 'custom_nodes') {
            // A custom_node folder present on the volume does NOT prove its pip
            // requirements ran (a prior install may have landed the folder but
            // failed/skipped requirements.txt — e.g. ComfyUI-GGUF present but the
            // `gguf` pkg missing → node import fails on every gen). The wrapper's
            // status check only sees the folder. So for a custom_node in THIS
            // install request, still send it with `requirements_only` so the
            // wrapper re-runs (idempotent) pip -r requirements.txt WITHOUT
            // re-downloading or removing the folder. Self-heals the recurring
            // "node present, dep missing" class. Weights (non-node) trust the flag.
            _setDepStatus(depJob, 'queued', 'remote node requeue');
            depJob.downloadedBytes = 0;
            depJob.error = null;
            toInstall.push({ ...dep, requirementsOnly: true });
        } else if (alreadyInstalled) {
            _setDepStatus(depJob, 'complete', 'remote already-installed');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else {
            _setDepStatus(depJob, 'queued', 'remote requeue');
            depJob.downloadedBytes = 0;
            depJob.error = null;
            // MPI-222: a DRIFTED volume node's folder is still present (wrong commit),
            // so the wrapper would answer `already_installed` and never re-fetch. Carry
            // the drift flag → remoteInstallDep sends force:true → wrapper rmtree's the
            // stale folder + re-clones at the pinned commit + re-stamps the marker.
            const freshStatus = statusResults[dep.id];
            toInstall.push(freshStatus && freshStatus.drifted ? { ...dep, forceReinstall: true } : dep);
        }
    }

    // NOTE (MPI-100): there is NO truthful remote disk-full PRE-FLIGHT here. A
    // RunPod network volume enforces its size as a QUOTA that statvfs cannot see
    // (statvfs reports the multi-PB container overlay, not the 80GB volume cap),
    // and the RunPod REST volume object exposes only the configured size, never
    // live usage. So a doomed install can't be reliably blocked up-front; instead
    // the wrapper's "[Errno 122] Disk quota exceeded" failure is caught REACTIVELY
    // in downloadService and surfaced as a friendly disk-full toast (not the
    // GitHub error dialog). The LOCAL install path keeps its real statfs gate.

    // MPI-95: the denominator seeded above is summed from rounded registry sizes,
    // which the wrapper's real content-length bytes overshoot — causing the ~80%
    // snap on press. The wrapper's _resolve_total reports a real per-dep `total`
    // from the first models:install-progress tick; _onRemoteInstallEvent then
    // RE-DERIVES modelJob.totalBytes from the corrected per-dep totals every tick
    // (the seed here is only the pre-first-tick placeholder). Here we show an
    // instant indeterminate "Preparing…" so the first frame isn't a fake number in
    // the gap before that first tick arrives; the tick clears it to a real %.
    // ── Remote disk-full pre-flight gate (mirrors the local MPI-99 gate) ─────
    // The MPI-100 note above said a truthful remote pre-flight was impossible;
    // MPI-169's `du` route made the volume's USED bytes real, so free space =
    // configured size − used is now knowable. Block a doomed install up-front
    // (needed > free) with the SAME friendly disk-full message the reactive toast
    // uses, instead of letting it run and die at ~98% with a cryptic stall/
    // peer-closed error the disk-full matcher can't recognise. Only deps in
    // toInstall need NEW space; a 5% margin covers .part overhead. Unknown free
    // space (old wrapper / du fail / size unresolved) → skip the gate, never
    // false-block. seedBytes = declared size, known NOW (totalBytes is still 0).
    const remoteNeededBytes = toInstall.reduce(
      (sum, d) => sum + _parseSizeToBytes(d.size), 0);
    if (remoteNeededBytes > 0) {
      let freeInfo = null;
      try {
        const { remoteVolumeFreeBytes } = _require('./remotePodLifecycle');
        freeInfo = await remoteVolumeFreeBytes();
      } catch (err) {
        logger.warn('download', `remote free-space check unavailable: ${err.message}`);
      }
      if (freeInfo && Number.isFinite(freeInfo.freeBytes)
          && freeInfo.freeBytes < remoteNeededBytes * 1.05) {
        _setModelStatus(modelJob, 'idle', 'remote disk-full idle');
        logger.warn('download', `remote install blocked — volume full: need ${_fmtGb(remoteNeededBytes)}, have ${_fmtGb(freeInfo.freeBytes)} free of ${_fmtGb(freeInfo.totalBytes)}`);
        return res.status(400).json({
          error: `[Errno 28] No space left on device — ${_fmtGb(remoteNeededBytes)} needed, ${_fmtGb(freeInfo.freeBytes)} free on the Pod volume.`,
        });
      }
    }

    // Both sides from modelJob.deps, via the same helper the remote progress tick uses
    // — the remote twin of the local fix; the full reasoning is beside that one.
    const startRatio = _byteRatioExcludingNodes(modelJob.deps, 'remote');
    modelJob.downloadedBytes = startRatio.downloaded;
    modelJob.totalBytes = startRatio.total;
    modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
    _registerModelInStore(modelJob, 'remote');
    _setModelStatus(modelJob, 'downloading', 'remote download start');
    _resetModelSpeed(modelJob);

    if (!toInstall.length) {
        // Everything already present — settle the job state immediately.
        _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });
        res.json({ success: true, jobId: modelId, version: store.version(), job: _serializeModelJob(modelJob) });
        _checkModelJobsComplete();
        return;
    }

    // Instant feedback: indeterminate, no number to lie about until the wrapper's
    // first real-total progress tick arrives.
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress, indeterminate: true });

    // Respond before kicking off installs (matches the local path's fire-and-forget).
    // Register-before-respond (MPI-276 G8): job snapshot in the body.
    res.json({ success: true, jobId: modelId, version: store.version(), job: _serializeModelJob(modelJob) });

    _ensureRemoteEventStream();
    for (const dep of toInstall) {
        const depJob = _depJobs.get(dep.id);
        if (depJob) _setDepStatus(depJob, 'downloading', 'remote dep start');
        _remoteDepIds.add(dep.id);
        // Do NOT pass the app's display `size` ("67MB") as size_bytes — it is
        // approximate and the wrapper rejects an exact-correct file on a
        // done != expected_size mismatch. The wrapper uses content-length for
        // the progress total and the dep sha256 (when present) for integrity.
        remoteModels.remoteInstallDep(dep, { force: dep.forceReinstall === true })
            .then((out) => {
                // already_installed: the SSE will not fire — settle here.
                if (out && out.status === 'already_installed') {
                    const dj = _depJobs.get(dep.id);
                    if (dj) {
                        _setDepStatus(dj, 'complete', 'remote uw dep complete');
                        dj.downloadedBytes = dj.totalBytes || _parseSizeToBytes(dep.size);
                    }
                    _remoteDepIds.delete(dep.id);
                    _broadcast('download:complete', { depId: dep.id, modelId: null });
                    _checkModelJobsComplete();
                    _teardownRemoteEventStreamIfIdle();
                }
            })
            .catch((err) => {
                const dj = _depJobs.get(dep.id);
                // MPI-480 — stash the transient verdict alongside the message. The dep-level
                // broadcast below is silent client-side (no modelId, MPI-97); the reason and
                // its classification only reach the user via _checkModelJobsComplete, which
                // reads them off the failed dep. Dropping the flag here loses it for good.
                if (dj) { _setDepStatus(dj, 'failed', 'remote uw dep error'); dj.error = err.message; dj.transient = Boolean(err.transient); }
                _remoteDepIds.delete(dep.id);
                logger.error('download', `remote install trigger failed for ${dep.id}: ${err.message}`);
                _broadcast('download:failed', { depId: dep.id, error: err.message });
                _checkModelJobsComplete();
                _teardownRemoteEventStreamIfIdle();
            });
    }
}

// ── Model Job Completion ──────────────────────────────────────────────────────

function _recalculateModelJobProgress(modelJob) {
    modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
    // MPI-95 — best-known denominator (real total or registry seed) so a dep that
    // has not reported a real total yet never collapses the denominator to 0.
    modelJob.totalBytes = modelJob.deps.reduce((sum, d) => sum + _depDenominator(d), 0) || modelJob.totalBytes;
    modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
}

function _downloadJobEventPayload(modelJob) {
    return {
        modelId: modelJob.modelId,
        status: modelJob.status,
        downloadedBytes: modelJob.downloadedBytes || 0,
        totalBytes: modelJob.totalBytes || 0,
        speed: modelJob.speed || '',
        progress: modelJob.progress || 0,
    };
}

function _checkModelJobsComplete() {
    for (const modelJob of _modelJobs.values()) {
        if (modelJob.status !== 'downloading') continue;
        const anyFailed = modelJob.deps.some(d => d.status === 'failed');
        const allComplete = modelJob.deps.every(d => d.status === 'complete');
        const allDone = modelJob.deps.every(d => ['complete', 'failed', 'cancelled'].includes(d.status));

        if (anyFailed || (allDone && !allComplete)) {
            _setModelStatus(modelJob, 'failed', 'uw fail');
            // Surface the first failed dep's error so the UI shows a real reason
            // instead of "undefined" (the model-level event carried no error).
            const failedDep = modelJob.deps.find(d => d.status === 'failed' && d.error);
            _broadcast('download:failed', {
                modelId: modelJob.modelId,
                error: failedDep ? failedDep.error : 'One or more dependencies failed to download',
                // MPI-427 — carry the network-blocked verdict up so the client routes it
                // to a friendly toast instead of the Report-on-GitHub dialog.
                networkBlocked: Boolean(failedDep && failedDep.networkBlocked),
                // MPI-480 — same reasoning for a warming Pod's wrapper: the condition
                // self-heals on a retry, so it is a toast, never a GitHub report.
                transient: Boolean(failedDep && failedDep.transient),
            });
        } else if (allComplete) {
            if (modelJob.installCustomNodes) {
                _setModelStatus(modelJob, 'installing', 'uw installing');
                _broadcast('download:installing', { modelId: modelJob.modelId });
                _runCustomNodeInstall(modelJob).catch(err => {
                    logger.error('download', `_runCustomNodeInstall crashed: ${err.message}`);
                    _setModelStatus(modelJob, 'failed', 'uw install fail');
                    // Carry the reason (MPI-452). This is the SECOND download:failed for
                    // the same model on the expected path: _runCustomNodeInstall already
                    // broadcast one WITH `error`, then threw the same text, and this
                    // catch re-broadcast without it — so the client's later event
                    // clobbered the good message and the dialog rendered a blank field
                    // while the log held the full reason. Same defect MPI-387 fixed for
                    // the dep-level branch above; it never reached this call site.
                    // err.message is the real reason on a genuine crash too.
                    _broadcast('download:failed', { modelId: modelJob.modelId, error: err.message });
                });
            } else {
                _setModelStatus(modelJob, 'complete', 'uw done');
                _broadcast('download:complete', { modelId: modelJob.modelId });
            }
        }
    }
}

async function _runCustomNodeInstall(modelJob) {
    const customDeps = modelJob.deps.filter(d =>
        d.status === 'complete' && d.localPath != null && d.type === 'custom_nodes'
    );
    if (!customDeps.length) {
        logger.info('download', `_runCustomNodeInstall: no custom_nodes deps found for model ${modelJob.modelId}`);
        _setModelStatus(modelJob, 'complete', 'uw done');
        _broadcast('download:complete', { modelId: modelJob.modelId });
        return;
    }
    logger.info('download', `_runCustomNodeInstall: extracting ${customDeps.length} custom node(s) for model ${modelJob.modelId}`);

    // MPI-387: keep the two failure KINDS apart. One shared `anyFailure` boolean
    // meant every outcome — including three failed *pip* steps on a clean Win11
    // box where all 14 zips extracted fine — surfaced as "One or more custom node
    // extractions failed". That wrong attribution is why an agent told the user to
    // press Retry, which re-ran the same deterministic pip failures. Name the deps
    // and the phase so the log and the toast point at the real step.
    const extractFailures = [];
    const installFailures = [];

    // NO pip pass here (MPI-459). The one curated pass (MPI-413) used to run at this
    // point, and mid-install is precisely when the engine is most likely to be UP —
    // which on Windows makes replacing an already-imported package (cv2.pyd) a hard
    // `WinError 5` and the whole model install a `Download Failed`. It now runs from
    // `/comfy/start` with the process down; see `ensureCuratedPythonDeps` in
    // routes/shared.js. The `comfyNeedsRestart` flag set at the end of this function is
    // what carries the deps to that boot — the same restart the new nodes already need
    // before ComfyUI will scan them.

    for (const dep of customDeps) {
        // Guard: skip deps without a valid localPath string
        if (dep.localPath == null || typeof dep.localPath !== 'string') {
            logger.warn('download', `dep ${dep.id} has invalid localPath (${JSON.stringify(dep.localPath)}), skipping`);
            continue;
        }
        if (!dep.filename || typeof dep.filename !== 'string') {
            logger.warn('download', `dep ${dep.id} has invalid filename (${JSON.stringify(dep.filename)}), skipping`);
            continue;
        }
        const zipPath = String(dep.localPath); // ensure string
        const extractDir = path.dirname(zipPath); // custom_nodes/
        const targetDir = path.join(extractDir, dep.filename); // dep.filename is the source of truth for target name

        // If the extracted node ALREADY has its own files, skip ONLY extraction —
        // but still fall through to the requirements step below. A node folder can
        // land without its pip deps (a prior install where requirements.txt
        // failed/was interrupted, or the node was extracted by a different path
        // that never ran pip); folder-present is NOT proof the deps are installed.
        // `pip install -r` (WITHOUT --upgrade) is idempotent — a no-op when already
        // satisfied — so re-running it is cheap + self-healing. This is the general
        // cure for the recurring "node present, dep missing" class (e.g. ComfyUI-GGUF
        // folder on disk but `gguf` pkg absent).
        //
        // MPI-413: this comment used to claim --upgrade was the idempotent one, and
        // the install below passed it. That is exactly backwards, and the false belief
        // is why the bug stayed invisible. --upgrade re-resolves EVERY listed name AND
        // its transitive deps from the default index, so an already-correct pinned
        // build gets replaced — on a CPU-only box, torch 2.13.0+cpu became
        // 2.13.0+cu130 plus ~14 nvidia-* wheels, gigabytes, on a machine with no
        // NVIDIA driver. Same mechanism bit MPI-217 (opencv 4.13→5.0, numpy bump).
        // Dropping --upgrade keeps the self-heal (missing packages still install) and
        // loses only the drift. `pipPins` below stays the corrective path when a node
        // genuinely needs something newer. This also CONVERGES with the remote twin,
        // which has always run without --upgrade (cubric-vision-pod wrapper.py
        // `_install_node_requirements`).
        //
        // MPI-243: `pathExists(targetDir)` alone is a FALSE POSITIVE. A `targetPath`
        // weight (e.g. RIFE's ckpts/rife/rife47.pth, which resolves UNDER the node
        // folder) downloads first and creates `comfyui-frame-interpolation/` with
        // only a `ckpts/` subdir — no node files. The old check then "skipped
        // extraction" and ran `python install.py` in a folder that has no
        // install.py → Errno 2, "UW deps installation failed", user must Retry.
        // A real node always ships top-level FILES (__init__.py, install.py). So
        // "already extracted" means: the folder holds at least one top-level file,
        // not just weight subdirs.
        const alreadyExtracted = await _nodeFolderHasFiles(targetDir);
        if (alreadyExtracted) {
            logger.info('download', `Custom node already extracted: ${targetDir}, skipping extraction but verifying requirements`);
        }

        if (!alreadyExtracted) {
            // Extract GitHub archive zip (extracts to custom_nodes/owner-repo-main/)
            // Do this FIRST so we can scan for the extracted folder AFTER it's created
            try {
                if (await fs.pathExists(zipPath)) {
                    logger.info('download', `Extracting zip: ${zipPath}`);
                    await _extractZipArchive(zipPath, extractDir);
                    await fs.remove(zipPath); // clean up zip after successful extraction
                    logger.info('download', `Zip extracted and removed: ${zipPath}`);
                } else {
                    // Zip not found — download was never completed. Mark failure so repair
                    // flow (engine/repair-deps) re-triggers the full download.
                    logger.warn('download', `Zip not found at ${zipPath} — marking dep for repair re-download`);
                    extractFailures.push(`${dep.id} (zip missing)`);
                    continue;
                }
            } catch (err) {
                logger.error('download', `zip extract FAILED for ${dep.id}: ${err.message} — removing corrupted zip so repair can re-download`);
                await fs.remove(zipPath).catch(() => {}); // delete corrupted zip so repair re-downloads it
                extractFailures.push(`${dep.id} (${err.message})`);
                continue;
            }

            // Scan for the extracted folder — GitHub archives extract as '<RepoName>-<BranchName>/'
            // The branch name casing varies (e.g. 'main' vs 'Main') and the repo name casing
            // may differ from dep.filename. Match case-insensitively against dep.filename and
            // dep.id, accepting any branch-name suffix after the last '-'.
            let extractedMainDir = null;
            try {
                const entries = await fs.readdir(extractDir, { withFileTypes: true });
                const targetLower = (dep.filename || '').toLowerCase();
                const depIdLower = (dep.id || '').toLowerCase();
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const entryLower = entry.name.toLowerCase();
                    // Strip the last '-<branch>' segment and compare the base against dep.filename/dep.id
                    const lastDash = entryLower.lastIndexOf('-');
                    if (lastDash === -1) continue;
                    const entryBase = entryLower.slice(0, lastDash);
                    if (entryBase === targetLower || entryBase === depIdLower) {
                        extractedMainDir = path.join(extractDir, entry.name);
                        logger.info('download', `Found extracted folder: ${extractedMainDir}`);
                        break;
                    }
                }
            } catch (err) {
                logger.error('download', `scan for extracted folder failed for ${dep.id}: ${err.message}`);
            }

            if (!extractedMainDir) {
                // Zip was removed (extraction succeeded per flow) but folder not found — corrupt extraction
                logger.warn('download', `Could not find extracted folder for ${dep.id} in ${extractDir} — corrupt zip, will re-download on repair`);
                extractFailures.push(`${dep.id} (extracted folder not found)`);
                continue;
            }

            // Rename 'owner-repo-main' → 'owner-repo' (dep.filename)
            try {
                if (await _nodeFolderHasFiles(targetDir)) {
                    // A fully-extracted node is already there — the freshly-extracted
                    // copy is a duplicate; drop it.
                    await fs.remove(extractedMainDir);
                    logger.warn('download', `Target ${targetDir} already extracted, removed duplicate: ${extractedMainDir}`);
                } else if (await fs.pathExists(targetDir)) {
                    // MPI-243: targetDir exists but holds NO node files — it's the
                    // weight-shell a `targetPath` dep created (e.g. RIFE's ckpts/
                    // landed here before the node extracted). MERGE the node's files
                    // into it instead of deleting the node (the old `remove` branch
                    // dropped the real node and left the empty shell → `install.py`
                    // missing). `overwrite` lets node files win; the existing weight
                    // subdir is preserved.
                    await fs.copy(extractedMainDir, targetDir, { overwrite: true });
                    await fs.remove(extractedMainDir);
                    logger.info('download', `Merged extracted node into weight-shell ${targetDir}`);
                } else {
                    await fs.move(extractedMainDir, targetDir);
                    logger.info('download', `Renamed ${extractedMainDir} → ${targetDir}`);
                }
            } catch (err) {
                logger.error('download', `folder rename failed for ${dep.id}: ${err.message}`);
            }
        }

        // No per-node requirements step here any more — MPI-413. The engine installs
        // ONE curated set (`ensureCuratedPythonDeps` in routes/shared.js, run at engine
        // start since MPI-459) instead of asking each node to resolve its own
        // requirements.txt on the user's machine. The Pod converged on the same set, so
        // the remote passthrough is gone too.

        // Stamp the pinned-commit marker LAST, so it only lands on a fully-extracted
        // node. A missing/mismatched marker = drift → targeted reinstall on next boot
        // (MPI-222). No-op for unpinned nodes. Its pip deps are covered by the curated
        // set, which has its own marker (MPI-413).
        try {
            const stamped = await writeNodeCommitMarker(targetDir, dep.id);
            if (stamped) logger.info('download', `node commit marker stamped for ${dep.id}`);
        } catch (err) {
            logger.warn('download', `node commit marker write failed for ${dep.id}: ${err.message}`);
        }
    }

    if (extractFailures.length || installFailures.length) {
        const message = _describeNodeInstallFailures(extractFailures, installFailures);
        _setModelStatus(modelJob, 'failed', 'local fail');
        _broadcast('download:failed', { modelId: modelJob.modelId, error: message });
        throw new Error(message);
    }

    _setModelStatus(modelJob, 'complete', 'local done');
    _broadcast('download:complete', { modelId: modelJob.modelId });
    // A custom node was installed. The frontend gets `comfy:needs-restart` (→
    // state.comfyNeedsRestart) and the gen gate restarts ComfyUI. But that flag is
    // FRONTEND-ONLY and dies on an app restart — and if the node was installed while
    // ComfyUI was still BOOTING (e.g. "start ComfyUI on launch" + Install pressed
    // mid-boot), ComfyUI's one-shot node scan already ran and cached an IMPORT
    // FAILURE, yet the frontend flag is lost on the next app restart → the node
    // silently never loads. Mirror the flag SERVER-side so it is authoritative and
    // survives a browser/app reload; the gen gate (and /comfy/status) consult it.
    // LOCAL installs only — a remote (Pod) install owns its own restart path
    // (state.remoteComfyNeedsRestart), so don't poison the local flag during a
    // remote session.
    if (!remoteModels.isRemoteActive()) {
        processState.comfyNeedsRestart = true;
    }
    _broadcast('comfy:needs-restart', { modelId: modelJob.modelId });
}

// ── Cancel ────────────────────────────────────────────────────────────────────
// Pause/Resume removed (MPI-258 Bug 2): NDH resume appended a full 200 response onto
// a partial → SHA256 corruption. Cancel does a clean stop() + remove; a fresh install
// re-downloads single-stream. Installs are queued (MPI-184) so pause had little value.

router.post('/comfy/models/download/cancel', async (req, res) => {
    const { modelId } = req.body;
    const job = _modelJobs.get(modelId);
    // Cancel is idempotent: a job the backend already lost (restart mid-install, a
    // double Cancel press, an already-completed download) is not an error — nothing
    // to stop. Return 200 so the client isn't spammed with 404s in the console.
    // (MPI-258 Bug B)
    if (!job) { _broadcast('download:cancelled', { modelId }); return res.json({ success: true, alreadyGone: true }); }

    for (const dep of job.deps) {
        // MPI-97 — cancelling THIS model must not stop a dep another ACTIVE model is
        // still downloading. Gate on live consumers (job status), never a refCount:
        // refCount leaked upward (a successful download never decremented it) so a
        // second install of the same model stacked it to 2 and cancel then saw 1 > 0,
        // skipped dl.cancel(), deleted _modelJobs, and left the download streaming
        // invisibly while every re-press 404'd. (MPI-258 Bug B; refCount DELETED
        // MPI-276.) _otherActiveModelUsesDep excludes THIS model (still in _modelJobs).
        if (!_otherActiveModelUsesDep(dep.id, modelId)) {
            // Remote install in flight on the Pod — cancel via the wrapper.
            if (_remoteDepIds.has(dep.id)) {
                _remoteDepIds.delete(dep.id);
                await remoteModels.remoteCancelInstall(dep.id);
                // MPI-123 — remoteCancelInstall is SOFT+ASYNC: the wrapper only
                // sets a cancel flag and removes the `<dest>.part` on its next
                // chunk write, so the frontend re-sync (/wrapper/models/status)
                // races the purge and reports the stale partialBytes the user
                // saw stuck on the card. Follow with a synchronous delete so the
                // `.part` is gone by the time this route returns and the card
                // re-derives a clean readout. Best-effort — never hard-fail cancel.
                await remoteModels.remoteUninstallDep(dep).catch(() => {});
            }
            const dl = _activeDownloaders.get(dep.id);
            if (dl) {
                await dl.cancel();
                _activeDownloaders.delete(dep.id);
            }
            if (dep.localPath) clearDownloadMarker(dep.localPath).catch(() => {});
            _setDepStatus(dep, 'cancelled', 'cancel');
            _depJobs.delete(dep.id);
        }
    }

    _teardownRemoteEventStreamIfIdle();
    // Drive the store to the terminal state (it holds the cancelled job on its own
    // short TTL — the final SOT; the map hard-delete below is the legacy path the
    // write-flip step removes).
    if (store.modelJob(modelId)) _setModelStatus(job, 'cancelled', 'user cancel');
    _modelJobs.delete(modelId);
    _broadcast('download:cancelled', { modelId });
    _startPendingDeps();
    res.json({ success: true });
});

// ── Uninstall ─────────────────────────────────────────────────────────────────

router.post('/comfy/models/uninstall', async (req, res) => {
    const { modelId, dependencies: wireDeps, deleteFiles = true } = req.body;
    if (!modelId || !Array.isArray(wireDeps)) {
        return res.status(400).json({ error: 'modelId + dependencies required' });
    }

    // MPI-276 G13: uninstall previously trusted the wire dep array verbatim, so a
    // stale client / direct API call could ask to delete the WRONG engine's files
    // (remote-resolved deps against local disk, or vice-versa). Re-resolve the
    // engine-correct universe server-side and keep only deps that belong to it.
    // Unknown model passes through unchanged (same _filterDepsForEngine contract as
    // install). Wire the filtered set through the rest of the route as `dependencies`.
    const _engine = remoteModels.isRemoteActive() ? 'remote' : 'local';
    const dependencies = _filterDepsForEngine(modelId, wireDeps, _engine);

    // Remote mode: the model files live on the Pod volume, NOT local disk. The
    // local trash path below would destroy the user's LOCAL models and leave the
    // volume untouched (UI then desyncs because a re-check still sees the volume
    // files). Route deletion to the wrapper instead. The wrapper delete endpoint
    // ships in image v0.4.0 / wrapper 0.2.3 (MPI-75); on an OLDER Pod image it is
    // absent, so remoteUninstallDep returns 'unsupported' and we surface that
    // (toast below) without trashing anything.
    if (remoteModels.isRemoteActive()) {
        const _universalIds = new Set(getUniversalWorkflowDepIds());
        const removed = [];
        const keptUniversal = [];
        const keptShared = [];
        const keptModelFiles = [];
        let anyUnsupported = false;

        // Resolve which deps are still needed by ANOTHER model installed on the
        // volume (NOT the dead backend `MODELS[].installed` flag). If this check
        // fails we ABORT rather than risk deleting a shared dep we could not
        // verify — uninstalling Wan I2V must not trash the VAE + text-encoder that
        // Wan T2V shares (that bug dragged T2V to PARTIAL).
        let sharedKeep;
        try {
            sharedKeep = await _remoteSharedDepIds(modelId);
        } catch (err) {
            // Transient: the wrapper was unreachable (Pod still resuming from
            // warm-stop → proxy 404/502 during warm-up) so we could not verify the
            // shared-dep set. This is NOT a bug — it self-heals once the wrapper is
            // ready. Surface a 'transient' reason so the renderer shows a TOAST, not
            // an error+Report-on-GitHub dialog (which produced junk issues for a
            // benign warm-up window).
            return res.json({
                success: false,
                remoteUnsupported: 'uninstall',
                reason: 'wrapper-unreachable',
                message: 'The Pod is still starting up — could not verify shared files yet. Try the uninstall again in a moment.',
            });
        }

        for (const dep of dependencies) {
            if (_universalIds.has(dep.id)) {
                keptUniversal.push({ depId: dep.id, depName: dep.name || dep.id });
                continue;
            }
            if (sharedKeep.has(dep.id)) {
                keptShared.push({ depId: dep.id, depName: dep.name || dep.id });
                continue;
            }
            // MPI-97 — honor the "delete files from disk" checkbox in REMOTE mode.
            // The LOCAL branch keeps the file when `deleteFiles` is false; the remote
            // branch previously ignored the flag and ALWAYS called the wrapper delete,
            // so unchecking the box still trashed the weights off the Pod volume (a
            // user lost ~30GB of Wan 2.2 T2V weights this way). When the box is
            // unchecked we KEEP every volume dep and just drop the install record —
            // a re-install is then near-instant.
            //
            // This includes PER-MODEL custom_nodes (e.g. ComfyUI-PainterI2Vadvanced):
            // they install onto the VOLUME via the wrapper (NOT image-resident — see
            // remoteModels._isImageResident / the doc note there), so they are part of
            // "keep files". An earlier carve-out (`dep.type !== 'custom_nodes'`) wrongly
            // deleted the per-model node even on keep, dropping the model to PARTIALLY
            // INSTALLED for a 144KB folder while all 36GB of weights stayed. Keep them.
            if (!deleteFiles) {
                keptModelFiles.push({ depId: dep.id, depName: dep.name || dep.id });
                continue;
            }
            try {
                const out = await remoteModels.remoteUninstallDep(dep);
                if (out && out.status === 'unsupported') {
                    anyUnsupported = true;
                } else if (out && out.status === 'not_found') {
                    // MPI-469: the remote twin of the local branch's MPI-276 gate — only
                    // report a dep in removed[] when a delete ACTUALLY ran. The wrapper
                    // already answers 'not_found' when the path was never on the volume;
                    // the old else-branch swallowed that and reported a delete that never
                    // happened (nvidia-pid logged 8 removed against 1 real file, measured
                    // on a Pod 2026-08-07). Same bucket and same reason string as the
                    // local loop below, so the two engines stay readable as twins.
                    keptModelFiles.push({ depId: dep.id, depName: dep.name || dep.id, reason: 'already-absent' });
                    logger.info('download', `remote uninstall: ${dep.id} already absent on the volume — nothing removed`);
                } else {
                    removed.push({ depId: dep.id, depName: dep.name || dep.id });
                }
            } catch (err) {
                logger.error('download', `remote uninstall failed for ${dep.id}: ${err.message}`);
                anyUnsupported = true;
            }
        }

        // MPI-469 — this condition got STRICTER when 'not_found' stopped inflating
        // removed[]: an old-image Pod holding none of the model's files now reaches it
        // where it used to fall through with a fake removed[]. That is the right answer —
        // nothing was deleted, and the image genuinely cannot delete — so the install
        // record survives instead of the UI claiming an uninstall the Pod never did.
        if (anyUnsupported && removed.length === 0) {
            logger.warn('download', `remote uninstall ${modelId}: wrapper has no delete endpoint (needs engine update)`);
            return res.json({
                success: false,
                remoteUnsupported: 'uninstall',
                message: 'Remote uninstall needs an engine update — model files remain on the Pod volume.',
                keptUniversal, keptShared,
            });
        }

        // MPI-464 — remote twin of the local sweep below. This uninstall may have been
        // the last thing keeping some OTHER volume dep alive; nothing else re-asks, and
        // the volume outlives the Pod. Gated on deleteFiles for the same reason ("keep
        // files" keeps every file, not only the selected ones) and never fatal — the
        // uninstall already succeeded before the sweep runs.
        let sweptOrphans = [];
        if (deleteFiles) {
            try {
                sweptOrphans = await _sweepOrphanedDepsRemote();
            } catch (err) {
                logger.error('download', `remote orphan sweep after ${modelId} uninstall failed: ${err.message}`);
            }
        }

        logger.info('download', `remote uninstall ${modelId}: removed ${removed.length}, kept ${keptUniversal.length} universal, ${keptShared.length} shared, ${keptModelFiles.length} model files, swept ${sweptOrphans.length} orphaned (deleteFiles=${deleteFiles})`);
        _modelJobs.delete(modelId);
        // MPI-396: the line above clears the legacy runtime map — NOT the SOT store,
        // which keeps serving the model's terminal `done` job to the status endpoint
        // and every snapshot. Drop it BEFORE the uninstalled broadcast so the FE never
        // re-renders against a job for a model it has just been told is gone.
        if (store.dropModel(modelId)) store.broadcastSnapshot();
        _broadcast('download:uninstalled', { modelId, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls: [], sweptOrphans, remote: true });
        return res.json({ success: true, removed, keptUniversal, keptShared, keptModelFiles, sweptOrphans, remote: true, partialUnsupported: anyUnsupported });
    }

    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const managedModelsRoot = customRoot || defaultModelsRoot;
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    const removed = [];
    const keptShared = [];
    const keptModelFiles = [];
    const keptPipInstalls = [];
    const keptUniversal = [];

    const _universalDepIds = new Set(getUniversalWorkflowDepIds());

    // Shared-dep guard (MPI-216): resolve — from the ACTUAL local disk, not the dead
    // backend `MODELS[].installed` flag — which deps are still complete on disk for
    // another model, and protect them. Computed ONCE (a single _localModelsCheck over
    // every other model's universe) then queried per dep. If the check throws we ABORT
    // rather than risk deleting a shared dep we could not verify — same fail-safe stance
    // as the remote path (uninstalling one LTX tier must not trash the Gemma/VAE/LoRAs
    // the other tier shares).
    let sharedKeep;
    try {
        sharedKeep = await _localSharedDepsMap(modelId);
    } catch (err) {
        logger.error('download', `local shared-dep check failed for ${modelId}: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: 'shared-dep-check-failed',
            message: 'Could not verify which files other models still need — uninstall aborted to avoid deleting shared files. Try again.',
        });
    }

    for (const dep of dependencies) {
        let localPath;
        if (dep.targetPath) {
            // MPI-222: in-node weight — engine-anchored regardless of customRoot.
            const { localPath: lp } = await resolveComfyPath(dep, customRoot, {});
            localPath = lp;
        } else if (dep.type === 'custom_nodes') {
            // MPI-276: the extracted node FOLDER, not the long-gone install zip.
            localPath = _customNodeUninstallPath(dep, defaultCustomNodesRoot);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
        }

        // Rule 1: always preserve universal workflow deps (every custom_node + engineAsset weights)
        if (_universalDepIds.has(dep.id)) {
            keptUniversal.push({ depId: dep.id, depName: dep.name || dep.id });
            continue;
        }

        if (sharedKeep.has(dep.id)) {
            keptShared.push({ depId: dep.id, depName: dep.name || dep.id, sharedWith: [...sharedKeep.get(dep.id)] });
            continue;
        }

        if (dep.type === 'custom_nodes' && dep.installRequirements === true) {
            keptPipInstalls.push({ depId: dep.id, depName: dep.name || dep.id });
            continue;
        }

        if (dep.type !== 'custom_nodes' && !_isInsidePath(managedModelsRoot, localPath)) {
            keptModelFiles.push({
                depId: dep.id,
                depName: dep.name || dep.id,
                reason: 'outside-managed-models-root',
            });
            logger.warn('download', `uninstall: refused to trash outside managed models root: ${localPath}`);
            continue;
        }

        if (dep.type === 'custom_nodes' && !_isInsidePath(defaultCustomNodesRoot, localPath)) {
            keptModelFiles.push({
                depId: dep.id,
                depName: dep.name || dep.id,
                reason: 'outside-custom-nodes-root',
            });
            logger.warn('download', `uninstall: refused to trash outside custom nodes root: ${localPath}`);
            continue;
        }

        const isInModelsFolder = dep.type !== 'custom_nodes' && _isInsidePath(managedModelsRoot, localPath);
        if (!deleteFiles && isInModelsFolder) {
            keptModelFiles.push({ depId: dep.id, depName: dep.name || dep.id });
            continue;
        }

        try {
            // MPI-276: only report a dep in removed[] when a delete ACTUALLY ran.
            // The custom-node zip-path bug meant the old loop hit a non-existent
            // path, deleted nothing, yet still pushed to removed[] and logged a lie.
            // A missing path now lands in keptModelFiles(reason:'already-absent').
            const existed = await fs.pathExists(localPath);
            if (existed) {
                // Try Recycle Bin first (undo-safety). But model weights are large
                // (6-25GB) and Windows refuses to recycle a file bigger than the
                // drive's Recycle Bin quota — windows-trash.exe exits 255 and the
                // file survives. Since uninstall exists to FREE disk space, parking a
                // 25GB weight in the bin wouldn't free it anyway: fall back to a
                // permanent delete so uninstall never silently no-ops. (MPI-258)
                try {
                    await _trash(localPath);
                    logger.info('download', `uninstall: moved to trash ${localPath}`);
                } catch (trashErr) {
                    await fs.remove(localPath);
                    logger.warn('download', `uninstall: trash failed (${trashErr.message}) — permanently deleted ${localPath}`);
                }
                await cleanEmptyDirs(localPath, dep.type === 'custom_nodes' ? defaultCustomNodesRoot : managedModelsRoot);
            }
            await clearDownloadMarker(localPath).catch(() => {});
            if (existed) {
                removed.push({ depId: dep.id, depName: dep.name || dep.id });
            } else {
                keptModelFiles.push({ depId: dep.id, depName: dep.name || dep.id, reason: 'already-absent' });
                logger.info('download', `uninstall: ${dep.id} already absent at ${localPath} — nothing removed`);
            }
            // The shared-dep guard upstream already excluded deps another installed
            // model needs, so a dep that reaches this delete loop is unshared — drop
            // its job. A re-install re-creates it. (refCount gate DELETED MPI-276.)
            _depJobs.delete(dep.id);
        } catch (err) {
            logger.error('download', `uninstall: failed to trash ${localPath}`, err);
        }
    }

    // MPI-462 — this uninstall may have been the last thing keeping some OTHER dep
    // alive (the sibling that defended it is now gone). Nothing else re-checks, so
    // collect here. Gated on deleteFiles: "keep files" must keep every file, not just
    // the ones the user explicitly uninstalled. Never fatal — the uninstall itself
    // already succeeded, and a failed sweep must not report it as failed.
    let sweptOrphans = [];
    if (deleteFiles) {
        try {
            sweptOrphans = await _sweepOrphanedDeps(managedModelsRoot, defaultModelsRoot, customRoot);
        } catch (err) {
            logger.error('download', `orphan sweep after ${modelId} uninstall failed: ${err.message}`);
        }
    }

    logger.info('download', `uninstall ${modelId}: removed ${removed.length}, kept ${keptUniversal.length} universal, ${keptShared.length} shared, ${keptModelFiles.length} model files, ${keptPipInstalls.length} pip-installs, swept ${sweptOrphans.length} orphaned`);
    _modelJobs.delete(modelId);
    // MPI-396: same store settle as the remote leg above. The reconcileOnce() below
    // is NOT a substitute — its pruneTerminal cannot express "confirmed uninstalled"
    // (the model is never in `confirmedInstalled`), so without this the job survives
    // to the 120s belt, which post-uninstall never runs because the reconciler poll
    // self-idles when no job is active.
    if (store.dropModel(modelId)) store.broadcastSnapshot();
    _broadcast('download:uninstalled', { modelId, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls, sweptOrphans });
    // G11: reconcile against post-delete disk truth (settles/prunes anything the
    // removal touched) and refresh the snapshot. Non-fatal — the uninstall itself
    // already succeeded.
    reconciler.reconcileOnce().catch((err) => logger.warn('download', `post-uninstall reconcile failed: ${err.message}`));
    res.json({ success: true, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls, sweptOrphans });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

function cancelAllDownloads() {
    // MPI-317: shutdown is an ACCIDENT for the download, not user intent — stop the
    // streams but KEEP partials + markers so the next app start resumes via Range.
    // stopKeep(), never cancel() (which deletes).
    for (const [, downloader] of _activeDownloaders) {
        downloader.stopKeep().catch(() => {});
    }
    _activeDownloaders.clear();
    for (const [, job] of _modelJobs) {
        job.deps.forEach(d => { _setDepStatus(d, 'cancelled', 'cancel all'); });
        _setModelStatus(job, 'cancelled', 'cancel all');
    }
    _modelJobs.clear();
    _depJobs.clear();
    store.clear();
    reconciler.stop();
    _broadcast('download:cancelled', { all: true });
}

// ── Universal Workflow Deps Installer ─────────────────────────────────────────

/**
 * Installs universal workflow dependencies: downloads missing deps and optionally runs
 * custom node install steps (pip, custom commands) for any custom_nodes.
 *
 * Called after engine install completes (new install or upgrade).
 * Also called by POST /engine/repair-deps for the "repairing" flow.
 *
 * @param {string[]} depIds - DEPS ids to install (from checkUniversalWorkflowDepsStatus)
 * @param {boolean} broadcastProgress - whether to emit engine:uw-installing SSE events
 * @param {boolean} skipCustomNodeInstall - if true, download only; don't run custom node pip install
 */
async function startUniversalWorkflowInstall(depIds, broadcastProgress = true, skipCustomNodeInstall = false) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    logger.info('download', `startUniversalWorkflowInstall: customRoot=${customRoot}, ${depIds.length} deps to check`);

    if (broadcastProgress) {
        broadcastEngineEvent('engine:uw-installing', { status: 'Installing dependencies...' });
    }

    const modelJob = {
        modelId: '__universal_workflow__',
        status: 'downloading',
        deps: [],
        totalBytes: 0,
        downloadedBytes: 0,
        speed: '',
        progress: 0,
    };

    for (const depId of depIds) {
        const dep = DEPS[depId];
        if (!dep) {
            logger.warn('download', `startUniversalWorkflowInstall: unknown dep "${depId}"`);
            continue;
        }

        modelJob.totalBytes += _parseSizeToBytes(dep.size);

        let localPath;
        let installedCheckPath; // path to check for "already installed" (folder for custom_nodes, file otherwise)
        if (dep.targetPath) {
            // MPI-222: an in-node weight (e.g. RIFE) resolves engine-anchored via the
            // resolver's targetPath branch — always, regardless of customRoot.
            const { localPath: lp } = await resolveComfyPath(dep, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else if (dep.type === 'custom_nodes') {
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
            // After successful extraction the zip is deleted and only the folder remains.
            // Check the folder, not the zip, so repair-deps skips already-extracted nodes.
            installedCheckPath = path.join(defaultCustomNodesRoot, dep.filename);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
            installedCheckPath = localPath;
        }

        // MPI-387 F1: type-aware — see the sibling call in startModelDownload.
        const isInstalled = await isDepInstalledOnDisk(dep, installedCheckPath);
        logger.info('download', `startUniversalWorkflowInstall: dep ${depId} resolved to ${localPath}, installedCheck=${installedCheckPath}, exists=${isInstalled}`);

        let depJob = _depJobs.get(depId);
        if (!depJob) {
            depJob = _createDepJob(dep);
            _depJobs.set(depId, depJob);
        }
        depJob.localPath = localPath;

        if (!modelJob.deps.find(d => d.id === depId)) {
            modelJob.deps.push(depJob);
        }

        // Mark already-installed deps as complete without downloading
        if (isInstalled) {
            _setDepStatus(depJob, 'complete', 'uw already-installed');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
            logger.info('download', `startUniversalWorkflowInstall: skipping already installed: ${depId} -> ${installedCheckPath}`);
        } else if (depJob.status !== 'queued' && depJob.status !== 'downloading') {
            // Reset any terminal state (complete, failed, cancelled) back to queued
            // so _startPendingDeps will re-download. Covers: zip missing after failed
            // extraction (was complete), and previously failed downloads on retry.
            const prevStatus = depJob.status;
            _setDepStatus(depJob, 'queued', 'uw requeue');
            // MPI-427 — credit the resumable partial; see the sibling in
            // startModelDownload for why zeroing made the bar run backwards.
            depJob.downloadedBytes = await getPartialBytes(localPath);
            depJob.error = null;
            logger.info('download', `startUniversalWorkflowInstall: resetting ${depId} (was ${prevStatus}) for re-download`);
        }
    }

    _modelJobs.set(modelJob.modelId, modelJob);
    _registerModelInStore(modelJob, 'local');
    // UW job is born 'downloading' (literal above); mirror that onto the fresh
    // store record, which registers every model as 'queued'.
    _setModelStatus(modelJob, 'downloading', 'uw install start');

    // Log download URLs before starting so we know which URL fails
    for (const depJob of modelJob.deps) {
        if (depJob.status !== 'complete') {
            logger.info('download', `startUniversalWorkflowInstall: will download ${depJob.id} from ${depJob.url}`);
        }
    }

    _startPendingDeps();

    // Wait for all UW deps to reach a terminal state (with 30-minute timeout to prevent infinite hangs).
    //
    // MPI-427: this RESOLVES WITH the failure instead of rejecting, and the throw moved
    // below the custom-node install. The two halves of this set live on different hosts —
    // every custom_node is a github.com zip, every engineAsset weight is on the model
    // host — so a user whose network blocks ONE of those hosts still downloads the other
    // half perfectly. Rejecting here discarded those good nodes unextracted, and since
    // the drift check reads "no folder" as missing, boot re-ran the same repair and threw
    // them away again on every launch. Reported by a user whose ISP intercepts the model
    // host: 44/44 model-host downloads dead, 45/45 github.com downloads fine, and an
    // engine that could never get a single node installed. Install what landed; report
    // what did not.
    const depFailure = await new Promise((resolve) => {
        const startTime = Date.now();
        const maxWaitMs = 30 * 60 * 1000; // 30 minutes max for slower connections
        const checkInterval = setInterval(() => {
            const allDone = modelJob.deps.every(d => ['complete', 'failed', 'cancelled'].includes(d.status));
            const anyFailed = modelJob.deps.some(d => d.status === 'failed');
            const elapsedMs = Date.now() - startTime;

            if (allDone) {
                clearInterval(checkInterval);
                if (!anyFailed) return resolve(null);
                const failed = modelJob.deps.filter(d => d.status === 'failed');
                const failedNames = failed.map(d => d.id).join(', ');
                // MPI-427 — this used to carry the dep IDs and NOTHING else, so a
                // network block surfaced as the useless "UW deps install failed:
                // rife47". Carry the first real reason (already the readable
                // network-blocked text when _describeTransportError matched).
                const reason = failed.find(d => d.error)?.error;
                const err = new Error(reason
                    ? `UW deps install failed: ${failedNames} — ${reason}`
                    : `UW deps install failed: ${failedNames}`);
                err.networkBlocked = failed.some(d => d.networkBlocked);
                resolve(err);
            } else if (elapsedMs > maxWaitMs) {
                clearInterval(checkInterval);
                const stillPending = modelJob.deps.filter(d => !['complete', 'failed', 'cancelled'].includes(d.status)).map(d => d.id).join(', ');
                logger.error('download', `UW deps install timeout after 30 minutes. Still pending: ${stillPending}`);
                resolve(new Error(`UW deps install timeout — still waiting for: ${stillPending}`));
            }
        }, 500);
    });

    // Run custom node install steps if not skipped
    if (!skipCustomNodeInstall) {
        const customNodeDeps = modelJob.deps.filter(d =>
            d.status === 'complete' && d.type === 'custom_nodes' && d.localPath != null
        );

        if (customNodeDeps.length > 0) {
            if (broadcastProgress) {
                broadcastEngineEvent('engine:uw-installing', { status: 'Installing custom node requirements...' });
            }
            // Re-use the modelJob-shaped structure that _runCustomNodeInstall expects
            await _runCustomNodeInstall({
                modelId: modelJob.modelId,
                deps: customNodeDeps,
            });
        }

        if (broadcastProgress && !depFailure) {
            broadcastEngineEvent('engine:uw-installing', { status: 'Universal workflow dependencies ready' });
        }
    } else {
        logger.info('download', 'Skipping custom node install; will be called after engine extraction');
        if (broadcastProgress) {
            broadcastEngineEvent('engine:uw-installing', { status: 'Dependencies downloaded, waiting for engine...' });
        }
    }

    // MPI-427: report the failure only now, with every node that DID download already
    // installed above. The job rides on the error because the two engine-provision
    // callers pass skipCustomNodeInstall=true and finish the nodes themselves — without
    // it they catch, leave uwModelJob null, and skip finishCustomNodeInstall entirely,
    // which is the same lost-nodes bug one layer up.
    if (depFailure) {
        depFailure.modelJob = modelJob;
        throw depFailure;
    }

    return modelJob;
}

/**
 * Finishes custom node installation after engine is ready.
 * Call this after calling startUniversalWorkflowInstall with skipCustomNodeInstall=true.
 *
 * @param {Object} modelJob - the modelJob returned by startUniversalWorkflowInstall
 * @param {boolean} broadcastProgress - whether to emit SSE events
 */
async function finishCustomNodeInstall(modelJob, broadcastProgress = true) {
    const customNodeDeps = modelJob.deps.filter(d =>
        d.status === 'complete' && d.type === 'custom_nodes' && d.localPath != null
    );

    if (customNodeDeps.length > 0) {
        if (broadcastProgress) {
            broadcastEngineEvent('engine:uw-installing', { status: 'Installing custom node requirements...' });
        }
        await _runCustomNodeInstall({
            modelId: modelJob.modelId,
            deps: customNodeDeps,
        });
    }

    if (broadcastProgress) {
        broadcastEngineEvent('engine:uw-installing', { status: 'Universal workflow dependencies ready' });
    }
}

// Named export for engine to broadcast on shared SSE
function broadcastEngineEvent(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch { _sseClients.delete(res); }
    }
}

// ── Engine Download Pause/Resume ───────────────────────────────────────────────

let _activeEngineDownloader = null;
let _activeEngineDownloadId = null;

function registerEngineDownload(downloader, downloadId) {
    _activeEngineDownloader = downloader;
    _activeEngineDownloadId = downloadId;
}

function clearEngineDownload() {
    _activeEngineDownloader = null;
    _activeEngineDownloadId = null;
}

// /engine/pause + /engine/resume removed (MPI-258 Bug 2): resume corrupted large
// files (NDH 200-vs-206 append) and had no frontend caller. Engine download is
// cancel-only via the existing cancel path.

module.exports = {
    router,
    cancelAllDownloads,
    broadcastEngineEvent,
    FileDownloader,
    registerEngineDownload,
    clearEngineDownload,
    runCustomNodeInstall: _runCustomNodeInstall,
    startUniversalWorkflowInstall,
    finishCustomNodeInstall,
    _byteRatioExcludingNodes, // MPI-231 — exported for unit test
    _customNodeUninstallPath, // MPI-276 — exported for unit test
    _filterDepsForEngine, // MPI-276 — exported for unit test
    _describeNodeInstallFailures, // MPI-387 — exported for unit test
    _describeTransportError, // MPI-427 — exported for unit test
    _mirrorUrlsFor, // MPI-427 — exported for unit test
    _isSameObjectUrl, // MPI-427 — exported for unit test
    _shouldResumePartial, // MPI-429 — exported for unit test
    _pluginRequiredDepIds, // MPI-310 — exported for unit test
    _localSharedDepsMap, // MPI-310 — exported for unit test (model-side protection)
    _remoteSharedDepIds, // MPI-464 — exported for unit test (remote twin of the above)
    _orphanedDepIds, // MPI-462 — exported for unit test (orphan sweep)
    _sweepOrphanedDeps, // MPI-462 — exported for unit test (orphan sweep)
    _sweepOrphanedDepsRemote, // MPI-464 — exported for unit test (orphan sweep, remote twin)
    _startRemoteDownload, // MPI-481 — exported for unit test (stale attach guard)
    _remoteDepIds, // MPI-481 — exported for unit test only; never mutate outside tests
    _failOutstandingRemoteDeps, // MPI-539 — exported for unit test (abandon-loudly path)
    _teardownRemoteEventStreamIfIdle, // MPI-481 — exported so a unit test can disarm the stall watchdog
    _setModelStatus, // MPI-317 F5 — exported for unit test (store-terminal guard)
    _installStore: store, // MPI-317 F5 — exported for unit test only; never mutate outside tests
};
