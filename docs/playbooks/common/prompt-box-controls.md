# PromptBox control `scope` — the persistence + reuse contract

> **[shared]** by [add-model](../add-model/README.md) and [add-flow](../add-flow/README.md).
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
| `'perOp'` | `project.modelSettings[id].operations[op]` | a value that means something different per operation | `denoise`, `useGrid`, `upscaleFactor`, `pidVariant`, `depthStrength` |
| `'perModel'` | `project.modelSettings[id]` (model-WIDE) | a MODE the user works in, held across the model's ops | `qualityTier`, `qwenTier`, `styleSelect`, `stylization`, `enhancePrompt`, `krea2Turbo` |

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
   **Untouched controls are backfilled** (MPI-479): the stores hold only keys the user
   EDITED, so a run at the default used to record nothing — and since an absent bucket is
   a no-op on the way back, not a reset, Reuse Prompt could not pull a control back down
   from a non-default current value. `resolveControlDefaults` (PromptBoxControls) now
   supplies a resolved default per control, merged **under** the stored values, so the
   record says what the run USED rather than what happened to be persisted. Two
   consequences for a new control: its default must resolve through
   `_resolveDefault`'s op → model → global layers (it does, for free), and if its STORED
   shape differs from its `defaultValue` it must declare `snapshotDefault: false` and be
   reconciled from `injectionParams` instead — the three that do are `ratio` (compound
   `ratioSelector`), `batch` (dropdown string vs stored number) and `qualityTier`
   (per-MODEL default). A fourth opt-out fails `tests/reuse-snapshot-defaults.test.cjs`.
   The backfill only covers controls the model+op actually OFFERS — `visibleControlIds`
   is the one gate, shared with the PromptBox's own mount loop. That matters most for
   `shared`, which is cross-model: recording a hidden `motionIntensity` on an LTX run and
   reusing it would reset the value the user set on Wan.
   **Then the buckets are reconciled against what the run INJECTED** (MPI-556,
   `reconcileControlsFromInjection`). Everything above still describes the open PROJECT, and
   raw `injectionParams` — the agent escape hatch — always wins over resolved values, so an
   agent dispatch can differ from the project on any control. The reconcile asks each control
   what its recorded value WOULD have injected and, where the run disagrees, round-trips the
   injected value back through the same function to recover what actually ran. **Your
   `getInjectionParams()` is therefore run in reverse**, against a copy of the control with
   `value` swapped in and `_instance` nulled — so keep it a pure function of `this.value`
   (mount-time flags on `this` are fine, they ride along; reading `_instance.el` is not, and
   `ratio`/`batch` prefer the live element only because they opt out here). A control that
   MAPS its value rather than passing it through (`controlType`: id → index) cannot be
   inverted and is dropped from the sidecar rather than recorded wrong.
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
- [ ] Only if the value you STORE is a different shape from `defaultValue`: `snapshotDefault: false`
      plus a reconcile from `injectionParams` (MPI-479 — otherwise skip it, the backfill is what makes
      Reuse recall an untouched control)
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
