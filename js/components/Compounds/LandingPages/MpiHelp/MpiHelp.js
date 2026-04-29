import { ComponentFactory } from '../../../factory.js';

/**
 * MpiHelp — Help content for the MpiSlideOver panel.
 *
 * No longer owns overlay chrome. Renders body content only.
 *
 * IMPORTANT: The shortcuts list below is hand-authored static HTML — it is NOT
 * generated from `hotkeyRegistry.js`. The user maintains the visible help
 * surface directly here so wording, grouping, and order can be curated. When
 * a hotkey is added/changed/removed in the registry, the corresponding row
 * here MUST also be added/changed/removed.
 *
 * Usage (via slide-over event):
 *   Events.emit('slide-over:open', { title: 'Help', component: MpiHelp });
 */
export const MpiHelp = ComponentFactory.create({
    name: 'MpiHelp',
    css: ['js/components/Compounds/LandingPages/MpiHelp/MpiHelp.css'],

    template: () => `
        <div class="mpi-help">
            <div class="mpi-help__content">
                <div class="mpi-help__shortcuts">
                    <h3 class="mpi-help__shortcuts-title">Keyboard Shortcuts</h3>

                    <div class="mpi-help__shortcuts-grid">

                        <!-- Overlay -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Dialogues + Overlays</h4>
                            <ul>
                                <li><span>ENTER</span><span>Accept</span></li>
                                <li><span>ESCAPE</span><span>Close/Cancel</span></li>
                            </ul>
                        </div>

                        <!-- Focus Mode -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Focus Mode</h4>
                            <ul>
                                <li><span>F</span><span>Toggle focus mode</span></li>
                                <li><span>ESCAPE</span><span>Exit focus mode</span></li>
                            </ul>
                        </div>

                        <!-- Memory -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Memory</h4>
                            <ul>
                                <li><span>F5</span><span>Release Memory</span></li>
                                <li><span>CTRL+F5</span><span>Release Memory + Cache</span></li>
                            </ul>
                        </div>

                        <!-- Image Canvas -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Image Canvas</h4>
                            <ul>
                                <li><span>Mousewheel</span><span>Zoom</span></li>
                                <li><span>Click+Drag</span><span>Pan</span></li>
                                <li><span>Dbl Click</span><span>Reset View</span></li>
                            </ul>
                        </div>

                        <!-- Mask -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Mask Mode</h4>
                            <ul>
                                <li><span>Mousewheel</span><span>Brush Size</span></li>
                                <li><span>B</span><span>Paint Brush</span></li>
                                <li><span>E</span><span>Eraser</span></li>
                            </ul>
                        </div>

                        <div class="mpi-help__shortcut-group">
                            <h4>Mask Mode (Holding SPACE)</h4>
                            <ul>
                                <li><span>Mousewheel</span><span>Zoom</span></li>
                                <li><span>Click+Drag</span><span>Pan</span></li>
                                <li><span>Dbl Click</span><span>Reset View</span></li>
                            </ul>
                        </div>

                        <!-- Gallery -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Gallery</h4>
                            <ul>
                                <li><span>+/-</span><span>Grid size</span></li>
                                <p>Item interaction</p>
                                <li><span>Shift+Click</span><span>Multi-Select</span></li>
                                <li><span>Ctrl+Click</span><span>Single Select</span></li>
                                <li><span>Right Click</span><span>Item context menu</span></li>
                                <li><span>ESCAPE</span><span>Deselect all</span></li>
                                <li><span>Click+Drag</span><span>Drag to Prompt Box</span></li>
                                <p><span>Note: When only 2 items are selected you have access to the compare overlay.</span></p>
                            </ul>
                        </div>

                        <!-- Radial Menu -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Radial Menu</h4>
                            <ul>
                                <li><span>TAB</span><span>Toggle radial menu</span></li>
                                <p><span>Hold TAB, move to a desired operation and release TAB</span></p>
                                <p><span>Release TAB at center for no selection</span></p>
                            </ul>
                        </div>

                        <!-- Crop -->
                        <div class="mpi-help__shortcut-group">
                            <h4>Crop</h4>
                            <ul>
                                <li><span>Hold SHIFT</span><span>Scale from center</span></li>
                            </ul>
                        </div>

                        <!-- System -->
                        <div class="mpi-help__shortcut-group">
                            <h4>System</h4>
                            <ul>
                                <li><span>F11</span><span>Toggle fullscreen</span></li>
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
