import { ComponentFactory } from '../../../factory.js';
import { MpiProjectsPageOverlay } from '../../../Primitives/MpiProjectsPageOverlay/MpiProjectsPageOverlay.js';

/**
 * MpiHelp — Help overlay compound for the landing page.
 *
 * Wraps MpiProjectsPageOverlay and renders keyboard shortcuts and app guidance.
 * Callers only call show()/hide().
 *
 * Usage:
 *   const help = MpiHelp.mount(document.createElement('div'));
 *   help.el.show();
 *
 * Emits:
 *   'close' {} — overlay closed
 */
export const MpiHelp = ComponentFactory.create({
    name: 'MpiHelp',
    css: ['js/components/Compounds/LandingPages/MpiHelp/MpiHelp.css'],

    template: () => `<div class="mpi-help"></div>`,

    setup: (el, props, emit) => {
        const content = document.createElement('div');
        content.className = 'mpi-help__content';
        content.innerHTML = `
            <div class="mpi-help__header">
                <h2 class="mpi-help__title">Help</h2>
                <p class="mpi-help__desc">Support and accessibility guide.</p>
            </div>

            <div class="mpi-help__shortcuts">
                <h3 class="mpi-help__shortcuts-title">Keyboard Shortcuts</h3>

                <div class="mpi-help__shortcuts-grid">
                    <div class="mpi-help__shortcut-group">
                        <h4>Global</h4>
                        <ul>
                            <li><span>Escape</span><span>Close Popups</span></li>
                            <li><span>Enter</span><span>Confirm Popups</span></li>
                            <li><span>F11</span><span>Toggle Full Screen</span></li>
                            <li><span>F5</span><span>Release VRAM</span></li>
                            <li><span>Ctrl+F5</span><span>Unload Models</span></li>
                        </ul>
                    </div>

                    <div class="mpi-help__shortcut-group">
                        <h4>Image Previewer</h4>
                        <ul>
                            <li><span>Enter</span><span>Send to Detailer</span></li>
                            <li><span>M</span><span>Toggle Masking Mode</span></li>
                            <li><span>Click</span><span>Pan</span></li>
                            <li><span>Wheel</span><span>Zoom In/Out</span></li>
                            <li><span>Double Click</span><span>Reset View</span></li>
                            <li class="mpi-help__subheading"><strong>Mask Mode</strong></li>
                            <li><span>Wheel</span><span>Brush Size</span></li>
                            <li><span>B / E</span><span>Brush / Eraser</span></li>
                            <li class="mpi-help__subheading"><strong>Holding Space</strong></li>
                            <li><span>Click</span><span>Pan</span></li>
                            <li><span>Wheel</span><span>Zoom</span></li>
                            <li><span>Double Click</span><span>Reset View</span></li>
                        </ul>
                    </div>

                    <div class="mpi-help__shortcut-group">
                        <h4>Prompt Boxes</h4>
                        <ul>
                            <li><span>Ctrl+Enter</span><span>Submit Generate</span></li>
                            <li><span>Ctrl+Enter</span><span>Cancel Generation</span></li>
                        </ul>
                    </div>

                    <div class="mpi-help__shortcut-group">
                        <h4>Radial Menu</h4>
                        <ul>
                            <li><span>Hold Tab</span><span>Hover destination and release</span></li>
                        </ul>
                    </div>
                </div>
            </div>`;

        const overlay = MpiProjectsPageOverlay.mount(el, { closable: true });
        overlay.el.appendToContainer(content);
        overlay.on('close', () => emit('close', {}));

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();
    }
});
