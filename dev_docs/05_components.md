# Component System Architecture (2026-03-30 Update)

# 🤖 IMPORTANT for agents 
## CRITICAL Must Read: `dev_docs/05_components.md`
## Use JSDocs extensively
## Use the `styles/01_base.css` as the source of thruth for styles
## USe `js/utils/dom.js` for shorthands
## use `js/utils/` where appropriate
## Do not commit git
## Do not test
## Ask questions if goal not clear
## Remember to update `js/shell.js` and `js/components/types.js` if adding or removing components and add your new components variants to the components galery: 
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
- **Vitals**: Add the CSS path to `js/shell.js` to prevent flickering.
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

## ⌨️ Global Interaction Management (2026-04-03)

ALL interactive components must register with the global Managers to ensure the app remains accessible and bug-free.

### 1. Hotkeys (`js/managers/hotkeyManager.js`)
Do not add global `keydown` listeners. Instead, register with the manager in your component's `setup` or upon `show`:

```javascript
import { Hotkeys } from '../../../managers/hotkeyManager.js';

setup: (el, props, emit) => {
    const handleAction = () => emit('action');
    Hotkeys.register('control+enter', handleAction);
}
```

### 2. Overlays & Modals (`js/managers/overlayManager.js`)
If your component obscures the UI or blocks user flow (Modals, Overlays, Dialogs), it **MUST** use the queue system. Only one overlay can be active at once.

```javascript
import { Overlays } from '../../../managers/overlayManager.js';

el.show = () => {
    Overlays.request({
        show: () => { /* Actual display logic */ },
        hide: () => { /* Actual hide logic */ },
        id: el // Unique identifier
    });
};

el.hide = () => {
    // Release the queue so the next overlay can show
    Overlays.release(el); 
};
```

### 3. Floating UI & Popups (`ui:close-all-popups`)
Any component that portals to `document.body` (Popups, Dropdowns, Selectors) **MUST** listen for the global `ui:close-all-popups` event. This ensures that floating elements don't remain visible when a blocking overlay or modal is opened.

```javascript
import { Events } from '../../../events.js';

setup: (el, props, emit) => {
    const unsub = Events.on('ui:close-all-popups', () => {
        if (props.show) hideMyPopup(); // Logic to close your floating UI
    });
    
    // IMPORTANT: Cleanup subscription when component is destroyed
    // See "Lifecycle & Portal Persistence" below.
}
```

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
4.  **If modifying a page**: Locate the mount point in the HTML template and use the component's `.mount()` method in the controller.
