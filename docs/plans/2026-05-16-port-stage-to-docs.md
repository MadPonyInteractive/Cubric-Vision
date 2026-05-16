# Port Stage redesign → Cubric Studio Docs

**Date:** 2026-05-16
**Target repo:** `c:\AI\Mpi\Cubric Studio (Docs)\` (separate git, separate commits)
**Spec source:** `c:\AI\Mpi\CubricStudio\docs\redesign\` (PRODUCT.md, DESIGN.md, c-stage/editor.html for three-pane shape, c-stage/popups.html for menu/sidebar patterns, c-stage/tokens.css)
**Register:** product (design SERVES the task — user is mid-reference-lookup)
**Status:** plan only, no implementation
**Driver skill:** `$impeccable shape` (gate passed, image probes skipped — porting existing token system to a documentation surface)

---

## Design brief

### Feature summary
Multi-page documentation site with hash-router (`#/home`, `#/getting-started`, `#/projects`, `#/gallery`, `#/history`, `#/models`, `#/workflows`, `#/hotkeys`). Replaces the current neon-glassmorphism design with Stage mauve at product-register density. The deliverable is fast, scannable answers — the chrome must disappear into the task.

### Primary user action
Find one specific answer (a hotkey, a model install step, a project structure question) and leave. Secondary: linear-read a section from top to bottom on first install.

### Design direction
- **Color strategy:** **Restrained.** Tinted mauve neutrals + heat accent ≤5% surface coverage. Heat appears on: active sidebar link (border-left = 2px AND ink color, per Stage `.dropdown-item[aria-selected="true"]` — this is the Stage exception to the side-stripe ban because it's a list navigation item, not a card; verify with maintainer if uncertain), focused inputs, inline link hover, `<code>` accent dot. Frost (`--accent-frost`) on focus rings only.
- **Theme scene sentence:** *Creator mid-install with the Cubric Studio Electron app open behind the browser, glancing at the docs to confirm one step before tabbing back to the app — same warm mauve in both surfaces so the tab switch feels continuous.* Forces mid-tone mauve, identical to the app, not a "lighter docs theme."
- **Anchor references:** (1) Stripe Docs density + neutral layering; (2) Linear Docs sidebar groups + active-link treatment; (3) c-stage `editor.html` three-pane shape (here adapted to: header + sidebar + content + TOC).
- **Reflex-reject lane check:** not "tech-minimal Inter-on-white" (DESIGN.md mandates JetBrains Mono everywhere + mauve). Not Notion-cream. Not Gitbook. The voice is `terminal-native warm dusk`, same as the app.

### Scope
- **Fidelity:** production-ready.
- **Breadth:** every page (8 routes) + sidebar + header + TOC + search input shell (search wiring out of scope).
- **Interactivity:** shipped — keep router, keep mobile menu toggle, keep TOC.
- **Time intent:** polish until it ships, but density / task-focus over flourish.

### Layout strategy
- Three-zone shell: 48px header (top), 280px sidebar (left, full height), content (center, flex), 220px TOC (right, sticky, hidden ≤1024px).
- Sidebar nav-groups (`Overview`, `Core App Flow`, `Reference & Mastery`) separated by 1px `--line`, group heads as `.kicker` (UPPERCASE, 11px, 0.32em tracking, heat bar prefix only on the *active* group's kicker — quiet otherwise).
- Content article: 65ch max-width, kicker eyebrow before h1, h1 in Stage `--t-xl` scale (32px, not the brand `--t-2xl/--t-3xl` — product register tightens the scale per impeccable product.md "tighter scale ratio").
- TOC: same `.kicker` pattern. Active heading has heat dot prefix.
- No nested cards. Code blocks are 1px border `--line`, no shadow, `--surface-2` background, JetBrains Mono inherited.

### Key states
- **Sidebar default vs active.** Active link: heat color, heat dot prefix, `--surface-2` background. Group containing active also bumps its kicker color from `--ink-3` → `--ink-2`.
- **Link hover.** `--ink-1` color, `--surface-2` row background, no underline shift.
- **TOC scroll-spy.** Active heading tracked on scroll; heat dot moves with scroll position.
- **Mobile (≤720px).** Sidebar slides over content from left, overlaid by the existing `.docs-overlay` (already in markup). TOC hides. Header hamburger toggles.
- **Empty / 404 route.** Mascot + `That page doesn't exist yet.` `.kicker` + link to `#/home`. Mascot used here per DESIGN.md "empty states" allowance.
- **Reduced motion.** Disable sidebar slide-in transform; keep instant snap.

### Interaction model
- Hash router (existing `scripts/router.js`) continues — no migration to a framework. Restyle only.
- Search input is a non-functional shell until a search backend is wired. Render as Stage `.input-line` (transparent, 1px bottom border, heat on focus) — NOT a card-shaped input. Placeholder `search docs…`.
- TOC anchor click smooth-scrolls. Update URL hash with the heading id (existing pattern `#/home#what-is-cubric-studio` stays).
- Mobile menu toggle animates the hamburger to a close glyph via opacity + transform on the three spans.

### Content requirements
- All existing page content stays (`pages/home.html`, `pages/getting-started.html`, etc.).
- Mascot block (`.mascot-container` on home.html) keeps current copy but restyled — quiet float, NOT a bordered card with quote bubble. Per DESIGN.md "mascot rules: never used as decorative wallpaper. Used in idle / empty / completion." A single home-page hero placement is fine; remove any mascot calls from other pages.
- Embedded YouTube placeholder: replace `▶️` emoji + dashed placeholder with a Stage `.frame`-style 16:9 box, 1px border `--line`, centered `.kicker` "VIDEO PLACEHOLDER", no emoji.
- All inline links: `--accent-heat` on hover only; rest state is `--ink-1` with a 1px underline `--line`.

### Recommended references during implementation
- `docs/redesign/c-stage/popups.html` (dropdown-item active-state pattern → sidebar link)
- `docs/redesign/c-stage/tokens.css` (`.kicker`, `.input-line`, `.dropdown-item`, `.menu`)
- `docs/redesign/DESIGN.md` § "Components" + § "Typography" + § "Mascot rules"
- impeccable `reference/product.md` (density, system fonts NOT taken here — Cubric forces mono — but the rest applies)

### Open questions
- VT323 wordmark in the docs header logo: yes or no? **Recommendation:** yes, small (18px) — matches app titlebar, reinforces continuity. Loaded via Google Fonts.
- Search backend: out of scope for this port; shell input only. Future: Algolia DocSearch or a static-Lunr index.
- Should the TOC stay sticky on long pages? **Recommendation:** yes, `position: sticky; top: calc(var(--header-height) + var(--s-3));`.

---

## Implementation plan

### Phase 0 — Setup
| # | File | Change |
|---|---|---|
| 0.1 | `styles/tokens.css` *(new)* | Copy `:root` block from `docs/redesign/DESIGN.md`. |
| 0.2 | `styles/base.css` | Delete the existing `:root` (`--primary`, `--neon-electric`, `--bg-light`, `--bg-dark`, all glass surfaces, all glows). Import `tokens.css` first. |
| 0.3 | `index.html` `<head>` | Add Google Fonts `VT323`. Keep `JetBrains Mono`. Drop `Fira Code`. |
| 0.4 | `index.html` `<head>` | Add `<link rel="stylesheet" href="styles/tokens.css">` *before* `base.css` and `docs.css`. |

### Phase 1 — Tokens + base typography
| # | File | Change |
|---|---|---|
| 1.1 | `styles/base.css` `body.docs-body` | `font-family: 'JetBrains Mono', monospace; background: var(--surface-bar); color: var(--ink-1);` |
| 1.2 | `styles/base.css` headings | Replace clamp scale with Stage product-tight scale: h1 → `var(--t-xl)` (32px), h2 → `var(--t-lg)` (19px), h3 → `var(--t-md)` (15px) — tighter than brand register, per impeccable product.md. |
| 1.3 | `styles/base.css` `.gradient-text` | **Delete.** Only the wordmark gets the gradient (VT323 only). |
| 1.4 | `styles/base.css` add `.kicker` | Port from `c-stage/tokens.css`. |
| 1.5 | `styles/base.css` `a` | Default `--ink-1`, 1px bottom border `--line`. Hover: color `--accent-heat`, border `--accent-heat`. |
| 1.6 | `styles/base.css` `code`, `pre` | `font-family: 'JetBrains Mono', monospace; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink-1);` Inline code: 2px padding, no border. Block code: 14px padding, 0 radius. |

### Phase 2 — Header
| # | File | Change |
|---|---|---|
| 2.1 | `styles/docs.css` `.docs-header` | `background: var(--surface-0); border-bottom: 1px solid var(--line);` height stays 60px. |
| 2.2 | `styles/docs.css` `.logo` | `font-family: 'VT323', monospace; font-size: 22px;` Apply heat→frost gradient ONLY on `.logo-text` span (the wordmark exception). Logo PNG gets `filter: hue-rotate(-50deg) saturate(0.78) brightness(1.05)` until recolored. |
| 2.3 | `styles/docs.css` `.search-bar-placeholder input` | Restyle to Stage `.input-line` — transparent bg, 0 borders except bottom 1px `--ink-3`, heat on focus. Width 320px. |
| 2.4 | `styles/docs.css` `.social-link` | `--ink-3` rest, `--ink-1` hover, no background. Drop the rounded button look entirely. UPPERCASE 11px 0.18em tracking. |
| 2.5 | `styles/docs.css` `.menu-btn` | Three 16px-wide spans, 1px tall, `--ink-2`. No background, no border. Hamburger only. Hide on `≥720px`. |

### Phase 3 — Sidebar
| # | File | Change |
|---|---|---|
| 3.1 | `styles/docs.css` `.docs-sidebar` | `background: var(--surface-1); border-right: 1px solid var(--line); width: 280px;` Padding `--s-4 --s-3`. |
| 3.2 | `styles/docs.css` `.nav-group` | Margin-bottom `--s-5`. |
| 3.3 | `styles/docs.css` `.nav-group h3` | Apply `.kicker` pattern: 11px, 0.32em, UPPERCASE, `--ink-3`. NO heat bar prefix (group titles stay quiet). |
| 3.4 | `styles/docs.css` `.nav-link` | Display block, padding `var(--s-2) var(--s-3)`, font 13px, color `--ink-2`, border-left 2px transparent, transition `--t-base`. Hover → bg `--surface-2`, color `--ink-1`. |
| 3.5 | `styles/docs.css` `.nav-link.active` | `color: var(--accent-heat); border-left-color: var(--accent-heat); background: color-mix(in oklch, var(--accent-heat) 8%, transparent);` Per Stage `.dropdown-item[aria-selected="true"]`. **Note:** this is the one place left-border accent is permitted — it's nav, not a card. |
| 3.6 | `scripts/router.js` | Verify it adds `.active` class to current `.nav-link` on route change. If not, add the toggle (existing routers usually do). |

### Phase 4 — Content article
| # | File | Change |
|---|---|---|
| 4.1 | `styles/docs.css` `.docs-main` | `max-width: 720px; padding: var(--s-5) var(--s-6); margin: 0 auto 0 0;` (left-aligned to sidebar, TOC sits to its right). |
| 4.2 | `styles/docs.css` `.content-article h1` | Wrap with a `.kicker` eyebrow on a separate line above the h1 (e.g., "OVERVIEW · INTRODUCTION"). Implement as a `::before` content or as an explicit `<span class="kicker">` in each page (preferred — easier to author). |
| 4.3 | `styles/docs.css` `.content-article p.lead` | `font-size: var(--t-md); color: var(--ink-2); max-width: 65ch; margin-bottom: var(--s-5);` |
| 4.4 | `styles/docs.css` `.content-article p` | `font-size: 13px; line-height: 1.6; color: var(--ink-2); max-width: 65ch;` |
| 4.5 | `styles/docs.css` `.content-article ul, ol` | Reset bullets to 1ch heat `•` markers (custom), or keep default disc in `--ink-3`. |
| 4.6 | `styles/docs.css` `.content-article a.text-link` | Restyle per Phase 1.5. |

### Phase 5 — Mascot + embedded placeholder
| # | File | Change |
|---|---|---|
| 5.1 | `styles/docs.css` `.mascot-container` | Drop card/border treatment. Becomes a horizontal row: 64px mascot PNG (mauve-recolored or hue-rotate filter), `--s-3` gap, `.mascot-quote` in `--ink-2 13px` italic-OFF, max 50ch. No quote bubble border. |
| 5.2 | `pages/home.html` | Replace mascot src reference if filename differs; verify `assets/mascot_happy.png` exists, else fall back to `assets/logo.png` until proper mauve mascot lands. |
| 5.3 | `styles/docs.css` `.embedded-placeholder` | 16:9 aspect-ratio box, `background: var(--surface-2); border: 1px solid var(--line);` Replace `▶️` emoji content with a Stage-styled `<span class="kicker">VIDEO PLACEHOLDER</span>` centered. |
| 5.4 | Audit other `pages/*.html` for redundant mascot usage. Per DESIGN.md mascot rules: not on every page. Remove from all pages except `home.html` and `404.html` (if added later). |

### Phase 6 — TOC
| # | File | Change |
|---|---|---|
| 6.1 | `styles/docs.css` `.docs-toc` | `position: sticky; top: calc(60px + var(--s-3)); width: 220px; padding: var(--s-4) var(--s-3);` Border-left 1px `--line`. Hide `≤1024px`. |
| 6.2 | `styles/docs.css` `.docs-toc h4` | Apply `.kicker` ("ON THIS PAGE"). |
| 6.3 | `styles/docs.css` `.toc-list a` | 13px, `--ink-3` rest, `--ink-1` hover. Active (scroll-spy): heat dot prefix + `--ink-1` color. |
| 6.4 | `scripts/router.js` or new `scripts/toc.js` | Add IntersectionObserver scroll-spy: when a heading enters the top 30% of viewport, mark its TOC entry `.active`. Only one active at a time. |

### Phase 7 — Mobile shell
| # | File | Change |
|---|---|---|
| 7.1 | `styles/docs.css` `@media (max-width: 720px)` | Sidebar `position: fixed; transform: translateX(-100%); transition: transform var(--t-base) var(--ease);` Open state via `.docs-body.menu-open .docs-sidebar { transform: translateX(0); }`. |
| 7.2 | `styles/docs.css` `.docs-overlay` | `background: oklch(0.16 0.02 350 / 0.65); opacity: 0; pointer-events: none; transition: opacity var(--t-base) var(--ease);` Open state: opacity 1 + pointer-events auto. |
| 7.3 | `scripts/router.js` or `scripts/menu.js` | Wire `#mobile-menu-toggle` click → toggle `.menu-open` on body. Click on overlay closes. Click on a nav-link closes. Esc closes. |

### Phase 8 — Loader / empty state
| # | File | Change |
|---|---|---|
| 8.1 | `styles/docs.css` `.loader-container, .loader` | Drop "Loading documentation..." text + spinner. Replace with a `.kicker` "LOADING" + 1px frost line (animated `transform: scaleX(0) → 1` over 800ms infinite, respecting reduced motion). |
| 8.2 | `scripts/router.js` 404 handler | If route unknown, render a small empty-state into `#content-container`: mascot 64px + `.kicker` "PAGE NOT FOUND" + h2 + link back to `#/home`. |

### Phase 9 — Assets
| # | Change |
|---|---|
| 9.1 | Logo PNG: recolor per RECOLOR.md OR keep hue-rotate filter (Phase 2.2). |
| 9.2 | Mascot PNGs: same — recolor or filter. Keep `mascot_happy.png` for the home page; remove copies from other pages. |
| 9.3 | Favicon: inherits from logo. |

### Phase 10 — Verify
| # | Change |
|---|---|
| 10.1 | Loads at `http://127.0.0.1` static server. Hash router navigates between all 8 routes without console errors. |
| 10.2 | Active link state updates correctly per route. Active TOC entry updates on scroll. |
| 10.3 | Mobile menu opens/closes via hamburger, overlay click, link click, Esc. |
| 10.4 | Visual continuity with `docs/redesign/c-stage/popups.html` for menu/dropdown patterns and with `editor.html` for inspector-density layout feel. |
| 10.5 | Lighthouse: ≥95 perf (no images on most pages, should be trivial), ≥95 a11y, keyboard tab order through header → search → sidebar → content → TOC. |
| 10.6 | Grep for banned tokens — `#fff`, `#000`, `rgba(`, `var(--neon`, `var(--primary)`, `gradient-text`. All zero. |
| 10.7 | Grep for `border-left:` on `.content-article` selectors. Allowed ONLY on `.nav-link.active`. Anywhere else = banned per Stage Absolute Bans. |

---

## Files touched
```
c:\AI\Mpi\Cubric Studio (Docs)\
├── index.html                  edit (head, mobile menu wire)
├── styles\
│   ├── tokens.css              NEW
│   ├── base.css                rewrite
│   └── docs.css                rewrite
├── scripts\
│   ├── router.js               edit (active-link toggle, 404 state)
│   └── toc.js                  NEW (scroll-spy)
├── pages\
│   ├── home.html               edit (kicker eyebrow, mascot row, placeholder)
│   ├── getting-started.html    edit (kicker eyebrow)
│   ├── projects.html           edit (kicker eyebrow, drop stray mascot)
│   ├── gallery.html            edit
│   ├── history.html            edit
│   ├── models.html             edit
│   ├── workflows.html          edit
│   └── hotkeys.html            edit (hotkey table → Stage `.menu` keybind row pattern)
└── assets\
    └── logo.png, mascot_happy.png   recolor in Photoshop per RECOLOR.md
```

## Out of scope
- Search backend (input is shell-only).
- Content rewrites (existing copy stays).
- Adding new pages.
- Framework migration (stays vanilla hash-router).

## Risk
- Active-link `border-left: 2px solid` is a documented Stage exception (sidebar nav, not a card). Reviewers may flag it. Document the exception inline in `docs.css` with a comment pointing at `c-stage/tokens.css` `.dropdown-item[aria-selected="true"]`.
- TOC scroll-spy can fight smooth-scroll if headings are very close together. Tune the IntersectionObserver rootMargin (e.g., `-30% 0px -60% 0px`).

## Verification
- All 8 routes navigate. Active states sync.
- Visual diff against `docs/redesign/c-stage/popups.html` for menu/dropdown semantics.
- Same mauve hue at 50% surface lightness as the main app (DESIGN.md scene sentence: tab switch between app and docs feels continuous).
- Stage Absolute Bans absent: no gradient text (except wordmark), no glassmorphism, no side-stripe accents (except documented nav-active), no identical card grids.
