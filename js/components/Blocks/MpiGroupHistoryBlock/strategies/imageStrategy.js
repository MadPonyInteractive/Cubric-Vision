/**
 * imageStrategy — strategy object for image-type groups in MpiGroupHistoryBlock.
 *
 * @param {object} deps
 * @param {object} deps.group         - The ItemGroup
 * @param {object} deps.tools         - { _universalToolIcons, getToolCommands }
 */
export function imageStrategy({ group, tools }) {
    const { _universalToolIcons, getToolCommands } = tools;

    const _universalTools = getToolCommands('image')
        .filter(c => ['autoMaskImg'].includes(c.key))
        .map(({ key, label }) => ({
            mode: key,
            icon: _universalToolIcons[key]?.icon ?? 'settings',
            info: _universalToolIcons[key]?.info ?? label,
        }));

    return {
        supportsSelection:  () => true,
        supportsPromptBox:  () => true,

        toolsFor() {
            return [
                { mode: 'crop', icon: 'crop', info: 'Crop' },
                { mode: 'mask', icon: 'edit', info: 'Draw Mask' },
                ..._universalTools,
            ];
        },

        mountViewer(slot, { resolveMediaUrl, MpiCanvasViewer, currentItem, currentIdx }) {
            return MpiCanvasViewer.mount(slot, {
                initialImageUrl: resolveMediaUrl(currentItem?.filePath),
                initialIdx: currentIdx,
            });
        },

        loadInitial(viewer, group, currentIdx, { resolveMediaUrl }) {
            viewer.el.loadEntry(group.history[currentIdx], currentIdx);
        },

        loadEntry(viewer, item, idx, { resolveMediaUrl }) {
            viewer.el.loadEntry(item, idx);
            viewer.el.setMaskHidden(false);
        },

        onGenerationPreview(viewer, { url, currentIdx }) {
            viewer.el.isComparisonMode = false;
            if (url?.startsWith('blob:')) viewer.el.setMaskHidden(true);
            viewer.el.loadEntry({ filePath: url }, currentIdx).catch(() => {});
        },

        onGenerationComplete(viewer, item, currentIdx, { resolveMediaUrl }) {
            viewer.el.exitMode?.();
            viewer.el.loadEntry(item, currentIdx);
            viewer.el.setMaskHidden(false);
        },

        onRehydratePreview(viewer, entry, currentIdx) {
            viewer.el.isComparisonMode = false;
            if (entry.latestPreviewUrl.startsWith('blob:')) viewer.el.setMaskHidden(true);
            viewer.el.loadEntry({ filePath: entry.latestPreviewUrl }, currentIdx).catch(() => {});
        },

        onToolActivate(viewer, mode) {
            viewer.el.enterMode(mode);
        },

        onToolDeactivate(viewer, mode) {
            viewer.el.exitMode();
        },

        onSelectionChanged(viewer, historyTools) {
            viewer.el.exitMode();
        },

        onSelectionExited(viewer) {
            viewer.el.clearCompare();
        },

        onSelectionDelete(viewer, group, currentIdx) {
            if (group.history[currentIdx]) {
                viewer.el.loadEntry(group.history[currentIdx], currentIdx);
            }
        },
    };
}
