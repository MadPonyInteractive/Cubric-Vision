/**
 * cropExtract.js — Optimized Facade for Crop & Extract Video Tool
 */
import { state } from '../state.js';
import { VIDEO_RATIOS, findClosestRatio } from '../ratioUtils.js';
import { loadToolState, saveToolState } from '../toolState.js';
import { uploadMediaToProject, getLoadableUrl } from '../toolUtils.js';
import { openAssetBrowser } from '../components/assetBrowserModal.js';
import { formatTime, bindPlayPause } from '../components/videoPlayerCore.js';
import { VolumeControl } from '../components/VolumeControl.js';
import { handleSnapshot } from '../videoUtils.js';

// Sub-Modules
import { toolState } from './cropExtract/State.js';
import { UIManager } from './cropExtract/UIManager.js';
import { VideoManager } from './cropExtract/VideoManager.js';
import { InteractionManager } from './cropExtract/InteractionManager.js';
import { CropManager } from './cropExtract/CropManager.js';
import { ExtractionManager } from './cropExtract/ExtractionManager.js';

/**
 * Initializes the Crop & Extract tool.
 * Preserves the original public API.
 */
export function initCropExtract() {
    console.log("[cropExtract] Initializing Modular Facade...");

    const els = UIManager.bindUI();

    // Restore Global State
    const savedState = loadToolState('cropExtract');
    if (state.cropExtractVideoUrl) {
        VideoManager.loadVideo(state.cropExtractVideoUrl, true, { onLoaded: onVideoLoaded, onTimelineUpdate: updateTimelineUI });
        if (state.cropExtractTime) toolState.video.currentTime = state.cropExtractTime;
    } else if (savedState) {
        if (savedState.videoUrl) VideoManager.loadVideo(savedState.videoUrl, true, { onLoaded: onVideoLoaded, onTimelineUpdate: updateTimelineUI });
        if (savedState.currentTime) toolState.video.currentTime = savedState.currentTime;
        if (savedState.trimIn !== undefined) toolState.trimIn = savedState.trimIn;
        if (savedState.trimOut !== undefined) toolState.trimOut = savedState.trimOut;
    }

    // Ratio Restoration (Session State > LocalStorage)
    const currentRatio = state.cropExtractRatio || savedState?.selectedRatio;
    if (currentRatio) {
        const r = VIDEO_RATIOS.find(v => Math.abs(v.ratio - currentRatio) < 0.01);
        if (r) CropManager.setRatio(r);
    }

    // UI Setup
    UIManager.initRatioGrid((r) => CropManager.setRatio(r));

    if (els.ratioToggleBtn) {
        els.ratioToggleBtn.onclick = (e) => {
            e.stopPropagation();
            els.ratioMenu.classList.toggle('hide');
        };
    }

    window.addEventListener('click', () => {
        if (els.ratioMenu && !els.ratioMenu.classList.contains('hide')) els.ratioMenu.classList.add('hide');
    });

    // Asset Selection
    toolState.dropZone.addEventListener('click', () => {
        openAssetBrowser((asset) => { VideoManager.loadVideo(asset.url, false, { onLoaded: onVideoLoaded, onTimelineUpdate: updateTimelineUI }); }, { type: 'video' });
    });

    els.addAssetBtn?.addEventListener('click', () => {
        openAssetBrowser((asset) => { VideoManager.loadVideo(asset.url, false, { onLoaded: onVideoLoaded, onTimelineUpdate: updateTimelineUI }); }, { type: 'video' });
    });

    toolState.videoContainer.addEventListener('dragover', (e) => { e.preventDefault(); toolState.videoContainer.classList.add('dragover'); });
    toolState.videoContainer.addEventListener('dragleave', () => toolState.videoContainer.classList.remove('dragover'));
    toolState.videoContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        toolState.videoContainer.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('video/')) {
                const res = await uploadMediaToProject(file, 'crop');
                if (res?.filePath) VideoManager.loadVideo(getLoadableUrl(res.filePath), false, { onLoaded: onVideoLoaded, onTimelineUpdate: updateTimelineUI });
            }
        }
    });

    toolState.videoContainer.oncontextmenu = (e) => {
        e.preventDefault();
        const cropRect = {
            x: (parseFloat(toolState.cropBox.style.left) || 25) / 100,
            y: (parseFloat(toolState.cropBox.style.top) || 25) / 100,
            width: (parseFloat(toolState.cropBox.style.width) || 50) / 100,
            height: (parseFloat(toolState.cropBox.style.height) || 50) / 100
        };
        handleSnapshot(e, toolState.video, cropRect, {
            onExtract: (saveToLibrary) => ExtractionManager.extractClip(saveToLibrary)
        });
    };

    // Interaction Hooks
    toolState.cropBox.onmousedown = (e) => {
        e.preventDefault();
        const handle = e.target.closest('.crop-handle');
        if (handle) InteractionManager.startResizing(e, handle.dataset.handle);
        else InteractionManager.startDragging(e);
    };

    els.handleIn.onmousedown = (e) => { e.stopPropagation(); toolState.isDraggingHandleIn = true; };
    els.handleOut.onmousedown = (e) => { e.stopPropagation(); toolState.isDraggingHandleOut = true; };

    window.addEventListener('mousemove', (e) => {
        if (toolState.isDraggingBox) InteractionManager.handleDragging(e);
        if (toolState.isResizingBox) InteractionManager.handleResizing(e);
        if (toolState.isDraggingSeeker) InteractionManager.handleSeeking(e, 'playhead', updateTimelineUI);
        if (toolState.isDraggingHandleIn) InteractionManager.handleSeeking(e, 'in', updateTimelineUI);
        if (toolState.isDraggingHandleOut) InteractionManager.handleSeeking(e, 'out', updateTimelineUI);
    });

    window.addEventListener('mouseup', () => InteractionManager.stopInteractions());

    // Playback Components
    bindPlayPause(toolState.video, els.playPauseBtn);
    
    // Volume/Mute Persistence
    const vol = state.cropExtractVolume !== undefined ? state.cropExtractVolume : (savedState?.volume ?? 1.0);
    const muted = state.cropExtractMuted !== undefined ? state.cropExtractMuted : (!!savedState?.muted);
    
    toolState.video.volume = vol;
    toolState.video.muted = muted;

    // Use Unified VolumeControl component
    els.volume.popup.innerHTML = '';
    els.volume.icon.innerHTML = '';

    new VolumeControl(els.volume, {
        volume: vol,
        muted: muted,
        showValue: false,
        onChange: (v, m) => {
            toolState.video.volume = v;
            toolState.video.muted = m;
            state.cropExtractVolume = v;
            state.cropExtractMuted = m;
            saveToolState('cropExtract', { volume: v, muted: m });
        }
    });

    toolState.timelineTrack.onmousedown = (e) => {
        toolState.isDraggingSeeker = true;
        InteractionManager.handleSeeking(e, 'playhead', updateTimelineUI);
    };
}

/** ── LOCAL CALLBACKS ── **/

function onVideoLoaded(isRestoring) {
    requestAnimationFrame(() => {
        if (!isRestoring) {
            CropManager.resetCropBox();
        } else {
            const saved = loadToolState('cropExtract');
            const currentRatio = state.cropExtractRatio || saved?.selectedRatio;
            
            if (currentRatio) {
                const r = VIDEO_RATIOS.find(v => Math.abs(v.ratio - currentRatio) < 0.01);
                if (r) {
                    toolState.selectedRatio = r.ratio;
                    UIManager.updateRatioUI(r);
                }
            }

            if (saved?.width) {
                toolState.cropBox.style.left = `${saved.left}%`;
                toolState.cropBox.style.top = `${saved.top}%`;
                toolState.cropBox.style.width = `${saved.width}%`;
                toolState.cropBox.style.height = `${saved.height}%`;
            } else {
                CropManager.resetCropBox();
            }
        }
        updateTimelineUI();
    });
}

function updateTimelineUI() {
    const video = toolState.video;
    if (!video || !video.duration) return;
    
    const playPct = (video.currentTime / video.duration) * 100;
    toolState.playhead.style.left = `${playPct}%`;
    toolState.trimRange.style.left = `${toolState.trimIn * 100}%`;
    toolState.trimRange.style.width = `${(toolState.trimOut - toolState.trimIn) * 100}%`;
    
    const displayTotal = document.getElementById('ce-time-total');
    if (displayTotal) {
        displayTotal.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
}

