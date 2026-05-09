/**
 * ComfyUIController — ComfyUI WebSocket and workflow execution service.
 *
 * Single public API: {@link runWorkflow}. All other members are internal.
 *
 * @see commandExecutor.js for the execution layer that calls this service.
 */

import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { Events } from '../events.js';

function _buildComfyViewUrl(serverAddress, fileInfo) {
    const params = new URLSearchParams();
    for (const key of ['filename', 'type', 'subfolder', 'format', 'frame_rate', 'workflow', 'fullpath']) {
        const value = fileInfo?.[key];
        if (value !== undefined && value !== null) params.set(key, value);
    }
    return `http://${serverAddress}/view?${params.toString()}`;
}

function _collectComfyOutputUrls(serverAddress, nodeOutput, target) {
    if (nodeOutput?.images) {
        for (const img of nodeOutput.images) target.push(_buildComfyViewUrl(serverAddress, img));
    }
    if (nodeOutput?.gifs) {
        for (const gif of nodeOutput.gifs) target.push(_buildComfyViewUrl(serverAddress, gif));
    }
}

export const ComfyUIController = {

    /** @type {string} Target ComfyUI WS/HTTP server address. */
    serverAddress: "127.0.0.1:8188",

    /** @type {string} Unique client ID for this session; used in WS handshake and prompt payloads. */
    clientId: crypto.randomUUID(),

    /** @type {WebSocket|null} */
    _ws: null,

    /** @type {boolean} True while a workflow is actively executing. */
    _isRunning: false,

    /** @type {Map<string, (msg: object) => void>} Active WS listeners keyed by ComfyUI prompt_id. */
    _promptListeners: new Map(),

    /** @type {Map<string, object[]>} Prompt-scoped messages that arrived before POST ack handling finished. */
    _pendingPromptMessages: new Map(),

    /** @type {string|null} Last prompt_id reported as actively executing. Used for binary previews. */
    _activePromptId: null,

    /**
     * Ensures the ComfyUI Python process is running and ready.
     * Emits `comfy:starting` → polls `/comfy/status` → emits `comfy:ready`.
     * On failure emits `comfy:error` and `ui:error`.
     * @returns {Promise<boolean>}
     */
    async ensureServerRunning() {
        try {
            const statusRes = await fetch('/comfy/status');
            const status = await statusRes.json();

            // ── Auto-restart if custom nodes were installed (even if ComfyUI is ready) ─
            if (state.comfyNeedsRestart && status.running) {
                clientLogger.info('comfy', 'Custom nodes installed — triggering auto-restart');
                Events.emit('ui:error', {
                    title: 'Restarting ComfyUI',
                    message: 'New custom nodes were installed. Restarting automatically...',
                });

                await fetch('/comfy/stop', { method: 'POST' });
                await new Promise(r => setTimeout(r, 2000));

                await fetch('/comfy/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isUserRestart: true }),
                });

                // Poll until ready
                let retries = 60;
                while (retries-- > 0) {
                    await new Promise(r => setTimeout(r, 1000));
                    try {
                        const check = await fetch('/comfy/status').then(r => r.json());
                        if (check.ready) {
                            state.comfyNeedsRestart = false;
                            Events.emit('comfy:ready');
                            return true;
                        }
                    } catch (e) { /* keep polling */ }
                }
                throw new Error('ComfyUI auto-restart failed to become ready.');
            }

            // If ComfyUI is not running and needs restart flag is set, just clear it
            // (ComfyUI will start fresh, no need for restart message)
            if (state.comfyNeedsRestart && !status.running) {
                state.comfyNeedsRestart = false;
            }

            // Already running and ready — skip startup indicator to avoid flash.
            if (status.running && status.ready) return true;

            Events.emit('comfy:starting');

            if (!status.running) {
                clientLogger.info('comfy', 'Requesting ComfyUI server start');
                await fetch('/comfy/start', { method: 'POST' });
            }

            for (let i = 0; i < 60; i++) {
                const checkRes = await fetch('/comfy/status');
                const check = await checkRes.json();
                if (check.ready) {
                    Events.emit('comfy:ready');
                    return true;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            throw new Error('ComfyUI server failed to become ready in time.');
        } catch (e) {
            Events.emit('comfy:error', { message: e.message });
            clientLogger.error('comfy', 'ComfyUI failed to start', e);
            Events.emit('ui:error', { title: 'ComfyUI failed to start', message: e.message });
            throw e;
        }
    },

    /**
     * Generates a random 15-digit seed value for KSampler nodes.
     * @returns {number}
     */
    generateRandomSeed() {
        return Math.floor(Math.random() * 100000000000000);
    },

    /**
     * Sends an interrupt signal to the ComfyUI WS server to abort the running pipeline.
     * @returns {Promise<void>}
     */
    async interrupt() {
        try {
            await fetch(`http://${this.serverAddress}/interrupt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: this.clientId })
            });
            this._isRunning = false;
        } catch (e) {
            clientLogger.error('comfy', 'Interrupt failed', e);
            this._isRunning = false;
        }
    },

    /**
     * Returns ComfyUI's native queue snapshot.
     * Shape: `{ queue_running: [...], queue_pending: [...] }` (raw Comfy response,
     * normalized to `{ running, pending }` for caller convenience).
     * @returns {Promise<{ running: any[], pending: any[] }>}
     */
    async getQueue() {
        try {
            const res = await fetch(`http://${this.serverAddress}/queue`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return {
                running: data.queue_running || [],
                pending: data.queue_pending || [],
            };
        } catch (e) {
            clientLogger.error('comfy', 'getQueue failed', e);
            return { running: [], pending: [] };
        }
    },

    /**
     * Clears all pending jobs from ComfyUI's native queue. Does not interrupt
     * the currently running job.
     * @returns {Promise<boolean>}
     */
    async clearQueue() {
        try {
            const res = await fetch(`http://${this.serverAddress}/queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clear: true }),
            });
            return res.ok;
        } catch (e) {
            clientLogger.error('comfy', 'clearQueue failed', e);
            return false;
        }
    },

    /**
     * Removes a specific queued (pending) job from ComfyUI's native queue.
     * Does not affect the currently running job — use `interrupt()` for that.
     * @param {string} promptId
     * @returns {Promise<boolean>}
     */
    async deleteQueueItem(promptId) {
        try {
            const res = await fetch(`http://${this.serverAddress}/queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete: [promptId] }),
            });
            return res.ok;
        } catch (e) {
            clientLogger.error('comfy', 'deleteQueueItem failed', e);
            return false;
        }
    },

    /**
     * Opens (or reuses) a WebSocket connection to the ComfyUI WS server.
     *
     * - Binary ArrayBuffer messages are decoded as JPEG preview blobs and
     *   forwarded to the listener as `{ type: 'preview', url: blobURL }`.
     * - JSON messages are forwarded as-is.
     * - If the socket closes unexpectedly while `_isRunning` is true, it
     *   auto-reconnects once after 1 second.
     *
     * @param {(msg: object) => void} [onMessage]  Message handler to register as the active listener.
     */
    _routeMessage(msg) {
        if (msg instanceof ArrayBuffer || (msg && msg.type === 'preview')) {
            const listener = this._activePromptId ? this._promptListeners.get(this._activePromptId) : null;
            listener?.(msg);
            return;
        }

        const promptId = msg?.data?.prompt_id || msg?.prompt_id || null;
        if (promptId) {
            if (msg.type === 'executing' && msg.data?.node !== null) {
                this._activePromptId = promptId;
            }
            const listener = this._promptListeners.get(promptId);
            if (listener) {
                listener(msg);
            } else {
                const pending = this._pendingPromptMessages.get(promptId) || [];
                pending.push(msg);
                this._pendingPromptMessages.set(promptId, pending);
            }
            return;
        }

        if (msg?.type === 'status') return;

        // Some ComfyUI events omit prompt_id but are only meaningful for the
        // currently executing prompt. Route them narrowly instead of broadcasting
        // completions/progress across queued jobs.
        const activeListener = this._activePromptId ? this._promptListeners.get(this._activePromptId) : null;
        activeListener?.(msg);
    },

    connect() {
        if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
            this._ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    const blob = new Blob([event.data.slice(8)], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    this._routeMessage({ type: 'preview', url });
                } else {
                    const msg = JSON.parse(event.data);
                    this._routeMessage(msg);
                }
            };
            this._ws.binaryType = 'arraybuffer';
            return;
        }

        if (this._ws) {
            this._ws.onopen = null;
            this._ws.onmessage = null;
            this._ws.onerror = null;
            this._ws.onclose = null;
            this._ws.close();
        }

        this._ws = new WebSocket(`ws://${this.serverAddress}/ws?clientId=${this.clientId}`);
        this._ws.binaryType = "arraybuffer";
        this._ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const blob = new Blob([event.data.slice(8)], { type: 'image/jpeg' });
                const url = URL.createObjectURL(blob);
                this._routeMessage({ type: 'preview', url });
            } else {
                const msg = JSON.parse(event.data);
                this._routeMessage(msg);
            }
        };

        this._ws.onerror = (e) => {
            clientLogger.warn('comfy', 'WebSocket error (may be transient)');
        };

        this._ws.onclose = () => {
            if (this._promptListeners.size && this._isRunning) {
                setTimeout(() => this.connect(), 1000);
            }
        };
    },

    /**
     * Generic workflow runner.
     *
     * Handles:
     * 1. **Loading** — resolves a workflow ID string from `state.allComfyWorkflows`
     *    or treats it as a `.json` filename and fetches it from `/comfy_workflows/`.
     * 2. **Asset uploads** — `Input_Image`, `Input_Mask`, `Image`, `Mask` params
     *    (data URIs, blob URLs, http URLs, or `/project-file` paths) are uploaded
     *    to ComfyUI using **static filenames** (`mpi_input_image.png`,
     *    `mpi_input_mask.png`) to enable execution caching.
     * 3. **Parameter injection** — params are matched to nodes by `_meta.title`
     *    (case-insensitive) and written to the first matching input field
     *    (`value`, `text`, `int`, `float`, `boolean`, `string`, `ckpt_name`,
     *    `model_name`, `unet_name`, `image`, `mask`, `picks`, `lora_name`,
     *    `strength_model`, `strength_clip`, `denoise`, `seed`, `noise_seed`).
     * 4. **Execution** — connects to the WS, queues the prompt via HTTP POST,
     *    resolves with `{ success: true, images: string[] }` when execution
     *    finishes (node === null on `executing` event), or rejects on error.
     *
     * Binary previews (`ArrayBuffer` / `preview` messages) are forwarded to
     * `onMessage` during execution so callers can display live latents.
     *
     * @param {string|object} workflowOrId  Workflow JSON object or a workflow ID string.
     * @param {object} [params={}]           Title-keyed injection params.
     * @param {((msg: object) => void)=} [onMessage]  Live WS message handler (preview, executed, executing, error).
     * @returns {Promise<{success: boolean, images: string[]}>}
     */
    async runWorkflow(workflowOrId, params = {}, onMessage = null) {
        await this.ensureServerRunning();

        let workflow = workflowOrId;

        // 1. Load workflow if it's an ID string
        if (typeof workflow === 'string') {
            const registry = state.allComfyWorkflows || [];
            const wfConfig = registry.find(w => w.id === workflow);
            const fallbackFile = workflow.includes('.json') ? workflow : `${workflow}.json`;
            const file = wfConfig?.file || fallbackFile;

            const res = await fetch(`/comfy_workflows/${file}`);
            if (!res.ok) throw new Error(`Failed to load workflow: ${file}`);
            workflow = await res.json();
        }

        // 2. Handle Asset Uploads (Images/Masks) — static filenames for ComfyUI caching
        const assetMap = {
            "Image":       "mpi_input_image.png",
            "Input_Image": "mpi_input_image.png",
            "Mask":        "mpi_input_mask.png",
            "Input_Mask":  "mpi_input_mask.png"
        };

        for (const [paramKey, staticName] of Object.entries(assetMap)) {
            let val = params[paramKey];
            if (!val) continue;

            // Normalize local project paths to /project-file URLs
            if (
                typeof val === 'string' &&
                !val.startsWith('data:') &&
                !val.startsWith('blob:') &&
                !val.startsWith('http') &&
                !val.includes('project-file')
            ) {
                const cleanPath = val.replace(/\\/g, '/');
                val = `/project-file?path=${encodeURIComponent(cleanPath)}`;
            }

            if (
                typeof val === 'string' &&
                (val.startsWith('data:') || val.startsWith('blob:') || val.startsWith('http') ||
                 val.includes('project-file') || val.includes('/project-media/'))
            ) {
                try {
                    const uploadRes = await this._uploadImage(val, staticName);
                    if (uploadRes && uploadRes.name) {
                        params[paramKey] = uploadRes.name;
                    }
                } catch (e) {
                    clientLogger.error('comfy', `Asset upload failed for ${paramKey}`, e);
                }
            }
        }

        // 3. Inject Parameters (Title-Based)
        const _inject = (nodeId, val) => {
            const node = workflow[nodeId];
            if (!node || !node.inputs) return;
            const targets = [
                'value', 'text', 'int', 'float', 'boolean', 'string',
                'ckpt_name', 'model_name', 'unet_name', 'image', 'mask', 'picks',
                'lora_name', 'strength_model', 'strength_clip',
                'denoise', 'seed', 'noise_seed'
            ];
            for (const t of targets) {
                if (t in node.inputs) {
                    if (typeof node.inputs[t] === 'number') node.inputs[t] = parseFloat(val);
                    else if (typeof node.inputs[t] === 'boolean') node.inputs[t] = (val === true || val === 'true');
                    else node.inputs[t] = val;
                }
            }
        };

        for (const [key, val] of Object.entries(params)) {
            const nodeIds = Object.keys(workflow).filter(id => {
                const title = workflow[id]._meta?.title || "";
                return title.toLowerCase() === key.toLowerCase();
            });
            for (const id of nodeIds) {
                // Special handling for LoRA objects (Lora_1 through Lora_6)
                if (/^Lora_\d+$/i.test(key) && typeof val === 'object' && val !== null &&
                    'lora_name' in val && 'strength_model' in val && 'strength_clip' in val) {
                    const node = workflow[id];
                    if (node && node.inputs) {
                        if ('lora_name' in node.inputs) node.inputs.lora_name = val.lora_name;
                        if ('strength_model' in node.inputs) node.inputs.strength_model = parseFloat(val.strength_model);
                        if ('strength_clip' in node.inputs) node.inputs.strength_clip = parseFloat(val.strength_clip);
                    }
                } else {
                    _inject(id, val);
                }
            }
        }

        // 4. Execution
        return new Promise(async (resolve, reject) => {
            const outputs = [];
            let promptId = null;
            const internalListener = (msg) => {
                if (msg instanceof ArrayBuffer || (msg && msg.type === 'preview')) {
                    if (onMessage) onMessage(msg);
                    return;
                }

                if (onMessage) onMessage(msg);

                if (msg.type === 'executed') {
                    const nodeOutput = msg.data.output;
                    _collectComfyOutputUrls(this.serverAddress, nodeOutput, outputs);
                }

                if (msg.type === 'executing' && msg.data.node === null) {
                    if (promptId) this._promptListeners.delete(promptId);
                    if (this._activePromptId === promptId) this._activePromptId = null;
                    this._isRunning = this._promptListeners.size > 0;
                    resolve({ success: true, images: outputs });
                }
            };

            this.connect();
            this._isRunning = true;

            try {
                const req = await fetch(`http://${this.serverAddress}/prompt`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: workflow, client_id: this.clientId })
                });

                if (!req.ok) {
                    const errData = await req.json();
                    throw new Error(errData.error?.message || "ComfyUI Error");
                }

                const ack = await req.json();
                promptId = ack?.prompt_id || null;
                if (!promptId) throw new Error('ComfyUI did not return a prompt_id');
                if (promptId) {
                    this._promptListeners.set(promptId, internalListener);
                    if (onMessage) onMessage({ type: 'prompt_ack', prompt_id: promptId });
                    const pending = this._pendingPromptMessages.get(promptId) || [];
                    this._pendingPromptMessages.delete(promptId);
                    for (const msg of pending) internalListener(msg);
                }
            } catch (err) {
                if (promptId) this._promptListeners.delete(promptId);
                this._isRunning = this._promptListeners.size > 0;
                reject(err);
            }
        });
    },

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Uploads an image or mask asset to the ComfyUI server.
     * @param {string} dataUrlOrPath
     * @param {string} filename
     * @returns {Promise<object>}
     * @private
     */
    async _uploadImage(dataUrlOrPath, filename) {
        let blob;
        try {
            const res = await fetch(dataUrlOrPath);
            blob = await res.blob();
        } catch (e) {
            throw new Error(`[ComfyUIController] Failed to prepare blob for ${filename}: ${e.message}`);
        }

        const formData = new FormData();
        formData.append('image', blob, filename);
        formData.append('overwrite', 'true');

        const uploadRes = await fetch(`http://${this.serverAddress}/upload/image`, {
            method: 'POST',
            body: formData
        });
        return await uploadRes.json();
    }
};
