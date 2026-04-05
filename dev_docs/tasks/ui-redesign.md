# Task: UI Redesign & Light Mode Deprecation
**Goal**: Create an artist-targeted, game-like UI with a unified "dim/dark" theme that blends warm (soft pink) and cold (soft blue) tones. The components will have sharper, modern edges and more opaque glassmorphism. Light mode will be entirely deprecated to focus on this single, universally pleasing aesthetic.

## Phase 1: Architecture & Theme Cleanup
- **Remove Light Mode Switch**: Edit `js/components/Compounds/MpiSettings/MpiSettings.js` to completely remove the theme toggle logic.
- **Clean State**: Ensure `state.js` or `themeManager.js` (if still used) defaults to a single theme and does not process light/dark toggle events.
- **CSS Cleanup Basics**: Remove all `body.light-mode { ... }` blocks from `01_base.css`.

## Phase 2: Design Token Overhaul (`01_base.css`)
- **Radiuses**: Reduce border radiuses (e.g., from 14px to 6px/8px) for a sharper, modern feel.
- **Color Palette**: 
  - Backgrounds: Solid, dim slate/dark colors (`#16131f` or similar).
  - Gradients: A gradient of soft pastel blue (`#4FACFE`) to soft warm pink (`#F093FB`) to bring out an artist UI feel.
  - Highlights: A distinct, vibrant accent color (e.g., a cyber yellow or mint green) for active states or primary calls to action.
- **Glassmorphism**: Adjust `--surface-glass` to a higher opacity (e.g., 0.85 to 0.95) with a subtle backdrop blur, giving it a more solid and legible presence.

## Phase 3: Shell & Global UI Updates
- **Global Typography & Layout**: Ensure the `Inter` and `Outfit` fonts looks crisp against the new opaque glass panels.
- **Shell Styling**: Update the titlebar, radial menu, and tool containers to utilize the warm/cold gradients contextually (e.g., borders or subtle background glows).

## Phase 4: Component Restyling
Systematically review and update the CSS files for:
- **Primitives**: `MpiButton` (gradient hover states), `MpiInput` (sharper borders, opaque backgrounds), `MpiOverlay`, `MpiToast`, `MpiSlider`, etc.
- **Compounds**: Adjust cards (`MpiProjectCard`), modals (`MpiModelsModal`, `MpiNewProject`), and toolbars to fit the sharper, artist-focused aesthetic. Remove any stray light-mode overrides from all files.

## Verification
- Run `themeManager` / `settings` to verify no light-mode references remain.
- Launch the `Component Gallery` (`/system/components`) and verify all components look cohesive under the new token definitions.
