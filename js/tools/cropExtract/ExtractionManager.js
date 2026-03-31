/**
 * ExtractionManager.js — Handling server-side clip extraction
 */
import { toolState } from './State.js';
import { state } from '../../state.js';

export class ExtractionManager {
    /**
     * Sends the extraction request to the server.
     * @param {boolean} saveToLibrary 
     * @returns {Promise<string|null>} 
     */
    static async extractClip(saveToLibrary = true) {
        const { video, trimIn, trimOut, cropBox } = toolState;
        if (!video.src || !state.currentProject) return null;

        const payload = {
            projectId: state.currentProject.id,
            folderPath: state.currentProject.folderPath,
            sourceUrl: video.src,
            startTime: trimIn * video.duration,
            duration: (trimOut - trimIn) * video.duration,
            saveToLibrary: saveToLibrary,
            crop: {
                x: parseFloat(cropBox.style.left) / 100,
                y: parseFloat(cropBox.style.top) / 100,
                width: parseFloat(cropBox.style.width) / 100,
                height: parseFloat(cropBox.style.height) / 100
            }
        };

        try {
            const res = await fetch(`/project-media/${state.currentProject.id}/extract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                if (saveToLibrary) {
                    document.dispatchEvent(new CustomEvent('media:updated'));
                }
                return data.filePath;
            }
        } catch (err) {
            console.error("Extraction failed:", err);
        }
        return null;
    }
}
