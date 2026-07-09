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
- **Check `js/utils/` before writing any generic logic** — `async.js`, `file.js`, `images.js`, `video.js`, `mediaDimensions.js`, `string.js`, `ratios.js` may already do what you need.
- **Frontend logging:** `import { clientLogger } from '../services/clientLogger.js'` — never use bare `console.log/error`.
- **Backend logging:** `const logger = require('./logger')` from `routes/logger.js`.

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
