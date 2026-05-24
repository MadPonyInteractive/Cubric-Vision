# Archived Kanban Entries

## Archived 2026-05-13

Source: .claude/mpi-kanban/kanban.md

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

