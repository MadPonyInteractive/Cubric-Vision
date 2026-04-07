/**
 * audioWorkspace — Audio workspace placeholder.
 *
 * Entry point: mount(container)
 * Will eventually display the project audio gallery with tool cards.
 */

/**
 * @param {HTMLElement} container
 */
export function mount(container) {
    container.innerHTML = `
        <div class="tool-placeholder">
            <h1 class="tool-placeholder__title"><br>AUDIO</h1>
            <p>This should be all the audio of this project in a gallery</p>
        </div>
    `;
}
