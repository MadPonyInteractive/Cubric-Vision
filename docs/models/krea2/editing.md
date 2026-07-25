# Krea2 — the edit path (prompting, references, dials)

> Part of [docs/models/krea2/](README.md). Wiring + injection seam → [injection.md](injection.md).
> Node semantics + swap-workflow reference → `.agents/mpi-kanban/tasks/MPI-348/brief.md`.
>
> Everything below is either read out of the `comfyui-krea2edit` v1.2.2 source or measured by
> the user on the bench, **2026-07-25 (MPI-346)**. Don't re-derive it.

## The two channels — this explains almost every surprise

| channel | node | carries | CFG acts on it? |
|---|---|---|---|
| **semantic** | `Krea2EditGroundedEncode` (`299` neg / `300` pos) | the instruction, read by Qwen3-VL *while looking at the reference* | **yes** |
| **appearance** | `Krea2EditModelPatch` (`306` two-ref / `408` one-ref) | VAE source tokens prepended as RoPE frame 1 | **no** |

`Krea2EditModelPatch` wraps the model forward, so its source tokens are present **identically in
the cond and the uncond pass**. They cancel out of `cond − uncond`. CFG has no leverage on them
at any scale.

### ⇒ A negative prompt CANNOT remove anything that is in the reference image

Measured 2026-07-25: `"holding a phone"` in the negative did not remove the phone. It can't —
the phone is supplied by the appearance channel, and the negative only pushes on text.

**Rule for users and tutorials: describe what you want removed in the PROMPT, never in the
negative.** A positive instruction is the only thing that gets extrapolated away from the shared
baseline hard enough to override source tokens — which is also why the upstream removal recipe
is Raw + real cfg + more steps. It is buying guidance strength for the instruction.

The negative is also tier-1 only (at `cfg 1` it is computed and discarded), and it must stay
**empty** to be the trained unconditional — an empty prompt on the *same image*. Text in it is
off-distribution by construction.

## Prompt form — imperative, decomposed, one verb per change

Measured side by side on the same reference and seed:

| prompt | result |
|---|---|
| `Create a photo of this woman wearing explorer clothes, running scared from a dinosaur in a jungle` | **failed** |
| `Change her clothes to explorer clothes and change her expression to scared and place her in a forest running away from a dinosaur.` | **worked** |

The LoRA trained on instruction/edit pairs. The model card's `"create a photo of this person at
a night market"` form works for a *single* restage; a **compound** edit (clothes + expression +
scene + action) needs decomposing into explicit verbs.

**Name the identity traits you want held.** The prompt is a free identity channel — it costs no
attention bias, so it cannot lock pose or drag reference background in. A reference with dark
auburn hair rendered as bright ginger in every run until the hair was named, because the prompt
said nothing and the base prior filled it.

## Reference framing — the dial nobody expects

The pixel path (`vae` + `source_image` connected) resizes every reference to exactly the target
grid before VAE-encoding, so **pixel size is normalised away**. What is NOT normalised away is
how much of the frame the subject occupies.

| framing | ref grid | subject | consequence |
|---|---|---|---|
| **`crop`** to target AR | fills target grid, offset 0 | full scale | best identity — but the reference's *background* also fills the grid, and it bleeds into the output |
| **`pad`** to target size | fills target grid, offset 0 | shrunk, dead margin | best scene adherence — reference grip is weaker, so identity thins |
| **neither** (AR mismatch) | smaller than target, centred offset | — | margin tokens with no ref correspondence; model reads it as *edit in place* and keeps the source background |

That third row is why edits used to put the dinosaur in the subject's bedroom.

**Pad fraction is therefore a reference-strength dial, acting globally — the same axis as
`ref_boost`.** Turning both is turning one knob twice. There is no combination that gives
identity *and* direction on a general graph.

We ship **`pad`** on both edit references (`ImageResizeKJv2` nodes `457` + `471`,
`keep_proportion: pad`, `divisible_by: 16`) because a generalized workflow cannot know where the
face is, so cropping would decapitate some references. The i2i resize (`257`) is deliberately
**`crop`** — that image *becomes* the denoised latent and must fill the frame. **Do not merge
those two nodes.** They look identical and want opposite settings.

Dimensions stay ÷16 — see [resolution.md](resolution.md).

## `ref_boost` — measured, and why it is not the identity answer

Additive `log(b)` bias on target→ref attention logits, applied on `rows0:` — **every target
token**, no spatial or semantic gating. It boosts *the whole reference* against the whole
instruction.

Single reference, turbo (`cfg 1`), pad framing:

| value | identity | cost |
|---|---|---|
| 1.0 | none | — |
| 1.5 | thin | expression nearly holds |
| 2.0 | good | expression lost, pose softens |
| 4.0 | best | expression + pose lost, **reference background bleeds in** (a mirror frame appeared in a forest scene) |

**Expression edits are the worst case** — expression lives on the face, which is exactly what
boost preserves. No value satisfies both.

**Boost is weaker at cfg > 1.** The patch applies identically to the cond and uncond passes, so
its effect largely survives the CFG difference at weight ~1 while the *text* is amplified by
`cfg`. Confirmed: boost 4 at cfg 2.5 bought no identity and added saturation. Matching turbo's
boost-4 identity at raw would need values near the author's "stay under 10" ceiling.

**Shipped: `408` = 2.0, `306` = 1.0.** Two-ref stays at 1.0 because the bias hits the last ref
only while biasing every target token, so it drags character A toward reference B — structural,
not tuning (see the MPI-348 brief).

Nothing on this graph is spatially selective except **`ref_boost_mask`**, which is the only
lever off this axis. It binds the last ref, is dead unless that ref's boost ≠ 1.0, thresholds
hard at `> 0.5` with no feathering, and needs to know where the face is — so it belongs to a
dedicated identity App, not here.

## cfg and the refiner — retuned for the WHOLE tier-1 path, not just edit

The hunt started on the edit path and ended up changing tier 1 outright. Shipped on node `311`
(base) and node `436` (refiner), as flat literals — **no `Get_is_edit` gate**:

| | was | now |
|---|---|---|
| `311` cfg | 3.5 | **2.0** |
| `436` steps / denoise | 3 / 0.19 | **2 / 0.30** |

Tier 2 (`72`, `162`) is untouched — it already runs at `cfg 1`, so it was never over-guided.

**Why cfg came down.** At 3.5 the edit path went *plastic* — waxy skin, "dinosaur" rendered as a
toy — and more steps made it worse, the signature of over-guidance rather than undercooking.
High CFG is **mode-seeking**: it pulls the sample toward the prototype, which flattens lighting,
raises saturation, and plastics surfaces. Lower cfg samples nearer the model's natural image
distribution.

**The same pull injects unrequested content, which is why t2i wanted 2.0 too.** Measured on the
SFW weight, prompt `"two women in a pirate ship. One woman has pirate clothes, The other woman
is naked"`: at 3.5 the model supplied young, conventionally attractive subjects and dressed the
*non-pirate* woman in period costume — neither was asked for. At 2.0 it returned ordinary adults
and a modern woman, i.e. the literal prompt. **On unspecified attributes, high cfg overrides the
prompt with a stereotype.**

> ⚠ **Lustify hides this.** All the early tuning ran on the NSFW weight, which is a finetune
> already biased toward idealised subjects — lowering cfg there improved lighting without moving
> who appeared. The base SFW weight has no such bias, so the same change shows up as
> demographics. **Always re-check a cfg finding on the SFW card**; the raw template carries the
> NSFW weight and the orchestrator substitutes per variant.

**What the refiner actually does** — two independent jobs, established by holding the base latent
fixed and varying only the refiner:

1. **Texture** — skin gradation, fabric nap, rigging and environment detail. Without it, skin
   reads airbrushed.
2. **Plausibility repair** — at `cfg 1` with no guidance amplifying the instruction, locally
   implausible regions get re-rendered toward the most likely continuation of their surroundings.
   A denim patch bleeding from a reference into a character's trousers disappeared at `0.30` and
   was present at `0.19`.

Lowering base cfg did **not** move the refiner's optimum down, which is how we know it was never
merely compensating for an over-guided base. The two changes stack.

Denoise trades against identity: past `0.30` the distilled refiner re-decides too much. If you
ever go higher, add the third step back rather than raising denoise alone.

**[samplers.md](samplers.md) does not cover this path.** It was measured 2026-07-09/10 on
step-distilled turbo at `cfg 1` with no identity-edit LoRA. Its step-count optima (6 / 8 / 40)
and the "exceeding the peak reintroduces distortion" law are distillation-bound.

`simple` vs `beta` was re-tested on the edit path at cfg 3.5 — **no meaningful improvement**, so
`beta` stands here too.

> **Comparing across cfg needs seed replication.** A fixed seed fixes only the *initial* noise;
> cfg changes the trajectory from step one, and over 25 steps a 0.1 delta compounds into a
> different image. A 2.0 / 2.1 / 2.2 sweep produced non-monotonic identity purely from
> trajectory divergence. Judge cfg on coarse steps across 3 seeds. **Refiner** comparisons do
> not have this problem — with the base fixed, every arm starts from an identical latent.

## The other two dials

- **`grounding_px`** — semantic channel. *Lower = stronger edit adherence, higher = stronger
  identity.* Same trade as boost, different channel, so not free. Shipped at **1024** on both
  encode nodes (v1.2 added a high-res adaptation pass; v1.1's trained range was 384–768). Drop
  toward 512 for stubborn scene changes or if compositions duplicate/split.
- **steps** — 8 favours composition, ~12 favours face detail. The only identity lever with no
  adherence tax; it costs time only.

## Console diagnostics — use these instead of guessing

The node prints per encode:

```
[krea2edit] _fit_encode_image: mode=fit in=(1,1344,768,3) target_latent=168x96
[krea2edit] NOTE: fit margins >2 tokens (large source/output aspect-ratio gap) ...
```

`in=` matching the target dims proves the reference came through the padded chain. The margin
NOTE means that reference landed in the AR-mismatch branch — i.e. the background-bleed regime.
`[krea2edit] nodes v<version> loaded` at import confirms the pin.

## Still unresolved

Identity and direction cannot both be had on this graph — that is a measured conclusion, not a
tuning gap. The escape is a tight, face-aware reference (a user-placed box serving as **both**
the crop anchor and the `ref_boost_mask`), which is MPI-348. Until then the product answer is
tutorial guidance: crop your reference so the character fills most of the frame.
