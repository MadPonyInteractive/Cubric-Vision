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

    async start(modelId, dependencies) {
        // Ensure SSE is connected BEFORE the POST to avoid missing backend broadcasts
        // (download:started, download:progress) that fire before the SSE open event.
        this._ensureSSE();

        const job = _createJob(modelId, dependencies);
        state.downloadJobs = [...state.downloadJobs.filter(j => j.modelId !== modelId), job];
        state.downloadQueueActive = true;

        Events.emit('download:started', { modelId, job });

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
            } else {
                Events.emit('ui:error', { title: 'Download Start Failed', message: err.error });
            }
            return;
        }
    },

    async pause(modelId) {
        const res = await fetch('/comfy/models/download/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to pause download' }));
            Events.emit('ui:error', { title: 'Pause Failed', message: err.error });
        }
    },

    async resume(modelId) {
        const res = await fetch('/comfy/models/download/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to resume download' }));
            Events.emit('ui:error', { title: 'Resume Failed', message: err.error });
        }
    },

    async cancel(modelId) {
        await fetch('/comfy/models/download/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId }),
        });
        state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== modelId);
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
                        state.downloadJobs = jobs;
                        state.downloadQueueActive = jobs.some(j => j.status === 'downloading' || j.status === 'installing');
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
            if (!isUW) {
                const model = getModelById(data.modelId);
                const modelName = model?.name || data.modelId;
                const toastWrap = ce('div');
                document.body.appendChild(toastWrap);
                const toastInstance = MpiToast.mount(toastWrap, {
                    message: `${modelName} installed.`,
                    variant: 'success',
                    duration: 4000,
                });
                toastInstance.on('close', () => toastWrap.remove());
            }

            // Reseed ComfyUI's model filename cache so newly downloaded weights are
            // immediately visible without a restart (MPI-121). Pure file-add into an
            // existing registered root — /object_info is sufficient. Fire-and-forget;
            // if ComfyUI is not running the route no-ops silently.
            if (!isUW) {
                fetch('/comfy/refresh-models', { method: 'POST' }).catch(() => {});
            }

            // Capture installed IDs before re-sync to detect cascade installs
            const preSync = new Set(MODELS.filter(m => m.installed).map(m => m.id));
            reSyncInstalledModels().then(() => {
                if (isUW) return;
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
            state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== data.modelId);
            if (!state.downloadJobs.length) state.downloadQueueActive = false;
            Events.emit('download:cancelled', data);
        });

        this._eventSource.addEventListener('download:uninstalled', (e) => {
            const data = JSON.parse(e.data);
            const { modelId } = data;
            state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== modelId);
            if (!state.downloadJobs.length) state.downloadQueueActive = false;
            reSyncInstalledModels().catch(err => clientLogger.error('downloadService', 're-sync after uninstall failed:', err));
        });

        this._eventSource.addEventListener('download:paused', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.status = 'paused';
                if (typeof data.downloadedBytes === 'number') job.downloadedBytes = data.downloadedBytes;
                if (typeof data.totalBytes === 'number') job.totalBytes = data.totalBytes;
                if (typeof data.progress === 'number') job.progress = data.progress;
                if (typeof data.speed === 'string') job.speed = data.speed;
                state.downloadJobs = [...state.downloadJobs];
            }
            Events.emit('download:paused', data);
        });

        this._eventSource.addEventListener('download:resumed', (e) => {
            const data = JSON.parse(e.data);
            _speedSamples.delete(data.modelId);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.status = 'downloading';
                if (typeof data.downloadedBytes === 'number') job.downloadedBytes = data.downloadedBytes;
                if (typeof data.totalBytes === 'number') job.totalBytes = data.totalBytes;
                if (typeof data.progress === 'number') job.progress = data.progress;
                if (typeof data.speed === 'string') job.speed = data.speed;
                state.downloadJobs = [...state.downloadJobs];
            }
            Events.emit('download:resumed', data);
        });

        this._eventSource.addEventListener('download:installing', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) { job.status = 'installing'; state.downloadJobs = [...state.downloadJobs]; }
            Events.emit('download:installing', data);
        });

        this._eventSource.addEventListener('comfy:needs-restart', (e) => {
            const data = JSON.parse(e.data);
            state.comfyNeedsRestart = true;
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
