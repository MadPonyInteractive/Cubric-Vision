/**
 * workspace — Main workspace landing page.
 *
 * The first page shown after opening a project.
 * Displays workspace options (Image, Video, Audio) for the user to choose from.
 * Eventually this will be the main project gallery with workspace filter cards.
 *
 * Entry point: mount(container)
 */

/**
 * Mounts the workspace landing page into the given container.
 * @param {HTMLElement} container
 */
export function mount(container) {
    container.innerHTML = `
        <div class="tool-placeholder">
            <h1 class="tool-placeholder__title"><br>MAIN GALLERY</h1>
            <p>This should be all the media of this project in a gallery</p>
        </div>
    `;
}
