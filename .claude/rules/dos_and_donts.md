# General Best Practices (Do's and Don'ts)

> **AI INSTRUCTION:** Before writing any new logic or styles, you MUST verify if a utility or CSS variable already exists. Reinventing the wheel is strictly forbidden in this codebase.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves DOM work, CSS, utilities, or icons.

- **Never hardcode colors.** OKLCH variables only — from `styles/01_base.css`. No hex, no named colors, no `rgb()`/`hsl()` literals. Canonical token families: `--surface-{0,1,2,3,bar,canvas}`, `--ink-{1,2,3,4}`, `--line`/`--line-soft`, `--accent-{heat,frost,ok,warn}`, `--t-*` (type), `--s-*` (spacing), `--r-*` (radius), `--ease`/`--t-fast|base|slow` (motion). Legacy `--neon-*`, `--bg*`, `--primary*`, `--surface-glass`, `--text*`, `--border*`, `--radius*`, `--font-main`/`--font-display` are **removed** — do not reintroduce.
- **Stage design baseline:** sharp corners default (`--r-1: 0`), no glow, no `backdrop-filter`, no glassmorphism. Pass `shape:'pill'` to opt into rounded buttons. Gradient text only on the wordmark.
- **Never paste raw SVG.** Import from `js/utils/icons.js`. If the icon is missing, add it there first.
- **Icon stroke is auto-detected — never pass `stroke: true` to `MpiButton`.** Name icons with `ratio_` prefix or `_stroke` suffix and `renderIcon()` handles stroke automatically.
- **Never use raw `document.querySelector`.** Use `js/utils/dom.js` shorthands.
- **BEM naming is mandatory.** Format: `.mpi-block__element--modifier`.
- **For image surfaces: prefer CSS `transform` on a stack element over `ctx.translate/scale`.** CSS transform uses the GPU compositor — no re-rasterize per frame. `ctx` transforms belong only to screen-UI overlays drawn in container px.
- **Check `js/utils/` before writing any generic logic** — `async.js`, `file.js`, `images.js`, `video.js`, `mediaDimensions.js`, `string.js`, `ratios.js`, `markdown.js` may already do what you need.
- **Never hand-roll markdown.** `js/utils/markdown.js` is the ONE renderer (`marked` parses, `DOMPurify` sanitizes): `renderMarkdown(src)` for a document, `renderInlineMarkdown(src)` for a single line with no `<p>` wrapper, `renderMarkdownInto(el, src)` + `wireMarkdownLinks(el)` for a live pane. Never `innerHTML` markdown output that did not go through it — notes arrive inside project folders the user may not have written. Style the result with the shared `.mpi-md` block in `styles/markdown.css`; do not restyle headings/tables per component.
- **Frontend logging:** `import { clientLogger } from '../services/clientLogger.js'` — never use bare `console.log/error`.
- **Backend logging:** `const logger = require('./logger')` from `routes/logger.js`.
- **🔴 Mutating a mask or paint LAYER? It must be undoable.** `MpiCanvas` owns a shared
  `UndoStack` (MPI-376). Any new code that writes `manualCanvas` / `subtractCanvas` — or a
  future paint layer — records an entry FIRST or it silently punches a hole in Ctrl+Z. A
  gesture uses `undo.begin(layers)` / `commit(dirtyRect)`; a one-shot layer-wide op uses
  `mask._recordUndo()` before mutating. **Read `docs/masking-undo.md` before touching any
  layer.** Undo that works for some edits and not others is worse than none — the user learns
  to trust it, then loses work at the first unwired path.

## 🧰 The Utilities Folder (`js/utils/`)

Whenever you need generic functionality, ALWAYS check the `js/utils/` directory first. If a pattern is repeated across components, abstract it into a utility file here.

### Critical Utilities You MUST Use:
1. **`icons.js` (The Icon Source of Truth):** 
   - NEVER paste raw SVG code directly into component templates. 
   - ALL icons must be imported from `js/utils/icons.js`. If an icon doesn't exist, add it to this file first.
   - **Stroke is auto-detected by `renderIcon()` — never pass `stroke: true` to `MpiButton`.** Icons render as stroke automatically if: the name starts with `ratio_`, the name ends with `_stroke`, or it is in the built-in list (`seed`, `gallery`). Name your icon accordingly and stroke is free.
   - **For outline/stroke icons:** use the `_stroke` suffix (e.g. `refresh_stroke`). For ratio/rect icons: use the `ratio_` prefix (e.g. `ratio_16_9`). No extra props needed.
2. **`dom.js` (DOM Shorthands):** 
   - Use the shorthands in this file instead of raw, verbose `document.querySelector` or generic DOM manipulation where applicable.
3. **`ratios.js` (Aspect Ratios):** 
   - The absolute source of truth for all image/canvas aspect ratios. 

**Other available utilities you should check before writing code:**
- `async.js`
- `file.js`
- `images.js`
- `video.js`
- `mediaDimensions.js` — measure pixel dimensions (`{w,h}`) from `File`/`Blob`/URL for images or videos. Use before uploads that populate sidecar `pixelDimensions`.
- `string.js`
- `markdown.js` — the app's ONLY markdown renderer (MPI-545). `marked` + `DOMPurify`, both zero-dependency single-file browser ESM imported straight from `node_modules/` (no bundler; `express.static(__dirname)` serves them and `electron-builder.yml` ships them). Exports `renderMarkdown` (document), `renderInlineMarkdown` (one line, no `<p>`), `renderMarkdownInto(el, src)` (tags `.mpi-md`, safe to re-call) and `wireMarkdownLinks(el)` (call ONCE — a bare `<a>` click would navigate the whole Electron app away; collect the returned unsubscribe in `_unsubs`). Consumers: `MpiNotesEditor` (project + card notes) and `MpiChangelogDialog` (release notes — it takes full markdown now, even though no shipped version's notes use any yet). Shared typography lives in `styles/markdown.css` as `.mpi-md`.

> **Rule of Thumb:** If you write a block of generic data-processing or DOM-manipulation code that isn't completely specific to a single component, it belongs in `js/utils/`.

---

## 🎨 CSS & Styling (The Source of Truth)

### 🔴 The "No Hardcoding" Rule
1. **NEVER hardcode colors:** Do not use raw hex codes (e.g., `#ff0000`), standard CSS colors (e.g., `purple`), or `rgb()`/`hsl()` literals in your `.css` files. All color values MUST be OKLCH and must come from the token block in `styles/01_base.css`.
2. **Use the Base Variables:** You MUST pull colors, spacing, radii, type sizes, and motion timings from the CSS variables in `styles/01_base.css`. Canonical token families:
   - **Surfaces:** `--surface-0`, `--surface-1`, `--surface-2`, `--surface-3`, `--surface-bar`, `--surface-canvas`
   - **Ink (text):** `--ink-1`, `--ink-2`, `--ink-3`, `--ink-4`
   - **Lines:** `--line`, `--line-soft`
   - **Accents:** `--accent-heat` (pink/magenta — primary), `--accent-frost` (cyan — focus/generative), `--accent-ok`, `--accent-warn`
   - **Type scale:** `--t-2xs`…`--t-display`
   - **Spacing:** `--s-1`…`--s-8`
   - **Radius:** `--r-1` (0px, sharp default), `--r-2` (4px), `--r-3` (12px), `--r-pill` (999px)
   - **Motion:** `--ease`, `--t-fast`, `--t-base`, `--t-slow`
   - **Fonts:** body = `'JetBrains Mono', monospace`. `--font-wordmark` = `'Russo One'` (self-hosted at `assets/fonts/RussoOne-Regular.woff2`) — used ONLY for the brand wordmark (titlebar + landing hero). See `.claude/rules/components.md` § Stage design baseline.
3. **Template UI Adherence:** The active design system is **Stage** (see `docs/redesign/`). Stage = OKLCH mauve surfaces, heat/frost accents, sharp corners by default, **no neon glow, no glass blur, no `backdrop-filter`**. Legacy tokens `--bg`, `--bg-light`, `--bg-dark`, `--bg-elevated`, `--bg-recessed`, `--bg-modal`, `--surface`, `--surface-glass`, `--neon-electric`, `--neon-glow*`, `--neon-accent`, `--neon-border`, `--primary`, `--primary-dim`, `--text*`, `--border*`, `--radius*`, `--font-main`, `--font-display`, `--transition`, `--bounce` have been **removed** — do not reintroduce them. The only place `background-clip: text` (gradient text) is allowed is the wordmark.

### 🔴 Class Naming Convention
- **BEM is Mandatory:** Since we do not use a standard bundler, you MUST use BEM (Block Element Modifier) architecture strictly in your component CSS.
- **Format:** `.mpi-component-name__element--modifier`. This guarantees styles do not bleed globally. 
- Example: `.mpi-btn`, `.mpi-btn__icon`, `.mpi-btn--primary`.

### 🔴 `hidden` loses to your own CSS — add the override
A class carrying `display` **outranks** the UA sheet's `[hidden] { display: none }`. So `el.hidden = true` on an element your component styles with `display: flex/block/grid` does **nothing**, silently.

- Give every such element an explicit `[hidden]` rule: `.mpi-x__thumb[hidden], .mpi-x__empty[hidden] { display: none; }`.
- Or don't render it at all — `.remove()` the node, which is the right call for a control that will never apply to this mount (a destination with no opacity slider, a front end with no second slot).
- Toggling a modifier class instead of `hidden` is equally fine; what is never fine is `hidden` alone against a `display` you wrote.

**This has shipped three times** (MPI-382 inert slider rows, MPI-373 twice — the second time with warning comments about it sitting in the same file). If you write `hidden`, grep your own `.css` for that element's `display` in the same edit.

---

## 🐞 Logging & Error Handling

> **CRITICAL:** Do NOT rely solely on `console.log()` or `console.error()`. We use custom log routing so errors can be saved to log files for production debugging.

### Node.js Backend (`routes/`, `server.js`)
If you are writing backend code, you MUST use the `routes/logger.js` file.
```javascript
const logger = require('./logger');
logger.error('system', 'Description of error', err);
```

### Browser Frontend (`js/`)
If you are writing frontend code, you MUST use the `js/services/clientLogger.js` file.
```javascript
import { clientLogger } from '../services/clientLogger.js';
clientLogger.error('comfy', 'Description of error', err);
```

### Backend logger arity — the 3rd arg is error-only

`routes/logger.js` public API: `logger.info(category, message)` — 2 args; `logger.warn(category, message)` — 2 args (3rd argument is SILENTLY DROPPED, not formatted, not logged); `logger.error(category, message, err)` — 3 args (`err.stack` appended). To attach structured detail to a `warn`/`info`, fold it into the message string yourself (e.g. `JSON.stringify(detail)`). The frontend `clientLogger` has the same trap — its 3rd arg is an ERROR slot; object payloads vanish silently. Interpolate values into the message string.

---

## 🔔 User Feedback Conventions (toast vs dialog)

- **`ui:error` → MpiErrorDialog** (GitHub-report dialog) — reserve for genuine reportable bugs, never expected transient states.
- **`ui:warning` / `ui:info` / `ui:success` → toast.**
- **No toast on user-initiated actions** (e.g. Stop) — user actions are self-evident; toasts are for NON-user events only.

---

## 🎛️ PromptBox controls — `scope` is the persistence SoT

Adding a `PROMPT_BOX_CONTROLS` control? Its `scope` (`shared` / `perOp` / `perModel`) is the **single source of truth** for persistence, sidecar snapshot, and Reuse — the machinery is `scope`-driven. **Never hand-maintain a persistence key-list** (`_MODEL_WIDE_KEYS`, the snapshot loop, the reuse loop) to make a control save or restore; if you feel the urge, the machinery regressed off `scope` — fix the machinery. Full contract + checklist: [`docs/playbooks/common/prompt-box-controls.md`](../../docs/playbooks/common/prompt-box-controls.md) (MPI-336).

---

## 🗄️ Persisted-config fields — the normalizer is a WHITELIST, on read AND write

Adding a field to `DEFAULT_RUNPOD_CONFIG` (or any config with a `normalize*` companion in [`js/core/storage.js`](../../js/core/storage.js)) is **TWO edits, not one**. `normalizeRunpodConfig` rebuilds the object field by field and runs on BOTH `getRunpodConfig` and `setRunpodConfig`, so a field present only in the defaults is **silently stripped on every save and every load** — no error, no warning. The feature appears to work in-session and forgets itself on the next boot. Same failure class as MPI-370's `requirementsDrop` vanishing through the `_createDepJob` whitelist (that field was deleted in MPI-413 — the trap is the whitelist, which is still there). Write the field into the normalizer too, and pin it with a test that fails when the normalizer line is removed (negative-control it — see [`tests/runpod-skip-local-engine.test.cjs`](../../tests/runpod-skip-local-engine.test.cjs), MPI-390).

Related: write through `state.<key>`, never `Storage.set*` directly, when the value is also mirrored in [`js/state.js`](../../js/state.js). State is seeded once at module load and write-throughs to Storage; a raw Storage write goes stale and the next state write clobbers it.

---

## 📦 Imports — depth and case sensitivity

Relative import depth varies by how deep a component sits under `js/`. Reference depths to reach `js/` root: `js/components/Compounds/<X>/file.js` → 3 ups; `js/components/Compounds/LandingPages/<X>/file.js` → 4 ups (extra `LandingPages/` segment). Wrong-depth import → boot JS halts → app stuck forever on the landing spinner; server log stays clean (error is browser-side). Case sensitivity (Linux-only): dev box is Windows (case-insensitive); Linux portables are case-sensitive. A relative import whose CASE doesn't match the on-disk filename resolves fine on Windows but 404s on Linux → same spinner failure. SWEEP before any portable/Linux release: walk the whole `js/` import graph and verify EXACT-CASE existence.

---

## 🧪 Tests — replay the shape production actually delivers

A test feeds the code YOUR model of the input. If that model is wrong, the test passes
against broken code and you ship the bug — the check is not evidence, it is a second
copy of your assumption.

- **Transcribe a real run, don't imagine one.** Pull the actual bytes/lines/events from
  `logs/app.log`, a captured payload, or the wire — then replay those. Guessed input
  shapes are where false greens come from.
- **App contradicts a passing test → suspect the TEST first.** Two live cases: MPI-315
  replayed `app.log` line-by-line while production passes multi-line CHUNKS (`.some()`
  kept all 126 lines); MPI-350's tile test called `tile()` once per tile while USDU
  emits **T+1** ticks, so the trailing tick swallowed the fix and the first cut shipped
  broken. Both suites were green.
- **Prove the test bites.** Run it against the UNFIXED code and watch it fail with the
  expected assertion. A test that passes both ways is only a guard against regression
  in the OTHER direction — fine to keep, but say which cases those are and never count
  them as proof the fix works.

## 🛰️ Pod runtime — publish to `dev`, reach `stable` only by `promote`

`wrapper.py` / `start.sh` are R2-floated, and RELEASED users' Pods boot the `stable`
channel on every start. So a runtime edit ships `./publish-runtime.sh dev` → test on a
dev Pod → `./publish-runtime.sh promote` (server-side copy of the tested bytes; refuses
on working-tree drift). `./publish-runtime.sh stable` publishes the working tree straight
to released users — deliberate, warned hotfix only, never the day-to-day verb. Same shape
for images: a dev build bumps `POD_IMAGE_VERSION_DEV`/`_CPU_DEV`, never the stable pins.
Both are gated on `BUILD_HASH === 'dev'`, so a shipped app cannot resolve either. (MPI-340;
full flow: `c:\AI\Mpi\mpi-ci\cubric-vision-pod\README.md` § "Runtime externalize".)

## 🔌 Consuming a route — call it once, don't infer its shape

A wrong response shape never throws. It destructures to `undefined`, defaults to empty,
and reads as **"nothing exists yet"** — so the code acts on that. `scripts/smoke-workflows.mjs`
did `const { volumes = [] } = await app('/runpod/volumes')` against a route that answers a
**bare array**: every run concluded the account had no volumes and created a new 350 GB
one. Three existed before it was caught (MPI-467, 2026-08-08), while the weights already
downloaded sat on a twin each later run ignored.

- **Hit the route once and look at the body** before writing code against it. One `curl`.
- **Before an action that SPENDS, CREATES or DELETES, make the code refuse to guess.**
  Several candidates match → don't take "the first that fits"; report them and demand an
  explicit id. An empty list right before a create is the moment to be suspicious.
- Same class, same session: the runner logged "installing on a CPU Pod" while never
  creating one, because `/comfy/models/download/start` was assumed to target the Pod. It
  branches on `isRemoteActive()` — unverified, that downloads ~300 GB to the local disk.
