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

## Other utilities

| File | Purpose |
|---|---|
| `async.js` | Async helpers (retry, timeout, etc.) |
| `file.js` | File path manipulation and I/O helpers |
| `images.js` | Image processing helpers |
| `video.js` | Video processing helpers |
| `string.js` | String manipulation helpers |
