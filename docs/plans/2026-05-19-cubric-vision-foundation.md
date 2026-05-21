# Cubric Vision Foundation

**Plan family:** `cubric-vision-foundation`
**Umbrella kanban entry:** `Cubric Vision foundation`
**Priority:** high

## Current State

Cubric Studio is the current Electron app and first product in what is now intended to become the broader Cubric ecosystem. The emerging naming direction is:

- `Cubric Vision` for the current image/video visual creation app.
- `Cubric Prompt` for prompt enhancement, translation, model-specific formatting, JSON prompt generation, and prompt artifacts.
- `Cubric Audio` for an AI audio workstation.
- `Cubric Video` for simple clip assembly and AI video utility workflows.
- `cubric.studio` as the ecosystem landing site, with app subdomains such as `vision.cubric.studio`, `prompt.cubric.studio`, `audio.cubric.studio`, `video.cubric.studio`, and `docs.cubric.studio`.

The first release should not build the full ecosystem. It should ship Cubric Vision as a complete standalone app while preparing a small foundation for optional app-to-app capabilities.

Known architecture anchors:

- The app already has project portability: project folders can be dropped into the app and loaded.
- `project.json` stores history as UUID strings only; full item metadata lives in `Media/.meta/<uuid>.json` sidecars.
- Sidecars are likely the correct artifact handoff primitive for future Cubric apps, but they need a compatibility review before becoming cross-app contracts.
- UUIDs need careful treatment. Project-local media UUIDs should not become accidental global cross-app identity unless explicitly designed as portable artifact identifiers.
- Engine/model separation already exists through `engine/`, `llama_engine/`, `llama_models/`, and optional `.engine-config.json` overrides. Future apps should keep app settings and fragile engine environments independent while allowing models and artifacts to be shared deliberately.
- Future Cubric hub/system work and future apps are now expected to use TypeScript. The cross-app backend/connector system is an ecosystem blocker and should be TypeScript-first. The current Cubric Vision component system is JavaScript-first; a long-term shared UI/component strategy must be decided before building Cubric Prompt or later apps, but it does not block Cubric Vision v1 shipping.
- Website and docs repos already exist as sibling roots in the VS Code multi-root workspace:
  - `c:\AI\Mpi\Cubric Studio (Website)\`
  - `c:\AI\Mpi\Cubric Studio (Docs)\`
- The current workspace guidance says CubricStudio is the master root and sibling repos have separate git histories.

Open risks:

- Renaming late in the release cycle can touch UI text, app metadata, launchers, packaging names, docs, websites, screenshots, Patreon copy, and existing plans.
- Branding is now a release blocker. The current mascot/lettering system may not scale cleanly across Vision, Prompt, Audio, and Video.
- The integration foundation can easily become overbuilt. The first release needs stable seams, not a full local runtime.
- Component reuse can also become overbuilt. The immediate rename should not migrate the app to TypeScript, and shared component migration is out of scope for Cubric Vision v1. The foundation plan should still record that Cubric Prompt/future app work is blocked on deciding whether the component system becomes a TypeScript-ready shared package, remains Vision-local, or gets a typed adapter layer later.
- Website/workspace organization needs to avoid both extremes: agents getting lost in one giant workspace, and each app owning its own website/doc site.

## Completed

- [x] Brainstormed the ecosystem model: standalone apps that unlock optional capabilities in each other.
- [x] Chose action-based capability naming over provider-based naming.
- [x] Chose per-app settings and per-app engine profiles, with shareable models/artifacts where useful.
- [x] Captured the umbrella kanban entry.
- [x] Shipped Cubric Vision brand identity and app rename tracks.
- [x] Shipped the Stage 0 connector SDK MVP: `C:\AI\Mpi\Cubric-Studio\packages\connector\`.
- [x] Added Cubric Vision manifest-only connector stub at `resources/cubric/connector-manifest.json`.

## Plan Structure

Use the umbrella plan as the source of truth for the release-blocking direction. Split into child plans only when implementation starts to touch distinct repos or when a phase becomes large enough to need its own lifecycle.

Recommended child kanban title format:

```text
Cubric Vision foundation - <track>
```

Recommended child plan filename format:

```text
docs/plans/YYYY-MM-DD-cubric-vision-foundation-<track>.md
```

Suggested child tracks:

- `brand-identity`
- `app-rename`
- `integration-contract`
- `artifact-handoff`
- `ecosystem-backend`
- `shared-component-system`
- `website`
- `release-copy`

Do not create all child entries automatically. Create them when the corresponding work is ready to enter PLANNING or IMPLEMENTING, so the board stays readable. Do not create duplicate child plans for work that already has a kanban entry or plan; link the existing work from this umbrella instead.

## Linked Existing Work

These plans/entries are related to this foundation but should not be duplicated:

- `Cubric Studio Docs subdomain + finish docs site` in BACKLOG tracks the docs-site follow-up work and references `docs/plans/2026-05-16-port-stage-to-docs.md`. Treat it as the docs child track for this umbrella until it is revised or replaced.
- `Port Stage redesign -> Cubric Studio Website` is already captured in `docs/plans/2026-05-16-port-stage-to-website.md`. Treat it as prior website redesign context; create a new `cubric-vision-foundation-website` child plan only if the ecosystem landing/subdomain rewrite is too large to fold into the existing website work.
- `Cross-platform portable distribution` is an adjacent release plan. Rename/package artifact work should coordinate with it, but this umbrella should not absorb the portable distribution plan.
- `Cubric Vision foundation - ecosystem-backend` has child plan `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`. It defines the TypeScript-first connector/backend track that blocks Cubric Prompt/future app implementation, not Cubric Vision v1.
- `@cubric/connector` Stage 0 MVP has shipped in the future hub folder at `C:\AI\Mpi\Cubric-Studio\packages\connector\`. It contains TypeScript/Zod schemas, protocol types, error helpers, and a mock client only; no broker runtime or live Cubric Vision integration.
- Project memory note `C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_connector_sdk_mvp.md` records the shipped connector SDK state and deferred broker stages.
- `docs/plans/2026-05-20-cubric-prompt-start-blockers.md` captures pre-repo blockers for starting Cubric Prompt after Vision release work.
- `Cubric Vision foundation - shared-component-system` is planned in `docs/plans/2026-05-21-cubric-vision-foundation-shared-component-system.md`.
- `Cubric Vision foundation - connector-broker-stage-1-2` is planned in `docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md`.
- `Cubric Vision foundation - website-ecosystem-landing` is planned in `docs/plans/2026-05-21-cubric-vision-foundation-website-ecosystem-landing.md` but intentionally deferred until app-first work is further along.
- `Cubric Vision foundation - release-readiness-copy-audit` is planned in `docs/plans/2026-05-21-cubric-vision-foundation-release-readiness-copy-audit.md`.

## Remaining Work

## Phase 1: Product And Brand Decisions

All four items below are completed by the brand-identity child plan
`docs/plans/2026-05-19-cubric-vision-foundation-brand-identity.md`.
See its Phase 5 "One-Page Brand Identity Decision Summary" for the
authoritative sign-off.

- [x] Lock the product naming hierarchy: `Cubric` / `Cubric Studio` as ecosystem language, `Cubric Vision` as the current app, and `Cubric Prompt`, `Cubric Audio`, `Cubric Video` as future app names. **Locked:** ecosystem term is `Cubric ecosystem`; `Cubric Studio` is hub-only (not an app in v1). See child plan Canonical Naming Table.

- [x] Decide the minimum viable release branding scope: what must change before release versus what can wait for later identity polish. **Locked:** release-blocking set + non-blocking set enumerated in child plan Phase 4.

- [x] Audit current logo, lettering, mascot, app icon, titlebar assets, and alt text for `Cubric Studio` assumptions. **Locked:** full inventory in child plan Phase 3 sections 3.A–3.G covering app + Website + Docs + external brand-assets folder. Every row carries `rename | replace | defer | keep` + bucket.

- [x] Decide whether the current mascot remains part of Cubric Vision v1 or becomes a broader Cubric ecosystem mascot later. **Locked:** ecosystem operator family — one specialized mascot per app. Vision v1 ships Vision mascot only; other apps' variants stay external until those apps ship. Three states locked: `idle / greet / happy`. See child plan Phase 2.

## Phase 2: App Rename Surface

Completed 2026-05-20 via child plan
`docs/plans/2026-05-19-cubric-vision-foundation-brand-identity.md` +
kanban entry "Cubric Vision foundation - app-rename" (now COMPLETED).

- [x] Inventory all user-visible `Cubric Studio` strings in the app, package metadata, launch scripts, release scripts, docs, and tests. **Done via brand-identity Phase 3.**

- [x] Rename user-facing app identity to `Cubric Vision` while preserving internal paths where changing them would risk project portability or release stability. **Done:** package.json, electron-builder, Start.bat, index.html title/meta/hero, APP_NAME constants, User-Agent header, About panel, projectUI version, MpiNewProject hint, lettering, mascot.

- [x] Decide how to handle default project folders such as `Documents/Cubric Studio/Projects`. **Done:** swapped to `Documents/Cubric Vision/Projects` with NO migration shim — legacy folder orphaned per user OK (test data only).

- [x] Update release/package artifact names only after the user-facing naming decision is locked. **Done:** electron-builder productName/appId updated; portable distribution plan (separate) inherits new identifiers when it ships.

## Phase 3: Integration Foundation

- [x] Define a minimal action-based capability vocabulary for the first ecosystem release, without implementing the full provider runtime. Candidate names: `prompt.enhance`, `prompt.translate`, `prompt.format.model`, `asset.import`, `asset.export`, `project.context.read`. **Done:** documented in `docs/specs/cubric-connector-sdk.md` and implemented in the Stage 0 `@cubric/connector` schemas/mock client shape.

- [x] Add or document a stable app identity concept for Cubric Vision, likely `cubric.vision`, distinct from product display name. **Done:** `cubric.vision` + `Cubric Vision` are documented in `docs/specs/cubric-connector-sdk.md` and shipped in `resources/cubric/connector-manifest.json`.

- [x] Identify where optional UI actions can attach later, especially prompt-box actions such as Enhance, Translate, and Format. **Done:** mapped in `docs/specs/cubric-vision-connector-integration-map.md`.

- [x] Define the first local integration contract as a future-facing stub, not a working runtime: discovery, capability request shape, artifact references, and error states. **Done:** `docs/specs/cubric-connector-sdk.md` defines the contract; `C:\AI\Mpi\Cubric-Studio\packages\connector\` implements Stage 0 without broker runtime.

- [x] Keep absent integrations hidden from normal workflow UI and reserve discoverability for Help, Docs, Integrations, or release copy. **Done:** locked as a v1 non-goal in `docs/specs/cubric-vision-connector-integration-map.md`; no live Prompt buttons or broker startup are part of Vision v1.

## Phase 4: Artifact Handoff And Project Portability

- [ ] Review sidecar schema for fields future apps need: prompt, negative prompt, seed, model id, operation, media type, dimensions, video metadata, source lineage, generation timings, trim, and preview assets. **Verify:** each future handoff use case maps to existing sidecar fields or a clearly named proposed field.

- [x] Define which identifiers are project-local and which, if any, are portable cross-app artifact identifiers. **Done:** `docs/specs/cubric-connector-sdk.md` states `itemId` is project-local unless a future global artifact id is explicitly introduced.

- [x] Define a minimal portable artifact reference shape for app-to-app handoff. It should prefer project-relative paths and sidecar ids when inside a Cubric project, with absolute paths only when needed for external files. **Done:** `CubricArtifactRef` is defined in `docs/specs/cubric-connector-sdk.md` and implemented in the Stage 0 connector schemas.

- [ ] Preserve template project behavior: projects with settings and selected models but no assets must remain shareable. **Verify:** any proposed metadata additions do not require media files to exist for a template project to load.

- [ ] Decide whether future Cubric apps consume a whole project folder, selected artifacts, or both. **Verify:** the foundation supports both without requiring hidden global state.

## Phase 5: TypeScript Ecosystem Backend And Shared Component Direction

- [x] Define the TypeScript-first backend/connector system that lets Cubric apps discover and communicate with each other. **Done:** `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md` and `docs/specs/cubric-connector-sdk.md` define SDK + future broker ownership; Stage 0 SDK is shipped.

- [x] Define the TypeScript boundary for the ecosystem hub, connector backend, and future apps. **Done:** hub/system and future apps are TypeScript-first; Cubric Vision v1 remains JavaScript and standalone with only a manifest stub.

- [ ] Decide whether Cubric Vision's current component system is Vision-local implementation detail, a future shared Cubric UI package, or the source for a TypeScript-compatible successor. **Verify:** the plan states that this decision blocks Cubric Prompt/future app implementation, but does not block Cubric Vision v1 release.

- [ ] Inventory the current component contracts that would matter for reuse: `ComponentFactory.create()`, BEM CSS, `js/components/types.js`, `js/utils/dom.js`, `Events`, `Hotkeys`, `Overlays`, and Stage tokens. **Verify:** reusable pieces are classified as stable contract, Vision-local implementation, or migration candidate.

- [ ] Decide the lowest-risk bridge if future TypeScript apps need Cubric UI before a full rewrite: generated `.d.ts` files, JSDoc-typed JS, a small typed wrapper package, or a new TypeScript package that ports components selectively. **Verify:** the chosen bridge is scheduled before Cubric Prompt work and does not force a broad TypeScript migration into Cubric Vision v1.

- [ ] Define package/workspace ownership for any shared UI layer. **Verify:** if a shared package is created, it has a clear repo/package name, versioning expectation, and dependency direction so Vision does not accidentally become the hub or shared-library owner forever.

## Phase 6: Engines, Models, And Per-App Settings

- [x] Document the ecosystem resource principle: app settings remain independent; engines remain app-owned; stable assets such as ComfyUI models and LLaMA models may be shared deliberately. **Done:** recorded in this umbrella's Current State and Completed sections.

- [x] Preserve the existing `engine/`, `llama_engine/`, `llama_models/`, and `.engine-config.json` model-sharing patterns as Cubric Vision implementation details for this release. **Done:** connector Stage 0 and app rename did not introduce a global settings store or engine ownership change.

- [ ] Identify what a future shared model/resource registry would need to know, without building it now. **Verify:** the notes distinguish current Cubric Vision behavior from future Cubric ecosystem runtime behavior.

## Phase 7: Website, Docs, And Workspace Layout

- [ ] Decide the website repo strategy: keep the current Website and Docs repos as shared Cubric ecosystem sites rather than placing a website inside every future app repo. **Verify:** one source-of-truth note describes which repo owns `cubric.studio` and which repo owns `docs.cubric.studio`.

- [ ] Define the subdomain map: `cubric.studio`, `vision.cubric.studio`, `prompt.cubric.studio`, `audio.cubric.studio`, `video.cubric.studio`, and `docs.cubric.studio`. **Verify:** site copy/docs plan uses the same subdomain map.

- [ ] Update the main website direction from single-app `Cubric Studio` to ecosystem landing page with product pages. **Verify:** website plan identifies the current landing as becoming `Cubric Vision` product content under the broader Cubric site.

- [ ] Revise the existing docs-site work instead of creating a duplicate docs child plan. The current linked entry is `Cubric Studio Docs subdomain + finish docs site`, with context in `docs/plans/2026-05-16-port-stage-to-docs.md`. **Verify:** that entry/plan either explicitly adopts the Cubric ecosystem IA or a replacement child plan is created with a clear supersedes note.

- [ ] Update docs IA to support all apps: `/vision`, `/prompt`, `/audio`, `/video`, `/integrations`, and future `/runtime` if needed. **Verify:** the linked docs work has app-specific sections and one shared integrations section.

- [ ] Decide VS Code workspace organization for ecosystem work. Candidate: keep focused app workspaces plus an intentional multi-root ecosystem workspace that includes app repos, web, docs, and master planning. **Verify:** agents have clear root/kanban guidance and no website repo is embedded inside an app repo by accident.

## Phase 8: Release Alignment

- [ ] Reconcile existing release, Patreon, website, docs, and portable distribution plans that currently say `Cubric Studio`. **Verify:** all release-blocking copy uses the locked name or has an explicit historical/deferred reason.

- [ ] Update docs/rules only where current architecture source-of-truth would become misleading after the rename or integration foundation. **Verify:** any `.claude/rules/` update is explicitly approved before editing, per project rules.

- [ ] Run a final naming consistency audit before release. **Verify:** grep results for `Cubric Studio`, `CubricStudio`, `Cubric Vision`, `cubric.studio`, and app ids are reviewed and acceptable for release.

- [ ] Run the normal app verification after implementation. **Verify:** `npm run build` plus the relevant runtime/smoke tests pass, or failures are documented with release impact.

## Plan Drift

- 2026-05-21: Umbrella checkboxes were behind the actual work. Brand identity,
  app rename, connector Stage 0, app id, manifest stub, integration map, and
  artifact-ref contract have now been reconciled against the child plans,
  specs, shipped connector package, and project memory.

## Verification

Final acceptance for this plan family:

- The current app is clearly presented as `Cubric Vision` on release-critical surfaces.
- The broader ecosystem naming is documented and not contradicted by website/docs/release copy.
- Branding blockers are either resolved or explicitly deferred with no release-facing inconsistency.
- Cubric Vision remains standalone and does not require Cubric Prompt, Audio, Video, or a visible hub.
- The first integration foundation is action-based, minimal, and does not overbuild a full runtime before release.
- Sidecar/project portability remains intact, including drag-and-drop project folders and template projects.
- TypeScript direction for the ecosystem backend/hub/future apps is recorded, and any shared component-system decision is explicit before Cubric Prompt/future app implementation rather than assumed from Cubric Vision's current JavaScript implementation.
- Existing engine/model sharing behavior remains independent per app and does not introduce global settings as a release dependency.
- Website/docs ownership and subdomains are defined enough to proceed without scattering sites across future app repos.

## Preservation Notes

- Before implementation, relevant rule files will likely include:
  - `.claude/rules/components.md` for UI rename and prompt action slots.
  - `.claude/rules/events.md` if optional integration events are added.
  - `.claude/rules/state.md` if app identity or capability state is stored.
  - `docs/components.md`, `.claude/rules/components.md`, and `js/components/types.js` for any shared component-system or TypeScript-compatibility planning.
  - `docs/project-integrity.md` and `docs/projects.md` for sidecar/project portability.
  - `docs/versioning.md` if schema, app version, or operation compatibility changes.
- Website/docs work targets sibling repos with separate git histories. Use absolute paths and do not run sibling git commands from the CubricStudio root.
- Do not edit `.claude/rules/` without explicit user approval.
- If this becomes too broad during execution, create child plans using the plan family convention above rather than growing this umbrella plan indefinitely.
