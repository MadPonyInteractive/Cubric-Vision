/**
 * js/services/downloadService.js — Frontend download queue singleton.
 *
 * Manages the global download queue, syncs with the backend SSE stream,
 * and emits Events for UI consumption.
 */

import { Events } from '../events.js';
import { state } from '../state.js';
import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { ce } from '../utils/dom.js';
import { reSyncInstalledModels, getModelById, MODELS } from '../data/modelRegistry.js';
import { clientLogger } from './clientLogger.js';

// MPI-100 — recognise an out-of-disk-space failure from the wrapper/OS error
// text so it can be surfaced as a friendly toast, not the GitHub error dialog.
// Covers the RunPod network-volume quota ([Errno 122] Disk quota exceeded) and a
// plain full disk ([Errno 28] No space left on device), plus their worded forms.
function _isOutOfSpaceError(error) {
    const s = String(error || '').toLowerCase();
    return s.includes('errno 122')
        || s.includes('disk quota exceeded')
        || s.includes('errno 28')
        || s.includes('no space left on device');
}

const downloadService = {
    _eventSource: null,

    // MPI-258 Bug B — modelIds cancelled in the last few seconds. The SSE 'open'
    // reconnect re-fetches /status and re-injects any client job the backend list
    // lacks (orphanedActive, MPI-241). A just-cancelled job the backend already
    // deleted has no backend counterpart, so it was resurrected on the next SSE
    // tick — the phantom "downloading" bar kept climbing and Cancel appeared dead
    // (re-presses 404 'Job not found'). This set suppresses resurrection of a
    // freshly-cancelled model for a short window.
    _recentlyCancelled: new Map(),

    // MPI-184 — serial install queue. The app used to POST every install
    // immediately, so clicking Install on 3 models fired 3 concurrent
    // /download/start requests. On a small CPU download-Pod that spawns N
    // independent aria2c installs (48+ sockets) which starves the wrapper: it
    // stops answering the SSE stream (UI freezes, 'bad-response' → 'silent-stall')
    // and a concurrent write into CUSTOM_NODES_DIR zeroes the node-detect set-diff
    // (false 'archive produced no folder' dialog). Serializing the install POSTs
    // app-side means the wrapper only ever runs ONE install at a time — no
    // cross-install starvation, no set-diff race — with no wrapper rebuild.
    // Only install (start) is queued; pause/resume/cancel/uninstall stay direct.
    _installChain: Promise.resolve(),
    // How many installs are ahead in the chain (running + waiting). When 0, a new
    // install runs immediately, so it must NOT flash 'queued' — it goes straight to
    // 'downloading'. Only a 2nd+ concurrent install actually waits and shows QUEUED.
    _inFlight: 0,

    start(modelId, dependencies) {
        // Ensure SSE is connected BEFORE the POST to avoid missing backend broadcasts
        // (download:started, download:progress) that fire before the SSE open event.
        this._ensureSSE();

        // Create the job + emit download:started IMMEDIATELY (not behind the chain) so
        // clicking Install on a 2nd/3rd model shows a card right away instead of a dead
        // button. Only start 'queued' when something is actually ahead in the chain;
        // an install that will run immediately goes straight to 'downloading' so a lone
        // install never flashes QUEUED. _firePost flips a queued job to 'downloading'
        // when its turn comes. Only the network POST is serialized. Cancelling a
        // still-queued job (no POST fired yet) drops its job so its turn is skipped.
        const willQueue = this._inFlight > 0;
        this._inFlight += 1;
        const job = _createJob(modelId, dependencies);
        job.status = willQueue ? 'queued' : 'downloading';
        state.downloadJobs = [...state.downloadJobs.filter(j => j.modelId !== modelId), job];
        state.downloadQueueActive = true;
        Events.emit('download:started', { modelId, job });

        // Chain the POST behind the previous install and release the next as soon as
        // THIS one finishes DOWNLOADING (all bytes on disk, now verifying/extracting).
        // Awaiting the POST alone wouldn't serialize (it returns the moment the job is
        // enqueued backend-side); waiting for the full terminal event would idle the
        // download pipe through each verify+extract. Releasing at the download-done
        // point overlaps the next model's download with the current's verify/extract —
        // still only ONE aria2 download stream at a time, so no CPU-pod starvation.
        const run = () => this._firePost(modelId, dependencies)
            // _firePost returns false when the job was cancelled while queued (POST
            // skipped) — don't wait on a model the backend never learned about, or the
            // chain wedges until the safety timeout.
            .then((fired) => fired ? this._awaitDownloadDone(modelId) : undefined);
        const settle = () => { this._inFlight -= 1; };
        // Never let one install's rejection break the chain for the next; always
        // decrement in-flight so the count returns to 0 when the chain drains.
        this._installChain = this._installChain.then(run, run).then(settle, settle);
        return this._installChain;
    },

    // Resolve when the given model's BYTES are all on disk — it enters verify/extract
    // (download:installing, or a remote 'verifying'-phase progress tick) — or reaches a
    // terminal state (fast installs skip a distinct verify phase). A safety timeout
    // guarantees a dropped signal can never wedge the queue.
    _awaitDownloadDone(modelId) {
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                offInstalling(); offProgress(); offComplete(); offFailed(); offCancelled();
                clearTimeout(timer);
                resolve();
            };
            const match = (d) => !d || d.modelId === modelId;
            // Download-done signals — network idle, verify/extract now runs:
            const offInstalling = Events.on('download:installing', (d) => match(d) && finish());
            const offProgress = Events.on('download:progress', (d) =>
                match(d) && d && d.phase === 'verifying' && finish());
            // Terminal signals — fast install with no separate verify phase, or end:
            const offComplete = Events.on('download:complete', (d) => match(d) && finish());
            const offFailed = Events.on('download:failed', (d) => match(d) && finish());
            const offCancelled = Events.on('download:cancelled', (d) => match(d) && finish());
            // 30 min ceiling — longer than any single model download; a lost signal
            // releases the queue instead of stalling it.
            const timer = setTimeout(finish, 30 * 60 * 1000);
        });
    },

    async _firePost(modelId, dependencies) {
        // The job was already created + broadcast in start(). If the user cancelled
        // it while it sat in the queue, its job is gone — skip the POST so we don't
        // resurrect a cancelled install (and let the chain move on immediately).
        const job = state.downloadJobs.find(j => j.modelId === modelId);
        if (!job) return false;

        // This job's turn — leave 'queued', become 'downloading' so the card swaps
        // the Queued badge for the live progress bar + Pause/Cancel.
        job.status = 'downloading';
        state.downloadJobs = state.downloadJobs.map(j => j.modelId === modelId ? job : j);

        const res = await fetch('/comfy/models/download/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, dependencies }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to start download' }));
            job.status = 'failed';
            job.error = err.error;
            state.downloadJobs = state.downloadJobs.map(j => j.modelId === modelId ? job : j);
            Events.emit('download:failed', { modelId, error: err.error });
            // MPI-120: offline is an expected, actionable state → warning toast,
            // not the GitHub-report error dialog.
            if (err.offline) {
                Events.emit('ui:warning', { message: "You're offline — connect to the internet to download models." });
            } else if (_isOutOfSpaceError(err.error)) {
                // Disk-full PRE-FLIGHT reject (local statfs gate OR remote volume
                // free-space gate) — expected + user-actionable, so the friendly
                // toast, never the Report-on-GitHub dialog. Matches the reactive
                // download:failed handler. [[feedback_error_dialog_vs_toast]]
                const model = getModelById(modelId);
                const modelName = model?.name || modelId;
                Events.emit('ui:warning', {
                    message: `Not enough disk space to install ${modelName}. Free up space and try again.`,
                });
            } else {
                Events.emit('ui:error', { title: 'Download Start Failed', message: err.error });
            }
            return false; // already emitted download:failed — no terminal wait needed
        }
        return true; // POST accepted — serialize the next install behind this one
    },

    // pause()/resume() removed (MPI-258 Bug 2): NDH resume corrupted large files.
    // Downloads are cancel-only; an interrupted install restarts clean.

    async cancel(modelId) {
        // MPI-184: a still-queued job (serial install queue, POST not fired) is unknown
        // to the backend, so its /cancel is a no-op and no download:cancelled SSE comes
        // back — the card would never revert from QUEUED to Install. Emit the event
        // locally in that case so the UI updates. (The listener is idempotent; a live
        // download still gets its cancel via the backend SSE round-trip below.)
        // MPI-258 Bug B — no live client job for this model = nothing to cancel. A
        // second Cancel press (or a click on an already-settled card) otherwise POSTed
        // /cancel for a job the backend already deleted → 404 spam in the console and a
        // pointless round-trip. Clear + emit locally (idempotent) and return without a
        // fetch. The FIRST real cancel below still hits the backend.
        const activeJob = state.downloadJobs.find(j => j.modelId === modelId);
        if (!activeJob) {
            this._recentlyCancelled.set(modelId, Date.now());
            setTimeout(() => this._recentlyCancelled.delete(modelId), 8000);
            state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== modelId);
            Events.emit('download:cancelled', { modelId });
            if (!state.downloadJobs.length) state.downloadQueueActive = false;
            return;
        }
        // MPI-258 Bug B — block orphanedActive from resurrecting this job on the
        // next SSE 'open' tick (which races /status ahead of the backend deleting
        // the job). Set the guard BEFORE the fetch so a fast reconnect is covered.
        this._recentlyCancelled.set(modelId, Date.now());
        setTimeout(() => this._recentlyCancelled.delete(modelId), 8000);

        // A still-queued job (serial install queue, POST not fired) is unknown to the
        // backend; its /cancel is a harmless idempotent no-op (backend returns 200).
        await fetch('/comfy/models/download/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId }),
        }).catch(() => {});
        // Clear the job + fire the local event UNCONDITIONALLY. Previously this only
        // ran for the queued/404 cases and otherwise relied on the backend's
        // download:cancelled SSE — but if that tick dropped (or lost the race to an
        // orphanedActive re-inject), the phantom job survived and Cancel looked dead.
        // The listener is idempotent, so a live 200 that ALSO sends the SSE is fine.
        state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== modelId);
        Events.emit('download:cancelled', { modelId });
        if (!state.downloadJobs.length) state.downloadQueueActive = false;
    },

    async uninstall(modelId, dependencies, deleteFiles = true) {
        const res = await fetch('/comfy/models/uninstall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, dependencies, deleteFiles }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Uninstall failed' }));
            Events.emit('ui:error', { title: 'Uninstall Failed', message: err.error });
            return;
        }
        const json = await res.json();
        // Remote mode: backend returns success:false + remoteUnsupported when it
        // could NOT complete the uninstall (Pod still warming up so the shared-dep
        // set is unverifiable, or an older image lacks the delete endpoint). The
        // model is still on the volume — do NOT emit download:uninstalled (it would
        // falsely flip the UI to uninstalled). Surface it as a TOAST, never an
        // error+Report-on-GitHub dialog: neither case is a bug the user should
        // report (a warm-up window is transient + self-heals; a missing endpoint is
        // an environment state). A scary dialog here produced junk GitHub issues.
        if (json.success === false && json.remoteUnsupported === 'uninstall') {
            Events.emit('ui:warning', {
                message: json.message
                    || 'Remote uninstall unavailable right now — model files remain on the Pod volume. Try again in a moment.',
            });
            return;
        }
        const { removed = [], keptUniversal = [], keptShared = [], keptModelFiles = [], keptPipInstalls = [] } = json;
        Events.emit('download:uninstalled', { modelId, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls });
        state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== modelId);
        if (!state.downloadJobs.length) state.downloadQueueActive = false;
    },

    _ensureSSE() {
        if (this._eventSource) return;
        this._connectSSE();
    },

    _connectSSE() {
        if (this._eventSource) this._eventSource.close();
        this._eventSource = new EventSource('/comfy/downloads/stream');

        this._eventSource.addEventListener('open', async () => {
            // Re-sync state from backend on reconnect to recover from dropped events
            try {
                const res = await fetch('/comfy/downloads/status');
                if (res.ok) {
                    const { jobs } = await res.json();
                    if (jobs && jobs.length) {
                        // Recalculate progress from dep data in case stored value is stale (bug fix)
                        for (const job of jobs) {
                            if (job.deps && job.totalBytes > 0) {
                                const depBytes = job.deps.reduce((s, d) => s + (d.downloadedBytes || 0), 0);
                                if (depBytes > job.downloadedBytes) {
                                    job.downloadedBytes = depBytes;
                                    job.progress = depBytes / job.totalBytes;
                                }
                            }
                        }
                        // MPI-241: PRESERVE a live client-side job the backend list does
                        // not yet include. start() calls _ensureSSE() and creates the job
                        // in the SAME tick; the SSE 'open' status-fetch that follows can
                        // race ahead of the backend registering that install, returning a
                        // list of only OLD (complete) jobs. Blindly overwriting wiped the
                        // just-created 'downloading' job → the detail footer reverted from
                        // Cancel to Install (worst on the first install after a reload,
                        // before SSE was ever open). Keep any active client job the
                        // backend hasn't caught up to; the backend copy wins for shared ids.
                        const backendIds = new Set(jobs.map(j => j.modelId));
                        const ACTIVE = ['downloading', 'queued', 'paused', 'installing'];
                        // MPI-258 Bug B — never resurrect a just-cancelled job. The
                        // backend deleted it; without this guard the /status race
                        // re-injected the phantom and Cancel looked dead.
                        const orphanedActive = state.downloadJobs.filter(
                            j => !backendIds.has(j.modelId)
                                && ACTIVE.includes(j.status)
                                && !this._recentlyCancelled.has(j.modelId));
                        state.downloadJobs = [...jobs, ...orphanedActive];
                        state.downloadQueueActive = state.downloadJobs.some(
                            j => j.status === 'downloading' || j.status === 'installing');
                    }
                }
            } catch (e) { /* non-critical */ }
        });

        this._eventSource.addEventListener('error', () => {
            this._eventSource.close();
            this._eventSource = null;
            setTimeout(() => this._connectSSE(), 3000);
        });

        // Backend broadcasts download:started with correct progress from pre-installed deps.
        // Without this listener, the job stays at progress: 0 until download:progress fires.
        this._eventSource.addEventListener('download:started', (e) => {
            const data = JSON.parse(e.data);
            _speedSamples.delete(data.modelId);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.status = data.status;
                job.progress = data.progress;
                // MPI-95: carry the indeterminate (Preparing…) flag onto the job so
                // the card re-render in MpiModelManager picks it up.
                job.indeterminate = !!data.indeterminate;
                state.downloadJobs = [...state.downloadJobs];
            }
            Events.emit('download:started', data);
        });

        this._eventSource.addEventListener('download:progress', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            // MPI-94 L4 — remote (wrapper aria2c) progress arrives without a speed
            // string; only local downloads carry one. When it's missing, derive
            // MB/s client-side from the byte delta between successive ticks so the
            // remote download UI shows a rate like local does. Same format as the
            // backend `_formatSpeed`. No-op for local (data.speed already set).
            if (!data.speed && typeof data.downloadedBytes === 'number') {
                data.speed = _deriveSpeed(data.modelId, data.downloadedBytes);
            }
            if (job) {
                job.downloadedBytes = data.downloadedBytes;
                job.totalBytes = data.totalBytes;
                job.speed = data.speed;
                job.progress = data.progress;
                // MPI-95: a progress tick with a real total clears Preparing… state;
                // a verifying tick sets indeterminate back on with phase='verifying'.
                if (typeof data.indeterminate === 'boolean') job.indeterminate = data.indeterminate;
                if (typeof data.phase === 'string') job.phase = data.phase;
                // Throttle state writes to 1 per 5 sec; Events carries real-time progress to components
                const now = Date.now();
                if (!job._lastStateWrite || now - job._lastStateWrite >= 5000) {
                    state.downloadJobs = [...state.downloadJobs];
                    job._lastStateWrite = now;
                }
            }
            Events.emit('download:progress', data);
        });

        this._eventSource.addEventListener('download:complete', (e) => {
            const data = JSON.parse(e.data);
            _speedSamples.delete(data.modelId); // MPI-94 L4 — drop the speed sample
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.status = 'complete';
                job.progress = 1;
                state.downloadJobs = [...state.downloadJobs];
            }
            state.downloadQueueActive = state.downloadJobs.some(j => j.status === 'downloading');

            // UW installs are surfaced through engine UI — skip toast
            const isUW = !data.modelId || data.modelId === '__universal_workflow__';
            // Primary "installed." toast is fired by notificationService on the
            // re-emitted download:complete below (focus-aware: OS notif when
            // unfocused, toast when focused). No inline toast here — it double-fired.

            // Reseed ComfyUI's model filename cache so newly downloaded weights are
            // immediately visible without a restart (MPI-121). Pure file-add into an
            // existing registered root — /object_info is sufficient. Fire-and-forget;
            // if ComfyUI is not running the route no-ops silently.
            if (!isUW) {
                fetch('/comfy/refresh-models', { method: 'POST' }).catch(() => {});
            }

            // The backend broadcasts download:complete PER-DEP with { depId, modelId:null }
            // as each file lands, then ONCE MORE model-level with a real modelId when the
            // model's whole dep set is done (_checkModelJobsComplete). Only the model-level
            // event needs the expensive registry re-sync (+ cascade-toast) — running it per
            // dep re-synced the whole registry N times mid-install, and each sync fired
            // models:checked → the Model Library rebuilt every card (visible flashing) and
            // briefly derived a not-yet-installed / not-active state → the Install button
            // flickered back. Per-dep completes carry no modelId, so gate the sync on it and
            // emit only the model-level event downstream. (fixes the install-flash storm)
            if (!isUW) {
                // Capture installed IDs before re-sync to detect cascade installs
                const preSync = new Set(MODELS.filter(m => m.installed).map(m => m.id));
                reSyncInstalledModels().then(() => {
                    // Toast any model that became installed as a side-effect (shared deps)
                    // Skip the primary modelId — already toasted above
                    for (const m of MODELS) {
                        if (m.installed && !preSync.has(m.id) && m.id !== data.modelId) {
                            const wrap = ce('div');
                            document.body.appendChild(wrap);
                            const t = MpiToast.mount(wrap, {
                                message: `${m.name} installed.`,
                                variant: 'success',
                                duration: 4000,
                            });
                            t.on('close', () => wrap.remove());
                        }
                    }
                }).catch(err => clientLogger.error('downloadService', 're-sync after complete failed:', err));
                Events.emit('download:complete', data);
            }
        });

        this._eventSource.addEventListener('download:failed', (e) => {
            const data = JSON.parse(e.data);
            _speedSamples.delete(data.modelId); // MPI-94 L4 — drop the speed sample
            // UW dep failures are surfaced through engine:error / install modal — skip toast here
            if (data.modelId === '__universal_workflow__') {
                Events.emit('download:failed', data);
                return;
            }
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.status = 'failed';
                job.error = data.error;
                state.downloadJobs = [...state.downloadJobs];

                const model = getModelById(data.modelId);
                const modelName = model?.name || data.modelId;
                // MPI-100 — out-of-space is an EXPECTED, user-actionable condition,
                // not a bug. Route it to a friendly disk-full TOAST (ui:warning)
                // instead of the Download-Failed + Report-on-GitHub dialog (ui:error),
                // so the user isn't nudged to file a noise issue. The remote volume
                // quota can't be pre-flighted truthfully (statvfs is blind to the
                // RunPod network-volume quota; REST exposes only the configured size),
                // so this reactive catch is the disk-full UX. See
                // [[feedback_error_dialog_vs_toast]].
                if (_isOutOfSpaceError(data.error)) {
                    Events.emit('ui:warning', {
                        message: `Not enough disk space to install ${modelName}. Free up space and try again.`
                    });
                } else {
                    Events.emit('ui:error', {
                        title: 'Download Failed',
                        message: `Failed to download ${modelName}: ${data.error}`
                    });
                }
            } else if (data.modelId) {
                if (_isOutOfSpaceError(data.error)) {
                    Events.emit('ui:warning', {
                        message: 'Not enough disk space to install this model. Free up space and try again.'
                    });
                } else {
                    Events.emit('ui:error', {
                        title: 'Download Failed',
                        message: data.error
                    });
                }
            }
            // A failed install leaves any deps that DID land still on disk (e.g. the
            // small upscaler + custom-node zips before the big weight hit the disk-full
            // wall). The card derives its state from the job: a lingering 'failed' job
            // pins downloadState off 'idle', so _computePartial never runs and the card
            // shows "Not Installed" — hiding the on-disk deps. Drop the failed job so
            // downloadState falls back to 'idle', then re-sync installed state from disk
            // so the card recomputes "Partially Installed". Mirrors the complete path's
            // re-sync. (MPI-140)
            if (data.modelId && data.modelId !== '__universal_workflow__') {
                state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== data.modelId);
                if (!state.downloadJobs.length) state.downloadQueueActive = false;
                reSyncInstalledModels().catch(err =>
                    clientLogger.error('downloadService', 're-sync after failed install:', err));
            }
            // MPI-97 — a DEP-LEVEL failure (no modelId, e.g. a single dep's
            // wrapper trigger) is NOT a user-facing model failure on its own: the
            // dep's owning model(s) raise their OWN model-level download:failed via
            // _checkModelJobsComplete, which carries the model context and the real
            // user-facing reason. Surfacing the raw dep error here too produced a
            // second scary "Download Failed" + Report-on-GitHub dialog for benign
            // transients (the shared-dep collision was the worst case — now
            // prevented backend-side by the attach). So: only dialog when we have a
            // modelId; dep-only failures stay silent and let the model event own
            // the surfacing. (MPI-81 #6 / MPI-94 G1 benign-transient-as-error family.)
            Events.emit('download:failed', data);
        });

        this._eventSource.addEventListener('download:cancelled', (e) => {
            const data = JSON.parse(e.data);
            _speedSamples.delete(data.modelId); // MPI-94 L4 — drop the speed sample
            // {all:true} (server-side cancelAllDownloads, e.g. the disk-full ENOSPC
            // recovery) carries no modelId — clear every job so no bar stays frozen.
            // Otherwise filter(modelId !== undefined) would keep all jobs. (MPI-140)
            if (data.all) {
                state.downloadJobs = [];
            } else {
                state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== data.modelId);
            }
            if (!state.downloadJobs.length) state.downloadQueueActive = false;
            // After a disk-full cancel, on-disk deps remain — re-sync so cards show
            // "Partially Installed" rather than a stale "downloading" state.
            if (data.all) {
                reSyncInstalledModels().catch(err =>
                    clientLogger.error('downloadService', 're-sync after cancel-all:', err));
            }
            Events.emit('download:cancelled', data);
        });

        this._eventSource.addEventListener('download:uninstalled', (e) => {
            const data = JSON.parse(e.data);
            const { modelId } = data;
            state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== modelId);
            if (!state.downloadJobs.length) state.downloadQueueActive = false;
            reSyncInstalledModels().catch(err => clientLogger.error('downloadService', 're-sync after uninstall failed:', err));
        });

        // download:paused / download:resumed listeners removed (MPI-258 Bug 2) —
        // the backend no longer emits them; downloads are cancel-only.

        this._eventSource.addEventListener('download:installing', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) { job.status = 'installing'; state.downloadJobs = [...state.downloadJobs]; }
            Events.emit('download:installing', data);
        });

        this._eventSource.addEventListener('comfy:needs-restart', (e) => {
            const data = JSON.parse(e.data);
            // Route by engine: a REMOTE (Pod) install (`remote: true`,
            // downloadManager.js) needs the POD's ComfyUI rescanned, a LOCAL install
            // needs the local one. They were sharing one global flag, so a remote
            // install during a remote session wrongly stop+restarted a healthy LOCAL
            // ComfyUI on the next local-pinned gen. Keep them separate — each
            // engine's ready-path consumes its own flag.
            if (data?.remote === true) state.remoteComfyNeedsRestart = true;
            else state.comfyNeedsRestart = true;
            Events.emit('comfy:needs-restart', data);
        });

        // Engine install/upgrade events — bridge from SSE to Events bus
        ['engine:downloading', 'engine:extracting', 'engine:patching',
         'engine:upgrade-status', 'engine:uw-installing', 'engine:complete',
         'engine:error'].forEach(eventName => {
            this._eventSource.addEventListener(eventName, (e) => {
                const data = e.data ? JSON.parse(e.data) : {};
                Events.emit(eventName, data);
            });
        });
    },

    destroy() {
        this._eventSource?.close();
    },
};

function _createJob(modelId, dependencies) {
    return {
        id: modelId,
        modelId,
        status: 'downloading',
        totalBytes: dependencies.reduce((sum, d) => sum + _parseSizeToBytes(d.size), 0),
        downloadedBytes: 0,
        speed: '',
        progress: 0,
        deps: dependencies.map(d => ({
            id: d.id,
            downloadedBytes: 0,
            totalBytes: _parseSizeToBytes(d.size),
            status: 'queued',
        })),
        error: null,
    };
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

// MPI-94 L4 — client-side download-speed derivation for remote (wrapper aria2c)
// progress, which arrives without a speed string. Keyed by modelId; holds the
// previous {bytes, t} sample and the last formatted rate so an uneven/zero-delta
// tick reuses the last shown value instead of flickering to 0.
const _speedSamples = new Map();

function _deriveSpeed(modelId, downloadedBytes) {
    if (modelId == null) return '';
    const now = Date.now();
    const prev = _speedSamples.get(modelId);
    if (!prev) {
        _speedSamples.set(modelId, { bytes: downloadedBytes, t: now, rate: 0, label: '' });
        return '';
    }
    const dBytes = downloadedBytes - prev.bytes;
    const dt = (now - prev.t) / 1000;
    // Publish at most once per second and keep the last label between updates.
    if (dt < 1 || dBytes <= 0) return prev.label;
    const instantRate = dBytes / dt;
    const rate = prev.rate > 0 ? (prev.rate * 0.65) + (instantRate * 0.35) : instantRate;
    const label = _formatSpeed(rate);
    _speedSamples.set(modelId, { bytes: downloadedBytes, t: now, rate, label });
    return label;
}

function _formatSpeed(bytesPerSec) {
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${bytesPerSec.toFixed(0)} B/s`;
}

export { downloadService };
