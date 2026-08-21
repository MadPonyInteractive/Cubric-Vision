# MPI-473 Brief — `Preview_Only` is vestigial plumbing

Cosmetic, but it lies to the user and to the next reader. Every multi-stage
generation prints:

```
[comfy] Preview_Only requested but workflow has no matching node — running full generation
```

Preview works fine. The warning is noise from a param that no longer exists in
any graph.

## The evidence

**Zero workflows carry the node.** `grep -l "Preview_Only" comfy_workflows/*.json`
→ 0 files. The only hits under `comfy_workflows/` are `generate_h3.py` and
`generate_ltx.py`, and LTX's is a **tombstone guard** that hard-fails the
generator if the title ever reappears — deliberate, keep it.

## The actual flow

```
commandExecutor.js:662   params['Preview_Only'] = payload.historyMode === true
                                                 ? false : (payload.previewOnly === true)
commandExecutor.js:683   params['Video_Latent.is_preview'] = params['Preview_Only']   ← the live key
comfyController.js:1225  sees Preview_Only, finds no node, WARNS, deletes both keys
```

`Preview_Only` is set **only** so line 683 can copy it. Nothing else reads it.
`previewStage.getInjectionParams()` (`PromptBoxControls.js`) returns `{}` — the
control injects nothing at all.

Proved live on LTX 2.3 Balanced (MPI-466): `is_preview: true` wrote node 470
`Output_Preview` instead of 457 `Output_Video`. The preview path works entirely
through `MpiStageLatents.is_preview`.

## Correcting the record

An earlier session left this in place, reasoning that narrowing the guard was a
fleet-wide change to a check that "still protects every other model". That is
wrong — no model has the node, so the guard protects nothing, and the keys it
strips would be silent no-ops anyway (a title matching no node is skipped
silently by the injector). Do not re-adopt that reasoning.

## Fix

1. `commandExecutor.js` — compute `Video_Latent.is_preview` directly from
   `payload`; stop putting `Preview_Only` into `params`. Keep the
   `historyMode === true → false` rule, it is real behaviour.
2. `comfyController.js:1225-1234` — delete the now-unreachable guard and its
   `clientLogger.warn`.
3. Stale comments that still describe the old design:
   - `PromptBoxControls.js:322` — claims the control sets a `Preview_Only`
     boolean node; it returns `{}`.
   - `MpiGroupHistoryBlock.js:1118`
   - `models.js:1251` (minimax-h3) and `resolveModelDeps.js:233` — both say the
     graph "picks between passes with `Input_Preview_Only` / `Input_Is_Continue`".
     Check what H3 actually uses now and correct, do not just delete.
4. `commandExecutor.js:832` mentions params "still built with the bare control
   name (Preview_Only, ...)" — re-read that comment after the change.

## Verify

- A multi-stage preview generation still writes `Output_Preview` (node 470 on
  LTX), not `Output_Video`. Read it off the engine `/history`, not off the run
  finishing.
- Preview → Continue still resumes from the staged latent.
- The warning is gone from the console.
- `npm test` green.

## Context

Found while validating MPI-466 (LTX i2v routes). Not MPI-466's doing.
