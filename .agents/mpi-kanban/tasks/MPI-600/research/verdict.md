# MPI-600 verdict — which 9B weight MPI-598 should ship

Bench: standalone `G:\ComfyUi` (port 8188), ComfyUI 0.31.0, RTX 4060 Ti **16380 MiB**.
All numbers from `results.md` § **CURRENT MATRIX**; placement scored by eye off
`S2_contact_sheet.png`. Every run frees the bench first, so VRAM is attributable and wall clock
includes an equal RAM→VRAM load for every arm.

**Read `format.md` § "Leg A pass 2" before trusting any earlier draft of this card.** Three
corrections landed on the S2 scenario mid-bench, each of which voided the runs before it.

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

## 4. Is KV a free speedup on our edit shape — what is the honest multiplier at 1 ref / 1024²?

**NOT ANSWERED. The KV leg did not test KV.**

`FluxKVCache` is **not in the bench graph**. The KV arm therefore ran the `kv` weight as an
ordinary checkpoint with **no caching path active**. The measured parity — distilled 28.2 s vs kv
28.1 s on S2, 20.2 s vs 20.2 s on S1 — is exactly what a disabled cache predicts, so it is **not
a measurement of KV's speedup and must not be quoted as one**. `research/README.md` § "Still
owed" item 2 flagged this and it was not closed.

What the leg *does* establish: the `kv` weight **loads, runs and produces comparable quality** —
2/3 on placement, same VRAM, same wall clock as distilled. It is a viable weight; its headline
feature is simply untested.

To answer this properly: add `FluxKVCache` on the KV arm only, keep it off the t2i path, and
record **ref count and output resolution on every row** (BFL's own table gives 1.40× at 1 ref /
1024², and the number scales with refs and *inversely* with resolution). Also note our S2 shape
carries **two** images (plate + reference), so the applicable BFL figure may be the 2-ref row
(1.77×), not the 1-ref one.

---

## Recommendation for MPI-598

**Ship one checkpoint: `flux-2-klein-9b-int8-convrot.safetensors` (distilled), 4 steps, cfg 1.0.**
No turbo LoRA, no `turboToggle`, no base weight. INT8, natively loadable, ~15 GB peak on a 16 GB
card.

Open items MPI-598 should carry, none of which block the weight choice:

1. **KV is unmeasured** (Q4). If a reference-heavy edit op is on the roadmap, wire `FluxKVCache`
   and measure before deciding between `9b` and `9b-kv` — they are otherwise indistinguishable here.
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
