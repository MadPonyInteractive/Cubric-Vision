# Component System Architecture (2026-03-30 Update)

> [!IMPORTANT]
> **ATTENTION AGENTS**: MpiAiSuite is currently transitioning from an ad-hoc template-based UI to a formal **Factory-Based Component Architecture**. ALL new UI elements must be implemented using this system. Legacy tools are being migrated gradually.

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

## 🛠️ How to Implement a Component

### 1. Structure
Every component must live in its own directory within `js/components/[Tier]/[ComponentName]/`.
```
MyComponent/
  ├── MyComponent.js    <-- Blueprint, Template, and Logic
  └── MyComponent.css   <-- Scoped Styles (using BEM naming)
```

### 2. The Blueprint (`ComponentFactory`)
All components use the central engine at `js/components/factory.js`.

```javascript
import { ComponentFactory } from '../../factory.js';

export const MyComponent = ComponentFactory.create({
    name: 'MyComponent',
    // Template: Return a string. Logic is bound in setup.
    template: (props, children) => `
        <div class="mpi-comp mpi-comp--${props.variant}">
            ${props.text}
        </div>
    `,
    // CSS: Handled by the factory to avoid duplicate injections
    css: ['js/components/Primitives/MyComponent/MyComponent.css'],
    // Setup: Attach DOM events and logic here
    setup: (el, props, emit) => {
        el.onclick = () => emit('action', { value: props.val });
    }
});
```

### 3. JSDoc Types
Add all component properties to `js/components/types.js`. This allows other agents to understand your component's API via a single, low-token file.

---

## 🔗 Communication Protocol

Components use a **Dual-Event System**:
1.  **Direct (`on`)**: Use `instance.on('event', cb)` for parent-to-child communication.
2.  **Bubbling (`CustomEvent`)**: Every `emit` also triggers a standard DOM event (e.g., `mycomponent:action`) that bubbles up. This allows **Page-Level Delegation** in the tool's `.js` or `.events.js` file.

## 🎨 Styling Standards (BEM)

Since there is no bundler, we use strict **BEM (Block Element Modifier)** conventions to ensure styles don't leak:
- `.mpi-block`
- `.mpi-block__element`
- `.mpi-block--modifier`

---

## 🤖 Agent Workflow for UI Changes

1.  **Check `js/components/types.js`** to see if a suitable Primitive or Compound exists.
2.  **Read `js/components/README.md`** for technical implementation details.
3.  **If creating a new component**: Choose the correct Tier and implement following the Factory pattern.
4.  **If modifying a page**: Locate the mount point in the HTML template and use the component's `.mount()` method in the controller.
