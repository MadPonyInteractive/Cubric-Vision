# Fix: Delete-Project Bug (`bug_mo91gmlnct2wt2`)

## Context

Current delete-project flow has three defects:

1. **400 Bad Request** on `POST /delete-project` after opening a project and returning to the landing grid — project still deletes from disk but the console fills with errors.
2. **Imported projects are wiped from disk** when the user intended to only hide them from the project page.
3. **`RangeError: Maximum call stack size exceeded`** in `init.js` — `window.alert` is overridden to call `window.MpiAlert`, which calls `window.alert` → infinite loop. Triggers whenever any error handler calls `MpiAlert`.

### Revised product decision (user)

Imported vs created projects share the same delete flow. The confirmation dialog gains a **checkbox**: "Delete files from disk". Default **checked**.

- Checked → remove from project page **and** `fs.remove(folderPath)`.
- Unchecked → remove from project page only; folder stays on disk.

To support this cleanly and keep checkbox styling consistent across the app, a new **`MpiCheckbox` primitive** is required. The existing `MpiOkCancel` compound will gain an optional `checkbox` prop that mounts the new primitive inside the dialog.

---

## Required reading before implementation

Per CLAUDE.md routing:

- `.claude/rules/components.md` — component tier rules, `ComponentFactory` contract, `setup`/`destroy` discipline, preload + types checklist.
- `.claude/rules/dos_and_donts.md` — CSS vars, icons, DOM utility shorthands.
- `.claude/rules/events.md` — only if dialog emit signature evolves.

---

## Root Causes

### 400 Bad Request
`routes/projects.js:189-201` returns 400 when `project.json` is missing from the supplied folder. Console shows two 400s per click — likely a double-delete. `js/shell/projectUI.js:186-199` reuses a singleton `_deleteConfirmDialog` and swaps the `ok` listener via `_deleteConfirmUnsub`. After `loadProjectGrid()` rebuilds the cards on return from a project, re-entry into `_showDeleteConfirm` may wire two handlers if the old unsub path races with a new card's `delete` click. Will confirm with a one-line `console.trace` during implementation; the fix is an unconditional unsub at the top of `_showDeleteConfirm` before any new registration, and removing the singleton pattern in favor of a fresh mount per confirmation.

### MpiAlert recursion
`js/init.js:9-12`:
```js
window.MpiAlert = (msg) => alert(msg);
window.alert    = (msg) => window.MpiAlert(msg);
```
Mutual recursion. Fix by capturing native `alert` before reassigning, or (simpler) by not overriding `window.alert` at all.

### Imported projects wiped
`deleteProject` (`js/services/projectService.js:249-256`) unconditionally hits the backend which unconditionally `fs.remove`s. No affordance for "registry-only" removal. The extras registry is `Storage.getExtraProjectPaths()` — a list of *parent directories* (`js/core/storage.js:40-41`).

---

## Plan

### Step 1 — Fix `init.js` alert recursion

**File:** `js/init.js`

Replace lines 7-12 with:

```js
const _nativeAlert   = window.alert.bind(window);
const _nativeConfirm = window.confirm.bind(window);
const _nativePrompt  = window.prompt.bind(window);

window.MpiAlert   = (msg)      => _nativeAlert(msg);
window.MpiConfirm = (msg)      => _nativeConfirm(msg);
window.MpiPrompt  = (msg, def) => _nativePrompt(msg, def);
// Do NOT override window.alert — caused infinite recursion with MpiAlert.
```

### Step 2 — Build `MpiCheckbox` primitive

**New files:**
- `js/components/Primitives/MpiCheckbox/MpiCheckbox.js`
- `js/components/Primitives/MpiCheckbox/MpiCheckbox.css`

**Props:**
| Prop | Type | Default | Description |
|---|---|---|---|
| `checked` | boolean | `false` | Initial checked state |
| `label` | string | `''` | Optional text; when empty, renders checkbox only |
| `name` | string | `'checkbox'` | Accessibility / form name |
| `disabled` | boolean | `false` | Disables interaction |

**Emits:**
- `change` `{ checked: boolean }`

**Pattern** (follows `ComponentFactory` skeleton, zero imports — Primitive tier):

```js
import { ComponentFactory } from '../../factory.js';

export const MpiCheckbox = ComponentFactory.create({
    name: 'MpiCheckbox',
    css: ['js/components/Primitives/MpiCheckbox/MpiCheckbox.css'],

    template: (props) => {
        const checked  = props.checked ? 'checked' : '';
        const disabled = props.disabled ? 'disabled' : '';
        const name     = props.name || 'checkbox';
        const label    = props.label || '';
        const labelHtml = label
            ? `<span class="mpi-checkbox__label">${label}</span>`
            : '';
        return `
            <label class="mpi-checkbox">
                <input type="checkbox" class="mpi-checkbox__input"
                       name="${name}" ${checked} ${disabled}>
                <span class="mpi-checkbox__box" aria-hidden="true"></span>
                ${labelHtml}
            </label>
        `;
    },

    setup: (el, props, emit) => {
        const input = el.querySelector('.mpi-checkbox__input');
        input.addEventListener('change', () => {
            props.checked = input.checked;
            emit('change', { checked: input.checked });
        });
        // Instance helpers
        el.isChecked = () => input.checked;
        el.setChecked = (v) => { input.checked = !!v; };
    }
});
```

**CSS:** BEM `.mpi-checkbox`, `.mpi-checkbox__input` (visually hidden), `.mpi-checkbox__box` (styled square, uses `--surface`, `--border`, `--accent`), `.mpi-checkbox__label`. Use `styles/01_base.css` variables only. Include `:focus-visible` ring and `:disabled` opacity.

**Checklist (mandatory per `.claude/rules/components.md`):**
- Add `'js/components/Primitives/MpiCheckbox/MpiCheckbox.css'` to `js/shell/preloadStyles.js`.
- Add `MpiCheckboxProps` JSDoc to `js/components/types.js` next to other Primitive typedefs (~line 129 area).
- Ask user whether to add to the component gallery (`js/pages/components.js`).

### Step 3 — Extend `MpiOkCancel` with optional checkbox

**File:** `js/components/Compounds/MpiOkCancel/MpiOkCancel.js`

Add prop:
| Prop | Type | Default | Description |
|---|---|---|---|
| `checkbox` | `{ label?: string, checked?: boolean } \| null` | `null` | When set, renders an `MpiCheckbox` between the input slot and the actions |

When set:
- Import `MpiCheckbox` (Compound → Primitive is allowed).
- Add a new slot `#checkbox-slot` in the template between `#input-slot` and `#actions-slot`.
- Mount `MpiCheckbox` into a fresh div, append to the slot (per Mount Target Isolation rule).
- Track its state in a local `checkboxState = { checked: initial }`; update on `change`.
- Include `checkboxChecked` in the `ok` emit payload: `emit('ok', { inputValue, checkboxChecked })`.
- When `checkbox` prop is absent/null, hide the slot with `display: none` (same pattern as `#input-slot`).

**Update** `MpiOkCancelProps` typedef in `js/components/types.js` to document the new prop and the new `ok` payload field.

**CSS:** add `.mpi-ok-cancel__checkbox { display: flex; }` to `MpiOkCancel.css`.

### Step 4 — Wire the checkbox into delete flow

**File:** `js/shell/projectUI.js`

`_showDeleteConfirm(projectName, onConfirm)` becomes `_showDeleteConfirm(projectName, onConfirm)` where `onConfirm` receives `{ deleteFiles: boolean }`:

```js
function _showDeleteConfirm(projectName, onConfirm) {
    // Unsubscribe any prior handler FIRST
    if (_deleteConfirmUnsub) { _deleteConfirmUnsub(); _deleteConfirmUnsub = null; }

    if (!_deleteConfirmDialog) {
        _deleteConfirmDialog = MpiOkCancel.mount(document.createElement('div'), {
            title: 'Delete Project',
            text: 'Are you sure you want to delete this project?',
            okLabel: 'Delete',
            cancelLabel: 'Keep it',
            checkbox: { label: 'Also delete files from disk', checked: true },
        });
    }
    _deleteConfirmUnsub = _deleteConfirmDialog.on('ok', ({ checkboxChecked }) => {
        onConfirm({ deleteFiles: !!checkboxChecked });
    });
    _deleteConfirmDialog.el.show();
}
```

Note: unsub **before** mounting/registering — fixes the double-fire that produces the duplicate 400.

Caller (line 225-234):

```js
card.on('delete', () => {
    _showDeleteConfirm(project.name, async ({ deleteFiles }) => {
        try {
            await deleteProject(project, { deleteFiles });
            loadProjectGrid();
        } catch (err) {
            window.MpiAlert('Could not delete project: ' + err.message);
        }
    });
});
```

### Step 5 — Update `deleteProject` service

**File:** `js/services/projectService.js:249-256`

```js
export async function deleteProject(project, { deleteFiles = true } = {}) {
    if (deleteFiles) {
        const result = await post('/delete-project', { folderPath: project.folderPath });
        if (!result.success) throw new Error(result.error);
    }

    // Always remove parent dir from extras registry (if present).
    // Works for both created projects (whose parent is DEFAULT_PROJECTS_ROOT,
    // which getExtraProjectPaths does not hold anyway) and imported ones.
    const parentDir = project.folderPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const extras = Storage.getExtraProjectPaths().filter(p => p !== parentDir);
    Storage.setExtraProjectPaths(extras);

    if (state.currentProject?.folderPath === project.folderPath) {
        state.currentProject = null;
        navigate(PAGE_LANDING);
    }
}
```

Note: when `deleteFiles === false` and the project lives under `DEFAULT_PROJECTS_ROOT` (created project), simply removing it from the extras list won't hide it — it's still surfaced by the server scan of the default root. Accept this: it is the user's explicit choice ("remove from project page only"). If that proves surprising, follow up with a client-side "hidden projects" list. Out of scope here.

**Edge case:** parent dir may host multiple imported projects. Filtering the extras drops siblings from the list, but they will re-register next time the user opens or imports any of them. Acceptable trade-off; document in commit message.

### Step 6 — Verification

1. `npm start` (or project-standard runner).
2. **Created project, simple delete:** create project → delete with checkbox **checked** → card disappears, folder removed from `projects/`, zero console errors.
3. **Created project, enter/leave/delete:** create → open → return to landing → delete (checkbox checked). Confirm: only one `POST /delete-project`, no 400, no `RangeError`.
4. **Imported project, disk-preserve:** import external folder → delete with checkbox **unchecked** → card gone from page, folder **still on disk**, extras entry removed (`DevTools → Application → Local Storage → mpi:extraProjectPaths`).
5. **Imported project, full delete:** import → delete with checkbox **checked** → card gone, folder removed from disk.
6. **Alert path:** force an error (rename folder before delete), confirm `MpiAlert` shows the message without recursion.
7. **Checkbox primitive gallery:** if user opts in to step 2, verify it renders with and without `label`.
8. `tracker_update` id `bug_mo91gmlnct2wt2` → status `done`.

---

## Critical Files

| File | Action |
|---|---|
| `js/init.js` | Fix alert recursion (step 1) |
| `js/components/Primitives/MpiCheckbox/MpiCheckbox.js` | **New** primitive (step 2) |
| `js/components/Primitives/MpiCheckbox/MpiCheckbox.css` | **New** primitive styles (step 2) |
| `js/shell/preloadStyles.js` | Register new CSS (step 2) |
| `js/components/types.js` | Add `MpiCheckboxProps`; update `MpiOkCancelProps` (steps 2, 3) |
| `js/components/Compounds/MpiOkCancel/MpiOkCancel.js` | Add `checkbox` prop (step 3) |
| `js/components/Compounds/MpiOkCancel/MpiOkCancel.css` | New slot style (step 3) |
| `js/shell/projectUI.js` | Dialog wiring + unsub-first fix (step 4) |
| `js/services/projectService.js` | `deleteProject` accepts `{ deleteFiles }` (step 5) |
| (optional) `js/pages/components.js` | Gallery entry for `MpiCheckbox` if user approves |

## Out of scope

- Changing the extras-list data shape (still parent-dir keyed).
- Adding a persisted "hidden projects" list for created-project registry-only removal.
- Swapping native `MpiAlert` for an `MpiOkCancel`-based variant (separate follow-up).
- Backend `_imported` tagging — no longer needed under the unified delete flow.
