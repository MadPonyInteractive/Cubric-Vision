# MPI-556 Validation

## What shipped

`_snapshotControlState` (`js/services/generationService.js`) now corrects its three buckets
against the run's own `injectionParams` instead of recording the open project:

- `reconcileControlsFromInjection` (`js/components/Organisms/MpiPromptBox/PromptBoxControls.js`)
  asks each visible control what its recorded value WOULD have injected, and only touches a
  control the run contradicts. The run's value is recovered by round-tripping the injected
  value back through the control's own `getInjectionParams` — every passthrough control
  inverts on the first try, and a control that MAPS its value (`controlType`'s id → index)
  fails the round trip and is **dropped** rather than guessed at. No hand-maintained key list.
- `qualityTier` injects nothing, so only the run's pixels place it: derived through
  `ratioSettingsFromParams` (newly exported from `js/utils/promptReuse.js` — one table walk,
  reached by its own internal caller at `promptReuse.js:380`, by `generationService.js:482`,
  and by the new test) and written into the per-model bucket AND the legacy shared copy.

## Evidence — non-GPU leg: PASSED

`node --test tests/control-snapshot-injection.test.cjs` → **7/7 pass**. Both live-proven
cases run end to end through the real wired snapshot, the real ModelDefs and the real ratio
tables:

- `t2i_007` klein-4b with raw `Input_Style_Selector.selector=7` / `.strength_model=0.65` →
  `controlState.model` records 7 / 0.65 (used to record 0 / 1.0, which is what Reuse restored).
- `t2i_006` krea2 at 1024×1024 in a project holding `qualityTier: "2k"` in BOTH buckets →
  the sidecar records `1k` in both (used to record 2k in the per-model bucket, so the QUALITY
  toggle read 2K against a 1K card).
- A PromptBox dispatch — where the project IS the run — reconciles to a byte-identical no-op.
- An empty injection record changes nothing.
- An uninvertible contradiction (`controlType`) is dropped, never recorded wrong.

Full suite `node --test "tests/*.test.cjs"` → **805/805 pass** (was 798 before this card; +7).
`npm run lint` → clean.

## Evidence — GPU leg: PASSED (2026-08-30, Fabio's own card, GPU lease held)

Run in Fabio's live app on `:3000` with his explicit approval, into a throwaway project
`Documents/Cubric Vision/Projects/MPI-556 sidecar check`.

**Deviation from the plan:** the card's first case was klein-4b, whose weights are not
installed on this machine (`OP_UNAVAILABLE`; klein-9b is what is on disk). krea2 carries the
same style rack and is the card's OTHER proven case, so both halves were run as ONE krea2
image — style index 7 (`Soft Water Color`) at strength 0.65, forced to 1024×1024, in a
project deliberately seeded to `qualityTier: "2k"` in BOTH buckets.

Dispatch: `POST /connector/generate`, `modelId: krea2`, `operation: t2i`,
`injectionParams: { Input_Style_Selector.selector: 7, Input_Style_Selector.strength_model:
0.65, Width: 1024, Height: 1024, Ratio_Label: "1:1" }` → `ok: true`, 1024×1024, 117.6s.

Sidecar `Media/.meta/c43e2f6d-….json` → `generationSettings.controlState`:

```json
{ "shared": { "ratioSelector": { "selectedRatio": "1:1", "qualityTier": "1k", "orientation": "portrait" } },
  "model":  { "styleSelect": 7, "stylization": 0.65, "krea2Turbo": true, "enhancePrompt": false, "qualityTier": "1k" } }
```

Reuse, through the real `buildPromptReuseSettings` over that real sidecar:
**Style `Soft Water Color`, Stylization `0.65`, tier `1k` in both the model bucket and
`ratioSelector`.**

**Non-vacuous:** `project.json` still read `qualityTier: "2k"` in both buckets and held no
`styleSelect` at all (so the control would resolve to `0` = None). Those are exactly the
values the old snapshot copied in — Style=None, Stylization=1.00, QUALITY=2K against a 1K
card. The sidecar contradicted the project and agreed with the run.

**The artefacts are gone, by request.** Fabio asked for the throwaway project to be deleted at
close-out, so the sidecar quoted above is no longer on disk and this block is the only record
of it — the claim auditor correctly reports it UNVERIFIABLE rather than proven. The repeatable
half is `tests/control-snapshot-injection.test.cjs`, which encodes the same two cases.

## Correction to the card's own diagnosis

The card (and `js/data/projectModel.js:402`) say `qualityTier` is SHARED state and the
`modelSettings` copy is leftover. That is backwards as of SCHEMA 4 / MPI-133: the tier
control mounts from `modelSettings[modelId].qualityTier` and falls back to
`shared.ratioSelector.qualityTier` only for unmigrated projects, and `buildPromptReuseSettings`
prefers the model bucket too. So the per-model copy is the LIVE one — which is exactly why
the 2k it carried won. Both copies are now written from the run.
