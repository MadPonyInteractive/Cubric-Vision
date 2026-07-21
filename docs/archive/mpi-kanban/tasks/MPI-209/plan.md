# Arch weights as install toggles (like ops)

## Current State

Project mode: file source-of-truth (interop `file`).

The GPU-arch weight variant (MPI-200: LTX balanced = `mxfp8` on Blackwell /
`fp8_scaled` on Ada+older) is currently **auto-picked** from the live GPU at
install time. On a CPU download-pod there is no live GPU → `gpuArch('__cpu__')`
falls through to `'modern'` → the app silently installs `fp8`, wrong for a user
whose real generation GPU is Blackwell.

MPI-207 (done) shipped the reactive side — `detectOtherArchInstall`
(`resolveModelDeps.js`), arch-aware `isInstalled`/`isModelUsable`
(`modelRegistry.js`), and an arch-scoped install path — all **live-proven on
5090/mxfp8** on 2026-07-06. Its panel UI (an "Install for your GPU" button +
"Remove old weight" affordance) is what this card replaces with toggles. Its
primitives are reused; nothing is reverted.

Key facts confirmed at planning time:

- **Op toggles already exist** in `MpiModelManager.js`: `_buildToggleRow`,
  per-op `MpiButton` `toggleable`, draft persisted in
  `state.s_modelOpDraftByModel` (Storage `getModelOpDraft`/`setModelOpDraft`),
  cascade + size recompute + Install/Update/Uninstall state machine.
- **Arch is a separate axis from ops** — a model can have both. The arch draft
  needs its own persisted key, `state.s_modelArchDraftByModel` (Map modelId →
  string[] of arch tokens), parallel to the op draft. Do NOT overload the op
  draft.
- **Runtime already resolves arch from the live GPU** independently of what was
  installed: `commandExecutor.runCommand` resolves `arch` once per gen at
  `commandExecutor.js:910`, and `_findModelNotLocal` / `_ensureRemoteHotStore`
  resolve per-engine. Generation is unchanged; only INSTALL moves to toggles,
  plus one new generate-time guard.
- Variant declaration lives in `models.js` `ltx-23-balanced` →
  `variants.arch.options.{blackwell,modern}` with `extraDeps` + `workflowSuffix`.
  The resolver reads it via `variantDepsOf` / `variantAxisTokens`
  (both exported) and `resolveDeps(model, ops, exists, engine, { arch })`.

## Implementation

Single coherent flow. Order matters (data model → resolver → panel → guard).

- [x] **1. Card-driven arch metadata.** In `models.js` add `label` (+ optional
  `size` note) to each `variants.arch.options.<token>`: blackwell →
  `"RTX 50 Series (Blackwell)"`, modern → `"RTX 40 & Older"`. Keep
  `extraDeps`/`workflowSuffix` unchanged. Add a resolver helper in
  `resolveModelDeps.js` — `archVariantOptions(model)` → array of
  `{ token, label, size }` read from the declaration (empty for non-variant
  models) — so the panel never hardcodes arch names (hundreds of models coming;
  a future model may add a 3rd tier). **Verify:** unit case in
  `tests/resolve-model-deps.test.cjs` asserting `archVariantOptions(VARIANT)`
  returns both tokens with labels; `archVariantOptions(FLAT)` is `[]`.

- [x] **2. Arch draft state.** Add `state.s_modelArchDraftByModel` in `state.js`
  (Map/object modelId → arch-token array) with Storage `getModelArchDraft` /
  `setModelArchDraft` mirrors (copy the `s_modelOpDraftByModel` pattern at
  `state.js:46,195` + `storage.js`). Default derivation helper (in
  `remoteEngineClient` or `modelRegistry`): **live GPU arch → else saved
  `runpodConfig.gpuType` arch → else `[]`**. Live = `archSync(engine)`; saved =
  `gpuArch(state.runpodConfig?.gpuType)`. **Verify:** node/eval snippet resolves
  the default to `['blackwell']` when a 5090 is saved and no live GPU.

- [x] **3. Arch toggle row in the panel.** In `MpiModelManager.js`, render an
  arch toggle row for models with `archVariantOptions(model).length > 0`
  (reuse/parallel `_buildToggleRow`). Each token → a `toggleable` `MpiButton`
  labelled from the declaration, `active` = in the arch draft. Toggle mutates
  the arch draft + `renderList({ force: true })` so size/partial/button update.
  Thread the arch draft (a SET) through every arch-scoped resolve that currently
  passes `_arch()` scalar: `_draftDepIds`, `_sizeOf` inputs,
  `_confirmWholeUninstall`, `_install`, `_opUninstallDepIds`. Install resolves
  `resolveDeps(..., { arch: <each selected token> })` unioned; downloader
  dedupes shared VAE/clip/LoRA. **Toggle-off an installed arch = uninstall that
  arch's weight** (delete only its `variantDepsOf({arch:token})`), which
  REPLACES MPI-207's "Remove old weight" button. Remove the MPI-207
  "Install for your GPU" label branch + `_archRemoveBtns` map + button (the
  toggle now owns both). **Verify:** in the running app, LTX-balanced card shows
  two arch toggles with the GPU-family labels; toggling recomputes disk size;
  installing with one on fetches only that weight; toggling an installed one off
  prompts uninstall of just that weight.

- [x] **4. Generate-time guard.** In `commandExecutor.js runCommand`, right after
  `const variantTokens = { arch }` (~line 911) and before workflow resolution:
  if the model has an arch axis and the live-GPU arch's weight is NOT on disk
  (reuse `detectOtherArchInstall` / a disk-presence check via
  `getModelDepStatus` + `variantDepsOf({arch})`), BLOCK dispatch and surface a
  dialog "This GPU needs the <label> weight (~<size>). Install now?" → on
  confirm, run the arch-scoped install for that token, then continue the gen; on
  cancel, abort with a clear message (not a cryptic ComfyUI missing-file error).
  Use the existing dialog/confirm surface the panel uses; wire the install
  through `downloadService`. **Verify:** with only `fp8` installed, on a
  Blackwell engine, starting a gen shows the install-offer dialog (not a raw
  `unet_name not in []` failure).

- [x] **5. Tests + lint.** `node tests/resolve-model-deps.test.cjs` green
  (existing + new `archVariantOptions` case); `npx eslint` clean on all touched
  files (`resolveModelDeps.js`, `models.js`, `state.js`, `storage.js`,
  `MpiModelManager.js`, `commandExecutor.js`, test file). **Verify:** both
  commands exit 0.

## Completed

All 5 steps CODE-COMPLETE + auto-verified 2026-07-06. Live UX (steps 3, 4)
awaits the user (needs real GPU) — card is `validating`.

- **1. Card-driven arch metadata** — `models.js` `ltx-23-balanced.variants.arch.options`
  now carry `label` (GPU-family name) + `size`; `archVariantOptions(model)` added to
  `resolveModelDeps.js` returning `{token,label,size}[]` (label falls back to token).
  Test `testOtherArchDetect` extended (both tokens + fallback + `[]` for flat). 14/14 green.
- **2. Arch draft state** — `s_modelArchDraftByModel` in `state.js` + `MODEL_ARCH_DRAFT`
  key + `get/setModelArchDraft` mirrors (storageKeys.js, storage.js) + subscriber.
  `remoteEngineClient.defaultArchTokens(tokens, engine)` = live arch → saved gpuType
  arch → []. Verified: CPU-pod + 5090 saved → `['blackwell']`; live GPU wins over saved.
- **3. Arch toggle row** — `_buildArchRow` in `MpiModelManager.js` (card-driven labels,
  new `gpu` icon in icons.js). Install/uninstall/size resolve arch as a SELECTED SET
  via `_unionArch` (dedupes shared VAE/clip/LoRA). Arch draft helpers
  (`_archDraftFor`/`_setArchDraft`/`_installedArchOf`), arch-aware Update/Uninstall
  label, arch-off uninstall in `_applyUpdate` (`_archUninstallDepIds`). MPI-207
  "Install for your GPU" button + `_archRemoveBtns` + `_confirmRemoveOtherArch` +
  `installedForOtherArch` import REMOVED (toggle owns both install + removal). Arch
  draft/installed folded into the render signature.
- **4. Generate-time guard** — `_ensureArchWeightOnDisk(model, arch)` in
  `commandExecutor.js` (after arch resolve, before workflow). Missing live-arch weight
  → blocking MpiOkCancel "Install & Generate" (Escape/backdrop → cancel, fail-safe) →
  installs + awaits `download:complete`/`failed` → continues or aborts with
  `arch_weight_missing`. Fails open on a guard bug.
- **5. Tests + lint** — `node tests/resolve-model-deps.test.cjs` 14/14; `npx eslint`
  clean on all 9 touched files. ESM union smoke: keep-both fetches both transformers,
  shared VAE deduped once.

## Remaining Work

- LIVE user-UX verification (steps 3, 4) — see Verification. Needs real GPU(s).
  The `_maybeNotifyArchChange` connect-toast (MPI-207) was KEPT — the generate-guard
  is the hard net, the toast is a harmless proactive nudge that still reads well.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Auto-verifiable: node resolver tests + eslint (steps 1, 5). UI/UX surface the
USER must judge in the running app (steps 3, 4):

1. **Toggle UX** — open Models panel on a running app. LTX-balanced shows two
   arch toggles labelled `RTX 50 Series (Blackwell)` / `RTX 40 & Older`.
   Default pre-selected = the live/saved GPU arch. Toggling recomputes the Disk
   size. Install with one arch on → fetches only that weight (dedupe keeps
   shared files). Toggle an installed arch off → uninstall-confirm for just that
   weight.
2. **CPU-pod default** — on a CPU download-pod with a 5090 saved in RunPod
   settings, the Blackwell toggle is pre-selected (not fp8).
3. **Generate guard** — install only the wrong arch, connect the other-arch GPU,
   hit Generate → the "install the weight for this GPU" dialog appears and
   installing then generates cleanly (no raw missing-file error).

## Preservation Notes

- MPI-207's committed toggle-superseded code (the "Install for your GPU" button +
  `_archRemoveBtns` + the arch-change toast in `shell.js`) is REPLACED here.
  Remove the button + remove-btn; DECIDE on the `shell._maybeNotifyArchChange`
  toast — the generate-guard (step 4) is the hard net, so the connect-toast is
  now optional; keep it only if it still reads well, else remove for lean.
- Reuse, don't reimplement: `detectOtherArchInstall`, `variantDepsOf`,
  `variantAxisTokens` (all exported from `resolveModelDeps.js`), arch-aware
  `isModelUsable`/`isInstalled` (`modelRegistry.js`).
- Separate, NOT this card: the LTX-balanced mxfp8 **workflow** file errors on
  generate ("improperly created workflow") — that is an MPI-200 workflow-auth
  bug. Do not fix it here.
- After shipping: if a new arch surface/prop wiring changed, ask before updating
  `.claude/rules/` (CLAUDE.md documentation-drift rule).
