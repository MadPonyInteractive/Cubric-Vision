# WAN Dual-Model + 12 LoRAs

**Created:** 2026-05-09
**Kanban entry:** `WAN dual-model + 12 LoRAs`
**Tag:** [PLAN]
**Priority:** high
**Depends on:** `Video preview-gate core`

## Goal

Bring WAN video to full feature parity:
1. Expose **12 LoRA slots** in the model settings overlay for WAN — six "High" (`Lora_High_1..6`) injected into the High-noise sampler stage, six "Low" (`Lora_Low_1..6`) injected into the Low-noise sampler stage.

LTX 2.3 integration is deferred to a separate backlog entry until LTX workflows are ready.

## Context summary (from investigation)

- **Settings overlay:** `js/components/Compounds/MpiModelSettings/MpiModelSettings.js`. `LORA_COUNT` const at line 43 hardcoded to 6. Six rows mounted in `_mountLoraSlots` (`:177-265`). Overlay max-width 560px; no internal scroll on LoRA list; 12 rows ≈ 940px tall (exceeds typical viewport — needs scroll container).
- **modelSettings shape:** `js/data/projectModel.js:292-298`. `loras` is a flat array of 6 entries `{ name, strengthModel, strengthClip }` via `_defaultLoraSlots()` at `:279-283`.
- **LoRA injection naming:** `commandExecutor.js:155-162` injects as `Lora_1..Lora_6`. `comfyController.js:318-337` matches `/^Lora_\d+$/i` — **accepts arbitrary names matching `Lora_*`** including `Lora_High_1` and `Lora_Low_1`. No contiguous-index requirement.
- **WAN workflow JSON:** `comfy_workflows\Wan22_t2v.json`. Confirmed has `Lora_High_1..6` titled correctly. **BUG found in investigation:** Low-noise nodes (ids 793-798) are all titled `Lora_Low_1` — should be `Lora_Low_1..6`. Workflow-side fix.
- **Model definition:** `js/data/modelConstants/models.js:105-129`. WAN entry lists both `wan-22-t2v-high` + `wan-22-t2v-low` in `dependencies[]`. These app-owned checkpoints are fixed by the workflow and are not user-selectable.
- **LTX:** deferred to a separate backlog entry. It uses the standard flat LoRA shape.
- **Plan #1 + Plan #2 already deliver:** generation modes + Run/Stop hotkeys + queue API; preview-gate sidecar/UI/Continue flow. This plan reuses both.

## Architecture decisions

1. **LoRA shape change:** flat `loras: [...]` (6) becomes per-WAN a structured shape:
   ```js
   loras: { high: [6 entries], low: [6 entries] }
   ```
   Other models keep the flat shape. The branch is keyed by **model definition declaring `dualLoraStages: true`** (or similar). For models without the flag, the existing flat `loras` field is preserved as-is — no migration needed for image models.
2. **modelSettings migration:** when loading a WAN project saved before this plan, the reconciler upgrades the legacy flat `loras` to `{ high: [...], low: [_default 6_] }` lossily (puts old entries into `high`, leaves `low` empty). Document the one-time upgrade.
3. **Settings UI layout for 12 LoRAs:** render section headers ("HIGH NOISE" / "LOW NOISE") splitting the two halves visually. The settings overlay itself remains the scroll container; do not add a nested LoRA scroller.
4. **Workflow Lora_Low_1 duplicate-title bug:** the user (workflow author) must fix it. Plan calls this out as a precondition. Code-side, log a warning if multiple nodes share the same title — already needed for safety.

## To-dos

### 1. [x] Per-stage LoRA shape in modelSettings + reconciler upgrade

Edit `js/data/projectModel.js`: extend `getModelSettings`/`_defaultLoraSlots` so when the model definition has `dualLoraStages: true`, defaults are `{ high: [6], low: [6] }`; otherwise legacy flat `[6]`. Edit `js/managers/projectReconciler.js` to detect WAN projects with legacy flat `loras` and migrate to `{ high: <legacy>, low: <fresh 6> }` on load (one-time, mutating the in-memory project — saved on next write). Add a `console.log('[projectReconciler] upgraded WAN loras shape')` for verification (remove on green).

**Verify:** Open a fresh project, pick WAN model, then read `state.currentProject.modelSettings['wan-22']` in dev console → confirm shape is `{ high: [6 nulls], low: [6 nulls] }`. Open an old WAN project (save one before this plan, then reload after) → confirm console log fires + shape upgraded. Open a non-WAN model project → confirm flat `loras: [6]` shape unchanged.

### 2. [x] Settings overlay: 12 LoRA slots + scroll + section headers (WAN only)

Edit `js/components/Compounds/MpiModelSettings/MpiModelSettings.js`: change `LORA_COUNT` from a constant to a function of model definition (or split into two `LORA_COUNT_HIGH` / `LORA_COUNT_LOW` when `dualLoraStages`). `_mountLoraSlots` renders two sections when in dual-stage mode: a "HIGH NOISE" header strip + 6 rows reading from `loras.high`, then a "LOW NOISE" header strip + 6 rows reading from `loras.low`. Each row's strength inputs persist into the right branch. Add CSS in the same component's CSS file: `.mpi-model-settings--dual-stage-lora .mpi-model-settings__loras { max-height: 500px; overflow-y: auto; }` plus header styles using OKLCH tokens. Apply the modifier class on the overlay root when the active model is dual-stage.

**Verify:** Select WAN in PromptBox, open settings overlay → see 12 LoRA rows split by HIGH/LOW headers, scrollable if viewport short. Set a value in `Lora_High_3` and `Lora_Low_2`, close + reopen overlay → values persist. Switch to a non-WAN model → see legacy 6 rows, no headers, no scroll wrapper. No console errors.

### 3. [x] Per-stage LoRA injection: `Lora_High_1..6` + `Lora_Low_1..6`

Edit `js/services/commandExecutor.js` `_buildParams` (`:155-162`): when the model has `loraStages`, iterate `modelSettings.loras[stage.key][]` and inject as `${stage.injectionPrefix}_${index}` (for WAN: `Lora_High_1..6`, `Lora_Low_1..6`). For other models, keep the existing `Lora_1..6` path. Skip null entries (existing behavior). The `comfyController._inject` regex `/^Lora_\d+$/i` does NOT match staged names — **update the regex** to accept `Lora_<Stage>_<N>` style keys so the LoRA-object branch fires correctly. Verify that the existing duplicate-title detection logs a warning if a workflow has two nodes titled the same.

Implementation note: inject all staged LoRAs on every run (preview, full generation, and Continue). During final verification, explicitly observe whether Continue reruns stage one after staged LoRA injection. If it does, add a follow-up step for stage-aware Continue injection/cache preservation.

**Verify:** Set a LoRA name + strengths in `Lora_High_3` and `Lora_Low_5` for WAN. Run a generation. Add temporary `console.log('[params]', params)` in `runWorkflow` → confirm `Lora_High_3` and `Lora_Low_5` keys are present with `{ lora_name, strength_model, strength_clip }`. Look at the resolved workflow JSON in console → confirm the matching nodes have their inputs populated. Remove logs on green.

### 4. [x] Documentation + rule files sync

Update only what changed:
- `.claude/rules/comfy_injection.md`: document `Lora_High_*`, `Lora_Low_*` injection keys + the regex update.
- `.claude/rules/component-state.md`: WAN now reads `modelSettings[modelId].loras.{high,low}`.
- `.claude/rules/component-comfy.md`: update the LoRA injection table to cover dual-stage models.
- `docs/PROJECT.md`: short note on dual-stage video models pointing to this plan.

**Verify:** Look at edited docs — each new fact present, no unrelated content modified.

## Out of scope

- Refactoring the legacy flat `loras` shape across all models (only WAN gains dual-stage; image models untouched).
- Auto-detection of which LoRAs the user previously used at preview time for replay during Continue (per plan #2 spec, LoRAs use current state, not frozen).
- LTX 2.3 integration — deferred to backlog until workflows exist.
- Workflow JSON authoring (Lora_Low duplicate-title fix, LTX file creation, switch-node titling). Documented as preconditions; user handles.

## Open questions to confirm during execution

1. **Migration cost:** users with saved WAN projects pre-plan get an in-place upgrade. Acceptable, but should we toast "Project LoRA settings upgraded — please review"? Decide during to-do 1.
2. **Workflow author preconditions:** the WAN `Lora_Low_1..6` duplicate-title bug must land before this plan can be fully verified. Track as a user task referenced in the kanban entry body.
3. **Final Continue performance check:** after staged LoRA injection lands, test preview → immediate Continue and observe whether ComfyUI resumes from the second stage or reruns from stage one. If it reruns, add a follow-up implementation step for stage-aware Continue injection/cache preservation.
