# Component System Architecture & Rules

> **AI INSTRUCTION:** Read this file carefully before creating or modifying any component in Cubric Vision.

## Stage design baseline (post-redesign)

Stage redesign (PORTING.md phases 0–10.2) **merged to master**. Tokens, type scale, and motion timings live in `styles/01_base.css` — that file is canonical. Key rules:

- **Tokens only** — OKLCH variables from `styles/01_base.css` (`--surface-*`, `--ink-*`, `--line*`, `--accent-{heat,frost,ok,warn}`, `--t-*`, `--s-*`, `--r-*`, `--ease`, `--t-fast|base|slow`). No legacy `--neon-*`, `--bg*`, `--primary*`, `--surface-glass`, `--text*`, `--border*`, `--radius*`, `--font-main`/`--font-display`, `--transition`/`--bounce`.
- **No neon, no glass, no `backdrop-filter`.** Solid surfaces, 1px lines, sharp corners.
- **Sharp corners default** — `MpiButton` `shape: 'sharp'` (`--r-1: 0`); pass `shape: 'pill'` to opt-out.
- **Gradient text only on wordmark** — no `background-clip: text` anywhere else.
- **Wordmark** — `--font-wordmark` = `'Russo One', 'JetBrains Mono', sans-serif` at `assets/fonts/RussoOne-Regular.woff2`. Body = `'JetBrains Mono'`. Lockup: `.mpi-wordmark` + `.mpi-wordmark__suffix` ("Cubric" stays `--ink-1`, suffix takes `--accent-heat`). Live text only — never `assets/lettering.png`.
- **Mascot** — canonical 4-file set in `assets/mascot/`: `logo.png`, `idle.png`, `greet.png`, `happy.png`. Block-owned peek uses `idle`/`happy`; landing empty uses `greet`.
- **App accent (`--accent-heat`)** = rose lift. Drive via token only, never hardcode oklch values.
- **Slide-over canonical for Settings/Help/About/Models/Cue** — trigger `Events.emit('slide-over:open', { title, component })` or `slide-over:toggle` for toggleable panels. Never mount content components directly. Content may own chrome only through an explicit slide-over variant such as Cue's `mpi-slide-over--queue`.
- **`MpiButton` imperative sync** — callers use `el.setActive(bool)` / `el.setDisabled(bool)`; DOM-only mutation leaves stale props.
- **`MpiOptionSelector` ratio variant** — raw-template children inside portaled popup must be handled by `MpiOptionSelector`'s delegated popup listeners (no child `setup()` runs for raw HTML).
- **`MpiContextMenu` items** — support `kbd` (right-aligned hint) and `separator: true`.
- **Mockups are spec** — `docs/redesign/c-stage/*.html`. Translate to Cubric patterns (BEM, ComponentFactory, dom.js, Events, Hotkeys). Never copy markup verbatim. Real-app deviations get `// REDESIGN-DEVIATION:` comment.
- **Preview-stage cards (`MpiGalleryGrid`)** — `.mpi-group-card--preview` modifier when `selected.stage === 'preview'`; PREVIEW badge top-right, Continue/Finish action row; `--continuing` modifier during in-flight (spinner + "Generating final…" overlay). Drive via `grid.el.markContinuing(groupId, bool)` — internal Set survives `setGroups` rebuilds.
- **Selection-order badge `#N`** — `MpiHistoryList` + `MpiGalleryGrid` when selection ≥ 2. Re-applied in `_syncCardSelectedState` AND initial-state branch of `_makeCard` so keyed-reuse path doesn't drop it.
- **Video-history toolbar (`MpiToolOptionsPrompt`)** — mounts `#right-top-slot` when active model has `i2v*`/`v2v*` op. Gate `_modelHasFrameOps()` also keeps PromptBox visible BEFORE chips land. PromptBox flips to `historyMode` (strip hidden, `Preview_Only` forced false, `previewStage` toggle hidden). Action buttons emit `prompt-box-tools:extend` / `prompt-box-tools:create-new` — single listener lives in `MpiGroupHistoryBlock`.
- **Video latent previews suppressed** — `_applyPreview` short-circuits in video workspace (latent PNGs would crash `<video>.loadVideo`). Mascot + StatusBar still drive feedback.
- **`MpiVideoViewer` pan/zoom** — wheel-zoom 1×–10× cursor-anchored, left-drag pan when zoomed, dblclick → fit. Transform is applied directly to `.mpi-video-surface__video`, not the wrapper, because macOS/Linux hardware-video compositor paths can ignore/mis-handle ancestor transforms that Windows tolerates. Wheel zoom remains enabled in video tool modes; left-drag pan is disabled while crop mode is active so crop handles keep priority. View resets on every `loadVideo()`; `el.resetView()` exposed. Click-to-play preserved on stationary clicks (>3px drag swallows toggle via capture-phase handler).

- **Video trim/frame semantics** — `MpiVideoControlBar` treats trim out as the last included frame. Frame stepping and frame display use probed stream fps plus `frameCount` bounds (`0..frameCount-1`) instead of deriving fps from browser `duration`, because Chromium can report a few ms of tail after the final decoded frame.

---

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves creating or modifying components.

- **All components MUST use `ComponentFactory.create()`** — never build a component by hand.
- **NEVER modify `js/components/factory.js`** — it is locked. Fix your component, not the factory.
- **4-Tier hierarchy (never import up):** Primitives → Compounds → Organisms → Blocks. Primitives import nothing. Compounds import Primitives only. Organisms import Primitives + Compounds. Blocks import all tiers. Primitives may own multi-canvas DOM trees (e.g. `MpiCanvas` owns base + overlay + screen-UI canvases).
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
>
> **MpiPromptBox operation auto-pick:** `setModel` / `setModelList` reconcile `activeOperation` against current media (`imageCount` / `videoCount` from `_context`) — keep current op when still compatible, else first media-fitting `supportedOp`, else text-only when no media. Picked op flows through `setOperation` so `operation-change` fires. Block-side `model-change` listeners must rely on this and only force-reset when the current op is genuinely outside `model.supportedOps` — never default to `supportedOps[0]` unconditionally.

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
* Nested popup click handlers that mutate DOM synchronously (rewrite `innerHTML`, re-render grid, etc.) MUST call `e.stopPropagation()` BEFORE the mutation. Otherwise `e.target` detaches mid-bubble and parent popup outside-click listeners' `closest('.mpi-popup')` exclusion returns null on the detached node, making the parent close incorrectly.
* Z-index contract: dropdown lists (`z-index: 10001`) sit above popups (`z-index: 9999`) so selects inside a popup render correctly.
* Viewport clamp: after placing a portaled popup by trigger coordinates, measure `getBoundingClientRect()` in `requestAnimationFrame` and nudge `left` back into view. Popups anchored with `translateX(-50%)` will clip off-screen near viewport edges otherwise.
* Seed live props from `initial*` fallbacks in `setup()` (e.g. `props.orientation = props.initialOrientation || 'portrait'`). Click handlers read `props.*` directly; if setup skips this seed, first-click handlers see `undefined` and diverge from the template's rendered state.

### Hotkeys
* MUST use `Hotkeys.bind(id, fn)` — `id` is a stable string from `hotkeyRegistry.js`. Never use raw `window.addEventListener('keydown')`.
* Store the returned unbind fn in `_unsubs`. Call `_unsubs.forEach(fn => fn())` in `el.destroy()`.
* Hotkey typing suppression applies only to text-entry controls. Do not blur sliders or buttons just to keep shortcuts alive; `input[type="range"]` and other non-text controls are not treated as typing contexts by `hotkeyManager`.
* When `allowWhileTyping: false`, the typing gate blocks single-letter keys, bare modifiers, AND named edit/navigation keys (`Delete`, `Backspace`, `ArrowLeft/Right/Up/Down`, `Home`, `End`, `PageUp`, `PageDown`) so the user can edit text natively. F-keys and Ctrl/Meta-modified combos still fire while typing.
* Generation hotkeys: `generation.run` (`Ctrl+Enter`) cues a generation, `generation.stop` (`Ctrl+Alt+Enter`) interrupts current job, `generation.loop` (`Ctrl+L`) toggles `state.loopArmed`. `MpiPromptBox` owns all three bindings. There is no Single mode — Cue is the only execution path; Loop is a flag layered on top that re-fires on queue drain.
* **The Help overlay (`MpiHelp.js`) is hand-authored static HTML, NOT generated from the registry.** Whenever you add, rename, or remove a hotkey in `hotkeyRegistry.js`, you MUST also add/rename/remove the matching `<li><span>KEY</span><span>Description</span></li>` row inside `MpiHelp.js`'s `template`. Treat the two files as paired — a registry change without a help-page edit is incomplete work. Row format and grouping conventions: see `docs/shell.md` § "Help page — hand-authored HTML".

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
