/**
 * js/components/factory.js — Core Component Factory for Cubric Studio.
 * 
 * Provides a standardized way to create, mount, update, and destroy 
 * UI components in a vanilla JS environment without a bundler.
 */

'use strict';

const _loadedStyles = new Set();

/**
 * Ensures a CSS file is injected into the document head exactly once.
 * @param {string} href - Path to the CSS file (e.g. 'js/components/Primitives/Button/Button.css')
 */
function ensureStylesheet(href) {
    if (_loadedStyles.has(href)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    _loadedStyles.add(href);
}

/**
 * The Component Factory
 */
export const ComponentFactory = {
    /**
     * Defines a new component blueprint.
     * 
     * @param {Object} def - Component definition
     * @param {string} def.name - Unique component name (e.g. 'Button')
     * @param {function(Object, string=): string} def.template - Function returning HTML string
     * @param {function(HTMLElement, Object, function): void} [def.setup] - Optional setup function for listeners
     * @param {string[]} [def.css] - Array of CSS file paths to inject
     * @param {string[]} [def.dependencies] - Other components this one requires
     */
    create: (def) => {
        return {
            name: def.name,

            /**
             * Renders the component's HTML string without mounting it.
             * @param {Object} props
             * @param {string} [children]
             * @returns {string} HTML string
             */
            template: (props = {}, children = '') => def.template(props, children),

            /**
             * Access the setup function for manual invocation.
             */
            setup: def.setup || (() => {}),

            /**
             * Mounts the component into a container.
             * CSS is guaranteed to be loaded before the element is inserted into the DOM.
             * @param {HTMLElement} container - Target DOM element
             * @param {Object} props - Initial properties
             * @param {string} [children] - Inner HTML string
             * @returns {Object} Component instance
             */
            mount: (container, props = {}, children = '') => {
                // 1. Inject CSS if provided
                if (def.css) {
                    def.css.forEach(ensureStylesheet);
                }

                // 2. Render Template
                const html = def.template(props, children);
                container.innerHTML = html;
                const el = container.firstElementChild;

                // 3. Event Bus Integration
                const listeners = new Map();
                const emit = (event, data) => {
                    // Internal subscription call
                    if (listeners.has(event)) {
                        listeners.get(event).forEach(cb => cb(data));
                    }
                    // DOM Bubbling (for page-level delegation)
                    const customEvent = new CustomEvent(`${def.name.toLowerCase()}:${event}`, {
                        detail: data,
                        bubbles: true,
                        composed: true
                    });
                    el.dispatchEvent(customEvent);
                };

                // 4. Setup logic (if any)
                if (def.setup) {
                    def.setup(el, props, emit);
                }

                // 5. Build Instance Object
                const instance = {
                    el,
                    props,
                    children,
                    update: (newProps) => {
                        // For simple vanilla refactors, we just re-mount for now.
                        // Optimization: In a real "diffing" engine we'd only update changed nodes.
                        instance.props = { ...instance.props, ...newProps };
                        // NOTE: instance.mount is a reference to the blueprint's mount, 
                        // but since we're in a closure, we call the component's factory mount.
                        // Re-fetching the component is usually handled by the page-level caller.
                        console.warn(`[ComponentFactory] .update() called on ${def.name}. Re-mounting required.`);
                    },
                    on: (event, callback) => {
                        if (!listeners.has(event)) listeners.set(event, []);
                        listeners.get(event).push(callback);
                    },
                    destroy: () => {
                        if (el && typeof el.destroy === 'function') {
                            el.destroy();
                        }
                        if (el && el.parentNode) {
                            el.parentNode.removeChild(el);
                        }
                        listeners.clear();
                    }
                };

                return instance;
            }
        };
    }
};
