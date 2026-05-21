# Cubric Vision Foundation - Shared Component System

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - shared-component-system`
**Priority:** medium
**Status:** implementation ready

## Purpose

Decide whether Cubric Vision's current JavaScript component system remains a
Vision-local implementation detail, becomes a TypeScript-compatible shared
Cubric UI package, or provides a typed bridge while future apps use their own
TypeScript-first UI stack.

This does not block Cubric Vision v1. It blocks starting Cubric Prompt or other
future Cubric app frontends without accidentally inheriting the wrong UI system.

## Decision

For Cubric Prompt v1 and the next Cubric apps, **share the Stage visual
contract, not Cubric Vision's JavaScript component runtime**.

Locked direction:
- Cubric Vision's current `ComponentFactory` runtime stays Vision-local.
- Future apps should not import Vision components directly.
- Shared foundation is Stage design tokens, typography rules, icon naming
  rules, BEM naming discipline, overlay/hotkey/event lifecycle principles, and
  component behavior patterns.
- A small TypeScript token/pattern package may be created later in the hub repo,
  but only after a future app proves it needs code reuse beyond CSS variables
  and documented patterns.
- No broad TypeScript migration is planned for Cubric Vision v1.

Why:
- Many Vision components carry real product logic: project state, sidecars,
  ComfyUI commands, generation lifecycle, model registries, Electron file APIs,
  media viewers, PromptBox operation rules, and workspace routing.
- Porting those components would couple future apps to Vision's implementation
  before their product shapes are known.
- Stage tokens and interaction rules give future apps a consistent Cubric look
  without forcing them into Vision's app architecture.

## Scope

In scope:
- Inventory reusable contracts from Cubric Vision's current component system.
- Classify each contract as stable, Vision-local, or migration candidate.
- Decide whether Stage tokens are shared as design tokens across apps.
- Decide the lowest-risk TypeScript bridge, if any.
- Define package/repo ownership if a shared UI layer exists later.

Out of scope:
- Migrating Cubric Vision frontend to TypeScript.
- Building a shared UI package in this planning pass.
- Rewriting existing Cubric Vision components.
- Implementing Cubric Prompt UI.

## Inputs Read

- `CLAUDE.md`
- `.claude/rules/dos_and_donts.md`
- `.claude/rules/components.md`
- `docs/PROJECT.md`
- `docs/components.md`
- `docs/events.md`
- `docs/shell.md`
- `styles/01_base.css`
- `js/components/types.js`
- `js/components/factory.js` as read-only context
- component tree under `js/components/`

## Inventory And Classification

### Stable Shared Design Contract

These should be shared across apps as documentation and/or a future token
package:

- Stage tokens from `styles/01_base.css`: `--surface-*`, `--ink-*`,
  `--line`, `--line-soft`, `--accent-*`, `--t-*`, `--s-*`, `--r-*`,
  `--ease`, `--t-fast|base|slow`, and `--font-wordmark`.
- Stage behavior: sharp corners by default, solid surfaces, 1px lines, no
  neon/glass/backdrop-filter, gradient text only for wordmark.
- Brand lockup pattern: live-text `.mpi-wordmark` concept with per-app suffix
  accent.
- BEM naming discipline: `.mpi-block__element--modifier`.
- Icon source-of-truth principle: app-level icon registry, no raw inline SVG in
  components.
- Component lifecycle principle: mount/setup/destroy with explicit cleanup for
  events, observers, portals, and hotkeys.
- Overlay categories: blocking overlays vs floating popups/dropdowns.
- Hotkey registry principle: named registry ids, component-owned bind/unbind,
  typing gates.
- Event-bus principle: cross-component communication through named events, not
  direct imports between unrelated component owners.

### Reusable Implementation Candidates

These may be worth reimplementing or selectively porting to TypeScript later,
but should not be imported directly from Vision:

- Button-like primitive behavior from `MpiButton`: variants, sizes, active and
  disabled imperative sync.
- Simple form primitives: `MpiInput`, `MpiCheckbox`, `MpiRadioGroup`,
  `MpiDropdown`, `MpiProgressBar`, `MpiSpinner`, `MpiBadge`.
- Floating shell primitives: `MpiPopup`, `MpiContextMenu`, `MpiSlideOver`.
- Generic list/toolbar ideas: `MpiToolbar`, `MpiOkCancel`, `MpiDragList`.
- Media-agnostic viewer affordances where future apps need them:
  corner chips, transport controls, trim bars, and volume controls.

These are candidates because their behavior can be described without Vision's
project, ComfyUI, model, or generation state. If reused, port the concept into
a new TypeScript package rather than lifting Vision files.

### Vision-Local Implementation

These should stay in Cubric Vision:

- `ComponentFactory.create()` runtime and its current no-bundler mounting
  assumptions.
- `js/components/types.js` as a Vision component JSDoc registry.
- Blocks: `MpiGalleryBlock`, `MpiGroupHistoryBlock`, `MpiModelsModal`.
- Prompt and generation surfaces: `MpiPromptBox`, `PromptBoxControls`,
  `MpiToolOptions*`, PromptBox media chips, operation selection, preview-stage
  behavior, Cue/Loop integration.
- Project/media components: `MpiGalleryGrid`, `MpiHistoryList`,
  `MpiProjectCard`, project drop overlays, gallery drop overlays, media
  import overlays.
- Canvas and mask stack: `MpiCanvas`, `MpiCanvasViewer`,
  `MpiMaskedImagePreview`, auto-mask thumbs, crop/mask managers.
- Engine/model setup components: `MpiEngineInstall`, `MpiInstalledDisplay`,
  `MpiMemoryMonitor`, model settings, model download/progress views.
- Landing page content components: `MpiAbout`, `MpiHelp`, `MpiSettings` as
  currently authored for Vision.

These components are allowed to inspire future apps, but future apps should
copy the pattern intentionally or build an equivalent in their own TypeScript
stack.

### Migration Risks

- `ComponentFactory.mount()` replaces `container.innerHTML`; this is workable
  in Vision but should not be the default foundation for future TS apps.
- Many components import `state`, `Events`, model registries, command
  registries, project services, or generation services directly.
- Some primitives are not truly generic because they read app state or Electron
  APIs (`MpiCanvas`, drop overlays, engine setup).
- Hotkey and help-page behavior is hand-authored and product-specific.
- Stage tokens include Vision-specific `--accent-heat`; future apps need an
  app-accent mapping rather than copying Vision's rose accent blindly.
- Raw template composition in some popup variants requires delegated listener
  knowledge that should not become a shared contract.

## TypeScript Bridge Decision

Chosen bridge for Cubric Prompt v1:

1. Use Stage tokens and documented patterns as the shared UI contract.
2. Build Prompt UI natively in TypeScript using its chosen frontend stack.
3. Do not import Cubric Vision JS components.
4. If repeated implementation pain appears, create a small hub-owned
   TypeScript package with tokens and the smallest stable primitives only.

Rejected for now:
- Generated `.d.ts` files for the whole Vision component tree. This gives a
  false sense of portability while preserving runtime coupling.
- JSDoc-typing all Vision components as a prerequisite for Prompt. Too broad
  and not needed for Vision v1.
- A direct wrapper package around Vision's JS components. This would make
  Vision the accidental owner of shared UI and drag in app-specific contracts.
- A full TypeScript port of the Vision component system. Too expensive and
  premature.

## Ownership

If a shared UI or token package is later created, it belongs in the future hub
repo, not Cubric Vision:

```text
C:\AI\Mpi\Cubric-Studio\
  packages/
    ui-tokens/
    ui-primitives/   # optional, only if future app work proves the need
```

Dependency direction:
- Future apps may depend on hub-owned `@cubric/ui-tokens`.
- Future apps may depend on hub-owned primitives only after a dedicated plan.
- The hub/shared packages must not depend on Cubric Vision.
- Cubric Vision may later consume shared tokens if that becomes worthwhile, but
  it is not required for v1.

## Implementation Scope

The shared component system is ready for lightweight implementation. This does
not mean porting Cubric Vision components. The implementation should codify the
shared Stage UI contract and, only if needed by a future app, create a tiny
hub-owned token package.

Recommended implementation sequence:

1. Create a short `docs/specs/cubric-stage-ui-contract.md` describing tokens,
   typography, BEM, icon rules, overlay/hotkey lifecycle, and per-app accent
   mapping.
2. When Cubric Prompt starts, include that UI contract in its repo bootstrap.
3. Only after Prompt has two or more repeated primitive needs, consider
   `packages/ui-tokens` and possibly `packages/ui-primitives`.

## Acceptance

- [x] Future Cubric Prompt frontend work has a clear UI-stack decision.
- [x] Cubric Vision v1 remains free of a broad TypeScript migration.
- [x] Any shared UI ownership has a clear repo/package home.
- [x] Vision-specific components are explicitly not part of the shared runtime.
- [x] The umbrella plan can mark its shared-component-system decision items
  done without starting a UI migration.
