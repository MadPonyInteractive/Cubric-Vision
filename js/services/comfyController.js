// ComfyUI integration: WebSocket connection, workflow execution,
// live preview, and cancel support.

import { state } from '../state.js';
import { showError } from '../shell.js';
import { clientLogger } from './clientLogger.js';

export const ComfyUIController = {
    serverAddress: "127.0.0.1:8188",
    clientId: crypto.randomUUID(),
    ws: null,
    isRunning: false,
    activeListener: null,

    async ensureServerRunning() {
        let modal = document.getElementById('engineStartupModal');
        try {
            const statusRes = await fetch('/comfy/status');
            const status = await statusRes.json();
            if (status.running && status.ready) return true;

            if (modal) modal.classList.remove('hide');

            if (!status.running) {
                console.log('[ComfyUIController] Requesting server start...');
                await fetch('/comfy/start', { method: 'POST' });
            }

            // Wait for it to be ready
            for (let i = 0; i < 60; i++) {
                const checkRes = await fetch('/comfy/status');
                const check = await checkRes.json();
                if (check.ready) {
                    if (modal) modal.classList.add('hide');
                    return true;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            if (modal) modal.classList.add('hide');
            throw new Error('ComfyUI server failed to become ready in time.');
        } catch (e) {
            if (modal) modal.classList.add('hide');
            clientLogger.error('comfy', 'ComfyUI failed to start', e);
            showError('ComfyUI failed to start', e.message);
            throw e;
        }
    },

    init() {
        // Handle aspect ratio sync for preview container
        const aspectRadios = document.querySelectorAll('input[name="comfyAspect"]');
        aspectRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updatePreviewSize());
        });
        this.updatePreviewSize();
    },

    updatePreviewSize() {
        const aspect = document.querySelector('input[name="comfyAspect"]:checked')?.value || 'portrait';
        const container = document.querySelector('.comfy-preview-container');
        if (container) {
            container.style.aspectRatio = aspect === 'portrait' ? '896 / 1152' : '1152 / 896';
            container.style.width = '100%';
            container.style.height = 'auto';
        }
    },


    generateRandomSeed() {
        const seed = Math.floor(Math.random() * 100000000000000);
        return seed;
    },

    setLoading(loading) {
        this.isRunning = loading;
    },

    async interrupt() {
        try {
            await fetch(`http://${this.serverAddress}/interrupt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: this.clientId })
            });
            this.setLoading(false);
        } catch (e) {
            clientLogger.error('comfy', 'Interrupt failed', e);
            this.setLoading(false);
        }
    },

    connect(onMessage) {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            if (onMessage) this.activeListener = onMessage;
            // Always re-bind onmessage to the standard handler when re-using an open WS.
            // This ensures that any custom onmessage a caller may have installed is
            // replaced, keeping the activeListener dispatch contract intact.
            this.ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    const blob = new Blob([event.data.slice(8)], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    this.activeListener({ type: 'preview', url });
                } else {
                    const msg = JSON.parse(event.data);
                    if (this.activeListener) this.activeListener(msg);
                }
            };
            this.ws.binaryType = 'arraybuffer';
            return;
        }

        if (onMessage) this.activeListener = onMessage;
        const currentListener = this.activeListener;

        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            this.ws.close();
        }

        this.ws = new WebSocket(`ws://${this.serverAddress}/ws?clientId=${this.clientId}`);
        this.ws.binaryType = "arraybuffer";
        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const blob = new Blob([event.data.slice(8)], { type: 'image/jpeg' });
                const url = URL.createObjectURL(blob);
                this.activeListener({ type: 'preview', url });
            } else {
                const msg = JSON.parse(event.data);
                if (this.activeListener) this.activeListener(msg);

                // Fallback built-in behavior
                if (!this.activeListener) {
                    this.setLoading(false);
                    const nodeOutput = msg.data.output;
                    if (nodeOutput && nodeOutput.images && nodeOutput.images.length > 0) {
                        const img = nodeOutput.images[0];
                    }
                }
            }
        };

        this.ws.onerror = (e) => {
            // Transient WS errors are expected before the server is fully ready.
            // Do NOT reset isRunning — the generation may still be queued and running.
            clientLogger.warn('comfy', 'WebSocket error (may be transient)');
            if (onMessage) onMessage({ type: 'error', error: e });
        };

        this.ws.onclose = () => {
            // Reconnect once if closed unexpectedly
            if (this.activeListener && this.isRunning) {
                setTimeout(() => this.connect(this.activeListener), 1000);
            }
        };
    },

    connectWebSocket() {
        this.connect(); // Redirect to the more capable connect()
    },

    async queuePrompt(workflow) {
        await this.ensureServerRunning();
        this.connectWebSocket();

        const req = await fetch(`http://${this.serverAddress}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: workflow, client_id: this.clientId })
        });

        if (!req.ok) {
            const errData = await req.json();
            throw new Error(errData.error?.message || "ComfyUI Error");
        }

        return await req.json();
    },

    async runTestWorkflow() {
        let textPrompt = this.getCombinedPrompt();

        if (!textPrompt) { alert("Please type a Base Idea prompt first!"); return; }

        this.setLoading(true);

        try {
            await this.ensureServerRunning();
        } catch (e) {
            alert("Could not start ComfyUI engine: " + e.message);
            this.setLoading(false);
            return;
        }

        this.connectWebSocket();

        try {
            const res = await fetch('/comfy_workflows/sdxl_t2i_nsfw.json');
            if (!res.ok) throw new Error("Failed to load workflow");
            const workflow = await res.json();

            // Title-Based Node Injection Mapping
            const findNodeId = (title) => Object.keys(workflow).find(key => workflow[key]._meta?.title === title);

            const aspect = document.querySelector('input[name="comfyAspect"]:checked')?.value || 'portrait';
            const w = aspect === 'portrait' ? 896 : 1152;
            const h = aspect === 'portrait' ? 1152 : 896;

            const widthNodeId = findNodeId("Width");
            if (widthNodeId) workflow[widthNodeId].inputs.value = w;

            const heightNodeId = findNodeId("Height");
            if (heightNodeId) workflow[heightNodeId].inputs.value = h;

            const posNodeId = findNodeId("Positive");
            if (posNodeId) workflow[posNodeId].inputs.value = textPrompt;

            const seedNodeId = findNodeId("Seed");
            if (seedNodeId) {
                workflow[seedNodeId].inputs.value = seed;
            } else {
                Object.values(workflow).forEach(node => {
                    if (node.class_type && node.class_type.includes('KSampler') && node.inputs) {
                        if ('noise_seed' in node.inputs) node.inputs.noise_seed = seed;
                        if ('seed' in node.inputs) node.inputs.seed = seed;
                    }
                });
            }

            const req = await fetch(`http://${this.serverAddress}/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: workflow, client_id: this.clientId })
            });
            if (!req.ok) throw new Error("ComfyUI Error");
        } catch (e) {
            console.error(e);
            alert("API Dispatch Error: " + e.message);
            this.setLoading(false);
        }
    },

    _extractSeedFromWorkflow(workflow) {
        // Helper to find seed for logging
        for (const node of Object.values(workflow)) {
            if (node._meta?.title?.toLowerCase() === 'seed') {
                return node.inputs?.value || node.inputs?.int || node.inputs?.seed || node.inputs?.noise_seed || 'unknown';
            }
        }
        return 'not_found';
    },

    async _uploadImage(dataUrlOrPath, filename) {
        let blob;
        try {
            const res = await fetch(dataUrlOrPath);
            blob = await res.blob();
        } catch (e) {
            console.error(`[ComfyUIController] Failed to prepare blob for ${filename}:`, e);
            throw e;
        }

        const formData = new FormData();
        formData.append('image', blob, filename);
        formData.append('overwrite', 'true');

        const uploadRes = await fetch(`http://${this.serverAddress}/upload/image`, {
            method: 'POST',
            body: formData
        });
        return await uploadRes.json();
    },

    /**
     * Generic runner for a workflow ID or JSON.
     * Handles parameter injection and asset uploads.
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

        // 2. Handle Asset Uploads (Images/Masks)
        const assetMap = {
            "Image": "mpi_input_image.png",
            "Input_Image": "mpi_input_image.png",
            "Mask": "mpi_input_mask.png",
            "Input_Mask": "mpi_input_mask.png"
        };

        for (const [paramKey, staticName] of Object.entries(assetMap)) {
            let val = params[paramKey];
            if (!val) continue;

            // Normalize path to URL if it's a local project path
            if (typeof val === 'string' && !val.startsWith('data:') && !val.startsWith('blob:') && !val.startsWith('http') && !val.includes('project-file')) {
                // Ensure forward slashes and wrap in project-file API
                const cleanPath = val.replace(/\\/g, '/');
                val = `/project-file?path=${encodeURIComponent(cleanPath)}`;
            }

            if (typeof val === 'string' && (val.startsWith('data:') || val.startsWith('blob:') || val.startsWith('http') || val.includes('project-file') || val.includes('/project-media/'))) {
                console.log(`[ComfyUIController] Uploading asset for ${paramKey}:`, val.substring(0, 100));
                try {
                    const uploadRes = await this._uploadImage(val, staticName);
                    if (uploadRes && uploadRes.name) {
                        params[paramKey] = uploadRes.name;
                        console.log(`[ComfyUIController] Upload successful: ${uploadRes.name}`);
                    }
                } catch (e) {
                    console.error(`[ComfyUIController] Asset upload failed for ${paramKey}:`, e);
                }
            }
        }

        // 3. Inject Parameters (Title-Based)
        const _inject = (nodeId, val) => {
            const node = workflow[nodeId];
            if (!node || !node.inputs) return;
            const targets = ['value', 'text', 'int', 'float', 'boolean', 'string', 'ckpt_name', 'model_name', 'unet_name', 'image', 'mask', 'picks', 'lora_name', 'strength_model', 'strength_clip', 'denoise', 'seed', 'noise_seed'];
            for (const t of targets) {
                if (t in node.inputs) {
                    if (typeof node.inputs[t] === 'number') node.inputs[t] = parseFloat(val);
                    else if (typeof node.inputs[t] === 'boolean') node.inputs[t] = (val === true || val === 'true');
                    else node.inputs[t] = val;
                }
            }
        };

        const mappingKeys = Object.keys(params);
        mappingKeys.forEach(key => {
            const val = params[key];
            const nodeIds = Object.keys(workflow).filter(id => {
                const title = workflow[id]._meta?.title || "";
                return title.toLowerCase() === key.toLowerCase();
            });
            nodeIds.forEach(id => {
                if (key.toLowerCase() === 'seed' || key.toLowerCase() === 'noise_seed') {
                    console.log(`[ComfyUIController] Injecting ${key}: ${val} into node ${id} (${workflow[id]._meta?.title || 'No Title'})`);
                }
                _inject(id, val);
            });
        });

        // 4. Execution Promise
        return new Promise(async (resolve, reject) => {
            const outputs = [];
            const internalListener = (msg) => {
                // Metadata injection MUST happen before forwarding to tool callback
                if (msg && msg.type === 'executed') {
                    const nodeId = msg.data.node;
                    const nodeTitle = workflow[nodeId]?._meta?.title || workflow[nodeId]?.class_type || "";
                    msg.data.node_title = nodeTitle;
                }

                // Support binary previews (latents) in runWorkflow
                if (msg instanceof ArrayBuffer || (msg && msg.type === 'preview')) {
                    if (onMessage) onMessage(msg);
                    return;
                }

                if (onMessage) onMessage(msg); // Forward JSON messages to caller

                if (msg.type === 'executed') {
                    const nodeOutput = msg.data.output;
                    if (nodeOutput && nodeOutput.images) {
                        nodeOutput.images.forEach(img => {
                            outputs.push(`http://${this.serverAddress}/view?filename=${img.filename}&type=${img.type}&subfolder=${img.subfolder || ''}`);
                        });
                    }
                }

                if (msg.type === 'executing' && msg.data.node === null) {
                    this.isRunning = false;
                    resolve({ success: true, images: outputs });
                }
            };

            this.connect(internalListener);
            this.isRunning = true;

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
                this.isRunning = false;
                reject(err);
            }
        });
    }
};
