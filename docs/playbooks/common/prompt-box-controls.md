# PromptBox control `scope` — the persistence + reuse contract

> **[shared]** by [add-model](../add-model/README.md) and [add-app](../add-app/README.md).
> Read this before adding ANY `PROMPT_BOX_CONTROLS` entry. A control's `scope` field is
> the **single source of truth** for where its value is stored, snapshotted into a
> sidecar, and restored on Reuse. Everything below is derived from `scope` — you declare
> it once and add nothing else. Getting this wrong = a control that looks fine but
> silently doesn't persist or doesn't come back on Reuse (the exact class MPI-336 closed).

## The three scopes

A control in [`PromptBoxControls.js`](../../../js/components/Organisms/MpiPromptBox/PromptBoxControls.js)
declares `scope: 'shared' | 'perOp' | 'perModel'`. That is the ONLY place the storage
location is declared. Pick by what the value *is*, not by what feels convenient:

| `scope` | Stored at | Use for | Example controls |
|---|---|---|---|
| `'shared'` | `project.shared[image\|video]` | cross-model framing/timing — same intent across every model | `ratio`, `batch`, `duration`, `motionIntensity`, `previewStage` |
| `'perOp'` | `project.modelSettings[id].operations[op]` | a value that means something different per operation | `denoise`, `useGrid`, `upscaleFactor`, `pidVariant`, `qwenTier` |
| `'perModel'` | `project.modelSettings[id]` (model-WIDE) | a MODE the user works in, held across the model's ops | `qualityTier`, `styleSelect`, `stylization`, `enhancePrompt`, `krea2Turbo` |

> **The perModel test:** if flipping the control and then switching op (t2i → detail →
> upscale) should KEEP the value, it is `perModel`. If it should reset per op, it is
> `perOp`. `krea2Turbo` is a mode → perModel; `denoise` is per-op latitude → perOp.

## What you get for free (do NOT hand-maintain any of it)

Once `scope` is declared, the whole persistence + reuse pipeline is `scope`-driven. There
is **no key-list to edit** anywhere. Concretely:

1. **Live persistence.** `_emitUpdate` routes the write by `scope`. A `perModel` write
   carries `modelWide: true`, and `projectService`'s guard trusts that flag — so the
   value lands in `modelSettings[id][key]` with no `_MODEL_WIDE_KEYS` allowlist edit.
2. **Sidecar snapshot.** At **dispatch** (`enqueueGeneration → _snapshotControlState`,
   [`generationService.js`](../../../js/services/generationService.js)) the three buckets
   are cloned **wholesale** — the model bucket is `clone(modelSettings[id])` minus its
   `operations` sub-tree. Any perModel key rides along automatically. Frozen at dispatch,
   so changing a control while the gen runs can't corrupt it.
3. **Reuse restore.** `buildPromptReuseSettings`' fast path clones `controlState.model`
   wholesale back into `modelUpdates`; `applyPromptReuseSettings → setModelSettings`
   shallow-merges it (leaving sibling ops untouched). Your control comes back.

That is the entire reason a *new* control "just adopts the system": the system reads
`scope`, never a parallel list.

## What you DO wire (the per-control contract)

- **The control def** in `PROMPT_BOX_CONTROLS`: `scope`, `defaultValue`, `mount`,
  `getValue`, and `getInjectionParams()`.
- **`getInjectionParams()` return key == the workflow node's `_meta.title`** — an
  `Input_*` title, exact. This is a hard injector contract; a mismatch is dropped
  silently (see [inject-titles-guard.md](inject-titles-guard.md)).
- **A default** in [`promptControlDefaults.js`](../../../js/data/promptControlDefaults.js)
  (global) — or per-op via `commandRegistry.commands[op].defaults` for a `perOp` control.
- **Add the control id to the op's `components` array** in `commandRegistry.js` so it
  mounts for that op.

## Checklist — adding a PromptBox control

- [ ] `scope` chosen by the perModel test above (mode = perModel; per-op latitude = perOp; cross-model = shared)
- [ ] `getInjectionParams()` returns `{ Input_<Name>: value }`, key == node `_meta.title`, exact
- [ ] `defaultValue` set; matches the workflow's baked value so a failed mount degrades safely
- [ ] Default registered: `promptControlDefaults.js` (or `commands[op].defaults` for perOp)
- [ ] Control id added to each relevant op's `components` array
- [ ] **NOTHING else.** No edit to `_MODEL_WIDE_KEYS`, no snapshot key-list, no reuse
      key-list. If you find yourself editing one of those to make a control persist or
      restore, STOP — the machinery regressed away from `scope`; fix the machinery, not
      your control.

## Why this doc exists (MPI-336)

Historically `perModel` controls silently failed because three hand-maintained key-lists
(`_MODEL_WIDE_KEYS`, the sidecar snapshot, the reuse loop) each re-declared what `scope`
already said, and the sidecar snapshot read **live** settings at *completion* — so a
control changed mid-gen was captured wrong. `perOp` controls never hit this (opName
routing needs no list), so the documented happy-path example (`upscaleFactor`) hid the
trap. The fix made the pipeline `scope`-driven and dispatch-frozen; this contract is the
guardrail that keeps it that way.
