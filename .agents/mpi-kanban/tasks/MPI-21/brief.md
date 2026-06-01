# Mask controls: invert display, clear/invert row, opacity slider  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 521 Legacy column: COMPLETED  ```md ### Mask controls: invert display, clear/invert row, opacity slider - tags: [mask, ui, canvas]
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
    ``` ``` 