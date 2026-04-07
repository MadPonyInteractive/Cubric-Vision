/**
 * videoWorkspace — Video workspace placeholder.
 *
 * Entry point: mount(container)
 * Will eventually display the project video gallery with tool cards.
 */

/**
 * @param {HTMLElement} container
 */
export function mount(container) {
    container.innerHTML = `
        <div class="tool-placeholder">
            <h1 class="tool-placeholder__title"><br>VIDEO</h1>
            <p>This should be all the video of this project in a gallery</p>
        </div>
    `;
}
