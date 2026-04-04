# Component System Architecture (2026-03-30 Update)

# 🤖 IMPORTANT for agents
## CRITICAL Must Read: `dev_docs/05_components.md`
## Use JSDocs extensively
## Use the `styles/01_base.css` as the source of truth for styles
## Use `js/utils/dom.js` for shorthands
## Use `js/utils/` where appropriate
## Do not commit git
## Do not test
## Ask questions if goal not clear
## Remember to update `js/shell.js` and `js/components/types.js` if adding or removing components and add your new components variants to the components gallery:
`js/pages/components.js` and `templates/tpl-components`

---

## 🎯 Main Goals

The transition to this system serves four primary objectives:
1.  **AI Efficiency (Low Token Usage)**: Separating layout (JS templates) from visual data (CSS) and centralizing definitions (`types.js`) minimizes the code context an AI needs to read to perform a task.
2.  **Scalability**: A tiered hierarchy prevents "spaghetti code" as the workstation grows into a complex multi-tool environment.
3.  **Bug-Proofing**: Standardized lifecycles (`mount`, `update`, `destroy`) and unique event namespaces eliminate common DOM-related regressions.
4.  **Maintainability**: Components are self-contained. Deleting or modifying one component will not break unrelated parts of the app.

---

## 🏗️ Architectural Overview

The system is built on a **3-Tier Hierarchy** following Atomic Design principles:

| Tier | Category | Content | Dependency Rule |
|---|---|---|---|
| **1** | **Primitives** | Atomic buttons, inputs, icons, badges. | Cannot import anything. |
| **2** | **Compounds** | Composed units like Cards, Form Groups, Modals. | Can only import Primitives. |
| **3** | **Blocks** | Large sections like Sidebars, Tool Headers, Grids. | Can import Primitives & Compounds. |

> 🔴 **Strict Rule**: No component may "import up." A Primitive can never depend on a Compound or Block.

---

## 🛠️ How to Implement a Component (The Low-Effort Way)

To add a new feature, follow this minimalist 3-step checklist:

### 1. Create your files
In `js/components/[Tier]/[ComponentName]/`:
- `[Name].js`: Your logic and template.
- `[Name].css`: Your styles (use BEM, like `.mpi-btn--neon`).

### 2. Export the Blueprint
Use the `ComponentFactory` to define your component.

```javascript
import { ComponentFactory } from '../../factory.js';

export const MyComponent = ComponentFactory.create({
    name: 'MyComponent',
    css: ['js/components/[Tier]/MyComponent/MyComponent.css'],
    template: (props) => `<div class="mpi-my-comp">${props.text}</div>`,
    setup: (el, props, emit) => {
        // Logic here. Infrastructure is handled globally.
    }
});
```

### 3. Registry update
- **Vitals**: Add the CSS path to `js/shell/preloadStyles.js` to prevent FOUC.
- **Intellisense**: Add a quick JSDoc prop definition in `js/components/types.js` so AI agents can use it correctly.

---

## 🔗 Simplified Life-Cycle Management (Persistence)

You no longer need to worry about background state or manual DOM purging.

- **Page Overlays**: Use `MpiOverlay.mount()`. It uses the **Stash Pattern** to keep background tools alive in the DOM without them being visible.
- **Portals (Popups)**: Use `MpiPopup`. It cleans itself up automatically if its anchor is truly deleted, but survives "Stashing".
- **Global Reset**: All popups/dropdowns close automatically when a blocking UI opens (via the `ui:close-all-popups` event).

## 🎨 Styling Standards (BEM)

Since there is no bundler, we use strict **BEM (Block Element Modifier)** conventions to ensure styles don't leak:
- `.mpi-block`
- `.mpi-block__element`
- `.mpi-block--modifier`

---

## ⌨️ Global Interaction Management — THE GOLDEN RULE

> 🔴 **MANDATORY FOR ALL AGENTS**: Read this section in full before implementing any interactive component.

### The Core Principle: Components Own Their Own Integrations

**Callers (pages, shell modules, other components) must NEVER import or directly call `overlayManager`, `hotkeyManager`, or `Events` to manage a component's behaviour.**

All integration with those systems must live **inside the component's `setup` function**. Callers only call `.mount()`, `.show()`, `.hide()`, and `.on('event')`.

**If a caller has to import `overlayManager.js` or `hotkeyManager.js` just to use your component — the component is incomplete.**

```javascript
// ✅ CORRECT — caller is clean, all wiring is internal to the component
const dialog = MpiOkCancel.mount(document.createElement('div'), { title: 'Delete?' });
dialog.on('ok', () => doDelete());
dialog.el.show(); // internally calls Overlays.request(), handles Escape, etc.

// ❌ WRONG — caller should never touch managers
import { Overlays } from '../managers/overlayManager.js';
const dialog = MpiOkCancel.mount(wrapper, { title: 'Delete?' });
Overlays.request({ show: () => wrapper.style.display = 'block', hide: ..., id: el });
```

---

### Integration Matrix by Component Type

#### 🪟 Type 1: Blocking UI (Modals, Dialogs, Confirm screens)
> Examples: `MpiOkCancel`, `MpiOverlay`

These components cover the screen and block interaction. They **must**:

| Requirement | Where | Detail |
|---|---|---|
| `Overlays.request()` | Inside `el.show()` → `_doShow` | Registers with the queue. Only one blocking UI is active at a time. |
| `Overlays.release(el)` | Inside `el.hide()` | Releases the queue so the next dialog can show. |
| Self-portal to `document.body` | Inside `_doShow` | Creates its own backdrop + centred wrapper. Caller provides no DOM. |
| Self-cleanup portal on `el.hide()` | Inside `el.hide()` | Removes backdrop and wrapper. Never relies on caller to clean up. |
| `Events.on('ui:close-all-popups')` | In `setup` | Must self-close if another blocking UI opens. |

> **Escape is FREE** — `OverlayManager` already registers `Escape` globally and calls `el.hide()` on the active overlay. You do NOT register Escape yourself in a blocking component.

> **`el.hide()` must NEVER re-emit `cancel`** — this causes infinite recursion (`hide → emit cancel → listener calls hide → ...`). Only the explicit Cancel **button** should emit `'cancel'`.

```javascript
// Correct pattern for a blocking dialog
setup: (el, props, emit) => {
    let _backdrop = null, _wrapper = null;

    const _doShow = () => {
        _backdrop = document.createElement('div');
        _backdrop.className = 'my-dialog-backdrop';
        document.body.appendChild(_backdrop);

        _wrapper = document.createElement('div');
        _wrapper.className = 'my-dialog-wrapper';
        _wrapper.appendChild(el);
        document.body.appendChild(_wrapper);
    };

    el.show = () => Overlays.request({ show: _doShow, hide: el.hide, id: el });

    el.hide = () => {
        // Clean up portal nodes
        _backdrop?.remove(); _backdrop = null;
        _wrapper?.remove();  _wrapper  = null;
        // Release overlay queue — do NOT emit 'cancel' here
        Overlays.release(el);
    };

    // Cancel button only: emit then hide
    cancelBtn.on('click', () => { emit('cancel', {}); el.hide(); });
    // OK button only: emit then hide
    okBtn.on('click', () => { emit('ok', {}); el.hide(); });

    // Respond to global close signal
    const _unsub = Events.on('ui:close-all-popups', () => { if (_backdrop) el.hide(); });

    // Cleanup observer
    const _obs = new MutationObserver(() => {
        if (!document.contains(el) && !_wrapper) { _unsub(); _obs.disconnect(); }
    });
    _obs.observe(document.body, { childList: true, subtree: true });
}
```

---

#### 🎈 Type 2: Floating UI (Dropdowns, Popups, Tooltips)
> Examples: `MpiDropdown`, `MpiPopup`

Non-blocking UI that portals to `document.body`. They **must**:

| Requirement | Where | Detail |
|---|---|---|
| `Events.on('ui:close-all-popups')` | In `setup` | Must self-close when a blocking overlay opens. |
| `MutationObserver` cleanup | In `setup` | Portal nodes must self-destroy when the anchor element is removed from the DOM. |

No `Overlays` registration — these are non-blocking.

---

#### ⌨️ Type 3: Components with keyboard shortcuts
> Example: A run button that responds to `Ctrl+Enter`

| Requirement | Where | Detail |
|---|---|---|
| `Hotkeys.register(key, fn)` | In `setup` or `el.show` | Never add raw `window.addEventListener('keydown')`. |
| `Hotkeys.unregister(key, fn)` | On `el.hide` or `destroy` | Prevents ghost handlers after the component is hidden or removed. |

```javascript
import { Hotkeys } from '../../../managers/hotkeyManager.js';

setup: (el, props, emit) => {
    const _handleRun = () => emit('run');
    Hotkeys.register('control+enter', _handleRun);

    el.destroy = () => Hotkeys.unregister('control+enter', _handleRun);
}
```

---

### Anti-Patterns to Avoid

| ❌ Anti-Pattern | ✅ Correct Approach |
|---|---|
| Caller creates a backdrop div with inline styles | Component creates it inside `_doShow()` |
| Caller sets `popupWrap.style.display = 'block'` to show dialog | Component calls `el.show()` |
| `el.hide()` calls `emit('cancel')` | Only the Cancel button emits `'cancel'` |
| `window.addEventListener('keydown', ...)` in a component | `Hotkeys.register(key, fn)` |
| Caller imports `overlayManager` to register the component | Component registers itself inside `el.show()` |
| Manual `isVisible` flag toggling by the caller | All state is internal to the component |

---

## 🔄 Lifecycle & Portal Persistence

Because MpiAiSuite tools often swap large portions of the DOM (e.g., `MpiOverlay` replacing the tool area), components must distinguish between **temporary detachment** and **permanent removal**.

### 1. The Stash Pattern (For Overlays)
When an overlay or tool-switcher clears a container, it **MUST NOT** use `.innerHTML = ''`. Instead, it should "stash" existing nodes in a hidden container to keep their lifecycle observers and portals alive.

```javascript
// Correct way to "clear" a container for an overlay
const _stash = document.createElement('div');
_stash.style.display = 'none';
while (container.firstChild) _stash.appendChild(container.firstChild);
container.appendChild(_stash);  // Keeps nodes in document.contains()
container.appendChild(overlayEl);
```

### 2. Portal Cleanup (MutationObserver)
Components that append elements to `document.body` (Portals) must use a `MutationObserver` to clean up their body-level nodes. However, they should only trigger cleanup if their **own anchor/trigger** is truly gone from the document.

```javascript
const observer = new MutationObserver(() => {
    if (!document.contains(anchorEl)) {
        portalNode.remove(); // Permanent cleanup
        observer.disconnect();
        unsubBus(); // Cleanup any Events.on listeners
    }
});
observer.observe(document.body, { childList: true, subtree: true });
```

---

## 🤖 Agent Workflow for UI Changes

1.  **Check `js/components/types.js`** to see if a suitable Primitive or Compound exists.
2.  **Read `js/components/README.md`** for technical implementation details.
3.  **If creating a new component**: Choose the correct Tier and implement following the Factory pattern.
4.  **Determine component type** (Blocking UI / Floating UI / Shortcut-enabled) and apply the integration rules from the **Integration Matrix** above.
5.  **If modifying a page**: Locate the mount point in the HTML template and use the component's `.mount()` method in the controller. Never import managers in page-level code to manage a component.
6.  **Add to gallery**: Every new component must have a demo in `js/pages/components.js` using `el.show()` — not manual backdrop toggling.
