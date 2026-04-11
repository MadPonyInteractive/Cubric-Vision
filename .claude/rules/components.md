# Component System Architecture & Rules

> **AI INSTRUCTION:** Read this file carefully before creating or modifying any component in MpiAiSuite.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves creating or modifying components.

- **All components MUST use `ComponentFactory.create()`** — never build a component by hand.
- **NEVER modify `js/components/factory.js`** — it is locked. Fix your component, not the factory.
- **3-Tier hierarchy (never import up):** Primitives → Compounds → Blocks. Primitives import nothing. Compounds import Primitives only. Blocks import both.
- **Every new component checklist:** (1) register `.css` in `js/shell/preloadStyles.js`, (2) document props in `js/components/types.js`, (3) ask user about gallery addition.
- **Use `js/utils/dom.js`** shorthands — never raw `document.querySelector`.
- **Blocking UI (modals/overlays):** call `Overlays.request(...)` to show, `Overlays.release(el)` to hide. Portal to `document.body`. Self-close on `ui:close-all-popups`.
- **Floating UI (dropdowns/popups):** No Overlays registration. Self-close on `ui:close-all-popups`. Use `MutationObserver` to clean up body portals when anchor is removed.
- **Hotkeys:** `Hotkeys.register(key, fn)` to bind, `Hotkeys.unregister(key, fn)` on destroy/hide. Never use raw `window.addEventListener('keydown')`.
- **All state management, hotkeys, and overlay mounting MUST happen inside `setup()`.** Callers must never import `overlayManager`, `hotkeyManager`, or `Events` to manage a component.

## CRITICAL "NEVER FORGET" RULES
1. **Preload CSS:** You MUST add the `.css` path to `js/shell/preloadStyles.js` when creating a component.
2. **JSDocs:** You MUST document the component's `props` in `js/components/types.js`.
3. **CSS Source of Truth:** ALWAYS use `styles/01_base.css` variables, do not hardcode colors.
4. **Gallery Demo:** You MUST ask the user if the new component should be added to the gallery (`js/pages/components.js`) before finishing the task.
5. **DOM Utilities:** ALWAYS use `js/utils/dom.js` shorthands instead of raw DOM API where possible.
6. **ComponentFactory:** NEVER modify `js/components/factory.js`. The factory is locked. If a component isn't working, you must fix your component implementation; do not alter the factory pattern.

---

## The 3-Tier Hierarchy
You MUST follow Atomic Design principles. **NEVER "import up".**
* **Tier 1 (Primitives):** Buttons, inputs, icons. (Cannot import anything).
* **Tier 2 (Compounds):** Cards, forms, modals. (Can only import Primitives).
* **Tier 3 (Blocks):** Sidebars, grids. (Can import Primitives & Compounds).

---

## The Skeleton Pattern
Every component MUST use the `ComponentFactory`:

```javascript
import { ComponentFactory } from '../../factory.js';

export const MyComponent = ComponentFactory.create({
    name: 'MyComponent',
    css: ['js/components/[Tier]/MyComponent/MyComponent.css'], // Use BEM styling (.mpi-my-comp)
    template: (props) => `<div class="mpi-my-comp">${props.text}</div>`,
    setup: (el, props, emit) => {
        // Logic and event listeners go here
    }
});
```

---

## INTEGRATION (The Golden Rule)
**Callers MUST NEVER import `overlayManager`, `hotkeyManager`, or `Events` just to manage a component.**
All state management, hotkeys, and overlay mounting MUST happen inside the component's `setup()` function.

### Blocking UI (Modals/Overlays)
* MUST call `Overlays.request({ show, hide, id: el })` to show.
* MUST call `Overlays.release(el)` to hide. (Do NOT emit a `cancel` event in `.hide()`).
* MUST portal to `document.body` and clean up its own wrapper and backdrop on close.
* MUST self-close on the `ui:close-all-popups` global event.

### Floating UI (Dropdowns/Popups)
* No Overlays registration.
* MUST self-close on the `ui:close-all-popups` global event.
* MUST use a `MutationObserver` to clean up `document.body` portals when the component is removed from the DOM.

### Hotkeys
* MUST use `Hotkeys.register(key, fn)` (Never use raw `window.addEventListener('keydown')`).
* MUST use `Hotkeys.unregister(key, fn)` on `el.destroy()` or `el.hide()`.

---

## MutationObserver Cleanup Pattern
Floating UI tools must clean themselves up when their parent anchor drops from the DOM.
```javascript
const observer = new MutationObserver(() => {
    if (!document.contains(anchorEl)) { // If parent container is deleted
        portalNode.remove();            // Remove this popup/dropdown from body
        observer.disconnect();
        unsubBus();                     // Run cleanup (Events.on, etc.)
    }
});
observer.observe(document.body, { childList: true, subtree: true });
```
