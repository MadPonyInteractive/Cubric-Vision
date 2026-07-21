# Model Library (Model Manager UI)

Contracts for `MpiModelManager` and the install-state display rules it shares with the landing
hero stats and every model picker. Dep resolution itself lives in [data.md](data.md)
(§ resolveModelDeps); download/install lifecycle in [download-manager.md](download-manager.md).
Verify a named file/function/flag still exists before relying on an entry.

## Usable vs installed — display/count/pickers gate on `isModelUsable`, never `model.installed`

`model.installed` is the raw ALL-deps-present flag; for op-keyed models it is false on a
deliberate partial install (e.g. Wan 2.2 with only t2v installed). Gating any user-facing surface
on it makes the model vanish while the app can clearly run it:

- **Model pickers/dropdowns** must use `isModelUsable()` (modelRegistry), NOT `model.installed` — a partial op-keyed install must still be pickable (MPI-122).
- **Landing hero "MODELS X / Y"** counts a model when its base OR ≥1 operation is on disk. `syncModelInstalled` (`js/data/modelRegistry.js`) filters `installedModelIds` on `isModelUsable(id)` (for op-keyed models: `deriveInstalledOps(...).fullyInstalled` = `installedOps.length > 0`), not the raw `result.installed`. The `_modelDepStatusCache` is populated in the same function just above the filter, so `isModelUsable` resolves correctly.
- **Rule: usable = installed for display/count purposes** — keep the hero count, the manager list, and the pickers all gated on `isModelUsable`.

## Featured models — editorial "hot / new / best" spotlight (2026-07-11)

Set `featured: true` on any `ModelDef` in `js/data/modelConstants/models.js` and it (a) sorts FIRST within its media sub-grid and (b) gets a gold sparkle star badge (top-right of the tile thumb). Purpose is editorial — surface what's hot / new / considered best right now. No cap, add/remove freely; it's a static per-model flag with no runtime state, so it's deliberately NOT in the render signature (nothing to churn).

Wiring, all in `MpiModelManager`: sort is a stable `.sort()` in `_mediaBlock` (`(b.featured?1:0)-(a.featured?1:0)` — modern V8 sort is stable, so non-featured keep declared order); badge is built in `_buildTile` next to the `justInstalled` heat dot using the existing `sparkle` icon; CSS `.mpi-tile__featured` (top-right, `--accent-warn` gold, so it never collides with the top-left heat dot). To change the spotlight, just flip the flag on the model defs — no other file needs touching.

## download:complete lingers in state.downloadJobs

`download:complete` sets `status='complete'` but NEVER removes the job from `state.downloadJobs`. Any gate keyed on `downloadState !== 'idle'` will mis-wire a card with a lingering complete job (MPI-99: Uninstall button had no listener; MPI-102: Install button had no listener after reinstall). Gate on genuinely-ACTIVE states explicitly (`downloading`/`paused`/`installing`), NOT `!== 'idle'`. `MpiModelManager.renderList()` has TWO twin branches with this gate (installed ~L251, uninstalled ~L362) — both use the identical `isActiveDownload` whitelist predicate. **Keep them in sync.**

## Library flash on install — patch the tile, never rebuild the grid (MPI-235)

`renderList()` tears down + rebuilds EVERY tile. During an install it must fire only on a genuine section move (a model jumping Available → Installed on complete). `download:started` / `download:progress` patch ONLY the one changing tile via `_patchTile` — NOT `renderList()`. The flash storm had two sources: (1) the backend broadcasts `download:complete` **per-dep** with `modelId:null` (then once model-level with a real id) — the frontend `download:complete` SSE handler ran `reSyncInstalledModels()` + re-emitted unconditionally, so every dep fired `models:checked` → grid rebuild ×N; gated on `data.modelId`. (2) `download:started` (fired twice — client-side in `downloadService.start()` + the backend SSE echo) and `_install()` both called `renderList()`; both replaced with `_patchTile`. Rule: on a download hot event, patch the tile, never rebuild the grid.

## Uninstall has no "keep files" state — install-state IS files-on-disk (2026-07-14)

`model.installed` is derived by statting disk (`syncModelInstalled` → `/comfy/models/check`), not stored. So a "keep files but forget install" uninstall is unrepresentable: keep the weights → resync re-flags the model INSTALLED → card never leaves the Installed section, no install button. The old `MpiOkCancel` "Also delete model files from disk" checkbox (`deleteFiles=false`) was exactly this dead no-op (starkest on SDXL, whose only non-universal dep is its checkpoint; the other 3 deps are always-kept universals). Removed from the Uninstall dialog — `on('ok')` now passes `deleteFiles=true` unconditionally. Backend `deleteFiles` param + all guards (universal / shared / outside-managed-root / pip) left intact; it just always receives `true`. Don't re-add a keep-files toggle without a real persisted install record separate from disk-stat.
