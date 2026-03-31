# Component Architecture Guide (MpiAiSuite)

> [!NOTE]
> **READ THIS BEFORE DESIGNING UI.** This system replaces ad-hoc HTML templates with standardized, reusable components to ensure stability and low AI token usage.

---

## 🏗️ The Tiered System (Hierarchy)

| Level | Name | Purpose | Imports |
|---|---|---|---|
| **Tier 1** | **Primitives** | Atomic elements (Buttons, Badges, Inputs) | Nothing (Self-contained) |
| **Tier 2** | **Compounds** | Composed fragments (Cards, Form Groups, Modals) | Primitives |
| **Tier 3** | **Blocks** | Full page sections (User List, Hero, Sidebar) | Compounds, Primitives |

---

## 🛠️ Folder Structure

Each component must have its own directory:
```
/js/components/Primitives/MyComponent/
  ├── MyComponent.js    <-- Logic & Template
  └── MyComponent.css   <-- Scoped BEM Styles
```

---

## 🚀 The Factory Workflow

### 1. Define
Use `ComponentFactory.create()` to define a module.

```javascript
import { ComponentFactory } from '../factory.js';

export const MyButton = ComponentFactory.create({
    name: 'MyButton',
    template: (props, children) => `
        <button class="mpi-btn mpi-btn--${props.variant}">
            ${props.text}
        </button>
    `,
    css: ['js/components/Primitives/MyButton/MyButton.css'], // Auto-injected
    setup: (el, props, emit) => {
        el.onclick = () => emit('click', { id: props.id });
    }
});
```

### 2. Mount
Call the `mount()` method to inject it into the DOM.

```javascript
const btn = MyButton.mount(container, { text: 'Save', variant: 'primary' });

// Listen for internal event
btn.on('click', (data) => console.log('Button clicked!', data));

// Bubbling Event (Page Level)
document.addEventListener('mybutton:click', (e) => {
    // e.detail contains the data
});
```

### 3. Update & Destroy
```javascript
btn.update({ text: 'Saved!' }); // Re-renders
btn.destroy();                  // Removes from DOM
```

---

## 🎨 Styling Rules (BEM Standards)

Use strict **BEM (Block Element Modifier)** naming to prevent style leakage:
- **Block**: `.mpi-card`
- **Element**: `.mpi-card__header`
- **Modifier**: `.mpi-card--elevated`
- **Avoid**: Nested tag selectors (e.g., `div > p`) which create global breakage.

---

## 🧠 AI Agent Protocol

1.  **Read `types.js`**: Check available props for any component before using it.
2.  **Use Central Registry**: (Planned) Always use components from the shared registry where possible.
3.  **No Global CSS**: Never add component styles to `styles.css`. Keep them in the component folder.
