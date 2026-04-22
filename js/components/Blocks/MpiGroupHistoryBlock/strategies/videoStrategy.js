/**
 * videoStrategy — strategy object for video-type groups in MpiGroupHistoryBlock.
 *
 * @param {object} deps
 * @param {object} deps.group         - The ItemGroup
 * @param {object} deps.tools         - { _universalToolIcons, getToolCommands }
 */
export function videoStrategy({ group, tools }) {
    const { _universalToolIcons } = tools;

    return {
        supportsSelection:  () => false,
        supportsPromptBox:  () => false,

        toolsFor() {
            return [
                { mode: 'crop',         icon: 'crop',                              info: 'Crop' },
                { mode: 'videoUpscale', icon: _universalToolIcons.videoUpscale.icon, info: _universalToolIcons.videoUpscale.info },
                { mode: 'interpolate',  icon: _universalToolIcons.interpolate.icon,  info: _universalToolIcons.interpolate.info  },
            ];
        },

        mountViewer(slot, { MpiVideoViewer }) {
            return MpiVideoViewer.mount(slot, {
                fps: 24,
                controls: true,
            });
        },

        loadInitial(viewer, group, currentIdx, { resolveMediaUrl }) {
            const currentItem = group.history[currentIdx];
            if (currentItem?.filePath) {
                const videoMeta = {
                    fps: currentItem.fps || group.fps || 24,
                    duration: currentItem.duration,
                    frameCount: currentItem.frameCount,
                    hasAudio: currentItem.hasAudio,
                };
                viewer.el.loadVideo(resolveMediaUrl(currentItem.filePath), videoMeta);
            }
        },

        loadEntry(viewer, item, idx, { resolveMediaUrl }) {
            const videoMeta = {
                fps: item.fps || group.fps || 24,
                duration: item.duration,
                frameCount: item.frameCount,
                hasAudio: item.hasAudio,
            };
            viewer.el.loadVideo(resolveMediaUrl(item.filePath), videoMeta);
        },

        onGenerationPreview(viewer, { url, group }) {
            const videoMeta = { fps: group.fps || 24 };
            viewer.el.loadVideo(url, videoMeta).catch(() => {});
        },

        onGenerationComplete(viewer, item, currentIdx, { resolveMediaUrl, group }) {
            viewer.el.exitCropMode?.();
            const videoMeta = {
                fps: item.fps || group.fps || 24,
                duration: item.duration,
                frameCount: item.frameCount,
                hasAudio: item.hasAudio,
            };
            viewer.el.loadVideo(resolveMediaUrl(item.filePath), videoMeta);
        },

        onRehydratePreview(viewer, entry, currentIdx, { group }) {
            const videoMeta = { fps: group.fps || 24 };
            viewer.el.loadVideo(entry.latestPreviewUrl, videoMeta).catch(() => {});
        },

        onToolActivate(viewer, mode, { bar }) {
            if (mode === 'crop')         { viewer.el.enterCropMode();        bar.emit('tool:activated', { mode }); }
            else if (mode === 'videoUpscale') { viewer.el.enterUpscaleMode();    bar.emit('tool:activated', { mode }); }
            else if (mode === 'interpolate')  { viewer.el.enterInterpolateMode(); bar.emit('tool:activated', { mode }); }
        },

        onToolDeactivate(viewer, mode, { bar }) {
            if (mode === 'crop')         viewer.el.exitCropMode();
            else if (mode === 'videoUpscale') viewer.el.exitUpscaleMode();
            else if (mode === 'interpolate')  viewer.el.exitInterpolateMode();
            bar.emit('tool:deactivated', { mode });
        },

        onSelectionChanged(viewer, historyTools) {
            historyTools.el.syncMode('none');
        },

        onSelectionExited() {},
        onSelectionDelete() {},
    };
}
