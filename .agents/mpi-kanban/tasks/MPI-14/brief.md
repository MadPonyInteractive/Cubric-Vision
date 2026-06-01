# Gallery slider  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 358 Legacy column: COMPLETED  ```md ### Gallery slider - defaultExpanded: false
    ```md
    Completed 2026-05-25 by claude-opus-4.7. User-verified.

    Root cause: old fixed pixel targets (160/224/288/384/512) collapsed
    adjacent slider steps to identical visuals because justified layout
    rescales each non-last row to fill the container — two adjacent seeds
    packing the same N items/row produced the same row height.

    Fix: derive `_cardWidth` from desired items-per-row, not pixel size.
    `target = ((containerWidth - (N-1)*gap) / (N * aspectRef)) * 0.92`
    with aspectRef 1.6 and a 0.92 inset to keep the seed inside the band.
    Map: 1=6/row, 2=4/row, 3=3/row, 4=2/row. Slider max dropped 5→4
    (1/row was indistinguishable from 2/row at any sane container width).
    Recomputed on both slider input and ResizeObserver so window resize
    keeps the band correct. Persisted gallerySizeLevel > 4 clamped to 4
    at mount.

    Files: js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js,
    js/state.js, .claude/rules/component-state.md.
    Memory: project_gallery_slider_sizing.md.
    Lint: 0 errors (1 pre-existing warning).
    ``` ``` 