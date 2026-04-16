import { ComponentFactory } from '../../factory.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { qs } from '../../../utils/dom.js';
import { Events } from '../../../events.js';

/**
 * MpiEngineInstall — Engine provisioning modal for first install and upgrades (Compound)
 *
 * Portals directly to document.body, bypassing the Overlays queue.
 * This is intentional: engine installation is a system-level event that must show
 * regardless of whatever else is happening in the app.
 *
 * Two-phase UI for first install:
 *   Phase 1 (setup):     Models path picker + Browse button + Install button
 *   Phase 2 (progress):  Progress bar + status text + speed/size info
 *
 * For upgrades:
 *   Skips Phase 1, goes straight to Phase 2 with "models are safe" messaging
 *
 * API:
 *   inst.el.show(mode)      — 'installing' | 'upgrading' — portals and shows appropriate phase
 *   inst.el.hide()          — removes portal, clears state
 *   inst.el.setProgress(data) — { progress: 0–100, speed, downloadedBytes, totalBytes }
 *   inst.el.setStatus(text) — update status message (e.g. 'Extracting...')
 *   inst.el.setError(msg)   — show error + retry button
 *
 * Emits (internal to component):
 *   'engine:ready' — when download/extract/patch complete (actually emitted to Events bus)
 *
 * SSE integration:
 *   Connects to existing /comfy/downloads/stream and filters for engine:* events
 */
export const MpiEngineInstall = ComponentFactory.create({
    name: 'MpiEngineInstall',
    css: ['js/components/Compounds/MpiEngineInstall/MpiEngineInstall.css'],
    template: (props) => `
        <div class="mpi-engine-install">
            <!-- Phase 1: Setup (path picker) -->
            <div class="mpi-engine-install__phase" data-phase="setup">
                <div class="mpi-engine-install__content">
                    <h2 class="mpi-engine-install__title">Welcome — Let's Set Up ComfyUI</h2>
                    <p class="mpi-engine-install__subtitle">Choose where to store your AI models</p>

                    <div class="mpi-engine-install__form">
                        <label class="mpi-engine-install__label">Models Folder</label>
                        <div class="mpi-engine-install__folder-input-row">
                            <input
                                type="text"
                                class="mpi-engine-install__path-input"
                                data-ref="pathInput"
                                placeholder="engine/mpi_models/"
                                value="engine/mpi_models/"
                            >
                            <button class="mpi-engine-install__browse-btn" data-ref="browseBtn" type="button">Browse</button>
                        </div>
                        <p class="mpi-engine-install__hint">You can change this path later in Settings</p>
                    </div>

                    <button class="mpi-engine-install__install-btn" data-ref="installBtn" type="button">Install</button>
                </div>
            </div>

            <!-- Phase 2: Progress (download/extract) -->
            <div class="mpi-engine-install__phase" data-phase="progress">
                <div class="mpi-engine-install__content">
                    <h2 class="mpi-engine-install__title" data-ref="progressTitle">Installing ComfyUI Engine</h2>
                    <p class="mpi-engine-install__subtitle mpi-engine-install__subtitle--secondary" data-ref="progressSubtitle">
                        Downloading engine files...
                    </p>

                    <div class="mpi-engine-install__progress-section">
                        <div data-ref="progressBar"></div>
                        <p class="mpi-engine-install__progress-info" data-ref="progressInfo">Preparing download...</p>
                    </div>

                    <p class="mpi-engine-install__message" data-ref="upgradeMessage" style="display: none;">
                        Your models are safe — only the ComfyUI engine is being updated.
                    </p>
                </div>
            </div>

            <!-- Error state -->
            <div class="mpi-engine-install__phase" data-phase="error">
                <div class="mpi-engine-install__content mpi-engine-install__content--error">
                    <h2 class="mpi-engine-install__title mpi-engine-install__title--error">Installation Failed</h2>
                    <p class="mpi-engine-install__error-message" data-ref="errorMessage">An error occurred during installation</p>
                    <button class="mpi-engine-install__retry-btn" data-ref="retryBtn" type="button">Retry</button>
                </div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        let _backdrop = null;
        let _wrapper = null;
        let _sseConnection = null;
        let _currentMode = null; // 'installing' or 'upgrading'
        let _progressBarInst = null;

        const pathInput = qs('[data-ref="pathInput"]', el);
        const browseBtn = qs('[data-ref="browseBtn"]', el);
        const installBtn = qs('[data-ref="installBtn"]', el);
        const progressBar = qs('[data-ref="progressBar"]', el);
        const progressInfo = qs('[data-ref="progressInfo"]', el);
        const progressTitle = qs('[data-ref="progressTitle"]', el);
        const progressSubtitle = qs('[data-ref="progressSubtitle"]', el);
        const upgradeMessage = qs('[data-ref="upgradeMessage"]', el);
        const errorMessage = qs('[data-ref="errorMessage"]', el);
        const retryBtn = qs('[data-ref="retryBtn"]', el);

        // ── Browse button handler ────────────────────────────────────────────────
        browseBtn.addEventListener('click', async () => {
            try {
                const result = await fetch('/choose-folder', { method: 'POST' });
                const { folderPath } = await result.json();
                if (folderPath) {
                    pathInput.value = folderPath;
                }
            } catch (err) {
                console.error('Browse folder failed:', err);
            }
        });

        // ── Install button handler ────────────────────────────────────────────────
        installBtn.addEventListener('click', async () => {
            const modelPath = pathInput.value.trim() || 'engine/mpi_models/';

            try {
                // 1. Set models path
                await fetch('/comfy/set-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customRoot: modelPath })
                });

                // 2. Move to progress phase and start download
                _showPhase('progress');
                _connectSSE();
                await fetch('/engine/download', { method: 'POST' });
            } catch (err) {
                _setError(`Failed to start installation: ${err.message}`);
            }
        });

        // ── Retry button handler ─────────────────────────────────────────────────
        retryBtn.addEventListener('click', () => {
            _showPhase('setup');
            _disconnectSSE();
        });

        // ── SSE Connection ───────────────────────────────────────────────────────
        function _connectSSE() {
            if (_sseConnection) return;

            _sseConnection = new EventSource('/comfy/downloads/stream');

            _sseConnection.addEventListener('engine:downloading', (e) => {
                const data = JSON.parse(e.data);
                el.setProgress(data);
            });

            _sseConnection.addEventListener('engine:extracting', () => {
                el.setStatus('Extracting...');
            });

            _sseConnection.addEventListener('engine:patching', () => {
                el.setStatus('Finalizing...');
            });

            _sseConnection.addEventListener('engine:upgrade-status', (e) => {
                const data = JSON.parse(e.data);
                el.setStatus(data.status);
            });

            _sseConnection.addEventListener('engine:complete', () => {
                _disconnectSSE();
                el.setStatus('Complete!');
                setTimeout(() => {
                    Events.emit('engine:ready');
                }, 500);
            });

            _sseConnection.addEventListener('engine:error', (e) => {
                _disconnectSSE();
                const data = JSON.parse(e.data);
                el.setError(data.error);
            });

            _sseConnection.addEventListener('error', () => {
                _disconnectSSE();
                el.setError('Connection lost during installation');
            });
        }

        function _disconnectSSE() {
            if (_sseConnection) {
                _sseConnection.close();
                _sseConnection = null;
            }
        }

        // ── Phase Management ─────────────────────────────────────────────────────
        function _showPhase(phaseName) {
            el.querySelectorAll('[data-phase]').forEach(phase => {
                phase.style.display = phase.dataset.phase === phaseName ? 'block' : 'none';
            });
        }

        // ── Portal Management ────────────────────────────────────────────────────
        el.show = (mode) => {
            if (_backdrop) return; // idempotent

            _currentMode = mode;

            // Show appropriate phase based on mode
            if (mode === 'upgrading') {
                _showPhase('progress');
                progressTitle.textContent = 'Updating ComfyUI Engine';
                progressSubtitle.textContent = 'Installing new version...';
                upgradeMessage.style.display = 'block';
            } else {
                _showPhase('setup');
                progressTitle.textContent = 'Installing ComfyUI Engine';
                progressSubtitle.textContent = 'Downloading engine files...';
                upgradeMessage.style.display = 'none';
            }

            // Portal setup
            _backdrop = document.createElement('div');
            _backdrop.className = 'mpi-modal-backdrop';
            document.body.appendChild(_backdrop);

            _wrapper = document.createElement('div');
            _wrapper.className = 'mpi-modal-wrapper';
            _wrapper.style.width = 'min(500px, 90vw)';
            _wrapper.appendChild(el);
            document.body.appendChild(_wrapper);

            // If upgrading, start SSE immediately
            if (mode === 'upgrading') {
                _connectSSE();
                fetch('/engine/upgrade', { method: 'POST' }).catch(err => {
                    el.setError(`Upgrade failed: ${err.message}`);
                });
            }
        };

        el.hide = () => {
            _disconnectSSE();
            _backdrop?.remove();
            _backdrop = null;
            _wrapper?.remove();
            _wrapper = null;
        };

        el.setProgress = (data) => {
            if (!_progressBarInst) {
                _progressBarInst = MpiProgressBar.mount(progressBar, {
                    min: 0,
                    max: 100,
                    value: data.progress || 0,
                    interactive: false,
                    variant: 'primary',
                    info: '0%'
                });
            }

            const { progress = 0, speed = '0 B/s', downloadedBytes = 0, totalBytes = 0 } = data;

            // Update progress bar
            const input = _progressBarInst.el.querySelector('.mpi-progress__input');
            if (input) {
                input.value = progress;
                const trackFill = _progressBarInst.el.querySelector('.mpi-progress__track-fill');
                if (trackFill) trackFill.style.width = `${progress}%`;
            }

            // Update info text
            const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
            const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
            progressInfo.textContent = `${downloadedMB} MB / ${totalMB} MB — ${speed}`;
        };

        el.setStatus = (text) => {
            progressSubtitle.textContent = text;
        };

        el.setError = (message) => {
            _disconnectSSE();
            _showPhase('error');
            errorMessage.textContent = message;
        };

        el.destroy = () => {
            _disconnectSSE();
            if (_progressBarInst) _progressBarInst.destroy();
            el.hide();
        };
    }
});
