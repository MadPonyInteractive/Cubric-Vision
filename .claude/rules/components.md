# Component System Architecture & Rules

> **AI INSTRUCTION:** Read this file carefully before creating or modifying any component in MpiAiSuite.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves creating or modifying components.

- **All components MUST use `ComponentFactory.create()`** — never build a component by hand.
- **NEVER modify `js/components/factory.js`** — it is locked. Fix your component, not the factory.
- **4-Tier hierarchy (never import up):** Primitives → Compounds → Organisms → Blocks. Primitives import nothing. Compounds import Primitives only. Organisms import Primitives + Compounds. Blocks import all tiers.
- **Every new component checklist:** (1) register `.css` in `js/shell/preloadStyles.js`, (2) document props in `js/components/types.js`, (3) ask user about gallery addition.
- **Use `js/utils/dom.js`** shorthands — never raw `document.querySelector`.
- **Blocking UI (modals/overlays):** call `Overlays.request(...)` to show, `Overlays.release(el)` to hide. Portal to `document.body`. Self-close on `ui:close-all-popups`.
- **Floating UI (dropdowns/popups):** No Overlays registration. Self-close on `ui:close-all-popups`. Use `MutationObserver` to clean up body portals when anchor is removed.
- **Hotkeys:** `Hotkeys.bind(id, fn)` to bind (id from `hotkeyRegistry.js`), store returned unbind fn in `_unsubs`, call in `destroy()`. Never use raw `window.addEventListener('keydown')`.
- **All state management, hotkeys, and overlay mounting MUST happen inside `setup()`.** Callers must never import `overlayManager`, `hotkeyManager`, or `Events` to manage a component.

## CRITICAL "NEVER FORGET" RULES
1. **Preload CSS:** You MUST add the `.css` path to `js/shell/preloadStyles.js` when creating a component.
2. **JSDocs:** You MUST document the component's `props` in `js/components/types.js`.
3. **CSS Source of Truth:** ALWAYS use `styles/01_base.css` variables, do not hardcode colors.
4. **Gallery Demo:** You MUST ask the user if the component should be added to the gallery (`js/pages/components.js`) before finishing the task.
5. **DOM Utilities:** ALWAYS use `js/utils/dom.js` shorthands instead of raw DOM API where possible.
6. **ComponentFactory:** NEVER modify `js/components/factory.js`. The factory is locked. If a component isn't working, you must fix your component implementation; do not alter the factory pattern.

---

## The 4-Tier Hierarchy
You MUST follow Atomic Design principles. **NEVER "import up".**
* **Tier 1 (Primitives):** Buttons, inputs, icons. (Cannot import anything).
* **Tier 2 (Compounds):** Cards, forms, toolbars. (Can only import Primitives).
* **Tier 3 (Organisms):** Rich widgets that compose multiple Compounds. (Can import Primitives + Compounds). Examples: `MpiCanvasViewer`, `MpiVideoViewer`.
* **Tier 4 (Blocks):** Sidebars, grids, workspace coordinators. (Can import Primitives, Compounds, and Organisms).

> **Note on complexity:** Organisms like `MpiPromptBox` and Blocks can be substantially more complex than Primitives and most Compounds. They own multiple mount points, conditional sub-component rendering, and dynamic operation switching. Approach debugging and modifications carefully — trace all mount targets before making changes.

---

## The Skeleton Pattern
Every component MUST use the `ComponentFactory`:

```javascript
import { ComponentFactory } from '../../factory.js';

export const MyComponent = ComponentFactory.create({
    name: 'MyComponent',
    css: ['js/components/[Primitives|Compounds|Organisms|Blocks]/MyComponent/MyComponent.css'], // Use BEM styling (.mpi-my-comp)
    template: (props) => `<div class="mpi-my-comp">${props.text}</div>`,
    setup: (el, props, emit) => {
        // Logic and event listeners go here
    }
});
```

---

## ComponentFactory.mount() — DOM Behavior

> **CRITICAL:** `ComponentFactory.mount(container, props)` does `container.innerHTML = html` before mounting. This **replaces all existing children** of the mount target container.

```javascript
// WRONG — replaces the entire innerHTML of #my-slot, destroying any existing children
MpiButton.mount(el.querySelector('#my-slot'), { icon: 'play' });

// CORRECT — create a fresh div as mount target, then append to the slot
const btn = MpiButton.mount(document.createElement('div'), { icon: 'play' });
el.querySelector('#my-slot').appendChild(btn.el);
```

This applies to ALL components created via `ComponentFactory.mount()`.

---

## Mount Target Isolation

**Each mount target must be dedicated to exactly one mount call.** Never mount into a container that already has children (whether from the template or from a previous mount).

### Pattern: Create fresh mount targets

```javascript
// Template defines empty slots
template: () => `
    <div class="my-block">
        <div id="left-slot"></div>
        <div id="right-slot"></div>
    </div>
`,

setup: (el, props, emit) => {
    // CORRECT: mount into a fresh div, then append to the slot
    const leftBtn = MpiButton.mount(document.createElement('div'), { icon: 'settings' });
    el.querySelector('#left-slot').appendChild(leftBtn.el);

    // CORRECT: slot itself is the container for a single mount
    const rightBtn = MpiButton.mount(el.querySelector('#right-slot'), { icon: 'play' });
    // The slot starts empty, so this is safe.
}
```

### Anti-pattern: Nested overlapping mounts

```javascript
// TEMPLATE: slot contains a child element
template: () => `
    <div id="center-slot">
        <div id="op-dropdown-slot"></div>
    </div>
`,

setup: (el, props, emit) => {
    // WRONG: #center-slot already contains #op-dropdown-slot
    // This REPLACES the entire #center-slot innerHTML, destroying #op-dropdown-slot
    MpiButton.mount(el.querySelector('#center-slot'), { icon: 'check' });
}
```

### Debugging mount conflicts

When sub-components aren't rendering:
1. Check if two mounts target the same container (or nested containers)
2. Log `container.innerHTML` before and after the mount call to confirm replacement
3. List all IDs within the component: `el.querySelectorAll('[id]').forEach(e => console.log(e.id))`

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
* MUST dismiss on outside-click (not on hover-leave). Multiple portaled popups overlap on body; hover-close creates chaotic cross-closes.
* Outside-click handlers MUST ignore clicks inside other portaled surfaces (other `.mpi-popup` nodes, `.mpi-dropdown__list` nodes) — those are logically nested even when body-adjacent.
* Z-index contract: dropdown lists (`z-index: 10001`) sit above popups (`z-index: 9999`) so selects inside a popup render correctly.
* Viewport clamp: after placing a portaled popup by trigger coordinates, measure `getBoundingClientRect()` in `requestAnimationFrame` and nudge `left` back into view. Popups anchored with `translateX(-50%)` will clip off-screen near viewport edges otherwise.
* Seed live props from `initial*` fallbacks in `setup()` (e.g. `props.orientation = props.initialOrientation || 'portrait'`). Click handlers read `props.*` directly; if setup skips this seed, first-click handlers see `undefined` and diverge from the template's rendered state.

### Hotkeys
* MUST use `Hotkeys.bind(id, fn)` — `id` is a stable string from `hotkeyRegistry.js`. Never use raw `window.addEventListener('keydown')`.
* Store the returned unbind fn in `_unsubs`. Call `_unsubs.forEach(fn => fn())` in `el.destroy()`.

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

---

## Observer Lifecycle & Teardown Contract

**Navigation MUST call `instance.destroy()` before unmounting blocks.** When a component is removed from the DOM, its subscriptions (Events.on, window listeners, Observers) must be cleaned up explicitly via `el.destroy()`.

### Pattern: Define `el.destroy` in setup()

Collect all subscriptions in a cleanup array:

```javascript
setup: (el, props, emit) => {
    const _unsubs = [];

    // Collect all subscription cleanup functions
    _unsubs.push(Events.on('state:changed', ({ key, value }) => {
        if (key === 'myKey') handleChange(value);
    }));

    _unsubs.push(Events.on('other:event', handler));

    // Collect child component cleanups
    const child = MpiButton.mount(...);

    // Define cleanup hook
    el.destroy = () => {
        _unsubs.forEach(fn => fn?.());
        child.destroy?.();
    };
}
```

**Why:** The Proxy in `state.js` is a source of truth. Navigation at `js/shell/navigation.js` calls `destroy()` before clearing `_toolContainer.innerHTML`. Without explicit `el.destroy()`, subscriptions leak memory and cause duplicate handlers on re-navigation.

### Critical Leaks to Avoid

1. **Events.on return values discarded** — always collect into `_unsubs` array
2. **PromptBox handlers never unsubscribed** — collect into `_unsubs` too
3. **Child components not destroyed** — call `child.destroy?.()` in parent's `el.destroy`
4. **State sub-object mutations** — ALWAYS use `state.key = { ...state.key, ...changes }`, never `state.key.field = x`

### Utilities for Cleanup

- **`Events.onState(key, handler)`** — Subscribe to a specific state key (preferred over manual `state:changed` filtering). Returns unsubscribe.
- **`batchState(fn)`** — Batch multiple state mutations into one render pass. Dedupes mutations per key.

```javascript
import { batchState } from '../state.js';

// Instead of 5 separate state:changed emissions:
batchState(() => {
    state.key1 = val1;
    state.key2 = val2;
    state.key1 = val3; // Only final value (val3) is emitted
});
```

---

## Debugging Component Issues

When a component isn't working as expected, follow this checklist:

1. **Verify the component mounted:** Check `el.className` or `el.tagName` exists
2. **List all IDs in the component tree:** `el.querySelectorAll('[id]').forEach(e => console.log(e.id))`
3. **Check mount target isolation:** No two mounts target the same container
4. **For Block components:** Trace every slot and which component mounts into it
5. **Log the mount container before mount:** `console.log('before:', slot.innerHTML)`

Common issues:
- Mount target has existing children that get replaced (see Mount Target Isolation above)
- Slot ID is misspelled or doesn't match between template and setup
- Mount call order matters when components share slots
