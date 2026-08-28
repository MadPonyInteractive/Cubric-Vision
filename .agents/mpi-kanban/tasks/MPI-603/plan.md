# MPI-603 Plan — retire the outpaint LoRA, and give the Character Sheet its own answer

## Current State (2026-08-28, after `5edce1f2`)

**The Character Sheet half is DONE and pushed.** Everything below the drift note describes
a LanPaint branch that no longer exists — read this section and `validation.md`, not it.

Shipped in `5edce1f2`: the whole-sheet backdrop repaint is gone, the composite is gated on
`Input_Remove_Head` and fills only the head hole with a colour sampled from a 32×32 crop of
the sheet, and the Anime + Cartoon recipes were rewritten. Fabio confirmed live on Anime at
turbo and non-turbo. `npm test` 773/773; the `flow-model-choice` trip-wire was rewritten
deliberately and mutation-checked (4/4 regressions caught).

**The only thing left on this card is the deprecation's release-gated half, and the order
is a correctness constraint, not a preference:**

1. Ship a build that no longer lists `klein-lora-outpaint` in Klein 4B's deps (the dep
   itself was dropped from `models.js` in `7d72f0b6`).
2. **Only then** delete the weight from R2 and Hugging Face.

Doing 2 before 1 turns every released 1.4.0 install into a 404 instead of a clean skip.
The `loraDeps.js` `DEPS` entry must survive either way — `_orphanedDepIds` reads `DEPS`, so
deleting it strands 72 MB on every existing user's disk.

## Plan Drift

- **2026-08-27 (`19ec571c`, Fabio):** the LanPaint head-removal branch this plan was written
  to build was deleted outright. Head removal became pure compositing. Everything under
  "The branch as it stands", "Target" and "Steps" below is history from that point.
- **2026-08-28:** a BiRefNet subject matte, then a SAM3 `background:3` matte, then no matte
  at all. Root cause of the visible defects was never the matte — it was a fixed `0x808080`
  plate against a backdrop the model generates anywhere from RGB 137 to 200, plus the word
  `flat` used 3–4× in the Anime and Cartoon recipes. Full write-up:
  `docs/playbooks/add-flow/existing-flows/character-sheet.md`.

---

## Historical — the LanPaint re-author (superseded, kept for provenance)

Scope for THAT session, per handoff `d02f766e`: the graph re-author plus the
`loraDeps.js` comment heal. Steps 3–5 of `brief.md` (drop the dep from Klein's list in
`models.js`, ship a release, delete from R2/HF) are the deprecation's *later* half and are
deliberately NOT in this session — `js/data/modelConstants/models.js` is live-claimed by
MPI-607 as of 2026-08-23T12:05Z.

## Ownership

- `comfy_workflows/raw/flow_character_sheet.json` (source of truth — hand-laid-out)
- `comfy_workflows/flow_character_sheet.json` (GENERATED — never hand-edited)
- `js/data/modelConstants/loraDeps.js` (the `klein-lora-outpaint` comment only)
- `docs/models/klein/README.md`, `9b.md`, `removal.md` (statements that go stale when the
  LoRA leaves the last graph)

## The branch as it stands

Two nested crop/stitch pairs. The INNER one is the pre-LanPaint recipe:

```
#718 InpaintCropImproved
  cropped_image ──► #713 ImageCompositeMasked.destination
  cropped_mask  ──► #713.mask                      (#716 EmptyImage 65280 ──► #713.source)
#713 ──► #710 VAEEncode ──► #697 SamplerCustomAdvanced.latent_image
                       └──► #707 ReferenceLatent.latent
#712 CLIPTextEncode "Remove the head, leaving only the clothes behind." ──► #707
#707 ──► #699 CFGGuider.positive ; #707 ──► #706 ConditioningZeroOut ──► #699.negative
#708 LoraLoaderModelOnly (flux2-klein-4b-outpaint @ 1.1) ──► #699.model AND #687 ToBasicPipe.model
#700 KSamplerSelect / #702 RandomNoise / #704 Flux2Scheduter(steps 2) ──► #697
#697 ──► #698 VAEDecode ──► #696 InpaintStitchImproved
```

The green plate DESTROYS the head pixels and the sampler repaints the WHOLE crop. That is
the workaround the outpaint LoRA existed for.

## Target

```
#718.cropped_image ──► #710 VAEEncode ──► #707 ReferenceLatent.latent
                                     └──► NEW SetLatentNoiseMask.samples
#718.cropped_mask  ──────────────────────► NEW SetLatentNoiseMask.mask
#712 ──► #707 ──► NEW FluxGuidance(4) ──► NEW LanPaint_KSampler.positive
             └──► #706 ConditioningZeroOut ──► LanPaint.negative
#711 Get_klein model ──► LanPaint.model  AND  #687 ToBasicPipe.model   (no LoRA)
#703 Get_seed ──► LanPaint.seed
LanPaint ──► #698 VAEDecode ──► #696 InpaintStitchImproved            (both unchanged)
```

Deleted: `#708` (outpaint LoRA), `#716` (green plate), `#713` (its composite), and the
sampler chain the plate needed — `#697 SamplerCustomAdvanced`, `#699 CFGGuider`,
`#700 KSamplerSelect`, `#702 RandomNoise`, `#704 Flux2Scheduler`, plus the two `MpiReroute`
W+H feeds that then have no consumer (`#705`, `#717`).

Added: `SetLatentNoiseMask`, `FluxGuidance`, `LanPaint_KSampler`.

### One deliberate departure from brief.md

`brief.md` writes the target as "`SetLatentNoiseMask` (fed by a `GrowMaskWithBlur`)",
copying `flow_scribble_object` #164. **No `GrowMaskWithBlur` is added here, on purpose.**

Scribble needs one because its mask is a hard filled rectangle out of `MpiBoxMask`; the
node (expand `-96`, blur `96`) is what turns that box into a soft blob. The Character
Sheet's mask is `#718 InpaintCropImproved.cropped_mask`, and that node already ran
`expand(mask_expand_pixels=40)` → `expand(mask_blend_pixels=32)` → `blur(sigma 16)` →
`hipass(0.1)` before returning it (`inpaint_cropandstitch.py:1396-1411`, read on the bench).
A second feather would soften an already-feathered mask, and a shrink would uncover head
pixels — the exact thing a removal must not do.

`klein_t2i`'s shipped LanPaint branch — the closest twin, and the proven removal path —
also wires `cropped_mask` straight into `SetLatentNoiseMask` (#581 → #598 bypassed
MaskPreview → #653). This matches that.

## Steps

1. Card `todo → doing`, write `files.json`. → verify: board + task.json + both event logs.
2. Re-author `raw/flow_character_sheet.json` programmatically (delete 10 nodes, add 3,
   rewire 11 links). → verify: every surviving node's `pos`/`size` byte-identical; no
   dangling `inputs[].link` / `outputs[].links`; link back-pointers agree.
3. Regenerate `comfy_workflows/flow_character_sheet.json` with
   `COMFY_URL=http://127.0.0.1:48188 node scripts/workflow-to-api.mjs`. Baseline proven
   before the edit: the converter reproduces the committed API file with **0 diffs**.
   → verify: no `flux2-klein-4b-outpaint` anywhere in the repo's graphs.
4. Structural + type validation of the new API graph against 48188's `/object_info`.
   → verify: every required link-typed input connected, every COMBO value in range.
5. Live check: load the raw into the bench, `app.graphToPrompt()`, diff against step 3's
   output. → verify: 0 diffs.
6. Heal the `klein-lora-outpaint` comment in `loraDeps.js` and the three Klein docs.
   → verify: `grep -rn "second consumer"` returns nothing stale.
7. `npm test` on the affected files. → verify: green.
