/**
 * InteractionManager.js — Mouse/Seek interactions for the Crop & Extract tool
 */
import { toolState } from './State.js';
import { saveToolState } from '../../toolState.js';
import { getVideoBounds } from '../../videoUtils.js';

export class InteractionManager {
    /**
     * Handles seeking based on mouse position on the timeline track.
     * @param {MouseEvent} e 
     * @param {'in'|'out'|'playhead'} type 
     * @param {Function} updateUI 
     */
    static handleSeeking(e, type, updateUI) {
        const { video, timelineTrack, SEEK_THROTTLE } = toolState;
        if (!video.duration) return;

        const rect = timelineTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;

        if (type === 'in') {
            toolState.trimIn = Math.min(pct, toolState.trimOut - 0.05);
            video.currentTime = toolState.trimIn * video.duration;
        } else if (type === 'out') {
            toolState.trimOut = Math.max(pct, toolState.trimIn + 0.05);
            video.currentTime = toolState.trimOut * video.duration;
        } else {
            const clampedPct = Math.max(toolState.trimIn, Math.min(pct, toolState.trimOut));
            const now = performance.now();
            if (now - toolState.lastSeekTime > SEEK_THROTTLE) {
                video.currentTime = clampedPct * video.duration;
                toolState.lastSeekTime = now;
            }
        }
        if (updateUI) updateUI();
    }

    /**
     * Initializes a resize operation.
     */
    static startResizing(e, handle) {
        e.stopPropagation();
        toolState.isResizingBox = true;
        toolState.activeHandle = handle;
        toolState.startX = e.clientX;
        toolState.startY = e.clientY;

        const { cropBox } = toolState;
        const getPct = (val, def) => {
            const p = parseFloat(val);
            return isNaN(p) ? def : p;
        };

        toolState.initialRect = {
            left: getPct(cropBox.style.left, 25),
            top: getPct(cropBox.style.top, 25),
            width: getPct(cropBox.style.width, 50),
            height: getPct(cropBox.style.height, 50)
        };

        const { initialRect, activeHandle: h } = toolState;
        if (h === 'br') { initialRect.anchorX = initialRect.left; initialRect.anchorY = initialRect.top; }
        else if (h === 'bl') { initialRect.anchorX = initialRect.left + initialRect.width; initialRect.anchorY = initialRect.top; }
        else if (h === 'tr') { initialRect.anchorX = initialRect.left; initialRect.anchorY = initialRect.top + initialRect.height; }
        else if (h === 'tl') { initialRect.anchorX = initialRect.left + initialRect.width; initialRect.anchorY = initialRect.top + initialRect.height; }

        cropBox.classList.add('active');
    }

    /**
     * Processes ongoing resize interaction.
     */
    static handleResizing(e) {
        const { video, videoContainer, cropBox, initialRect, activeHandle, selectedRatio, MIN_SIZE_PCT } = toolState;
        const containerRect = videoContainer.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        const bounds = getVideoBounds(video, videoContainer);

        let mouseX = ((e.clientX - containerRect.left) / containerWidth) * 100;
        let mouseY = ((e.clientY - containerRect.top) / containerHeight) * 100;

        mouseX = Math.max(0, Math.min(100, mouseX));
        mouseY = Math.max(0, Math.min(100, mouseY));

        let dw = activeHandle.includes('r') ? (mouseX - initialRect.anchorX) : (initialRect.anchorX - mouseX);
        let dh = activeHandle.includes('b') ? (mouseY - initialRect.anchorY) : (initialRect.anchorY - mouseY);

        dw = Math.max(0.1, dw);
        dh = Math.max(0.1, dh);

        const containerAspect = containerWidth / containerHeight;
        const targetRatio = selectedRatio ? (selectedRatio / containerAspect) : null;

        if (targetRatio) {
            const dx = Math.abs(e.clientX - toolState.startX) / containerWidth;
            const dy = Math.abs(e.clientY - toolState.startY) / containerHeight;
            if (dx > dy) dh = dw / targetRatio;
            else dw = dh * targetRatio;
        }

        const maxW = activeHandle.includes('r') ? (bounds.left + bounds.width - initialRect.anchorX) : (initialRect.anchorX - bounds.left);
        const maxH = activeHandle.includes('b') ? (bounds.top + bounds.height - initialRect.anchorY) : (initialRect.anchorY - bounds.top);

        if (dw > maxW + 0.001) { const s = maxW / dw; dw *= s; if (targetRatio) dh *= s; }
        if (dh > maxH + 0.001) { const s = maxH / dh; dh *= s; if (targetRatio) dw *= s; }
        if (dw < MIN_SIZE_PCT) { const s = MIN_SIZE_PCT / dw; dw *= s; if (targetRatio) dh *= s; }

        const newLeft = activeHandle.includes('r') ? initialRect.anchorX : (initialRect.anchorX - dw);
        const newTop = activeHandle.includes('b') ? initialRect.anchorY : (initialRect.anchorY - dh);

        cropBox.style.width = `${dw}%`;
        cropBox.style.height = `${dh}%`;
        cropBox.style.left = `${newLeft}%`;
        cropBox.style.top = `${newTop}%`;
    }

    /**
     * Initializes a drag operation.
     */
    static startDragging(e) {
        if (!toolState.video.src) return;
        toolState.isDraggingBox = true;
        toolState.startX = e.clientX;
        toolState.startY = e.clientY;

        const { cropBox } = toolState;
        const getPct = (val, def) => {
            const p = parseFloat(val);
            return isNaN(p) ? def : p;
        };

        toolState.initialRect = {
            left: getPct(cropBox.style.left, 25),
            top: getPct(cropBox.style.top, 25),
            width: getPct(cropBox.style.width, 50),
            height: getPct(cropBox.style.height, 50)
        };
        cropBox.classList.add('active');
    }

    /**
     * Processes ongoing drag interaction.
     */
    static handleDragging(e) {
        const { video, videoContainer, cropBox, initialRect } = toolState;
        const containerRect = videoContainer.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        const bounds = getVideoBounds(video, videoContainer);

        const dx = ((e.clientX - toolState.startX) / containerWidth) * 100;
        const dy = ((e.clientY - toolState.startY) / containerHeight) * 100;

        let newLeft = initialRect.left + dx;
        let newTop = initialRect.top + dy;

        newLeft = Math.max(bounds.left, Math.min(newLeft, bounds.left + bounds.width - initialRect.width));
        newTop = Math.max(bounds.top, Math.min(newTop, bounds.top + bounds.height - initialRect.height));

        cropBox.style.left = `${newLeft}%`;
        cropBox.style.top = `${newTop}%`;
    }

    /**
     * Resets all interaction flags and saves state.
     */
    static stopInteractions() {
        if (toolState.isDraggingBox || toolState.isResizingBox) {
            saveToolState('cropExtract', {
                left: parseFloat(toolState.cropBox.style.left),
                top: parseFloat(toolState.cropBox.style.top),
                width: parseFloat(toolState.cropBox.style.width),
                height: parseFloat(toolState.cropBox.style.height)
            });
        }
        if (toolState.isDraggingHandleIn || toolState.isDraggingHandleOut) {
            saveToolState('cropExtract', { trimIn: toolState.trimIn, trimOut: toolState.trimOut });
        }
        toolState.isDraggingBox = toolState.isResizingBox = toolState.isDraggingSeeker = toolState.isDraggingHandleIn = toolState.isDraggingHandleOut = false;
        toolState.activeHandle = null;
        if (toolState.cropBox) toolState.cropBox.classList.remove('active');
    }
}
