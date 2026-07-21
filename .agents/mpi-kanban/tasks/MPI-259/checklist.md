# MPI-259 Checklist

Derived from plan.md. Ordered; the flexible-input-seam decision (BaseApp = generic host,
inputs driven by `inputSchema`, no hardcoded media requirement) is the current front.

## In progress

- [x] **Flexible input seam (plan D, pulled forward).** MpiBaseApp renders declared `inputSchema`
  inputs generically instead of a hardcoded source-image slot. Media-free apps show no upload slot
  (`_appNeedsMedia`); Run guards on media only when declared. Extension contract documented in
  `docs/apps.md` § "Flexible inputs". Output is the only constant (≥1 image/video, may be N).
  node --check clean; live-verified in the running app.
- [x] **2nd app `sdxl-4k` (multi-model: sdxl-nsfw + nvidia-pid).** Op registered in 4 files
  (commandRegistry `appSdxl4k` requiresImages:0 mediaInputs:[], universal_workflows, core/operationRegistry,
  operation_registry.json). Workflow renamed `App_sdxl_4k.json` (`App_` prefix). Descriptor in
  appsRegistry (preview `chroma-flash-01.webp`, inputSchema `{positive:'string'}`, no media). Reuses
  `MpiAppImageRegen` uiComponent. inject-params test case added — 4/4 green. LIVE-verified: tile +
  "Get models" badge + detail rows (SDXL NSFW=Installed, NVIDIA PiD=Install) + Install button render.
- [x] **B — Install flow + aggregated progress bar (multi-model).** Install Models → **Cancel**
  button + **aggregated % bar** (N models each = 1/N; serial fill; read live from state.downloadJobs +
  s_installedModelIds via `_installProgress`). Cancel = **cancel-all** (`_cancelInstall` loops
  requiredModels). Bar ticks on `download:progress` (fast `_patchProgress`, no footer rebuild);
  state transitions (started/complete/cancelled) rebuild footer. Full-width bar stacked ABOVE Cancel
  (`#app-detail-panel .mpi-detail__actions{flex-direction:column}`). Reuses MM.css `.mpi-tile__prog`.
  LIVE-verified: bar hit 52→54% (sdxl-nsfw 50% + nvidia-pid downloading), Cancel present; then
  install COMPLETED → badge Get-models→Ready, footer Cancel→**Open** (disabled on Landing per canOpen).

- [x] **C (partial — code + canOpen verified).** Entry-point parity: Landing nav + Gallery radial
  both emit the same `apps:open` → one shell handler → identical overlay (structural). canOpen gate
  LIVE-verified: Open **disabled on Landing** (currentPage !== PAGE_GALLERY). Submit-guard
  (appService `submitAppGeneration` missing→ui:warning) + reuse-routes-uninstalled-to-Library
  (`openAppFromReuse` missing→apps:open) present in code. STILL TO EXERCISE LIVE: Gallery-radial →
  Open → app runs (needs a project open); reuse of an app card whose model is uninstalled (needs an
  uninstall — nvidia-pid + sdxl-nsfw both installed now, so sdxl-4k is available).

- [x] **D1 — LIVE-VERIFIED 2026-07-12 (user ran SDXL-4K, 0 images).** Workflow gating WORKS: empty image
  slots → `MpiLoadImageFromPath` ExecutionBlocker → only `Output_Image` ran → 1 real card; injection fix
  resolved the path correctly (no placeholder.png error this run). TWO follow-up fixes this session:
  (a) placeholder count → ONE, not N. Output count is unknowable until completion (self-gated), engine
  emits one latent at a time, so 1 "Generating…" card during the run, real 1..N land on complete
  (appService.js — dropped extraTempIds/extraPlaceholders + app.outputs; appsRegistry outputs:3 removed).
  (b) result-pane `blob:…ERR_FILE_NOT_FOUND` — `_showResults` now always clears the revoked live-latent
  preview (+ clears on error/cancel). node --check + inject test 4/4. STILL OWED: user live-verify
  1-image → 2 cards, 2-image → 3 cards.
- [x] **D1 (original) — polymorphic inputs + multi-output (same mediaType). CODE-COMPLETE.**
  Result pane now shows ALL N outputs (`_showResults`, generation:complete carries additive
  `items`/`groups`); result-media CSS wraps to a grid for N. docs/apps.md updated (polymorphic slots +
  multi-output). node --check clean, inject test 4/4. LIVE render verified (slot group + drop zone +
  prompt). NOT run to a real generation — that mutates the user's project + spins GPU; user drives the
  end-to-end (open project → drop 0/1/2 images → Run → expect 3 cards + all 3 in pane).
- [~] **D1 (superseded detail below).** IN PROGRESS.
  DONE: capture filter prefix-match (commandExecutor.js:1296, unit-verified); media-kind title-force
  pattern-based (comfyController.js:1022, both-engine); op `appSdxl4k` mediaInputs = 2 optional image
  slots (image1/image2 → Input_Image/Input_Image_2); AppDef sdxl-4k inputSchema.media (image upto:2,
  roles) + outputs:3; submitAppGeneration allocates N placeholders (extraTempIds/extraPlaceholders);
  inject test re-pointed to multi-image variant (4/4 green). User split workflows: App_sdxl_4k.json =
  MULTI-IMAGE (2 in, 3 out); video/audio workflow separate/pending. IN FLIGHT: polymorphic slot UI in
  MpiBaseApp (dynamic-until-cap, numbered, multi-select file pick) — subagent building. TODO: result
  pane shows N; live verify (run sdxl-4k with 0/1/2 images → N cards).
- [x] **D1.5 — conditional output gating — DELETED (user 2026-07-12; workflow-side gating shipped).**
  App-side `outputSchema.when` NOT built. New MpiNodes self-gate every type IN the workflow:
  `MpiLoadImageFromPath` (empty PATH → ExecutionBlocker → no Output_Image* card — images now self-gate
  like video), `MpiBlockIfEmpty`/`MpiAnyChecker`/`MpiHasAudio` (audio/any), `MpiIfElse` (video, already).
  → capture-what-ran drops gated outputs with zero app logic. INJECTION FIX shipped this session:
  `comfyController` routes image params on class `MpiLoadImageFromPath` through the media path-resolve
  branch (real path / Pod-uploaded path), NOT the upload-name branch; legacy `LoadImage` unchanged;
  class-based so future workflow migration auto-flips. node --check + inject test 4/4 green.
- [ ] **D2** import-on-drop → gallery (dropped app files land in gallery as `imported`).
- [ ] **D3** gallery-select entry path (reuse existing Ctrl/Shift-click select-mode) as 2nd pick path.
- [ ] **D4** reuse missing-media toast (mirror MPI-227 input_asset_deleted downgrade).

## Remaining (plan groups, live backlog)

- [ ] B install progress bar (single + multi-model)
- [ ] C uninstalled-app path + both entry points (Landing nav + Gallery radial)
- [ ] D video + audio input slots (wire when a real app needs them) + multi-output (N cards, in-app pane, reuse)
- [ ] E full reuse matrix on real cards (2 apps, across restart) + App overlay UI design pass
- [ ] F staged-build gate confirm + dev-gate accounting (lift at ≥4 apps)
- [ ] `Apps/` subfolder convention (plan A) — SUPERSEDED: user chose `App_` prefix, flat. Drop this item; update plan A note.

## Done

- [x] Compact plan attached; card To do → Doing.
