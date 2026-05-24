# Archived Kanban Entries

## Archived 2026-05-13

Source: .claude/mpi-kanban/kanban.md

### Continue from last frame.

  - tags: [PLAN]
  - priority: high
  - workload: Hard
  - defaultExpanded: false
  - steps:
      - [x] Foundations selection-order roles gate
      - [x] Video-viewer context menu frames
      - [x] PromptBox toolbar organism
      - [x] Server ffmpeg concat route
      - [x] Wire Extend Combine menus
      - [x] Selection badges docs sync
    ```md
    Plan file: docs/plans/2026-05-12-continue-from-last-frame.md

    Shipped 2026-05-13. Video-history workspace gained right-click "Set as
    start/end frame" + MpiToolOptionsPrompt toolbar (Extend / Create new) +
    ffmpeg-concat-based Extend (extended_NNN.mp4 + sidecar extendedFrom)
    and Combine context-menu (history + gallery, combined_NNN.mp4) with
    chronological click order. Selection-order numeric badges + history
    "Extended from" row added. `historyMode` PromptBox context flag forces
    Preview_Only=false for _ms ops; PromptBox media strip hidden in
    history. Rule files + docs/PROJECT.md synced; 9 memory entries written
    (history-no-multistage, selection-order-chronological, ffmpeg-concat-
    strategy, video-workspace-no-latents, concat-crop-zoom, real-extend-op-
    future, history-toolbar-i2v-gate, right-top-slot-empty-visibility,
    thumb-css-only-aspect).
    ```

### Media Gallery Buggy Behavior

  - tags: [Bug]
  - priority: high
  - workload: Hard
  - defaultExpanded: false
    ```md
    Session 2026-05-12: improved gallery visual stability without changing
    generation semantics.
    - `MpiGalleryGrid` moved from full card rebuilds to keyed card reuse by
      `group.id`, preserving DOM and grid-owned state across setGroups, sort,
      resize, and size-slider rerenders.
    - Latent preview updates now preload the next blob frame before swapping,
      so generating cards keep the current preview visible instead of flashing
      gray between ComfyUI preview frames.
    - Aspect ratios prefer MediaItem/group dimension data and a per-group cache
      instead of DOM natural dimensions as the primary layout source.
    - ResizeObserver rerenders are gated to real width changes; grid scrollbar
      gutter is stable; manual wheel forwarding only applies on empty grid
      space to avoid double-scroll/snapping over cards.
    - Imported media now carries measured pixelDimensions into in-memory
      gallery cards, matching persisted sidecar shape and stabilizing first
      render layout for imports/snapshots.
    Verified with `npm run lint -- --quiet`, targeted ESLint/node syntax
    checks, and a browser smoke test covering keyed reuse, selection clearing,
    latent preview swaps, and placeholder-to-final replacement.
    ```

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

