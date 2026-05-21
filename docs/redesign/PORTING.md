# Cubric Studio — Stage Porting Guide

How to port the Stage mockups in this folder to the real app at `C:\AI\Mpi\Cubric-Vision\`. Read `PRODUCT.md` and `DESIGN.md` first; this doc is the file-by-file mapping.

## Working assumptions

- App is Electron + vanilla JS, no framework, no preprocessor.
- CSS is loaded via a facade (`styles.css`) that imports `styles/01_base.css` + `styles/shell/*.css`. Each component owns its own `MpiX.css` file under `js/components/<Category>/<MpiX>/`.
- All work happens in a worktree. **Do not edit files in `C:\AI\Mpi\Cubric-Vision\` from the main session — the user will create a worktree first.**
- Components register through `js/shell/preloadStyles.js`. Renaming or deleting a component requires updating that manifest.

## Phase 0 — One-time setup in the worktree

| Step | File | Change |
|---|---|---|
| 0.1 | `styles/01_base.css` | Replace the `:root` block with the OKLCH tokens from `DESIGN.md`. Keep selectors that depend on tokens; only the variable values change. |
| 0.2 | `styles/01_base.css` | Drop the dark-only assumption. The mid-tone IS the theme. Remove any media query that targets `prefers-color-scheme: light`. |
| 0.3 | `styles/01_base.css` | Remove or repoint legacy variables: `--bg`, `--bg-light`, `--bg-dark`, `--bg-elevated`, `--bg-recessed`, `--bg-modal`, `--surface`, `--surface-2`, `--surface-3`, `--surface-glass`, `--neon-electric`, `--neon-glow*`, `--neon-accent`, `--neon-border`, `--primary`, `--primary-dim`. Map each to the new token (e.g., `--bg → --surface-0`, `--bg-elevated → --surface-1`, `--surface-glass → --surface-1` with no transparency). Add a one-line `/* compat */` comment per legacy var so old selectors still resolve. |
| 0.4 | `index.html` | Remove `<canvas id="shader-background">` and any associated JS. Stage is content-forward; the shader background fights the imagery. The hero gets its imagery from real recent renders, not a generative shader. |
| 0.5 | `index.html` | Confirm `<link rel="stylesheet" href="styles.css">` is the only top-level CSS link. The component CSS is preloaded by `preloadStyles.js` already. |
| 0.6 | `assets/mascot/` | New folder. Drop in five mauve-recolored PNGs: `logo.png`, `mascot.png`, `mascot-arms.png`, `mascot-hi.png`, `mascot-ho.png`. Recolor recipe (Photoshop, 16 hex pairs): `mockups/RECOLOR.md`. Source originals stay at `media/assets/comfy_robot_engine*.png`. SVG trace was tried and dropped — output looked broken; raster ships. |
| 0.7 | `assets/lettering.png` | Recolor per `RECOLOR.md` (3 hex pairs at the bottom). Until then the mockup uses the original PNG with a CSS hue-rotate filter, which is acceptable for review but not for ship. |
| 0.8 | `assets/fonts/` | No change. JetBrains Mono is already vendored. |
| 0.9 | new file `assets/fonts/VT323.woff2` | **User confirmed: OK to package fonts in app.** Self-host the wordmark pixel font (the mockups load it from Google Fonts as a stand-in). Either vendor `VT323` directly, or commission a custom pixel font and replace `--font-wordmark` in `01_base.css` to point at it. Add a `@font-face` block to `01_base.css`; remove the Google Fonts `@import` from the mockup base CSS when porting. |

## Phase 1 — Surface 1: Landing / Project picker

Maps mockup `mockups/c-stage/landing.html` → `index.html` + `styles/shell/landing.css` + `js/shell/projectUI.js`.

### CSS (styles/shell/landing.css)

| Mockup section | New selector | Implementation |
|---|---|---|
| Hero with image-bleed background | `.landing-hero` | Add `.landing-hero__bg` (full-bleed image) and `.landing-hero__grad` (mauve gradient + heat radial wash). Drop the existing centered hero treatment. |
| Two-column split | `.page-landing` | Switch to `display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);` so the picker column lives beside the hero, not below. |
| Big headline `Generate. Refine. Own it.` | `.hero-title` | Remove `.gradient-text` from the children. The wordmark is the only place gradient text is allowed. Use the new type scale: `font-size: var(--t-3xl); line-height: 0.92; letter-spacing: -0.04em;`. The em-tag inside takes `color: var(--accent-heat);`. |
| Kicker line | `.kicker` | New utility class — see `DESIGN.md`. Replace existing eyebrow treatment. |
| Project list as flowing rows | `.pl-row` | Replace `.project-grid` (`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));`) with a single-column row layout. Each row: 130px thumbnail + meta + count, separated by 1px lines, hover advances the row 14px. Markup change: `MpiProjectCard` becomes a row, not a card. **User confirmed: rows only, no card-grid toggle.** Drop the existing `.mpi-project-card` selector entirely after migration; no need to keep both variants. |
| Footer status strip | `.footer-bar` | Move VRAM / RAM / GPU info from `MpiMemoryMonitor` (which floats in the workspace topbar) into a global footer strip on the landing too. Same component, different mount point. |

### JS (js/shell/projectUI.js)

| Current | New |
|---|---|
| `initProjectUI()` builds project cards into `#projectGrid` | `initProjectUI()` builds project rows. Render `MpiProjectCard` with a new prop `variant: 'row'` and let the component's CSS handle the two layouts. |
| Settings / Help / About buttons mount into `#landingActions` | Stays. Re-style as plain text links (see `.hero-nav a` in mockup), not buttons. |
| Empty state `Drop a folder to start` | Stays. Use the recolored mascot PNG centered above the copy. |

### Component file changes

- `js/components/Compounds/MpiProjectCard/MpiProjectCard.css` — replace the card-grid layout with the row layout outright. Search the codebase for other uses of `.mpi-project-card`; the registry shows only the landing surface uses it, so a clean rewrite is safe. If anywhere else still expects the card variant, prove it before deleting.
- `js/components/Compounds/MpiProjectCard/MpiProjectCard.js` — drop any `variant`-style branching. The component renders a row, full stop.

## Phase 2 — Surface 2: Gallery

Maps mockup `mockups/c-stage/gallery.html` → `js/components/Blocks/MpiGalleryBlock/` + `js/components/Compounds/MpiGalleryGrid/` + `js/components/Organisms/MpiPromptBox/`.

### MpiGalleryBlock (the container)

| Mockup section | Implementation |
|---|---|
| Single thin top header (`crumb / filters / sort`) | Build a single header component (or template region inside the block). The current `.workspace-topbar` floats over the canvas; here it doesn't need to float — give it `position: sticky; top: 0;` and a 1px bottom line. |
| Asymmetric strip grid | This is the big change. `MpiGalleryGrid` must move from a uniform `repeat(auto-fill, minmax(220px, 1fr))` grid to **three strip rows that cycle**: row 1 `7-5`, row 2 `4-4-4`, row 3 `5-7`, then repeat. The grid driver iterates through the asset list and assigns each to the next slot in the cycle. |

### MpiGalleryGrid CSS

```css
.mpi-gallery-grid {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-6) var(--s-3);
  height: 100%;
  overflow: auto;
}
.mpi-gallery-grid__strip {
  display: grid;
  gap: var(--s-3);
  height: 380px;
}
.mpi-gallery-grid__strip--7-5 { grid-template-columns: 7fr 5fr; }
.mpi-gallery-grid__strip--4-4-4 { grid-template-columns: 4fr 4fr 4fr; height: 300px; }
.mpi-gallery-grid__strip--5-7 { grid-template-columns: 5fr 7fr; height: 420px; }
```

### MpiPromptBox (the prompt dock)

| Current | New |
|---|---|
| Floating dock above canvas (full-width band) | Move it to a sticky bottom band inside the gallery view, full-width, max-width 1280 with horizontal padding. Vertical padding `--s-5 --s-6 --s-4`, gradient fade from transparent at top to `var(--surface-bar)` at bottom. |
| `Snapshot` button + `Save` button + checkmark + play | Collapse to a single primary action `▶ Generate` (heat fill). The dropdown next to it becomes the params menu; the model chip stays but uses the new `.model-pick` style with a heat dot. |
| Attached image floats above dock | Move attached image into the dock's first column at 72×72px, sharp corners, `× ` close in the corner of the thumbnail. |

### Status bar

Move VRAM / RAM gauges out of `#workspace-topbar` (where `MpiMemoryMonitor` currently mounts) and into the new global footer bar. The footer bar is a new component, e.g. `MpiStatusBar`, registered next to `MpiMemoryMonitor`. `MpiMemoryMonitor` stays — it becomes the footer's right-half content. Add a new component `MpiJobIndicator` for the left-half ("Generating · 38%" with the spinning ring, ETA, cancel).

## Phase 3 — Surface 3: Editor (group history)

Maps mockup `mockups/c-stage/editor.html` and `editor-video.html` → `js/components/Blocks/MpiGroupHistoryBlock/` + `js/components/Organisms/MpiToolOptions*/`.

### Three-pane shell

The block currently uses `.mpi-group-history-block__left | __right | __bottom`. Reshape to:

```css
.mpi-group-history-block {
  display: grid;
  grid-template-columns: 64px 1fr 360px;
  height: 100%;
}
```

Left pane: tool rail (50×50px tools, group separators, optional UPPERCASE category labels).
Center: canvas with radial vignette + canvas dock at the bottom + (video) the timeline below.
Right: inspector with tabs.

### Tool rail

The rail icons are stroked SVGs (`stroke-width: 1.5`, `fill: none`). Active tool gets a 2px heat side-bar on the left edge, not a fill. Hover only shifts color, doesn't add a background.

### Inspector tabs

Tabs are mono UPPERCASE text with the heat-dot active indicator (no underline, no fill). The body of each tab is a vertical scroll of "sections", each separated by 1px lines and a sticky `panel-h` header strip.

### Mask sub-mode

Mask UI replaces:

- Current: `Face` dropdown + `Box / Segment` toggle + brush.
- New: `MpiToolOptionsMask` shows the full pill picker (`Face / Hair / Body / Hands / Custom`) at the top, then `Box / Segment`, then a single `Detect` button (full-width outline, hover swaps to ink-1 fill), then three sliders (`Size`, `Feather`, `Opacity`), each with a 4px frost track + 14px ink-1 knob.

Replace any `<select>` with this structure. The dropdown made the section feel like a form; this feels like a tool.

### Mask overlay rendering on canvas

The current cloud-shaped mask in the screenshots is a rendering bug — it's a circle with no anti-aliased feather. New spec:

- Heat-tinted radial gradient (60%→25%→0% alpha).
- 1.5px dashed heat outline around the bounding ellipse.
- `mix-blend-mode: screen`.
- For dark imagery, swap to frost (`.mask-shape--frost`).

### Editor — video

`editor-video.html` is a new sub-mode of the editor. Currently the app likely renders video the same way it renders images; split into:

- `MpiToolOptionsVideoCrop` — replaces today's `SOCIAL` dropdown + tiny aspect-ratio chips. The new component is a 2×3 preset grid: `Reel 9:16`, `Square 1:1`, `Portrait 4:5`, `Wide 16:9`, `Story 3:4`, `Custom`. Each preset is a 12px-padded card with an icon-sized rectangle in the right aspect ratio + name + dimensions.
- `MpiVideoTimeline` — new component. Three rows: controls (prev / play / next with heat-fill play, `MM:SS.MS` time, loop+audio toggles), track (44px frost waveform, heat trim handles, ink-1 playhead), ruler (5 timestamp ticks).
- Crop rig — 8 round handles (10×10 heat with 2px ink-1 outline) + rule-of-thirds gridlines + darkened mask outside crop.
- `Snapshot` and `Save` rename to `Capture frame` and `Apply crop`. Move both from floating chips to a single confirm-action footer in the inspector.

### Mascot peek

Add a small mascot PNG in the canvas's bottom-right while a generation is running:

```html
<img class="mascot-peek" src="assets/mascot.png" alt="" />
```

```css
.mascot-peek {
  position: absolute;
  bottom: 76px;
  right: 18px;
  width: 44px;
  height: 44px;
  opacity: 0.85;
  pointer-events: none;
  animation: mascot-float 4s ease-in-out infinite;
}
@keyframes mascot-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
```

Show only when `state.generating === true`. Hide on idle. Don't expand. Don't speak. Don't blink.

## Phase 3.5 — Dropdowns, popups, context menus

Cubric Studio leans heavily on dropdowns and small popup menus (model picker, op picker, ratio picker, batch count, right-click on assets). Round 1 mockups under-represented this — round 2 adds dedicated primitives.

See [`mockups/c-stage/popups.html`](c-stage/popups.html) for six in-context demos. CSS primitives live in [`mockups/c-stage/tokens.css`](c-stage/tokens.css) under the `Dropdowns + popup menus` section. Copy the entire block into `styles/01_base.css` (after the token block) or split into `styles/shell/dropdowns.css` + import via `styles.css`.

### Selectors to register

| Selector | Purpose | Replaces |
|---|---|---|
| `.dropdown` + `.dropdown-trigger` + `.dropdown-panel` | Default dropdown (e.g. model picker, op picker). Opens upward by default; add `.dropdown-panel--down` for downward variants (rare in Stage — most live near the bottom prompt dock). | The current SDXL Realistic dropdown, the Op (Text to Image) dropdown. |
| `.dropdown-compact` modifier | Inline / chip-sized dropdown with optional heat dot. | The current "model chip" treatment in the prompt dock. |
| `.popup` + `.popup-h` | Floating panel anchored to a trigger. Use for picker-style menus that don't fit a vertical list. | The current Ratio popup (1:1 / 3:4 / 4:5 / 5:8 / 9:16) seen in your screenshots. |
| `.ratio-row` + `.ratio-pick.r-X-Y` | Horizontal aspect-ratio picker shown inside a popup. Active state fills heat. | The current pink-tinted ratio buttons. |
| `.menu` + `.menu-item` + `.menu-sep` | Right-click context menu. 3-column grid: icon slot, label, kbd hint. | Whatever right-click renders today (or the current overflow `…` menus). |

### State conventions (kept consistent across all four)

- Closed trigger: 1px ink-3 border, mauve surface-2.
- Hover: border lifts to ink-2, surface lifts to surface-3.
- Open: border switches to heat, chevron rotates 180°, panel appears.
- Selected item in a list: heat color + 2px heat left bar + 12% heat tint.
- Active option in a popup picker (ratio): heat fill, ink-deep text.

### Component renames

The existing app stores model-picker logic in `MpiOptionSelector` and probably `MpiDropdown` (per `preloadStyles.js`). Plan:

- `MpiDropdown` — restyle to the new `.dropdown` selectors. Drop neon glow.
- `MpiOptionSelector` (used by the operation picker, ratio picker, etc.) — split into two consumers:
  - When the choice list is short and visually distinguishable (ratios), render the `.popup` variant.
  - When the choice list is long or text-heavy (models, ops), render the `.dropdown` variant.
- `MpiContextMenu` — already exists. Restyle CSS to the `.menu` selectors.

### Trigger placement

Most Cubric dropdowns live in the prompt dock at the bottom of the gallery / editor. Open-upward is the right default — the panel grows away from the dock, leaving the canvas readable. Open-downward is reserved for in-canvas tools (e.g. preset picker on the video editor) where there's space below.

## Phase 4 — Cross-cutting changes

### Titlebar (`styles/shell/titlebar.css`)

- Replace text "Cubric Studio" with the `<img class="brand-logo">` + `<img class="brand-lettering">` pair (already in `mockups/c-stage/assets/`).
- Drop the existing `.titlebar` height of 32px → 36px.
- Apply the CSS-filter recolor recipe from `DESIGN.md` until the source PNGs ship in mauve.

### Glassmorphism

Audit every selector that uses `backdrop-filter: blur(...)` or the `--surface-glass` token. Each instance needs a justification:

- Canvas dock — keep, but reduce blur to `4px`, set background to `oklch(0.30 0.022 350)` solid (no transparency).
- Topbar / floating panels — remove the blur, switch to solid `--surface-1` with 1px line.

The glass aesthetic was Workshop direction (B). Stage doesn't use it.

### Status bar info

Move all "system honesty" telemetry — VRAM, RAM, queue, ETA, GPU name, app version — into a single bottom bar that's rendered globally. Mount points:

- `#shell-info-bar` (already exists in `index.html`) → upgrade from a passive container to the host of `MpiStatusBar` (new component).
- Move `MpiMemoryMonitor` mount from `#memory-monitor-mount` (top-right of workspace) to `MpiStatusBar`'s right slot.

### Focus mode (`styles/shell/focus-mode.css`)

`body.mpi-focus-mode` currently hides `#workspace-topbar`, `#radial-mount`, `#prompt-box-mount`, `#shell-info-bar`. Stage refines this:

- Hide topbar and prompt dock.
- **Keep** the status bar visible at 30% opacity. The user still wants to know they have 1.3 GB of VRAM left while focusing on the canvas.
- The mascot disappears in focus mode.

## Phase 5 — Component renames / removals

| Current | New | Reason |
|---|---|---|
| `--neon-glow`, `--neon-accent`, `--neon-border` | Remove | Stage has no neon. Heat is theatrical, not glowing. |
| `--shader-background` JS / canvas / CSS | Remove | Decorative animation fights content. Hero uses real renders instead. |
| `MpiButton` rounded pill default | Add `--shape: 'pill' \| 'sharp'` prop. Stage uses sharp by default (`--r-1: 0`). | Sharp corners are a Stage signature. |
| `MpiPromptBox` floating | Re-style as a sticky bottom band (gallery) or a smaller anchored dock inside the canvas (editor). Same component, layout-driven by parent. | Floating dock obscured the canvas. |
| `MpiGalleryGrid` uniform grid | Strip layout (cycle `7-5`, `4-4-4`, `5-7`). | Per Stage: imagery is the page, not cards in a grid. |

## Phase 6 — Verification

Run after each phase. Use the existing dev server (`http://127.0.0.1:3000/`).

| Check | How |
|---|---|
| No `#000`, `#fff`, `rgba(255,255,255,*)` | grep, every match must be intentional and justified inline. |
| All color values OKLCH | grep for `hsl(`, `rgb(`, `#[0-9a-f]{3,8}` — none should remain in `01_base.css` or component CSS. |
| Wordmark gradient renders | Visual: titlebar `Cubric Studio` text shows pink→cyan gradient. |
| No gradient text elsewhere | grep for `background-clip: text` — only the wordmark selector should match. |
| All flows from original screenshots have a home | Walk through landing → gallery → editor (image) → mask → editor (video). Every feature visible in `media-for-testing/screenshots/` of the user's original UI must be present. |
| Footer status bar visible on every page | Including landing. |
| Type is mono everywhere except wordmark | Inspect the page — every text node should resolve to `JetBrains Mono` except wordmark elements (`VT323`). |
| Hue-rotate filter on logo gives readable mauve | Visual check titlebar in titlebar.css. |
| Mascot only appears in idle / thinking / empty | grep for `mascot-peek` → only in editor canvas. grep for `mascot-empty` → only in empty-state JS. |

## Phase 7 — Stage mockups for reference

While porting, keep the mockups open as ground truth:

- `mockups/c-stage/landing.html` ←→ landing surface
- `mockups/c-stage/gallery.html` ←→ gallery surface
- `mockups/c-stage/editor.html` ←→ image editor + mask sub-mode
- `mockups/c-stage/editor-video.html` ←→ video editor
- `mockups/_base.css` + `mockups/c-stage/tokens.css` ←→ base reset + tokens

Diffs that drift from the mockup are fine if justified, but mark them in the worktree's PR description so the design intent is auditable.

## Phase 8 — Settings / Help / About as slide-overs

**User confirmed: replace the modal pattern with slide-overs from the right edge.**

The existing `MpiSettings`, `MpiHelp`, `MpiAbout` are full-screen overlay modals that dim the entire surface. Stage replaces this with a 480px-wide slide-over panel anchored to the right edge of the window. The canvas stays fully visible (un-dimmed), so the user keeps context.

### New shared component: `MpiSlideOver`

Register a new compound component at `js/components/Compounds/MpiSlideOver/`. It owns:

- The panel chrome (header strip with title + close, scrollable body, optional sticky footer for actions).
- Open / close lifecycle, ESC-to-close, focus trapping inside the panel while open.
- Slide-in animation: 280ms ease-out-quart, `transform: translateX(100%)` → `0`.

```css
.mpi-slide-over {
  position: fixed;
  top: var(--titlebar-h, 36px);
  right: 0;
  bottom: 32px;            /* status bar height */
  width: 480px;
  background: var(--surface-1);
  border-left: 1px solid var(--line);
  box-shadow: -24px 0 60px -30px oklch(0.16 0.02 350 / 0.55);
  transform: translateX(100%);
  transition: transform var(--t-base) var(--ease);
  z-index: 100;
  display: grid;
  grid-template-rows: auto 1fr auto;
}
.mpi-slide-over[aria-expanded="true"] { transform: translateX(0); }

.mpi-slide-over__header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mpi-slide-over__title {
  font-size: 11px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.mpi-slide-over__body { padding: 20px; overflow: auto; }
.mpi-slide-over__footer {
  padding: 16px 20px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

No backdrop, no scrim. The canvas keeps full opacity. The mascot keeps floating. The user can keep adjusting the prompt while reading help text. Multiple slide-overs are not stackable — opening a second one closes the first.

### Migration

Each of `MpiSettings`, `MpiHelp`, `MpiAbout` already has body content. Wrap each one in `MpiSlideOver`:

```js
// before
MpiSettings.mount(document.body);

// after
MpiSlideOver.mount(document.body, {
  title: 'Settings',
  body: MpiSettings.template(),
  setup: MpiSettings.setup,
});
```

The three components stop owning their chrome (overlay, scrim, close button) and become pure body content. The shared chrome lives in `MpiSlideOver`. This is a real simplification — three layouts collapse to one, and the open/close logic lives in one place.

Trigger handlers in `js/shell/projectUI.js` change to dispatch the slide-over instead of showing the modal:

```js
landingActions.querySelector('[data-action="settings"]').onclick =
  () => Events.emit('slide-over:open', { component: MpiSettings, title: 'Settings' });
```

`Events.on('slide-over:open', ...)` mounts a new `MpiSlideOver` (closing any existing one).

### Edge cases

- Slide-over while in focus mode: hide the slide-over entirely. Focus mode means the user wants no chrome; the trigger that opened it is also hidden. If the user invokes a settings hotkey, exit focus mode then open the slide-over.
- Dragging the window: slide-over follows the window (no fixed-positioning quirks because it's `position: fixed`).
- Resizing: at narrower widths (< 800px workspace), slide-over auto-grows to 60% of viewport width but never less than 360px.

## Outstanding before round 3 ships

1. ~~Project list density~~ — resolved. Rows only.
2. **Wordmark vector source** — need `lettering.svg` from the brand owner. Trace from PNG produces messy paths.
3. **Pixel font choice** — OK to ship with self-hosted `VT323` per the user. If a custom face is preferred, brief the type designer; until then, vendor `VT323` and move on.
4. ~~Settings / Help / About surfaces~~ — resolved. Slide-overs (Phase 8 above).
5. **Mascot art coverage** — five SVGs ship-ready (`logo`, `mascot`, `mascot-arms`, `mascot-hi`, `mascot-ho`). Only outstanding: confirm `mascot-ho` is the "done / saved" pose; otherwise rename to whatever the friendlier name is in your brand sheet.
