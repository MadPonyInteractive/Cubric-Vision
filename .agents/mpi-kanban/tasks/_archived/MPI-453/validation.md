# MPI-453 — validation

Built 2026-08-05. Scope as decided on the card: gate the MECHANISM, keep per-op deps,
do not split Wan 2.2 into two Library entries.

## What changed

| File | Change |
|---|---|
| `js/utils/comfyValidationError.js` | NEW. `findRejectedFile(nodeErrors, inputNames, comfyText)` reads BOTH carriers of a ComfyUI `value_not_in_list` and reports which one answered — `carrier` IS the engine tag. `MODEL_FILE_INPUTS` = `unet_name`/`ckpt_name`/`vae_name`/`clip_name`. |
| `js/services/comfyController.js` | The private `_findNodeErrorLora` is gone; the LoRA path now calls the shared helper (same behaviour), and a second call tags a weight rejection `weights_missing_local` / `weights_missing_remote` with `err.weightName`. |
| `js/services/commandExecutor.js` | Pre-dispatch gate beside the MPI-209 arch guard: op declares its own deps + dep-status cache present + not installed → `ui:warning` naming the operation, no dispatch. Plus the toast handler for the two new error codes. |
| `js/data/modelRegistry.js` | `installedOpsForContext(model)` (null = unknown, never `[]`) and `firstInstalledOp(model)`. |
| `MpiGalleryBlock.js` | All three `supportedOps[0]` fallbacks now seed from `firstInstalledOp`, and the remembered op (`getSelectedOp`) is re-checked against install state. |
| `MpiGroupHistoryBlock.js` | `_opOptions` passes `installedOps`, so its list matches the strip's. |
| `docs/generation-lifecycle.md`, `docs/comfy.md`, `docs/toasts.md`, `docs/releases/UNRELEASED.md` | The gate, the shared parser + new codes, two new toast rows (and the drifted line numbers in that table re-derived), one user-facing fixes bullet. |

## Evidence

- `tests/uninstalled-op-gate.test.cjs` — 9 tests, all pass. The 400 body is **transcribed**
  from `%APPDATA%/Cubric Vision/logs/app.log` at 2026-08-05T06:05:07, both carriers.
  - It bites by construction: the first test asserts the OLD reader (`lora_name` only)
    returns null on this body — that is exactly the unfixed path, and why the error was
    untagged and reached `MpiErrorDialog`.
  - The last test runs the REAL `syncModelInstalled` against a stubbed
    `/comfy/models/check` describing the user's actual disk (commonDeps + the i2v op),
    then asserts the shipped predicates: `isOperationInstalled(wan-22, t2v_ms) === false`,
    `firstInstalledOp === 'i2v_ms'`, `installedOpsForContext === ['i2v_ms']`, and
    `isModelUsable === true` (a partial install must stay in the picker — MPI-122).
  - One test ties the log to the model def: the two rejected filenames ARE
    `DEPS[wan-22-t2v-high/low].filename`.
- `npm test` — **451 pass, 0 fail** (450 before this card's file).
- `npm run test:desktop` — **17 pass, 0 fail**, including the gallery and group-history
  workspace mounts (both edited here) and `model-ops-resolver.spec.js`.
- `npx eslint` over all six touched JS files — clean.

## STILL NEEDED — the user's live check

Everything above verifies the mechanism off-app. The reported symptom needs his machine,
because it depends on having **only the i2v weights installed**:

1. Wan 2.2 selected with no image staged → the box lands on **Image to Video**, not Text
   to Video, and t2v is not offered in the op strip.
2. If t2v is somehow selected (a reused card, a stale memory), pressing Generate raises a
   toast naming the operation and nothing reaches ComfyUI — no REPORT ON GITHUB dialog.

Remote-engine leg (`weights_missing_remote`) is covered by the test's text carrier, not by
a live Pod run; the local carrier is the one his log produced.
