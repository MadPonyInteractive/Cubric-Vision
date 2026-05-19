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
- Website and docs repos already exist as sibling roots in the VS Code multi-root workspace:
  - `c:\AI\Mpi\Cubric Studio (Website)\`
  - `c:\AI\Mpi\Cubric Studio (Docs)\`
- The current workspace guidance says CubricStudio is the master root and sibling repos have separate git histories.

Open risks:

- Renaming late in the release cycle can touch UI text, app metadata, launchers, packaging names, docs, websites, screenshots, Patreon copy, and existing plans.
- Branding is now a release blocker. The current mascot/lettering system may not scale cleanly across Vision, Prompt, Audio, and Video.
- The integration foundation can easily become overbuilt. The first release needs stable seams, not a full local runtime.
- Website/workspace organization needs to avoid both extremes: agents getting lost in one giant workspace, and each app owning its own website/doc site.

## Completed

- [x] Brainstormed the ecosystem model: standalone apps that unlock optional capabilities in each other.
- [x] Chose action-based capability naming over provider-based naming.
- [x] Chose per-app settings and per-app engine profiles, with shareable models/artifacts where useful.
- [x] Captured the umbrella kanban entry.

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
- `website`
- `release-copy`

Do not create all child entries automatically. Create them when the corresponding work is ready to enter PLANNING or IMPLEMENTING, so the board stays readable. Do not create duplicate child plans for work that already has a kanban entry or plan; link the existing work from this umbrella instead.

## Linked Existing Work

These plans/entries are related to this foundation but should not be duplicated:

- `Cubric Studio Docs subdomain + finish docs site` in BACKLOG tracks the docs-site follow-up work and references `docs/plans/2026-05-16-port-stage-to-docs.md`. Treat it as the docs child track for this umbrella until it is revised or replaced.
- `Port Stage redesign -> Cubric Studio Website` is already captured in `docs/plans/2026-05-16-port-stage-to-website.md`. Treat it as prior website redesign context; create a new `cubric-vision-foundation-website` child plan only if the ecosystem landing/subdomain rewrite is too large to fold into the existing website work.
- `Cross-platform portable distribution` is an adjacent release plan. Rename/package artifact work should coordinate with it, but this umbrella should not absorb the portable distribution plan.

## Remaining Work

## Phase 1: Product And Brand Decisions

- [ ] Lock the product naming hierarchy: `Cubric` / `Cubric Studio` as ecosystem language, `Cubric Vision` as the current app, and `Cubric Prompt`, `Cubric Audio`, `Cubric Video` as future app names. **Verify:** one short naming note exists in this plan or a child brand plan and has no contradictory app names.

- [ ] Decide the minimum viable release branding scope: what must change before release versus what can wait for later identity polish. **Verify:** release-blocking brand items are separated from non-blocking brand exploration.

- [ ] Audit current logo, lettering, mascot, app icon, titlebar assets, and alt text for `Cubric Studio` assumptions. **Verify:** a concrete asset/text inventory exists with file paths and each item marked `rename`, `replace`, `defer`, or `keep`.

- [ ] Decide whether the current mascot remains part of Cubric Vision v1 or becomes a broader Cubric ecosystem mascot later. **Verify:** no release surface depends on an unresolved mascot-letter variant system.

## Phase 2: App Rename Surface

- [ ] Inventory all user-visible `Cubric Studio` strings in the app, package metadata, launch scripts, release scripts, docs, and tests. **Verify:** `rg "Cubric Studio|CubricStudio"` results are triaged into user-visible, internal-code, filesystem-path, and historical-doc categories.

- [ ] Rename user-facing app identity to `Cubric Vision` while preserving internal paths where changing them would risk project portability or release stability. **Verify:** app title, titlebar, landing, about panel, metadata description, and relevant launcher/package labels consistently present `Cubric Vision`.

- [ ] Decide how to handle default project folders such as `Documents/Cubric Studio/Projects`. **Verify:** migration/compatibility behavior is explicit before any folder name change ships.

- [ ] Update release/package artifact names only after the user-facing naming decision is locked. **Verify:** portable distribution plan and launchers agree on artifact names or explicitly defer artifact renaming.

## Phase 3: Integration Foundation

- [ ] Define a minimal action-based capability vocabulary for the first ecosystem release, without implementing the full provider runtime. Candidate names: `prompt.enhance`, `prompt.translate`, `prompt.format.model`, `asset.import`, `asset.export`, `project.context.read`. **Verify:** vocabulary is documented and avoids provider names like `cubric-prompt.enhance`.

- [ ] Add or document a stable app identity concept for Cubric Vision, likely `cubric.vision`, distinct from product display name. **Verify:** there is one canonical app id and one canonical display name.

- [ ] Identify where optional UI actions can attach later, especially prompt-box actions such as Enhance, Translate, and Format. **Verify:** the prompt UI can support future optional actions without rendering missing-app clutter in the first release.

- [ ] Define the first local integration contract as a future-facing stub, not a working runtime: discovery, capability request shape, artifact references, and error states. **Verify:** the contract can describe "Cubric Vision asks for `prompt.enhance`" without requiring Cubric Prompt to exist.

- [ ] Keep absent integrations hidden from normal workflow UI and reserve discoverability for Help, Docs, Integrations, or release copy. **Verify:** no disabled/promotional buttons are added to core prompt workflows for unavailable apps.

## Phase 4: Artifact Handoff And Project Portability

- [ ] Review sidecar schema for fields future apps need: prompt, negative prompt, seed, model id, operation, media type, dimensions, video metadata, source lineage, generation timings, trim, and preview assets. **Verify:** each future handoff use case maps to existing sidecar fields or a clearly named proposed field.

- [ ] Define which identifiers are project-local and which, if any, are portable cross-app artifact identifiers. **Verify:** UUID usage rules explicitly prevent accidental global identity assumptions.

- [ ] Define a minimal portable artifact reference shape for app-to-app handoff. It should prefer project-relative paths and sidecar ids when inside a Cubric project, with absolute paths only when needed for external files. **Verify:** a sample handoff can reference one image and one video from a copied project folder on another machine.

- [ ] Preserve template project behavior: projects with settings and selected models but no assets must remain shareable. **Verify:** any proposed metadata additions do not require media files to exist for a template project to load.

- [ ] Decide whether future Cubric apps consume a whole project folder, selected artifacts, or both. **Verify:** the foundation supports both without requiring hidden global state.

## Phase 5: Engines, Models, And Per-App Settings

- [ ] Document the ecosystem resource principle: app settings remain independent; engines remain app-owned; stable assets such as ComfyUI models and LLaMA models may be shared deliberately. **Verify:** the principle is written in the plan family and does not imply Cubric Vision owns engines for other apps.

- [ ] Preserve the existing `engine/`, `llama_engine/`, `llama_models/`, and `.engine-config.json` model-sharing patterns as Cubric Vision implementation details for this release. **Verify:** no first-release integration task requires a global settings store.

- [ ] Identify what a future shared model/resource registry would need to know, without building it now. **Verify:** the notes distinguish current Cubric Vision behavior from future Cubric ecosystem runtime behavior.

## Phase 6: Website, Docs, And Workspace Layout

- [ ] Decide the website repo strategy: keep the current Website and Docs repos as shared Cubric ecosystem sites rather than placing a website inside every future app repo. **Verify:** one source-of-truth note describes which repo owns `cubric.studio` and which repo owns `docs.cubric.studio`.

- [ ] Define the subdomain map: `cubric.studio`, `vision.cubric.studio`, `prompt.cubric.studio`, `audio.cubric.studio`, `video.cubric.studio`, and `docs.cubric.studio`. **Verify:** site copy/docs plan uses the same subdomain map.

- [ ] Update the main website direction from single-app `Cubric Studio` to ecosystem landing page with product pages. **Verify:** website plan identifies the current landing as becoming `Cubric Vision` product content under the broader Cubric site.

- [ ] Revise the existing docs-site work instead of creating a duplicate docs child plan. The current linked entry is `Cubric Studio Docs subdomain + finish docs site`, with context in `docs/plans/2026-05-16-port-stage-to-docs.md`. **Verify:** that entry/plan either explicitly adopts the Cubric ecosystem IA or a replacement child plan is created with a clear supersedes note.

- [ ] Update docs IA to support all apps: `/vision`, `/prompt`, `/audio`, `/video`, `/integrations`, and future `/runtime` if needed. **Verify:** the linked docs work has app-specific sections and one shared integrations section.

- [ ] Decide VS Code workspace organization for ecosystem work. Candidate: keep focused app workspaces plus an intentional multi-root ecosystem workspace that includes app repos, web, docs, and master planning. **Verify:** agents have clear root/kanban guidance and no website repo is embedded inside an app repo by accident.

## Phase 7: Release Alignment

- [ ] Reconcile existing release, Patreon, website, docs, and portable distribution plans that currently say `Cubric Studio`. **Verify:** all release-blocking copy uses the locked name or has an explicit historical/deferred reason.

- [ ] Update docs/rules only where current architecture source-of-truth would become misleading after the rename or integration foundation. **Verify:** any `.claude/rules/` update is explicitly approved before editing, per project rules.

- [ ] Run a final naming consistency audit before release. **Verify:** grep results for `Cubric Studio`, `CubricStudio`, `Cubric Vision`, `cubric.studio`, and app ids are reviewed and acceptable for release.

- [ ] Run the normal app verification after implementation. **Verify:** `npm run build` plus the relevant runtime/smoke tests pass, or failures are documented with release impact.

## Plan Drift

- None yet.

## Verification

Final acceptance for this plan family:

- The current app is clearly presented as `Cubric Vision` on release-critical surfaces.
- The broader ecosystem naming is documented and not contradicted by website/docs/release copy.
- Branding blockers are either resolved or explicitly deferred with no release-facing inconsistency.
- Cubric Vision remains standalone and does not require Cubric Prompt, Audio, Video, or a visible hub.
- The first integration foundation is action-based, minimal, and does not overbuild a full runtime before release.
- Sidecar/project portability remains intact, including drag-and-drop project folders and template projects.
- Existing engine/model sharing behavior remains independent per app and does not introduce global settings as a release dependency.
- Website/docs ownership and subdomains are defined enough to proceed without scattering sites across future app repos.

## Preservation Notes

- Before implementation, relevant rule files will likely include:
  - `.claude/rules/components.md` for UI rename and prompt action slots.
  - `.claude/rules/events.md` if optional integration events are added.
  - `.claude/rules/state.md` if app identity or capability state is stored.
  - `docs/project-integrity.md` and `docs/projects.md` for sidecar/project portability.
  - `docs/versioning.md` if schema, app version, or operation compatibility changes.
- Website/docs work targets sibling repos with separate git histories. Use absolute paths and do not run sibling git commands from the CubricStudio root.
- Do not edit `.claude/rules/` without explicit user approval.
- If this becomes too broad during execution, create child plans using the plan family convention above rather than growing this umbrella plan indefinitely.
