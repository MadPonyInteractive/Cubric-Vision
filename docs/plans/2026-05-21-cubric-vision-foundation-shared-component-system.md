# Cubric Vision Foundation - Shared Component System

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - shared-component-system`
**Priority:** medium
**Status:** planning needed before Cubric Prompt/future app frontend work

## Purpose

Decide whether Cubric Vision's current JavaScript component system remains a
Vision-local implementation detail, becomes a TypeScript-compatible shared
Cubric UI package, or provides a typed bridge while future apps use their own
TypeScript-first UI stack.

This does not block Cubric Vision v1. It blocks starting Cubric Prompt or other
future Cubric app frontends without accidentally inheriting the wrong UI system.

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

## Inputs

- `CLAUDE.md`
- `.claude/rules/components.md`
- `.claude/rules/dos_and_donts.md`
- `docs/components.md`
- `docs/redesign/PRODUCT.md`
- `docs/redesign/DESIGN.md`
- `js/components/types.js`
- `js/components/factory.js` as read-only context
- `js/utils/dom.js`
- `js/utils/icons.js`
- `js/services/eventBus.js`
- `js/shell/hotkeyManager.js`
- `js/shell/overlayManager.js`

## Planning Work

### Phase 1: Inventory

- [ ] Inventory component contracts that future apps might want:
  `ComponentFactory.create()`, BEM CSS, props docs in `js/components/types.js`,
  `Events`, `Hotkeys`, `Overlays`, `MpiButton`, `MpiPopup`, `MpiRadioGroup`,
  PromptBox primitives, Stage tokens, and icon utilities.

- [ ] Identify which contracts are tightly coupled to Cubric Vision workspaces,
  state, ComfyUI, project media, or Electron assumptions.

### Phase 2: Classification

- [ ] Classify each item as:
  - stable shared design contract
  - reusable implementation candidate
  - Vision-local implementation
  - migration risk

- [ ] Record which contracts are safe for future apps to copy conceptually but
  not import directly.

### Phase 3: TypeScript Bridge Decision

- [ ] Compare options:
  - no shared implementation; share Stage tokens and patterns only
  - generated `.d.ts` files for existing JS
  - JSDoc-typed JS in Vision
  - small typed adapter package
  - new TypeScript package that ports selected primitives

- [ ] Choose the lowest-risk bridge for Cubric Prompt v1.

### Phase 4: Ownership

- [ ] Decide repo/package ownership if a shared UI package is later created.
- [ ] Define dependency direction so Cubric Vision does not become the permanent
  owner of future-app UI.

## Recommended Bias

For speed, prefer **Stage tokens and design rules as the shared contract** and
keep Cubric Vision's component runtime Vision-local unless a future Prompt plan
proves direct reuse saves more work than it creates.

## Implementation Phase

This plan's implementation phase should not start until the planning output
chooses a direction. Possible implementation follow-ups:
- create a shared token package
- generate type declarations
- scaffold a small TypeScript UI primitive package
- document "copy pattern, do not import runtime" guidance

## Acceptance

- Future Cubric Prompt frontend work has a clear UI-stack decision.
- Cubric Vision v1 remains free of a broad TypeScript migration.
- Any shared UI ownership has a clear repo/package home.
- The umbrella plan can mark its shared-component-system decision items done.
