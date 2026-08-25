# MPI-617 - the Klein style-LoRA rack, seen from three sides

Umbrella over three cards that all land on the same weights, the same picker and the same
rack, but at different stages of their life:

| card | what it is | state |
|---|---|---|
| **MPI-614** | a cross-tier LoRA binds NOTHING and the run still reports success | correctness bug, live-caught |
| **MPI-613** | the LoRA cogwheel sits before the flow instead of beside the output | iteration-loop friction |
| **MPI-612** | 15 pre-rename weights still standing in R2, 7 on HF, up to 0.72 GB per user | cleanup, **release-gated** |

They came out of two consecutive sessions on the same subsystem: MPI-609 renamed and split
the Klein style weights (which created 612), and MPI-610 gave the Character Sheet a second,
Klein-side rack (which surfaced 613 and 614 in one live test).

## Why one umbrella rather than three loose cards

Not just theme - they share a **cause**. The Klein style LoRAs were split into
`styles/4b/` and `styles/9b/` under one `loras/flux2-klein/` root. That single decision is
what:

- makes a 9B weight selectable for a 4B run (**614**), because the picker filters one level
  above the split;
- leaves the old flat siblings sitting next to the new subfolders (**612**);
- and is exactly the rack a user wants to re-pick from after seeing an output (**613**).

Fixing 614 without knowing 612 is coming means writing a tier filter that the flat leftovers
would defeat on any disk that still has them.

## Verified state, 2026-08-24 - all three are open

Checked against the code, not the board:

- **614 - not done.** `loraFolder` appears **nowhere in the repo** (the field the card's own
  brief calls "a field that exists for exactly this" does **not** exist - correct that when
  the card is worked). Klein cards at `js/data/modelConstants/models.js:949` and `:1089`
  carry `loraStrengths: ['model']` and no tier scoping. `comfyController.js` has
  `lora_missing_*` only, and nothing that reads `ERROR lora ... shape ... is invalid`.
- **613 - not done.** The cogwheel is still only in the slide-over
  (`MpiFlowLibrary.js:303-305`); `MpiBaseFlow.js:1048` carries only the comment describing
  the cogwheel it lost. `ui:open-model-settings` still has exactly two listeners, both
  workspace Blocks.
- **612 - not startable.** MPI-609's rename (`2e263c2f`, 2026-08-23) is **not in any
  release**: `git merge-base --is-ancestor 2e263c2f v1.4.2` says NO, and v1.4.2 was stamped
  2026-08-15, 280 commits back. The card wants *two-three releases after* the one carrying
  MPI-609. Zero have shipped. Deleting now 404s a style-LoRA install for every live user -
  the exact damage the card exists to avoid.

## The root of 614, found while scoping this umbrella

`_filterByType()` in `js/components/Compounds/MpiModelSettings/MpiModelSettings.js:57`
scopes the LoRA list by **`model.type`** - the convention being that a subfolder under
`loras/` is named after the model type:

```js
const prefix = `${modelType}/`;
return files.filter(f => {
    const norm = f.replace(/\\/g, '/');
    return !norm.includes('/') || norm.startsWith(prefix);
});
```

Both Klein tiers share `model.type`, so both `styles/4b/` and `styles/9b/` start with the
same prefix and both pass. **The filter is one level too shallow for a model family whose
weights are not interchangeable across tiers.** That is the root cause, and it is a property
of the convention, not of Klein - any future family that splits weights below its type
folder inherits it.

Note the second half of 614 is a different defect with a different home: a LoRA that binds
nothing is silent everywhere, on every model, because ComfyUI treats unmatched keys as
warnings and finishes `execution_success`. A tier filter does not catch a corrupt or foreign
LoRA the user dropped in by hand. Both halves are in scope; see `plan.md`.

## Sequencing, and why 612 does not block the umbrella

Phases 1 and 2 are independent and disjoint (see the Parallel Batch in `plan.md`). Phase 3
is a calendar gate, not a dependency - **this umbrella can deliver phases 1 and 2 in full
and sit open on phase 3 for two-three releases.** That is expected, not a stall. Do not
close MPI-617 early by dropping 612, and do not start 612 to make the umbrella closeable.

## Members

- **MPI-614** - a cross-tier LoRA binds NOTHING and the run still reports success
- **MPI-613** - the LoRA cogwheel belongs on the flow RUN stage, not the Library slide-over
- **MPI-612** - GC the pre-rename Klein style LoRAs (R2 15 keys, HF 7 files, user disks)

Member cards stay open and keep their own briefs, which hold the detail this file does not
repeat - the evidence dumps, the reproduction, the R2/HF key lists.

## Related

- **MPI-609** - the rename and split that created the two-tier layout
- **MPI-610** - gave the Character Sheet its second rack; the session that surfaced 613/614
- **MPI-608** - built the per-slot cogwheel that 613 now moves
- `docs/models/klein/9b.md` - the 4B/9B rank difference (3072 vs 4096) and why the two LoRA
  sets are not interchangeable
