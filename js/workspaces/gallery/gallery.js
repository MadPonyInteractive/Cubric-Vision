/**
 * gallery.js — Main project gallery workspace.
 *
 * Displays all ItemGroups as cards in an adaptive grid.
 * Contains the PromptBox — running a generation creates a new ItemGroup.
 * Selection mode replaces the PromptBox with MpiSelectionBar.
 *
 * Entry point: mount(container)
 */

import { state } from '../../state.js';
import { navigate, PAGE_GROUP_HISTORY } from '../../router.js';
import { MpiGalleryGrid } from '../../components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js';

/**
 * Mounts the gallery workspace into the given container.
 * @param {HTMLElement} container
 */
export function mount(container) {
    container.innerHTML = '';

    const groups = state.currentProject?.itemGroups || [];

    const grid = MpiGalleryGrid.mount(container, { groups });

    // ── Navigate to group history on card open ──────────────────────────────

    grid.on('open-group', ({ group }) => {
        navigate(PAGE_GROUP_HISTORY, { groupId: group.id });
    });

    // ── Stub handlers — wired up when command executor is built ────────────

    grid.on('compare',  ({ groups }) => {
        // TODO: launch CompareToolOverlay with the two selected group selected entries
        console.log('[gallery] compare', groups.map(g => g.id));
    });

    grid.on('download', ({ groups }) => {
        // TODO: trigger file download for selected entries
        console.log('[gallery] download', groups.map(g => g.id));
    });

    grid.on('delete', ({ groups }) => {
        // TODO: confirm + delete groups from project
        console.log('[gallery] delete', groups.map(g => g.id));
    });

    // ── PromptBox slot — mounted here when MpiPromptBox supports image drop ─
    // TODO: mount MpiPromptBox into grid.el.getPromptSlot() once it supports
    // drag-drop image input and emits a 'run' event with command + params.
    // On 'run': call grid.el.addGeneratingCard(tempId, type), start ComfyUI
    // workflow, push preview frames via grid.el.updatePreview(tempId, url),
    // finalize with grid.el.finalizeCard(tempId, newGroup).
}
