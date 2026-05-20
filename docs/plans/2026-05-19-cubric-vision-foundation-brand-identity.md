# Cubric Vision Foundation — Brand Identity

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - brand-identity`
**Priority:** high
**Track:** `brand-identity`

## Purpose

Lock naming hierarchy, decide mascot scope for v1, and produce a concrete asset/text inventory. Output is decisions + inventory — no code rename here. Blocks `app-rename` (Phase 2) and informs `release-copy` (Phase 7).

## Scope

In scope:
- Naming lock: ecosystem + apps + display vs id forms.
- Release-blocking brand scope vs deferred polish.
- Asset/text inventory across app, sibling Website, sibling Docs, redesign source.
- Mascot scope decision for Cubric Vision v1.

Out of scope:
- Renaming user-visible strings (handled by `app-rename` child).
- Sibling repo commits or pushes.
- New mascot/letter variant production work.
- Editing `.claude/rules/`.

## Current State

- Parent plan Phase 1 captures four naming/branding to-dos.
- Mascot + lettering recolor already shipped across surfaces (COMPLETED kanban entry, app canonical).
- Stage redesign merged at `e9b5eb6`; OKLCH tokens live.
- Website push gated on app-downloadable per `project_website_push_gate.md`.
- Default project root still `<Documents>/Cubric Studio/Projects` per `project_default_projects_root.md` — naming decision here informs Phase 2 migration call.

## Decisions Captured

### Product Family Naming

Cubric Studio is the master hub for the Cubric application family. Individual
apps use the `Cubric <App>` form: `Cubric Vision`, `Cubric Prompt`,
`Cubric Audio`, `Cubric Video`, and future apps following the same pattern.

### Accent Color Direction

Shared UI surfaces stay on the Stage warm mauve system. Each app gets one
small, high-contrast accent used for app identity, active states, logo detail,
and wordmark emphasis.

| App | Accent name | OKLCH candidate | Notes |
| --- | --- | --- | --- |
| Cubric Vision | Rose lift | `oklch(0.76 0.17 355)` | Pink remains Vision's visual/generative accent. |
| Cubric Prompt | Signal lemon | `oklch(0.88 0.13 102)` | Yellow direction for language, text, and prompt work. |
| Cubric Audio | Seafoam | `oklch(0.84 0.11 170)` | Mint direction for signal, waveform, and music work. |
| Cubric Video | Orange cut | `oklch(0.78 0.15 48)` | Red-orange direction for timeline, frame, and edit energy. |
| Cubric Studio | Warm neutral | `oklch(0.78 0.028 80)` | Hub remains calmer and less app-specific. |

Reference swatch board:
`docs/plans/2026-05-19-cubric-accent-swatch-board.html`.

Selected accent HEX approximations for raster/Photoshop work:

| App | HEX |
| --- | --- |
| Cubric Studio | `#C1B6A4` |
| Cubric Vision | `#FC77AA` |
| Cubric Prompt | `#EDE367` |
| Cubric Audio | `#70E2C5` |
| Cubric Video | `#FF9360` |

### Mascot Direction

The mascot system should become a Cubric operator family, not one mascot reused
for every app. `Cubric Studio` is the coordinator and keeps the only normal
robot face. App-specific mascots use specialized heads: Vision = camera/lens,
Prompt = speech-bubble/terminal cursor, Audio = waveform/headphones, Video =
film frame/playhead. OS/taskbar icons should use head-only crops; full-body
mascots are for in-app animations and empty/busy/success states.

Current external asset working folder:
`C:\AI\Mpi\Cubric Studio Brand Assets\`.

External assets reportedly ready at handoff time:
- Head crops for Hub, Vision, Prompt, Audio, Video.
- Full-body mascot plus greet/happy/idle variants for each app.
- A PSD named `Full Body Mascots`.

### Lettering Direction

**Locked: Russo One (Google Fonts, Regular 400) replaces image-based lettering.**

PNG lettering (`assets/lettering.png` + Photoshop source in
`media/assets/`) is retired in favor of live text rendered in Russo One.
The UI font stack is unchanged — this decision is scoped to brand/wordmark
surfaces only, not body text or UI chrome.

Lockup pattern (Option A — single weight, color-differentiated):

- "Cubric" rendered in ink-1 (white / `--ink-1`).
- App suffix (`Studio` / `Vision` / `Prompt` / `Audio` / `Video`) rendered
  in the app's accent color from the table above.
- Same size, same weight (Russo One 400) for both halves.
- Color is the only differentiator between hub and app, so all lockups
  read as one family at any scale.

Why Russo One:
- Single display weight (400) is heavy by design — already reads bold.
- Slight forward lean carries motion/character without italic styling.
- Verified by the user to hold up at title sizes AND tiny sizes for
  app lockups like `Cubric Vision` and `Cubric Prompt`.
- Free, single weight, no licensing complexity.

Surfaces affected:
- Splash / hero / About panel wordmark.
- Landing surfaces showing the Cubric Studio wordmark.
- Per-app lockups (`Cubric Vision`, `Cubric Prompt`, `Cubric Audio`,
  `Cubric Video`).
- Dual-tree implication: both `media/assets/` (source) and runtime
  `assets/lettering.png` are deprecated once the font lockup ships;
  the dual-tree rule still applies if any raster fallback is kept.

OS/taskbar icons remain mascot head-only per the mascot decision above —
not affected by this lettering swap.

### Canonical Naming Table

**Identifier scheme (locked):**

| Layer | Form | Purpose |
| --- | --- | --- |
| Display name | Title case + space | User-facing copy (UI, website, docs, About panel). |
| App id | Dotted reverse-style, lowercase | Stable machine identifier for integration JSON, Electron bundle id, capability namespacing, IPC, settings keys. |
| Filesystem / package | Kebab, lowercase | `package.json` name, installer/portable artifact names, repo names, on-disk folders. |
| Subdomain | Lowercase, single segment under `cubric.studio` | Web addressing. |
| Capability id | Dotted, lowercase (`<noun>.<verb>` or `<noun>`) | Action-based vocabulary requested across apps (Phase 3 umbrella). |

**Per-app table:**

| Role | Display name | App id | Package / FS | Subdomain |
| --- | --- | --- | --- | --- |
| Hub (not an app) | Cubric Studio | — | — | `cubric.studio` |
| App | Cubric Vision | `cubric.vision` | `cubric-vision` | `vision.cubric.studio` |
| App | Cubric Prompt | `cubric.prompt` | `cubric-prompt` | `prompt.cubric.studio` |
| App | Cubric Audio | `cubric.audio` | `cubric-audio` | `audio.cubric.studio` |
| App | Cubric Video | `cubric.video` | `cubric-video` | `video.cubric.studio` |
| Docs site | — | — | — | `docs.cubric.studio` |

**Hub clarification:**

`Cubric Studio` is **not an app** in v1. It is the ecosystem hub: a small
background system that connects installed Cubric apps and the landing page
at `cubric.studio` that lists available apps and links to them. It may
become an app surface much later, but ships with no UI of its own in v1.
Because of that, "Cubric Studio" should not be used as the ecosystem-wide
reference term — see below.

**Ecosystem reference term:**

Use **`Cubric ecosystem`** (or bare `Cubric` where context is clear) when
referring to the family of apps as a concept. Do not use `Cubric Studio`
as a synonym for the ecosystem, because the hub may later gain a UI and
the two meanings would collide. Appears in: About panel, website header
copy, docs landing, package publisher field.

**Case + spacing rules:**

- Display names always use title case with a space (`Cubric Vision`, never
  `CubricVision`, never `cubric-vision`, never `cubricvision`).
- App ids are always lowercase dotted (`cubric.vision`). No camel case,
  no kebab. Period is namespace separator.
- Filesystem / package names are always lowercase kebab (`cubric-vision`).
  Used for `package.json` `name`, artifact filenames, repo names, and any
  on-disk folder created by the app itself.
- Subdomains are always lowercase single segments (`vision`,
  `prompt`, `audio`, `video`, `docs`) under `cubric.studio`.

**Capability id convention:**

Capabilities are dotted lowercase, action-based, and **not** prefixed with
the app id. Example: `prompt.enhance`, `prompt.translate`,
`prompt.format.model`, `asset.import`, `asset.export`,
`project.context.read`. The integration contract names the providing app
separately by app id — see Phase 3 of the umbrella plan.

Example integration shape:

```json
{
  "from": "cubric.vision",
  "to": "cubric.prompt",
  "capability": "prompt.enhance"
}
```

## Remaining Work

## Phase 1: Naming Lock

- [x] Write canonical naming note covering ecosystem (`Cubric` / `Cubric Studio`), current app display name (`Cubric Vision`), app id form (`cubric.vision`), and future app display names (`Cubric Prompt`, `Cubric Audio`, `Cubric Video`). **Verify:** Canonical Naming Table above lists display name + app id + package/FS + subdomain per app with no contradictions.

- [x] Decide ecosystem-level term. **Locked:** `Cubric ecosystem` (or bare `Cubric` when context is clear). `Cubric Studio` is reserved for the hub and is not used as an ecosystem synonym, because the hub may later gain a UI. Used in: About panel, website header, docs header, package publisher.

- [x] Lock title-case + spacing rules. **Locked:** display names title case + space, app ids lowercase dotted, package/FS lowercase kebab, subdomains lowercase single segment. See Canonical Naming Table above.

### Mascot Scope (Locked)

**Mascot system is an ecosystem operator family**, not Vision-only. The full
family already exists as external assets in
`C:\AI\Mpi\Cubric Studio Brand Assets\`:

- Head crops for Hub + Vision + Prompt + Audio + Video.
- Full-body mascots per app with three states: `idle`, `greet`, `happy`.
- PSD `Full Body Mascots`.

**Per-app variant system is part of v1**, not deferred — assets are
already produced, only the wiring/inventory work remains downstream.

**Vision v1 ships Vision mascot only.** Other apps' mascot assets stay in
the external brand-assets folder until those apps ship. The Hub
(Cubric Studio) mascot + lettering land in a future hub repo created
when this app is renamed from `Cubric Studio` to `Cubric Vision`.

### Asset Tree (Locked, supersedes dual-tree rule)

The existing dual-tree rule (`feedback_dual_asset_tree.md` — sources in
`media/assets/`, runtime in `assets/mascot/` + `assets/lettering.png`) is
**retired for the Vision repo**.

- `media/assets/` is **deprecated** in the Vision repo. Contents are
  legacy and will be deleted as part of Phase 3 inventory work.
- Master / source files (PSDs, layered, full-res) live **outside the
  repo** in `C:\AI\Mpi\Cubric Studio Brand Assets\`, later migrating to
  a future `Cubric Studio` hub repo created during rename.
- Runtime files in the Vision repo live in `assets/mascot/` only, **flat
  layout, no per-app subfolder** (the app IS Vision — a `vision/`
  subfolder would be redundant). Subfolder convention is reserved for
  the future hub, where multiple app mascots coexist.
- The dual-tree memory note will be updated to reflect this when the
  inventory work in Phase 3 executes.

Mascot state filenames in `assets/mascot/` follow the locked state set:
`idle`, `greet`, `happy`.

### Phase 2 Items

- [x] Decide whether current mascot (`comfy_robot_engine*`) stays Cubric Vision-specific or becomes ecosystem mascot. **Locked:** ecosystem operator family. Each app has its own specialized mascot variants (head + idle/greet/happy body) already produced externally. Studio coordinator mascot is ecosystem-only and not bundled into Vision v1.

- [x] If Vision-specific: confirm no release surface depends on a future per-app mascot variant system. **N/A** — decision is ecosystem mascot family; this branch does not apply.

- [x] If ecosystem mascot: note this decision but defer per-app variant work to a later plan; v1 ships current mascot unchanged. **Refined lock:** per-app variant system IS part of v1 at the asset level — the variants already exist externally. v1 wiring only ships Vision's variants; other apps' variants stay external until those apps ship. No new mascot production work is required for v1.

- [x] Decide lettering treatment. **Locked:** Option (c) — replace `assets/lettering.png` with a font-based wordmark/lockup system using Russo One Regular 400. "Cubric" in ink-1, app suffix in app accent. Same size, same weight. See `### Lettering Direction` above for full spec. Inventory must add a row to deprecate `assets/lettering.png` + its `media/assets/` source.

## Phase 3: Asset + Text Inventory

### Auxiliary Decisions (Locked)

These ecosystem-wide decisions surfaced during Phase 3 inventory and are
locked here because every row below depends on them.

**State vocabulary.** Mascot states across the Vision app are normalized
to **`idle` / `greet` / `happy`** only. Existing app mascot poses map as
follows on replace:

| Existing file | New state | Rationale |
| --- | --- | --- |
| `assets/mascot/mascot.png` | `idle` | Neutral default pose. |
| `assets/mascot/mascot-hi.png` | `greet` | "Hi" pose. |
| `assets/mascot/mascot-ho.png` | `greet` (alternate) | "Ho" is also a greet variant; pick one canonical greet, retire the other. |
| `assets/mascot/mascot-arms.png` | retired | Does not map to the locked state set. |
| `assets/mascot/logo.png` | head (logo) | Head crop = logo; separate file from body states. |

External brand-assets folder (`C:\AI\Mpi\Cubric Studio Brand Assets\`)
remains **untouched** by this plan and the app-rename child. It is the
master source library; the unidentified / alternate / variant files there
are deliberate creative material for future asset work.

**File layout in `assets/mascot/`.** Head crop = logo file (single PNG).
Full-body states = three PNGs named `idle.png`, `greet.png`, `happy.png`.
Flat layout, no per-app subfolder (the app IS Vision).

**HuggingFace org.** `huggingface.co/cubric-studio/...` **stays**. The HF
org is an ecosystem-wide model hub shared across all future Cubric apps,
not per-app. Classification: `keep`.

**Patreon.** `patreon.com/cubricstudio` was never released. All references
move to **`https://www.patreon.com/madponyinteractive`** — the
MadPonyInteractive brand Patreon supports all Cubric ecosystem apps and
other MadPonyInteractive projects. Classification: `rename` (URL swap, no
audience-loss risk).

**GitHub.** Owner stays **`MadPonyInteractive`** (your company is the
parent of the Cubric ecosystem and other projects — no sub-org for
Cubric). Repo naming convention per app:

| Purpose | Repo |
| --- | --- |
| Vision public release | `MadPonyInteractive/Cubric-Vision` |
| Vision dev | private dev repo (current `CubricStudio dev` → renamed `Cubric-Vision-Dev`) |
| Hub release (future) | `MadPonyInteractive/Cubric-Studio` |
| Future apps | `MadPonyInteractive/Cubric-Prompt`, `Cubric-Audio`, `Cubric-Video` (+ `-Dev` siblings) |

The current public repo `MadPonyInteractive/Cubric-Studio` will be
**renamed** to `MadPonyInteractive/Cubric-Vision` as part of app-rename.
The freed `Cubric-Studio` name is reserved for the future hub repo.

All in-code GitHub URLs currently use `github.com/cubric-studio/cubric-studio`
(wrong on both segments — no `cubric-studio` org has ever existed). Two
fixes per URL: org segment `cubric-studio` → `MadPonyInteractive`, repo
segment `cubric-studio` → `Cubric-Vision`.

### Bucket Conventions

Every inventory row carries two attributes:

- **Classification** — one of `rename` (string/URL change), `replace`
  (file swap), `defer` (post-v1 polish), `keep` (no change).
- **Bucket** — one of `release-blocking` (must change before Vision v1
  ships) or `non-blocking` (post-release polish, historical doc, etc).

### 3.A — App Repo: User-Visible Strings

| Path | Current | Proposed | Classification | Bucket |
| --- | --- | --- | --- | --- |
| `package.json` (`description`) | `"Cubric Studio Desktop app — Local Open Source..."` | `"Cubric Vision Desktop app — ..."` | rename | release-blocking |
| `electron-builder.yml` (`productName`) | `Cubric Studio` | `Cubric Vision` | rename | release-blocking |
| `electron-builder.yml` (`appId`) | `com.madponyinteractive.cubric-studio` | `com.madponyinteractive.cubric-vision` | rename | release-blocking |
| `Start.bat` | `echo Starting Cubric Studio (Desktop)...` | `echo Starting Cubric Vision (Desktop)...` | rename | release-blocking |
| `index.html` (`<title>`) | `Cubric Studio \| AI Workflow Workstation` | `Cubric Vision \| AI Workflow Workstation` | rename | release-blocking |
| `index.html` (`meta description`) | `Cubric Studio — a powerful local AI workstation...` | `Cubric Vision — ...` | rename | release-blocking |
| `index.html` line 19 | `alt="Cubric Studio Logo"` | `alt="Cubric Vision Logo"` | rename | release-blocking |
| `index.html` line 20 | `alt="Cubric Studio"` (lettering alt) | `alt="Cubric Vision"` | rename | release-blocking |
| `index.html` line 69 | `<span id="heroVersion">Cubric Studio</span>` | `<span id="heroVersion">Cubric Vision</span>` | rename | release-blocking |
| `js/shell/projectUI.js` line 48 | `\`Cubric Studio · v${APP_VERSION}\`` | `\`Cubric Vision · v${APP_VERSION}\`` | rename | release-blocking |
| `js/components/Compounds/LandingPages/MpiAbout/MpiAbout.js` lines 18–19 | `alt="Cubric Studio"` (logo + lettering) | `alt="Cubric Vision"` | rename | release-blocking |
| `js/components/Compounds/MpiNewProject/MpiNewProject.js` line 39 | hint text `Documents/Cubric Studio/Projects` | hint text `Documents/Cubric Vision/Projects` (depends on `getProjectsRoot()` decision below) | rename | release-blocking |
| `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` line 81 | `href="https://docs.cubric.studio"` | unchanged (ecosystem-wide docs site) | keep | n/a |

### 3.B — App Repo: Internal-Code Strings

| Path | Current | Proposed | Classification | Bucket |
| --- | --- | --- | --- | --- |
| `package.json` (`name`) | `"cubric-studio"` | `"cubric-vision"` | rename | release-blocking |
| `js/core/appName.cjs` line 8 | `APP_NAME: 'Cubric Studio'` | `APP_NAME: 'Cubric Vision'` | rename | release-blocking |
| `js/core/appName.js` line 13 | `export const APP_NAME = 'Cubric Studio'` | `export const APP_NAME = 'Cubric Vision'` | rename | release-blocking |
| `routes/shared.js` line 110 | `User-Agent: 'CubricStudio/1.0'` | `User-Agent: 'CubricVision/1.0'` | rename | release-blocking |
| `js/components/factory.js` (comment) | `Core Component Factory for Cubric Studio.` | `Core Component Factory for Cubric Vision.` | rename | non-blocking |
| `js/components/types.js` (comment) | `Shared Component Type Definitions for Cubric Studio.` | `Cubric Vision` | rename | non-blocking |
| `js/events.js` (comments) | `Centralized Event Bus for Cubric Studio.` + `Canonical event names for Cubric Studio` | `Cubric Vision` | rename | non-blocking |
| `js/core/appVersion.js` (comments) | `Semantic version of the Cubric Studio application.` (2x) | `Cubric Vision` | rename | non-blocking |
| `js/utils/{async,file,dom,string}.js` (comments) | `... utilities for Cubric Studio.` (4 files) | `Cubric Vision` | rename | non-blocking |
| `styles.css` line 2 | `Cubric Studio — styles.css` | `Cubric Vision — styles.css` | rename | non-blocking |
| `styles/01_base.css` lines 2, 39 | `Cubric Studio — 01_base.css` (2x) | `Cubric Vision — 01_base.css` | rename | non-blocking |
| `CLAUDE.md` (project routing doc) | multiple `Cubric Studio` refs | `Cubric Vision` where it refers to the app; `Cubric ecosystem` where family-wide | rename | non-blocking |
| `AGENTS.md` line 33 | `Cubric Studio user-facing documentation work...` | `Cubric Vision user-facing documentation work...` | rename | non-blocking |
| `.agents/skills/cubric-user-docs/SKILL.md` + `agents/openai.yaml` | `Cubric Studio` refs | `Cubric Vision` | rename | non-blocking |

### 3.C — App Repo: Filesystem Paths

| Path | Current | Proposed | Classification | Bucket |
| --- | --- | --- | --- | --- |
| `routes/shared.js` line 50 (`getProjectsRoot()`) | `path.join(APP_DOCUMENTS, 'Cubric Studio', 'Projects')` | `'Cubric Vision'` + migration shim that reads from `Cubric Studio/Projects` if present and migrates / dual-reads | rename | release-blocking |
| `routes/shared.js` line 32 (comment) | `→ <Documents>/Cubric Studio/Projects` | `→ <Documents>/Cubric Vision/Projects` | rename | release-blocking |
| `docs/project-integrity.md` lines 35, 108 | example path `C:\Users\Fabio\Documents\CubricStudio\projects\my-project` | `Cubric Vision` | rename | non-blocking |
| `js/data/modelConstants/dependencies.js` (8 HuggingFace URLs `.../cubric-studio/resolve/main/...`) | `huggingface.co/cubric-studio/...` | unchanged | keep | n/a |

### 3.D — App Repo: Brand Assets

| Path | Type | Action | Classification | Bucket |
| --- | --- | --- | --- | --- |
| `assets/lettering.png` | PNG wordmark "Cubric Studio" | retire (replaced by Russo One live text per Lettering Direction) | replace | release-blocking |
| `assets/mascot/logo.png` | mascot head logo (1024×1024) | replace with Vision head crop from external folder | replace | release-blocking |
| `assets/mascot/mascot.png` | neutral body (1024×1024) | replace with Vision `idle` from external folder | replace | release-blocking |
| `assets/mascot/mascot-arms.png` | arms-raised body | retire (no mapping in new 3-state set) | replace (delete) | release-blocking |
| `assets/mascot/mascot-hi.png` | "hi" greeting body | replace with Vision `greet` from external folder | replace | release-blocking |
| `assets/mascot/mascot-ho.png` | alternate "ho" pose | retire OR adopt as alternate `greet`; pick one canonical at execution time | replace (decide) | release-blocking |
| `assets/mascot/` (post-replace target) | `logo.png` + `idle.png` + `greet.png` + `happy.png` | produce from external Vision files | replace | release-blocking |
| `assets/fonts/{FiraCode,JetBrainsMono,VT323}*.woff2` | UI/code fonts | unchanged (UI font stack, not brand) | keep | n/a |
| `assets/hero-bg.jpeg` | landing background | unchanged | keep | n/a |
| `media/assets/` (legacy dual-tree source) | Photoshop sources | deprecated; delete or move to external brand-assets folder | replace (delete) | non-blocking |
| Electron app icon (`build/`/`resources/` — not present per inventory) | generated by `electron-builder` at build time | regenerate from new mascot head | replace | release-blocking |

### 3.E — Sibling: Cubric Studio (Website)

Absolute path: `c:\AI\Mpi\Cubric Studio (Website)\`. Website push gate
still applies (`project_website_push_gate.md`): do not push until app is
downloadable, user review is done, and mascot/logo recolor is landed in
the app. Inventory work below is preparation only.

Strategic note: the Website is evolving from a single-app "Cubric Studio"
landing into an **ecosystem landing** at `cubric.studio` linking to per-app
subdomains. That broader redesign is a separate plan; rows below cover
only what intersects with this brand-identity / app-rename effort.

| Path | Current | Proposed | Classification | Bucket |
| --- | --- | --- | --- | --- |
| `index.html` `<title>` | `Cubric Studio — Your Local AI Workstation` | ecosystem-landing title (TBD by website plan) | defer | non-blocking |
| `index.html` hero lettering `alt` | `alt="Cubric Studio"` | per ecosystem direction | defer | non-blocking |
| `index.html` lines 46/55/59/63/244/248/252 GitHub URLs | `github.com/cubric-studio/cubric-studio` (wrong on both segments) | `github.com/MadPonyInteractive/Cubric-Vision` (or ecosystem repo links per redesign) | rename | release-blocking (broken link) |
| `index.html` line 183 | `Why Cubric Studio` | ecosystem copy TBD | defer | non-blocking |
| `index.html` line 239 | `Get Cubric Studio` | per app — likely `Get Cubric Vision` | rename | release-blocking |
| `index.html` line 269 | `I built <strong>Cubric Studio</strong>...` | ecosystem copy TBD | defer | non-blocking |
| `index.html` line 282 | `Help keep Cubric Studio independent.` | ecosystem copy TBD | defer | non-blocking |
| `index.html` lines 295/306/317 Patreon | `https://patreon.com/cubricstudio` | `https://www.patreon.com/madponyinteractive` | rename | release-blocking |
| `index.html` line 327 GitHub link | `github.com/cubric-studio/cubric-studio` | `github.com/MadPonyInteractive/Cubric-Vision` | rename | release-blocking |
| `index.html` line 328 Docs link | `https://docs.cubric.studio` | unchanged | keep | n/a |
| `index.html` line 329 Home link | `https://cubric.studio` | unchanged (ecosystem root) | keep | n/a |
| `index.html` line 331 footer | `© 2026 Cubric Studio` | `© 2026 MadPonyInteractive` (or ecosystem name) | rename | release-blocking |
| `styles/landing.css` line 1 (comment) | `/* Cubric Studio — Landing` | `Cubric ecosystem — Landing` | rename | non-blocking |
| `scripts/landing.js` line 2 (comment) | `Cubric Studio — Landing` | `Cubric ecosystem — Landing` | rename | non-blocking |
| `scripts/landing.js` line 98 GitHub API URL | `api.github.com/repos/cubric-studio/...` | `api.github.com/repos/MadPonyInteractive/Cubric-Vision` | rename | release-blocking |
| `styles/tokens.css` (comment) | `Source of truth: c:\AI\Mpi\CubricStudio\docs\redesign\DESIGN.md` | path TBD after app rename | rename | non-blocking |
| `docs/plans/2026-04-17-cubric-studio-website-plan.md` | historical website plan referencing `Cubric Studio` | unchanged (historical doc) | keep | n/a |
| `CNAME` | `cubric.studio` | unchanged | keep | n/a |
| `assets/logo.png` | favicon / hero logo | replace with Vision head crop (or ecosystem hub logo when ecosystem redesign lands) | replace | defer |
| `assets/lettering.png` | "Cubric Studio" wordmark PNG | retire in favor of live text (mirrors app decision) | replace | defer |
| `assets/comfy_robot_engine{,_arms,_hi,_ho}.png` (4 files) | legacy app mascot poses | replace with `idle`/`greet`/`happy` from external folder (and `logo`-equivalent head) | replace | defer |
| `assets/AlchemyMix176.png`, `AnimeMixV80.png`, `Lustify7.png`, `AnimerJeiV30.png`, `t2i_720 2.mp4`, `t2v_1080 (4).mp4` | showcase imagery / hero videos | unchanged | keep | n/a |

### 3.F — Sibling: Cubric Studio (Docs)

Absolute path: `c:\AI\Mpi\Cubric Studio (Docs)\`. Lives at
`docs.cubric.studio` (CNAME already set). Mascot files were already
renamed to `mascot_*` but use a **different state set** (`idle / happy /
success / surprised`) than the locked ecosystem states
(`idle / greet / happy`). Reconciliation is needed but is non-blocking
for Vision v1 since the docs site is ecosystem-shared.

| Path | Current | Proposed | Classification | Bucket |
| --- | --- | --- | --- | --- |
| `index.html` `<title>` | `Cubric Studio Docs` | unchanged for ecosystem (it IS the ecosystem docs site) | keep | n/a |
| `index.html` `meta description` | `Documentation for Cubric Studio, your local AI workstation.` | ecosystem-wide copy referring to Cubric ecosystem | rename | non-blocking |
| `index.html` line 37 lettering `alt` | `alt="Cubric Studio"` | `alt="Cubric Studio"` (kept — docs site IS the hub-named site at `cubric.studio`/`docs.cubric.studio`) | keep | n/a |
| `index.html` line 45 GitHub link | `github.com/cubric-studio` | `github.com/MadPonyInteractive` | rename | release-blocking |
| `index.html` line 46 Website link | `https://cubric.studio` | unchanged | keep | n/a |
| `index.html` line 47 Patreon | `https://patreon.com/cubricstudio` | `https://www.patreon.com/madponyinteractive` | rename | release-blocking |
| `pages/home.html` lines 4, 12–13, 17, 34 | various `Cubric Studio` refs as if it were the app | rewrite as ecosystem hub copy + per-app sections | rename | non-blocking |
| `pages/getting-started.html` lines 8, 21 | `Cubric Studio ships as a single desktop binary...` | rewrite per-app or move to `/vision` page | rename | non-blocking |
| `pages/models.html` line 7 | `A "model" in Cubric is more than a safetensors file...` | ecosystem copy stays generic | keep | n/a |
| `styles/{tokens,base,docs}.css` (comments) | `Cubric Studio` | `Cubric ecosystem` | rename | non-blocking |
| `CNAME` | `docs.cubric.studio` | unchanged | keep | n/a |
| `assets/logo.png` | favicon / nav logo | replace with **Hub** head crop from external folder | replace | non-blocking |
| `assets/lettering.png` | "Cubric Studio" wordmark | retire in favor of live Russo One text rendering "Cubric Studio" (this site IS the hub) | replace | non-blocking |
| `assets/mascot_idle.png` | mascot state, locked-name compatible | replace with **Hub** `idle` from external folder | replace | non-blocking |
| `assets/mascot_happy.png` | locked-name compatible | replace with **Hub** `happy` | replace | non-blocking |
| `assets/mascot_success.png` | not in locked state set | retire OR map to `greet` (likely retire — `success` is a UX state, not a brand state) | replace (delete) | non-blocking |
| `assets/mascot_surprised.png` | not in locked state set | retire | replace (delete) | non-blocking |

When docs mascot replacement lands, the state set in the docs repo
collapses to `idle / greet / happy` to mirror the locked ecosystem set.

### 3.G — External Brand-Assets Folder

Absolute path: `C:\AI\Mpi\Cubric Studio Brand Assets\`. **Not touched by
this plan or by the app-rename child.** Master source library for the
ecosystem mascot family + lettering + future creative material.

Read-only for these plans. Files that look like alternates, duplicates,
or unidentified variants (e.g. `Head <App>.png` without state, `Full
Body <App> 2.png`, `Initial mascots*.jpeg`) are intentional creative
material — leave as-is.

Migration note: once the app is renamed `Cubric Studio` → `Cubric Vision`,
the folder is expected to migrate into a future `Cubric Studio` hub repo
as its master source library. That migration is a hub-creation concern,
not part of this plan.

### Phase 3 Items

- [x] Inventory user-visible `Cubric Studio` / `CubricStudio` strings in app surfaces: titlebar, About panel, landing copy, package.json `productName`, Electron `app.setName` callers, HTML `<title>`, manifest/meta description, launcher scripts. **Done:** section 3.A.

- [x] Inventory brand assets in app: `assets/mascot/*`, `assets/lettering.png`, `assets/logo*`, app icon, titlebar images. **Done:** section 3.D.

- [x] Inventory brand assets in sibling Website + Docs: `assets/logo.png`, mascot files (renamed `mascot_*` in Docs), wordmark usage in HTML. **Done:** sections 3.E and 3.F. Website push gate still applies.

- [x] Inventory dual-tree mascot per `feedback_dual_asset_tree.md`: `media/assets/` (Photoshop sources) + runtime `assets/mascot/` + `assets/lettering.png`. **Done:** dual-tree retired per Phase 2 lock. `media/assets/` flagged for deletion in 3.D. Source library lives in external folder per 3.G.

- [x] Internal-only strings flagged separately. Default classification `keep` unless rename is explicitly desired. **Done:** section 3.B captures code comments + identifiers; section 3.C captures filesystem paths. `getProjectsRoot()` flagged with `rename + migration shim` (release-blocking).

## Phase 4: Release-Blocking Scope Cut

### Release-Blocking Set (v1 must change)

These rows from Phase 3 MUST change before Cubric Vision v1 ships.
They are the minimum brand-identity surface for a coherent v1 release.

**App repo:**

- `package.json` `name` + `description`.
- `electron-builder.yml` `productName` + `appId`.
- `Start.bat` startup banner.
- `index.html` `<title>`, `meta description`, hero `alt` text, hero version label.
- `js/core/appName.{js,cjs}` `APP_NAME` constant.
- `js/shell/projectUI.js` version line label.
- `MpiAbout` alt text on logo + lettering.
- `MpiNewProject` hint text (`Documents/Cubric Vision/Projects`).
- `routes/shared.js` HTTP `User-Agent` header.
- `routes/shared.js` `getProjectsRoot()` path constant + migration shim
  that dual-reads from legacy `Documents/Cubric Studio/Projects`.
- `assets/lettering.png` retired (replaced by Russo One live text).
- `assets/mascot/` files: `logo.png` + `idle.png` + `greet.png` +
  `happy.png` produced from external Vision crops; legacy
  `mascot{,-arms,-hi,-ho}.png` deleted.
- Electron app icon regenerated from new Vision head crop.

**Website repo:**

- Broken GitHub URLs `github.com/cubric-studio/cubric-studio` →
  `github.com/MadPonyInteractive/Cubric-Vision` (8 occurrences in
  `index.html` + 1 in `scripts/landing.js` GitHub API call).
- Patreon URLs `patreon.com/cubricstudio` →
  `https://www.patreon.com/madponyinteractive` (3 occurrences).
- `Get Cubric Studio` CTA → `Get Cubric Vision`.
- Footer copyright line.

**Docs repo:**

- GitHub link `github.com/cubric-studio` → `github.com/MadPonyInteractive`.
- Patreon link → MadPonyInteractive.

### Non-Blocking Set (post-v1 polish)

These rows can ship after v1. Source code comments, internal identifier
references, historical plan docs, and the broader Website / Docs
ecosystem rewrite all fall here.

**Categories:**

- Code comments referring to `Cubric Studio` across `js/` and `styles/`.
- `CLAUDE.md`, `AGENTS.md`, `.agents/skills/` documentation.
- `docs/project-integrity.md` example paths.
- Website ecosystem-landing rewrite (separate plan; this brand-identity
  plan only fixes broken links + CTA + Patreon).
- Docs site IA rewrite into per-app sections (`/vision`, `/prompt`, etc.)
  + per-app docs content.
- Docs site mascot replacement (uses Hub crops + collapses state set to
  `idle / greet / happy`).
- Sibling Website `assets/comfy_robot_engine*.png` mascot replacement.
- `media/assets/` legacy source tree deletion.

### Explicitly Deferred to Later Plans

Recorded here so parent-plan Phase 1 does not re-litigate:

- **Per-app mascot wiring beyond Vision** — other app mascots stay in the
  external folder until those apps ship. Vision v1 ships Vision-only.
- **Website ecosystem-landing redesign** — handled by the existing
  Website plan (`docs/plans/2026-04-17-cubric-studio-website-plan.md`
  in the Website repo) and `docs/plans/2026-05-16-port-stage-to-website.md`
  in this repo. This brand-identity plan only patches release-blocking
  text/links; full ecosystem rewrite is separate.
- **Docs site ecosystem IA** — handled by the existing docs subdomain plan
  (`docs/plans/2026-05-16-port-stage-to-docs.md`) and the `Cubric Studio
  Docs subdomain + finish docs site` kanban entry.
- **Patreon copy beyond URL swap** — tier names, copy, imagery on the
  Patreon page itself live outside this repo and are not in scope.
- **HuggingFace org rename** — `huggingface.co/cubric-studio` stays
  permanently. Not a deferred decision, a final lock.
- **`Documents/Cubric Studio/Projects` → `Documents/Cubric Vision/Projects`
  user-data migration UX** — `app-rename` child plan owns the migration
  flow (silent dual-read, prompted migration, or full move). This plan
  only declares the new path + that a shim is needed.
- **`.claude/rules/` updates reflecting dual-tree retirement** — owned by
  `app-rename` or a follow-up rule-update task, with explicit user
  approval (per CLAUDE.md cardinal rule).
- **External brand-assets folder migration to a future hub repo** — not
  in this plan or `app-rename` scope. Triggered by hub-repo creation.

### Phase 4 Items

- [x] Split inventory into two buckets: `release-blocking` vs `non-blocking`. **Done:** every Phase 3 row carries a `Bucket` column; summary lists above.

- [x] Confirm v1 brand minimum set: app display name, titlebar, About panel, landing copy, package `productName`, app icon, primary wordmark surface. **Done:** "Release-Blocking Set" above matches the minimum-set requirement and adds the broken-GitHub-URL fix in Website (link integrity is release-blocking).

- [x] Identify items explicitly deferred to a later identity polish plan. **Done:** "Explicitly Deferred to Later Plans" above; downstream plans referenced by path.

## Phase 5: Sign-Off Artifact

### One-Page Brand Identity Decision Summary

This is the authoritative sign-off page for the Cubric Vision brand
identity. Downstream plans (`app-rename`, `release-copy`, Website, Docs)
consume the decisions below. No row here can be changed without revisiting
this plan.

**Ecosystem term.** `Cubric ecosystem` (or bare `Cubric` when context is
clear). `Cubric Studio` refers to the hub only, never the ecosystem at
large.

**Hub status.** `Cubric Studio` is the ecosystem hub: a small connector
system + the `cubric.studio` landing page. **Not an app in v1.** May
gain a UI surface later.

**Per-app naming:**

| Role | Display name | App id | Package / FS | Subdomain | GitHub repo |
| --- | --- | --- | --- | --- | --- |
| Hub | Cubric Studio | — | — | `cubric.studio` | `MadPonyInteractive/Cubric-Studio` (future) |
| App | Cubric Vision | `cubric.vision` | `cubric-vision` | `vision.cubric.studio` | `MadPonyInteractive/Cubric-Vision` (renamed from `Cubric-Studio`) |
| App | Cubric Prompt | `cubric.prompt` | `cubric-prompt` | `prompt.cubric.studio` | `MadPonyInteractive/Cubric-Prompt` (future) |
| App | Cubric Audio | `cubric.audio` | `cubric-audio` | `audio.cubric.studio` | `MadPonyInteractive/Cubric-Audio` (future) |
| App | Cubric Video | `cubric.video` | `cubric-video` | `video.cubric.studio` | `MadPonyInteractive/Cubric-Video` (future) |
| Docs | — | — | — | `docs.cubric.studio` | (lives in `Cubric Studio (Docs)` repo) |

**Case rules:** display = title case + space; app id = lowercase dotted;
FS/package = lowercase kebab; subdomain = lowercase single segment.

**Accent colors (HEX for raster, OKLCH live in `styles/01_base.css`):**

| App | HEX | OKLCH |
| --- | --- | --- |
| Cubric Studio | `#C1B6A4` | `oklch(0.78 0.028 80)` |
| Cubric Vision | `#FC77AA` | `oklch(0.76 0.17 355)` |
| Cubric Prompt | `#EDE367` | `oklch(0.88 0.13 102)` |
| Cubric Audio | `#70E2C5` | `oklch(0.84 0.11 170)` |
| Cubric Video | `#FF9360` | `oklch(0.78 0.15 48)` |

Stage warm-mauve UI tokens remain the shared surface system across all
apps; accents are small high-contrast identity signals only.

**Mascot.** Ecosystem operator family. One specialized mascot per app
(Hub coordinator + Vision lens + Prompt terminal + Audio waveform +
Video film). All variants already produced in external folder. Three
states only: `idle`, `greet`, `happy`. Head crops = OS/taskbar icons +
logo file. Full-body = in-app states. Vision v1 ships Vision mascot only;
other apps ship with their own apps later.

**Lettering.** Russo One Regular 400. Replaces `assets/lettering.png`.
"Cubric" rendered in ink-1; app suffix rendered in app accent color.
Same size, same weight — color is the only differentiator. UI font
stack unchanged.

**Asset tree.** Dual-tree rule retired for the Vision repo. Sources live
externally in `C:\AI\Mpi\Cubric Studio Brand Assets\`. Runtime files in
`assets/mascot/` only, flat layout (`logo.png` + `idle.png` + `greet.png`
+ `happy.png`). `media/assets/` deprecated and slated for deletion.

**Externally-owned references that DON'T change:**

- HuggingFace org `huggingface.co/cubric-studio` — ecosystem model hub,
  shared across all apps. `keep` permanently.
- Docs subdomain `docs.cubric.studio` — ecosystem docs site.
- Website root `cubric.studio` — ecosystem landing.

**Externally-owned references that DO change:**

- Patreon: `patreon.com/cubricstudio` (never released) →
  `https://www.patreon.com/madponyinteractive`.
- GitHub repo: current public `MadPonyInteractive/Cubric-Studio` will be
  renamed to `MadPonyInteractive/Cubric-Vision`. The `Cubric-Studio`
  name is then reserved for the future hub repo.
- Local dev repo: current `CubricStudio dev` → `Cubric-Vision-Dev`.

**v1 release-blocking minimum set** (see Phase 4 for full enumeration):

- App: `package.json` name/description, `electron-builder` productName +
  appId, `Start.bat` banner, `index.html` title/meta/hero, `APP_NAME`
  constants, `User-Agent` header, About panel alt text, hint text,
  `getProjectsRoot()` rename + migration shim, lettering replaced by
  Russo One, mascot files swapped to Vision state set, Electron app icon
  regenerated.
- Website: broken GitHub URLs fixed, Patreon URLs swapped, `Get Cubric
  Studio` CTA + footer renamed.
- Docs: GitHub + Patreon URLs swapped.

**Explicitly deferred:** see Phase 4 "Explicitly Deferred to Later Plans".

**Owner of execution:** the `app-rename` child plan executes against
this summary. The Website ecosystem-landing rewrite and Docs IA rewrite
are owned by their own existing plans referenced above.

### Phase 5 Items

- [x] Produce a one-page brand-identity decision summary. **Done:** "One-Page Brand Identity Decision Summary" above. Linkable from `app-rename` and Phase 7 release-copy audit in the umbrella plan.

- [x] Update parent plan Phase 1 checkboxes once the summary lands. **Done in this plan; parent-plan update is a separate follow-up edit (parent plan lives at `docs/plans/2026-05-19-cubric-vision-foundation.md`).**

## Verification

Final acceptance for this child plan:

- One canonical naming table exists with display name, app id, subdomain per app.
- Mascot + lettering scope for v1 recorded with rationale.
- Asset/text inventory covers app + sibling Website + sibling Docs + dual asset trees.
- Every inventory row classified `rename|replace|defer|keep` and bucketed `release-blocking` vs `non-blocking`.
- No code rename performed in this plan; downstream `app-rename` plan can execute against the inventory without re-discovery.

## Preservation Notes

- No edits to `.claude/rules/`.
- No sibling repo git operations.
- Inventory uses absolute paths for sibling Website/Docs rows.
- Mascot/lettering decisions feed `feedback_dual_asset_tree.md` rule — both trees must mirror if replace is chosen.
- Website push gate (`project_website_push_gate.md`) still applies after this plan completes.

## Plan Drift

- None yet.
