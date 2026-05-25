## BACKLOG

### Vision subdomain content (vision.cubric.studio)

  - tags: [website, content, deferred]
  - priority: medium
  - defaultExpanded: false
    ```md
    Cubric Studio website (cubric.studio) is becoming the ecosystem landing.
    Current single-app landing copy (hero, features, screenshots, CTAs) belongs
    on a Vision-specific page at vision.cubric.studio.
    
    Scope: move the current "Cubric Studio" landing content to a new Vision
    subdomain site (or section), and rewrite cubric.studio as ecosystem landing
    listing all apps (Vision, future Prompt/Audio/Video).
    
    Sequencing lock 2026-05-21: do not start website/subdomain/social work
    until current app implementation work is finished, hub readiness is solid,
    and cross-platform portable distribution is ready and tested. Public-site
    work happens before release, not before portable distribution.
    
    Coordinate with existing website plan
    `docs\plans\2026-05-16-port-stage-to-website.md` and the docs-IA work.
    ```

### LTX 2.3 video model integration

  - tags: [PLAN, video]
  - priority: high
  - defaultExpanded: false
    ```md
    Sequencing lock 2026-05-21: post-release only. Do not start before
    current app work, hub readiness, cross-platform portable distribution,
    website/Patreon/social release surfaces, and the first public release.
    
    Deferred from WAN dual-model + 12 LoRAs plan until LTX workflows are ready.
    Scope:
    - Register LTX 2.3 as a video model once `comfy_workflows/LTX23_t2v.json` (+
    `LTX23_t2v_stage2.json`) and `LTX23_i2v.json` (+ `LTX23_i2v_stage2.json`)
    exist.
    - LTX uses the two-file multi-stage contract (no `Is_Continue` injection):
    stage-1 file contains `Preview_Only` + `SaveLatent` + `Preview` + `Output`;
    stage-2 sibling is authored by bypassing the stage-1 KSampler in ComfyUI
    and Save (API). See `.claude/rules/comfy_injection.md` § "Multi-stage
    video workflows".
    - LTX uses the standard flat LoRA shape, not staged WAN-style LoRAs. Because
    stage-2 LoRAs do not vary the result for LTX, set
    `commands[op].allowsBranchingContinue = false` so preview cards expose
    only the Discard + Finish buttons (no Continue). Finish replaces the
    preview with the final video via `replaceItemId`.
    - When LTX-class image models are added (future, lower-grade-GPU image
    ops), they get the same treatment: two-file `_ms` workflow, Finish-only
    preview card.
    ```

### Patreon landing page images

  - tags: [Idea]
  - priority: low
  - defaultExpanded: false
    ```md
    - Use Patreon users images for the landing page on each version.
    ```

### Website final media swap pass (placeholders -> release assets)

  - tags: [website, content, media]
  - priority: medium
  - defaultExpanded: false
    ```md
    Current status (2026-05-23):
    - Cubric Studio website + Vision page copy/layout refresh is implemented.
    - FAQ section added and moved to page bottom.
    - Local-library + features sections updated to reflect real behavior.
    - Hero and app-brand accents/mascots updated.
    
    Remaining website work for next session:
    - Replace placeholder images/videos on `c:\AI\Mpi\Cubric Studio (Website)\vision\index.html`
    with final campaign media assets.
    - Final visual QA pass on crop/aspect fit and playback thumbnails after media swap.
    ```

### Additive model folders in settings

  - tags: [Idea]
  - priority: low
  - defaultExpanded: false
    ```md
    - Explore adding to settings additive folders for models.
    This would basically be adding multiple folders where the system can pull from.
    ```

### Cubric Studio Docs subdomain + finish docs site

  - tags: [docs, infra, content]
  - priority: medium
  - defaultExpanded: false
    ```md
    Stage redesign port shipped + pushed to GitHub (Cubric-Studio-Docs main @ a2647b8).
    Remaining work:
    - Set up `docs.cubric.studio` (or chosen) subdomain via Namecheap → GitHub Pages.
    - Configure CNAME (already present in repo root) + GitHub Pages source = main / root.
    - Verify HTTPS once DNS propagates.
    - Address small UI polish items deferred from port session.
    - Flesh out actual documentation content: real screenshots, real videos
    (replace VIDEO/SCREENSHOT placeholders), expand thin pages
    (gallery, history, workflows), add search wiring (Algolia DocSearch
    or static Lunr), add new pages as features land.
    
    Target repo: c:\AI\Mpi\Cubric Studio (Docs)\
    Reference: docs\plans\2026-05-16-port-stage-to-docs.md (archived spec).
    Linked umbrella: docs\plans\2026-05-19-cubric-vision-foundation.md (docs child track).
    ```

## PLANNING

### Cross-platform portable distribution

  - tags: [PLAN]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
    Sequencing lock 2026-05-21: start after current app implementation work and
    hub readiness. After portable distribution is ready and tested, handle
    website/Patreon/social/docs release surfaces before public release.
    
    Install + model verification (run AFTER this implementation):
    The "Model Manager slide-over and zero-model gating" plan defers its
    Phase 6 manual install/model session here to avoid a duplicate
    large-download test pass. Once portable distribution is implemented, run
    one combined fresh-install session:
    1. clean portable app/user-data/engine state
    2. first launch + engine install/repair
    3. project page → confirm Models discoverable
    4. empty/new project zero-model → Models slide-over auto-opens;
    existing-media project zero-model → read-only, no PromptBox
    5. install one model (or seed model files + UI refresh/resync)
    6. confirm first installed model unlocks PromptBox/generation
    7. generate one image
    8. restart → installed-model detection persists
    Note in final results whether the real download path or the seeded-file
    resync path was exercised.
    Source: docs/plans/2026-05-22-model-manager-slide-over-zero-model-gating.md Phase 6.
    ```

### Madpony Patreon Revamp (User Action)

  - tags: [PLAN]
  - priority: low
  - workload: Easy
  - defaultExpanded: false
    ```md
    Plan File: docs\plans\2026-04-28-madpony-patreon-revamp.md
    ```

## IMPLEMENTING

### Video upscale should finish cleanly instead of sticking at 100%

  - tags: [video, universal-workflows, status, deferred-verification]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
  - steps:
      - [ ] Verify whether video upscale completes in ComfyUI outside the app flow.
      - [ ] Fix app-side completion/import/status cleanup for video upscale.
      - [ ] Verify Video Workspace upscale completes through the app.
    ```md
    Deferred verification:
    This should be tackled after the current video generation session is free,
    because it needs manual app and possibly ComfyUI-browser verification.
    
    Problem:
    Video upscaling in the Video Workspace gets stuck. The app status bar reaches
    100%, then nothing happens. The job does not appear in the Queue panel,
    because video upscale is currently one of the universal workflows not shown
    as a queue job.
    
    Known scope:
    - There is only one video upscale path: the Universal workflow in the Video
      Workspace.
    - The issue may be connected to missing universal workflow queue
      representation, but completion/import/status cleanup should be verified
      separately.
    - User has not yet tested this workflow directly in the ComfyUI browser.
    
    Expected behavior:
    - Video upscale should either complete and import the resulting video into
      the app, or fail with a visible error.
    - Status bar should not remain stuck at 100%.
    - Queue/status UI should reach a completed or failed terminal state.
    
    Verification:
    1. First, test the underlying video upscale workflow in the ComfyUI browser
       or another direct ComfyUI path, and note whether ComfyUI itself completes.
    2. In the app, trigger Video Workspace video upscale with no other queued
       work and confirm it completes/imports or reports a real error.
    3. Trigger Video Workspace video upscale while another job is queued/running
       and confirm it appears in the Queue panel if the universal queue card has
       already been implemented.
    4. Confirm the status bar clears from 100% after completion or failure.
    ```

## COMPLETED

### Universal workflows should enqueue visible Cue jobs

  - tags: [queue, universal-workflows, comfy]
  - priority: high
  - workload: Normal
  - assignee: codex (completed 2026-05-25)
  - defaultExpanded: false
  - steps:
      - [x] Audit universal workflow execution paths.
      - [x] Make universal workflows appear as visible queue jobs when they use ComfyUI.
      - [x] Verify video upscale/interpolate and at least one additional universal workflow.
    ```md
    Completed 2026-05-25.

    Shipped:
    - History-tool universal apply paths now enqueue through Cue instead of
      calling `startGeneration()` directly: video upscale, video interpolate,
      image upscale, image resize, and video resize.
    - Queue display metadata labels model-less universal jobs as
      "Universal workflow" instead of "Unknown model".
    - Follow-up UX decision implemented: Comfy-backed config UI is blocked by
      Cue depth rather than parallelized.
    - Resize / Resize Video rail buttons are disabled while Cue has running or
      queued jobs, with a status-bar hover reason. If Cue starts while Resize
      is active, the workspace switches back to Crop and destroys the resize
      preview panel.
    - Mask auto-detect controls are disabled while Cue has running or queued
      jobs. The mask panel shows a compact unavailable note, manual masking
      remains available, and `MpiCanvasViewer` guards auto-mask workflow starts
      before any existing auto-mask exec can be canceled.

    Verification:
    - `node --check` for changed JS.
    - `npm run lint` passed with 0 errors and 26 existing warnings.
    - Focused browser smoke confirmed queued universal jobs appear in Cue.
    - Focused browser smoke confirmed mask auto-detect disables/re-enables from
      `state.generationQueueCount`.
    - User verified the implementation in-app.
    ```

### PromptBox text field should auto-contract as text is deleted

  - tags: [promptbox, ui]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Fix PromptBox text-area sizing so height follows current content.
      - [x] Verify PromptBox text-area auto-contract behavior.
    ```md
    Completed 2026-05-25 by claude-opus-4.7-c. User-verified.

    Root cause: live textarea `scrollHeight` was caching the previous expanded
    layout. Setting `style.height = '0px'` (or `'auto'`) before measuring did
    not collapse the layout box — likely interaction between CSS `min-height:
    32px` and the grid parent's `align-items: end`. Result: after delete,
    `scrollHeight` reported the stale expanded height, so the textarea
    refused to contract.

    Fix: hidden mirror textarea probe (`_heightProbe`) appended to body with
    `height:0;min-height:0;max-height:none;overflow:hidden`. On each
    `updateHeight()` call, copy current value + font/padding/lineHeight/
    boxSizing/letterSpacing into the probe, set its width to the live
    textarea's `clientWidth`, then read the probe's `scrollHeight` as the
    ground-truth content height. Apply `Math.min(Math.max(sh, 32), 224)`
    clamp to the live textarea. Probe removed on `destroy` via `_unsubs`.

    File: js/components/Organisms/MpiPromptBox/MpiPromptBox.js (~line 546).
    ```

### Mask controls: invert display, clear/invert row, opacity slider

  - tags: [mask, ui, canvas]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Fix mask invert as a visual display toggle.
      - [x] Move mask invert and clear mask controls into the brush-selector row.
      - [x] Add mask opacity slider.
      - [x] Verify mask control behavior visually.
    ```md
    Completed 2026-05-25.

    Shipped:
    - MaskManager.flipColor now toggles `displayInverted` flag only — no pixel
      data mutation. Manual + subtract + autoPick layers untouched.
    - MpiCanvas overlay paint branch renders mask to a scratch buffer and
      recolors with source-atop to pure black when `displayInverted=true`.
      Comparison layer unaffected.
    - MpiCanvas API additions: `setMaskInverted(v)`, `isMaskInverted()`.
    - MpiCanvasViewer caches `_isMaskInverted` on the viewer scope so the flag
      survives swapToPreview → swapToCanvas teardown. Re-applied to the fresh
      MpiCanvas after every remount. New API: `setMaskInverted`,
      `isMaskInverted`, `setMaskOpacity`, `getMaskOpacity`.
    - MpiToolOptionsMask layout: brush selector + invert + clear share one row;
      opacity slider sits below the divider. Invert + clear use variant
      `secondary` for matching borders. Invert button gains `--on` modifier
      (180° icon rotation + accent border) when active.
    - Persistence: `project.toolSettings.mask` now includes `opacity` and
      `inverted` (alongside existing `model` + `useBox`). All four route
      through the existing `settings:tool:update` projectService queue, same
      pattern as crop/resize/upscale.
    - CSS hardcoded oklch track color replaced with `var(--line)`.

    Out of scope (deferred — not a blocker for first launch):
    - Prompt-mode preview (MpiMaskedImagePreview) still renders mask via CSS
      luminance overlay; invert flag is not honored there. Painted area in
      prompt preview shows image-through-mask regardless of invert state.
      Would require a preview render-mode branch + invert flag plumbing
      through swapToPreview.

    Verification: lint 0 errors. User confirmed working in mask mode
    (toggle/persist/opacity all behave). Auto-detection path untouched
    (no regressions to MaskManager three-layer model, _recomposite, or
    setAutoPickMasks).
    ```

### Escape should blur the PromptBox text field

  - tags: [promptbox, hotkeys, focus]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Add Escape blur behavior for the PromptBox input.
      - [x] Verify app hotkeys work again after Escape blurs PromptBox.
    ```md
    Completed 2026-05-25.

    Implementation:
    - New hotkey registry entry `promptBox.blur` (escape, allowWhileTyping:true,
      when-gated to textarea inside `.mpi-prompt-box`) so blur composes with
      existing escape handlers (overlay.close, focusMode.exit,
      gallery.selection.exit) instead of bypassing the registry / text-input
      gate.
    - MpiPromptBox binds `Hotkeys.bind('promptBox.blur', () => textareaEl.blur())`
      with unsub via `_unsubs`. Text value untouched.
    - MpiHelp.js: new "Prompt Box" group with ESCAPE row (registry comment
      requires hand-authored help to mirror new bindings).

    Files:
    - js/managers/hotkeyRegistry.js
    - js/components/Organisms/MpiPromptBox/MpiPromptBox.js
    - js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js

    Verified: user confirmed Escape blurs the PromptBox, prompt text preserved,
    app hotkeys regain focus after blur, no escape-handler regressions
    elsewhere. Lint 0 errors across changed files.
    ```

### Clean up ComfyUI terminal output classification

  - tags: [comfy, logging, terminal]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Normalize ComfyUI terminal/log output severity labels.
      - [x] Verify normal ComfyUI output no longer appears as errors.
    ```md
    Completed 2026-05-25.

    Fixed duplicated/false severity in app logs. Electron now preserves
    structured server log severity/category instead of wrapping child stderr as
    `[ERROR] [server]`. ComfyUI routine stderr/status lines such as `got prompt`
    now classify as info; explicit Warning lines remain warn and real
    error/traceback/failure lines remain error.

    Files: main.js, routes/comfy.js
    Checks: node --check main.js; node --check routes/comfy.js; npm run lint
    (0 errors, existing warnings only).
    Verified by user 2026-05-25.
    ```

### Queue panel should stay open when canceling queued jobs

  - tags: [queue, ui]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Fix queued-job cancel behavior so it does not dismiss the Queue panel.
      - [x] Verify Queue panel only closes from its explicit close control.
    ```md
    Completed 2026-05-25.

    Root cause: MpiSlideOver outside-click handler used `el.contains(e.target)`.
    Queue panel cancel rerendered the list synchronously via `replaceChildren()`,
    detaching the cancel button before the click bubbled to the document handler.
    `el.contains(detachedButton)` returned false, triggering false outside-close.

    Fix: MpiSlideOver.js _onDocClick now skips detached targets
    (`e.target?.isConnected` guard). Applies to any slide-over whose content
    swaps DOM on an internal action (Models uninstall, etc.).

    Files: js/components/Compounds/MpiSlideOver/MpiSlideOver.js
    Lint: clean.
    Verified by user 2026-05-25.
    ```

### Queue panel scaffold

  - tags: [PLAN]
  - priority: medium
  - defaultExpanded: true
  - steps:
      - [x] Queue metadata/snapshot contract
      - [x] Bare queue panel component
      - [x] Gallery Q hotkey and Help row
      - [x] Focused verification
      - [x] Selected mockup wiring
      - [x] Q/Escape/footer polish
      - [x] Thumbnail fallback and batch badges
      - [x] Placeholder and stage-two labels
      - [x] Gallery preview cancel reconciliation
      - [x] Ratio label and metadata line polish
    ```md
    Plan file: docs/plans/2026-05-24-queue-panel-scaffold.md
    ```

### Cubric hub readiness before portable distribution

  - tags: [PLAN, hub, integration, release]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed planning 2026-05-23.
    
    Plan file: docs/plans/2026-05-23-cubric-hub-readiness-before-portable-distribution.md
    
    Outcome: Cubric Vision portable distribution can proceed without live
    connector runtime integration, as long as the portable build preserves
    `resources/cubric/connector-manifest.json` and defines/verifies the future
    `resources/cubric/update-manifest.json` connector fields. Hub/broker
    packages do not need to be bundled into the first Vision portable artifact
    unless a connector-dependent feature is promoted.
    
    Pre-portable gates now live in the child plan:
    - preserve connector manifest in staged artifacts
    - rename portable artifacts/launchers from CubricStudio_* to CubricVision_*
    - generate update-manifest connector fields from the staged manifest
    - add a build smoke assertion for connector metadata
    - defer hub repo git/workspace/tooling to Stage 3+ unless live connector
    features are promoted
    ```

### Add missing prompt box parameters for individual operations.

  - tags: [feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Completed 2026-05-23. Developer dogfooding covered the remaining checks;
    any later findings will be tracked separately.
    
    2026-05-22: Restructured `modelSettings[modelId]` to nest per-op state
    under `operations.{shared, [opName]}`. PromptBoxControls now declare
    `scope: 'shared' | 'perOp'`. Added `denoise` control to `detail` op
    (default 0.30 via `commands[op].defaults`), independent from `upscale`
    denoise (default 0.20). Adds a clean path for future per-op controls
    without key collisions. Rule files updated (state, component-state,
    component-events, component-comfy, comfy_injection). Memory entry
    added enforcing the workflow-JSON read-only rule.
    ```

### Model Manager slide-over and zero-model gating

  - tags: [PLAN, models, ux, install]
  - priority: high
  - defaultExpanded: false
    ```md
    Plan file: docs/plans/2026-05-22-model-manager-slide-over-zero-model-gating.md
    
    Completed 2026-05-22 (code). Phase 6 manual install test deferred to the
    cross-platform portable distribution session — see below.
    
    Shipped:
    - NEW MpiModelManager (Compound, slide-over content) at
    js/components/Compounds/LandingPages/MpiModelManager/. Owns cards,
    refresh, install, pause/resume/cancel, uninstall confirm, all download:*
    subs. el.onOpen() re-syncs; el.destroy() tears down. No overlay.
    - DELETED js/components/Blocks/MpiModelsModal/ (block, 3 files).
    - shell.js: models:open now re-emits slide-over:open{title:'Models',
    component:MpiModelManager}. Removed modal singleton, _modelsModalAutoOpened,
    models:closed + models:all-installed listeners.
    - projectUI.js: added "Models" project-page nav action (first, before
    Settings/Help/About), all via slide-over:open.
    - Phase 3: removed PromptBox global download/model-manager icon. No
    in-workspace model-manager entry point (project-page slide-over only).
    - Phase 5 (option A): dropped models:closed entirely. Gallery mounts
    PromptBox off s_installedModelIds state, not modal close. Zero-model
    gate: empty/new project (itemGroups.length===0) auto-opens Models
    slide-over; project WITH media opens read-only, no PromptBox. History
    always read-only when zero models (re-resolves activeModel on install
    so PromptBox can mount post-install).
    - Dead-event cleanup: removed models:closed + models:all-installed from
    events.js registry; removed the orphaned models:all-installed emit +
    allInstalled block in modelRegistry.js (only consumer was deleted modal).
    - Docs/rules drift: component-events, component-mounts, component-state,
    workspaces rules + docs/workspaces.md + redesign/MAPPING.md updated.
    
    Verification: eslint 0 errors across all touched files; no `npm run build`
    script exists (vanilla ESM — lint is the static gate). Residual
    MpiModelsModal/models:closed/all-installed matches are intentional code
    comments, doc tombstones, and historical docs/plans|archive.
    
    PENDING — Phase 6 manual install session (deferred, coordinate with
    cross-platform portable distribution plan): fresh engine install →
    Models discoverable → zero-model gate/read-only → install/seed one model
    → PromptBox unlocks → generate one image → restart persistence. Distinguish
    download-path vs seeded-file-resync path in final notes.
    ```

### Remove local LLM / LLaMA runtime before release

  - tags: [PLAN, cleanup, release]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed 2026-05-21.
    
    Plan file: docs/plans/2026-05-21-remove-local-llm-llama-runtime.md
    
    Shipped via 3 parallel workers (backend/frontend/packaging-docs) + main-agent
    sweep + Phase 2 cleanup + Phase 3 audit:
    - Backend: deleted routes/llm.js + dev_configs/llm_models.json. Stripped
    llama from server.js, routes/shared.js, routes/platformEngine.js,
    routes/engine.js, dev_configs/system_dependencies.json.
    - Frontend: deleted js/services/llmService.js. Removed Ollama URL field
    from MpiSettings, OLLAMA_URL storage key + get/setOllamaUrl helpers,
    g_abortControllers + currentLoadedModel state. memoryOps.js keeps
    /comfy/unload (F5/Ctrl+F5 intact).
    - Packaging/docs: electron-builder.yml exclusions added
    (!llama_engine/**, !llama_models/**, !.engine-config.json),
    .engine-config.json llama keys stripped (enginePath kept),
    .husky/post-checkout no longer writes llamaPath/llamaModelsPath,
    docs/PROJECT.md + worktrees.md + versioning.md scrubbed of LLAMA_VERSION
    and llamaServer references.
    - Sweep: removed dead stopLlamaServer import in routes/comfy.js, swapped
    'llm' JSDoc example in routes/logger.js to 'comfy', stripped Q3 +
    version-bump steps from .claude/skills/mpi-version-bump.md.
    - Rule edits (with user approval): .claude/rules/comfy_engine.md,
    component-state.md, component-mounts.md scrubbed of LLaMA/Ollama drift.
    - Physical: deleted llama_engine/ (545 MB) + llama_models/ (7.2 GB).
    .gitignore defensive entries kept.
    - Dependency hygiene: npm audit fix resolved 4 vulns (1 high axios,
    3 moderate brace-expansion/follow-redirects/uuid). 0 vulnerabilities now.
    
    Verification: lint 0 errors (29 pre-existing warnings unchanged), server
    boots clean on :3000, /engine/status + /comfy/status return Comfy-only
    responses, /llm/* returns 404 (route gone). UI run + smoke:app deferred
    to user discretion.
    
    Residual references are intentional: packaging exclusions, .gitignore
    defensive entries, historical docs/plans/**, false-positive substrings
    (installedAllModels, MpiModelsModal, fullMessage, shellMarginTop).
    ```

### Cubric Vision foundation

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed/closed 2026-05-21.
    
    Plan file: docs/plans/2026-05-19-cubric-vision-foundation.md
    
    Outcome: foundation decisions are closed. Completed children/work:
    brand-identity, app-rename, ecosystem-backend, connector-broker-stage-1-2,
    shared-component-system, artifact-handoff-project-portability,
    model-resource-registry, Cubric Vision connector manifest stub, and
    @cubric/connector Stage 0 MVP at C:\AI\Mpi\Cubric-Studio\packages\connector\.
    
    Deferred out of this umbrella:
    - Website/subdomain/docs/social work waits until app implementation, hub
    readiness, and cross-platform portable distribution are ready/tested.
    - Release-readiness copy/audit runs near release.
    - LTX 2.3 and new workflows/features happen after release.
    - Cubric Prompt starts only after Cubric Vision is mature enough to move
    from alpha toward v1.
    ```

### Cubric Vision foundation - artifact-handoff-project-portability

  - tags: [PLAN, architecture, portability, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed (decision) 2026-05-21.
    
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-artifact-handoff-project-portability.md
    
    Outcome: selected media handoff uses CubricArtifactRef; broader
    context/templates use CubricProjectRef plus the portable project folder.
    Sidecars already cover the needed future-app metadata. Artifact ids remain
    project-local; no global artifact id and no Cubric Vision runtime connector
    implementation in this phase.
    ```

### Cubric Vision foundation - model-resource-registry

  - tags: [PLAN, architecture, models, deferred]
  - priority: low
  - defaultExpanded: false
    ```md
    Completed (decision) 2026-05-21.
    
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-model-resource-registry.md
    
    Outcome: no Cubric Vision v1 implementation. Future shared model/resource
    registry, if needed, is hub-owned and descriptive only: local resource roots,
    model/resource files, compatibility, hash/version/status. It is not a shared
    settings store, does not centralize model selection, and does not force apps
    to share one engine environment.
    ```

### Cubric Vision foundation - shared-component-system

  - tags: [PLAN, architecture, typescript]
  - priority: medium
  - defaultExpanded: false
    ```md
    Completed (decision) 2026-05-21.
    
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-shared-component-system.md
    
    Outcome: share the Stage visual contract, not Cubric Vision's JavaScript
    component runtime. Vision's ComponentFactory system stays Vision-local.
    Future TypeScript apps should build native UI using the Stage tokens/design
    rules; a tiny hub-owned tokens/primitives package can be planned later only
    if a real future app needs it.
    ```

### Cubric Vision foundation - connector-broker-stage-1-2

  - tags: [IMPL, architecture, typescript, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Shipped 2026-05-21.
    
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md
    Brief: docs/plans/2026-05-21-connector-broker-stage-1-2-implementation-brief.md
    
    Target repo: C:\AI\Mpi\Cubric-Studio\ (NOT a git repo yet — flag for
    later git init follow-up).
    
    Delivered:
    - packages/connector transport layer: src/transport/{frame,
    localEndpoint, localConnection}.ts + src/brokerClient.ts +
    public exports in src/index.ts.
    - packages/broker (new): token, connectionMetadata, handshake,
    router, brokerServer, endpoint, cli, index. Bin: `cubric-broker`.
    
    Tests: 56/56 green.
    - connector: 36 (frame 8, brokerClient 2, schemas 16, mockClient 10)
    - broker: 20 (metadata 9, handshake 7, integration 4)
    Integration test runs in-process broker + real SDK client over UDS
    (POSIX) / named pipe (Windows), covers HELLO/READY happy path,
    DISCOVER_APPS, LIST_CAPABILITIES, REQUEST_CAPABILITY →
    CAPABILITY_UNSUPPORTED, shutdown metadata cleanup, untrusted-app
    PERMISSION_DENIED.
    
    Acceptance: all criteria met. No Electron, no Cubric Vision runtime
    changes, Stage 3+ (ensureBroker, registry persistence, perm UI, scan
    /import) deferred as scoped.
    
    Follow-ups (NEW kanban entries as work surfaces):
    - git init the hub repo + workspace tooling.
    - True spawn-based integration test (cli.ts is ready; current
    integration uses in-process server).
    - Stage 3 plan.
    ```

### Cubric Vision foundation - ecosystem-backend

  - tags: [PLAN, architecture, typescript, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed (planning) 2026-05-21.
    
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md
    
    All 5 phases locked. Final two opens closed today:
    - Phase 2 capability vocabulary finalized — action-based dotted ids
    (prompt.enhance, prompt.translate, prompt.format.model, asset.import,
    asset.export, project.context.read); provider app id carried separately.
    - Phase 3 UUID rules aligned — itemId is project-local (scoped by
    projectId + sidecarRelativePath); cross-app identity requires a future
    explicit globalArtifactId field.
    
    Stage 0 SDK shipped at C:\AI\Mpi\Cubric-Studio\packages\connector
    (memory: project_connector_sdk_mvp.md). Cubric Vision v1 unblocked —
    manifest-only stub at resources/cubric/connector-manifest.json.
    
    Broker/runtime implementation continues in
    docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md.
    ```

### Cubric Vision foundation - app-rename

  - tags: [PLAN, brand, rename]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed 2026-05-20.
    
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Consumed: docs/plans/2026-05-19-cubric-vision-foundation-brand-identity.md
    (sign-off in its Phase 5; full inventory in Phase 3 sections 3.A–3.G;
    release-blocking set in Phase 4).
    
    Shipped:
    - App repo: package.json name/description, electron-builder productName/
    appId, Start.bat, index.html title/meta/alt/hero, APP_NAME constants
    (cjs+esm twins), User-Agent header, MpiAbout alt, MpiNewProject hint,
    projectUI version label, routes/shared.js getProjectsRoot path
    (Cubric Studio → Cubric Vision, no migration shim per user OK).
    - Lettering: assets/lettering.png + media/assets/Lettering.png deleted.
    Russo One 400 self-hosted at assets/fonts/RussoOne-Regular.woff2.
    `.mpi-wordmark` BEM in styles/shell/titlebar.css; titlebar variant
    .mpi-wordmark--titlebar (12px). index.html titlebar + MpiAbout swapped
    to live-text spans. --font-wordmark token now Russo One.
    - Accent: --accent-heat swapped to rose lift oklch(0.76 0.17 355).
    Hardcoded oklch(0.72 0.20 6) sweep across 15 files (CSS + canvas JS).
    - Mascot: assets/mascot/{logo,idle,greet,happy}.png from external
    Vision-*.png crops. 4 legacy mascot{,-arms,-hi,-ho}.png deleted.
    Code refs swapped (MpiGroupHistoryBlock x3, projectUI, MpiStartingComfy).
    - Cleanup: media/assets/ (comfy_robot_engine* + logo.{png,psd} + PSDs)
    all deleted; dual-tree rule retired for Vision repo.
    - Icon: build/icon.png + favicon.png swapped to Vision head crop.
    - GitHub: dev repo Cubric-Studio-Dev → Cubric-Vision-Dev; public
    Cubric-Studio → Cubric-Vision (user). origin remote updated.
    - Website (c:\AI\Mpi\Cubric Studio (Website)\): 8 GitHub URL fixes +
    1 GitHub API URL fix in scripts/landing.js + 3 Patreon URL fixes +
    CTA "Get Cubric Studio" → "Get Cubric Vision" + footer copyright.
    Website push gate still applies — NOT pushed.
    - Docs (c:\AI\Mpi\Cubric Studio (Docs)\): GitHub + Patreon URL fixes
    in index.html. Title/lettering/home links kept (docs site IS hub).
    - Bug fix: listProjects catch branch now shows friendly empty-state
    mascot + "No projects yet" copy instead of "Could not load projects".
    - Rule edits (.claude/rules/components.md): Stage design baseline now
    lists Russo One wordmark + .mpi-wordmark BEM + canonical 4-mascot
    state set + accent-heat rose-lift value.
    - Memory: feedback_dual_asset_tree updated to RETIRED; new
    feedback_lettering_wordmark + feedback_mascot_state_set +
    project_app_rename_complete.
    
    Out of scope (deferred):
    - HuggingFace org (locked keep).
    - Website ecosystem-landing rewrite (separate plan + new "Vision
    subdomain content" backlog entry).
    - Docs IA rewrite (separate "Cubric Studio Docs subdomain" backlog).
    - Future hub repo creation.
    - External brand-assets folder migration.
    - Server log capture bug (new BACKLOG entry).
    
    Lint clean (0 errors). User-verified visually: titlebar wordmark,
    About panel, accent rose lift, mascot. Project create + generate
    confirmed working after restart.
    ```

### Cubric Vision foundation - brand-identity

  - tags: [PLAN, brand, design]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed 2026-05-19.
    
    Plan file: docs/plans/2026-05-19-cubric-vision-foundation-brand-identity.md
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    
    Outcome: planning + decisions + inventory only — no code rename was done
    in this entry. All five phases of the child plan are checked off:
    1. Naming Lock — ecosystem term "Cubric ecosystem"; hub = Cubric Studio
    (not an app in v1); app ids dotted (cubric.vision); package/FS kebab;
    subdomains under cubric.studio.
    2. Mascot Scope — ecosystem operator family; three states idle/greet/happy;
    Vision v1 ships Vision mascot only; external folder = master library.
    3. Asset + Text Inventory — sections 3.A–3.G cover app + Website + Docs
    + external folder. Every row classified rename/replace/defer/keep and
    bucketed release-blocking vs non-blocking.
    4. Release-Blocking Scope Cut — v1 minimum set + non-blocking polish set
    + explicitly deferred items enumerated.
    5. Sign-Off Artifact — one-page authoritative decision summary; parent
    plan Phase 1 checkboxes updated.
    
    Lettering lock: Russo One 400 replaces lettering.png; "Cubric" in ink-1
    + app suffix in accent color; UI font stack unchanged.
    Patreon: -> patreon.com/madponyinteractive.
    GitHub: MadPonyInteractive/Cubric-Studio -> Cubric-Vision (public);
    Cubric-Studio name reserved for future hub repo.
    HuggingFace: cubric-studio org stays (ecosystem hub).
    Asset tree: dual-tree retired for Vision repo; flat assets/mascot/ with
    logo.png + idle.png + greet.png + happy.png.
    
    Execution follow-up: "Cubric Vision foundation - app-rename" in BACKLOG
    consumes this inventory and executes the rename + asset swap + URL fixes
    across app + Website + Docs.
    ```

### Mascot + logo + lettering recolor ported across all surfaces

  - tags: [design, brand, assets]
  - priority: medium
  - defaultExpanded: false
    ```md
    Recolored PNGs (Photoshop pass per docs/redesign/RECOLOR.md) landed in app
    media/assets/ and synced to siblings. App is canonical source.
    
    Synced files (hash-verified):
    - CubricStudio_Redesign/assets/: 6 files (Lettering, comfy_robot_engine*, logo)
    + CubricStudio_Redesign/logo.png (root copy).
    - Cubric Studio (Website)/assets/: logo.png + comfy_robot_engine{,_arms,_hi,_ho}.png.
    - Cubric Studio (Docs)/assets/: logo.png + renamed mascots:
    comfy_robot_engine      -> mascot_idle
    comfy_robot_engine_arms -> mascot_success
    comfy_robot_engine_hi   -> mascot_happy
    comfy_robot_engine_ho   -> mascot_surprised
    
    Lettering.png not referenced by Website/Docs HTML — skipped there.
    
    Follow-up: Website + Docs are separate git repos; commit + push from each.
    Website push still gated on app-downloadable per project_website_push_gate.md.
    ```

### Tool-options polish — crop redesign + radio primitive + video tool persistence

  - tags: [chore, tool-options, persistence]
  - priority: medium
  - defaultExpanded: false
    ```md
    - Crop tool: dropdown → MpiRadioGroup family selector; ratio popup → inline
    stacked-icon radio (1:1 featured + 4-col grid); section labels;
    orientation/family index-mirrored label swap; persistence under
    toolSettings.crop {family,orientation,label}.
    - MpiRadioGroup extended with labelPosition (right|top), size (sm|md|lg),
    columns (grid), featuredFirst (full-width first cell). Reused everywhere.
    - Video Upscale: popup → MpiRadioGroup factor; model dropdown moved on top,
    direction:'down' fix; persistence under toolSettings.videoUpscale.
    - Video Interpolate: popup → MpiRadioGroup multiplier; persistence under
    toolSettings.videoInterpolate.
    - projectModel.js: getToolSettings default {}, setToolSettings strips
    legacy upscaleModel:null noise on every write.
    - SOCIAL_RATIOS reordered so 1:1 is first.
    ```

### Port Stage redesign → Cubric Studio Docs

  - tags: [PLAN, design, product]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-05-16-port-stage-to-docs.md
    Target repo: c:\AI\Mpi\Cubric Studio (Docs)\ (pushed to origin/main @ a2647b8)
    Shipped: tokens.css NEW, base.css + docs.css rewrite, router.js rewrite,
    toc.js NEW (scroll-spy), all 8 pages restyled with kicker eyebrows,
    mascot kept to home only, hotkey table → docs-table + kbd primitives.
    Stage exception (sidebar nav-link active border-left) documented in code.
    Verified: 8 routes navigate, zero console errors, banned-token grep clean.
    Follow-up tracked in backlog entry "Cubric Studio Docs subdomain + finish docs site".
    ```

### Video workspace trim + split controls

  - tags: [feature, video]
  - priority: high
  - defaultExpanded: false

### Port Stage redesign → Cubric Studio Website

  - tags: [PLAN, design, brand]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-05-16-port-stage-to-website.md
    Target repo: c:\AI\Mpi\Cubric Studio (Website)\ (separate git)
    Register: brand · Color strategy: Drenched mauve
    Spec: docs\redesign\PRODUCT.md, DESIGN.md, c-stage\landing.html
    Driver: $impeccable shape (gate passed)
    Scope: single-page marketing site rewrite — tokens.css NEW, landing.css rewrite,
    index.html rewrite, shaderBackground.js DELETE. Sharp corners, OKLCH tokens,
    asymmetric strips, no gradient-text outside wordmark, no card-grid features.
    
    2026-05-23 follow-up pass (implemented):
    - Main landing Vision-link accent pass (all Vision destinations in rose accent).
    - Cubric apps row: per-app mascots + app-specific accent titles/preview links.
    - Vision page: local-library cards corrected to match actual app behavior.
    - Vision features expanded/reordered (10 items) and hardware requirements corrected.
    - FAQ added, expanded, redesigned, and moved to bottom section.
    - Hero/header spacing adjusted on Vision page.
    - Remaining follow-up moved to BACKLOG: "Website final media swap pass".
    ```

  - tags: [feature, video]
  - priority: high
  - defaultExpanded: false

### Port Stage redesign → Cubric Studio Website

  - tags: [PLAN, design, brand]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-05-16-port-stage-to-website.md
    Target repo: c:\AI\Mpi\Cubric Studio (Website)\ (separate git)
    Register: brand · Color strategy: Drenched mauve
    Spec: docs\redesign\PRODUCT.md, DESIGN.md, c-stage\landing.html
    Driver: $impeccable shape (gate passed)
    Scope: single-page marketing site rewrite — tokens.css NEW, landing.css rewrite,
    index.html rewrite, shaderBackground.js DELETE. Sharp corners, OKLCH tokens,
    asymmetric strips, no gradient-text outside wordmark, no card-grid features.
    
    2026-05-23 follow-up pass (implemented):
    - Main landing Vision-link accent pass (all Vision destinations in rose accent).
    - Cubric apps row: per-app mascots + app-specific accent titles/preview links.
    - Vision page: local-library cards corrected to match actual app behavior.
    - Vision features expanded/reordered (10 items) and hardware requirements corrected.
    - FAQ added, expanded, redesigned, and moved to bottom section.
    - Hero/header spacing adjusted on Vision page.
    - Remaining follow-up moved to BACKLOG: "Website final media swap pass".
    ```

  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-05-16-port-stage-to-website.md
    Target repo: c:\AI\Mpi\Cubric Studio (Website)\ (separate git)
    Register: brand · Color strategy: Drenched mauve
    Spec: docs\redesign\PRODUCT.md, DESIGN.md, c-stage\landing.html
    Driver: $impeccable shape (gate passed)
    Scope: single-page marketing site rewrite — tokens.css NEW, landing.css rewrite,
    index.html rewrite, shaderBackground.js DELETE. Sharp corners, OKLCH tokens,
    asymmetric strips, no gradient-text outside wordmark, no card-grid features.
    
    2026-05-23 follow-up pass (implemented):
    - Main landing Vision-link accent pass (all Vision destinations in rose accent).
    - Cubric apps row: per-app mascots + app-specific accent titles/preview links.
    - Vision page: local-library cards corrected to match actual app behavior.
    - Vision features expanded/reordered (10 items) and hardware requirements corrected.
    - FAQ added, expanded, redesigned, and moved to bottom section.
    - Hero/header spacing adjusted on Vision page.
    - Remaining follow-up moved to BACKLOG: "Website final media swap pass".
    ```

    Driver: $impeccable shape (gate passed)
    Scope: single-page marketing site rewrite — tokens.css NEW, landing.css rewrite,
    index.html rewrite, shaderBackground.js DELETE. Sharp corners, OKLCH tokens,
    asymmetric strips, no gradient-text outside wordmark, no card-grid features.
    
    2026-05-23 follow-up pass (implemented):
    - Main landing Vision-link accent pass (all Vision destinations in rose accent).
    - Cubric apps row: per-app mascots + app-specific accent titles/preview links.
    - Vision page: local-library cards corrected to match actual app behavior.
    - Vision features expanded/reordered (10 items) and hardware requirements corrected.
    - FAQ added, expanded, redesigned, and moved to bottom section.
    - Hero/header spacing adjusted on Vision page.
    - Remaining follow-up moved to BACKLOG: "Website final media swap pass".
    ```

    - Cubric apps row: per-app mascots + app-specific accent titles/preview links.
    - Vision page: local-library cards corrected to match actual app behavior.
    - Vision features expanded/reordered (10 items) and hardware requirements corrected.
    - FAQ added, expanded, redesigned, and moved to bottom section.
    - Hero/header spacing adjusted on Vision page.
    - Remaining follow-up moved to BACKLOG: "Website final media swap pass".
    ```

    - Hero/header spacing adjusted on Vision page.
    - Remaining follow-up moved to BACKLOG: "Website final media swap pass".
    ```
