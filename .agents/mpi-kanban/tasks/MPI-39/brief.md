# Tool-options polish — crop redesign + radio primitive + video tool persistence  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 1087 Legacy column: COMPLETED  ```md ### Tool-options polish — crop redesign + radio primitive + video tool persistence - tags: [chore, tool-options, persistence]
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
    ``` ``` 