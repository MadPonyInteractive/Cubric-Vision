# MPI-122 Checklist — Restore Wan 2.2 as one op-selectable model

## Phase 1 — Resolver + contract tests
- [x] `js/data/modelConstants/resolveModelDeps.js` (pure, dual import/require)
- [x] `tests/resolve-model-deps.test.cjs` (now 8 tests incl. real-registry integrity)

## Phase 2 — Reshape registry + migrate all consumers (big-bang)
- [x] `models.js`: merged `wan-22` (commonDeps + operations), ModelDef typedef
- [x] `modelRegistry.js`: `syncModelInstalled` + `getModelDependencies` resolver-backed; `getModelById` canonicalizes split ids
- [x] `MpiModelManager`: install resolves (model, selectedOps); stats/partial over resolved; whole-model uninstall via full universe
- [x] Backend shared-dep protection: `downloadManager.js` (`_findOtherModelsUsingDep`, `_remoteSharedDepIds`), `shared.js` (`getInstalledModelNodeDeps` — per-op weight gate), `remoteModels.js` (no change — consumes resolved deps)
- [x] `commandExecutor._findModelNotLocal`: checks only the requested op's deps
- [x] Canonicalize split ids on read: `modelHelpers.getSelectedModelId`, history `payload.modelId` in `MpiGalleryBlock` + `MpiGroupHistoryBlock`
- [x] Models-panel selector UX: toggle `MpiButton`s (icon+label), draft per model, zero-selection block, freeze on active download, installed-op count line, selected-size meta, op icons in `commandRegistry`, CSS, destroy wiring
- [x] PromptBox filters actions by `installedOps` via `getAvailableCommands(ctx.installedOps)`; refreshes op dropdown on `models:checked`

## Phase 3 — Integrate & validate
- [x] `node tests/resolve-model-deps.test.cjs` — 8/8 pass
- [x] `npm run lint:components` — clean
- [x] `npm run lint` — 0 errors (12 pre-existing warnings, none in touched files)
- [x] `npm run release:check` — passed
- [x] `npm run test:desktop` (model-ops-resolver.spec.js) — real Electron boots, wan-22 resolves end-to-end, legacy ids canonicalize, op-filter math correct
- [x] `docs/data.md` + `docs/comfy.md` updated
- [x] `.claude/rules/downloads.md` dependency-contract update (user approved — "Operation-selectable models — the resolver chokepoint" section added)
- [ ] **NEEDS USER:** visual UX acceptance of the selector hierarchy in the running app (verify mode = user-ux) — walkthrough in progress
