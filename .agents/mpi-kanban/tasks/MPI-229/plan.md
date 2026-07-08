# MPI-229 — Remote user-LoRA path reconcile

## Symptom (live 2026-07-08)
Rossifi Chroma t2i on **remote pod** → 503 `value_not_in_list`:
`lora_name 'CHROMA/Rossifi-Ds5-E309.safetensors' not in ['None','Rossifi-Ds5-E309.safetensors']`
LoRA IS on pod, listed FLAT. Not missing, not MPI-198 (separator already `/`).

## Root
Remote LoRA pipeline halves disagree on layout:
- **Upload** `remoteUploadModel` ([remoteModels.js:534](../../../../routes/remoteModels.js#L534)) + presence `remoteModelPresent` (:491) force `path.basename` → user LoRA lands **flat** on pod → ComfyUI lists flat.
- **Injection** ([comfyController.js:1141](../../../../js/services/comfyController.js#L1141)) writes `val.lora_name` verbatim = local **subfoldered** dropdown value.

Blanket basename-strip UNSAFE: registry deps (`splitDepFilename`, remoteModels.js:291/357) legitimately keep subfolders on pod (`loras/LTX2.3/x`). User `CHROMA/` and registry `LTX2.3/` are structurally identical at injection (both real subfolders from the same list-files scan → `availableLoras`, MpiModelSettings.js:69).

## Cross-platform (why NOT a Mac/Linux-local bug, why NO Pod rebuild)
| Env | disk | enum | injected | match |
|---|---|---|---|---|
| Remote pod | flat (basename upload) | flat | `CHROMA/…` | ❌ this bug |
| Win local | `loras\CHROMA\…` | `CHROMA\…` | (MPI-198 heals) | ✅ |
| Mac/Linux local | `loras/CHROMA/…` | `CHROMA/…` | `CHROMA/…` | ✅ native |
Local engines read the real folder tree — layout==enum==injected. No flatten step exists locally, so no mismatch. This fix touches **remote injection only**; no wrapper/`_model_dest` change, no image rebuild.

## Fix — SHIPPED (logic-verified, awaiting live)
Simpler than the `/object_info` reconcile originally planned. The upload path
(`_uploadRemoteModels`, comfyController.js) ALREADY lands EVERY remote-referenced model
FLAT on the pod (`remoteUploadModel` → `MODELS_DIR/<type>/<basename>`; presence check is
basename-only). So the pod loader enum is ALWAYS flat for anything a workflow uses —
including registry LoRAs referenced in a user workflow (their basename presence-check
misses the subfoldered install → they get re-uploaded flat too). Therefore **basename is
always the correct value on remote**, no network reconcile needed.

**Change** (`_uploadRemoteModels`, single choke point — `runWorkflow` is the sole gen
entry, runs BEFORE the injection loop, mutates the shared `params` object):
```js
const _base = (n) => String(n).split(/[\\/]/).pop();
for (const value of Object.values(params || {})) {
    if (value && typeof value === 'object' && value.lora_name) value.lora_name = _base(value.lora_name);
}
if (params.Upscale_Model) params.Upscale_Model = _base(params.Upscale_Model);
```
Handles `/` and `\` subfolders, leaves already-flat + non-model params untouched.
Local engines never call `_uploadRemoteModels` → unaffected.

Self-check: `tests/…` not added (scratchpad `mpi229-check.cjs`, 5/5 pass — subfoldered
user, nested registry, already-flat, backslash, upscale+untouched-params). eslint clean.

## Follow-up (NOT done — out of scope, low value now)
UX toast for a *genuinely-absent* remote LoRA. Now rare: `_uploadRemoteModels` already
throws a loud actionable error (comfyController.js ~1492) BEFORE /prompt when the local
file can't be resolved/uploaded. The `value_not_in_list` dialog only remains for a
truly-weird pod-state mismatch. Card if it recurs.

## UX safety net (secondary)
`value_not_in_list` on `lora_name`/`ckpt_name` for a genuinely-absent remote model → friendly **toast** ("LoRA X not on the remote pod — install it or switch engine"), NOT the `ui:error` GitHub-report dialog. Keep the dialog for real unexpected failures.
[[feedback_error_dialog_vs_toast]] [[feedback_check_both_engine_paths]]

## Verify
- [ ] Remote pod + a LoRA stored locally in a subfolder (`loras/<sub>/x.safetensors`) → t2i generates, no `value_not_in_list`.
- [ ] Registry subfoldered LoRA (`LTX2.3/…`) on remote still resolves (NOT flattened wrongly).
- [ ] Genuinely-absent remote LoRA → friendly toast, not GitHub dialog.
- [ ] Local engine unaffected (regression: same subfoldered LoRA still gens locally).

## Notes
- Do NOT go the "upload preserves subfolder" route — needs wrapper `_model_dest` + presence-check changes = Pod image rebuild (mpi-ci repo). Injection reconcile is app-only + self-correcting.
