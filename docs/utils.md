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

## clientLogger.js (`js/services/clientLogger.js`) — the ONLY frontend log path

Never `console.log`. The renderer logs through this service, which POSTs to `/log` so lines
land in `<userData>/logs/app.log` beside the backend's.

**The API is `info` / `warn` / `error`. There is no `.log`.** Calling `clientLogger.log(...)`
throws a TypeError *at the call site*, so inside a promise chain it leaves the promise pending
forever with no visible symptom beyond "the thing that was waiting never happened" (MPI-451: the
licence dialog closed and the install queue silently wedged; it had also been killing
`MpiErrorDialog`'s open-the-created-issue step for months — the issue filed, the browser never
opened). Both fixed 2026-08-06. Grep for `clientLogger.log(` before adding one.

**The third argument is an ERROR slot, not a metadata slot.** `_send()` serializes it with
`err.stack || String(err)`, so a plain object logs the message and **silently drops every value**:

```js
clientLogger.info('x', 'paste', { manual: url.length, isCurrent: true }); // values LOST
clientLogger.info('x', `paste manual=${url.length} isCurrent=${isCurrent}`); // works
```

Interpolate values into the message string. A log line that shows up in `app.log` with no data is
this, not a code path that did not run — it cost a full user test round in MPI-311, and
`[MpiHistoryList] entry dims` has been logging bare for the same reason since before that card.

**It ships over `globalThis.fetch`, which poisons a fetch stub in a test.** A node test that swaps
`globalThis.fetch` to script a service's HTTP calls also catches every `clientLogger.*` the code
under test emits, so the call COUNT goes wrong while the behaviour is right — it reads as the
service polling one extra time (`tests/restart-drain-wait.test.cjs`: `4 !== 3`, the 4th call was a
log line). Filter the stub by URL and answer `/log` separately.

Backend logging is `routes/logger.js` — see [DEVELOPMENT.md](DEVELOPMENT.md) § One file, one writer.

## Other utilities

| File | Purpose |
|---|---|
| `async.js` | Async helpers (retry, timeout, etc.) |
| `file.js` | File path manipulation and I/O helpers |
| `images.js` | Image processing helpers |
| `video.js` | Video processing helpers |
| `string.js` | String manipulation helpers |
| `markdown.js` | The app's ONLY markdown renderer — `marked` parses, `DOMPurify` sanitizes. `renderMarkdown` (document), `renderInlineMarkdown` (one line, no `<p>`), `renderMarkdownInto(el, src)`, `wireMarkdownLinks(el)` (call once; routes links to the user's browser). Style output with `.mpi-md` from `styles/markdown.css`. Never hand-roll markdown or `innerHTML` unsanitized output. |
