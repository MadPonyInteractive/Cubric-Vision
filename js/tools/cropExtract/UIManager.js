/**
 * UIManager.js — DOM & Ratio UI Management
 */
import { toolState } from './State.js';
import { VIDEO_RATIOS, RATIO_ICONS } from '../../utils/ratios.js';
import { MpiIcon } from '../../components/Primitives/MpiIcon/MpiIcon.js';



export class UIManager {
    /**
     * Binds all DOM elements to the toolState.
     */
    static bindUI() {
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
            ratioMenu: document.getElementById('ce-ratioMenu'),
            // Mount Slots
            slots: {
                dropzone: document.getElementById('ce-dropzone-slot'),
                videoplayer: document.getElementById('ce-videoplayer-slot'),
                addAsset: document.getElementById('ce-add-asset-slot'),
                ratioToggle: document.getElementById('ce-ratio-toggle-slot'),
                volume: document.getElementById('ce-volume-slot'),
                playPause: document.getElementById('ce-play-pause-slot')
            }
        };
    }



    /**
     * Updates the text and icon of the current ratio display.
     * @param {Object} r - The ratio object.
     */
    static updateRatioUI(r) {
        if (!toolState.ratioSelector) return;

        // Update the component's state
        toolState.ratioSelector.props.value = r.label;

        // Hack: Since the factory doesn't expose a full reactive update yet, 
        // we manually find the label element inside the component's trigger.
        const labelEl = toolState.ratioSelector.el.querySelector('.mpi-popup-btn__label');
        if (labelEl) labelEl.textContent = r.label;

        // Also update the icon
        const iconContainer = toolState.ratioSelector.el.querySelector('.mpi-popup-btn__trigger .mpi-icon');
        if (iconContainer) {
            const iconName = r.icon ? r.icon.replace('rect_', 'ratio_') : 'ratio_1_1';
            iconContainer.outerHTML = MpiIcon.template({ name: iconName, size: 'md', stroke: true });
        }
    }




}
