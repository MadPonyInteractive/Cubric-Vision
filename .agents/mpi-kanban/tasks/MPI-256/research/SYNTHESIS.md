# MPI-256 — Investigation synthesis (5 agents, 2026-07-11)

Full detail: A-model-library-clone.md, B-submit-seam.md, C-injection-workflows.md, D-overlays-zorder.md, E-factory-router-buttons-state.md.

## VERDICT: architecture holds. Most of the machine exists. 3 real gaps, all bounded.

## What we get FREE (existing, proven)

1. **Second-producer precedent exists.** `MpiGroupHistoryBlock` already submits via `enqueueGeneration(config, callbacks, opts)` (generationService.js:380) — including **universal workflows with `model: {id:null, mediaType}`** (`_runVideoTool`/`_runImageTool` :1116-1173). Apps = the same recipe.
2. **App workflows = universal-workflow path.** `universal: true` in commandRegistry + entry in universal_workflows.js + operationRegistry.js + operation_registry.json. No ModelDef needed. Bypasses resolveWorkflowFile entirely. Same file both engines.
3. **Results land in gallery automatically.** Gallery-scope enqueue → saveGeneration → addGroup creates a FRESH ItemGroup — no pre-existing group needed. App output = a normal gallery card. (Requires non-null state.currentProject — guaranteed by our canOpen=Gallery-only gate.)
4. **App Library = Model Library clone, heavy reuse.** MpiOverlay body-mode + lazy singleton (`apps:open` mirroring shell.js:346) + inline detail slide-over (translateX pattern) + grid/tile CSS + `_patchTile` hot-update + sig-guard re-render. Rewrite only: data source, tile content, availability derivation.
5. **"Install" in the app slide-over = existing model installs.** Missing required models → `downloadService.start(modelId, deps)` per missing model — the exact call Model Library's Install button makes. Zero new download machinery.
6. **BaseApp = composition precedent ×3.** MpiCompareOverlay/MpiModelManager/MpiModelSettings all wrap MpiOverlay (`appendToContainer` + proxied show/hide). BaseApp = Organism frame w/ empty named slots, per-app component fills them. No factory changes (factory LOCKED anyway).
7. **dev_mode gating patterns exist** (navigation.js:274 array-conditional; template ternary; hotkey `when`). Router needs ZERO changes (overlays aren't pages; Overlays.reset on navigate force-closes them — fine, and argues for s_appInputs in state.js).
8. **Engine tagging free** (SSE frames engine-tagged, `_frameEngineMatches` filters).

## The 3 REAL GAPS (new build)

**GAP 1 — requiredModels[] + availability guard (the biggest).**
No such concept exists. Universal ops have NO installed-model enforcement — an app workflow calling an uninstalled model's weights 400s raw ("model not in []"). Build: App descriptor declares `requiredModels: [modelIds]`; availability = all in `state.s_installedModelIds` (+ getModelDepStatus for partials); badge + slide-over + Open-gate read it; PRE-FLIGHT guard before enqueue (fail-open is not acceptable here — this is the product surface).

**GAP 2 — App overlay coverage mode.**
Requirement: cover Gallery + PromptBox, NOT status bar. Neither MpiOverlay mode fits (tool-container leaves PromptBox live; body covers status bar). Options:
- (2a) NEW `mountTarget:'workspace'` — absolute inset layer in `.main-area` (relative); covers #tool-container + #prompt-box-mount (children), sticky #shell-info-bar stays. Cleaner, more work. ← chosen? see decisions
- (2b) body-mode + exempt #shell-info-bar from stash + inset bottom: var(--statusbar-h). Less code, hackier.

**GAP 3 — queue slide-over z-order.**
MpiSlideOver z-100 < overlay z-10010 ⇒ queue invisible above any overlay today. Survives the open pulse already (reason exemption) — pure z fix. Cleanest: App overlay sets `--app-overlay-z` (from Overlays.request return) → `.mpi-slide-over--queue { z-index: calc(var(--app-overlay-z, 90) + 10) }`. Small, scoped to the queue variant.

## Traps the plan must encode (from B/C invariants)

- Apps must NOT provide `getNextGeneration` callback (armed loop would re-fire app gens).
- App gens inherit project modelSettings LoRAs SILENTLY (no per-call override exists) — decide inherit vs run-clean (user Q).
- Output nodes MUST be titled Output_Image/Output_Video/Output_Preview or the run returns nothing silently (MPI-217). Injection params: unmatched Input_* keys drop silently (MPI-242) — extend inject-params-titles.test.cjs to app workflows.
- `_ensureRemoteHotStore` gated on payload.modelId — universal app op w/ ≥20GB weight never hot-stages (slow first Pod run). If an app leans on a big model, pass modelId or extend the gate.
- Workflow-baked LoRA filenames not auto-uploaded to Pod (only injected LoRA params are) — app workflows w/ baked LoRAs need weights pre-installed on volume (they will be, via requiredModels install).
- New op = 3 registry files in sync (commandRegistry, operationRegistry.js, operation_registry.json via /mpi-version-bump) + universal_workflows.js. Existing drift found: poseReference missing from operation_registry.json.
- Never renderList on hot download events (_patchTile only); downloadJobs busy whitelist; render sig includes filter axes.
- generation:complete ≠ persisted (saveGeneration failures warn-swallowed).
- s_appInputs in state.js (survives Overlays.reset-on-navigate), replace-not-mutate, 3-file touch (state.js + component-state.md + consumer).

## Stale docs found (file separately / fix in passing)
- workspaces.md:14 zero-model auto-open — REMOVED in code (MpiGalleryBlock.js:1547-1565 dialog instead).
- component-mounts.md:194 PromptBox download button emitting models:open — not in code.
- poseReference in operationRegistry.js but not operation_registry.json.

## Decisions pending (user)
1. App results = normal gallery cards in current project? (pipeline default, zero new code) — RECOMMEND yes.
2. GAP 2 approach: new 'workspace' mount mode vs body+exemption — RECOMMEND (2a) workspace mode.
3. LoRA inheritance: app gens run clean (strip project LoRA settings) vs inherit — RECOMMEND run clean.
4. BaseApp scope — RECOMMEND: header/back + result+progress pane + Run button/lifecycle + declared upload slots all in BaseApp; per-app = controls only.
5. First reference app — RECOMMEND simplest single-image-in/image-out (proves host end-to-end before bespoke widgets).
