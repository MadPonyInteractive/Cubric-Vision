/**
 * MpiToolOptionsPrompt — Organism: tool-options panel for video-history prompt mode.
 *
 * Mounted by MpiGroupHistoryBlock mediator into #right-top-slot when the
 * active tool = 'prompt' AND the workspace is video AND the active model
 * supports I2V. Renders two frame thumb slots (Start / End) + a swap button
 * between them and two action buttons (Extend / Create new) below.
 *
 * Thumbnails mirror PromptBox `_mediaItems` via the `media-change` event.
 * Drop on a thumb uploads via the shared upload helper and role-tags the
 * inject. Click `x` on a filled thumb removes by role. Swap flips role tags
 * in place.
 *
 * Props:
 * @param {Object} promptBox - Live MpiPromptBox instance handle (mount return)
 * @param {Object} project   - Current project { id, folderPath } for uploads
 *
 * Emits (via Events bus, not instance):
 *   'prompt-box-tools:extend'
 *   'prompt-box-tools:create-new'
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../events.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs, on } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';

export const MpiToolOptionsPrompt = ComponentFactory.create({
    name: 'MpiToolOptionsPrompt',
    css: ['js/components/Organisms/MpiToolOptionsPrompt/MpiToolOptionsPrompt.css'],

    template: () => `
        <div class="mpi-tool-options-prompt">
            <div class="mpi-tool-options-prompt__frames">
                <div class="mpi-tool-options-prompt__slot mpi-tool-options-prompt__slot--start" data-role="startFrame">
                    <div class="mpi-tool-options-prompt__label">Start frame</div>
                    <div class="mpi-tool-options-prompt__thumb" id="thumb-start"></div>
                </div>
                <button type="button" class="mpi-tool-options-prompt__swap" id="swap-btn" title="Swap start/end frames">
                    ${renderIcon('swap', 'sm')}
                </button>
                <div class="mpi-tool-options-prompt__slot mpi-tool-options-prompt__slot--end" data-role="endFrame">
                    <div class="mpi-tool-options-prompt__label">End frame</div>
                    <div class="mpi-tool-options-prompt__thumb" id="thumb-end"></div>
                </div>
            </div>
            <div class="mpi-tool-options-prompt__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, _emit) => {
        const { promptBox, project } = props || {};
        if (!promptBox?.el) {
            clientLogger.warn('MpiToolOptionsPrompt', 'Missing promptBox prop — toolbar will be inert');
        }

        const _unsubs = [];
        const _children = [];

        const thumbStart = qs('#thumb-start', el);
        const thumbEnd   = qs('#thumb-end',   el);
        const swapBtn    = qs('#swap-btn',    el);
        const actionsEl  = qs('#actions-slot', el);

        // ── Render a thumb slot from a role-mapped item (or empty) ───────────
        function _renderThumb(slotEl, item) {
            slotEl.innerHTML = '';
            slotEl.classList.toggle('mpi-tool-options-prompt__thumb--filled', !!item);
            if (!item) return;
            const role = slotEl.id === 'thumb-start' ? 'startFrame' : 'endFrame';
            slotEl.innerHTML = `
                <img class="mpi-tool-options-prompt__thumb-img" src="${item.url}" alt="" draggable="false">
                <button type="button" class="mpi-tool-options-prompt__thumb-clear" title="Remove">
                    ${renderIcon('close', 'xs')}
                </button>
            `;
            const clearBtn = qs('.mpi-tool-options-prompt__thumb-clear', slotEl);
            const off = on(clearBtn, 'click', (e) => {
                e.stopPropagation();
                promptBox?.el?.removeMediaByRole?.(role);
            });
            // Track per-render listener; replaced on next _renderThumb call
            // because innerHTML wipe drops the node anyway. Pushing into
            // _unsubs is safe (off() becomes a no-op on dropped node).
            _unsubs.push(off);
        }

        function _refreshFromPromptBox() {
            const startItem = promptBox?.el?.getMediaByRole?.('startFrame');
            const endItem   = promptBox?.el?.getMediaByRole?.('endFrame');
            _renderThumb(thumbStart, startItem);
            _renderThumb(thumbEnd,   endItem);
        }

        // Initial paint from current PromptBox state.
        _refreshFromPromptBox();

        // Subscribe to PromptBox media-change for live mirror.
        if (promptBox?.on) {
            _unsubs.push(promptBox.on('media-change', _refreshFromPromptBox));
        }

        // ── Drop handlers per slot ───────────────────────────────────────────
        function _attachDrop(slotEl, role) {
            const offOver = on(slotEl, 'dragover', (e) => {
                e.preventDefault();
                slotEl.classList.add('mpi-tool-options-prompt__slot--drag-over');
            });
            const offLeave = on(slotEl, 'dragleave', () => {
                slotEl.classList.remove('mpi-tool-options-prompt__slot--drag-over');
            });
            const offDrop = on(slotEl, 'drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                slotEl.classList.remove('mpi-tool-options-prompt__slot--drag-over');
                const file = e.dataTransfer?.files?.[0];
                if (!file) return;
                if (!file.type?.startsWith('image/')) {
                    clientLogger.warn('MpiToolOptionsPrompt', 'Drop rejected: not an image', file.type);
                    return;
                }
                if (!project?.id || !project?.folderPath) {
                    clientLogger.warn('MpiToolOptionsPrompt', 'No project context for upload');
                    return;
                }
                const uploaded = await uploadMediaFile(file, 'image', project.folderPath, project.id, {
                    filenamePrefix: `frame-${role}`,
                    operation: 'frame-drop',
                });
                if (!uploaded) return;
                promptBox?.el?.injectMedia?.({ url: uploaded.filePath, mediaType: 'image', role });
            });
            _unsubs.push(offOver, offLeave, offDrop);
        }
        _attachDrop(thumbStart, 'startFrame');
        _attachDrop(thumbEnd,   'endFrame');

        // ── Swap button ──────────────────────────────────────────────────────
        _unsubs.push(on(swapBtn, 'click', () => {
            promptBox?.el?.swapMediaRoles?.('startFrame', 'endFrame');
        }));

        // ── Action buttons ───────────────────────────────────────────────────
        const extendBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Extend', icon: 'chevronRight', variant: 'primary', size: 'sm',
            info: 'Extend source video with the generated continuation',
        });
        actionsEl.appendChild(extendBtn.el);
        extendBtn.on('click', () => Events.emit('prompt-box-tools:extend'));
        _children.push(extendBtn);

        const createBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Create new', icon: 'plus', variant: 'primary', size: 'sm',
            info: 'Generate a new video from the frames + prompt',
        });
        actionsEl.appendChild(createBtn.el);
        createBtn.on('click', () => Events.emit('prompt-box-tools:create-new'));
        _children.push(createBtn);

        el.destroy = () => {
            _unsubs.forEach(fn => { try { fn?.(); } catch (_) { /* node removed */ } });
            _children.forEach(c => c.destroy?.());
        };
    },
});
