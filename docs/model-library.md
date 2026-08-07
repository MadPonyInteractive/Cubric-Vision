# Model Library (Model Manager UI)

Contracts for `MpiModelManager` and the install-state display rules it shares with the landing
hero stats and every model picker. Dep resolution itself lives in [data.md](data.md)
(§ resolveModelDeps); download/install lifecycle in [download-manager.md](download-manager.md).
Verify a named file/function/flag still exists before relying on an entry.

## Usable vs installed — display/count/pickers gate on `isModelUsable`, never `model.installed`

`model.installed` is the raw ALL-deps-present flag. It is false for a model whose CURRENT-engine or
CURRENT-arch weight is on disk but whose sibling weight is not (`isModelUsable` routes those through
`deriveInstalledOps`), and it was false for a deliberate partial op install back when a model could
have one. Gating any user-facing surface on it makes the model vanish while the app can clearly
run it:

- **Model pickers/dropdowns** must use `isModelUsable()` (modelRegistry), NOT `model.installed` (MPI-122).
- **Landing hero "MODELS X / Y"** counts a model when its base OR ≥1 operation is on disk. `syncModelInstalled` (`js/data/modelRegistry.js`) filters `installedModelIds` on `isModelUsable(id)` (for op-keyed models: `deriveInstalledOps(...).fullyInstalled` = `installedOps.length > 0`), not the raw `result.installed`. The `_modelDepStatusCache` is populated in the same function just above the filter, so `isModelUsable` resolves correctly.
- **Rule: usable = installed for display/count purposes** — keep the hero count, the manager list, and the pickers all gated on `isModelUsable`.

## The detail drawer has NO Operations row (2026-08-07)

It used to render one toggle per `operations{}` group so a user could install a subset of a
model's ops (MPI-122). MPI-470 deprecated Wan's `t2v_ms`, which left the last op-keyed model
showing a single toggle that could not be turned off — a choice with nothing to choose. The row,
the `_buildToggleRow`/`_draftFor`/`_setDraft` machinery, the `s_modelOpDraftByModel` state key and
its localStorage mirror are all gone, and `wan-22` is flat. **GPU-arch is now the only draft axis**,
so an Update means exactly "install/remove an arch weight". See `.claude/rules/downloads.md` for
what to restore, together, if a future model brings operation groups back.

## The VRAM table's floor can be overridden per model (2026-08-07)

`footprint.js` computes the floor as 25% of total weights. The raw fit is never a row — "8.29GB
VRAM" reads as a spec when the table's job is to name a card you can buy — so it is lifted onto
**`CARD_SIZES`, the sizes cards are actually sold in**: 8, 12, 16, then 8s.

**The floor moves onto that ladder; the body of the table stays on the 8GB grid.** The floor is the
number that decides *can I run this at all*, so it has to name a card that exists; above it, 8GB
steps are the useful granularity.

**The RAM column rounds up to 4GB, not 8.** At 8 it buried a real difference — Wan needs 22.5GB at
12GB VRAM and 18.5GB at 16, and both landed in one bucket, so the table printed `12→24` and
`16→24` and read as *"16GB buys you nothing"*. 4GB is still `ceil`, so it still only ever
over-states, and the margin was never this rounding: it is the OS-reserve footnote (~10–20GB) the
table deliberately leaves out. A side effect worth knowing — the LTX calibration anchor now comes
out **exact** (44GB at 16GB VRAM, the measured free-RAM figure on the 4060 Ti box) instead of being
rounded up to 48.

It used to round the floor up to the 8GB grid, which has **no 12 in it** — the most common
mid-range size there is. Any fit just over 8 was catapulted to 16, nearly 2x overstated, on three
of the library's cheapest models to run: `wan-22` (8.29), `ltx-23-balanced` (10.10) and
`qwen-edit` (8.02). A floor is a *don't bother* signal, so overstating it costs users a model.
Fixed 2026-08-07 by fixing the ladder, not the three cards.

A ModelDef may still set **`minVramGb`** to state the floor outright, for when a model is MEASURED
to run below the fit: both H3 cards set 12 against a 13.3 fit. An override off the ladder draws its
own leading row and the ladder resumes above it. The footnote quotes the same floor the first row
shows — before this they could disagree (Wan's footnote said `min 8GB` over a table starting at 16).

## Featured models — editorial "hot / new / best" spotlight (2026-07-11)

Set `featured: true` on any `ModelDef` in `js/data/modelConstants/models.js` and it (a) sorts FIRST within its media sub-grid and (b) gets a gold sparkle star badge (top-right of the tile thumb). Purpose is editorial — surface what's hot / new / considered best right now. No cap, add/remove freely; it's a static per-model flag with no runtime state, so it's deliberately NOT in the render signature (nothing to churn).

Wiring, all in `MpiModelManager`: sort is a stable `.sort()` in `_mediaBlock` (`(b.featured?1:0)-(a.featured?1:0)` — modern V8 sort is stable, so non-featured keep declared order); badge is built in `_buildTile` next to the `justInstalled` heat dot using the existing `sparkle` icon; CSS `.mpi-tile__featured` (top-right, `--accent-warn` gold, so it never collides with the top-left heat dot). To change the spotlight, just flip the flag on the model defs — no other file needs touching.

## download:complete lingers in state.downloadJobs

`download:complete` sets `status='complete'` but NEVER removes the job from `state.downloadJobs`. Any gate keyed on `downloadState !== 'idle'` will mis-wire a card with a lingering complete job (MPI-99: Uninstall button had no listener; MPI-102: Install button had no listener after reinstall). Gate on genuinely-ACTIVE states explicitly (`downloading`/`paused`/`installing`), NOT `!== 'idle'`. `MpiModelManager.renderList()` has TWO twin branches with this gate (installed ~L251, uninstalled ~L362) — both use the identical `isActiveDownload` whitelist predicate. **Keep them in sync.**

## Uninstall must SETTLE the store, or the tile draws 100% forever (MPI-396)

The section above is about a job lingering in `state.downloadJobs`. This is the backend
twin, and it is worse: the job lingered in the **store** — `routes/install/installStore.js`,
the SOT — so it survived a renderer reload, because the store is main-process.

`pruneTerminal` drops a DONE job on `confirmedInstalled.has(modelId) || age >= DONE_TTL_MS`.
That encodes **"a DONE job ends with the model INSTALLED"**, and uninstall is the case it
cannot express: an uninstalled model is never in `confirmedInstalled` (the reconciler builds
that set from deps that ARE on disk), so only the 120s belt could clear it — and post-uninstall
**nothing is active**, so `reconciler.start()`'s `hasActiveJobs()` gate makes the poll return
early forever and the belt never runs. The job was immortal until the next install or an SSE
reconnect landing >120s later.

The renderer half is the same assumption one layer up: `_modelState` sets
`isBusy = !!job && status === 'complete'` (MPI-241, so a fast ephemeral-Pod install does not
flash the Install chip before re-sync lands), and `_tileState`'s `isBusy` branch then beats the
Install chip and renders a determinate bar at `job.progress = 1`. MPI-241 modelled the window
*before* installed flips **true**; uninstall is the identical shape with the opposite meaning.

**Rule: an uninstall settles the store job itself — `store.dropModel(modelId)` +
`broadcastSnapshot()`, at BOTH uninstall legs, before the `download:uninstalled` broadcast.**
The remote leg (`downloadManager.js`, `remote: true`) returns `res.json()` early and never
reaches the local leg's `reconcileOnce()`, so a one-leg fix is a false done — `dropModel` is
deliberately called twice and a guard test pins the count at two.

Do NOT fix this in `_tileState` by suppressing the bar when the model is not installed. The
store would still be reporting a finished job for a model that no longer exists, to the status
endpoint and every other snapshot consumer; the tile is just the consumer that draws it.

## Library flash on install — patch the tile, never rebuild the grid (MPI-235)

`renderList()` tears down + rebuilds EVERY tile. During an install it must fire only on a genuine section move (a model jumping Available → Installed on complete). `download:started` / `download:progress` patch ONLY the one changing tile via `_patchTile` — NOT `renderList()`. The flash storm had two sources: (1) the backend broadcasts `download:complete` **per-dep** with `modelId:null` (then once model-level with a real id) — the frontend `download:complete` SSE handler ran `reSyncInstalledModels()` + re-emitted unconditionally, so every dep fired `models:checked` → grid rebuild ×N; gated on `data.modelId`. (2) `download:started` (fired twice — client-side in `downloadService.start()` + the backend SSE echo) and `_install()` both called `renderList()`; both replaced with `_patchTile`. Rule: on a download hot event, patch the tile, never rebuild the grid.

## The grid may rebuild — but the preview ELEMENTS must survive it (MPI-394)

The rule above stops a rebuild on download *ticks*; a genuine state change (install completes,
uninstall, filter, search, draft toggle) still runs a full `renderList()`, and that is fine —
what is not fine is destroying the loaded previews with it. `renderList()` wipes `bodySlot`, and
`MpiTileSheet` used to rebuild each thumb as a fresh `<img loading="lazy">`. A fresh lazy image
has **no pixels** and its load is deferred until after the next layout, so behind a main thread
busy with `_listSignature()` (O(n²) `_sharedOwnedDepIds` per model) + `reSyncInstalledModels()`
the entire grid sat blank for ~20s on every install/uninstall — read by the user as a regression.

Fix: `MpiModelManager` owns a `_previewCache` Map and passes it to every `MpiTileSheet.mount`.
The sheet builds each thumb element once per id and **re-parents** it on later rebuilds — an
already-decoded element paints in the same frame, so the wipe is never visible. The cache is
consumer-owned because the sheets themselves are re-created each render. An element that fires
`error` is evicted so the placeholder gradient still works. Any new surface that remounts sheets
on a state change must pass a cache; a one-shot sheet does not need one.

Video previews also carry a `poster` by filename convention (`foo.mp4` → `foo.webp`, generated
into `comfy_workflows/display/`): `ltx23_high_preview.mp4` is 40MB, so without a poster the
browser must pull its moov atom before it can show any frame. A missing poster file is a no-op.
It is assigned to `<video poster>`, so it is what the card SHOWS until hover playback starts —
which makes it **frame 0 of the clip it ships with**, not any frame you like. Posterising a
later frame because it composes better jumps the instant the video plays. Reshoot the clip for
a better opening frame instead, and regenerate the `.webp` from the mp4 you actually ship
(480px wide; `ffmpeg-static` is already a dependency).

## Licence row in the detail drawer — gated models only (MPI-451)

`openDetail()` renders a LICENCE field (licence name + "Read the licence" / "Request
authorization" / "Report misuse") **only when `getModelLicence(model.id)` returns a
descriptor**. Every permissively licensed model's drawer is byte-identical to before.

It is not decoration. The acceptance dialog is shown once, at install, so without this
row a user who accepted last month has no route back to the agreement — and MiniMax H3
§V.5 requires the misuse-reporting mechanism to stay *reasonably accessible*. The drawer
is the home for it because it is already where a user goes to read what a model is; the
tile has no room for it. Gate + descriptor contract: `docs/download-manager.md`
§ The licence gate.

## Uninstall has no "keep files" state — install-state IS files-on-disk (2026-07-14)

`model.installed` is derived by statting disk (`syncModelInstalled` → `/comfy/models/check`), not stored. So a "keep files but forget install" uninstall is unrepresentable: keep the weights → resync re-flags the model INSTALLED → card never leaves the Installed section, no install button. The old `MpiOkCancel` "Also delete model files from disk" checkbox (`deleteFiles=false`) was exactly this dead no-op (starkest on SDXL, whose only non-universal dep is its checkpoint; the other 3 deps are always-kept universals). Removed from the Uninstall dialog — `on('ok')` now passes `deleteFiles=true` unconditionally. Backend `deleteFiles` param + all guards (universal / shared / outside-managed-root / pip) left intact; it just always receives `true`. Don't re-add a keep-files toggle without a real persisted install record separate from disk-stat.

## The partial-install bar — what it means, and what it does NOT (MPI-258, MPI-462)

`_computePartial(model)` in `MpiModelManager.js` draws the bar under an *idle*
(non-downloading) tile. It means exactly: **≥1 GB of THIS model's own deps are already
on disk, and not all of them are.** It is not a paused download and not a resume point.

Three exclusions shape "its own":

- **Deps owned by another installed model** (`_sharedOwnedDepIds`) — a shared VAE or
  upscaler on disk for someone else must not read as progress here (MPI-258 Bug A).
- **`custom_nodes`** — work-not-bytes; a shared node folder survives uninstall and would
  read as a phantom partial. Same rule the live download bar applies
  (`_byteRatioExcludingNodes`, MPI-231).
- **A 1 GB floor** (MPI-258 Bug C) — below it, no bar. Sized to stop a handful of small
  support files showing 1-3% on a pack the user never touched.

**"Installed" in that first exclusion means ≥1 op on disk (MPI-462, shipped).** It
originally gated on the raw `m.installed` flag, which (`modelRegistry.js:189`) means the
WHOLE universe is present, every dep of every op. Nothing else in the app uses that
meaning: this same component decides it at :705, :1123 and :1307 as ≥1 installed op, as
does `isModelUsable`, as does the backend uninstall guard `_localSharedDepsMap` via
`deriveInstalledOps`. Under the strict flag a multi-op model protected nothing and its
weights were billed to its sibling tier — measured 2026-08-06, Wan 2.2 5B drew 36% for
Wan 2.2's 6.27GB clip and LTX 2.3 high drew 33% for LTX balanced's shared assets. Note
the asymmetry the looser predicate introduces: a ≥1-op model is not universe-complete, so
its universe can name deps that are NOT on disk, and only an on-disk dep may be treated as
owned — a missing one is still real work in this model's denominator. Read MPI-462 before
touching either predicate; it is a shared primitive with several readers.

**The floor does not save you from big orphans, and no exclusion can.** Weights left on
disk that no installed model needs (measured 2026-08-06: a 10.59GB clip, a 4.28GB
ControlNet) clear 1 GB on their own and draw a bar nothing here can suppress, because
nothing owns them — the bar is *honest*, and it is how the user spotted both incidents.
The fix belongs where the bytes are, not where the bar is: the post-uninstall orphan
sweep collects them (`docs/download-manager.md` § The orphan sweep). If you see a phantom
bar on a never-touched model, check for ownerless weights on disk BEFORE touching
`_computePartial` — MPI-314 and MPI-462 were both this, and neither was a bar bug.
