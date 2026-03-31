/**
 * VideoManager.js — Loading, playback, filmstrip, and duration clamping
 */
import { toolState } from './State.js';
import { getLoadableUrl } from '../../toolUtils.js';
import { findClosestRatio, VIDEO_RATIOS, RATIO_ICONS } from '../../ratioUtils.js';
import { UIManager } from './UIManager.js';
import { state } from '../../state.js';
import { loadToolState, saveToolState } from '../../toolState.js';

export class VideoManager {
    /**
     * Loads a video URL into the main video element.
     * @param {string} url - The video URL.
     * @param {boolean} isRestoring - Whether to restore toolState or reset it.
     * @param {Object} callbacks - { onLoaded(isRestoring), onTimelineUpdate() }
     */
    static async loadVideo(url, isRestoring = false, callbacks = {}) {
        if (!url) return;
        const loadableUrl = getLoadableUrl(url);
        const video = toolState.video;

        video.src = loadableUrl;
        video.classList.remove('hide');
        toolState.dropZone.classList.add('hide');
        toolState.cropOverlay.classList.remove('hide');

        video.onloadedmetadata = () => {
            if (!isRestoring) {
                toolState.trimIn = 0;
                toolState.trimOut = 1.0;

                // Smart Ratio Detection
                const matchedRatio = findClosestRatio(video.videoWidth, video.videoHeight, VIDEO_RATIOS);
                if (matchedRatio) {
                    toolState.selectedRatio = matchedRatio.ratio;
                    UIManager.updateRatioUI(matchedRatio);
                }

                state.cropExtractVideoUrl = loadableUrl;
                state.cropExtractTime = 0;
            } else {
                localStorage.setItem('cropExtract_restored', 'true');
            }
            
            if (callbacks.onLoaded) callbacks.onLoaded(isRestoring);
            this.generateFilmstrip();
        };

        video.ontimeupdate = () => {
            if (!toolState.isDraggingSeeker && !toolState.isDraggingHandleIn && !toolState.isDraggingHandleOut) {
                // Hard clamp playback within trim range
                if (video.currentTime < toolState.trimIn * video.duration) video.currentTime = toolState.trimIn * video.duration;
                if (video.currentTime > toolState.trimOut * video.duration) {
                    video.pause();
                    video.currentTime = toolState.trimOut * video.duration;
                }
            }
            state.cropExtractTime = video.currentTime;
            saveToolState('cropExtract', { currentTime: video.currentTime });
            if (callbacks.onTimelineUpdate) callbacks.onTimelineUpdate();
        };
    }

    /**
     * Generates a visual filmstrip preview.
     */
    static generateFilmstrip() {
        const { video, filmstrip } = toolState;
        if (!video.duration || !filmstrip) return;
        filmstrip.innerHTML = '';
        const frameCount = 10;
        const tempVideo = document.createElement('video');
        tempVideo.src = video.src;
        tempVideo.crossOrigin = "anonymous";

        tempVideo.onloadeddata = async () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 160;
            canvas.height = 90;

            for (let i = 0; i < frameCount; i++) {
                const time = (i / frameCount) * tempVideo.duration;
                tempVideo.currentTime = time;
                await new Promise(r => tempVideo.onseeked = r);

                ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                const thumb = document.createElement('div');
                thumb.style.backgroundImage = `url(${canvas.toDataURL('image/jpeg', 0.5)})`;
                filmstrip.appendChild(thumb);
            }
        };
    }
}
