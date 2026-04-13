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
import { reSyncInstalledModels } from '../data/modelRegistry.js';

const downloadService = {
    _eventSource: null,

    async start(modelId, dependencies) {
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
            Events.emit('ui:error', { title: 'Download Start Failed', message: err.error });
            return;
        }

        this._ensureSSE();
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

    async uninstall(modelId, dependencies) {
        const res = await fetch('/comfy/models/uninstall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, dependencies }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Uninstall failed' }));
            Events.emit('ui:error', { title: 'Uninstall Failed', message: err.error });
            return;
        }
        state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== modelId);
        if (!state.downloadJobs.length) state.downloadQueueActive = false;
        Events.emit('download:uninstalled', { modelId });
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

        this._eventSource.addEventListener('download:progress', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.downloadedBytes = data.downloadedBytes;
                job.totalBytes = data.totalBytes;
                job.speed = data.speed;
                job.progress = data.progress;
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
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.status = 'complete';
                job.progress = 1;
                state.downloadJobs = [...state.downloadJobs];
            }
            state.downloadQueueActive = state.downloadJobs.some(j => j.status === 'downloading');

            if (data.modelId) {
                const modelJob = state.downloadJobs.find(j => j.modelId === data.modelId);
                const modelName = modelJob?.modelId || data.modelId;
                const toastWrap = ce('div');
                document.body.appendChild(toastWrap);
                const toastInstance = MpiToast.mount(toastWrap, {
                    message: `${modelName} downloaded successfully`,
                    variant: 'success',
                    duration: 4000,
                });
                toastInstance.on('close', () => toastWrap.remove());
            }

            reSyncInstalledModels().catch(err => console.error('[downloadService] re-sync failed:', err));
            Events.emit('download:complete', data);
        });

        this._eventSource.addEventListener('download:failed', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) {
                job.status = 'failed';
                job.error = data.error;
                state.downloadJobs = [...state.downloadJobs];
                
                const modelName = job.modelId || data.modelId;
                Events.emit('ui:error', {
                    title: 'Download Failed',
                    message: `Failed to download ${modelName}: ${data.error}`
                });
            } else {
                Events.emit('ui:error', {
                    title: 'Download Failed',
                    message: data.error
                });
            }
            Events.emit('download:failed', data);
        });

        this._eventSource.addEventListener('download:cancelled', (e) => {
            const data = JSON.parse(e.data);
            state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== data.modelId);
            if (!state.downloadJobs.length) state.downloadQueueActive = false;
            Events.emit('download:cancelled', data);
        });

        this._eventSource.addEventListener('download:uninstalled', (e) => {
            const data = JSON.parse(e.data);
            state.downloadJobs = state.downloadJobs.filter(j => j.modelId !== data.modelId);
            if (!state.downloadJobs.length) state.downloadQueueActive = false;
            Events.emit('download:uninstalled', data);
        });

        this._eventSource.addEventListener('download:paused', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) { job.status = 'paused'; state.downloadJobs = [...state.downloadJobs]; }
            Events.emit('download:paused', data);
        });

        this._eventSource.addEventListener('download:resumed', (e) => {
            const data = JSON.parse(e.data);
            const job = state.downloadJobs.find(j => j.modelId === data.modelId);
            if (job) { job.status = 'downloading'; state.downloadJobs = [...state.downloadJobs]; }
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

export { downloadService };
