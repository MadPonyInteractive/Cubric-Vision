# js/tools — Tool System Overview

This folder contains all workspace pages and tools for MpiAiSuite.
Each entry lives in its own self-contained folder and is lazy-loaded by `navigation.js` only when the user navigates to it.

---

## Current Views

| View ID | Type | Description |
|---|---|---|
| `workspace` | Workspace root | Main Gallery — all project media. Default on project open. |
| `imageWorkspace` | Workspace | Image Gallery — project images only. |
| `videoWorkspace` | Workspace | Video Gallery — project videos only. |
| `audioWorkspace` | Workspace | Audio Gallery — project audio only. |
| `generator` | Tool | Image Generator. Parent: `imageWorkspace`. |
| `upscaler` | Tool | Image Upscaler. Parent: `imageWorkspace`. |

---

## Navigation Model

The app uses a history-stack router (`js/router.js`). All workspace views are identified by a `view` string in the route params:

```
PAGE_WORKSPACE + { view: 'workspace' }      → Main Gallery (default)
PAGE_WORKSPACE + { view: 'imageWorkspace' } → Image Gallery
PAGE_WORKSPACE + { view: 'videoWorkspace' } → Video Gallery
PAGE_WORKSPACE + { view: 'audioWorkspace' } → Audio Gallery
PAGE_WORKSPACE + { view: 'generator' }      → Generator tool
PAGE_WORKSPACE + { view: 'upscaler' }       → Upscaler tool
```

When a view is activated, `navigation.js`:
1. Updates the breadcrumb (`MpiProjectName`) — root, workspace, and tool segments.
2. Switches the radial menu context via `el.setContextItems()`.
3. Lazy-imports the module and calls `mount(container)`.

The back arrow and breadcrumb clicks use the history stack (`back()` in `router.js`) — no hardcoded routes.

---

## Breadcrumb Behaviour

The breadcrumb shows up to three clickable segments depending on where the user is:

| View | Breadcrumb |
|---|---|
| `workspace` | *(nothing — already at root)* |
| `imageWorkspace` | `MAIN GALLERY` |
| `generator` | `MAIN GALLERY › IMAGE` |

- **MAIN GALLERY** — always links back to `workspace`
- **IMAGE / VIDEO / AUDIO** — links back to the parent workspace
- **GENERATOR / UPSCALER** — plain text (current page, not clickable)

---

## Radial Menu

The radial has no built-in actions. All context items are injected by `navigation.js` via `el.setContextItems(ctx, items)` at startup. The radial is a pure renderer mounted in `#radial-mount` (outside `#tool-container`) so it persists across view changes.

Context definitions live in `RADIAL_CONTEXTS` in `js/shell/navigation.js`:

```js
const RADIAL_CONTEXTS = {
    workspace: [
        { action: 'imageWorkspace', label: 'Image', icon: 'image' },
        { action: 'videoWorkspace', label: 'Video', icon: 'video' },
        { action: 'audioWorkspace', label: 'Audio', icon: 'audio' },
    ],
    imageWorkspace: [
        { action: 'generator',  label: 'Generate',  icon: 'generate' },
        { action: 'upscaler',   label: 'Upscale',   icon: 'upscaler' },
        { action: 'workspace',  label: '← Gallery', icon: 'back' },
    ],
    generator: [
        { action: 'upscaler',       label: 'Upscaler',  icon: 'upscaler' },
        { action: 'imageWorkspace', label: '← Gallery', icon: 'back' },
    ],
    // ...
};
```

`action` values must match a view ID handled in `_importView()`.

---

## Folder Structure

```
js/tools/
  <viewId>/
    <viewId>.js    ← exports mount(container)  (required)
    <viewId>.css   ← BEM-scoped styles         (required, even if empty)
    manifest.js    ← tool descriptor           (required for tools, optional for workspaces)
```

---

## manifest.js (tools only)

Tools must declare their parent workspace so the breadcrumb can resolve the correct label.

```js
export default {
    id:        'generator',                      // matches the view ID
    label:     'Generator',                      // human-readable
    workspace: 'image',                          // parent: 'image' | 'video' | 'audio'
    icon:      'generate',                       // key from js/utils/icons.js
    entry:     'js/tools/generator/generator.js',
};
```

---

## Tool Module

Every view must export a `mount(container)` function — the only contract the navigation system requires.

```js
// generator.js
import { Events } from '../../events.js';

const _ch = Events.channel('generator');

export function mount(container) {
    container.innerHTML = `<div class="generator"> ... </div>`;
    // _ch.on() / _ch.emit() for tool-level events
    // state.workspaces.image for workspace-scoped data
}
```

**Rules:**
- Import only from `../../events.js`, `../../state.js`, `../../utils/`, `../../components/`.
- Never import from `shell/` or `managers/`.
- Use `Events.channel('toolName')` to namespace all events.
- BEM-prefix all CSS classes: `.generator__panel`, `.generator--active`.

---

## Adding a New Tool — Checklist

1. Create `js/tools/<viewId>/` with `<viewId>.js`, `<viewId>.css`, `manifest.js`.
2. Export `mount(container)` from `<viewId>.js`.
3. Add `case '<viewId>':` in `_importView()` in `js/shell/navigation.js`.
4. Add `'<viewId>'` entry to `RADIAL_CONTEXTS` in `navigation.js`.
5. Add `'<viewId>'` to `VIEW_TOOL_LABEL` in `navigation.js`.
6. Add `'<viewId>': '<parentWorkspaceId>'` to `VIEW_TOOL_PARENT` in `navigation.js`.
7. Add a back action to the parent workspace's `RADIAL_CONTEXTS` entry if not already there.

No other files need to be touched.

---

## Adding a New Workspace — Checklist

1. Create `js/tools/<viewId>/` with `<viewId>.js` and `<viewId>.css`.
2. Export `mount(container)` from `<viewId>.js`.
3. Add `case '<viewId>':` in `_importView()` in `navigation.js`.
4. Add `'<viewId>'` entry to `RADIAL_CONTEXTS` (include a `← Gallery` back action pointing to `workspace`).
5. Add `'<viewId>'` to `VIEW_WORKSPACE_LABEL` in `navigation.js`.
6. Add `{ action: '<viewId>', label: '...', icon: '...' }` to the `workspace` entry in `RADIAL_CONTEXTS`.

---

## Overlays (Stash Pattern)

Tools that need overlays (download manager, settings, media preview) should use `MpiOverlay`. The stash pattern keeps background DOM alive without destroying component state. See `dev_docs/05_components.md` for full rules. Overlays are owned by their tool — mount inside `mount()`, keep references module-local.
