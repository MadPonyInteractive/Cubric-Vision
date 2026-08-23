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

**Re-verified 2026-08-23 by grep — the table below was STALE and is now down to ONE flow.**

| File | Node | Note |
|---|---|---|
| ~~`comfy_workflows/klein_t2i.json`~~ | ~~#259~~ | **already clean** — no `klein-4b-outpaint`, and node 259 no longer exists. LanPaint #652 does the job. |
| ~~`comfy_workflows/raw/klein_t2i_template.json`~~ | - | **already clean** |
| `comfy_workflows/klein_9b_t2i.json` | - | clean (never had it — no 9B twin exists) |
| `comfy_workflows/flow_character_sheet.json` | **#708, strength 1.1** | **the ONLY consumer left** |
| `comfy_workflows/raw/flow_character_sheet.json` | - | its raw twin |

So the deprecation is one flow away from done.

## The answer for the Character Sheet — Fabio, 2026-08-23

> *"The outpaint LoRA doesn't exist anymore because the outpaint LoRA was a workaround to
> do inpainting. Now that we have the LanPaint sampler, we no longer use the outpaint LoRA
> and its workaround."*

**There is no replacement weight to find.** The Character Sheet is not a special case doing
some other job — its head-removal branch is simply the LAST graph in the repo still running
the pre-LanPaint recipe. Verified 2026-08-23:

| graph | LanPaint | outpaint LoRA | green plate |
|---|---|---|---|
| `klein_t2i` / `klein_9b_t2i` | #652 | — | — |
| `flow_scribble_object` | #167 | — | — |
| **`flow_character_sheet`** | **none** | **#708** | **#716** |

So the work is: **re-author the head-removal branch onto LanPaint**, and #708 (the LoRA)
and #716 (the green plate `EmptyImage` at `color: 65280`, with its `ImageCompositeMasked`
#713) go with the workaround. `flow_scribble_object.json`'s blend phase is the shape to
copy — `InpaintCropImproved` → `VAEEncode` → `ReferenceLatent` + `SetLatentNoiseMask`
(fed by a `GrowMaskWithBlur`) → `FluxGuidance` → `LanPaint_KSampler` → `VAEDecode` →
`InpaintStitchImproved`.

The existing prompt on #712 — *"Remove the head, leaving only the clothes behind."* — is
already the right shape for LanPaint: MPI-367 established that the model now SEES under the
mask and an empty prompt is a no-op, so a removal must be an instruction that names its
target. Keep it.

**Then `loraDeps.js` needs its comment healed** — the `klein-lora-outpaint` entry still
says "it has a shipped second consumer in the Character Sheet flow
(flow_character_sheet.json #708)", which is what has been blocking the R2/HF delete.

## MPI-610 is waiting on this

[MPI-610](../MPI-610/) turns the head-removal phase into a **klein-4b / klein-9b** blend-model
slot. **There is no 9B outpaint LoRA and none will ever exist**, so that arm cannot be wired
while #708 is in the graph. Once this card lands, both arms are symmetric and MPI-610's blend
slot is unblocked. The two cards touch the SAME nodes in the same branch — run this one first,
or run them together.

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
