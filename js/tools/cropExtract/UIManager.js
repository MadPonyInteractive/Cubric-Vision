/**
 * UIManager.js — DOM & Ratio UI Management
 */
import { toolState } from './State.js';
import { VIDEO_RATIOS, RATIO_ICONS } from '../../ratioUtils.js';

export class UIManager {
    /**
     * Binds all DOM elements to the toolState.
     */
    static bindUI() {
        toolState.video = document.getElementById('ce-main-video');
        toolState.dropZone = document.getElementById('ce-drop-zone');
        toolState.cropOverlay = document.getElementById('ce-crop-overlay');
        toolState.cropBox = document.getElementById('ce-crop-box');
        toolState.playhead = document.getElementById('ce-playhead');
        toolState.timelineTrack = document.getElementById('ce-timeline-track');
        toolState.videoContainer = document.getElementById('ce-video-container');
        toolState.filmstrip = document.getElementById('ce-filmstrip');
        toolState.trimRange = document.getElementById('ce-trim-range');

        return {
            handleIn: document.getElementById('ce-handle-in'),
            handleOut: document.getElementById('ce-handle-out'),
            ratioGrid: document.getElementById('ce-ratioGrid'),
            ratioToggleBtn: document.getElementById('ce-ratioToggleBtn'),
            ratioMenu: document.getElementById('ce-ratioMenu'),
            addAssetBtn: document.getElementById('ce-addAssetBtn'),
            playPauseBtn: document.getElementById('ce-play-pause'),
            volume: {
                control: document.getElementById('ce-volume-control'),
                popup:   document.getElementById('ce-volume-popup'),
                slider:  document.getElementById('ce-volume-slider'),
                icon:    document.getElementById('ce-volume-icon'),
            }
        };
    }

    /**
     * Initializes the Ratio Grid with buttons and click handlers.
     * @param {Function} onRatioSelected 
     */
    static initRatioGrid(onRatioSelected) {
        const ratioGrid = document.getElementById('ce-ratioGrid');
        const ratioMenu = document.getElementById('ce-ratioMenu');
        if (!ratioGrid) return;

        ratioGrid.innerHTML = '';
        VIDEO_RATIOS.forEach(r => {
            const btn = document.createElement('div');
            btn.className = 'ratio-item-compact';
            btn.title = r.label;
            btn.innerHTML = `
                <span class="ratio-item-label">${r.label}</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">${RATIO_ICONS[r.icon]}</svg>
            `;
            btn.onclick = (e) => {
                e.stopPropagation();
                onRatioSelected(r);
                ratioMenu.classList.add('hide');
            };
            ratioGrid.appendChild(btn);
        });
    }

    /**
     * Updates the text and icon of the current ratio display.
     * @param {Object} r - The ratio object.
     */
    static updateRatioUI(r) {
        const textSpan = document.getElementById('ce-currentRatioText');
        const iconSvg = document.getElementById('ce-currentRatioIcon');
        if (textSpan) textSpan.textContent = r.label;
        if (iconSvg) iconSvg.innerHTML = RATIO_ICONS[r.icon];
    }
}
