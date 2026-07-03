/**
 * ComparisonManager.js
 * Manages comparison state and split-slider logic for image+video pairs.
 */
export class ComparisonManager {
    constructor() {
        this.imgAfter = new Image();
        this.imgAfter.crossOrigin = "anonymous";
        this.afterKind = 'image';
        this.afterFps  = 24;
        this.isComparisonMode = false;
        this.sliderPos = 0.5;
        this.isDraggingSlider = false;
    }

    /** Native pixel width of the "after" media (image or video). */
    get afterWidth() {
        const m = this.imgAfter;
        if (!m) return 0;
        return m.videoWidth || m.naturalWidth || m.width || 0;
    }

    /** Native pixel height of the "after" media (image or video). */
    get afterHeight() {
        const m = this.imgAfter;
        if (!m) return 0;
        return m.videoHeight || m.naturalHeight || m.height || 0;
    }

    /** Load an image as the "after" media. */
    async load(url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (err) => reject(err);
            img.src = url;
        });
        this.imgAfter = img;
        this.afterKind = 'image';
        this.afterFps  = 24;
        this.isComparisonMode = true;
    }

    /** Load a video as the "after" media. fps from sidecar item.fps. */
    async loadVideo(url, fps = 24) {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.muted = true;
        v.loop = false; // loop handled by ComparisonPlayback (pair-synced)
        v.playsInline = true;
        v.preload = 'auto';
        v.src = url;
        // Wait for first frame decoded — drawImage(video) is transparent until loadeddata.
        await new Promise((resolve, reject) => {
            const onData = () => { cleanup(); resolve(); };
            const onErr  = () => { cleanup(); reject(new Error(`Video failed to load: ${url}`)); };
            const cleanup = () => {
                v.removeEventListener('loadeddata', onData);
                v.removeEventListener('error', onErr);
            };
            v.addEventListener('loadeddata', onData);
            v.addEventListener('error', onErr);
        });
        // Nudge to t=0 so first frame is committed for paint (Chromium sometimes
        // needs an explicit seek before drawImage reads a non-blank frame).
        try { v.currentTime = 0; } catch (_) {}
        this.imgAfter = v;
        this.afterKind = 'video';
        this.afterFps  = fps > 0 ? fps : 24;
        this.isComparisonMode = true;
    }

    /**
     * @param {number} screenX - Horizontal cursor position in container (screen) px.
     * @param {number} screenW - Container width in px.
     */
    isOverSlider(screenX, screenW) {
        if (!this.isComparisonMode) return false;
        const barX = this.sliderPos * screenW;
        return Math.abs(screenX - barX) < 20;
    }

    updateSlider(screenX, screenW) {
        if (this.isDraggingSlider) {
            this.sliderPos = Math.max(0, Math.min(1, screenX / screenW));
            return true;
        }
        return false;
    }

    destroy() {
        if (!this.imgAfter) return;
        if (this.afterKind === 'video' && this.imgAfter.pause) {
            try { this.imgAfter.pause(); } catch (_) {}
            this.imgAfter.removeAttribute('src');
            try { this.imgAfter.load(); } catch (_) {}
        }
        if (this.imgAfter instanceof ImageBitmap) this.imgAfter.close();
        this.imgAfter = null;
    }
}
