/**
 * generator — Image Generator tool scaffold.
 *
 * Entry point: mount(container)
 *
 * Uses Events.channel('generator') for all tool-level events.
 * Reads/writes state.workspaces.image for workspace-scoped data (future).
 *
 * Radial context when active: [ Upscaler | ← Gallery ]
 * (Radial is managed by navigation.js — this module only handles its own UI.)
 */

import { Events } from '../../events.js';

const _ch = Events.channel('generator');

/**
 * Mounts the generator tool into the given container.
 * @param {HTMLElement} container
 */
export function mount(container) {
    container.innerHTML = `
        <div class="tool-placeholder">
            <h1 class="tool-placeholder__title"><br>GENERATOR</h1>
            <p>Lets generate some cool images!</p>
        </div>
    `;

    // Tool-level event channel ready for future use
    // _ch.on('result', ({ url }) => { ... });
}
