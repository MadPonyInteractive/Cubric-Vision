import { ComponentFactory } from '../../factory.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { formatBytes } from '../../../utils/formatBytes.js';

/**
 * MpiInstalledDisplay — Installed Item Info Compound
 *
 * Displays metadata and actions for an installed item (e.g., a downloaded model
 * or workflow). Mirrors the legacy model-manager card layout.
 *
 * Props:
 * @param {string} [title='']          - Title text displayed on the top-left
 * @param {string} [meta='']           - Small text on the top-right (e.g., "13.75GB REQUIRED")
 * @param {string} [text='']           - Descriptive text body
 * @param {string} [image='']          - Preview still filename from modelConstants (e.g. 'sdxl-real-01.webp').
 *                                        Renders an <img> from 'comfy_workflows/display/{image}'.
 * @param {string} [video='']          - Preview clip filename from modelConstants (e.g. 'wan22_preview.mp4').
 *                                        Renders a muted, looping <video> from 'comfy_workflows/display/{video}'
 *                                        that plays on hover and resets on mouse-leave. Takes precedence over
 *                                        `image` when both are set.
 * @param {'portrait'|'landscape'} [mediaRatio] - Preview box aspect. Defaults to 'landscape' when `video`
 *                                        is set, else 'portrait' (still art is ~4:5). Controls how the
 *                                        media slot is shaped so portrait art isn't cropped to a strip.
 *                                        For `video`, this is only the pre-load fallback — once the clip's
 *                                        metadata loads, the box is resized to the clip's real aspect ratio
 *                                        (portrait clips get a 320px max-width cap).
 * @param {string} [icon='info']       - MpiIcon registry key for the info row icon
 * @param {string} [iconText='']       - Text shown alongside the icon in the info row
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='sm'] - Size of the info row icon
 * @param {'muted'|'accent'|'primary'|'danger'|'success'} [iconColor='danger']
 *   - Color modifier for the info row icon
 * @param {boolean} [installed=false]     - Whether this item is installed; controls badge label/variant
 * @param {string} [deleteLabel='Install']    - Label for the primary action button
 * @param {'idle'|'downloading'|'paused'|'partial'|'installing'|'complete'|'cancelled'} [downloadState='idle']
 * @param {number} [progress=0]          - Download progress 0–1
 * @param {string} [speed='']            - Download speed string e.g. "12.3 MB/s"
 * @param {number} [downloadedBytes=0]   - Bytes downloaded so far
 * @param {number} [totalBytes=0]        - Total bytes to download
 * @param {boolean} [canUninstall=false] - Show Uninstall button when true and installed
 * @param {string} [uninstallLabel='Uninstall'] - Label for the installed-state primary button. Pass 'Update' when an operation-selectable model has pending toggle changes (MPI-122); the click still emits 'uninstall' — the caller decides install-missing vs uninstall-removed.
 * @param {boolean} [hasPartialProgress=false] - Show progress bar for a partially-installed dep
 *   (e.g. some deps are on disk but missing others). Use with downloadState='idle' to show
 *   a progress bar while keeping the Install button.
 * @param {boolean} [indeterminate=false] - Show an animated sweep instead of a real % (MPI-95).
 *   Used by the remote install path while a real total isn't known yet (the gap before the
 *   wrapper's first tick) and during the wrapper's post-download sha256 verify. Cleared by
 *   setProgress({ indeterminate:false }).
 * @param {'preparing'|'verifying'} [phase='preparing'] - Label for the indeterminate sweep
 *   (MPI-95): 'preparing' before the first real-total tick, 'verifying' during the wrapper hash.
 *
 * Public APIs (on el):
 *   el.setProgress({ progress, speed, downloadedBytes, totalBytes, indeterminate, phase }) — update progress bar in place
 *   el.setDownloadState(downloadState) — re-render buttons + badge for new state
 *   el.opsSlot — static DOM slot between the badge row and the action button
 *     (MPI-122). The model manager appends operation-toggle buttons here; it is
 *     hidden by default and never touched by setDownloadState's button rebuild,
 *     so toggle instances survive progress/state updates.
 *   el.destroy() — tear down all mounted children
 *
 * Emits:
 * 'delete'    {} — Action button clicked (Install when idle)
 * 'pause'     {} — Pause button clicked (during download)
 * 'resume'    {} — Resume button clicked (when paused)
 * 'cancel'    {} — Cancel button clicked
 * 'uninstall' {} — Uninstall button clicked (when installed and canUninstall)
 */
export const MpiInstalledDisplay = ComponentFactory.create({
    name: 'MpiInstalledDisplay',
    css: ['js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css'],

    template: () => `
        <div class="mpi-installed-display">
            <div class="mpi-installed-display__header">
                <span class="mpi-installed-display__title" id="idtitle-slot"></span>
                <span class="mpi-installed-display__meta" id="idmeta-slot"></span>
            </div>
            <div class="mpi-installed-display__text" id="idtext-slot"></div>
            <div class="mpi-installed-display__image" id="idimage-slot"></div>
            <div class="mpi-installed-display__info-row" id="idinfo-slot"></div>
            <div class="mpi-installed-display__badge-row" id="idbadge-slot"></div>
            <div class="mpi-installed-display__ops" id="idops-slot"></div>
            <div class="mpi-installed-display__actions" id="idactions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // Track mounted children for destroy() cleanup
        const _children = [];

        // Mutable local copy of download-related fields so setProgress/setDownloadState
        // can re-render without losing prior values.
        const _current = {
            downloadState: props.downloadState || 'idle',
            progress: props.progress || 0,
            speed: props.speed || '',
            downloadedBytes: props.downloadedBytes || 0,
            totalBytes: props.totalBytes || 0,
            hasPartialProgress: !!props.hasPartialProgress,
            installed: !!props.installed,
            // MPI-95: indeterminate sweep + phase label instead of a fake %. The
            // remote install shows an animated bar in two spots: 'preparing' (the
            // gap before the wrapper's first real-total tick) and 'verifying' (the
            // wrapper's post-download sha256 hash, which is otherwise a silent
            // freeze at ~100%). phase drives the label only; indeterminate drives
            // the sweep.
            indeterminate: !!props.indeterminate,
            phase: props.phase || 'preparing',
            // Remote (cloud Pod) downloads can't pause/resume — the wrapper's
            // aria2c install has no pause API. Hide the Pause button when remote so
            // the user isn't offered a no-op. (MPI-140)
            isRemote: !!props.isRemote,
        };

        // Title
        const titleSlot = qs('#idtitle-slot', el);
        if (props.title) titleSlot.textContent = props.title;

        // Meta (top-right)
        const metaSlot = qs('#idmeta-slot', el);
        if (props.meta) metaSlot.textContent = props.meta;

        // Text body
        const textSlot = qs('#idtext-slot', el);
        if (props.text) textSlot.textContent = props.text;

        // Media preview — hover-play <video> when `video` is set, else a still <img>.
        // Hover listeners are collected in _mediaUnsubs and torn down in destroy().
        const _mediaUnsubs = [];
        const imageSlot = qs('#idimage-slot', el);
        // Shape the media box: video defaults to landscape (16:9 clips), stills to
        // portrait (~4:5 source art). Caller may override via props.mediaRatio.
        if (props.video || props.image) {
            const ratio = props.mediaRatio || (props.video ? 'landscape' : 'portrait');
            imageSlot.classList.add(`mpi-installed-display__image--${ratio}`);
        }
        if (props.video) {
            const video = ce('video', {
                src: `comfy_workflows/display/${props.video}`,
                className: 'mpi-installed-display__image-img mpi-installed-display__image-video',
            });
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = 'metadata';
            // Match the preview box to the clip's real aspect once metadata loads, so
            // portrait clips (i2v) aren't letterboxed into the landscape default and
            // landscape clips (t2v) aren't cropped to a portrait strip. Caller-set
            // props.mediaRatio (the --landscape/--portrait class) is the pre-load
            // fallback; the runtime measurement is authoritative and respects any clip.
            _mediaUnsubs.push(on(video, 'loadedmetadata', () => {
                if (video.videoWidth && video.videoHeight) {
                    imageSlot.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
                    if (video.videoHeight > video.videoWidth) imageSlot.style.maxWidth = '320px';
                }
            }));
            // Failed media must not collapse the card — hide the slot if the clip can't load.
            _mediaUnsubs.push(on(video, 'error', () => { imageSlot.style.display = 'none'; }));
            _mediaUnsubs.push(on(imageSlot, 'mouseenter', () => { video.play().catch(() => {}); }));
            _mediaUnsubs.push(on(imageSlot, 'mouseleave', () => {
                video.pause();
                try { video.currentTime = 0; } catch (_) { /* ignore */ }
            }));
            imageSlot.appendChild(video);
        } else if (props.image) {
            const img = ce('img', {
                src: `comfy_workflows/display/${props.image}`,
                className: 'mpi-installed-display__image-img',
            });
            // Match the box to the still's real aspect once it loads, so non-4:5 art
            // (e.g. the square PiD preview) shows as-is instead of cover-cropping to
            // the portrait default. Mirrors the video loadedmetadata trick above.
            _mediaUnsubs.push(on(img, 'load', () => {
                if (img.naturalWidth && img.naturalHeight) {
                    imageSlot.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                    if (img.naturalHeight > img.naturalWidth) imageSlot.style.maxWidth = '320px';
                }
            }));
            _mediaUnsubs.push(on(img, 'error', () => { imageSlot.style.display = 'none'; }));
            imageSlot.appendChild(img);
        } else {
            imageSlot.style.display = 'none';
        }

        // Icon + text row
        const infoSlot = qs('#idinfo-slot', el);
        if (props.icon || props.iconText) {
            const iconWrap = ce('div', { className: 'mpi-installed-display__info-inner' });

            if (props.icon) {
                const iconInst = MpiIcon.mount(ce('div'), {
                    name: props.icon,
                    size: props.iconSize || 'sm',
                    color: props.iconColor || 'danger'
                });
                iconWrap.appendChild(iconInst.el);
                _children.push(iconInst);
            }

            if (props.iconText) {
                const iconTextEl = ce('span', {
                    className: 'mpi-installed-display__icon-text',
                    textContent: props.iconText,
                });
                iconWrap.appendChild(iconTextEl);
            }

            infoSlot.appendChild(iconWrap);
        } else {
            infoSlot.style.display = 'none';
        }

        const badgeSlot = qs('#idbadge-slot', el);
        const actionsSlot = qs('#idactions-slot', el);

        // MPI-122: static slot (between badge + actions) for operation toggles. The
        // model manager populates it after mount via el.opsSlot. It is NOT touched by
        // _renderState (download-state rebuilds), so toggle instances survive progress
        // updates. Empty + display:none by default so non-op cards show nothing.
        const opsSlot = qs('#idops-slot', el);
        opsSlot.style.display = 'none';
        el.opsSlot = opsSlot;

        // Live refs for in-place progress update (populated by _renderState)
        let _progressBarInst = null;
        let _progressLabelEl = null;

        // Destroy any existing children in a slot, removing them from _children tracking
        function _clearSlot(slot) {
            // Children in _children that live inside this slot must be destroyed
            for (let i = _children.length - 1; i >= 0; i--) {
                const child = _children[i];
                if (child.el && slot.contains(child.el)) {
                    if (typeof child.destroy === 'function') child.destroy();
                    _children.splice(i, 1);
                }
            }
            slot.innerHTML = '';
        }

        // Build the badge + actions rows for the current _current state
        function _renderState() {
            const { downloadState, hasPartialProgress, installed } = _current;

            const isDownloading = ['downloading', 'paused', 'partial'].includes(downloadState);
            const isInstalling = downloadState === 'installing';
            const isComplete = downloadState === 'complete' || installed;
            const isCancelled = downloadState === 'cancelled';
            const showProgress = isDownloading || hasPartialProgress;

            // ── Badge row ────────────────────────────────────────────────────
            _clearSlot(badgeSlot);
            if (isComplete) {
                const badge = MpiBadge.mount(ce('div'), { label: 'INSTALLED', variant: 'success' });
                badgeSlot.appendChild(badge.el);
                _children.push(badge);
            } else if (hasPartialProgress && !installed) {
                const badge = MpiBadge.mount(ce('div'), { label: 'PARTIALLY INSTALLED', variant: 'warning' });
                badgeSlot.appendChild(badge.el);
                _children.push(badge);
            } else if (!showProgress && !isInstalling) {
                // idle + cancelled both fall here → "NOT INSTALLED"
                const badge = MpiBadge.mount(ce('div'), { label: 'NOT INSTALLED', variant: 'danger' });
                badgeSlot.appendChild(badge.el);
                _children.push(badge);
            }

            // ── Actions row ──────────────────────────────────────────────────
            _clearSlot(actionsSlot);
            _progressBarInst = null;
            _progressLabelEl = null;

            // Progress bar — shown for active downloads OR partial progress (hasPartialProgress)
            if (showProgress) {
                const progressSlot = ce('div', { className: 'mpi-installed-display__progress-slot' });

                const barWrap = ce('div', { style: 'padding: 4px 0;' });
                _progressBarInst = MpiProgressBar.mount(barWrap, {
                    value: Math.round((_current.progress || 0) * 100),
                    min: 0,
                    max: 100,
                    variant: downloadState === 'paused' ? 'secondary' : 'primary',
                    interactive: false,
                });
                _children.push(_progressBarInst);
                // MPI-95: indeterminate sweep while real sizes resolve.
                _applyIndeterminate(_current.indeterminate);
                progressSlot.appendChild(barWrap);

                _progressLabelEl = ce('div', { className: 'mpi-installed-display__progress-label' });
                _updateProgressLabel();
                progressSlot.appendChild(_progressLabelEl);

                actionsSlot.appendChild(progressSlot);
            }

            if (isInstalling) {
                const label = ce('div', { className: 'mpi-installed-display__installing-label' });
                label.textContent = 'Installing';
                actionsSlot.appendChild(label);
            }

            if (downloadState === 'downloading') {
                // Pause is local-only — remote (cloud) downloads have no pause API.
                if (!_current.isRemote) {
                    const pauseBtn = MpiButton.mount(ce('div'), { text: 'Pause', variant: 'secondary', size: 'md' });
                    pauseBtn.on('click', () => emit('pause', {}));
                    actionsSlot.appendChild(pauseBtn.el);
                    _children.push(pauseBtn);
                }
                const cancelBtn = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'ghost', size: 'md' });
                cancelBtn.on('click', () => emit('cancel', {}));
                actionsSlot.appendChild(cancelBtn.el);
                _children.push(cancelBtn);
            } else if (downloadState === 'paused' || downloadState === 'partial') {
                const resumeBtn = MpiButton.mount(ce('div'), { text: 'Resume', variant: 'primary', size: 'md' });
                resumeBtn.on('click', () => emit('resume', {}));
                actionsSlot.appendChild(resumeBtn.el);
                _children.push(resumeBtn);
                const cancelBtn = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'ghost', size: 'md' });
                cancelBtn.on('click', () => emit('cancel', {}));
                actionsSlot.appendChild(cancelBtn.el);
                _children.push(cancelBtn);
            } else if (!isComplete) {
                // idle + cancelled: show Install (or custom deleteLabel) — cancelled cards
                // render the same as idle so the user can retry, never blank.
                const spacer = ce('div', { className: 'mpi-installed-display__spacer' });
                actionsSlot.appendChild(spacer);
                const label = isCancelled ? (props.deleteLabel || 'Reinstall') : (props.deleteLabel || 'Install');
                const actionBtn = MpiButton.mount(ce('div'), {
                    text: label,
                    variant: 'secondary',
                    size: 'md',
                });
                actionBtn.on('click', () => emit('delete', {}));
                actionsSlot.appendChild(actionBtn.el);
                _children.push(actionBtn);
            } else if (installed && props.canUninstall) {
                // Installed-state primary button. Label defaults to 'Uninstall';
                // op-selectable models pass 'Update' when toggles changed (MPI-122).
                // The event is always 'uninstall' — the caller branches on its draft.
                const spacer = ce('div', { className: 'mpi-installed-display__spacer' });
                actionsSlot.appendChild(spacer);
                const uninstallBtn = MpiButton.mount(ce('div'), {
                    text: props.uninstallLabel || 'Uninstall',
                    variant: 'ghost',
                    size: 'md',
                });
                uninstallBtn.on('click', () => emit('uninstall', {}));
                actionsSlot.appendChild(uninstallBtn.el);
                _children.push(uninstallBtn);
            }
        }

        // MPI-95: toggle the indeterminate sweep on the live progress bar. Reuses
        // the MpiProgressBar `--loading` shimmer (animated full-width band) so the
        // bar reads as "working" without showing a fake %.
        function _applyIndeterminate(on) {
            if (!_progressBarInst) return;
            const bar = qs('.mpi-progress', _progressBarInst.el);
            if (bar) bar.classList.toggle('mpi-progress--loading', !!on);
        }

        function _updateProgressLabel() {
            if (!_progressLabelEl) return;
            const { downloadState, hasPartialProgress, speed, downloadedBytes, totalBytes, indeterminate, phase } = _current;
            if (indeterminate) {
                _progressLabelEl.textContent = phase === 'verifying' ? 'Verifying…' : 'Preparing…';
                return;
            }
            if (downloadState === 'paused') {
                const downloadedText = totalBytes ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : '';
                const suffix = [downloadedText, speed].filter(Boolean).join(' - ');
                _progressLabelEl.textContent = suffix ? `Paused - ${suffix}` : 'Paused';
            } else if (hasPartialProgress) {
                const downloadedText = totalBytes ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : '';
                _progressLabelEl.textContent = downloadedText || 'Partially installed';
            } else {
                const downloadedText = totalBytes ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : '';
                const speedText = speed || '';
                _progressLabelEl.textContent = downloadedText ? (speedText ? `${downloadedText} — ${speedText}` : downloadedText) : speedText;
            }
        }

        // ── Public APIs ──────────────────────────────────────────────────────

        el.setProgress = ({ progress, speed, downloadedBytes, totalBytes, indeterminate, phase } = {}) => {
            if (typeof progress === 'number') _current.progress = progress;
            if (typeof speed === 'string') _current.speed = speed;
            if (typeof downloadedBytes === 'number') _current.downloadedBytes = downloadedBytes;
            if (typeof totalBytes === 'number') _current.totalBytes = totalBytes;
            // MPI-95: phase drives the indeterminate label (Preparing…/Verifying…).
            if (typeof phase === 'string') _current.phase = phase;
            // MPI-95: clear/set the indeterminate sweep when a real total arrives.
            if (typeof indeterminate === 'boolean') {
                _current.indeterminate = indeterminate;
                _applyIndeterminate(indeterminate);
            }

            if (_progressBarInst) {
                // MpiProgressBar has no public setter — update input value + track fill directly.
                // This mirrors the internal updateVisuals() math.
                const pct = Math.round((_current.progress || 0) * 100);
                const input = qs('.mpi-progress__input', _progressBarInst.el);
                const trackFill = qs('.mpi-progress__track-fill', _progressBarInst.el);
                if (input) input.value = pct;
                if (trackFill) trackFill.style.width = `${pct}%`;
            }
            _updateProgressLabel();
        };

        el.setDownloadState = (downloadState) => {
            if (!downloadState) return;
            _current.downloadState = downloadState;
            // 'complete' implies installed for badge rendering
            if (downloadState === 'complete') _current.installed = true;
            // Leaving a download state clears partial-progress flag (caller can set it again)
            if (['downloading', 'paused', 'partial', 'installing'].includes(downloadState)) {
                // keep hasPartialProgress as-is for 'partial'
            } else if (downloadState === 'complete' || downloadState === 'cancelled' || downloadState === 'idle') {
                _current.hasPartialProgress = false;
            }
            _renderState();
        };

        el.destroy = () => {
            for (const fn of _mediaUnsubs) {
                try { fn(); } catch (_) { /* ignore */ }
            }
            _mediaUnsubs.length = 0;
            for (const child of _children) {
                if (typeof child.destroy === 'function') {
                    try { child.destroy(); } catch (_) { /* ignore */ }
                }
            }
            _children.length = 0;
        };

        // Initial render of state-driven bits
        _renderState();
    }
});
