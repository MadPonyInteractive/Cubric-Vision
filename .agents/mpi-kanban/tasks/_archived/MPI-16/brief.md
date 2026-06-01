# ComfyUI cache dedupe for seedless workflows  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 400 Legacy column: COMPLETED  ```md ### ComfyUI cache dedupe for seedless workflows - tags: [comfy, universal-workflows, dedupe]
  - priority: normal
  - workload: Normal
  - defaultExpanded: false
    ```md
    Completed 2026-05-25 by claude-opus-4.7. Pending user verification.

    Problem: universal seedless workflows (Upscale) produced duplicate
    history/gallery entries when re-run with identical settings, because
    ComfyUI returned the cached image but the app still created a new
    entry.

    Approach: handle ComfyUI's `execution_cached` WS event. Cache-hit
    dedupe fires only when every `outputNodeIds` member is in the cached
    set AND the workflow contains NO node titled `"Seed"`. Seeded
    workflows (txt2img, i2v, t2v, all PromptBox flows) bypass the guard
    entirely — their fresh seed invalidates cache by design.

    Files:
      - js/services/commandExecutor.js: `_hasSeedNode` scan + new
        `execution_cached` branch in `onMessage`; added
        `exec.cacheHit` field.
      - js/services/generationService.js: early-return guard at top of
        `exec.onComplete` — mounts toast "No changes, skipping..." and
        emits cancellation/idle events instead of saving. Replace mode
        (`config.replaceItemId`) bypasses dedupe.
      - .claude/rules/comfy_injection.md: documented the convention.

    Verification asks:
      - Upscale same image twice w/ same model/settings → toast, no dupe.
      - Upscale same image with different model → new card normally.
      - txt2img twice → still produces new card (seed always fresh).
      - Video upscale: confirm VHS nodes hit cache (acceptable if not).
    ``` ``` 