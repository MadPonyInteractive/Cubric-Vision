# MPI-603 Validation

## What shipped 2026-08-23

`flow_character_sheet`'s head-removal branch is off the pre-LanPaint recipe. **No graph in
the repo loads `flux2-klein-4b-outpaint` any more** —
`grep -rln "klein-4b-outpaint" comfy_workflows/` returns nothing.

Deleted (10 nodes): `#708 LoraLoaderModelOnly` (the outpaint LoRA @ 1.1), `#716 EmptyImage`
(the green plate, `color 65280`), `#713 ImageCompositeMasked`, and the sampler chain the
plate needed — `#697 SamplerCustomAdvanced`, `#699 CFGGuider`, `#700 KSamplerSelect`,
`#702 RandomNoise`, `#704 Flux2Scheduler`, plus the two orphaned `MpiReroute` W+H feeds
`#705` and `#717`.

Added (3): `#775 SetLatentNoiseMask`, `#776 FluxGuidance` (4), `#777 LanPaint_KSampler`
(steps 4, cfg 1, euler/simple, denoise 1, `LanPaint_NumSteps` 2, Image First, Image
Inpainting) — all deep-copied out of `raw/flow_scribble_object.json`, never hand-written.

`#712`'s prompt is unchanged: *"Remove the head, leaving only the clothes behind."* MPI-367
established the model now SEES under the mask, so a removal has to be an instruction that
names its target.

## Evidence

| check | how | result |
|---|---|---|
| converter is trustworthy for this file | ran `workflow-to-api.mjs` on the UNEDITED raw against 48188 and diffed against the committed API twin | **0 diffs** — so any later diff is my edit, not converter drift |
| no collateral damage to the user's layout | every surviving node's `pos`/`size` asserted byte-identical; node-level diff | exactly the 10 deleted + 3 new + the 9 rewired (`687 698 703 706 707 710 711 718 719`), nothing else |
| serialisation | asserted `JSON.stringify(g,null,2)+"\n"` reproduces the untouched file byte-for-byte BEFORE writing; empty output slots restored to their original `null`-or-`[]` shape per slot | diff is the change, not a reformat (normalising would have dragged 62 unrelated nodes in) |
| structural + type (bench-editing checks 1–2) | re-implemented `validate_node_input` against 48188 `/object_info`: class registered, required inputs present, link types overlap, every COMBO value in range | **PASS**, 88 nodes. Controls: the pre-edit baseline and shipped `flow_scribble_object` both PASS on the same validator |
| live (bench-editing check 3) | loaded the raw into the app engine's own frontend (48188, NOT the user's 8188 bench) via playwright, `app.graphToPrompt()`, diffed against the committed API twin | 138 nodes, **0 missing node types**, no node errors, 88 prompt nodes, **0 semantic diffs** |
| node suite | `npm test` | **726/726 pass** |

The only raw difference in the live diff was JSON **key order**, plus LanPaint's
frontend-only `"More Info, Bug Report, Star on GitHub ⭐"` button widget — which neither
`klein_t2i.json` nor `flow_scribble_object.json` carries either, and both ship and run.

Temp files created for the live check (`workflows/tmp_mpi603_check.json`,
`tmp_mpi603_prompt.json`) were deleted from the engine; the listing is clean.

## 🟡 The one check NOT done — a live run

**The branch has never been executed.** Everything above proves the server would receive
exactly the graph intended and that it validates; none of it proves the head actually comes
off. That is a GPU run, and it was deliberately not taken: the bench reported
**3.4 GB free of 16 GB** with `torch_vram_free` at 24 MB, so loading Klein 4B + the Qwen TE
would have evicted whatever the user has resident on their single card, and the app is live
on 48188.

**What Fabio needs to click:** Flow Library → Character Sheet, **Remove Head ON**, any
recipe. Expected: the head is gone and the clothes/neckline are continued, with no green
tint and no visible rectangle at the crop boundary.

Two things that would show up first if the port is wrong:

- **head survives** → the noise mask is not covering it. `#718 InpaintCropImproved` already
  returns a mask expanded by `mask_expand_pixels 40` + `mask_blend_pixels 32` and blurred at
  sigma 16, which is why no extra `GrowMaskWithBlur` was added (see `plan.md` § the one
  deliberate departure from the brief). If it needs more, raise `mask_expand_pixels` on
  `#718` rather than adding a node.
- **head replaced by a NEW head rather than removed** → `#777`'s `steps` (4). Klein's own
  removal measurements say fewer steps is better for a removal, because more denoising
  latitude inside the mask is more room to invent; the old chain ran 2. Drop to 2 before
  touching anything else.

## Still open on this card (NOT done, deliberately)

`brief.md` steps 3–5 are the rest of the deprecation and none of them belong to a graph edit:

3. drop `'klein-lora-outpaint'` from Klein 4B's dep list in `js/data/modelConstants/models.js`
   (currently commented *"baked; mandatory for the fill/removal path"* — now false).
   **NOT done: `models.js` is live-claimed by MPI-607** (heartbeat 2026-08-23T12:05Z).
   The `loraDeps.js` DEPS entry itself must survive regardless — `_orphanedDepIds` reads
   `DEPS`, and deleting it strands 72 MB on every existing user's disk.
4. ship a release without the dep;
5. only then delete from R2 and HF.

Doing 5 before 4 turns every released install into a 404 instead of a clean skip. Klein
shipped in 1.4.0.


---

## LIVE RUN — Fabio, 2026-08-23, prompt `998b97a2-bd28-4b80-b85a-c7569e43b752`

Read back out of the app engine's `/history` rather than taken on trust:

```
Input_Remove_Head     true                                          Input_Recipe 3 · Input_Quality 1 · Input_is_Turbo true
Input_Base_Model      krea2_raw_int8_convrot.safetensors
Input_Edit_Model      flux-2-klein-4b-int8-convrot.safetensors
Input_Edit_Clip       qwen_3_4b.safetensors
Input_Lora_Phase1_1   krea-2\style\krea2_kidsdrawing.safetensors
Input_Lora_Phase2_1   flux2-klein\styles\9b\Chibi.safetensors
LanPaint_KSampler     #777   steps 4 · cfg 1 · euler/simple · LanPaint_NumSteps 2
status                success · execution_success · outputs from 494 (Output_Image) and 673
```

**What this proves.** The LanPaint head-removal branch dispatched and executed with Remove
Head ON and returned an image — the workaround branch is gone and the replacement runs. And
**both LoRA racks reached the graph**, which is the whole of MPI-610's injection chain
(`flowLoraPhases` → `config.loraPhases` → the `runCommand` whitelist →
`Lora_Phase<N>_<i>` → the `Input_` alias pass → `comfyController`'s LoRA-object branch,
whose regex `^(?:Input_)?Lora_(?:[A-Za-z0-9]+_)?\d+$` does match a phase key).

**What this does NOT prove, and one of them is a real finding:**

- **Phase 2's LoRA bound NOTHING on this run.** `styles\9b\Chibi` is a 9B weight and the
  transformer was 4B; the engine log is a wall of
  `ERROR lora diffusion_model.single_blocks.N... shape is invalid`, every key rejected, and
  the run still finished green. So the visible difference in the output came from **phase 1**.
  Carded as **MPI-614** — the picker offers cross-tier weights and nothing surfaces a LoRA
  that binds nothing.
- **The `klein-9b` blend arm still has not been run** — this run resolved to 4B.
- **Nobody has confirmed the head comes off CLEANLY.** The branch executed and produced an
  image; whether the removal reads well is a visual judgement.

## 2026-08-28 — 🟢 FABIO ANSWERED THE VISUAL QUESTION: the head comes off CLEANLY

The one thing no test could settle. Asked at MPI-607's close-out, answered directly:

> *"603, I can confirm it does come off cleanly. Character sheet is working fine."*

So the LanPaint branch is **visually confirmed**, not merely confirmed-to-have-executed —
which is all the earlier note could claim (prompt `998b97a2`, `Remove Head` true, an image
out of `Output_Image`, nobody having judged it). The Character Sheet flow is confirmed
working in the same breath.

**This closes the JUDGEMENT half of this card only.** Brief steps 3-5 are still open
implementation: drop the dep from Klein in `models.js`, ship a build without it, then
delete it from R2/HF. Do NOT read this entry as the card being done.

**One blocker on those steps is now STALE and can be ignored:** the attention note said
`models.js` was "live-claimed by MPI-607". MPI-607 closed on 2026-08-28 and its file-claim
record no longer exists on disk, so nothing holds `models.js` any more.
