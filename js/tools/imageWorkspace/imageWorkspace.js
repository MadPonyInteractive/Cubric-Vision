/**
 * imageWorkspace — Image workspace placeholder.
 *
 * Entry point: mount(container)
 * Will eventually display the project image gallery with tool cards.
 */

/**
 * Mounts the image workspace into the given container.
 * @param {HTMLElement} container
 */
export function mount(container) {
    container.innerHTML = `
        <div class="tool-placeholder">
            <h1 class="tool-placeholder__title"><br>IMAGE</h1>
            <p>This should be all the images of this project in a gallery</p>
        </div>
    `;
}
