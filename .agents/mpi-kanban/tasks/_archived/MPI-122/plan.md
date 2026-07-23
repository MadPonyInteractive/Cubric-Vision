# Restore Wan 2.2 as one operation-selectable model

> **Rewritten 2026-06-22 (opus).** Replaces the original `dependencies` +
> `operationDependencies` bolt-on with an operations-keyed model shape per the
> user's direction, and reframes sequencing from a parallel batch into a
> deliberate big-bang refactor (app may be non-functional mid-flight; that is
> accepted). See "Decisions" for the locked calls.

## Goal

The RunPod branch split Wan 2.2 into two models (`wan-22-t2v`, `wan-22-i2v`) so
users wouldn't download all ~78 GB. Better idea: keep it as ONE model and let
the user pick which operations to install. Each operation carries its own
weights; common files are shared. This generalises to any future model with
separable operation payloads.

## Decisions (locked with user)

1. **Model shape is operations-keyed.** A model no longer carries a flat
   `dependencies` array. It carries:
   - `commonDeps: string[]` — always-required dep ids (VAE, text encoder, shared
     custom nodes). Installed whenever the model is installed at all.
   - `operations: { <opKey>: { deps: string[] } }` — per-operation unique dep ids.
   Models whose operations are NOT separably installable (all current image
   models — the t2i checkpoint, shared upscaler, shared nodes) keep a plain flat
   `dependencies: string[]` and declare no `operations`. The resolver treats a
   flat `dependencies` model as "commonDeps = dependencies, no operations" — one
   code path, no special-casing downstream.
2. **`commonDeps` is a separate field** (not repeated inside each op). Resolver
   unions common + selected ops and dedupes stably.
3. **Sequencing = big-bang, done properly.** No permanent compat shim. The model
   shape changes AND every consumer migrates to the resolver in one coordinated
   effort. The app is allowed to be broken between commits; it must be correct
   when the effort lands. Rationale: the user wants it done right and is fine
   with a broken window, but is NOT fine with quietly corrupting the resumable
   download / refcount / `.cubricdl` machinery — so that machinery's CONTRACT is
   frozen (see Preservation).
4. **The download lifecycle is the frozen chokepoint.** `downloadService.start(modelId, deps)`
   and `uninstall(modelId, deps, keepFiles)` already take a RESOLVED FLAT dep
   array. The resolver runs at those call sites and produces that flat array from
   `(model, selectedOps)`. Nothing inside `routes/downloadManager.js`'s job/SSE/
   refcount/marker system learns about operations. No new SSE channel, no
   operation-level download jobs, no second downloader. Jobs stay keyed by
   `modelId`.
5. **Canonical id `wan-22`.** Split ids `wan-22-t2v` / `wan-22-i2v` become runtime
   aliases resolved at lookup/storage read boundaries (`canonicalModelId`).
   Historical media/sidecars are NOT rewritten. No project-schema bump.
6. **Capability vs availability.** `supportedOps` stays static model capability.
   `installedOps` is derived from disk/Pod status by the resolver. A model is
   installed when `commonDeps` + ≥1 operation are complete. Deliberately omitted
   operations are NOT partial failures.
7. **Selectors:** icon+label toggle-mode `MpiButton`s, default all selected for a
   fresh install, block empty selection, freeze during active install, preserve
   draft across manager rerenders. Reopen derives state from physical status;
   ambiguous (only common partial) → fall back to all-selected.
8. **Uninstall stays whole-model.** Deselection is non-destructive. Adding a
   missing operation downloads only its missing resolved deps.
9. **Op icons don't exist yet.** `commandRegistry` ops have `label` but no `icon`.
   The UI phase adds an `icon` to the relevant `CommandDef`s (or an op→icon map)
   and the resolver exposes label+icon for selectors. Phase 1 only needs labels.

## Verified facts (sub-agent + direct read, 2026-06-22)

- `downloadService.start/uninstall` already consume a flat resolved dep array —
  the chokepoint exists. (`js/services/downloadService.js:30,44`;
  `MpiModelManager.js:91-95,84`)
- `/comfy/models/check` is pure stat-by-filename — server is NOT op-aware and
  needs no change. The client must send the FULL resolved dep list.
  (`routes/comfy.js:534-583`; `modelRegistry.js:85`)
- Widening `supportedOps` to `['t2v_ms','i2v_ms']` is SAFE — every generation/UI
  consumer of `supportedOps` just sees both ops and behaves correctly. The
  danger is entirely the SHRINKING of the flat dep list that consumers read.
- Flat-`dependencies` readers that break when deps leave the flat array (~15
  sites): `routes/downloadManager.js:60,80,94` (local+remote shared-dep
  protection & remote check payload), `routes/shared.js:539-552` (engine-upgrade
  node restore — would miss the i2v-only `ComfyUI-PainterI2Vadvanced`),
  `modelRegistry.js:85,200` (check payload + `getModelDependencies`),
  `commandExecutor.js:378-379` (force-local guard), `MpiModelManager.js:91,116,182,214,308`
  (install list, size/VRAM stats, partial-progress).
- Split-id persistence to canonicalize on READ: localStorage selected model via
  `modelHelpers.getSelectedModelId`/`resolveActiveModel` (`state.js:31`); history
  sidecar `payload.modelId` in `MpiGalleryBlock`/`MpiGroupHistoryBlock`
  prompt-reuse and `routes/projects.js:1569` writes.

## Phase 1 — Pure resolver + contract tests (NO live model change yet)

Lands the resolver and its tests ONLY. `models.js` is not yet reshaped, so the
running app is unchanged this phase. This gives every later consumer a stable,
tested chokepoint to call.

- [x] Pure resolver module `js/data/modelConstants/resolveModelDeps.js` (ESM;
  loads via both `require` (tests) and `import` (browser) — verified): reads the
  `commonDeps`+`operations` shape, treats flat-`dependencies` models as
  `commonDeps = dependencies` with no operations (one code path). Exports
  `canonicalModelId`, `LEGACY_MODEL_ID_ALIASES`, `hasOperationGroups`,
  `selectableOps`, `dedupeStable`, `resolveDeps(model, selectedOps?, depExists?)`,
  `resolveFullUniverse(model)`, `deriveInstalledOps(model, depStatusFn)`. Op deps
  iterate in registry order so toggle/click order can't change the resolved list
  (stable job signature). Throws deterministically on unknown dep ids.
- [x] Contract tests `tests/resolve-model-deps.test.cjs` — 7 tests, all pass via
  `node tests/resolve-model-deps.test.cjs`. Cover: flat image model unchanged;
  Wan resolves common+T2V, common+I2V, full union, empty=common, all stably
  deduped + order-independent; unknown op ignored, unknown dep throws;
  `deriveInstalledOps` reports T2V-only/I2V-only as installed exposing only the
  complete op, common gates everything, flat model all-ops-or-none; canonicalize
  maps both split ids → `wan-22`, unknown ids pass through.
- NOTE: op `label`/`icon` exposure deferred to the UI phase (commandRegistry has
  no `icon` field yet; resolver doesn't need it for dep resolution).

## Phase 2 — Reshape the registry + migrate ALL consumers (big-bang)

One coordinated effort. App may be broken between commits; correct when complete.

- [ ] Reshape `js/data/modelConstants/models.js`: merge the two Wan entries into
  one `wan-22` (`name: 'Wan 2.2 Smooth'`, `supportedOps: ['t2v_ms','i2v_ms']`,
  both workflows) using `commonDeps` + `operations`. Leave all image models as
  flat `dependencies`. Update the `ModelDef` typedef.
- [ ] Replace `getModelDependencies` semantics in `modelRegistry.js` with
  resolver-backed queries; `syncModelInstalled` builds the check payload from
  `resolveFullUniverse` (so partial state is computed against the complete
  universe). Cache per-dep status as today.
- [ ] `MpiModelManager._installModel` resolves `(model, selectedOps)` →
  flat deps before `downloadService.start`; stats/partial-progress compute over
  resolved deps; uninstall resolves `resolveFullUniverse`.
- [ ] Backend shared-dep protection (`routes/downloadManager.js:60,80,94`,
  `routes/shared.js:539-552`, `routes/remoteModels.js`) computes the dep universe
  via the resolver / full-universe of every model, NOT the flat `.dependencies`
  field — so a shared or op-specific dep of another installed model is never
  deleted, and engine-upgrade node restore sees op-only nodes
  (`ComfyUI-PainterI2Vadvanced`).
- [ ] `commandExecutor._findModelNotLocal` (force-local guard) checks ONLY the
  requested operation's resolved deps, not the whole model.
- [ ] Canonicalize split ids on read: `modelHelpers.getSelectedModelId` /
  `resolveActiveModel` (localStorage) and history `payload.modelId` in
  `MpiGalleryBlock` / `MpiGroupHistoryBlock`. Generation surfaces filter actions
  by `installedOps`.
- [ ] Models-panel selector UX (toggle `MpiButton`s, draft, freeze, zero-block,
  installed-op count, `aria-pressed`, slide-over teardown destroys manager,
  document props in `types.js`). Add op `icon`s.

## Phase 3 — Integrate & validate

- [ ] Resolver + lifecycle + runtime tests, `npm run lint:components`,
  `npm run release:check`, `npm run test:desktop`. Exercise fresh full install,
  T2V-only, add-I2V-later, pause/resume/cancel, app-status recovery, whole-model
  uninstall, local + remote-shaped checks, Models slide-over flow. Update
  `docs/data.md` + `docs/comfy.md`; propose `.claude/rules/downloads.md` change to
  user (dependency contract changed). User visually accepts selector UX.

## Preservation Notes (the things that have bitten us before)

- **Do NOT change the resumable-download contract.** No new SSE connection, no
  operation-level download job system, no change to refcounts, `.cubricdl`
  markers, or NDH resume behavior. Jobs stay keyed by `modelId` and eat a flat
  resolved dep array exactly as today.
- Do not modify workflow JSON.
- Whole-model uninstall semantics preserved; operation removal is out of scope.
- Existing unrelated dirty board/session files belong to concurrent work — never
  revert or stage them.
- If the documented dependency/download contract changes, ASK before editing
  `.claude/rules/downloads.md`.

## Verification

**Verify mode:** user-ux

- Automated: `node tests/resolve-model-deps.test.cjs`, focused lifecycle/runtime
  tests, `npm run lint:components`, `npm run release:check`, `npm run test:desktop`.
- Runtime: one Wan card; selectors default all-on; empty selection blocked;
  T2V-only is usable and not falsely partial; adding I2V downloads only missing
  deps; PromptBox exposes only installed ops; pause/resume/cancel + status
  recovery preserve the selected snapshot; local + remote uninstall preserve
  shared/common deps; historical split ids resolve to Wan.
- User UX gate: inspect selector hierarchy, labels, selected-size feedback,
  installed-op count, active/disabled states in the running app.

## Plan Drift

- 2026-06-22: original plan rewritten. Old shape (`dependencies` +
  `operationDependencies`) replaced by operations-keyed shape; parallel batch
  replaced by big-bang Phase 2.
