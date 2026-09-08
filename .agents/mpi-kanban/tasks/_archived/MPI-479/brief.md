# MPI-479 — Reuse Prompt cannot recall a control left at its default

Reported 2026-08-08: *"Reference detail is not being recalled. I've just done a reuse
prompt, and it did not recall it."* (MiniMax H3 ref2va.)

**It is not that control and it is not H3.** The reuse snapshot cannot represent a
control the user never touched, and on the way back an absent key is a no-op instead of
a reset.

## The mechanism, both halves

**Write.** `_snapshotControlState` (`js/services/generationService.js`) builds the op
bucket from the persisted store, not from the controls:

```js
const _op = _clonePlain(getOpSettings(state.currentProject, model.id, operation));
…
if (Object.keys(_op).length) controlState.op = _op;      // ← empty bucket is DROPPED
```

`getOpSettings` only ever holds keys the user has **edited** — `refImageSize` is written
by `_emitUpdate` in the control's `select` handler, and by nothing else. Mounting at the
default writes nothing. So a run at the default produces `_op = {}` and the whole `op`
bucket is omitted from the sidecar.

**Read.** `applyPromptReuseSettings` (`js/services/projectService.js`):

```js
if (operation && Object.keys(opUpdates).length) {
    nextProject = setOpSettings(nextProject, modelId, operation, opUpdates);
}
```

An absent bucket means `opUpdates = {}` → the guard fails → **`setOpSettings` is never
called**, so the live control keeps whatever it currently is. Reusing a default-valued
run cannot pull a control back down from a non-default current value.

## Proof — the user's own sidecars, not a reasoned argument

`Documents/Cubric Vision/Projects/Cubric prompt tests/Media/.meta/*.json`, all 7
`ref2v_ms` runs, oldest first:

| injected `Input_Refs.ref_image_size` | persisted `controlState.op` |
|---|---|
| `match` (default) | `null` |
| `match` (default) | `null` |
| `match` (default) | `null` |
| `match` (default) | `null` |
| `match` (default) | `null` |
| `max` (touched) | `{"refImageSize": "max"}` |
| `match` (touched back) | `{"refImageSize": "match"}` |

The value reached the graph every time — `injectionParams` is correct in all 7. Only the
*record of what the control was* is missing, and only when it was never touched.

## Blast radius — every perOp control, every model

Not `refImageSize` specifically. Any control with `scope: 'perOp'` that a user leaves
alone: `previewStage`, `denoise`, `useGrid`, `upscaleFactor`, and anything added later.
It is a hole in the reuse contract, and it is silent — the reuse *appears* to work
because the other buckets restore.

`shared` and `model` are luckier, not safer: they are near-always non-empty (ratio,
quality, duration live there), so the same `if (Object.keys(...).length)` guard rarely
fires. A model whose every control sat at its default would lose them the same way.

## Proposed fix — the upgrade path the code already names

`_snapshotControlState`'s own comment calls this out:

> *ponytail: cloned from the (300ms-debounced) modelSettings … Upgrade path if it ever
> bites: snapshot from control `getValue()` (Flow-style), which needs a ratioSelector
> compound-key remap.*

**It has now bitten.** The snapshot should record what the run actually USED, not what
happened to be stored. Two shapes, cheapest first:

1. **Backfill declared components.** For each component the op declares
   (`commandRegistry` `components: [...]`), look up `PROMPT_BOX_CONTROLS[id].scope`; if
   the key is missing from its bucket, write the resolved default. Defaults must go
   through the same three layers `_resolveDefault` uses — **op (`getCommandDefault`),
   then model, then the global constant** — or a model with a baked default (qwenEdit's
   `stylization` 0.8, Chroma's rack at 0.6) gets the wrong value written into its record.
   No hand-maintained key list, and it fixes every control at once.
2. **Snapshot from `getValue()`** — the comment's own suggestion. More faithful, but
   needs the ratioSelector compound-key remap and couples `js/services/` to the mounted
   PromptBox.

(1) is the smaller diff and needs no live PromptBox, which matters because the snapshot
is taken at dispatch and must work for a queued/cued job.

**Not proposed:** making `applyPromptReuseSettings` reset missing keys on the read side.
That fixes the symptom at the second half while leaving every already-written sidecar
still lying about what it ran, and it cannot know which keys the op *should* have had.

## Why this was carded and not just fixed

The snapshot feeds **every** Reuse Prompt path — gallery card, history list, both
Blocks — so it is a shared primitive, and THE ROOT-CAUSE RULE says brief before
refactoring one. Sweep on implementation: `MpiGalleryBlock.js:1225` and
`MpiGroupHistoryBlock.js:1293` are the two call sites; `promptReuse.js`
`buildPromptReuseSettings` has a legacy reverse-derive fallback that must keep working
for pre-controlState sidecars.

Existing sidecars are not retroactively fixable for the missing keys — the value simply
was not recorded. They will keep behaving as they do today; only new runs improve.
