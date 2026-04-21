# General Best Practices (Do's and Don'ts)

> **AI INSTRUCTION:** Before writing any new logic or styles, you MUST verify if a utility or CSS variable already exists. Reinventing the wheel is strictly forbidden in this codebase.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves DOM work, CSS, utilities, or icons.

- **Never hardcode colors.** CSS variables only — from `styles/01_base.css`. No hex codes, no named colors.
- **Never paste raw SVG.** Import from `js/utils/icons.js`. If the icon is missing, add it there first.
- **Never use raw `document.querySelector`.** Use `js/utils/dom.js` shorthands.
- **BEM naming is mandatory.** Format: `.mpi-block__element--modifier`.
- **Check `js/utils/` before writing any generic logic** — `async.js`, `file.js`, `images.js`, `video.js`, `mediaDimensions.js`, `string.js`, `seed.js`, `ratios.js`, `promptOptions.js` may already do what you need.
- **Frontend logging:** `import { clientLogger } from '../services/clientLogger.js'` — never use bare `console.log/error`.
- **Backend logging:** `const logger = require('./logger')` from `routes/logger.js`.

## 🧰 The Utilities Folder (`js/utils/`)

Whenever you need generic functionality, ALWAYS check the `js/utils/` directory first. If a pattern is repeated across components, abstract it into a utility file here.

### Critical Utilities You MUST Use:
1. **`icons.js` (The Icon Source of Truth):** 
   - NEVER paste raw SVG code directly into component templates. 
   - ALL icons must be imported from `js/utils/icons.js`. If an icon doesn't exist, add it to this file first.
2. **`dom.js` (DOM Shorthands):** 
   - Use the shorthands in this file instead of raw, verbose `document.querySelector` or generic DOM manipulation where applicable.
3. **`ratios.js` (Aspect Ratios):** 
   - The absolute source of truth for all image/canvas aspect ratios. 
4. **`seed.js`:** 
   - Use this for generating randomized seeds (particularly useful for ComfyUI generation payloads).

**Other available utilities you should check before writing code:**
- `async.js`
- `file.js`
- `images.js`
- `video.js`
- `mediaDimensions.js` — measure pixel dimensions (`{w,h}`) from `File`/`Blob`/URL for images or videos. Use before uploads that populate sidecar `pixelDimensions`.
- `string.js`
- `promptOptions.js`

> **Rule of Thumb:** If you write a block of generic data-processing or DOM-manipulation code that isn't completely specific to a single component, it belongs in `js/utils/`.

---

## 🎨 CSS & Styling (The Source of Truth)

### 🔴 The "No Hardcoding" Rule
1. **NEVER hardcode colors:** Do not use raw hex codes (e.g., `#ff0000`) or standard CSS colors (e.g., `purple`) in your `.css` files. 
2. **Use the Base Variables:** You MUST pull colors, spacing, and transition speeds from the existing CSS variables located in `styles/` (specifically `styles/01_base.css` and related architecture). 
3. **Template UI Adherence:** If you are building UI, adhere strictly to the established design tokens. Our aesthetic relies on a unified glassmorphism / dark neon UI system. Do not deviate.

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
