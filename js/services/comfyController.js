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

export const ComfyUIController = {

    /** @type {string} Target ComfyUI WS/HTTP server address. */
    serverAddress: "127.0.0.1:8188",

    /** @type {string} Unique client ID for this session; used in WS handshake and prompt payloads. */
    clientId: crypto.randomUUID(),

    /** @type {WebSocket|null} */
    _ws: null,

    /** @type {boolean} True while a workflow is actively executing. */
    _isRunning: false,

    /** @type {((msg: object) => void)|null} Current WebSocket message listener. */
    _activeListener: null,

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
            if (status.running && status.ready) return true;

            // ── Auto-restart if custom nodes were installed (and ComfyUI was running) ─
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
    connect(onMessage) {
        if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
            if (onMessage) this._activeListener = onMessage;
            this._ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    const blob = new Blob([event.data.slice(8)], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    this._activeListener({ type: 'preview', url });
                } else {
                    const msg = JSON.parse(event.data);
                    if (this._activeListener) this._activeListener(msg);
                }
            };
            this._ws.binaryType = 'arraybuffer';
            return;
        }

        if (onMessage) this._activeListener = onMessage;

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
                this._activeListener({ type: 'preview', url });
            } else {
                const msg = JSON.parse(event.data);
                if (this._activeListener) this._activeListener(msg);
            }
        };

        this._ws.onerror = (e) => {
            clientLogger.warn('comfy', 'WebSocket error (may be transient)');
            if (onMessage) onMessage({ type: 'error', error: e });
        };

        this._ws.onclose = () => {
            if (this._activeListener && this._isRunning) {
                setTimeout(() => this.connect(this._activeListener), 1000);
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
                _inject(id, val);
            }
        }

        // 4. Execution
        return new Promise(async (resolve, reject) => {
            const outputs = [];
            const internalListener = (msg) => {
                if (msg instanceof ArrayBuffer || (msg && msg.type === 'preview')) {
                    if (onMessage) onMessage(msg);
                    return;
                }

                if (onMessage) onMessage(msg);

                if (msg.type === 'executed') {
                    const nodeOutput = msg.data.output;
                    if (nodeOutput?.images) {
                        for (const img of nodeOutput.images) {
                            outputs.push(
                                `http://${this.serverAddress}/view?filename=${img.filename}&type=${img.type}&subfolder=${img.subfolder || ''}`
                            );
                        }
                    }
                }

                if (msg.type === 'executing' && msg.data.node === null) {
                    this._isRunning = false;
                    resolve({ success: true, images: outputs });
                }
            };

            this.connect(internalListener);
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
            } catch (err) {
                this._isRunning = false;
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
