## BACKLOG

### LTX 2.3 video model integration

  - tags: [PLAN, video]
  - priority: medium
  - defaultExpanded: false
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
  - defaultExpanded: false
    ```md
    - Use Patreon users images for the landing page on each version.
    ```

### Additive model folders in settings

  - tags: [Idea]
  - priority: low
  - defaultExpanded: false
    ```md
    - Explore adding to settings additive folders for models.
    ```

### Port redesign to Cubric Studio website

  - tags: [feature, design]
  - priority: medium
  - defaultExpanded: false
    ```md
    - Port new design from `c:\AI\Mpi\CubricStudio_Redesign\` to `c:\AI\Mpi\Cubric Studio (Website)\`.
    - Single-page marketing site. Apply OKLCH tokens, Stage component primitives, mascot/logo recolor per RECOLOR.md.
    - Reference spec: `docs/redesign/PRODUCT.md`, `DESIGN.md`, `c-stage/landing.html`.
    - Separate git repo — commit independently.
    ```

### Port redesign to Cubric Studio documentation site

  - tags: [feature, design]
  - priority: medium
  - defaultExpanded: false
    ```md
    - Port new design from `c:\AI\Mpi\CubricStudio_Redesign\` to `c:\AI\Mpi\Cubric Studio (Docs)\`.
    - Documentation website. Apply OKLCH tokens, Stage component primitives, doc-appropriate type scale.
    - Reference spec: `docs/redesign/PRODUCT.md`, `DESIGN.md`.
    - Separate git repo — commit independently.
    ```

## PLANNING

### Cross-platform portable distribution

  - tags: [PLAN]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
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

### Video workspace trim + split controls

  - tags: [feature, video]
  - priority: high
  - defaultExpanded: true
    ```md
    Plan file: docs/plans/2026-05-14-video-workspace-trim-split-controls.md

    Phase A — Top-right viewer chip primitive — DONE
      - MpiViewerCorners Compound created (js/css), registered in preloadStyles,
        documented in types.js, dev-gallery card mounted.
      - MpiCanvasViewer compare overlay migrated onto MpiViewerCorners; public
        API preserved (setCompareEnabled, setActiveToolLabel, compare-clicked
        emit). Chip strip now flat text per editor.html mockup (no boxes).

    Phase B — MpiTrimBar Compound — DONE
      - js/components/Compounds/MpiTrimBar/{js,css} created. 44px track + two
        4px heat handles (12x4 caps, ±8px overflow) + 2px ink-1 playhead w/
        triangle + 12% heat selection fill, per editor-video.html mockup.
        Stage tokens only.
      - Pointer drag coalesces on RAF, commits on pointerup. Track click drags
        playhead from cursor. Frame-snap via Math.round(t*fps)/fps. Invariant
        0 ≤ in+frame ≤ out ≤ duration; playhead clamped to [in,out].
      - API: setDuration / setFps / setValue(Quiet) / setRange(Quiet) /
        getValue / getRange / destroy. Emits seek, in-change, out-change,
        range-change. Registered in preloadStyles + types.js. Dev-gallery
        card at preview-trim-bar-default (14.74s @ 30fps, in=1.0, out=12.5).

    Phase C — Split MpiVideoPlayer → Surface + ControlBar — DONE
      - MpiVideoSurface Compound (js/css): bare <video> + click-toggle.
        Preserves loop-disable/seeked-restore dance + frame-step wrap-on-
        loop. API: _setSrc/_play/_pause/seek/frameStep/getVideoElement/
        _setFps/_setFrameCount/_setVolume/_setMuted/destroy. Emits play/
        pause/ended/timeupdate/loadedmetadata/volumechange.
      - MpiVideoControlBar Compound (js/css): play/frame±/loop/audio/
        fullscreen/frames-toggle + time display + embedded MpiTrimBar.
        API: attachSurface(instance)/detachSurface/setRange(Quiet)/
        getRange/getValue/setVolume/setMuted/setFrameCount/setFps/destroy.
        Emits loop-change. Owns the 6 video.* hotkeys; bound on attach,
        unbound on detach/destroy. Range = full clip on each
        loadedmetadata; persistence in Phase D.
      - MpiVideoViewer reshaped: surface in stage, control bar in
        __timeline slot. Forwards same 6 external events (play/pause/
        ended/timeupdate from surface, change ← surface volumechange,
        loop-change from control bar). Crop/snapshot/getSourceElement/
        loadVideo API stable.
      - CSS registered in preloadStyles; both compounds in types.js JSDoc.
        Dev-gallery MpiVideoPlayer card untouched (Phase G).

    Phase D — Trim persistence + I/O/X hotkeys — DONE
      - routes/projects.js: added updateItemMeta(metaPath, updater)
        per-sidecar queue (mirror of updateProjectJson — serialize on
        path key, read→updater→writeJsonAtomic temp-rename).
        POST /project-media/:projectId/update-meta now routes through
        it; request shape unchanged.
      - MpiVideoControlBar emits range-change; new
        el.setPendingTrim(in,out) stashes one-shot range applied on
        the next loadedmetadata (survives the full-clip reset).
        I/O/X hotkeys bound on attachSurface, unbound on detach.
      - MpiVideoViewer forwards loadedmetadata + range-change.
        loadVideo(url, meta) propagates meta.trim to setPendingTrim.
        New convenience: el.setRangeQuiet, el.getRange.
      - MpiGroupHistoryBlock: viewer.on('range-change') debounced 250ms
        → POST update-meta with { trim:{in,out} } (or { trim:null } at
        full clip). Mirrors item.trim in memory. All 6 loadVideo call
        sites pass trim: item.trim.
      - hotkeyRegistry: video.trim.in/out/clear registered (I/O/X).
      - Sidecar field `trim` documented in docs/project-integrity.md.

    Phase E — Range-aware ops + loop-within-range — DONE
      - MpiVideoSurface.frameStep(dir, range?) now accepts
        { rangeIn, rangeOut, loop }; works in integer frame space
        (round(t*fps)); out-handle INCLUSIVE so back-from-0 wraps to
        round(hi*fps).
      - MpiVideoControlBar tracks _loopIntent independent of
        video.loop; _syncNativeLoop() forces native loop off when
        range is strict subset; timeupdate emulates loop
        (seek(_in)/_pause at _out); gated on !video.paused so
        frame-step is not re-routed.
      - MpiVideoViewer.captureSnapshot({ time }?) seeks + awaits
        'seeked' before captureFrameBlob; defensively clamps when
        playhead drifts outside range.
      - MpiGroupHistoryBlock — _setFrameFromVideo uses
        item.trim.out; prompt-box-tools:extend payload + crop POST
        body carry trimIn/trimOut.
      - generationService forwards trimIn/trimOut to /extend-video.
      - services/videoConcat.js — concatVideos({ inputRanges })
        with per-input -ss/-to in filter path; demuxer fast-path
        bypassed when any range present.
      - routes/videoConcat.js + routes/videoCrop.js accept
        trimIn/trimOut; videoCrop inserts -ss/-to before -i and
        omits trim from output sidecar.

    Next: Phase F (chip strip per mockup) + Parallel polish batch +
    Phase G (delete legacy MpiVideoPlayer, migrate dev gallery).
    ```

## COMPLETED
