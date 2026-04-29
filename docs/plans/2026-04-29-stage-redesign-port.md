# Stage Redesign Port — Implementation Plan

> **Source of truth:** `docs/redesign/PRODUCT.md`, `docs/redesign/DESIGN.md`, `docs/redesign/PORTING.md`, `docs/redesign/RECOLOR.md`, mockups at `docs/redesign/mockups/c-stage/*.html`.
>
> **Approach:** B — token swap with compat aliases as safety net, mechanical hardcode sweep across all component CSS, alias removal, then surface ports.
>
> **Worktree:** `quiet-shale` — app not yet launched in this branch. Clean refactor opportunity.
>
> **Mockups are spec, NOT source.** Translate visual intent into existing patterns (ComponentFactory, BEM, CSS variables, `js/utils/dom.js`, `js/utils/icons.js`, `Events`, `Hotkeys`). Do NOT copy mockup markup verbatim.

---

## Decisions locked from brainstorm

- Approach B: tokens first, then mechanical sweep, then surface ports.
- Asset placeholder: existing blue mascot/logo PNGs reused as-is. Recolor pass deferred (user will replace files later — paths stay stable).
- `--accent-danger` reuses `--accent-heat` (no new token in DESIGN.md).
- `--bounce` motion dropped totally (Stage banned bouncy easing).
- Sweep produces 6 commits (one per wave).
- JS layer audit: NO `setProperty('--var', ...)`, NO `<style>` injection, NO `style.cssText` rogue paths. Token swap is functionally safe.
- JS canvas color literals (`MpiCanvas`, `cropManager`, `brushType`) are a separate concern, swept in their own wave.

---

## Investigation snapshot (do not redo)

- 30+ hardcoded hex literals in component CSS (`MpiButton`, `MpiBadge`, `MpiProgressBar`, `MpiCheckbox`, `MpiMemoryMonitor`, `MpiSettings`, etc.).
- ~10 `var()` fallback hex (e.g. `var(--primary, ``````#9a82bb``````)`) — must die.
- 8 files with hardcoded `font-size` (px/rem). No type scale token exists in current `01_base.css`.
- ~30 hardcoded `border-radius` values (mostly legit `50%`/`999px`, plus `4px`/`6px`/`8px`/`10px`/`12px` that should map to `--r-*`).
- 29 hardcoded `transition` timings ignoring `--transition`/`--bounce`.
- 11 files use `--surface-glass` (must remap to opaque `--surface-1`).
- 21 files use `--primary` (context-aware remap to `--accent-heat` or `--accent-frost`).
- ~10 files use `--neon-*` family (remap to heat/frost).

---

## Sub-agent dispatch contract (Phase 2 + later)

Every sub-agent dispatched for sweep or component work MUST receive:

1. **Critical Rules Snapshot** from `CLAUDE.md` (verbatim).
2. **`.claude/rules/dos_and_donts.md`** Sub-Agent Briefing section.
3. **`.claude/rules/components.md`** Sub-Agent Briefing section (if touching component files).
4. **Full mapping table** from `docs/redesign/MAPPING.md` (produced in Phase 1).
5. **Hard scope:** CSS-only (or JS-only for wave 2.6) — NO markup changes, NO structural rewrites, NO new components, NO `js/components/types.js` edits, NO `preloadStyles.js` edits.

Use `/mpi-brief-rule <name>` to fetch each briefing at dispatch time.

---

## To-do list

### Phase 0 — Token foundation

- [x] **0.1 — Replace \****`:root`***\* block + add compat alias layer in \****`styles/01_base.css`**

    Single edit, single commit. Replace the entire `:root` block in `styles/01_base.css` with the OKLCH token block from `docs/redesign/DESIGN.md` (verbatim — surfaces, ink, lines, accents, type scale, spacing, radius, motion). Append a `/* compat — remove in Phase 3 */` block beneath that maps every legacy variable to a new token:

    Color: `--bg`/`--bg-light`/`--bg-dark` → `--surface-0`; `--bg-elevated` → `--surface-1`; `--bg-recessed`/`--bg-modal` → `--surface-bar`; `--surface` → `--surface-1`; `--surface-2` → `--surface-2`; `--surface-3` → `--surface-3`; `--surface-glass` → `--surface-1`; `--neon-electric`/`--neon-accent`/`--primary`/`--primary-dim` → `--accent-heat`; `--neon-glow`/`--neon-glow-sm`/`--neon-border` → `oklch(0.72 0.20 6 / 0.3)` (heat alpha); `--text` → `--ink-1`; `--text-2` → `--ink-1`; `--text-3`/`--text-muted` → `--ink-3`; `--success` → `--accent-ok`; `--info` → `--accent-frost`; `--warning` → `--accent-warn`; `--danger` → `--accent-heat`; `--border`/`--border-color` → `--line`; `--border-soft` → `--line-soft`; `--border-glass` → `--line`.

    Radius: `--radius-sm` → `--r-2`; `--radius` → `--r-2`; `--radius-lg` → `--r-3`; `--radius-xl` → `--r-3`.

    Motion: `--transition` → `var(--t-base) var(--ease)`; `--bounce` → `var(--t-base) var(--ease)` (Stage bans bouncy).

    Font: `--font-main` → `'JetBrains Mono', monospace`; `--font-display` → `'JetBrains Mono', monospace` (Fira Code retired — Stage uses single mono family).

    Remove any `@media (prefers-color-scheme: light)` block.

    **Verify:** boot Electron. App loads, no console errors, surfaces render (will look broken — hex/rgba in component CSS still active, not yet swept). Open dev tools, inspect `:root` computed styles, confirm new OKLCH values are present and legacy var names still resolve (e.g. `getComputedStyle(document.documentElement).getPropertyValue('--bg')` returns the new mauve, not the old gradient).

- [x] **0.2 — Remove shader background from \****`index.html`**\*\* and shell JS**

    Strip `<canvas id="shader-background">` from `index.html`. Search for `shader-background` references in `js/shell/`, `js/main.js`, anywhere — remove the JS that initializes/animates it. Stage is content-forward; the shader fights imagery.

    **Verify:** boot Electron. No `shader-background` in DOM (`document.getElementById('shader-background')` returns `null` in console). No console error referencing the missing canvas. App still renders.

- [x] **0.3 — Drop mascot + logo PNGs into \****`assets/mascot/`***\* and \****`assets/lettering.png`**

    Create `assets/mascot/` folder. Copy existing blue PNGs from `media/assets/comfy_robot_engine*.png` into the new folder, renamed: `logo.png`, `mascot.png`, `mascot-arms.png`, `mascot-hi.png`, `mascot-ho.png`. Match the `RECOLOR.md` naming exactly. Drop `assets/lettering.png` similarly (current PNG, no recolor — user will swap files later).

    No CSS hue-rotate filter — files at `assets/mascot/*.png` and `assets/lettering.png` are the canonical paths from now on.

    **Verify:** in shell, run `ls assets/mascot/` — confirm 5 PNGs exist. `ls assets/lettering.png` — confirm 1 file. File paths match what mockups + DESIGN.md expect.

- [x] **0.4 — Vendor \****`VT323.woff2`***\* and add \****`--font-wordmark`**\*\* token**

    Download `VT323` from Google Fonts as a self-hosted `.woff2`, save to `assets/fonts/VT323.woff2`. Add `@font-face` block for `'VT323'` at the top of `styles/01_base.css` next to the JetBrains Mono blocks. Add `--font-wordmark: 'VT323', monospace;` to `:root`. Remove any Google Fonts `@import` from app CSS or `index.html` if present.

    **Verify:** boot Electron. Open dev tools, run `getComputedStyle(document.documentElement).getPropertyValue('--font-wordmark')` — returns `'VT323', monospace`. `document.fonts.check('1em VT323')` returns `true` after page load. No 404s for font files in network tab.

### Phase 1 — Mapping table artifact

- [x] **1.1 — Write \****`docs/redesign/MAPPING.md`**

    The reference document every Phase 2 sub-agent will be briefed with. Sections:

  - **Color mapping** — context-aware table. `--primary` → `--accent-heat` (default for buttons/active states) OR `--accent-frost` (for focus rings, generative state, cyan moments). Sub-agent must read usage context per file. List every legacy color var with its target.
  - **Hardcoded color elimination** — `#fff`/`#000`/`#f87171`/etc → tokens. `#fff` → `--ink-1`. `#000` → `--surface-canvas`. Named brand colors → mapped per role.
  - **Var fallback elimination** — `var(--primary, ``````#9a82bb``````)` → `var(--accent-heat)` (drop fallback, compat aliases catch breakage in Phase 0).
  - **Type scale conversion** — px/rem → `--t-2xs` (10) / `--t-xs` (11) / `--t-sm` (13) / `--t-md` (15) / `--t-lg` (19) / `--t-xl` (32) / `--t-2xl` (64) / `--t-3xl` (96) / `--t-display` (144). Include rounding rules (e.g. 14-15px → `--t-md`).
  - **Spacing scale** — px → `--s-1` (4) / `--s-2` (8) / `--s-3` (14) / `--s-4` (22) / `--s-5` (32) / `--s-6` (48) / `--s-7` (72) / `--s-8` (112).
  - **Radius scale** — `4-6px` → `--r-2`; `10-16px` → `--r-3`; `0px` → `--r-1`; `50%`/`999px` → keep literal (circle/pill semantics).
  - **Motion** — `0.1-0.2s ease` → `var(--t-fast) var(--ease)`; `0.25-0.3s` → `var(--t-base) var(--ease)`; `0.4s+` → `var(--t-slow) var(--ease)`; any `cubic-bezier(...)` → `var(--ease)`. Drop `--bounce` references entirely.
  - **JS canvas color rules (wave 2.6 scope)** — mask overlay = heat radial gradient (60→25→0% alpha) per DESIGN.md. Crop frame stroke = `oklch(0.66 0.014 80)` (ink-3). Brush cursor = `--accent-heat`.
  - **Banned patterns reminder** — no hex outside this mapping doc, no named CSS colors, no raw `rgb()`/`rgba()` in components, no glassmorphism (`backdrop-filter` removed where present), no neon glow.

    **Verify:** open `docs/redesign/MAPPING.md`. Confirm all 8 sections (color, hardcoded color, var fallback, type, spacing, radius, motion, JS canvas) exist with concrete legacy→new mappings. Doc is self-contained — a sub-agent could sweep one component file using only this doc + the rules briefings.

### Phase 2 — Hardcode sweep (6 waves, 6 commits)

> Each wave: dispatch sub-agents in parallel within the wave (one per file or small file group), all briefed per the Sub-agent dispatch contract above. CSS-only changes (or JS-only for wave 2.6). NO markup, NO structural rewrites, NO new components.

- [x] **2.1 — Sweep wave: Primitives**

    Files: `MpiButton`, `MpiBadge`, `MpiProgressBar`, `MpiCheckbox`, `MpiInput`, `MpiModal`, `MpiPopup`, `MpiToast`, `MpiIcon`, `MpiRadialMenu`, `MpiMediaDropzone`, `MpiDragList`, `MpiGalleryDropOverlay`, `MpiMediaDropOverlay`, `MpiProjectDropOverlay`, `MpiSpinner`, `MpiRadioGroup`. One sub-agent per component (or per group of 2-3 small ones). Each sub-agent: replace hardcoded hex / rgba / px font-size / border-radius / transition values with new tokens per `MAPPING.md`. Eliminate `var(--primary, #...)` fallbacks. Honor BEM, do not rename classes.

    **Verify:** boot Electron, open the components gallery (`js/pages/components.js` route). Click through every Primitive. No console errors. No visible hardcoded color remnants. Run `grep -rEn '#[0-9a-fA-F]{3,8}' js/components/Primitives --include='*.css'` — returns 0 hits (or only legit cases like CSS-defined `currentColor`).

- [x] **2.2 — Sweep wave: Compounds**

    Files: `MpiAutoMaskThumbs`, `MpiCameraConfig`, `MpiCompareOverlay`, `MpiContextMenu`, `MpiEngineInstall`, `MpiErrorDialog`, `MpiGalleryGrid`, `MpiHistoryList`, `MpiHistoryTools`, `MpiInstalledDisplay`, `MpiLightingConfig`, `MpiMaskedImagePreview`, `MpiMemoryMonitor`, `MpiModelSettings`, `MpiNewProject`, `MpiOkCancel`, `MpiOptionSelector`, `MpiProjectCard`, `MpiProjectName`, `MpiStartingComfy`, `MpiStyleConfig`, `MpiToolbar`, `MpiVideoPlayer`, `MpiVideoScene`, `MpiVolumeControl`, `LandingPages/MpiAbout`, `LandingPages/MpiHelp`, `LandingPages/MpiSettings`, `MpiDropdown`. Same dispatch pattern as 2.1.

    **Verify:** boot Electron, exercise each Compound where it appears (gallery grid, history list, memory monitor, project cards on landing, etc.). No console errors. `grep -rEn '#[0-9a-fA-F]{3,8}' js/components/Compounds --include='*.css'` returns 0.

- [x] **2.3 — Sweep wave: Organisms**

    Files: `MpiCanvasViewer`, `MpiVideoViewer`, `MpiPromptBox`, `MpiToolOptionsCrop`, `MpiToolOptionsMask`, `MpiToolOptionsUpscale`, `MpiToolOptionsInterpolate`. Same dispatch pattern.

    **Verify:** boot Electron, open editor with an image, switch through each tool option (crop, mask, upscale, interpolate). Open prompt box. No console errors. `grep -rEn '#[0-9a-fA-F]{3,8}' js/components/Organisms --include='*.css'` returns 0.

- [x] **2.4 — Sweep wave: Blocks**

    Files: `MpiGalleryBlock`, `MpiGroupHistoryBlock`, `MpiModelsModal`. Same dispatch pattern.

    **Verify:** boot Electron, navigate gallery → editor → models modal. No console errors. `grep -rEn '#[0-9a-fA-F]{3,8}' js/components/Blocks --include='*.css'` returns 0.

- [x] **2.5 — Sweep wave: Shell CSS**

    Files: `styles/shell/base.css`, `styles/shell/components.css`, `styles/shell/focus-mode.css`, `styles/shell/landing.css`, `styles/shell/titlebar.css`, `styles/shell/workspace.css`. One sub-agent per shell file (or grouped into 2 dispatches). Same dispatch pattern but briefed that these are app-shell styles, not component CSS — BEM still applies but block names differ (`mpi-shell-*`, `mpi-titlebar-*`, etc., per existing convention).

    **Verify:** boot Electron, navigate every workspace (landing, gallery, editor, group history). Titlebar renders. Status bar renders. Focus mode toggles cleanly (if hotkey wired). `grep -rEn '#[0-9a-fA-F]{3,8}' styles/shell --include='*.css'` returns 0.

- [x] **2.6 — Sweep wave: JS canvas color literals**

    > **Different review criteria than CSS waves.** This wave touches JS, not CSS. Functional, not cosmetic — wrong colors here cause wrong mask shapes and crop frames, not just style drift.

    Files: `MpiCanvas` (search for `fillStyle`, `strokeStyle`, hex strings), `cropManager` (frame draws), `brushType` (cursor draws). Replace hex string literals with the canvas color rules from `MAPPING.md`. Mask = heat-tinted radial gradient (60→25→0% alpha). Crop frame stroke = ink-3 OKLCH literal. Brush cursor = heat. Use OKLCH values (not `var(--accent-heat)` — JS can't read CSS vars without `getComputedStyle` ceremony, and these draws happen per frame). Hardcode the OKLCH hex in JS as constants near the top of each file with comments referencing `--accent-heat`/`--ink-3`.

    **Verify:** boot Electron, open editor with image, draw a mask. Mask renders as heat-tinted radial gradient (warm pink), not old purple. Crop tool: frame stroke is mauve-ink, not white/cyan. Brush cursor visible and heat-colored. No console errors during draw operations.

### Phase 3 — Compat alias removal

- [x] **3.1 — Strip compat alias block from `styles/01_base.css`**

    Delete the `/* compat — remove in Phase 3 */` block added in 0.1. `:root` should now contain only the new OKLCH tokens — no legacy var names.

    Boot the app. Any visual breakage = sweep miss. Investigate: search the broken element's class for any remaining `var(--bg)` / `var(--primary)` / etc references. Fix the missed file in a follow-up commit. Repeat until app boots clean.

    **Verify:** `grep -E '^\s*--(bg|primary|neon|surface-glass|text|border|radius|transition|bounce|font-main|font-display|danger|info|success|warning)' styles/01_base.css` returns 0 hits. Boot Electron — every surface renders correctly: landing, gallery, editor (all tools), modals, dropdowns, titlebar, status bar. No console errors. No visible broken (white/black/transparent) elements.

### Phase 4 — Dropdown/popup/menu primitives (PORTING.md Phase 3.5)

- [x] **4.1 — Implement Stage dropdown/popup/menu primitives**

    Sub-agent reads `docs/redesign/mockups/c-stage/popups.html` and `docs/redesign/mockups/c-stage/tokens.css` (Dropdowns + popup menus block).

    Restyle these existing components (CSS only at this stage; light JS only if needed for `.popup` anchor behavior):

  - `MpiDropdown` — restyle to `.dropdown` + `.dropdown-trigger` + `.dropdown-panel`. Drop neon glow. Open-upward default; `.dropdown-panel--down` modifier for downward variants.
  - `MpiOptionSelector` — split usage. Keep dropdown variant for long/text-heavy lists (models, ops). Add popup variant `.popup` + `.popup-h` for short visual lists (ratios). Caller decides via prop or new variant export. Document in `js/components/types.js`.
  - `MpiContextMenu` — restyle to `.menu` + `.menu-item` + `.menu-sep` (3-column grid: icon, label, kbd hint).
  - Add `.ratio-row` + `.ratio-pick.r-X-Y` selectors used inside the popup variant of `MpiOptionSelector`.

    State conventions per PORTING.md Phase 3.5: closed = `--line` border + `--surface-2`; hover = `--ink-2` border + `--surface-3`; open = `--accent-heat` border + chevron 180°; selected item = heat color + 2px heat left bar + 12% heat tint.

    Honor sub-agent dispatch contract. Update `preloadStyles.js` only if a new CSS file is added. Update `js/components/types.js` for any new prop on `MpiOptionSelector`.

    **Verify:** boot Electron, open dropdowns (model picker, op picker), popup pickers (ratio), right-click context menu. Each opens, hovers, selects per the new state spec. Side-by-side compare with `docs/redesign/mockups/c-stage/popups.html` open in a browser — match within design intent (mockup is spec, not pixel-perfect target). No console errors.

### Phase 5 — Landing surface port (PORTING.md Phase 1)

- [x] **5.1 — Port Landing surface to Stage spec**

    Files: `index.html`, `styles/shell/landing.css`, `js/shell/projectUI.js`. Component touchpoints: `MpiProjectCard`, `MpiNewProject`, `MpiMemoryMonitor`, `MpiProjectName`, `LandingPages/*` (preparation for Phase 9 slide-over migration — leave CSS in place but route any direct landing-page renders through the existing shell mounting; no slide-over wrapping yet).

    Translate visual intent from `docs/redesign/mockups/c-stage/landing.html` into existing patterns (BEM, `ComponentFactory`, `js/utils/dom.js`, icons from `js/utils/icons.js`, CSS variables only). Wordmark uses `--font-wordmark` (VT323). Mascot from `assets/mascot/mascot-hi.png` for empty state (or per mockup).

    Honor sub-agent dispatch contract. Add new icons to `js/utils/icons.js` first if missing.

    **Verify:** boot Electron, land on the project picker. Layout matches mockup intent: project rows (not cards), wordmark in pixel font, mascot hi in idle/empty state, status bar bottom. Navigate to a project — destroys the landing block cleanly (no residual DOM, no console errors). Compare side-by-side with `landing.html`.

### Phase 6 — Gallery surface port (PORTING.md Phase 2)

- [x] **6.1 — Port Gallery surface to Stage spec**

    Files: `js/components/Blocks/MpiGalleryBlock/`, `js/components/Compounds/MpiGalleryGrid/`, `js/components/Organisms/MpiPromptBox/`, status bar wiring.

    Translate intent from `docs/redesign/mockups/c-stage/gallery.html`. Asymmetric image strips (treat images as the layout, not cards in a uniform grid). Prompt dock at bottom with model chip. Status bar with VRAM/RAM/queue/ETA tokens.

    Honor sub-agent dispatch contract. New icons via `js/utils/icons.js`. CSS variables only.

    **Verify:** boot Electron, navigate to gallery on a project with assets. Asymmetric strip layout renders. Prompt box at bottom, model chip visible. Drop an image into gallery — drop overlay works. Click an asset — opens editor cleanly (gallery block destroyed, no leak). Status bar shows live VRAM/RAM/queue values. Compare side-by-side with `gallery.html`.

### Phase 7 — Editor surface port (PORTING.md Phase 3)

- [ ] **7.1 — Port Editor surface (image + mask sub-mode + video) to Stage spec**

    Files: `js/components/Blocks/MpiGroupHistoryBlock/`, `js/components/Organisms/MpiCanvasViewer/`, `js/components/Organisms/MpiVideoViewer/`, `js/components/Organisms/MpiToolOptions*/`, three-pane shell CSS in `styles/shell/workspace.css`.

    Translate intent from `docs/redesign/mockups/c-stage/editor.html` (image + mask) and `editor-video.html` (video). Three-pane shell: tool rail left, canvas center, inspector tabs right. Mask sub-mode: heat radial gradient overlay (already wired in 2.6) + 1.5px dashed heat outline + `mix-blend-mode: screen` (CSS layer). Frost variant for dark imagery (`.mask-shape--frost`). Mascot peek hooks: idle / thinking poses overlay corner of canvas during long jobs (use mascot-hi.png / mascot.png from `assets/mascot/`).

    Honor sub-agent dispatch contract. CSS variables only. New icons via `js/utils/icons.js`.

    **Verify:** boot Electron, open editor with an image. Three panes render (tool rail, canvas, inspector). Tool rail switches between Crop/Mask/Upscale/Interpolate. Mask mode: paint a mask, overlay is heat radial gradient with dashed outline (matches 2.6 + CSS layer). Switch to a video project — editor-video shell renders. Trigger a mock long-running job — mascot peek appears in canvas corner, disappears when done. Compare both surfaces side-by-side with mockups.

### Phase 8 — Cross-cutting (PORTING.md Phase 4)

- [ ] **8.1 — Port titlebar, status bar info, focus mode**

    Files: `styles/shell/titlebar.css`, `styles/shell/components.css` (status bar selectors), `styles/shell/focus-mode.css`. Plus any shell JS wiring needed for live VRAM/RAM/queue/ETA values in status bar (likely already exists — restyle only).

    Translate intent from any titlebar/footer fragments visible across `landing.html`, `gallery.html`, `editor.html`. Titlebar: identity + window controls only (no telemetry per PRODUCT.md principle 5). Status footer: VRAM gauge, RAM gauge, queue depth pill, ETA tabular-nums. Focus mode: hides chrome, leaves canvas + minimal status. Glass surfaces are already gone (swept in 2.5) — confirm no `backdrop-filter` resurrected.

    **Verify:** boot Electron, observe titlebar across all surfaces — identity + window controls only, no VRAM/RAM in titlebar. Status footer shows live VRAM/RAM/queue/ETA. Toggle focus mode (hotkey or shortcut) — chrome retracts cleanly. No console errors. Side-by-side with mockup footer regions.

### Phase 9 — Settings/Help/About → MpiSlideOver (PORTING.md Phase 8)

- [ ] **9.1 — Build \****`MpiSlideOver`**\*\* component and migrate Settings/Help/About**

    New shared component at `js/components/Organisms/MpiSlideOver/` (or appropriate tier). Slide-over panel anchored right edge, glide-in via `var(--t-base) var(--ease)`. Contract per PORTING.md Phase 8: `Overlays.request()` registration, dismiss on outside click + Escape (via `Hotkeys.bind` with a registry id added to `hotkeyRegistry.js`), self-close on `ui:close-all-popups`. Document props in `js/components/types.js`. Register CSS in `js/shell/preloadStyles.js`.

    Migrate `js/components/Compounds/LandingPages/MpiSettings/`, `MpiHelp/`, `MpiAbout/` to render inside the slide-over. The current "landing page" framing (each is a full-page replacement) becomes a slide-over panel triggered from titlebar / landing actions. Old direct mount paths in `js/shell/projectUI.js` (or wherever they mount) replaced with `Overlays.request(MpiSlideOver, { content: MpiSettings.render(...) })`.

    Honor sub-agent dispatch contract. Mockup reference: `docs/redesign/mockups/c-stage/popups.html` if a slide-over variant is shown there, otherwise PORTING.md Phase 8 spec is the source.

    **Verify:** boot Electron, trigger Settings (titlebar gear or hotkey). Slide-over glides in from right. Contents render. Outside click dismisses. Escape dismisses. `ui:close-all-popups` event dismisses. Repeat for Help and About. No console errors. Memory: open and close 10 times — no leaked DOM nodes (check `document.body.children.length` stable).

### Phase 10 — Component renames/removals (PORTING.md Phase 5)

- [ ] **10.1 — Execute PORTING.md Phase 5 renames/removals**

    Read `docs/redesign/PORTING.md` Phase 5 at execution time (the list may have evolved). Rename or remove components per spec. Update every consumer + `preloadStyles.js` + `js/components/types.js` + any docs in `.claude/rules/component-mounts.md` / `component-events.md` / `component-state.md` if a renamed component appears there.

    **Verify:** `grep -r '<old-name>' js/ styles/` returns 0 hits. Boot Electron, exercise every surface that touched a renamed component. No console errors. No 404s for moved CSS files.

### Phase 11 — Visual diff verification

- [ ] **11.1 — Side-by-side mockup vs running Electron, per surface**

    Open Electron app on a real project with assets. Open each mockup in a browser (`docs/redesign/mockups/c-stage/landing.html`, `gallery.html`, `editor.html`, `editor-video.html`, `popups.html`). For each surface, document deviations from the mockup with `// REDESIGN-DEVIATION: <reason>` comments at the call site, and aggregate the list in the PR description.

    Acceptable deviations: real-app constraints (e.g. titlebar height differs, real data widths differ, dynamic content). Unacceptable deviations: skipped tokens, residual hardcoded color, structural pattern violations.

    **Verify:** PR description lists every deviation with justification. `grep -rn 'REDESIGN-DEVIATION' js/ styles/` matches the PR list. No surface has unjustified visual drift.

---

## Parallelization notes (after Phase 4 lands)

Phases 5, 6, 7 touch different surface files with low overlap. They are eligible for parallel execution if a future session uses `superpowers:dispatching-parallel-agents` or worktree-based dispatch. Default execution remains sequential (per `mpi-execute-next` discipline) — parallelize only with explicit approval.

Phase 8 (cross-cutting) must land before Phase 11 (visual diff) is meaningful.

Phase 9 (slide-overs) depends on Phase 4 (popup primitives may share state conventions) but is otherwise independent.

Phase 10 (renames) should run last among the active phases — it is mechanical cleanup that benefits from a stable surface set.

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| Sweep misses a hex/rgba in a less-used component | Phase 3 alias removal + boot test catches it; fix in follow-up commit |
| JS canvas wave (2.6) wrong color shapes | Standalone verify step with visual paint test; small surface area (3 files) |
| Compat alias mapping wrong (e.g. `--surface-2` opacity drift) | Phase 0.1 verify covers `getComputedStyle` check; Phase 2 sweep uses opaque values directly so aliases stop mattering after Phase 3 |
| New icons missing for Stage surfaces | Sub-agents add icons to `js/utils/icons.js` per `dos_and_donts` rule before use; PR review catches misses |
| `MpiOptionSelector` split (dropdown vs popup) breaks consumers | Phase 4 verify exercises both variants in real flows; new variant added as opt-in prop, default = current behavior |
| Mockup spec drift during port | Per CLAUDE.md: spec → code, one-way. Mockups not modified to match implementation. `// REDESIGN-DEVIATION:` comments + PR description |
