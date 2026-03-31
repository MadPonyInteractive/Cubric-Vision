/**
 * CaptureEngine.js — Frame Extraction Utility for Crop & Extract Tool
 */
export class CaptureEngine {
    /**
     * Captures a specific region of a video frame into a Data URL.
     * 
     * @param {HTMLVideoElement} video - The source video element.
     * @param {Object} cropRect - { x, y, width, height } in percentage (0 to 1).
     * @returns {Promise<string>} - The captured frame as a data URL.
     */
    static async captureFrame(video, cropRect = { x: 0, y: 0, width: 1, height: 1 }) {
        if (!video || video.readyState < 2) {
            throw new Error("Video is not ready for capture.");
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Get actual video dimensions (intrinsic)
        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;

        // Calculate absolute pixel coordinates for the crop
        const sx = cropRect.x * vWidth;
        const sy = cropRect.y * vHeight;
        const sWidth = cropRect.width * vWidth;
        const sHeight = cropRect.height * vHeight;

        // Set canvas to the output size
        canvas.width = sWidth;
        canvas.height = sHeight;

        // Draw the sub-rectangle
        ctx.drawImage(
            video, 
            sx, sy, sWidth, sHeight, // Source sub-rect
            0, 0, sWidth, sHeight    // Destination (fill canvas)
        );

        return canvas.toDataURL('image/png', 1.0);
    }
}
