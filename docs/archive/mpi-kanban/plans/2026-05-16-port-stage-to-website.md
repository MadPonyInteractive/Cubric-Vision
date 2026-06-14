# Port Stage redesign → Cubric Studio Website

**Date:** 2026-05-16
**Target repo:** `c:\AI\Mpi\Cubric Studio (Website)\` (separate git, separate commits)
**Spec source:** `c:\AI\Mpi\CubricStudio\docs\redesign\` (PRODUCT.md, DESIGN.md, c-stage/landing.html, c-stage/popups.html, c-stage/tokens.css)
**Register:** brand (design IS the product — landing/marketing surface)
**Status:** plan only, no implementation
**Driver skill:** `$impeccable shape` (gate passed: context+product+design loaded from `docs/redesign/`, image probes skipped — porting existing mockups)

---

## Design brief

### Feature summary
Single-page marketing landing for Cubric Studio. Replaces the current neon-glassmorphism + shader-canvas + gradient-text design with the Stage "warm dusk mauve" identity. Sole conversion: download GitHub release (Win/Mac/Linux) and read the vision/Patreon pitch.

### Primary user action
Pick a platform binary and download. Secondary: scroll the showcase strips to feel the product's range; tertiary: open the Patreon tiers.

### Design direction
- **Color strategy:** **Drenched mauve.** The surface IS the color. `--surface-bar` / `--surface-canvas` carry every section. `--accent-heat` reserved for the headline em-word, primary CTA, gauge fills, kicker bars, hovered platform pill — never as background, never as gradient text outside the wordmark.
- **Theme scene sentence:** *Prospective creator on a 16-inch laptop in a late-evening home office, eyes already strained from too many neon-on-black AI SaaS pages, scanning whether this one feels different.* Forces mid-tone warm dusk, not dark, not light — exactly the locked Stage answer.
- **Anchor references:** (1) c-stage `landing.html` 7/5 split + image-bleed hero; (2) Klim Type Foundry committed-color landings (single saturated color load-bears the page); (3) Linear's section pacing — one dominant idea per fold, deliberate scroll.
- **Reflex-reject lane check:** not editorial-typographic (no serif drop caps). Not Stripe-cream-restraint. Drenched commits to mauve; the only typographic risk is `VT323` pixel wordmark sitting inside JetBrains Mono everywhere else.

### Scope
- **Fidelity:** production-ready.
- **Breadth:** the whole single-page site (`index.html`), plus styles + scripts.
- **Interactivity:** shipped — keep platform autodetect, lightbox modal, video showcase autoplay-on-scroll if already present.
- **Time intent:** polished until it ships. This is the public face.

### Layout strategy
- Asymmetric strips replace the existing symmetric `.showcase-card` + `.showcase-card-reverse`. Cycle 7-5 / 5-7 between sections (mockup `pl-row` aspect-driven). Stage rule: no identical card grids.
- Hero: full-bleed image background (`hero-bg` saturate 0.6 brightness 0.5 mauve hue-rotate) + `hero-grad` 120° mauve-to-canvas gradient + heat radial wash at 30% 80%. Foreground = kicker + `Generate. Refine. <em>Own it.</em>` headline + sub + two-button CTA row.
- Features section: **drop the 6-icon card grid (Absolute Ban: "identical card grids")**. Reshape into asymmetric two-column rhythm — left = oversized kicker + section h2; right = stacked feature rows separated by 1px `--line` with a leading number (`01.` … `06.`) per Stage tag pattern. No icon-above-heading boxes.
- Patreon tiers: keep three-column row but Stage'd — sharp corners (`--r-1`), no glass, heat-only on featured tier border, `tabular-nums` price, pill kept ONLY for the badge label per DESIGN.md "pills reserved for status indicators".
- Vision section: long-form reading column, capped 65ch, kicker eyebrow, body in `--ink-2`, signoff line in `--ink-3`.
- Footer status strip mirrors the app's mockup footer: VRAM/RAM gauges (static demo values are fine — they're a brand prop, not live telemetry; mark `aria-hidden="true"` on the numbers).

### Key states
- **Default scroll-rest state.** Mauve everywhere, mascot absent.
- **Hover / active.** Platform pills swap border → heat. `link-arrow` translates right `4px`. Showcase video controls become visible on hover.
- **Empty / load.** No empty state — content is static. Loading: stage skeleton for showcase video (1px frost line border, no spinner — DESIGN.md bans "Working on it ✨").
- **Reduced motion.** Disable image scale-on-hover and platform-detect bounce; keep color transitions.
- **Small viewport (`≤720px`).** Strips collapse to single column, hero text drops to `--t-2xl`, headline keeps `-0.04em` tracking. Picker-style status footer hides gauges, keeps idle dot + label.

### Interaction model
- Platform autodetect highlights one of {Mac, Windows, Linux} pill with heat border and dot prefix.
- Showcase videos play inline with native controls (already shipping). No autoplay sound. Pause on tab blur.
- Lightbox stays — recolor close button per Stage `.popup-h .x` pattern (1px line border, ink-3 → ink-1 hover).
- Patreon CTA opens `patreon.com/cubricstudio` external. Mark `rel="noopener"`.

### Content requirements
- Hero headline: `Generate. Refine. <em>Own it.</em>` — copy from c-stage landing, em on `Own it.` only.
- Hero kicker: `your machine, your studio` (UPPERCASE rendered via `.kicker`).
- Sub: keep the existing "Your Local AI Workstation. No setup. No configuration. Just create." but trim to one line — DESIGN.md bans `✨` and hype copy.
- Showcase labels (`Text to Video`, `Photorealistic Images`, etc.) become Stage `.kicker` eyebrows, NOT pills.
- Status badge "Project Under Construction" — drop. Replaces with stage footer `● Beta` chip in `--accent-ok`. Construction badge is hype that conflicts with the "honest about state" tone.
- Vision section copy stays — already Stage-tone-compliant.

### Recommended references during implementation
- `docs/redesign/c-stage/landing.html` (hero pattern, footer gauge, pl-row hover)
- `docs/redesign/c-stage/tokens.css` (`.btn`, `.btn-primary`, `.kicker`, `.gauge`, `.dropdown-trigger`)
- `docs/redesign/DESIGN.md` § "Layout principles" + § "Anti-patterns banned in Stage"
- `docs/redesign/RECOLOR.md` (for the mascot/logo Photoshop pass — defer until landing CSS lands)

### Open questions
- Shader background: confirmed dropped (Stage spec forbids — `PORTING.md` Phase 0.4). Replace with static hero image.
- Showcase media: keep existing `t2v_1080 (4).mp4`, `AlchemyMix176.png`, etc., or generate new mauve-graded captures? **Recommendation:** keep current assets, apply CSS `filter: saturate(0.92)` per Stage `.frame` rule. Mauve-grade can come later from real Cubric output.
- VT323 wordmark: vendor locally per `PORTING.md` Phase 0.9 OR keep Google Fonts CDN for the website only. **Recommendation:** Google Fonts CDN here (it's a public site, no offline requirement, no electron sandbox).

---

## Implementation plan

### Phase 0 — Setup (worktree-style, separate repo)
| # | File | Change |
|---|---|---|
| 0.1 | `styles/tokens.css` *(new)* | Copy the `:root` block from `docs/redesign/DESIGN.md` verbatim (OKLCH tokens, type scale, spacing, radius, motion). |
| 0.2 | `styles/landing.css` | Delete the existing `:root` block (`--primary`, `--neon-electric`, `--bg-light`, `--bg-dark`, all glass surfaces, all neon glows). Import `tokens.css` first. |
| 0.3 | `index.html` `<head>` | Add Google Fonts link for `VT323`. Keep `JetBrains Mono` link. Drop `Fira Code` — DESIGN.md says JetBrains Mono only. |
| 0.4 | `index.html` body | Remove `<canvas id="shader-background">`. Remove `<script type="module" src="shaderBackground.js">`. Delete `shaderBackground.js` from repo. |
| 0.5 | `styles/landing.css` | Strip the `header, section, footer, main, article { background: transparent !important; }` rule. Backgrounds become opaque mauve. |

### Phase 1 — Tokens + base typography
| # | File | Change |
|---|---|---|
| 1.1 | `styles/landing.css` `body` | `font-family: 'JetBrains Mono', monospace; background: var(--surface-bar); color: var(--ink-1);` Remove `linear-gradient` bg. |
| 1.2 | `styles/landing.css` headings | Replace clamp scale with Stage scale: h1 → `var(--t-2xl)` (responsive clamp 48 → 96), h2 → `var(--t-xl)`, h3 → `var(--t-lg)`. Weight 700/600 split per DESIGN.md table. Letter-spacing per table. |
| 1.3 | `styles/landing.css` `.gradient-text` | **Delete.** Replace every call site with plain `<span>` or with `.wordmark` (VT323 + heat→frost gradient) only on the literal "Cubric Studio" wordmark in the hero + section titles. |
| 1.4 | `styles/landing.css` `.btn`, `.btn-primary` | Replace with Stage `.btn` + `.btn-primary` from `c-stage/tokens.css`. Sharp corners (`--r-1: 0`), uppercase, 1px border, hover inverts. |
| 1.5 | `styles/landing.css` add `.kicker` | Port from `c-stage/tokens.css`. |

### Phase 2 — Hero
| # | File | Change |
|---|---|---|
| 2.1 | `index.html` `.hero` | Restructure to mockup pattern: `.hero-bg` (full-bleed cinematic image — use `assets/AlchemyMix176.png` or a new mauve-graded hero shot), `.hero-grad` (mauve diagonal + heat radial), `.hero-inner` (flex column, space-between). |
| 2.2 | `index.html` headline | `<h1>Generate.<br/>Refine. <em>Own it.</em></h1>`. Drop `.gradient-text`. The em-tag gets `color: var(--accent-heat)`. |
| 2.3 | `index.html` `.hero-cta` | Two buttons only: "Download" (`.btn-primary`) + "View on GitHub" (`.btn`). Move per-platform pills DOWN below CTA into a `.hero-foot` row OR keep them as a separate "Download for your platform" strip later in the page. |
| 2.4 | `index.html` `.status-badge` | Delete. Replaced by footer `● Beta` chip. |
| 2.5 | `index.html` `.scroll-indicator` | Restyle: tiny `.kicker` + 1px line + arrow. No bounce animation. |

### Phase 3 — Showcase strips (the four `.showcase-section` blocks)
| # | Change |
|---|---|
| 3.1 | Replace `.showcase-card` (symmetric grid) with Stage 7-5 / 5-7 asymmetric grid. CSS: `grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);` Alternate per section. |
| 3.2 | Media side: zero card chrome (no border, no inner padding, no shadow). Image/video full-bleed with `filter: saturate(0.92) brightness(0.92); transition: var(--t-slow) var(--ease);` and `:hover` lifts to `saturate(1) brightness(1)` + `scale(1.03)` per DESIGN.md `.frame`. |
| 3.3 | Text side: `.kicker` eyebrow (replaces `.showcase-label`), Stage h2, body in `--ink-2`, `.link-arrow` restyled to underline-on-hover + `→` icon translates 4px. |
| 3.4 | Drop `border-radius` from media wrappers. Sharp. |

### Phase 4 — Features section (rebuild — ban: identical card grid)
| # | Change |
|---|---|
| 4.1 | Restructure markup: two-column grid `minmax(0, 4fr) minmax(0, 8fr)`. Left = sticky kicker + `Why Cubric Studio?` h2 + one short paragraph. Right = list of 6 features as rows. |
| 4.2 | Each feature row: 3-column grid (number, content, divider). `01.` … `06.` numerals in `--ink-3` `tabular-nums`. Title 19px 600. Description 13px `--ink-2`. 1px top border `--line`. Drop the SVG icons entirely — Stage uses kickers + numbers, not icon-above-heading boxes. |
| 4.3 | Hover: row pads left 14px (mockup `.pl-row` pattern), heat `▸` glyph reveals at left. |

### Phase 5 — Download CTA + Patreon
| # | Change |
|---|---|
| 5.1 | Download CTA: single horizontal row of three Stage `.btn` (Mac / Win / Linux). Heat fill on the auto-detected platform only. Section gets a mauve-canvas darker stripe (`--surface-canvas`) for visual rhythm. |
| 5.2 | Patreon tiers: three columns, sharp corners, no glass background. Featured tier border = `--accent-heat`; others `--line`. Price in `tabular-nums`. Pill on the badge label only (`.tier-badge` keeps `--r-pill` per DESIGN.md status-pill exception). Drop any glow/shadow. |

### Phase 6 — Vision section
| # | Change |
|---|---|
| 6.1 | Cap reading column 65ch. Kicker eyebrow "OUR VISION". h2 Stage scale. Body `--ink-2`. Signoff `--ink-3 italic` — actually skip italic (DESIGN.md says no italic), use small-caps `.kicker` for the signoff. |
| 6.2 | Drop the `.vision-card` glass background. Mauve canvas section, that's it. |

### Phase 7 — Footer status strip
| # | Change |
|---|---|
| 7.1 | Add `<footer class="bar">` at end of `<body>` (NOT the existing `.footer` — that becomes the legal/links footer above it). Copy mockup `landing.html` footer markup: idle dot, VRAM gauge, RAM gauge. Static demo numbers fine. |
| 7.2 | Existing `.footer` (GitHub/Docs/Home links + copyright): restyle to JetBrains Mono `--t-xs` UPPERCASE `--ink-3`, 1px top border. |

### Phase 8 — Lightbox + interactions
| # | Change |
|---|---|
| 8.1 | Recolor lightbox close button per Stage `.popup-h .x` pattern. Lightbox backdrop = `oklch(0.16 0.02 350 / 0.85)` (deep mauve, not black). |
| 8.2 | `scripts/landing.js`: keep platform autodetect, lightbox open/close, version number injection. Drop any shader-related code. Add `.kicker`-text-typing intro? **No** — DESIGN.md says "no glow-and-flash"; one well-paced scroll-reveal is enough. |
| 8.3 | Scroll-reveal: one IntersectionObserver, `opacity 0 → 1, translateY(12px → 0)`, `--t-slow` ease. Respect `prefers-reduced-motion`. No staggered card cascades. |

### Phase 9 — Assets
| # | Change |
|---|---|
| 9.1 | Logo `assets/logo.png`: recolor in Photoshop per `docs/redesign/RECOLOR.md` (or apply CSS `filter: hue-rotate(-50deg) saturate(0.78) brightness(1.05)` until the PNG is recolored). |
| 9.2 | Lettering (if used): same treatment via `--brand-lettering` filter. |
| 9.3 | Showcase media: keep existing files. Optional follow-up: regenerate hero from real Cubric Stage output. |
| 9.4 | Favicon: keep current; will inherit mauve recolor when source PNG is updated. |

### Phase 10 — Verify
| # | Change |
|---|---|
| 10.1 | Visual diff against `docs/redesign/c-stage/landing.html` in browser. Acceptable: identical hero layout + footer gauges + drenched mauve. Acceptable to deviate: more sections (the mockup is single-fold, the site is multi-fold). |
| 10.2 | Lighthouse: ≥90 perf, ≥95 a11y. Drop `*::after`-style glow stacks if they tank LCP. |
| 10.3 | Resize sweep: 360 / 720 / 1280 / 1920. Strips collapse cleanly. Headline keeps tracking. |
| 10.4 | Grep for banned tokens — `#fff`, `#000`, `rgba(`, `var(--neon`, `var(--primary)`, `gradient-text`. All must be zero. |
| 10.5 | Manual: confirm zero `border-left: Npx solid <color>` on cards (Absolute Ban). |

---

## Files touched
```
c:\AI\Mpi\Cubric Studio (Website)\
├── index.html                  rewrite
├── shaderBackground.js         DELETE
├── styles\
│   ├── tokens.css              NEW (OKLCH tokens)
│   └── landing.css             rewrite
├── scripts\
│   └── landing.js              edit (drop shader hook, add scroll-reveal)
└── assets\
    └── logo.png                recolor in Photoshop per RECOLOR.md
```

## Out of scope
- New Patreon copy / new vision copy (content stays).
- New showcase media (existing MP4/PNG stay; mauve-grade post-hoc).
- Multi-page expansion (still single-page).
- Server-side rendering / framework migration (stays static HTML + ES modules).

## Risk
- Hue-rotate filter on the logo is a stopgap, not a ship state — schedule a Photoshop pass (RECOLOR.md) before public release.
- Mauve drench at every fold can feel monotonous; rhythm comes from `--surface-bar` vs `--surface-canvas` stripe alternation, NOT from accent colors. Verify on visual diff.

## Verification
- Loads at `127.0.0.1` static server. No console errors. No shader canvas in DOM.
- Visual side-by-side with `docs/redesign/c-stage/landing.html` shows shared identity.
- All Stage Absolute Bans (gradient text outside wordmark, side-stripe borders, glassmorphism, identical card grids, hero-metric template) are absent.
