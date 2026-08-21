# Validation — MPI-456

**Overtaken. Closed 2026-08-09 on the user's call, with no work done under this card.**

The card's whole remaining scope after the 2026-08-07 split was the two WAN `_stage2`
twins. `ea9164c7 feat(MPI-452): drive both stages from one workflow file; WAN twins
deleted` removed both:

```
comfy_workflows/wan22_i2v_stage2.json
comfy_workflows/wan22_t2v_stage2.json
```

The LTX half went the way the split predicted — `92420fad feat(MPI-466): LTX to one graph
per tier` deleted all six.

**Measured 2026-08-09:** `ls comfy_workflows/*_stage2*.json` returns **zero files**. The
three surviving WAN graphs (`wan22_i2v`, `wan5b_i2v`, `wan5b_t2v`) each drive both passes
from one file, and `models.js` records the change in place — "the `_stage2` twins are
DELETED. … `resolveWorkflowFile` must stop appending `_stage2`", with `singleFileStages`
now set on 9 model entries.

**Not carried over.** The card's last line asked "the shared question of narrowing the
`_stage2` filename-swap path once no model needs it". The suffix logic is still in
`js/services/commandExecutor.js:1389-1390`, inert — no shipped model resolves through it.
Deliberately not re-carded: it is dead code with no user-visible effect, and the
`singleFileStages` flag already documents why it is unreachable. Delete it opportunistically
if that resolver is opened for another reason.

**Do not confuse with `_stage2BranchCounts`** in `MpiGalleryBlock` / `MpiGalleryGrid` — that
is branching-Continue counting, a different concept that survives this closure.
