# Utilities

**Authoritative sources of truth for generic functionality.** If a utility exists in `js/utils/`, use it — do not reimplement the same logic elsewhere. Always check here before writing generic data-processing or DOM-manipulation code.

## dom.js (`js/utils/dom.js`) — DOM shorthands

**Most under-used utility file.** Most agents only use `qs()` but leave the rest behind.

| Function | What it does |
|---|---|
| `qs(sel, ctx)` | Short for `querySelector` — returns first match |
| `qsAll(sel, ctx)` | Returns all matches as array |
| `on(el, evt, fn, opts?) | Short for `addEventListener` — returns unsubscribe fn |
| `ready(fn)` | Calls fn when DOM is ready |
| `createElement(html)` | Creates an element from an HTML string |
| `attr(el, k, v?) | Gets or sets an attribute |
| `remove(el)` | Removes element from DOM |

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

## seed.js (`js/utils/seed.js`) — Random seed generation

- `generateRandomSeed()`: Returns a random integer seed.
- Used by ComfyUI generation payloads to randomize output.

## Other utilities

| File | Purpose |
|---|---|
| `async.js` | Async helpers (retry, timeout, etc.) |
| `file.js` | File path manipulation and I/O helpers |
| `images.js` | Image processing helpers |
| `video.js` | Video processing helpers |
| `string.js` | String manipulation helpers |
