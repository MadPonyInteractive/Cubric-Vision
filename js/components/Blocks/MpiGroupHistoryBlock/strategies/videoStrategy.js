/**
 * videoStrategy — strategy object for video-type groups in MpiGroupHistoryBlock.
 *
 * @param {object} deps
 * @param {object} deps.group         - The ItemGroup
 * @param {object} deps.tools         - { _universalToolIcons, getToolCommands }
 */
import { MpiToolActionBar } from '../../../Compounds/MpiToolActionBar/MpiToolActionBar.js';
import { MpiOptionSelector } from '../../../Compounds/MpiOptionSelector/MpiOptionSelector.js';
import { MpiDropdown } from '../../../Primitives/MpiDropdown/MpiDropdown.js';

export function videoStrategy({ group, tools }) {
    const { _universalToolIcons } = tools;

    return {
        supportsSelection:  () => true,
        supportsPromptBox:  () => false,

        toolsFor() {
            return [
                { mode: 'crop',         icon: 'crop',                                info: 'Crop' },
                { mode: 'videoUpscale', icon: _universalToolIcons.videoUpscale.icon, info: 'Video Upscale' },
                { mode: 'interpolate',  icon: _universalToolIcons.interpolate.icon,  info: 'Interpolate' },
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
            if (mode === 'crop')              { viewer.el.enterCropMode();        bar.emit('tool:activated', { mode }); }
            else if (mode === 'videoUpscale') { viewer.el.enterUpscaleMode();     bar.emit('tool:activated', { mode }); }
            else if (mode === 'interpolate')  { viewer.el.enterInterpolateMode(); bar.emit('tool:activated', { mode }); }
        },

        onToolDeactivate(viewer, mode) {
            if (mode === 'crop')              viewer.el.exitCropMode?.();
            else if (mode === 'videoUpscale') viewer.el.exitUpscaleMode?.();
            else if (mode === 'interpolate')  viewer.el.exitInterpolateMode?.();
        },

        onSelectionChanged(viewer, historyTools) {
            historyTools.el.syncMode('none');
        },

        onSelectionExited() {},
        onSelectionDelete() {},

        /**
         * Build the props-bar UI for a given tool into `slot`.
         * Returns `{ destroy }` or `null` if tool has no props bar.
         *
         * ctx (live refs — never snapshots):
         *  - viewer, bar, historyTools, state, loadAssets
         *  - handlers: runVideoTool(op, params), handleCropSnapshot(), handleCropSaveVideo()
         *  - SOCIAL_RATIOS, universalToolIcons
         */
        mountPropsBar(tool, slot, ctx) {
            if (tool === 'crop') return _mountCropBar(slot, ctx);
            if (tool === 'videoUpscale') return _mountUpscaleBar(slot, ctx);
            if (tool === 'interpolate') return _mountInterpolateBar(slot, ctx);
            return null;
        },
    };
}

function _mountCropBar(slot, { viewer, bar, historyTools, SOCIAL_RATIOS, handleCropSnapshot, handleCropSaveVideo }) {
    const ratioSel = MpiOptionSelector.mount(document.createElement('div'), {
        variant: 'ratio',
        modelType: 'social',
        value: SOCIAL_RATIOS[0].label,
    });

    const actionBar = MpiToolActionBar.mount(slot, {
        inline: true,
        leftSlot: ratioSel,
        actions: [
            { key: 'snapshot', icon: 'camera', label: 'Snapshot', variant: 'ghost',   size: 'sm', info: 'Save current frame as image' },
            { key: 'apply',    icon: 'check',  label: 'Save',     variant: 'primary', size: 'sm', info: 'Encode cropped region to new video' },
        ],
    });

    const _onRatio = ({ ratio }) => viewer.el.setCropRatio?.(ratio);
    ratioSel.on('change', _onRatio);

    const _onAction = ({ key }) => {
        if (key === 'snapshot') handleCropSnapshot();
        else if (key === 'apply') handleCropSaveVideo();
    };
    actionBar.on('action', _onAction);
    actionBar.el.show();

    return {
        destroy() {
            actionBar.destroy?.();
            ratioSel.destroy?.();
        },
    };
}

function _mountUpscaleBar(slot, { bar, historyTools, state, loadAssets, runVideoTool, universalToolIcons }) {
    const factorSel = MpiOptionSelector.mount(document.createElement('div'), {
        variant: 'number',
        values: ['x1.5', 'x2', 'x3', 'x4'],
        value: 'x2',
        popupTitle: 'FACTOR',
        info: 'Upscale factor',
    });

    const modelSlot = document.createElement('div');
    let modelDd = null;
    let modelValue = '';

    const _mountModelDd = () => {
        modelSlot.innerHTML = '';
        const opts = (state.upscaleModels || []).map(f => ({ label: f, value: f }));
        modelDd = MpiDropdown.mount(modelSlot, {
            options: opts,
            value: opts[0]?.value ?? '',
            direction: 'up',
            info: 'Upscale model',
        });
        modelValue = opts[0]?.value ?? '';
        modelDd.on('change', ({ value }) => { modelValue = value; });
    };

    if (state.upscaleModels?.length) _mountModelDd();
    else loadAssets().then(() => _mountModelDd());

    const leftSlotEl = document.createElement('div');
    leftSlotEl.style.display = 'flex';
    leftSlotEl.style.gap = 'var(--space-2, 0.5rem)';
    leftSlotEl.style.alignItems = 'center';
    leftSlotEl.style.flexWrap = 'wrap';
    leftSlotEl.appendChild(factorSel.el);
    leftSlotEl.appendChild(modelSlot);

    const actionBar = MpiToolActionBar.mount(slot, {
        inline: true,
        leftSlot: { el: leftSlotEl },
        actions: [
            { key: 'run', icon: universalToolIcons.videoUpscale.icon, label: 'Upscale', variant: 'primary', size: 'sm', info: 'Run video upscale' },
        ],
    });

    const _onAction = ({ key }) => {
        if (key !== 'run') return;
        const factorStr = factorSel.el.getValue?.() ?? 'x2';
        const factor = parseFloat(factorStr.replace('x', '')) || 2;
        const injectionParams = { Upscale_Factor: factor };
        if (modelValue) injectionParams.Upscale_Model = modelValue;
        runVideoTool('videoUpscale', injectionParams);
    };
    actionBar.on('action', _onAction);
    actionBar.el.show();

    return {
        destroy() {
            actionBar.destroy?.();
            factorSel.destroy?.();
            modelDd?.destroy?.();
        },
    };
}

function _mountInterpolateBar(slot, { bar, historyTools, runVideoTool, universalToolIcons }) {
    const multSel = MpiOptionSelector.mount(document.createElement('div'), {
        variant: 'number',
        values: ['x2', 'x3', 'x4'],
        value: 'x2',
        popupTitle: 'MULTIPLIER',
        info: 'Frame multiplier',
    });

    const actionBar = MpiToolActionBar.mount(slot, {
        inline: true,
        leftSlot: multSel,
        actions: [
            { key: 'run', icon: universalToolIcons.interpolate.icon, label: 'Interpolate', variant: 'primary', size: 'sm', info: 'Run frame interpolation' },
        ],
    });

    const _onAction = ({ key }) => {
        if (key !== 'run') return;
        const multStr = multSel.el.getValue?.() ?? 'x2';
        const multiplier = parseFloat(multStr.replace('x', '')) || 2;
        runVideoTool('interpolate', { Interp_Multiplier: multiplier });
    };
    actionBar.on('action', _onAction);
    actionBar.el.show();

    return {
        destroy() {
            actionBar.destroy?.();
            multSel.destroy?.();
        },
    };
}
