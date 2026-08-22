# MPI-600 verdict — which 9B weight MPI-598 should ship

Bench: standalone `G:\ComfyUi` (port 8188), ComfyUI 0.31.0, RTX 4060 Ti **16380 MiB**.
All numbers from `results.md` § **CURRENT MATRIX**; placement scored by eye off
`S2_contact_sheet.png`. Every run frees the bench first, so VRAM is attributable and wall clock
includes an equal RAM→VRAM load for every arm.

**Read `format.md` § "Leg A pass 2" before trusting any earlier draft of this card.** Three
corrections landed on the S2 scenario mid-bench, each of which voided the runs before it.

---

## STATUS: DECIDED (Fabio, 2026-08-22). The weight question is closed.

**Ship `flux-2-klein-9b-int8-convrot.safetensors` (distilled INT8) with CLIP
`qwen_3_8b_int8_convrot.safetensors`. That is the whole model answer — one transformer, one text
encoder, no LoRA, no toggle, no KV.**

The earlier PROVISIONAL hold is lifted. What closed each open item:

1. ~~**The KV leg has to be re-run properly, with MORE THAN ONE reference image.**~~ **RUN — §4
   and `results_kv.md`.** It found a real 2.4–3.2× *sampler* speedup, but **1.27–1.46× end to
   end**, at a cost of +600–800 MiB on a card with ~340 MiB left, and only if a *second* 9.4 GB
   weight ships (the node on plain distilled produces the wrong picture). **Fabio ran his own KV
   test the same day — a pose request inside painting — and was not impressed.** The two readings
   agree: the end-to-end number is the one a user feels, and it does not justify the cost.
   **KV is rejected.**
2. ~~**Two repos — an inpainting approach for Klein 9B — have to be reviewed, so base stays on the
   table.**~~ **The model decision no longer waits on them** (Fabio, 2026-08-22). That review is
   running in a **separate session** and concerns the inpainting *approach*, not which transformer
   ships. `base` is dropped.

**Weights deleted from `G:\CubricModels\` on Fabio's instruction, 2026-08-22** — ~27.6 GiB freed:

| file | why |
|---|---|
| `flux-2-klein-9b-kv_int8_convrot.safetensors` | KV rejected — see §4 |
| `flux-2-klein-base-9b-int8-ConvRot.safetensors` | base rejected; this copy could not be loaded by native ComfyUI at all |
| `flux-2-klein-base-9b-int8-convrot-comfy.safetensors` | the converted base — rejected with base |
| `loras/klein_9B_Turbo_r128.safetensors` | turbo LoRA rejected — see §2 |

All four are re-downloadable from the HF repos named in `brief.md` if a decision is ever revisited.
Nothing in production was touched.

§1–§4 below are the measured record behind that decision.

---

## 1. Which format ships — INT8 ConvRot or fp8? Does 9B fit a 16 GB card?

**INT8 ships. fp8 is not needed. It fits, with ~500–800 MiB of headroom, and the margin is the
same for every candidate.**

- INT8 loads and executes on **core ComfyUI 0.31.0, no custom node**.
- Peak VRAM is **flat across all six arms and all three scenarios**: 14.2–15.9 GB peak against
  16380 MiB, 13.6–15.3 GB attributable. **The turbo LoRA costs nothing measurable.**
- The rank-128 turbo LoRA **does** apply to an INT8 ConvRot base — 121 patches attached vs 0
  without, no unmatched keys. There is no fp8-vs-INT8 asymmetry to manage.

Two format traps MPI-598 inherits:

1. **The downloaded base weight cannot be loaded by native ComfyUI at all.**
   `flux-2-klein-base-9b-int8-ConvRot.safetensors` (bertbobson) dies in the UNETLoader with
   `Unknown quantization format for layer double_blocks.0.img_attn.qkv` — its `comfy_quant`
   markers carry `{"convrot": true}` with **no `format` key**, and `comfy/ops.py:1163` raises on
   `None`. Converted with the uploader's own tool (vendored as `research/convert_to_comfy.py`);
   **ship `flux-2-klein-base-9b-int8-convrot-comfy.safetensors`**.
2. **The filenames lie.** `flux-2-klein-9b-int8-convrot` and `flux-2-klein-9b-kv_int8_convrot` are
   `{"format": "int8_tensorwise"}` with **scalar** `weight_scale` — plain tensorwise INT8, **not**
   ConvRot. Only the base arm is genuinely ConvRot. So base-vs-distilled carries a **quantisation
   confound** as well as a distillation one: any quality gap has two possible parents.

---

## 2. Does the turbo LoRA earn its place — is `turboToggle` a real control?

**No. Not as a quality/speed toggle on top of the base weight, and the base weight is the reason.**

Fabio's stated plan was one 9B base checkpoint plus a turbo LoRA, the toggle trading quality for
speed. The bench does not support it:

| arm | steps / cfg | S1 wall | S2 (placement) wall | places the man |
|---|---|---|---|---|
| base | 20 / 5.0 | **115 s** | **192 s** | **0 / 3** |
| base + turbo @1.0 | 8 / 1.0 | 32 s | 48 s | 2 / 3 |
| base + turbo @0.7 | 10 / 1.5 | 63 s | 102 s | 1 / 3 |
| base + turbo @0.35 | 8 / 3.5 | 52 s | 85 s | 1 / 3 |
| **distilled** | **4 / 1.0** | **20 s** | **28 s** | **2 / 3** |
| **kv** | **4 / 1.0** | **20 s** | **28 s** | **2 / 3** |

**The base end of the toggle is the worst arm on the board.** It is ~6× slower than distilled on
a whole-image edit and ~7× slower on a placement, and it scores **0/3** on reference-driven
placement — on all three seeds it ignored image 2 entirely and copied the *plate's own subject*
into the mask. A toggle whose "quality" position is slower **and** wrong is not a control worth
shipping.

Intermediate strengths do not rescue it either: 0.7 and 0.35 land at 1/3, worse than 1.0's 2/3
while costing 2–3× the time. **`turboToggle` is not a slider.** There is no monotonic
quality-vs-speed axis here to expose to a user.

On whole-image edits (S1/S3) all four Leg A arms produce clean, correct results once node 52 is
set properly — so the base arm is not *broken*, it is simply beaten on every axis that matters.

---

## 3. One checkpoint or two?

**One. Ship the distilled 9B. Do not ship the base weight, and do not ship the turbo LoRA.**

base + turbo @1.0 gets to 2/3 placement — the same score as distilled — but needs **8 steps and
32–48 s** to do it, against distilled's **4 steps and 20–28 s**, plus a second file to download,
hash, host and version. It buys nothing distilled does not already have.

That collapses the shipping decision to **one checkpoint, no LoRA, no toggle**. MPI-598 should
wire `flux-2-klein-9b-int8-convrot.safetensors` at **4 steps / cfg 1.0**.

**Caveat, stated plainly:** distilled is 2/3, not 3/3. On seed 202 it placed nothing — the masked
region came back as plain road. Reference-driven placement is **not reliable on any 9B weight
tested**; the best three candidates all sit at 2/3. That is a real product limitation for the
character-placement flow and it is not a reason to prefer a different weight, because no weight
tested does better.

---

## 4. Is KV a free speedup on our edit shape — what is the honest multiplier?

**ANSWERED 2026-08-22. Yes — 2.40x at 2 references and 3.18x at 3, at 1024x1024 — but only with
the KV weight underneath it.** Full leg in `results_kv.md`, 16 rows, sampler-only seconds, two
seeds per cell agreeing to within 1 s.

Shape, as Fabio scoped it: `wf_type` 4, **no mask**, an empty background plate plus two different
people, both placed into the plate. `FluxKVCache` added to the bench graph as node **900**, fed
from node 100 and reached only when an arm rewires `170.model` to it — so it is inert on every
other arm and never touches the t2i path.

### The multiplier, with its ref count and resolution attached

| refs | uncached | cached | speedup |
|---|---|---|---|
| 2 (plate + 1 person) | 18.0 s | 7.0–7.5 s | **2.40–2.57x** |
| 3 (plate + 2 people) | 27.0 s | 8.5 s | **3.18x** |

It **scales with reference count**, which is the whole claim: 2 -> 3 refs costs the uncached arms
50% more sampling and the cached arms ~13%. This beats the card's own "expect ~1.40x" estimate,
because that estimate assumed 1 reference — and a Klein edit feeds the **plate in as a reference
too**, so the cheapest real edit already carries 2.

Wall clock would have hidden most of this: ~73% of a run here is constant RAM->VRAM load (the
bench is freed before every run so the VRAM column stays honest). The instrument is the sampler's
own progress bar, read off `/internal/logs/raw`.

### The speedup is the NODE, not the weight

`kv` with the node **off** is **1.00x** against `distilled` — 18.0 s and 27.0 s, matching to the
second. So Leg C's earlier 1.00x was not a bad measurement; it was the correct measurement of a
graph with no cache node in it.

### But the node needs the KV weight to stay CORRECT — and no number shows this

`distilled+node` and `kv+node` post the **same 8.5 s and the same VRAM**. Only the images
separate them, on both seeds and both reference counts:

- **`distilled+node` breaks.** The plate is replaced (different road, blue sky instead of golden,
  farm buildings appear, the tyre tracks and long shadow gone), and the references drift — the
  denim jacket becomes a denim shirt with a belt, the long yellow raincoat becomes a yellow shirt
  with an olive skirt.
- **`kv+node` holds.** Plate preserved down to the tyre tracks and the cast shadow; both people
  arrive wearing what the reference images show. Against `kv` with the node off it is
  near-indistinguishable.

**So quality parity passes for `kv` + node and fails for `distilled` + node.** The weight and the
node are a matched pair — which is presumably why a separate KV checkpoint exists at all rather
than just a node. The extra 9.4 GB earns its place on *correctness*, not on speed.

Worth stating plainly because it is this card's recurring failure mode: `status: success`,
plausible timings, plausible VRAM, invalid image. Contact sheet: `kv_contact_sheet.png`.

### The cost is VRAM, and it is the binding constraint

The cache holds the reference k/v tensors: **+600–800 MiB attributable**. Worst peak across the
leg is **16037 / 16380 MiB — 343 MiB of headroom** (`distilled+node`, 3 refs; `kv+node` is
16011). Uncached 3-ref arms sit at 15334–15856.

That is tighter than the ~690 MiB Leg 0 recorded, and it is what MPI-598 should carry as the 9B
note. A fourth reference, or an output above 1024, has nowhere to go on a 16 GB card.

**Not measured:** resolutions above 1024x1024 (the multiplier falls as target tokens grow), 4+
references (where BFL's 2.5x headline sits, and where the VRAM ceiling above may block us
anyway), and the masked/localised edit (finished on this card, deliberately out of scope).

---

## Recommendation for MPI-598 — PROVISIONAL, see the STATUS banner at the top

**Ship `flux-2-klein-9b-int8-convrot.safetensors` (distilled), 4 steps, cfg 1.0, CLIP
`qwen_3_8b_int8_convrot.safetensors`, VAE `flux2-vae.safetensors`.** One transformer. No turbo
LoRA, no `turboToggle`, no KV weight, no `FluxKVCache`. INT8, natively loadable, ~15 GB peak on a
16 GB card.

**Leg D briefly reopened "one checkpoint or two" and then closed it again.** KV is a genuine
2.4–3.2× *sampler* speedup, but **1.27–1.46× end to end**, it needs a second 9.4 GB weight to stay
correct, and it costs +600–800 MiB on a card with ~340 MiB of headroom. Fabio's own test the same
day (a pose request inside painting) reached the same conclusion independently. Rejected.

What is also settled is that the
**`turboToggle` shape is dead** — that conclusion rests on base and the three LoRA strengths being
measured against each other, and no repo or KV result changes it.

Open items MPI-598 should carry, none of which block the weight choice:

1. **KV was measured and REJECTED** (Q4, `results_kv.md`). Kept here because the reasoning matters
   if anyone proposes it again:
   - The speedup is real but the honest figure is **1.27–1.46× end to end**, not the 2.4–3.2×
     sampler slice. Sampling is only ~27–45% of a run.
   - It needs **both** halves — the node **and** the separate 9.4 GB `kv` weight. `FluxKVCache` on
     plain distilled runs at the same speed and produces the wrong picture: the plate is rebuilt
     (border delta 40.9/255 against 9.3 for the baseline) and the referenced garments drift.
   - It costs **+600–800 MiB**, putting a 3-reference 1024² edit **~340 MiB under a 16 GB card's
     ceiling** — the tightest figure on this card.
   - Fabio tested it independently on a pose request inside painting and was not impressed.
   - The weights are deleted. Re-download from the repos in `brief.md` if this is ever revisited.
2. **Reference-driven placement is ~2/3 at best on 9B.** Whatever flow consumes it needs to expect
   a retry, and the failure is silent — the output looks clean, it just did the wrong thing.
3. **A rectangular seam is present on essentially every localised placement** — a patch of the
   reference image's own background bleeds inside the mask and the horizon steps at the mask edge.
   This is a *scenario/graph* property, identical across weights, so it is a workflow problem for
   MPI-598, not a weight problem.
4. **Never route a 9B arm through `wf_type` 5.** That branch depends on a 4B outpaint LoRA
   (node 259, strength 1.1) which cannot apply to 9B. The localised edit is **`wf_type` 4 with a
   mask supplied**.

## What the numbers could not do

Three faults on this card produced perfectly plausible wall-clock, VRAM and seam numbers while the
images were invalid, and a fourth was in the measuring instrument itself (a green test that scored
a visibly half-green frame at 0.00%). **Every headline on this page rests on looking at the
outputs.** The `guard` column reads `green 0.00% / clip 0.1%` — flawless — on all 18 S2 rows,
including the nine where the arm placed the wrong person or nothing at all.
