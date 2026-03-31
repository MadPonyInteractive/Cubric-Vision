---
description: Create a new MpiAiSuite component (Primitive, Compound, or Block) and register it in the Component Gallery test page.
---

# /implement_new_component

> [!IMPORTANT]
> **Read every step carefully before writing any code.** This workflow enforces the Factory-Based Component Architecture. Skipping or reordering steps creates regressions.

---

## 🔍 Pre-flight (MANDATORY — run before any code)

### Step 0 — Orient yourself
Read these files in order. Do NOT proceed until all three are read:

1. `js/components/types.js` — check if a suitable component **already exists**. If it does, use it and stop here.
2. `js/components/README.md` — technical factory workflow (mount, update, destroy).
3. `dev_docs/05_components.md` — architectural rules, tier diagram, dependency constraints.

> 🔴 **Non-starter check**: A Primitive cannot import anything. A Compound can only import Primitives. A Block can import Primitives and Compounds. Never "import up" the hierarchy.

---

## Step 1 — Decide the Tier

| What you're building | Tier | Location |
|---|---|---|
| Atomic element (button, icon, badge, input) | **Primitive** | `js/components/Primitives/MyComponent/` |
| Composed unit (icon + button, card + badge) | **Compound** | `js/components/Compounds/MyComponent/` |
| Full section (sidebar, tool header, grid) | **Block** | `js/components/Blocks/MyComponent/` |

---

## Step 2 — Create the component files

Create exactly **two** files in the component's own directory. Never add component styles to `styles.css`.

```
js/components/[Tier]/MyComponent/
  ├── MyComponent.js    ← Blueprint, template, and setup logic
  └── MyComponent.css   ← Scoped BEM styles
```

### MyComponent.js scaffold

```javascript
import { ComponentFactory } from '../../factory.js';
// Primitives only (if Compound or Block):
// import { MpiIcon } from '../Primitives/MpiIcon/MpiIcon.js';

/**
 * MyComponent — [One-line description]
 *
 * Props:
 * @param {string}  [variant='primary'] - ...
 */
export const MyComponent = ComponentFactory.create({
    name: 'MyComponent',
    css: ['js/components/[Tier]/MyComponent/MyComponent.css'],

    template: (props) => {
        const variant = props.variant || 'primary';
        return `<div class="mpi-mycomp mpi-mycomp--${variant}">
            ${props.text || ''}
        </div>`;
    },

    setup: (el, props, emit) => {
        el.addEventListener('click', () => emit('click', { variant: props.variant }));
    }
});
```

### MyComponent.css scaffold

```css
/* BEM block — never use tag selectors that could leak globally */
.mpi-mycomp { /* base styles */ }
.mpi-mycomp--primary { /* modifier */ }
.mpi-mycomp__element  { /* element  */ }
```

---

## Step 3 — Register props in types.js

Open `js/components/types.js` and add a JSDoc typedef **before** the `MpiComponentInstance` typedef at the bottom:

```javascript
/**
 * @typedef {Object} MyComponentProps
 * @property {'primary'|'danger'} [variant='primary'] - Visual variant
 * @property {string} [text] - Display text
 */
```

> This is the single source of truth for AI agents. Keep it accurate and complete.

---

## Step 4 — Wire to the Component Gallery (test page)

The gallery has **two files to touch**. HTML comes first, JS second.

### 4a — tpl-components.html

Open `templates/tpl-components.html`. Locate the correct section:

| Tier | Section element ID | Grid element ID | When to use |
|---|---|---|---|
| **Primitive (static)** | `section-Primitives` | `grid-Primitives` | Buttons, badges, inputs with fixed variants |
| **Compound** | `section-Compounds` | `grid-Compounds` | Composed units |
| **Block** | `section-Blocks` | `grid-Blocks` | Full sections |
| **Primitive (dynamic registry)** | `section-MyComponent` | `grid-MyComponent` | When variants come from a live JS-exported registry (e.g. `ICONS`) |

**Static variants** — add one `comp-card` per variant inside the correct section:

```html
<!-- MyComponent — inside grid-Primitives or grid-Compounds -->
<div class="comp-card" data-name="mycomponent" data-label="primary">
    <div class="comp-card-header">
        <span class="comp-card-name">MyComponent</span>
        <span class="comp-card-badge">primary</span>
    </div>
    <div class="comp-card-preview" id="preview-mycomp-primary"></div>
</div>
```

**Dynamic registry** — add only an empty shell (JS builds all cards):

```html
<!-- ══════════════════════════════════════
     MY COMPONENT  (cards injected by components.js)
    ══════════════════════════════════════ -->
<section class="comp-section" id="section-MyComponent">
    <h3 class="comp-section-title">My Component</h3>
    <div class="comp-grid" id="grid-MyComponent"></div>
</section>
```

> [!NOTE]
> Use the dynamic approach only when variants are derived from a JS-exported registry object (like `export const ICONS`). For everything else, use static cards.

---

### 4b — js/pages/components.js

Make **four** changes in order:

**① Import the component** (grouped with its tier):

```javascript
import { MyComponent } from '../components/[Tier]/MyComponent/MyComponent.js';
// If dynamic: also import the registry
import { MyComponent, MY_REGISTRY } from '../components/[Tier]/MyComponent/MyComponent.js';
```

**② Call the builder / pass to mountAll** inside `initComponentsPage()`:

```javascript
// Static: pass into mountAll
mountAll(MpiButton, MpiIcon, MpiIconButton, MyComponent);

// Dynamic: call a dedicated builder before mountAll
buildMyComponentSection();
mountAll(MpiButton, MpiIcon, MpiIconButton);
```

**③ Add mount calls** — static inside `mountAll()`, dynamic as a new `buildXxxSection()` function.

*Static pattern:*
```javascript
// ── MyComponent ───────────────────────────────────────────────────────────
mount('preview-mycomp-primary', () =>
    MyComponent.mount(slot('preview-mycomp-primary'), { variant: 'primary', text: 'Hello' })
);
```

*Dynamic two-pass pattern (required when building cards from a registry):*
```javascript
function buildMyComponentSection() {
    const grid = document.getElementById('grid-MyComponent');
    if (!grid) return;

    // Pass 1 — build all card shells and flush into the live DOM FIRST
    const frag = document.createDocumentFragment();
    Object.keys(MY_REGISTRY).forEach(key =>
        frag.appendChild(makeCard(`preview-mycomp-${key}`, 'MyComponent', key))
    );
    grid.appendChild(frag); // ← elements are in the live DOM NOW

    // Pass 2 — mount into slots (getElementById works only after Pass 1)
    Object.keys(MY_REGISTRY).forEach(key =>
        mount(`preview-mycomp-${key}`, () =>
            MyComponent.mount(slot(`preview-mycomp-${key}`), { name: key })
        )
    );
}

function makeCard(previewId, name, label) {
    const card = document.createElement('div');
    card.className = 'comp-card';
    card.dataset.name  = name.toLowerCase();
    card.dataset.label = label;
    card.innerHTML = `
        <div class="comp-card-header">
            <span class="comp-card-name">${name}</span>
            <span class="comp-card-badge">${label}</span>
        </div>
        <div class="comp-card-preview" id="${previewId}"></div>`;
    return card;
}
```

> [!CAUTION]
> **DOM-before-mount is the #1 failure mode.** If you call `mount()` while cards are still in a `DocumentFragment`, `document.getElementById()` returns `null` and the render is silently skipped — cards appear but stay empty. Always `grid.appendChild(frag)` before any `mount()` call.

**④ Update `filterComponents()`** — this is the step most agents miss.

If you added a **new section with a new ID** (either static with a new section element, or a new dynamic section), add its ID string to the array in `filterComponents()`:

```javascript
// Before:
['Primitives', 'MpiIcon', 'Compounds', 'Blocks'].forEach(tier => { … });

// After adding section-MyComponent:
['Primitives', 'MpiIcon', 'MyComponent', 'Compounds', 'Blocks'].forEach(tier => { … });
```

> This drives search-box hiding — if omitted, the section header will never hide when no cards match the search query.

---

## Step 5 — Verify

Reload the app and navigate to the **Component Gallery** (grid icon in the sidebar). Confirm:

- [ ] All new cards appear in the correct section.
- [ ] Preview slots render correctly (not empty).
- [ ] Search box filters by `data-name` and `data-label` correctly.
- [ ] Section hides completely when no cards match the search.
- [ ] No console errors.
- [ ] No style leakage to other sections.

---

## ❌ Common Mistakes — Do NOT do these

| Mistake | Correct approach |
|---|---|
| Adding component styles to `styles.css` | Put CSS in `MyComponent.css` only |
| Importing a Compound inside a Primitive | Primitives import nothing |
| Calling `mount()` before `grid.appendChild(frag)` in dynamic sections | Two-pass: DOM first, mount second |
| Using `document.getElementById()` on a DocumentFragment node | Append to DOM first — it returns `null` until then |
| Forgetting to update `filterComponents()` when adding a new section | Add the section ID to the array in `filterComponents()` |
| Hardcoding a variant list that mirrors a JS registry | Export the registry (`export const MY_REGISTRY`) and use `Object.keys()` |
| Duplicating or overwriting a typedef in `types.js` | One typedef per component — check for existing ones before writing |
| Skipping `types.js` | Every new component MUST have a typedef |

