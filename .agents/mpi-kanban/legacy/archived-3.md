# Archived Kanban Entries

## Archived 2026-05-13

Source: .claude/mpi-kanban/kanban.md

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

