# MPI-603 - Retire the outpaint LoRA, and answer for the Character Sheet

Created 2026-08-22 out of the LanPaint bench session. Fabio deprecated
`flux2-klein-4b-outpaint` because LanPaint replaces the fill/removal path it was baked in
for, and authorised deleting it from R2 and HF. **The decision is made; only the ordering
is in question** - and the ordering is load-bearing, because doing the delete first breaks
released users and a shipped flow.

## Why this is a card and not a line in someone else's handoff

It was first written into the MPI-598 handoff as a constraint. That handoff is scoped to
wiring Klein 9B, so an agent working it has no reason to act on this - which is exactly how
a deprecation gets half-done. Fabio caught it. Hence a card.

## The blocker: the Character Sheet flow is a second consumer

```
comfy_workflows/flow_character_sheet.json  #708  LoraLoaderModelOnly
    flux2-klein\flux2-klein-4b-outpaint.safetensors   strength_model 1.1
```

The Character Sheet flow (MPI-504, **shipped**) is not the inpaint branch LanPaint
replaced. Removing the weight breaks it. **This flow needs its own answer before the
weight can leave R2** - either a LanPaint-based replacement for whatever the LoRA was
doing there, or a decision to keep the weight alive purely for this consumer.

Read `docs/playbooks/add-flow/existing-flows/` and the flow's graph around node 708 to
work out what the LoRA is actually contributing before replacing it. Do not assume it is
doing the same job it did on Klein's inpaint branch.

## Every in-repo consumer

| File | Node | Note |
|---|---|---|
| `comfy_workflows/klein_t2i.json` | #259, strength 1.1 | the `wf_type` 5 branch - what LanPaint replaces |
| `comfy_workflows/flow_character_sheet.json` | #708, strength 1.1 | **the blocker** |
| `comfy_workflows/raw/klein_t2i_template.json` | - | raw twin |
| `comfy_workflows/raw/flow_character_sheet.json` | - | raw twin |

Fabio removed it from his BENCH copy only. All four above are still live.

## The order, and why each step is where it is

1. **Answer the Character Sheet.** Everything else waits on this.
2. **Strip every in-repo consumer.** Edit the ComfyUI graph and re-sync - never the
   converted API file (`docs/playbooks/add-model/README.md` step 1).
3. **KEEP the dep entry in `loraDeps.js`, marked `// DEPRECATED (MPI-603)`.** Playbook
   step 3: `_orphanedDepIds` (`routes/downloadManager.js`) iterates `DEPS` and reclaims
   what no model protects. Delete the entry and the weight strands on the disk of every
   user who already downloaded it, untracked, with nothing in the app able to remove it.
   Also drop `'klein-lora-outpaint'` from Klein's dep list in `models.js:969`, where it is
   currently commented "baked; mandatory for the fill/removal path".
4. **Ship a release.** Until a build without the dep is out, every released user still
   fetches it.
5. **Only then delete from R2 and HF.** `rclone deletefile --s3-no-check-bucket`, verify
   HTTP 404. Re-uploadable from `G:\CubricModels` if this turns out wrong.

Doing 5 before 4 is the specific failure playbook step 8 names: *"A released build still
lists the dep, so deleting the object turns its install into a 404 rather than a clean
skip."* Klein shipped in 1.4.0.

## Related

- **MPI-602** - the LanPaint integration that makes this weight redundant on the Klein
  inpaint branch. This card should not land before that one proves out.
- **MPI-598** - Klein 9B. Relevant because **there is no 9B outpaint LoRA at all**, so the
  9B arm needs a decision about outpaint regardless of what happens here.
- `docs/models/klein/licences.md` line 88 - this weight is **not** a CivitAI weight; the
  by-hash lookup 404s. Check there before assuming a re-download path exists.
