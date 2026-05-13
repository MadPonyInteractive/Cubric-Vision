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
