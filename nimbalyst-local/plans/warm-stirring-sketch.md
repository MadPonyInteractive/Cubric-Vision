# UI Redesign Mockup Plan

## Context

The app is an AI creative studio for artists (image, video, music generation). It abstracts complex parameters so the user experience must feel intuitive and visually polished — not technical. The current design has good bones (pink/cyan/purple neon palette, dark glassmorphism) but needs refinement to sit in a comfortable middle ground between dark and light that appeals to both crowds. The user wants projects-first hero layout and improved inputs/controls.

## Scope

This is a **mockup-only** session. No production code is written. A `.mockup.html` file will be created as the deliverable.

## Design Direction

- **Revised palette — blues and pinks only, no purples:**
  - Primary: sky/cyan blue (`#55b3f1`, `#4deeea`)
  - Accent: pink/rose (`#d76ead`, `#f472b6`)
  - Glows: blue glow for focus/active states, pink glow for CTA/highlights
  - Remove all purple/violet tones (`--neon-electric: #aa8bcd`, `--neon-glow`, `--neon-border`) from the mockup — replace with blue or pink equivalents
- **Mid-tone treatment:** Dark charcoal base (`~#1e1e1e` / `#252525`) — neutral, lets blue and pink pop equally. Surface panels use frosted glass with white at low opacity. Slightly brighter borders than current, near-white text.
- **Hero is projects-first:** Recent projects grid moves up, reduced hero text, quick-start CTA is secondary not primary
- **Priority elements to mockup:** Inputs & Controls (MpiInput, MpiProgressBar/slider, MpiDropdown, MpiRadioGroup) + full landing page layout

## Mockup File

**Output:** `ui-mockup.mockup.html` in the project root

### Sections to include in the mockup

1. **Landing Page** — header (logo + actions), collapsed hero (tagline only, small), projects-first grid
2. **Inputs & Controls panel** — showcasing:
   - MpiInput (text, number, focus state, error state)
   - MpiProgressBar (static + interactive/slider)
   - MpiDropdown
   - MpiRadioGroup (pill buttons)
   - MpiButton (all variants: primary, secondary, ghost, outline, danger, icon-only, icon+label)

### Visual refinements to demonstrate

- **Input fields:** slightly more contrast on the field background vs the panel, softer neon-glow on focus (less harsh), label weight bump
- **Sliders/ProgressBar:** thicker track, larger thumb, more readable value tooltip
- **Dropdowns:** wider border radius on open list, subtle shadow, hover row tinted blue not white
- **RadioGroup pills:** more padding, clear active/inactive contrast using surface-3 vs primary gradient
- **Buttons:** keep existing variants but refine: primary gets a softer gradient, ghost gets an underline on hover, icon buttons get a slightly larger hit area

## Critical Files (read-only reference)

- `styles/01_base.css` — all CSS variables used in mockup
- `styles/shell/landing.css` — current landing layout
- `js/components/Primitives/MpiButton/MpiButton.css` — current button styles
- `js/components/Primitives/MpiInput/MpiInput.css` — current input styles
- `js/components/Primitives/MpiProgressBar/MpiProgressBar.css`
- `js/components/Primitives/MpiDropdown/MpiDropdown.css`
- `js/components/Primitives/MpiRadioGroup/MpiRadioGroup.css`

## Execution Steps

- [ ] Read MpiProgressBar, MpiDropdown, MpiRadioGroup CSS files for current styles
- [ ] Create `ui-mockup.mockup.html` with full landing page + controls panel mockup
- [ ] Capture editor screenshot to verify render
- [ ] Present to user for feedback

## Verification

Open `ui-mockup.mockup.html` in Nimbalyst editor. Use `capture_editor_screenshot` to show the render inline. User reviews visually and gives feedback before any production code is touched.
