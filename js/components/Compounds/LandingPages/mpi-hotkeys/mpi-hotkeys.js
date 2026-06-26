import { ComponentFactory } from '../../../factory.js';

/**
 * MpiHotkeys — Hotkeys content for the MpiSlideOver panel.
 *
 * No longer owns overlay chrome. Renders body content only.
 *
 * IMPORTANT: The shortcuts list below is hand-authored static HTML — it is NOT
 * generated from `hotkeyRegistry.js`. The user maintains the visible hotkeys
 * surface directly here so wording, grouping, and order can be curated. When
 * a hotkey is added/changed/removed in the registry, the corresponding row
 * here MUST also be added/changed/removed.
 *
 * Usage (via slide-over event):
 *   Events.emit('slide-over:open', { title: 'Hotkeys', component: MpiHotkeys });
 */
export const MpiHotkeys = ComponentFactory.create({
    name: 'MpiHotkeys',
    css: ['js/components/Compounds/LandingPages/mpi-hotkeys/mpi-hotkeys.css'],

    template: () => `
        <div class="mpi-hotkeys">
            <div class="mpi-hotkeys__content">
                <div class="mpi-hotkeys__shortcuts">
                    <h3 class="mpi-hotkeys__shortcuts-title">Keyboard Shortcuts</h3>

                    <div class="mpi-hotkeys__shortcuts-grid">

                        <!-- Overlay -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Dialogues + Overlays</h4>
                            <ul>
                                <li><span>ENTER</span><span>Accept</span></li>
                                <li><span>ESCAPE</span><span>Close/Cancel</span></li>
                            </ul>
                        </div>

                        <!-- Focus Mode -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Focus Mode</h4>
                            <ul>
                                <li><span>F</span><span>Toggle focus mode</span></li>
                                <li><span>ESCAPE</span><span>Exit focus mode</span></li>
                            </ul>
                        </div>

                        <!-- Memory -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Memory</h4>
                            <ul>
                                <li><span>F5</span><span>Release VRAM</span></li>
                                <li><span>CTRL+F5</span><span>Deep Clean (VRAM + RAM)</span></li>
                            </ul>
                        </div>

                        <!-- Image Canvas -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Image Canvas</h4>
                            <ul>
                                <li><span>Mousewheel</span><span>Zoom</span></li>
                                <li><span>Click+Drag</span><span>Pan</span></li>
                                <li><span>Dbl Click</span><span>Reset View</span></li>
                            </ul>
                        </div>

                        <!-- Mask -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Mask Mode</h4>
                            <ul>
                                <li><span>Mousewheel</span><span>Brush Size</span></li>
                                <li><span>B</span><span>Paint Brush</span></li>
                                <li><span>E</span><span>Eraser</span></li>
                            </ul>
                        </div>

                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Mask Mode (Holding SPACE)</h4>
                            <ul>
                                <li><span>Mousewheel</span><span>Zoom</span></li>
                                <li><span>Click+Drag</span><span>Pan</span></li>
                                <li><span>Dbl Click</span><span>Reset View</span></li>
                            </ul>
                        </div>

                        <!-- Gallery -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Gallery</h4>
                            <ul>
                                <li><span>+/-</span><span>Grid size</span></li>
                                <li><span>Q</span><span>Toggle Cue panel</span></li>
                                <li><span>I</span><span>Toggle card info mode</span></li>
                                <p>Item interaction</p>
                                <li><span>Shift+Click</span><span>Multi-Select</span></li>
                                <li><span>Ctrl+Click</span><span>Single Select</span></li>
                                <li><span>Right Click</span><span>Item context menu</span></li>
                                <li><span>ESCAPE</span><span>Deselect all</span></li>
                                <li><span>DELETE</span><span>Delete selected cards</span></li>
                                <li><span>Click+Drag</span><span>Drag to Prompt Box</span></li>
                                <p><span>Note: When only 2 items are selected you have access to the compare overlay.</span></p>
                            </ul>
                        </div>

                        <!-- History -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>History</h4>
                            <ul>
                                <p>Item interaction</p>
                                <li><span>Shift+Click</span><span>Multi-Select</span></li>
                                <li><span>Ctrl+Click</span><span>Single Select</span></li>
                                <li><span>Right Click</span><span>Item context menu</span></li>
                                <li><span>ESCAPE</span><span>Deselect all or return to Gallery</span></li>
                                <li><span>DELETE</span><span>Delete selected entries (or active entry)</span></li>
                            </ul>
                        </div>

                        <!-- Radial Menu -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Radial Menu</h4>
                            <ul>
                                <li><span>TAB</span><span>Toggle radial menu</span></li>
                                <p><span>Hold TAB, move to a desired operation and release TAB</span></p>
                                <p><span>Release TAB at center for no selection</span></p>
                            </ul>
                        </div>

                        <!-- Crop -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Crop</h4>
                            <ul>
                                <li><span>Hold SHIFT</span><span>Scale from center</span></li>
                            </ul>
                        </div>

                        <!-- Generation -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Generation</h4>
                            <ul>
                                <li><span>CTRL+ENTER</span><span>Cue generation</span></li>
                                <li><span>CTRL+ALT+ENTER</span><span>Stop current job</span></li>
                                <li><span>CTRL+L</span><span>Toggle loop mode</span></li>
                            </ul>
                        </div>

                        <!-- Prompt Box -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Prompt Box</h4>
                            <ul>
                                <li><span>ESCAPE</span><span>Blur text field (restore app hotkeys)</span></li>
                            </ul>
                        </div>

                        <!-- Video Player -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Video Player</h4>
                            <ul>
                                <li><span>SPACE</span><span>Play / pause</span></li>
                                <li><span>&larr;</span><span>Previous frame</span></li>
                                <li><span>&rarr;</span><span>Next frame</span></li>
                                <li><span>0</span><span>Jump to first frame</span></li>
                                <li><span>1</span><span>Jump to last frame</span></li>
                                <li><span>&uarr;</span><span>Volume +10%</span></li>
                                <li><span>&darr;</span><span>Volume -10%</span></li>
                                <li><span>L</span><span>Toggle loop</span></li>
                                <li><span>I</span><span>Set trim in to playhead</span></li>
                                <li><span>O</span><span>Set trim out to playhead</span></li>
                                <li><span>X</span><span>Reset trim range</span></li>
                            </ul>
                        </div>

                        <!-- Compare Overlay -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>Compare</h4>
                            <ul>
                                <li><span>SPACE</span><span>Play / pause both videos</span></li>
                                <li><span>&larr;</span><span>Prev frame</span></li>
                                <li><span>&rarr;</span><span>Next frame</span></li>
                                <li><span>L</span><span>Toggle loop</span></li>
                            </ul>
                        </div>

                        <!-- System -->
                        <div class="mpi-hotkeys__shortcut-group">
                            <h4>System</h4>
                            <ul>
                                <li><span>F11</span><span>Toggle fullscreen</span></li>
                                <li><span>CTRL+Wheel</span><span>Change UI size</span></li>
                                <li><span>CTRL +/-</span><span>Change UI size</span></li>
                                <li><span>MENU</span><span>Open context menu</span></li>
                                <li><span>SHIFT+F10</span><span>Open context menu</span></li>
                            </ul>
                        </div>

                    </div>
                </div>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        // Static content — no setup logic needed.
    },
});
