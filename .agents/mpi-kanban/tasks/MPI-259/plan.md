# Apps v2 — install/multi-model flows, Apps/ subfolder, 2nd app, UI pass

Follow-ups to MPI-256 (Apps v1 shipped, dev-gated). See `docs/apps.md` + MPI-256 card.
Whole card is one coherent surface (the Apps subsystem) — sequential, no parallel batch.

## Current State

- Apps v1 live + dev-gated: App Library overlay, `MpiBaseApp` frame, `MpiAppImageRegen` (first
  app, single model `sdxl-nsfw`), run→gallery-card, reuse-reopens-app, in-app latent+final.
- Files: `js/data/appsRegistry.js`, `js/services/appService.js`,
  `js/components/Compounds/LandingPages/MpiAppLibrary/`, `js/components/Organisms/MpiBaseApp/`,
  `js/components/Organisms/MpiAppImageRegen/`, `comfy_workflows/App_sdxl_regen.json`,
  `state.s_appInputs`.
- **Workflow-path finding (verified this session):** the `Apps/` subfolder needs NO
  resolver/server/remote change. `server.js:32 app.use(express.static(__dirname))` serves nested
  paths; the workflow is fetched app-side (`comfyController.js:991 fetch('/comfy_workflows/${file}')`)
  then injected + submitted as JSON to the Pod (Pod never reads the file by name). So `Apps/` is a
  pure app-side filename convention: put `Apps/App_foo.json` in `universal_workflows.js`, move the
  file, done.
- **User is authoring workflows in parallel** and will drop them into `comfy_workflows/Apps/`. This
  card likely adds apps 2-4 (a multi-model test/real app the user is building). Dev-gate
  (`APP_CONFIG.dev_mode = BUILD_HASH === 'dev'`) lifts at ≥4 apps (user decision).
- `operation_registry.json` = hand-maintained superset, never regenerate. New app ops hand-added
  in 4 files (see `docs/apps.md` "Adding an app" checklist + playbook §11).

## Implementation

Group A and B are self-verifiable (auto). Group C/D/E carry live UI the user must feel — this card
is **user-ux**. Sequence:

- [ ] **A. `Apps/` workflow subfolder convention.** Create `comfy_workflows/Apps/`, move
  `App_sdxl_regen.json` into it, update its filename in `universal_workflows.js` to `Apps/App_sdxl_regen.json`.
  Update `docs/apps.md` (path refs + "Adding an app" step 2). Grep for any other hardcoded
  `App_sdxl_regen.json` / `comfy_workflows/App_` ref. **Verify:** app still runs end-to-end (first
  app opens → Run → gallery card lands); `tests/inject-params-titles.test.cjs` green.

- [ ] **B. Install flow + progress bar (single- AND multi-model).** Exercise the App Library detail
  "Install models" button end-to-end: drives each missing model's `getModelDependencies(id)` →
  `downloadService.start(id, deps)`. Add live progress in-app — mirror Model Library's
  `_patchTile` / `download:progress` pattern so the user sees each model downloading, then the badge
  flips Get-models→Ready→Open. Multi-model: availability = ALL `requiredModels` installed; Install
  drives all; per-model rows in the detail slide-over each show their own progress. **Verify:** live —
  install from a clean state, watch progress per model, badge flips to Ready, Open enabled.

- [ ] **C. Uninstalled-app path + both entry points.** App whose required model is absent: badge,
  detail install state, submit-guard `ui:warning` (already in `appService.submitAppGeneration`),
  reuse routing to Library (`openAppFromReuse` → missing model → `apps:open`). Verify install works
  **identically from both entry points**: Landing (project page) nav AND Gallery radial. Open is
  Gallery-only (disabled + toast on Landing) → from Landing user installs then enters a project to
  Open; verify that hand-off reads sensibly. **Verify:** live from both entry points; uninstalled
  app shows correct badge/guard; reuse of an uninstalled-model app card routes to Library.

- [ ] **D. Polymorphic app I/O (GREW into its own phased subsystem — user spec 2026-07-12).**
  `App_sdxl_4k.json` re-exported by the user with the full I/O matrix: `Input_Image`,`Input_Image_2`
  (LoadImage), `Input_audio` (LoadAudio), `Input_video`,`Input_video_2` (**MpiString path**, not a Load
  node), `Output_Image`×3, `Output_video`×2. Caps: **images 0–2, video 0–2, audio 0–1**, workflow runs
  with 1 or none. Two slot patterns: **fixed/named** (start-frame/end-frame) and **dynamic-until-cap**
  (empty drop zone "Drop up to N" → fill one → next empty zone appears → …; **numbered**, models
  reference by index). Each drop zone = two entry paths: **file system** (browse, multi-select) OR
  **from gallery** (Gallery select-mode ALREADY EXISTS — Ctrl/Shift-click; open in select-mode → return
  chosen items). **Any dropped file → imported into the gallery** (same as gallery's own import). Empty
  optional slots: image/audio keep the **baked placeholder** (user always exports with placeholders →
  app injects nothing for that title); **video empties CLEAR the MpiString** (workflow gates missing
  video paths). **Reuse of a video app must TOAST if the referenced video is missing.**

  INJECTION (investigated this session): `comfyController._inject` (comfyController.js:1141) walks a
  target-key priority list (`value,text,…,image,mask,…,video,audio`) and writes the first key present
  on the node — so LoadImage→`.image`, LoadAudio→`.audio`, MpiString-video→`.value` ALL resolve with
  NO change to `_inject`. BUT `mediaParamKinds` (comfyController.js:1012) classifies media kind by
  INSPECTING node input fields (`'video' in inputs`); an MpiString video node has `.value`, NOT
  `.video`, so field-detection MISSES it. The title-force fallbacks (lines 1022-1034) that catch this
  are HARDCODED to exact `Input_Video`/`Input_Audio`/`Input_Image` (capital, singular). Our re-exported
  workflow uses `Input_video`, `Input_video_2`, `Input_audio`, `Input_Image_2` → **the lowercase/
  numbered MpiString-video slots would NOT be forced to 'video' kind → path never resolved/uploaded →
  breaks on the remote engine.** ⇒ **D1 MUST make the media-kind title-force pattern-based**
  (`/^input_video(_\d+)?$/i → video`, `/^input_audio(_\d+)?$/i → audio`, images similarly) instead of
  the exact-name checks. Small controller edit; both-engine (verify local AND remote paths).

  Phased (verify each LIVE before next):
  - **D1 — polymorphic input slots + multi-output (SAME mediaType only).** BaseApp renders declared
    slots per `inputSchema` (fixed + dynamic-until-cap, numbered); file-system pick (multi-select);
    empty image/audio → don't-inject (baked placeholder), empty video → inject empty string. Op
    `mediaInputs` declares all slots (Input_Image/Input_Image_2/Input_audio/Input_video/Input_video_2,
    required:false, caps). **Multi-output = N results of ONE mediaType** (user decision 2026-07-12:
    multiple IMAGES common, maybe 1 video/audio; MIXED image+video in one run explicitly NOT wanted —
    do NOT do the per-URL-mediaType refactor). An image app captures its N `Output_Image*` nodes → N
    cards; video nodes ignored. Gets the crazy workflow RUNNING end-to-end.

    MULTI-OUTPUT GEN-CORE findings (Explore agent, this session) — capture is title-EXACT today so
    numbered siblings are SILENTLY DROPPED; 3 changes:
    (1) `commandExecutor.js:1296` capture filter → PREFIX match `output_image*`/`output_video*` (DONE
        this session; preview + output_audio kept exact).
    (2) `MpiGalleryBlock.js:1290` placeholder alloc = `Batch_Size` only → must also count declared
        same-type `Output_*` capture nodes, else N-1 orphaned "Generating…" cards.
    (3) `generationService.js:665` `isVideo` = single `model.mediaType` flag → FINE for same-type
        (all items share the app's mediaType); the mixed-media per-URL refactor stays DEFERRED.
    LIMITATION (accepted for D1): `outputUrls` fills in `executed`-ARRIVAL order (non-deterministic
    across sibling nodes), so multi-image card order is not guaranteed stable. Sort-by-title is a small
    follow-up if ordered output matters (input numbering is separate + IS honored).

  - **D1.5 — conditional output gating — DELETED (user 2026-07-12; workflow-side gating shipped).**
    The app-side `outputSchema.when` gate is NOT built. The user authored new MpiNodes that make EVERY
    media type self-gate INSIDE the workflow, so the app just does CAPTURE-WHAT-RAN (already the default):
    * **`MpiLoadImageFromPath`** (images) — reads a filesystem PATH from its `string` input; empty/missing
      path → `ExecutionBlocker` → its `Output_Image*` branch never runs → no card. Images now self-gate
      exactly like video. (Superseded the old input-dir `LoadImage`, which kept a baked placeholder and
      could NOT self-gate — that was the whole reason D1.5 existed.)
    * **`MpiBlockIfEmpty` / `MpiAnyChecker` / `MpiHasAudio`** — block/branch on any empty value (audio,
      video, any). Audio/video gate the same way.
    * **VIDEO** already self-gated via `MpiIfElse` (`app_video_test.json`).
    ⇒ A gated-off output emits no `executed` → capture-what-ran drops it with zero app logic. Placeholder
    reconciliation is still needed (pre-allocated N vs dynamic kept-count — drop unfilled "Generating…"
    cards) but that is a D1 concern, not a gate.
    INJECTION IMPACT (done this session): `MpiLoadImageFromPath.string` wants a real PATH, not a Comfy
    upload-name. `comfyController` now routes image params whose target node
    `class_type === 'MpiLoadImageFromPath'` through the video/audio path-resolve branch (`_resolveMediaPath`
    + `_uploadRemoteMedia` → Pod-absolute path). Class-based, so migrating other workflows to the new node
    later auto-flips them. Legacy `LoadImage` keeps the upload-name branch.
  - **D2 — import-on-drop.** Any file dropped into an app slot is imported into the gallery as
    `imported` (reuse the gallery's existing import flow).
  - **D3 — gallery-select entry path.** Second entry path on each drop zone: open Gallery in the
    existing select-mode → user picks cards + Enter → chosen items fill the slots.
  - **D4 — reuse missing-media toast.** Reuse of a video/media app whose referenced media is gone →
    ui:warning toast (mirror MPI-227 `input_asset_deleted` downgrade), don't silently run degraded.
  **Verify:** live per phase — D1 the workflow runs with img/vid/audio + produces N cards; D2 dropped
  files land in the gallery; D3 gallery-pick fills slots; D4 missing-media reuse toasts.
  **NOTE:** conditional outputs (output count varies by input) explicitly DEFERRED (user, future).

- [ ] **E. 2nd app + full reuse matrix + UI design pass.** Wire the user's 2nd app (per
  `docs/apps.md` "Adding an app" checklist — op in 4 files, workflow in `Apps/`, descriptor,
  uiComponent + CSS + types + shell blueprint map). With two apps live, exercise the **full reuse
  matrix on real cards**: app-A card restores app A; app-B card restores app B; normal-card PromptBox
  reuse unchanged; app-card restore survives restart (sidecar `appId`/`appInputs` hydrate on reload);
  uninstalled-model app routes to Library. **App overlay UI design pass**: `MpiBaseApp` +
  `MpiAppLibrary` + per-app uiComponents — currently minimal/functional; follow the Stage design
  baseline (`styles/01_base.css` tokens + `.claude/rules/components.md` § "Stage design baseline").
  **Verify:** live — both apps open, run, land cards, reuse each correctly across restart; UI reads
  as designed, not placeholder.

- [ ] **F. Staged-build gate + dev-gate accounting.** Confirm `BUILD_HASH !== 'dev'` hides BOTH
  entry points (Landing nav + Gallery radial). If this card lands ≥4 apps, decide with the user
  whether to lift the dev-gate. **Verify:** a staged (non-dev) build shows neither entry point;
  count apps and confirm gate decision with user.

## Completed

- [ ] Nothing yet.

## Remaining Work

- A `Apps/` subfolder convention.
- B install flow + progress bar (single + multi-model).
- C uninstalled-app path + both entry points.
- D audio/video inputs + multi-output.
- E 2nd app + full reuse matrix + UI design pass.
- F staged-build gate + dev-gate accounting.

## Plan Drift

- None yet. **User flagged the deferred list is a LIVING backlog** — more fixes likely surface once
  the real 2nd app is built. Add items here before/as they appear; do not treat this list as closed.

## Verification

**Verify mode:** user-ux

Most of this card is live UI the user must feel in the running Electron app (install progress, badge
flips, both entry points, multi-output pane, reuse-across-restart, the UI design pass). Auto-checks
(`tests/inject-params-titles.test.cjs`, workflow-still-loads smoke) cover Group A and the injection
wiring only. Final acceptance is the user driving both apps end-to-end from both entry points,
installing a multi-model app with visible progress, running a multi-output/media-input app, and
confirming reuse restores each app correctly across a restart. Ship behind the dev-gate; lift only on
the explicit ≥4-apps decision.

## Preservation Notes

- Update `docs/apps.md` throughout: the `Apps/` subfolder path (replace all `comfy_workflows/App_*`
  refs), the "Adding an app" checklist (workflow now under `Apps/`), audio/video input support,
  multi-output handling, and any new reuse-matrix notes. Remove the "App overlay UI is intentionally
  minimal" known-limit once the design pass lands.
- New app ops: register in all 4 files (`commandRegistry.js`, `universal_workflows.js`,
  `operationRegistry.js`, `operation_registry.json` — the last is a hand-maintained superset, NEVER
  regenerate). Add a case to `tests/inject-params-titles.test.cjs` per app.
- Component rules: new uiComponents register CSS in `preloadStyles.js`, props in `types.js`, and map
  NAME→blueprint in the shell `app:open` handler (per `docs/apps.md` checklist step 4).
- If the dev-gate lifts, update the memory hook + `docs/apps.md` known-limits.
