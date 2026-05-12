## BACKLOG

### LTX 2.3 video model integration

  - tags: [PLAN, video]
  - priority: medium
  - defaultExpanded: true
    ```md
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
  - defaultExpanded: true
    ```md
    - Use Patreon users images for the landing page on each version.
    ```

### Additive model folders in settings

  - tags: [Idea]
  - priority: low
  - defaultExpanded: true
    ```md
    - Explore adding to settings additive folders for models.
    ```

### Trim tool

  - tags: [feature]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Add trim tool to video workspace.
    Use redesign mock-up as a guide for a visual identity.
    ```

### Port redesign to Cubric Studio website

  - tags: [feature, design]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Port new design from `c:\AI\Mpi\CubricStudio_Redesign\` to `c:\AI\Mpi\Cubric Studio (Website)\`.
    - Single-page marketing site. Apply OKLCH tokens, Stage component primitives, mascot/logo recolor per RECOLOR.md.
    - Reference spec: `docs/redesign/PRODUCT.md`, `DESIGN.md`, `c-stage/landing.html`.
    - Separate git repo — commit independently.
    ```

### Port redesign to Cubric Studio documentation site

  - tags: [feature, design]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Port new design from `c:\AI\Mpi\CubricStudio_Redesign\` to `c:\AI\Mpi\Cubric Studio (Docs)\`.
    - Documentation website. Apply OKLCH tokens, Stage component primitives, doc-appropriate type scale.
    - Reference spec: `docs/redesign/PRODUCT.md`, `DESIGN.md`.
    - Separate git repo — commit independently.
    ```

### Continue from last frame.

  - tags: [Feature]
  - priority: medium
  - workload: Hard
  - defaultExpanded: false
    ```md
    In the video history workspace, we are going to implement a feature so that the user can continue from the last frame and that creates a new video with the previous video + the generated video after. The last frame can be extracted from the last frame of the current video and injected in an image-to-video workflow displaying the prompt box. Please let the user know about the implementation briefing and concerns, and how this is supposed to happen. If it's a new PromptBoxControls.js, if it's a new tool, brainstorm with the user use cases of how to implement this.
    ```

### Media Gallery Buggy Behavior

  - tags: [Bug]
  - priority: high
  - workload: Hard
  - defaultExpanded: false
    ```md
    Scrolling the Media Gallery with the mouse wheel creates snapping motion and flickering of the cards. Changing the size of the grid flickers all the cards to a gray background and only then displays the cards' content. In some cases, depending on the window size and the cards that are in the gallery, the gallery size starts flickering and doesn't stop until there's a window size change or the gallery zooms in and out constantly. Overall, the gallery seems quite buggy and cannot ship like this.  Suggestion: add the console log to refresh or rehydrate functions to see how much and how many times it's getting refreshed. There might be something that is causing this and needs to be addressed.
    ```

## PLANNING

### Cross-platform portable distribution

  - tags: [PLAN]
  - priority: medium
  - defaultExpanded: true
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
    ```

### Madpony Patreon Revamp (User Action)

  - tags: [PLAN]
  - priority: low
  - workload: Easy
  - defaultExpanded: true
    ```md
    Plan File: docs\plans\2026-04-28-madpony-patreon-revamp.md
    ```

## IMPLEMENTING

## COMPLETED

### Gallery preview-card polish + filter set + window min size + landing title

  - tags: [ux, gallery, window]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
    ```md
    Session 2026-05-12: misc UI polish.
    - Preview cards: un-suppressed heart + reuse icons (CSS `display:none` block removed). Re-stacked top-right column: PREVIEW badge → stage2 → assets → fav (top:5.4rem) → reuse (top:7.3rem). Existing event wiring re-shared with normal cards (no JS changes).
    - Gallery filter set extended: added `Previews` tab (filter = `g.history[selectedIndex].stage === 'preview'`); renamed `Favorites` UI label → `Favs` (sidecar field stays `favourite`, filter value stays `favorites`). New slot `data-filter="previews"` in tabs DOM.
    - Card hover scrim: `::before` swapped from top linear to full-card radial vignette (ellipse 75%×70%, transparent center → 0.35 → 0.75 at corners). `::after` bottom linear bumped 0.7→0.75. Side icons + corner badges now legible over bright images.
    - Electron window minWidth: 950, minHeight: 500 in main.js BrowserWindow ctor.
    - Project landing row title `h3` → `h4` at js/shell/projectUI.js:264 to keep long names from pushing the asset count outside the row (h4 uses smaller default size via styles/01_base.css h1..h6 rule).
    
    Files: js/components/Compounds/MpiGalleryGrid/{MpiGalleryGrid.js, MpiGalleryGrid.css}, js/state.js, main.js, js/shell/projectUI.js.
    Memory: feedback_landing_rows_shell_dom.md (new).
    ```

### Multi-stage workflow latents

  - tags: [PLAN]
  - priority: high
  - workload: Hard
  - defaultExpanded: false
  - steps:
      - [x] Persist preview support assets
      - [x] Branch Continue + Finish from stage-2 workflow
      - [x] Missing assets and fallback
      - [x] Documentation and rules sync
    ```md
    Plan file: docs/plans/2026-05-11-multi-stage-workflow-latents.md

    Multi-stage video preview cards now durable + reusable for both T2V and
    I2V. Step 1: preview-stage saves project latent under
    `Media/.latents/<id>.latent`; I2V also snapshots Start_Frame/End_Frame
    into `Media/.preview-assets/<id>/`. Step 2 pivoted from runtime
    `Is_Continue` gating to a two-file workflow convention
    (`<name>.json` + `<name>_stage2.json`); stage-2 file authored in ComfyUI
    by toggling stage-1 KSampler to Bypass + Save (API); app swaps filename
    via `commandExecutor._toStage2Filename` when `payload.isStage2 === true`.
    Preview card gained Continue (branching — NEW card, gated by per-op
    `allowsBranchingContinue`) + Finish (replaces preview via
    `replaceItemId`). `Is_Continue` injection dropped everywhere.

    Step 3 (2026-05-12): added preview-asset validation + cold fallback.
    `GET /project-media/:projectId/validate-preview-assets` stats latent +
    snapshots, returns canFastPath/canColdFallback/blocked. Gallery card
    shows amber "Cold" badge when latent missing but frozenParams +
    snapshots present (Continue reruns stage-1 in place then auto-fires
    stage-2; Finish runs full _ms with previewOnly=false + replaceItemId as
    single submission), red "Missing" badge when blocked (Continue/Finish
    hidden, user deletes preview). Click-time re-validation closes TOCTOU
    window. Preview card selection bug fixed — shift/ctrl/right-click now
    work like any other card; only "open into history" suppressed.
    `copySnapshotSource` got same-path guard so cold-fallback stage-1
    rerun reading its own materialized snapshot doesn't error.

    Step 4: docs + rules synced — `.claude/rules/comfy_injection.md`,
    `.claude/rules/component-comfy.md`, `.claude/rules/component-events.md`,
    `docs/project-integrity.md`, `docs/comfy.md` (WAN baked-vs-live LoRA
    note + cold-fallback caveat).
    ```

### Resize tool

  - tags: [PLAN]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
  - steps:
      - [x] Foundation workflow dependency executor
      - [x] Tool UI organism color picker
      - [x] Live preview Apply
      - [x] Video workspace support
      - [x] Docs rules follow-up
    ```md
    Plan file: docs/plans/2026-05-11-resize-tool.md
    
    Universal resize tool shipped for both image and video workspaces.
    Live preview pivoted from canvas-resident to thumbnail-based: 512px-
    longest-edge thumbnail extracted from `viewer.el.getSourceElement()`,
    submitted via `runCommand({ previewOnly: true,
    suppressLifecycleEvents: true })` against the image `resize` workflow
    with proportionally-scaled W/H/divisible_by. Result paints into an
    inline preview slot inside `MpiToolOptionsResize` — viewer canvas/
    video stays untouched. Apply emits `{ params }` and the block always
    re-runs the workflow at full resolution via `startGeneration`
    (`resize` for image, `resizeVideo` for video). Append-only — never
    replaces the source. New `js/utils/thumbnail.js` provides
    `extractThumbnail` + `waitForVideoFrame({ awaitNextLoad })` so video
    sources don't sample stale frames after src swap. Phase 3
    `MpiCanvas.setPreviewImage`/`MpiCanvasViewer.enterResizeMode` API
    deleted. `commandExecutor` gained `suppressLifecycleEvents` payload
    flag; multi-stage `_ms` previews still fire StatusBar lifecycle
    events as before. Mascot gated via `operation` field on
    `generation:started` (added to `activeGenerations.start` emit).
    Phase 5.3 (follow-up "Tool panel UI refresh — Stage mockup match"
    kanban entry) intentionally skipped.
    ```

### Introduce video compared tool

  - tags: [Feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Compare overlay now supports image+image (existing), image+video, video+image,
    and video+video pairs. Pair playback driven by hotkeys only (no on-screen
    transport): space play/pause both, ←/→ frame step (clamps at ends, no wrap),
    L toggle loop (default on). Both sides start t=0; on either reaching the
    shorter duration both pause+seek 0 and replay if loop on. Frame step uses
    per-side fps from sidecar `videoMeta.fps` (mixed fps handled). Pan/zoom/
    letterbox/slider inherited from existing image-compare canvas pipeline.
    
    MpiCanvas API additions: loadVideo, loadComparisonVideo, playCompare,
    pauseCompare, togglePlayCompare, frameStepCompare, setCompareLoop,
    getCompareLoop, isCompareVideoPair. ComparisonManager extended for
    type-agnostic after-media with afterWidth/afterHeight accessors.
    
    MpiGroupHistoryBlock lazy-mounts MpiCompareOverlay when a video group's
    2-item selection compare is requested (parallel to MpiGalleryBlock); drops
    the `|| isVideo` gate on compare-requested. Gallery path needed no change —
    it already routes through MpiCompareOverlay.open which now branches by
    mediaType internally.
    
    Hotkey registry: new `compare.*` category (space/←/→/L). MpiHelp gets a
    new "Compare" group.
    
    Edge cases handled (memory entries written):
    - HTMLVideoElement has no .width property — paint gates now use
    ComparisonManager.afterWidth accessor.
    - drawImage(video) is transparent until loadeddata + currentTime=0 nudge.
    - Chromium coalesces rapid currentTime= writes — `_pendingSeekTime` per
    video keeps frame-step presses additive.
    - Auto-loop replay gated on user-play intent flag, not `isPlaying()` at
    moment of `ended` (browser pauses before `ended` fires).
    - MpiCanvas `this.img` must remain HTMLImageElement — loadImage resets to
    fresh Image() if a prior loadVideo replaced it; `_renderBase` hardened
    with an `_isDrawable(src)` typeguard.
    
    Files: js/components/Primitives/MpiCanvas/MpiCanvas.js,
    js/components/Primitives/MpiCanvas/managers/ComparisonManager.js,
    js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js,
    js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js,
    js/managers/hotkeyRegistry.js,
    js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js.
    
    Memory: feedback_video_element_no_width, feedback_video_first_frame_paint,
    feedback_chromium_seek_coalescing, feedback_compare_loop_user_intent,
    feedback_mpicanvas_img_must_stay_image (new).
    ```

### Standalone quality control + popup width cap + Preview_Only op gate

  - tags: [feature, bug, ux]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    Three related changes to the PromptBox settings popup and the video generation path.
    
    1. Quality picker split out of the ratio popup.
    - New `quality` variant in `MpiOptionSelector` — standalone inline radio row, no trigger button, no popup. Renders "Quality" label above `Very Low … Very High` radio.
    - New `qualityTier` entry in `PromptBoxControls`. Renders only when `RATIO_MODES[modelType] === 'quality'` (today `wan`; `ltx` future). Persists to `modelSettings[modelId].ratioSelector.qualityTier` (shared key with the `ratio` control).
    - Cross-control sync via `Events.emit('ratio:quality-change', { modelId, qualityTier })`. The `ratio` control filters by modelId then calls its new `el.setQualityTier(tier)` API to re-render its ratio set in place.
    - Ratio popup loses its embedded `QUALITY` header + speed radio. `quality_change` event removed.
    - Video op `components[]` reordered: `qualityTier` → `duration` → `motionIntensity` → `ratio` → `previewStage`. Image ops unchanged.
    - PromptBoxControls `ratio` entry now has a `destroy()` that drops its `ratio:quality-change` subscription.
    
    2. Settings popup width cap.
    - `.mpi-prompt-box__settings { width: 355px; max-width: 90vw; }`. Breaks the circular sizing between `MpiPopup` (`width: max-content`) and inner primitives (`.mpi-dropdown`, `.mpi-progress`) that default to `width: 100%`. Primitives untouched — they still stretch correctly inside the cap.
    
    3. `Preview_Only` injection op-gated.
    - `commandExecutor._buildParams` now injects `Preview_Only` ONLY when `payload.operation.endsWith('_ms')`. Previously a stale `previewStage` toggle from a prior `_ms` op leaked into single-stage workflows (text-to-image silently broke). Per-model persistence is preserved.
    
    Side fixes shipped in same session:
    - PromptBox `#prompt-box-mount` gets `position: relative; z-index: 40` + `.mpi-prompt-box-media-strip { z-index: 1 }`. Media strip now paints above the gallery sticky "Generating…" card (z-10) and below drop overlays (z-50), modals (z-10009), toasts (z-20000). Chips also got a 3px `--accent-heat` border so they don't blend into gallery thumbs.
    - Ratio popup grid right-aligns its picks (`mpi-opt-sel__grid--ratio` modifier — `.mpi-opt-sel--ratio` ancestor rule didn't match post-portal).
    - `_refreshOpSlot` mount loop wrapped in try/catch with `clientLogger.error` — a single failing control no longer blocks subsequent ones.
    - Op-dropdown info copy updated to "Current model operation - Also accessible by holding Tab".
    
    Files: js/components/Compounds/MpiOptionSelector/{MpiOptionSelector.js,MpiOptionSelector.css}, js/components/Organisms/MpiPromptBox/{MpiPromptBox.js,MpiPromptBox.css,PromptBoxControls.js}, js/data/commandRegistry.js, js/services/commandExecutor.js.
    
    Rule files: .claude/rules/component-comfy.md, .claude/rules/component-events.md, .claude/rules/component-mounts.md, .claude/rules/component-state.md.
    
    Memory: feedback_mpipopup_max_content_loop.md, feedback_preview_only_op_gated.md, feedback_promptbox_mount_stacking.md (new).
    ```

### Gallery drag duplicate + multi-file drop fill PromptBox slots

  - tags: [Bug, gallery]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    Two fixes shipped together:
    - Duplicate card on drag round-trip — root cause: PromptBox media chips were
    using default browser draggable (img element). Dragging a chip onto the
    gallery grid triggered the OS-file drop overlay (browser synthesizes a
    Files entry from the dragged image), which re-uploaded the same file as
    a new sidecar. Fixed by `draggable=false` on chip img/video + chip-level
    dragstart preventDefault belt+suspenders.
    - Multi-file drop on the gallery — MpiMediaDropOverlay only handled
    `files[0]`. Now passes the full file list to onDrop. Gallery uses
    `_pb.el.remainingCapacity(mediaType)` to inject the first N files
    (where N = free PromptBox slots for that op) into the PromptBox media
    strip; overflow files still create gallery cards but are not pushed
    into the slots. MpiGroupHistoryBlock updated to the new payload too.
    Files: MpiPromptBox.js, MpiMediaDropOverlay.js, MpiGalleryBlock.js,
    MpiGroupHistoryBlock.js
    ```

### Video player polish + workspace hotkeys

  - tags: [task, video, hotkeys]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
    ```md
    Cleaned MpiVideoPlayer chrome and added a video-workspace-only hotkey set.
    - Removed the centered "big play" overlay (template + CSS) and dropped the unused renderIcon import.
    - Sharp corners: `border-radius: var(--r-3)` → `0` on `.mpi-video-player`; ornamental `box-shadow` removed (Stage baseline = solid surfaces, sharp corners).
    - Loop default ON: template default `loop !== false`; loop button forced active class on mount.
    - Six new entries in `js/managers/hotkeyRegistry.js` under category `video` (all `allowWhileTyping: false`):
    `video.playPause` (space), `video.frame.back/forward` (arrowleft/right), `video.volume.up/down` (arrowup/down, ±10%), `video.loop` (l).
    - Bound inside `MpiVideoPlayer.setup` so they auto-clean via `_unsubs` on destroy — no leak into image workspace. `space` does not collide because `canvas.pan.*` only binds inside MpiCanvas.
    - Help slide-over: new "Video Player" group added in `MpiHelp.js` before the System block.
    Files: js/components/Compounds/MpiVideoPlayer/{MpiVideoPlayer.js,MpiVideoPlayer.css}, js/managers/hotkeyRegistry.js, js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js.
    ```

### Workflow operations not updating when image is present.

  - tags: [Bug]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    Switching models with media in the PromptBox now respects the media context. Root cause: `MpiPromptBox.setModel`/`setModelList` never reconciled `activeOperation` against current media, and both Block-side `model-change` listeners force-reset op to `model.supportedOps[0]`.
    
    Fix:
    - Added `_pickOpForModel(candidate)` in `MpiPromptBox.js` that uses `el.imageCount`/`videoCount` + `_context` to keep the current op when it still fits, otherwise picks first media-compatible supported op (preferring `available`), falling back to text-only when no media is present.
    - `setModel` and `setModelList` now route through `setOperation(picked)` so `operation-change` is emitted (avoids stranded listeners per `feedback_instance_api_silent_emit`).
    - `MpiGalleryBlock` + `MpiGroupHistoryBlock` `model-change` listeners no longer overwrite the picked op — they only force-reset if the current op is genuinely unsupported by the new model.
    ```

### Cue + Loop refactor — drop Single/Queue/Auto-loop tri-mode

  - tags: [feature, refactor]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Replaced three-mode generation flow with always-Cue + `state.loopArmed` boolean. There is no Single mode; queue is the only execution path. Loop is a flag layered on top — toggled by holding the Cue button ≥700ms (cyan color sweep over pink) or `Ctrl+L`. Tap-while-armed disarms. Hold-while-armed is a no-op. Loop re-fire integrated into `generationService._dispatchNextCue` empty-queue branch via `_lastJobForLoop.callbacks.getNextGeneration()`; re-fires on complete, cancel, AND error. Stop interrupts current job; loop continues. New hotkey `generation.loop` (Ctrl+L). Help overlay row added.
    Removed: `state.generationMode`, `_activeLoops` Map, `stopAutoLoop`/`stopAllAutoLoops` exports, `generationMode` PromptBoxControls entry, `'generationMode'` from 6 ops in commandRegistry, `FLOW_CONTROL_IDS`/`flowSlot`/`#settings-flow-slot` in PromptBox, mode-switch failsafe block in `_refreshOpSlot`, force-`'queue'` writes in GalleryBlock + GroupHistoryBlock.
    Label rules: `Cue` / `Cue xN` (N>0) / `Loop` (armed, depth<=1) / `Loop xN` (armed, depth>=2). Visual: pink Cue idle → cyan sweep L→R during 700ms hold → cyan armed steady.
    Files: js/state.js, js/services/generationService.js, js/managers/hotkeyRegistry.js, js/data/commandRegistry.js, js/components/Organisms/MpiPromptBox/{MpiPromptBox.js,MpiPromptBox.css,PromptBoxControls.js}, js/components/Blocks/{MpiGalleryBlock,MpiGroupHistoryBlock}, js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js, .claude/rules/{components,component-events,component-state,component-comfy}.md, docs/{PROJECT.md,comfy.md,plans/2026-05-09-queue-modes-run-hotkeys.md (superseded)}.
    Memory: feedback_loop_armed_hold_gesture.md (new); feedback_generationmode_failsafe.md (deleted).
    ```

### Queue Continue jobs on multi-stage previews

  - tags: [feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Multi-stage video ops (`t2v_ms`, `i2v_ms`) now expose `generationMode` so previews can be Cued. Continue button on a preview enqueues the final-pass job into the in-app Cue queue (no more "wait" toast). Card shows "Queued…" badge with a Cancel button while waiting; flips to "Generating final…" on its turn. Cue label `x{n}` reflects all queued jobs (regular cue + queued Continues). Cue Clear reverts every queued Continue card via fired `onCancel`. Continue auto-syncs PB to the preview's model + op when mismatched and forces `state.generationMode='queue'`. Improved toasts when source model is unknown/uninstalled.
    Files: js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js, js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.{js,css}, js/data/commandRegistry.js, js/services/{activeGenerations.js,generationService.js}, .claude/rules/{component-state.md,component-events.md}.
    ```

### Move toast to the left.

  - tags: [task]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
    ```md
    Toast anchored bottom-left. CSS swap `right: var(--s-4)` → `left: var(--s-4)` in MpiToast.css. Progress bar border-radius flipped to left-rounded so the visible anchor edge stays rounded as the bar shrinks. PromptBox-visible raise + stack offset variables untouched.
    File: js/components/Primitives/MpiToast/MpiToast.css.
    ```

### WAN dual-model + 12 LoRAs

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: true
  - steps:
      - [x] Per-stage LoRA settings upgrade
      - [x] Settings overlay 12 LoRAs
      - [x] Per-stage LoRA injection
      - [x] Docs and rules sync
    ```md
    Plan file: docs/plans/2026-05-09-wan-dual-model-12-loras-ltx.md
    ```

### Video preview-gate core

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: true
  - steps:
      - [x] Sidecar schema + in-memory parity for `stage` + `frozenParams`
      - [x] Inject `Preview_Only` boolean + new `t2v_ms`/`i2v_ms` ops
      - [x] PromptBox toggle: "Preview initial stage"
      - [x] Save preview output as `stage: 'preview'` + frozenParams
      - [x] Gallery card: PREVIEW badge + Continue / Discard buttons + click gate
      - [x] Continue handler: re-submit with frozen params, replace card on finalize
      - [x] Continue-while-busy behavior per generation mode
      - [x] Documentation + rule files sync
    ```md
    Plan file: docs/plans/2026-05-09-video-preview-gate-core.md
    ```

### Queue modes + run hotkeys

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: true
  - steps:
      - [x] Capture prompt_id + queue helpers
      - [x] Add session generationMode
      - [x] PromptBox dual-button layout
      - [x] Queue-aware submission + cancel
      - [x] Run/Stop hotkey bindings
      - [x] StatusBar queue depth indicator
      - [x] Sync rule files + docs
    ```md
    Plan file: docs/plans/2026-05-09-queue-modes-run-hotkeys.md
    ```

### History delete leaves no selected entry, prompt box missing

  - tags: [bug]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Deleting history entries left no card highlighted and PromptBox hidden.
    Root causes:
    1. `MpiHistoryList.el.removeEntries(indices)` rebuilt cards but never reset `_selectedIdx` — `_applyCardStates` toggled active on stale (now-invalid) idx.
    2. Block called `historyList.el.exitSelectMode()` pre-delete; instance API only cleared `_selection` Set silently — no `selection-exited` emit. Block's `selection-exited` listener (the only place that re-shows PromptBox after multi-select) never fired. PromptBox stayed hidden from the earlier `selection-changed` hide.
    Fix:
    - `removeEntries(indices, newSelectedIdx = 0)` clamps + sets `_selectedIdx`, anchors there, rebuilds.
    - Block delete handler passes `_currentIdx`, resets `_currentSelectionIndices = []`, clears compare, re-shows PromptBox if active mode is prompt.
    Files: js/components/Compounds/MpiHistoryList/MpiHistoryList.js, js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js.
    ```

### Project cards not displaying video

  - tags: [Bug]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Landing rows now render `<video preload=metadata muted loop playsInline>` when the most-recent Media entry is `.mp4`/`.webm`. First frame shows static; row mouseenter plays, mouseleave pauses + rewinds. Mirrors `MpiGalleryGrid._swapThumbToVideo` pattern — no new system.
    
    Server `/list-projects` returns sibling field `recentThumbnailType` ('image'|'video') derived from extension; existing `recentThumbnail` URL kept for back-compat.
    
    Files: routes/projects.js, js/shell/projectUI.js, styles/shell/landing.css.
    ```

### History entry naming + sidecar dimensions inconsistency

  - tags: [bug]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Root causes:
    1. `operation` field on hydrated items contained op key ("upscale"), but fresh in-session items overwrote it with sequenced filename ("upscale_001"). Result: same item displayed differently before vs after project reload.
    2. Operations without ratio control (upscale/detail/edit/change/remove) sent no Width/Height injection params → `pixelDimensions` saved as `{0,0}` in sidecar.
    
    Fix at root:
    - Sidecar gains `displayName` field (filename stem). `operation` keeps op key only. Card label uses `displayName || operation`.
    - save-generation route probes saved file via `sharp.metadata()` when client didn't supply dims, so dims always populated regardless of injection params.
    - History card now shows `WxH · Ns` (dot separator + rounded seconds) when `generationMs` present.
    - generationService, MpiCanvasViewer crop, reconciler synthetic items, projectModel defaults all updated to carry `displayName` + `generationMs`.
    
    Files: routes/projects.js, js/services/generationService.js, js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js, js/components/Compounds/MpiHistoryList/MpiHistoryList.js, js/data/projectModel.js, js/managers/projectReconciler.js.
    
    Pre-release: no schema migration; existing test sidecars stale, user deletes test project.
    ```

### Toast too low.

  - tags: [issue]
  - priority: medium
  - workload: Normal
  - defaultExpanded: true
    ```md
    Toast base positioning now uses CSS variables and raises the stack only when a visible PromptBox is mounted, keeping normal toast placement unchanged elsewhere.
    File: js/components/Primitives/MpiToast/MpiToast.css.
    ```

### When applying a crop, the crop box goes away.

  - tags: [Bug]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    - Let's make sure that the crop box stays until another tool is selected or a selection is made. 
    - Let's use this kanban entry also to update the looks of the crop box, as the handles still do not match the mock-up design. You may ask the user for a visual of how it should look.
    ```

### Status bar not updating correctly

  - tags: [issue]
  - priority: medium
  - workload: Normal
  - defaultExpanded: true
    ```md
    Fixed status bar timing so model initialization does not start elapsed generation time.
    Backend bridges ComfyUI terminal phase lines (`Model Initializing ...`, `Model Initialization complete!`) over `/comfy/events/stream`.
    commandExecutor starts `tool:sampling-start` on model-init-complete, preview, or real sampler progress; UltimateSDUpscale remains heuristic because it reports useful latent/progress late.
    Files: routes/comfy.js, js/services/commandExecutor.js, js/services/progressAggregator.js, js/services/generationService.js, docs/shell.md, .claude/rules/component-events.md, .claude/rules/comfy_engine.md.
    ```

### Pop-up menu in the prompt box

  - tags: [issue]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Settings popup closed when sub-popup (ratio orient toggle, ratio item, batch number) clicked.
    Cause: sub-popup click handlers in MpiOptionSelector rewrote `grid.innerHTML` / `trigger.innerHTML` synchronously, detaching `e.target` before parent (PromptBox settings) document-level outside-click listener ran on bubble. Parent's `e.target.closest('.mpi-popup')` exclusion walked detached node → null → parent treated as outside-click → closed.
    Fix at root: `e.stopPropagation()` at the top of every click/change handler on `popupEl` in MpiOptionSelector (ratio, number, buttons variants + speed radio). Sub-popup interactions never reach document-level listeners; mutation is irrelevant to parent.
    File: js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js.
    ```

### Full screen OS bar not hidden

  - tags: [bug]
  - priority: medium
  - defaultExpanded: true
    ```md
    F11/native fullscreen now hides the custom titlebar and collapses the shell's titlebar offset via `body.window-fullscreen`.
    Files: main.js, js/shell/windowControls.js, styles/shell/titlebar.css, tests/desktop/fullscreen-titlebar.spec.js.
    ```

### Project page issues

  - tags: [Bug, Feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Fix 1 (delete UX): row trash button removed; right-click on a project row opens MpiContextMenu with "Delete project" → MpiOkCancel confirm flow.
    Fix 2 (open folder IPC): `_openFolder` was invoking missing `dialog:openFolder`; switched to existing `choose-folder` handler in main.js.
    Fix 3 (default root location): projects no longer created inside app install dir. New default root = `<Documents>/Cubric Studio/Projects` via `app.getPath('documents')` (cross-platform Win/Mac/Linux). Implemented as `getProjectsRoot()` getter in routes/shared.js; main.js passes `APP_DOCUMENTS` env to server. Default-root projects skip the "Also delete files" checkbox in confirm dialog (always purge, since the folder is app-managed). `isDefaultRoot` flag added to /list-projects response. .gitignore `projects/` removed.
    Files: main.js, routes/shared.js, routes/projects.js, js/shell/projectUI.js, js/services/projectService.js, styles/shell/landing.css, .gitignore, docs/PROJECT.md.
    ```

### History workspace multi-select prompt box bug

  - tags: [bug]
  - priority: high
  - defaultExpanded: false
    ```md
    No-modifier card click after multi-select cleared selection but never emitted `selection-exited`, so PromptBox stayed hidden.
    Fix: MpiHistoryList _makeCard — emit `selection-exited` when collapsing from multi to single.
    ```

### Electron elements still gain focus.

  - tags: [bug]
  - priority: high
  - defaultExpanded: true
    ```md
    - Electron elements still gain focus. 
    - For example the slider in the gallery, when it's moved with the mouse, the plus and minus keys stop working to change the scale of the gallery.
    ```

### History page, right panel, not scrollable.

  - tags: [issue, bug]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    Tool panel (right-top) + history list (right-bottom) now scroll as one column.
    Fix: MpiGroupHistoryBlock.css — right column flex+overflow-y:auto, top row flex:0 0 auto, bottom row no own scroller.
    ```

### Mask persistence for layered masks

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: false
    ```md
    Plan file: docs/plans/2026-04-29-layered-mask-persistence.md
    
    Steps:
    - [x] 1. Layered MaskManager + MpiCanvas API surface
    - [x] 2. Backend IPC route + main.js session lifecycle
    - [x] 3. Frontend maskTempStore service
    - [x] 4. Viewer wiring: swap, mode entry, getCurrentMaskDataURL, loadEntry
    - [x] 5. Auto-mask per-pick masks + executor protocol change
    - [x] 6. Empty-detection toast
    - [x] 7. clearMask + history-entry switch + tool teardown purge
    ```

