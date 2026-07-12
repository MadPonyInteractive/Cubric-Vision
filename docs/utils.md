# Utilities

**Authoritative sources of truth for generic functionality.** If a utility exists in `js/utils/`, use it — do not reimplement the same logic elsewhere. Always check here before writing generic data-processing or DOM-manipulation code.

## dom.js (`js/utils/dom.js`) — DOM shorthands

**Most under-used utility file.** Most agents only use `qs()` but leave the rest behind.

| Function | What it does |
|---|---|
| `qs(sel, root?)` | Short for `querySelector` — returns first match; scopes to `document` if root omitted |
| `qsa(sel, root?)` | Short for `querySelectorAll` — returns Array (not NodeList); scopes to `document` if root omitted |
| `gid(id)` | Short for `getElementById` |
| `on(el, event, fn, opts?)` | Adds event listener — returns a cleanup (remove) function |
| `off(el, event, fn, opts?)` | Removes event listener — returns a re-add function |
| `ce(tag, props?, children?)` | Creates an element via `document.createElement`; assigns props and appends children |

**Rule:** Never use raw `document.querySelector` or `addEventListener`. Always use the shorthands here.

## icons.js (`js/utils/icons.js`) — SVG icon library

**The only permitted source of SVG icons.** Never paste raw SVG into templates.

- `icons.get(name)`: Returns the SVG string for the named icon.
- All icon names are defined in this file — if an icon doesn't exist, add it here first.
- Icons are referenced by name string, not by raw SVG.

## ratios.js (`js/utils/ratios.js`) — Aspect ratios

**Source of truth for all image/canvas aspect ratios.**

- `RATIOS` constant: named aspect ratio definitions (e.g. `RATIOS.square`, `RATIOS.landscape16x9`).
- Used by workspaces and components to maintain consistent proportional layouts.

## mediaActions.js (`js/utils/mediaActions.js`) — save/download media to disk

**The only path for exporting a file to disk. Never add a `dialog.showSaveDialog` / `save-*` IPC for this.** Recurring wrong turn: an agent wanting to export a file proposes a new save-as IPC. It already exists via `<a download>`.

- `downloadMediaFiles(project, items)` — the shared export path. Single item → `<a download="name.ext" href="/project-file?path=...">`; multiple → the ONE existing IPC `save-files-to-folder` (folder picker + bulk copy, `main.js` ~L920).
- **In packaged Electron a single-file `<a download>` click triggers Chromium's native Save-As dialog** (folder browse + editable filename + Save-as-type) — it does NOT silently drop into Downloads. That IS the file browser; no `showSaveDialog` needed. (User-confirmed 2026-07-12.)
- The only existing dialog IPCs are `choose-folder` and `save-files-to-folder` — both **folder** pickers, not file save-as. Neither is needed for single-file save.
- Exporting a FRESH output the user never saved to the project (e.g. a GIF): write it to a temp file → expose via `/project-file?path=<temp>` → `<a download="clip.gif">`. No new IPC.
- Also here: `extractAbsPath`, `extractFilenameFromPath`, `resolveMediaUrl` (path/URL normalization for `<img>`/`<video>` src), `deleteMediaFiles`.

## Other utilities

| File | Purpose |
|---|---|
| `async.js` | Async helpers (retry, timeout, etc.) |
| `file.js` | File path manipulation and I/O helpers |
| `images.js` | Image processing helpers |
| `video.js` | Video processing helpers |
| `string.js` | String manipulation helpers |
