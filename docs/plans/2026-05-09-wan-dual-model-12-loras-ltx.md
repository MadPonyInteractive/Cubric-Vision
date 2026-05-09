# WAN Dual-Model + 12 LoRAs + LTX 2.3

**Created:** 2026-05-09
**Kanban entry:** `WAN dual-model + 12 LoRAs + LTX`
**Tag:** [PLAN]
**Priority:** high
**Depends on:** `Video preview-gate core` (LTX integration reuses preview-gate machinery; WAN-only LoRA + dual-model parts can land independently if needed).

## Goal

Bring WAN video to full feature parity:
1. Expose **12 LoRA slots** in the model settings overlay for WAN — six "High" (`Lora_High_1..6`) injected into the High-noise sampler stage, six "Low" (`Lora_Low_1..6`) injected into the Low-noise sampler stage.
2. Add **dual-model selection UI** so the user can pick the High-noise checkpoint + Low-noise checkpoint independently.
3. Integrate **LTX 2.3** as a registered model with the same preview-gate behavior as WAN; collapse LTX's three-stage workflow into two stages for code consistency.

## Context summary (from investigation)

- **Settings overlay:** `js/components/Compounds/MpiModelSettings/MpiModelSettings.js`. `LORA_COUNT` const at line 43 hardcoded to 6. Six rows mounted in `_mountLoraSlots` (`:177-265`). Overlay max-width 560px; no internal scroll on LoRA list; 12 rows ≈ 940px tall (exceeds typical viewport — needs scroll container).
- **modelSettings shape:** `js/data/projectModel.js:292-298`. `loras` is a flat array of 6 entries `{ name, strengthModel, strengthClip }` via `_defaultLoraSlots()` at `:279-283`.
- **LoRA injection naming:** `commandExecutor.js:155-162` injects as `Lora_1..Lora_6`. `comfyController.js:318-337` matches `/^Lora_\d+$/i` — **accepts arbitrary names matching `Lora_*`** including `Lora_High_1` and `Lora_Low_1`. No contiguous-index requirement.
- **WAN workflow JSON:** `comfy_workflows\Wan22_t2v.json`. Confirmed has `Lora_High_1..6` titled correctly. **BUG found in investigation:** Low-noise nodes (ids 793-798) are all titled `Lora_Low_1` — should be `Lora_Low_1..6`. Workflow-side fix.
- **Dual-model in workflow:** WAN already has `Switch(high noise model)` + `Switch(low noise model)` nodes — runtime multiplexers, not direct checkpoint loaders. Means dual-model selection happens at workflow nodes that need to be driven by injection.
- **Model definition:** `js/data/modelConstants/models.js:105-129`. WAN entry lists both `wan-22-t2v-high` + `wan-22-t2v-low` in `dependencies[]` but has no structured "dualCheckpoint" field. No precedent for dual-checkpoint settings UI in the codebase.
- **LTX:** no entry registered today. No commented/partial code. Fresh integration.
- **Plan #1 + Plan #2 already deliver:** generation modes + Run/Stop hotkeys + queue API; preview-gate sidecar/UI/Continue flow. This plan reuses both.

## Architecture decisions

1. **LoRA shape change:** flat `loras: [...]` (6) becomes per-WAN a structured shape:
   ```js
   loras: { high: [6 entries], low: [6 entries] }
   ```
   Other models keep the flat shape. The branch is keyed by **model definition declaring `dualLoraStages: true`** (or similar). For models without the flag, the existing flat `loras` field is preserved as-is — no migration needed for image models.
2. **modelSettings migration:** when loading a WAN project saved before this plan, the reconciler upgrades the legacy flat `loras` to `{ high: [...], low: [_default 6_] }` lossily (puts old entries into `high`, leaves `low` empty). Document the one-time upgrade.
3. **Dual checkpoint:** add `model.checkpoints: ['high', 'low']` (or similar) on the WAN model entry. Settings UI renders one checkpoint dropdown per slot. Persist as `modelSettings[modelId].checkpoints: { high: <id>, low: <id> }`. Inject as `params['Checkpoint_High']`, `params['Checkpoint_Low']` matching the workflow's switch node titles. The workflow author must title the switch nodes accordingly — confirm in to-do 4.
4. **LTX 3→2 stage collapse:** LTX 2.3 has 3 stages but we'll author a 2-stage workflow (preview = stage 1; final = stage 2 + 3 collapsed). Workflow-side decision; this plan only registers the model + supplies injection params. Workflow file lands in `comfy_workflows/LTX23_t2v.json` and `LTX23_i2v.json`.
5. **Settings UI layout for 12 LoRAs:** wrap the LoRA list in a `max-height: 500px; overflow-y: auto` scroll container, **with a section header strip** ("HIGH NOISE" / "LOW NOISE") splitting the two halves visually. CSS-only change scoped to `.mpi-model-settings__loras` for WAN (use a model-flag class on the overlay root: `.mpi-model-settings--dual-stage-lora`).
6. **Preview-gate reuse:** LTX inherits the `previewInitialStage` toggle + Continue/Discard flow from plan #2. No new UI — just register LTX model with `mediaType: 'video'`, `supportedOps: ['t2v', 'i2v']`, declare it has the preview node.
7. **Workflow Lora_Low_1 duplicate-title bug:** the user (workflow author) must fix it. Plan calls this out as a precondition. Code-side, log a warning if multiple nodes share the same title — already needed for safety.

## To-dos

### 1. Per-stage LoRA shape in modelSettings + reconciler upgrade

Edit `js/data/projectModel.js`: extend `getModelSettings`/`_defaultLoraSlots` so when the model definition has `dualLoraStages: true`, defaults are `{ high: [6], low: [6] }`; otherwise legacy flat `[6]`. Edit `js/managers/projectReconciler.js` to detect WAN projects with legacy flat `loras` and migrate to `{ high: <legacy>, low: <fresh 6> }` on load (one-time, mutating the in-memory project — saved on next write). Add a `console.log('[projectReconciler] upgraded WAN loras shape')` for verification (remove on green).

**Verify:** Open a fresh project, pick WAN model, then read `state.currentProject.modelSettings['wan-22']` in dev console → confirm shape is `{ high: [6 nulls], low: [6 nulls] }`. Open an old WAN project (save one before this plan, then reload after) → confirm console log fires + shape upgraded. Open a non-WAN model project → confirm flat `loras: [6]` shape unchanged.

### 2. Settings overlay: 12 LoRA slots + scroll + section headers (WAN only)

Edit `js/components/Compounds/MpiModelSettings/MpiModelSettings.js`: change `LORA_COUNT` from a constant to a function of model definition (or split into two `LORA_COUNT_HIGH` / `LORA_COUNT_LOW` when `dualLoraStages`). `_mountLoraSlots` renders two sections when in dual-stage mode: a "HIGH NOISE" header strip + 6 rows reading from `loras.high`, then a "LOW NOISE" header strip + 6 rows reading from `loras.low`. Each row's strength inputs persist into the right branch. Add CSS in the same component's CSS file: `.mpi-model-settings--dual-stage-lora .mpi-model-settings__loras { max-height: 500px; overflow-y: auto; }` plus header styles using OKLCH tokens. Apply the modifier class on the overlay root when the active model is dual-stage.

**Verify:** Select WAN in PromptBox, open settings overlay → see 12 LoRA rows split by HIGH/LOW headers, scrollable if viewport short. Set a value in `Lora_High_3` and `Lora_Low_2`, close + reopen overlay → values persist. Switch to a non-WAN model → see legacy 6 rows, no headers, no scroll wrapper. No console errors.

### 3. Per-stage LoRA injection: `Lora_High_1..6` + `Lora_Low_1..6`

Edit `js/services/commandExecutor.js` `_buildParams` (`:155-162`): when the model has `dualLoraStages: true`, iterate `modelSettings.loras.high[]` and inject as `params['Lora_High_1'..6]`, then `loras.low[]` as `params['Lora_Low_1'..6]`. For other models, keep the existing `Lora_1..6` path. Skip null entries (existing behavior). The `comfyController._inject` regex `/^Lora_\d+$/i` does NOT match `Lora_High_1` — **update the regex** to `/^Lora_(High_|Low_)?\d+$/i` (case-insensitive) so the LoRA-object branch fires correctly. Verify that the existing duplicate-title detection logs a warning if a workflow has two nodes titled the same.

**Verify:** Set a LoRA name + strengths in `Lora_High_3` and `Lora_Low_5` for WAN. Run a generation. Add temporary `console.log('[params]', params)` in `runWorkflow` → confirm `Lora_High_3` and `Lora_Low_5` keys are present with `{ lora_name, strength_model, strength_clip }`. Look at the resolved workflow JSON in console → confirm the matching nodes have their inputs populated. Remove logs on green.

### 4. Dual-checkpoint selection UI + injection

Edit WAN model definition in `js/data/modelConstants/models.js`: add field `checkpoints: [{ key: 'high', label: 'High-noise', deps: ['wan-22-t2v-high', 'wan-22-i2v-high'] }, { key: 'low', label: 'Low-noise', deps: ['wan-22-t2v-low', 'wan-22-i2v-low'] }]` (shape TBD during execution; pick whatever lets the dropdown enumerate available checkpoint files from those deps). Edit `MpiModelSettings.js` to render two checkpoint dropdowns when `model.checkpoints` is present (between the LoRA section and the upscale section). Persist into `modelSettings[modelId].checkpoints: { high: <filename>, low: <filename> }`. Inject in `_buildParams` as `params['Checkpoint_High']` and `params['Checkpoint_Low']` — workflow author ensures the corresponding switch/loader nodes are titled accordingly. If a node with these titles is absent, the existing missing-node warning path fires (added in plan #2 to-do 2).

**Verify:** Select WAN, open settings → see two checkpoint dropdowns. Pick a value for each, run a generation. Console-log resolved workflow → confirm the relevant nodes have updated `inputs.ckpt_name` (or whichever input key the loader uses). Switch to a non-WAN model → no checkpoint dropdowns appear.

### 5. LTX 2.3 model registration

Edit `js/data/modelConstants/models.js`: add LTX entry mirroring WAN's structure — `id: 'ltx-23'`, `name: 'LTX 2.3'`, `mediaType: 'video'`, `type: 'ltx'`, `supportedOps: ['t2v', 'i2v']`, `workflows: { t2v: 'LTX23_t2v.json', i2v: 'LTX23_i2v.json' }`, `dependencies: [...]` (placeholder list — user supplies actual model file IDs). Decide during execution whether LTX needs `dualLoraStages` + dual checkpoints (likely no based on user description; LTX uses different architecture). Default to **single LoRA stage + single checkpoint** unless the user says otherwise. Register LTX dependencies in the dependency manifest (`js/data/modelConstants/dependencies.js` or similar) — invoke `mpic-compute-dep-hashes` for missing SHA256 hashes if dependency entries are added.

**Verify:** Open PromptBox model picker → confirm "LTX 2.3" appears under video models. Select it → confirm settings overlay opens without errors. Run a t2v generation (workflow file must exist; if missing, log a clear error). Toggle preview mode (from plan #2) on LTX → confirm `Preview_Only` injection fires.

### 6. Preview-gate reuse for LTX (verify only — no new code expected)

Plan #2 should already cover LTX since the preview machinery is model-agnostic. This to-do is a verification pass: confirm the LTX workflow has a `Preview_Only` node + the preview/final output nodes wired the same way as WAN. If not, log a warning + fall back to full generation (already handled by plan #2 to-do 2). No new code unless verification surfaces a gap.

**Verify:** Run LTX with `previewInitialStage: true` → preview MP4 lands in gallery as a preview card. Click Continue → final video generates and replaces the preview card. Click Discard on a different preview → file + sidecar removed. If the LTX workflow lacks the Preview_Only node, the warning toast fires and a full generation runs instead — confirm this fallback works.

### 7. Documentation + rule files sync

Update only what changed:
- `.claude/rules/comfy_injection.md`: document `Lora_High_*`, `Lora_Low_*`, `Checkpoint_High`, `Checkpoint_Low` injection keys + the regex update.
- `.claude/rules/component-state.md`: WAN now reads `modelSettings[modelId].loras.{high,low}` and `modelSettings[modelId].checkpoints.{high,low}`.
- `.claude/rules/component-comfy.md`: update the LoRA injection table to cover dual-stage models.
- `docs/PROJECT.md`: short note on dual-stage video models pointing to this plan.
- `js/data/modelConstants/dependencies.js` (if LTX deps added): include hashes from the audit skill.

**Verify:** Look at edited docs — each new fact present, no unrelated content modified.

## Out of scope

- Refactoring the legacy flat `loras` shape across all models (only WAN gains dual-stage; image models untouched).
- Auto-detection of which LoRAs the user previously used at preview time for replay during Continue (per plan #2 spec, LoRAs use current state, not frozen).
- LTX advanced workflow tuning (3-stage variant, custom samplers) — out of scope; user authors the 2-stage workflow externally.
- Workflow JSON authoring (Lora_Low duplicate-title fix, LTX file creation, switch-node titling). Documented as preconditions; user handles.

## Open questions to confirm during execution

1. **LTX dual-stage LoRAs?** User did not specify whether LTX has High/Low LoRA split like WAN. Likely no — LTX architecture differs. Confirm at start of to-do 5.
2. **Migration cost:** users with saved WAN projects pre-plan get an in-place upgrade. Acceptable, but should we toast "Project LoRA settings upgraded — please review"? Decide during to-do 1.
3. **Checkpoint dropdown source:** does the codebase already enumerate installed checkpoint files for a dependency? If yes, reuse. If no, we need to add a small helper (likely under `js/services/installedModels.js` or similar). Investigate during to-do 4.
4. **Workflow author preconditions:** the WAN `Lora_Low_1..6` duplicate-title bug + LTX workflow files must land before this plan can be fully verified. Track as a user task referenced in the kanban entry body.
