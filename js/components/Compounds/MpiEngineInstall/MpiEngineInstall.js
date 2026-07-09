import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { Storage } from '../../../core/storage.js';
import { qs, qsa } from '../../../utils/dom.js';
import { Events } from '../../../events.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { downloadService } from '../../../services/downloadService.js';

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
 * Event subscription:
 *   Subscribes to engine:* events via downloadService bridge (no direct SSE connection)
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

                    <p class="mpi-engine-install__docs-link">
                        While you wait, learn more in the
                        <a href="https://docs.cubric.studio" data-ref="docsLink" target="_blank" rel="noopener noreferrer">documentation</a>.
                    </p>

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
        let _currentMode = null; // 'installing' or 'upgrading'
        // Tracks the active install phase so the parallel UW-deps progress events
        // know whether to pulse the loading animation. The engine install has no
        // pause/resume — that only exists for model downloads (see MPI-54).
        let _downloadState = 'idle'; // 'downloading', 'extracting', 'patching'
        let _progressBarInst = null;
        let _pathInputInst = null;
        let _browseButtonInst = null;
        let _installButtonInst = null;
        let _retryButtonInst = null;
        const _unsubs = [];

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
        // The default models root is server-owned and MUST be absolute (a relative
        // path resolves to different folders in Cubric vs ComfyUI). Mount with the
        // cached value first, then hydrate the authoritative absolute default from
        // GET /comfy/get-path. localStorage is a cache only — the YAML/server wins.
        const savedPath = Storage.getComfyRootPath() || '';

        _pathInputInst = MpiInput.mount(pathInputMount, {
            type: 'text',
            placeholder: 'Default models folder',
            value: savedPath,
            size: 'md'
        });

        // Get reference to the actual input field
        const pathInputField = qs('.mpi-input__field', _pathInputInst.el);

        // Hydrate the absolute default/custom root from the server.
        (async () => {
            try {
                const res = await fetch('/comfy/get-path');
                const data = await res.json();
                if (data?.success && data.path && !(pathInputField.value || '').trim()) {
                    pathInputField.value = data.path;
                }
            } catch (e) {
                clientLogger.error('MpiEngineInstall', 'get-path hydrate failed:', e);
            }
        })();

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
                clientLogger.error('MpiEngineInstall', 'Browse folder failed:', err);
            }
        });

        // ── Mount install button ──────────────────────────────────────────────────
        _installButtonInst = MpiButton.mount(installButtonMount, {
            text: 'Install',
            size: 'lg',
            variant: 'primary'
        });

        _installButtonInst.el.addEventListener('click', async () => {
            // Empty → server resolves to the absolute default models root.
            const modelPath = (pathInputField.value || '').trim();

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
                _subscribeEngineEvents();
                // Ensure SSE is connected BEFORE the POST to avoid missing engine:* broadcasts
                downloadService._ensureSSE();
                // Send the chosen models root in the body too. The pre-download
                // set-path YAML is wiped by the fresh-install extract scrub, so the
                // post-extract step 6 reads this value to write the final YAML with
                // the user's choice (empty → server resolves to the default root).
                await fetch('/engine/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ modelsRoot: modelPath })
                });
            } catch (err) {
                _setError(`Failed to start installation: ${err.message}`);
            }
        });

        // ── Docs link (opens in default browser via Electron shell) ───────────────
        const docsLink = qs('[data-ref="docsLink"]', el);
        if (docsLink) {
            docsLink.addEventListener('click', (evt) => {
                evt.preventDefault();
                const url = docsLink.href;
                if (ipcRenderer) {
                    ipcRenderer.invoke('open-external', url).catch(err => {
                        clientLogger.error('MpiEngineInstall', 'open-external failed, falling back to window.open:', err);
                        window.open(url, '_blank', 'noopener,noreferrer');
                    });
                } else {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            });
        }

        // ── Mount retry button ────────────────────────────────────────────────────
        _retryButtonInst = MpiButton.mount(retryButtonMount, {
            text: 'Retry',
            size: 'md',
            variant: 'primary'
        });

        _retryButtonInst.el.addEventListener('click', async () => {
            try {
                _showPhase('progress');
                _subscribeEngineEvents();
                // Ensure SSE is connected before POST so engine:* events are not missed
                downloadService._ensureSSE();
                // Route by failure phase: if the engine binary (embedded Python)
                // is missing, the download/extract failed — full re-provision via
                // /engine/download. Only when Python already exists is the failure
                // deps-only, where /engine/repair-deps (pip) is the right path.
                // Repairing deps with no Python yields "cannot run pip".
                let engineReady = false;
                try {
                    const statusRes = await fetch('/engine/status');
                    const status = await statusRes.json();
                    engineReady = status && status.exists === true;
                } catch {
                    engineReady = false;
                }
                const route = engineReady ? '/engine/repair-deps' : '/engine/download';
                await fetch(route, { method: 'POST' });
                progressSubtitle.textContent = 'Retrying installation...';
            } catch (err) {
                _showPhase('setup');
                _unsubscribeEngineEvents();
            }
        });

        // NOTE: The engine install intentionally has NO pause/resume UI. The engine
        // archive and the UW model deps download in parallel, and only the engine
        // archive was ever pausable — once it finished the control became a dead
        // button mid-download. Pause/resume lives with model downloads only (MPI-54).

        // ── Phase management ──────────────────────────────────────────────────────
        function _showPhase(phaseName) {
            qsa('[data-phase]', el).forEach(phase => {
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
            } else if (mode === 'repairing') {
                _showPhase('progress');
                progressTitle.textContent = 'Installing Dependencies';
                progressSubtitle.textContent = 'Setting up...';
                upgradeMessage.style.display = 'none';
            } else {
                _showPhase('setup');
                progressTitle.textContent = 'Installing ComfyUI Engine';
                progressSubtitle.textContent = 'Downloading engine files...';
                upgradeMessage.style.display = 'none';
            }

            if (!_modal) {
                _modal = MpiModal.mount(document.createElement('div'), {
                    width: 'min(500px, 90vw)',
                    backdropClose: false
                });
                _modal.el.appendChild(el);
            }
            _modal.el.show();

            if (mode === 'upgrading') {
                _subscribeEngineEvents();
                // Connect SSE BEFORE the POST so engine:downloading broadcasts are
                // not missed (without this the progress bar stays stuck on the
                // static "Preparing download..." placeholder until SSE lazily
                // connects, then jumps straight to extracting). Matches the
                // install + repair paths.
                downloadService._ensureSSE();
                fetch('/engine/upgrade', { method: 'POST' }).catch(err => {
                    _setError(`Upgrade failed: ${err.message}`);
                });
            } else if (mode === 'repairing') {
                _subscribeEngineEvents();
                _progressBarInst = MpiProgressBar.mount(progressBar, {
                    min: 0,
                    max: 100,
                    value: 0,
                    interactive: false,
                    variant: 'primary',
                    info: 'Installing additional packages...'
                });
                // Ensure SSE is connected before POST to avoid missing engine:* broadcasts
                downloadService._ensureSSE();
                fetch('/engine/repair-deps', { method: 'POST' }).catch(err => {
                    _setError(`Repair failed: ${err.message}`);
                });
            }
        };

        el.hide = () => {
            _unsubscribeEngineEvents();
            if (_modal) {
                _modal.el.hide();
            }
        };

        // Track combined download progress (engine + UW deps)
        let _engineDownloadedBytes = 0;
        let _engineTotalBytes = 0;
        let _uwDepsDownloadedBytes = 0;
        let _uwDepsTotalBytes = 0;
        let _engineSpeed = '0 B/s';

        el.setProgress = (data) => {
            if (!_progressBarInst) {
                _progressBarInst = MpiProgressBar.mount(progressBar, {
                    min: 0,
                    max: 100,
                    value: 0,
                    interactive: false,
                    variant: 'primary',
                    info: '0%'
                });
            }

            // Determine if this is engine:downloading or download:progress for UW deps
            const isEngineProgress = data.progress !== undefined && !data.modelId;
            const isUWProgress = data.modelId === '__universal_workflow__';

            if (isEngineProgress) {
                _engineDownloadedBytes = data.downloadedBytes || 0;
                _engineTotalBytes = data.totalBytes || 0;
                _engineSpeed = data.speed || '0 B/s';
            } else if (isUWProgress) {
                _uwDepsDownloadedBytes = data.downloadedBytes || 0;
                _uwDepsTotalBytes = data.totalBytes || 0;
            }

            // Calculate combined progress
            const combinedDownloaded = _engineDownloadedBytes + _uwDepsDownloadedBytes;
            const combinedTotal = _engineTotalBytes + _uwDepsTotalBytes;
            const combinedProgress = combinedTotal > 0 ? Math.round((combinedDownloaded / combinedTotal) * 100) : 0;

            // MPI-231 — custom_nodes are work-not-bytes: a UW tick can arrive
            // indeterminate (git-archive has no Content-Length, pip has no up-front
            // total). With no engine archive downloading alongside it, there is no
            // honest ratio to show — a "0.0 MB / 0.0 MB" bar reads as broken. Flip to
            // the loading sweep + a Preparing… label instead. When the engine archive
            // IS downloading, it owns the determinate bar; keep the real ratio.
            const engineHasBytes = _engineTotalBytes > 0;
            if (isUWProgress && data.indeterminate && !engineHasBytes) {
                el.setLoading(true);
                progressInfo.textContent = 'Preparing dependencies…';
                return;
            }

            // Update progress bar
            const input = qs('.mpi-progress__input', _progressBarInst.el);
            if (input) {
                input.value = combinedProgress;
                const trackFill = qs('.mpi-progress__track-fill', _progressBarInst.el);
                if (trackFill) trackFill.style.width = `${combinedProgress}%`;
            }

            // Update info text
            const downloadedMB = (combinedDownloaded / (1024 * 1024)).toFixed(1);
            const totalMB = (combinedTotal / (1024 * 1024)).toFixed(1);
            progressInfo.textContent = `${downloadedMB} MB / ${totalMB} MB — ${_engineSpeed}`;
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
            _unsubscribeEngineEvents();
            _showPhase('error');
            errorMessage.textContent = message;
        }

        el.setError = _setError;

        el.destroy = () => {
            _unsubscribeEngineEvents();
            if (_progressBarInst) _progressBarInst.destroy();
            if (_pathInputInst) _pathInputInst.destroy();
            if (_browseButtonInst) _browseButtonInst.destroy();
            if (_installButtonInst) _installButtonInst.destroy();
            if (_retryButtonInst) _retryButtonInst.destroy();
            if (_modal) _modal.el.hide();
            el.hide();
        };

        // ── Event Subscriptions ──────────────────────────────────────────────────
        function _subscribeEngineEvents() {
            if (_unsubs.length) return;

            _unsubs.push(Events.on('engine:downloading', (data) => {
                el.setLoading(false); // Disable pulsation during actual download
                el.setProgress(data);
                _downloadState = 'downloading';
            }));

            _unsubs.push(Events.on('engine:extracting', (data) => {
                _downloadState = 'extracting';
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
            }));

            _unsubs.push(Events.on('engine:patching', (data) => {
                _downloadState = 'patching';
                el.setStatus(data.status || 'Finalizing...');
                progressInfo.textContent = 'Finalizing installation...';
                el.setLoading(true);
            }));

            _unsubs.push(Events.on('engine:upgrade-status', (data) => {
                el.setStatus(data.status);
            }));

            _unsubs.push(Events.on('engine:uw-installing', (data) => {
                el.setStatus(data.status || 'Installing dependencies...');
                if (data.progress !== undefined) {
                    el.setProgress(data);
                }
                // UW deps download in PARALLEL with the engine archive. Only pulse
                // the loading animation when the engine archive is not itself
                // actively downloading (it owns the determinate progress bar).
                if (_downloadState !== 'downloading') {
                    el.setLoading(true);
                }
            }));

            _unsubs.push(Events.on('download:progress', (data) => {
                if (data.modelId === '__universal_workflow__') {
                    // UW deps (parallel) — update progress only.
                    if (_downloadState !== 'downloading') {
                        el.setLoading(false);
                    }
                    el.setProgress(data);
                }
            }));

            _unsubs.push(Events.on('engine:complete', () => {
                _downloadState = 'idle';
                _unsubscribeEngineEvents();
                el.setLoading(false);
                el.setStatus('Complete!');
                setTimeout(() => {
                    Events.emit('engine:ready');
                }, 500);
            }));

            _unsubs.push(Events.on('engine:error', (data) => {
                _downloadState = 'idle';
                _unsubscribeEngineEvents();
                _setError(data.error);
            }));
        }

        function _unsubscribeEngineEvents() {
            _unsubs.forEach(fn => fn());
            _unsubs.length = 0;
        }
    }
});
