/**
 * groupHistory.js — Item Group History workspace.
 *
 * Shows the full generation history of a single ItemGroup.
 * Left toolbar adapts to group type (image/video) and selection count.
 * Centre shows the selected entry large.
 * Right panel shows history stack as cards.
 *
 * Entry point: mount(container, params)
 * @param {HTMLElement} container
 * @param {{ groupId: string }} params
 */

import { state } from '../../state.js';

export function mount(container, params = {}) {
    const group = state.currentProject?.itemGroups?.find(g => g.id === params.groupId);

    container.innerHTML = `
        <div class="tool-placeholder">
            <h1 class="tool-placeholder__title">GROUP HISTORY</h1>
            <p>${group ? group.name : 'Group not found'}</p>
        </div>
    `;
}
