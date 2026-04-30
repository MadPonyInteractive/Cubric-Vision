# Cubric Studio — Design System

Stage direction (warm dusk, drenched, content-forward) is the locked-in design language. This file is the source of truth for tokens, type, components, and motion.

> All colors are OKLCH. No `#000`, no `#fff`. Every neutral is tinted toward 350° (mauve). Every gradient is banned except the wordmark.

## Tokens

```css
:root {
  /* Surfaces — chrome warmer than canvas; canvas is the deep stage */
  --surface-0:       oklch(0.50 0.022 350);  /* outermost chrome */
  --surface-1:       oklch(0.46 0.022 350);  /* panels */
  --surface-2:       oklch(0.42 0.022 350);  /* raised, inputs */
  --surface-3:       oklch(0.55 0.024 350);  /* hover */
  --surface-bar:     oklch(0.34 0.022 350);  /* status, quiet zones */
  --surface-canvas:  oklch(0.28 0.020 350);  /* editor canvas, vignette base */

  /* Ink — warm whites */
  --ink-1:           oklch(0.98 0.008 80);   /* primary text */
  --ink-2:           oklch(0.85 0.012 80);   /* secondary */
  --ink-3:           oklch(0.66 0.014 80);   /* labels, kickers */
  --ink-4:           oklch(0.50 0.018 80);   /* muted, almost-disappearing */

  /* Lines — translucent so they sit ON the surface */
  --line:            oklch(0.72 0.018 350 / 0.16);
  --line-soft:       oklch(0.72 0.015 350 / 0.08);

  /* Accents */
  --accent-heat:     oklch(0.72 0.20 6);     /* pink-magenta — primary actions, active states */
  --accent-frost:    oklch(0.82 0.13 220);   /* cyan — generative state, focus rings, frost lines */
  --accent-ok:       oklch(0.78 0.13 150);   /* success, ready */
  --accent-warn:     oklch(0.78 0.14 60);    /* warning */

  /* Type scale — dramatic ratio for register=brand pages, tighter for product UI */
  --t-2xs:  10px;
  --t-xs:   11px;
  --t-sm:   13px;
  --t-md:   15px;
  --t-lg:   19px;
  --t-xl:   32px;
  --t-2xl:  64px;
  --t-3xl:  96px;
  --t-display: 144px;

  /* Spacing */
  --s-1:   4px;
  --s-2:   8px;
  --s-3:   14px;
  --s-4:   22px;
  --s-5:   32px;
  --s-6:   48px;
  --s-7:   72px;
  --s-8:   112px;

  /* Radius */
  --r-1: 0px;        /* sharp — Stage prefers angular over rounded */
  --r-2: 4px;        /* small affordances */
  --r-3: 12px;       /* large containers when softness is needed */
  --r-pill: 999px;   /* status pills, accent dots */

  /* Motion — cinematic, exponential ease-out */
  --ease:    cubic-bezier(0.16, 1, 0.3, 1);
  --t-fast:  200ms;
  --t-base:  280ms;
  --t-slow:  480ms;
}
```

## Color usage rules

| Color | Use for | Never use for |
|---|---|---|
| `--accent-heat` | Primary buttons, active layer outline, "generating" indicators, mascot accents, hover-state on row arrows. | Body text, large background fills (it's an accent — drenched is the SURFACE doing the work, not the heat). |
| `--accent-frost` | Focus rings, AI-state, secondary chips, frost-lined gauges, eyes on the mascot. | Decorative outlines on cards. |
| `--surface-canvas` | Editor canvas zone, vignette gradient stops. | Outer chrome — chrome stays at `--surface-0` / `--surface-1`. |
| Gradient pink→cyan | The wordmark only (`background-clip: text`). | Anywhere else. Banned. |

## Theme

**No dark mode. No light mode. Mid-tone warm dusk only.**

Scene that justifies this: *a creator at their desk in late afternoon, room half-lit, working on AI imagery for hours. The screen should feel inhabitable, not glowing. Warm enough to relax the eye over a four-hour session.*

Don't ship a light mode. Don't ship a "darker" mode. The single mid-tone is the brand.

## Typography

**Family:** `JetBrains Mono` (already vendored in `assets/fonts/`). All UI, labels, numbers, body. Variable monospaced.
**Wordmark only:** `VT323` (loaded from Google Fonts in mockups; bundle locally for prod).

**Hierarchy via scale + weight contrast (ratio ≥ 1.25). Never via color.**

| Role | Size | Weight | Line height | Letter-spacing |
|---|---|---|---|---|
| Display (landing headline) | 64–96px | 700 | 0.92 | -0.04em |
| Section heading | 32px | 600 | 1.0 | -0.02em |
| Subheading / project name | 19px | 600 | 1.2 | -0.01em |
| Body | 13–15px | 400 | 1.5 | 0 |
| Label / kicker | 11px | 500 | 1.3 | 0.16–0.32em (UPPERCASE) |
| Numerals (memory, counts) | inherit | 400 | inherit | 0, `tabular-nums` |

Cap reading column at 65ch. UI ignores this rule.

## Components

### Wordmark

```html
<span class="wordmark">Cubric Studio</span>
```

```css
.wordmark {
  font-family: "VT323", monospace;
  letter-spacing: 0.04em;
  background: linear-gradient(100deg, var(--accent-heat) 0%, var(--accent-frost) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

This is the **only** place gradient text is allowed.

### Logo + lettering bundle (titlebar / landing header)

Use the existing `favicon.png` (logo) and `lettering.png` (wordmark) from the project. Recolor live with CSS filters until proper mauve PNGs are produced:

```css
.brand-logo {
  filter: hue-rotate(-50deg) saturate(0.78) brightness(1.05);
}
.brand-lettering {
  filter: hue-rotate(-30deg) saturate(0.85) brightness(1.08);
}
```

This shifts the blue body to mauve while keeping cyan eyes and pink emblem.

For production, replace the PNGs with mauve-recolored versions:
- Body: `oklch(0.50 0.022 350)` → final mauve (matches `--surface-0`)
- Eyes: `oklch(0.78 0.13 220)` → frost cyan (matches `--accent-frost`)
- Emblem panels + C: `oklch(0.72 0.20 6)` → heat pink (matches `--accent-heat`)
- Outline / linework: `oklch(0.22 0.02 350)` → deep mauve

### Buttons

```css
.btn {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 24px;
  font-size: var(--t-sm);
  letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600;
  border: 1px solid var(--ink-1);
  background: transparent; color: var(--ink-1);
  transition: background var(--t-base) var(--ease), color var(--t-base) var(--ease);
}
.btn:hover { background: var(--ink-1); color: var(--surface-bar); }

.btn-primary {
  background: var(--accent-heat);
  border-color: var(--accent-heat);
  color: oklch(0.16 0.02 0);
}
```

Sharp corners (`--r-1: 0`). No rounded pills for primary actions in Stage. Pills are reserved for status indicators.

### Tags (filter / sort)

Plain text, UPPERCASE, ≥0.16em tracking. Active state shows a heat dot, not a border.

```css
.tag[aria-selected="true"]::after { content: " ●"; color: var(--accent-heat); }
```

### Kicker (eyebrow label)

```css
.kicker {
  font-size: var(--t-xs);
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.kicker::before {
  content: ""; width: 28px; height: 1px; background: var(--accent-heat);
  margin-right: 8px;
}
```

### Gauge (memory / progress)

```css
.gauge .bar {
  width: 60px; height: 1px; background: var(--line);
  position: relative;
}
.gauge .bar > span {
  position: absolute; inset: 0 auto 0 0;
  background: var(--accent-heat);
}
```

Bar is 1px tall — a line, not a chunky bar. `tabular-nums` on the numbers.

### Card / frame (gallery)

Frames are full-bleed images with a gradient overlay for legibility. No card chrome (no border, no inner padding around the image, no shadow). Hover scales the image 1.03 over `--t-slow`.

```css
.frame {
  position: relative; overflow: hidden; cursor: pointer;
  background: var(--surface-bar);
}
.frame img {
  width: 100%; height: 100%; object-fit: cover;
  filter: saturate(0.92) brightness(0.92);
  transition: transform var(--t-slow) var(--ease), filter var(--t-slow) var(--ease);
}
.frame:hover img { transform: scale(1.03); filter: saturate(1) brightness(1); }
```

### Canvas (editor)

Editor canvas has a radial vignette: `--surface-bar` at center, `oklch(0.20 0.020 350)` at edges. Adds inner darkening so the focused image pops.

```css
.canvas {
  background: radial-gradient(
    ellipse at 50% 45%,
    var(--surface-bar) 0%,
    oklch(0.20 0.020 350) 100%
  );
}
```

### Mask overlay

Heat-tinted feathered ellipse with dashed outline:

```css
.mask-shape {
  background: radial-gradient(ellipse at center,
    color-mix(in oklch, var(--accent-heat) 60%, transparent) 0%,
    color-mix(in oklch, var(--accent-heat) 25%, transparent) 60%,
    transparent 78%);
  outline: 1.5px dashed color-mix(in oklch, var(--accent-heat) 80%, transparent);
  mix-blend-mode: screen;
}
```

For mask painting on darker imagery, switch to `--accent-frost` (cyan) — kept available as `.mask-shape--frost`.

### Crop rig (video / image crop)

8 round handles, full outline, rule-of-thirds gridlines, darkened mask outside crop region. Handle: 10×10px heat dot with 2px ink-1 outline.

### Timeline

Full-width band, 100px tall. Three rows:
1. Controls: prev / play / next, time readout `MM:SS.MS / MM:SS.MS`, loop+audio toggles.
2. Track: 44px tall, frost waveform, heat trim handles, ink-1 playhead with arrow head.
3. Ruler: 5 timestamp ticks at 0/25/50/75/100%.

### Status footer

Always visible. Always at the bottom. Always carries: Idle/Generating state (with mascot peek if active), VRAM gauge, RAM gauge, optional queue count.

```html
<footer class="bar">
  <span>● Idle</span>
  <span>...</span>
  <span class="gauge"><span>VRAM</span><span class="bar"><span style="width:8%"></span></span>1.3 / 16</span>
  <span class="gauge"><span>RAM</span><span class="bar"><span style="width:27%"></span></span>17.6 / 64</span>
</footer>
```

## Layout principles

1. **Three-pane editor.** 64px tools rail (left) + canvas (center) + 360px inspector (right). All other surfaces flex to canvas.
2. **No nested cards.** A card inside a card is always wrong. Inspector sections separate via a 1px line, not via boxes.
3. **Asymmetric strips for galleries.** Three strip variants in Stage: `7-5`, `4-4-4`, `5-7`. Cycle them. Don't fall back to a uniform card grid.
4. **Vary spacing for rhythm.** Inspector sections use varying internal padding (`--s-3` for compact, `--s-5` for breath).

## Motion

- Default transition: `var(--t-base)` (280ms) `var(--ease)` (cubic-bezier 0.16, 1, 0.3, 1).
- Cinematic enters: `var(--t-slow)` (480ms) for image-scale-on-hover and tab cross-fade.
- No bounce, no elastic, no spring. Ease-out-quart / quint only.
- Don't animate layout properties — only `transform`, `opacity`, `filter`, `background-color`.

## Mascot rules

- **Where it appears:**
  - Idle / "thinking" — small float in the corner of the editor canvas while a job runs.
  - Empty states — first-run landing, empty filter result.
  - Done state — brief celebrate hover in completion toasts.
- **Where it never appears:**
  - Background wallpaper.
  - On every screen (it stops being a friend, becomes wallpaper).
  - Bigger than 64px outside the landing.
- **Animation:** gentle vertical float, 4s, ease-in-out, 3px amplitude. Never spin, never wave continuously.

## Anti-patterns banned in Stage

- `#000` / `#fff` (use OKLCH neutrals).
- Gradient text outside the wordmark.
- Glassmorphism by default. Allowed only for the canvas dock backdrop, kept subtle.
- Side-stripe accents (`border-left: 3px solid …`). Use full borders, dots, or kickers instead.
- The hero-metric template (big number + small label + supporting stats + gradient accent).
- Identical card grids — Stage uses asymmetric strips, never a 4-column repeat.
- "Working on it ✨" copy. Show the real progress and ETA.
