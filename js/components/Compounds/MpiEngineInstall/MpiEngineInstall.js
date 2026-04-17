import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { Storage } from '../../../core/storage.js';
import { qs } from '../../../utils/dom.js';
import { Events } from '../../../events.js';

/**
 * MpiEngineInstall — Engine provisioning modal for first install and upgrades (Compound)
 *
 * Uses MpiModal primitive for modal management and MpiButton, MpiInput, MpiProgressBar primitives.
 *
 * Two-phase UI for first install:
 *   Phase 1 (setup):     Models path picker + Browse button + Install button
 *   Phase 2 (progress):  Progress bar + status text + speed/size info
 *
 * For upgrades:
 *   Skips Phase 1, goes straight to Phase 2 with "models are safe" messaging
 *
 * API:
 *   inst.el.show(mode)      — 'installing' | 'upgrading' — shows modal with appropriate phase
 *   inst.el.hide()          — closes modal
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
                    <h2 class="mpi-engine-install__title">Welcome</h2>
                    <h2 class="mpi-engine-install__title">Let's Set Up ComfyUI</h2>
                    <p class="mpi-engine-install__subtitle">Choose where to store your AI models</p>

                    <div class="mpi-engine-install__form">
                        <label class="mpi-engine-install__label">Models Folder</label>
                        <div class="mpi-engine-install__folder-input-row">
                            <div data-ref="pathInputMount"></div>
                            <div data-ref="browseButtonMount"></div>
                        </div>
                        <p class="mpi-engine-install__hint">You can change this path later in Settings</p>
                    </div>

                    <div data-ref="installButtonMount"></div>
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

                    <div class="mpi-engine-install__button-group">
                        <div data-ref="pauseButtonMount"></div>
                        <div data-ref="resumeButtonMount" style="display: none;"></div>
                    </div>
                </div>
            </div>

            <!-- Error state -->
            <div class="mpi-engine-install__phase" data-phase="error">
                <div class="mpi-engine-install__content mpi-engine-install__content--error">
                    <h2 class="mpi-engine-install__title mpi-engine-install__title--error">Installation Failed</h2>
                    <p class="mpi-engine-install__error-message" data-ref="errorMessage">An error occurred during installation</p>
                    <div data-ref="retryButtonMount"></div>
                </div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        let _modal = null;
        let _sseConnection = null;
        let _currentMode = null; // 'installing' or 'upgrading'
        let _downloadState = 'idle'; // 'downloading', 'paused', 'extracting', 'patching'
        let _progressBarInst = null;
        let _pathInputInst = null;
        let _browseButtonInst = null;
        let _installButtonInst = null;
        let _retryButtonInst = null;
        let _pauseButtonInst = null;
        let _resumeButtonInst = null;

        const progressBar = qs('[data-ref="progressBar"]', el);
        const progressInfo = qs('[data-ref="progressInfo"]', el);
        const progressTitle = qs('[data-ref="progressTitle"]', el);
        const progressSubtitle = qs('[data-ref="progressSubtitle"]', el);
        const upgradeMessage = qs('[data-ref="upgradeMessage"]', el);
        const errorMessage = qs('[data-ref="errorMessage"]', el);

        // Mount primitives in Phase 1 (setup)
        const pathInputMount = qs('[data-ref="pathInputMount"]', el);
        const browseButtonMount = qs('[data-ref="browseButtonMount"]', el);
        const installButtonMount = qs('[data-ref="installButtonMount"]', el);
        const retryButtonMount = qs('[data-ref="retryButtonMount"]', el);

        // Mount primitives in Phase 2 (progress)
        const pauseButtonMount = qs('[data-ref="pauseButtonMount"]', el);
        const resumeButtonMount = qs('[data-ref="resumeButtonMount"]', el);

        // ── IPC access (Electron) ────────────────────────────────────────────────
        let ipcRenderer = null;
        try {
            if (typeof window.require === 'function') {
                const electron = window.require('electron');
                ipcRenderer = electron.ipcRenderer;
            }
        } catch (e) {
            // Silent fail — expected in Browser Mode
        }

        // ── Mount path input ──────────────────────────────────────────────────────
        const defaultPath = 'engine/mpi_models/';
        const savedPath = Storage.getComfyRootPath() || defaultPath;

        _pathInputInst = MpiInput.mount(pathInputMount, {
            type: 'text',
            placeholder: 'engine/mpi_models/',
            value: savedPath,
            size: 'md'
        });

        // Get reference to the actual input field
        const pathInputField = _pathInputInst.el.querySelector('.mpi-input__field');

        // ── Mount browse button ───────────────────────────────────────────────────
        _browseButtonInst = MpiButton.mount(browseButtonMount, {
            text: 'Browse',
            size: 'lg',
            variant: 'secondary'
        });

        _browseButtonInst.el.addEventListener('click', async () => {
            try {
                if (ipcRenderer) {
                    // Use Electron IPC to show cross-platform native folder picker
                    const data = await ipcRenderer.invoke('choose-folder');
                    if (!data.cancelled && data.path) {
                        pathInputField.value = data.path;
                        Storage.setComfyRootPath(data.path);
                    }
                } else {
                    // Fallback for non-Electron environments (development/web)
                    const result = await fetch('/choose-folder', { method: 'POST' });
                    const data = await result.json();
                    if (!data.cancelled && data.path) {
                        pathInputField.value = data.path;
                        Storage.setComfyRootPath(data.path);
                    }
                }
            } catch (err) {
                console.error('Browse folder failed:', err);
            }
        });

        // ── Mount install button ──────────────────────────────────────────────────
        _installButtonInst = MpiButton.mount(installButtonMount, {
            text: 'Install',
            size: 'lg',
            variant: 'primary'
        });

        _installButtonInst.el.addEventListener('click', async () => {
            const modelPath = (pathInputField.value || '').trim() || 'engine/mpi_models/';

            // Save path to localStorage for next session
            Storage.setComfyRootPath(modelPath);

            try {
                // 1. Set models path
                await fetch('/comfy/set-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: modelPath })
                });

                // 2. Move to progress phase and start download
                _showPhase('progress');
                _connectSSE();
                await fetch('/engine/download', { method: 'POST' });
            } catch (err) {
                _setError(`Failed to start installation: ${err.message}`);
            }
        });

        // ── Mount retry button ────────────────────────────────────────────────────
        _retryButtonInst = MpiButton.mount(retryButtonMount, {
            text: 'Retry',
            size: 'md',
            variant: 'primary'
        });

        _retryButtonInst.el.addEventListener('click', async () => {
            try {
                // Attempt to resume the paused/failed download
                _showPhase('progress');
                _connectSSE();
                await fetch('/engine/resume', { method: 'POST' });
                progressSubtitle.textContent = 'Resuming installation...';
            } catch (err) {
                // If resume fails (no partial file), go back to setup for fresh start
                _showPhase('setup');
                _disconnectSSE();
            }
        });

        // ── Mount pause button ────────────────────────────────────────────────────
        _pauseButtonInst = MpiButton.mount(pauseButtonMount, {
            text: 'Pause',
            size: 'md',
            variant: 'secondary'
        });

        _pauseButtonInst.el.addEventListener('click', async () => {
            try {
                await fetch('/engine/pause', { method: 'POST' });
                _downloadState = 'paused';
                pauseButtonMount.style.display = 'none';
                resumeButtonMount.style.display = 'block';
                progressSubtitle.textContent = 'Download paused. Click Resume to continue.';
            } catch (err) {
                console.error('Pause failed:', err);
            }
        });

        // ── Mount resume button ───────────────────────────────────────────────────
        _resumeButtonInst = MpiButton.mount(resumeButtonMount, {
            text: 'Resume',
            size: 'md',
            variant: 'primary'
        });

        _resumeButtonInst.el.addEventListener('click', async () => {
            try {
                await fetch('/engine/resume', { method: 'POST' });
                _downloadState = 'downloading';
                pauseButtonMount.style.display = 'block';
                resumeButtonMount.style.display = 'none';
                progressSubtitle.textContent = 'Resuming download...';
            } catch (err) {
                console.error('Resume failed:', err);
            }
        });

        // ── Phase management ──────────────────────────────────────────────────────
        function _showPhase(phaseName) {
            el.querySelectorAll('[data-phase]').forEach(phase => {
                phase.style.display = phase.dataset.phase === phaseName ? 'block' : 'none';
            });
        }

        // ── Modal Management ──────────────────────────────────────────────────────
        el.show = (mode) => {
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

            // Create and show modal
            if (!_modal) {
                _modal = MpiModal.mount(document.createElement('div'), {
                    width: 'min(500px, 90vw)',
                    backdropClose: false
                });
                _modal.el.appendChild(el);
            }
            _modal.el.show();

            // If upgrading, start SSE immediately
            if (mode === 'upgrading') {
                _connectSSE();
                fetch('/engine/upgrade', { method: 'POST' }).catch(err => {
                    _setError(`Upgrade failed: ${err.message}`);
                });
            }
        };

        el.hide = () => {
            _disconnectSSE();
            if (_modal) {
                _modal.el.hide();
            }
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

        el.setLoading = (isLoading) => {
            if (_progressBarInst && _progressBarInst.el) {
                if (isLoading) {
                    _progressBarInst.el.classList.add('mpi-progress--loading');
                } else {
                    _progressBarInst.el.classList.remove('mpi-progress--loading');
                }
            }
        };

        function _setError(message) {
            _disconnectSSE();
            _showPhase('error');
            errorMessage.textContent = message;
        }

        el.setError = _setError;

        el.destroy = () => {
            _disconnectSSE();
            if (_progressBarInst) _progressBarInst.destroy();
            if (_pathInputInst) _pathInputInst.destroy();
            if (_browseButtonInst) _browseButtonInst.destroy();
            if (_installButtonInst) _installButtonInst.destroy();
            if (_retryButtonInst) _retryButtonInst.destroy();
            if (_pauseButtonInst) _pauseButtonInst.destroy();
            if (_resumeButtonInst) _resumeButtonInst.destroy();
            if (_modal) _modal.el.hide();
            el.hide();
        };

        // ── SSE Connection ───────────────────────────────────────────────────────
        function _connectSSE() {
            if (_sseConnection) return;

            _sseConnection = new EventSource('/comfy/downloads/stream');

            _sseConnection.addEventListener('engine:downloading', (e) => {
                const data = JSON.parse(e.data);
                _downloadState = 'downloading';
                // Show pause button, hide resume button during download
                pauseButtonMount.style.display = 'block';
                resumeButtonMount.style.display = 'none';
                el.setProgress(data);
            });

            _sseConnection.addEventListener('engine:extracting', (e) => {
                const data = JSON.parse(e.data);
                _downloadState = 'extracting';
                // Hide both pause/resume buttons during extraction
                pauseButtonMount.style.display = 'none';
                resumeButtonMount.style.display = 'none';
                let displayFile = '';
                if (data.file) {
                    // Extract just the filename from the full path
                    const parts = data.file.split(/[\\\/]/);
                    displayFile = parts[parts.length - 1] || data.file;
                    // Truncate if too long
                    if (displayFile.length > 40) {
                        displayFile = displayFile.substring(0, 37) + '...';
                    }
                }
                el.setStatus(`Extracting${displayFile ? ': ' + displayFile : ''}...`);
                // Clear progress info during extraction (we don't have granular progress)
                progressInfo.textContent = 'Extracting files...';
                // Show loading animation during extraction
                el.setLoading(true);
            });

            _sseConnection.addEventListener('engine:patching', (e) => {
                const data = JSON.parse(e.data);
                _downloadState = 'patching';
                // Hide buttons during patching
                pauseButtonMount.style.display = 'none';
                resumeButtonMount.style.display = 'none';
                el.setStatus(data.status || 'Finalizing...');
                progressInfo.textContent = 'Finalizing installation...';
                el.setLoading(true);
            });

            _sseConnection.addEventListener('engine:upgrade-status', (e) => {
                const data = JSON.parse(e.data);
                el.setStatus(data.status);
            });

            _sseConnection.addEventListener('engine:complete', () => {
                _downloadState = 'idle';
                _disconnectSSE();
                pauseButtonMount.style.display = 'none';
                resumeButtonMount.style.display = 'none';
                el.setLoading(false);
                el.setStatus('Complete!');
                setTimeout(() => {
                    Events.emit('engine:ready');
                }, 500);
            });

            _sseConnection.addEventListener('engine:error', (e) => {
                _downloadState = 'idle';
                _disconnectSSE();
                // Hide pause/resume during error state
                pauseButtonMount.style.display = 'none';
                resumeButtonMount.style.display = 'none';
                const data = JSON.parse(e.data);
                _setError(data.error);
            });

            _sseConnection.addEventListener('error', () => {
                _disconnectSSE();
                _setError('Connection lost during installation');
            });
        }

        function _disconnectSSE() {
            if (_sseConnection) {
                _sseConnection.close();
                _sseConnection = null;
            }
        }
    }
});
