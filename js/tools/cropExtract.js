import { MpiVideoPlayer } from '../components/Blocks/MpiVideoPlayer/MpiVideoPlayer.js';
import { MpiMediaDropzone } from '../components/Primitives/MpiMediaDropzone/MpiMediaDropzone.js';
import { MpiVolumeControl } from '../components/Compounds/MpiVolumeControl/MpiVolumeControl.js';
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../components/Primitives/MpiIcon/MpiIcon.js';
import { MpiRatioSelector } from '../components/Compounds/MpiRatioSelector/MpiRatioSelector.js';
import { Events } from '../events.js';



import { state } from '../state.js';
import { loadToolState, saveToolState } from '../toolState.js';
import { uploadMediaToProject, getLoadableUrl } from '../toolUtils.js';
import { VIDEO_RATIOS } from '../ratioUtils.js';
import { handleSnapshot } from '../videoUtils.js';
import { formatTime } from '../utils/string.js';
import { qs, on } from '../utils/dom.js';

// Sub-Modules
import { toolState } from './cropExtract/State.js';
import { UIManager } from './cropExtract/UIManager.js';
import { VideoManager } from './cropExtract/VideoManager.js';
import { InteractionManager } from './cropExtract/InteractionManager.js';
import { CropManager } from './cropExtract/CropManager.js';
import { ExtractionManager } from './cropExtract/ExtractionManager.js';

/**
 * Initializes the Crop & Extract tool.
 */
export function initCropExtract() {
    console.log("[cropExtract] Initializing Factory Facade...");

    const ui = UIManager.bindUI();

    // 1. Mount Components
    mountComponents(ui.slots);

    // 2. Restore State
    const savedState = loadToolState('cropExtract');
    const savedUrl = state.cropExtractVideoUrl || savedState?.videoUrl;
    
    if (savedUrl) {
        VideoManager.loadVideo(savedUrl, true, { onLoaded: onVideoLoaded, onTimelineUpdate: updateTimelineUI });
        if (state.cropExtractTime) toolState.video.currentTime = state.cropExtractTime;
        else if (savedState?.currentTime) toolState.video.currentTime = savedState.currentTime;
        
        if (savedState?.trimIn !== undefined) toolState.trimIn = savedState.trimIn;
        if (savedState?.trimOut !== undefined) toolState.trimOut = savedState.trimOut;
    }

    // Ratio Restoration
    const currentRatio = state.cropExtractRatio || savedState?.selectedRatio;
    if (currentRatio && toolState.ratioSelector) {
        const r = VIDEO_RATIOS.find(v => Math.abs(v.ratio - currentRatio) < 0.01);
        if (r) {
            toolState.ratioSelector.props.value = r.label;
            CropManager.setRatio(r);
        }
    }

    // 3. Global Listeners


    on(window, 'mousemove', (e) => {
        if (toolState.isDraggingBox) InteractionManager.handleDragging(e);
        if (toolState.isResizingBox) InteractionManager.handleResizing(e);
        if (toolState.isDraggingSeeker) InteractionManager.handleSeeking(e, 'playhead', updateTimelineUI);
        if (toolState.isDraggingHandleIn) InteractionManager.handleSeeking(e, 'in', updateTimelineUI);
        if (toolState.isDraggingHandleOut) InteractionManager.handleSeeking(e, 'out', updateTimelineUI);
    });

    on(window, 'mouseup', () => InteractionManager.stopInteractions());

    // 4. Custom Interaction Logic
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

    toolState.cropBox.onmousedown = (e) => {
        e.preventDefault();
        const handle = e.target.closest('.crop-handle');
        if (handle) InteractionManager.startResizing(e, handle.dataset.handle);
        else InteractionManager.startDragging(e);
    };

    ui.handleIn.onmousedown = (e) => { e.stopPropagation(); toolState.isDraggingHandleIn = true; };
    ui.handleOut.onmousedown = (e) => { e.stopPropagation(); toolState.isDraggingHandleOut = true; };

    toolState.timelineTrack.onmousedown = (e) => {
        toolState.isDraggingSeeker = true;
        InteractionManager.handleSeeking(e, 'playhead', updateTimelineUI);
    };
}

/**
 * Mounts all factory components into their respective slots.
 */
function mountComponents(slots) {
    // 1. Dropzone
    toolState.dropZone = MpiMediaDropzone.mount(slots.dropzone, {
        title: 'Video Source',
        text: 'Drop Video or Click to Browse',
        mediaType: ['video'],
        icon: 'video'
    });
    toolState.dropZone.on('click', () => openAssetBrowser());
    toolState.dropZone.on('drop', (data) => handleFileUpload(data.file));

    // 2. Video Player
    toolState.videoPlayer = MpiVideoPlayer.mount(slots.videoplayer, {
        controls: false, // We use custom tool-specific trimmer controls
        volume: state.cropExtractVolume ?? 1.0,
        muted: state.cropExtractMuted ?? false
    });
    toolState.video = toolState.videoPlayer.el.querySelector('video');

    // 3. Toolbar Components
    toolState.addAssetBtn = MpiButton.mount(slots.addAsset, {
        icon: 'plus',
        variant: 'secondary',
        size: 'sm',
        info: 'Add Media'
    });
    toolState.addAssetBtn.on('click', () => openAssetBrowser());

    toolState.ratioSelector = MpiRatioSelector.mount(slots.ratioToggle, {
        modelType: 'video',
        value: '16:9'
    });
    toolState.ratioSelector.on('change', (r) => CropManager.setRatio(r));



    toolState.playPauseBtn = MpiButton.mount(slots.playPause, {
        icon: 'play',
        iconActive: 'pause',
        size: 'md',
        info: 'Play/Pause'
    });
    toolState.playPauseBtn.on('click', () => {
        const video = toolState.video;
        if (video.paused) video.play(); else video.pause();
    });

    toolState.volumeControl = MpiVolumeControl.mount(slots.volume, {
        volume: state.cropExtractVolume ?? 1.0,
        muted: state.cropExtractMuted ?? false
    });
    toolState.volumeControl.on('change', ({ volume, muted }) => {
        const video = toolState.video;
        if (video) {
            video.volume = volume;
            video.muted = muted;
            state.cropExtractVolume = volume;
            state.cropExtractMuted = muted;
            saveToolState('cropExtract', { volume, muted });
        }
    });

    // Handle play/pause state syncing
    on(toolState.video, 'play', () => toolState.playPauseBtn.el.classList.add('is-active'));
    on(toolState.video, 'pause', () => toolState.playPauseBtn.el.classList.remove('is-active'));
}

/**
 * Logic for opening the asset browser.
 */
async function openAssetBrowser() {
    const { openAssetBrowser: launchModal } = await import('../components/assetBrowserModal.js');
    launchModal((asset) => {
        VideoManager.loadVideo(asset.url, false, { onLoaded: onVideoLoaded, onTimelineUpdate: updateTimelineUI });
    }, { type: 'video' });
}

/**
 * Handles video file uploads.
 */
async function handleFileUpload(file) {
    if (file.type.startsWith('video/')) {
        const res = await uploadMediaToProject(file, 'crop');
        if (res?.filePath) {
            VideoManager.loadVideo(getLoadableUrl(res.filePath), false, { 
                onLoaded: onVideoLoaded, 
                onTimelineUpdate: updateTimelineUI 
            });
            Events.emit('media:updated', { projectId: state.currentProject?.id });
        }
    }
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
    
    const displayTotal = qs('#ce-time-total');
    if (displayTotal) {
        displayTotal.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
}


