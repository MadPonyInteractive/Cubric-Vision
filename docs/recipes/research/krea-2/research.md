# Krea 2 — research findings

Version: **Krea 2** · Researched **2026-07-28** · Sources: [sources.md](sources.md)

Krea 2 is Krea's first from-scratch foundation image model — **not** a Flux
derivative. The pre-existing `flux-chroma-krea` recipe covers *FLUX.1 Krea dev*
(the Flux collaboration), a different model; the shared word "Krea" is the whole
reason Krea 2 looked covered when it was not.

---

## Q1 — Output format and length

**Prose, one cohesive paragraph.** Official docs recommend natural language;
`expansion.txt` rule 6 states "one cohesive paragraph. No bullets, JSON, or
markdown". [S1, S2]

**Length — sources conflict:**
- S1 (official): "Long detailed prompts yield best results, but the model is
  capable of generating high quality images with minimal prompt engineering."
  No hard token limit stated.
- S4 (fal): 5–20 words exploratory, **30–80 words controlled**.
- S5: no maximum; the Qwen3-VL context is large. Token pressure only becomes
  real when a *vision reference* is attached (~1026 tokens for a 1MP reference
  against a ~20-token prompt) — irrelevant to our text-only t2v path.

**Draft resolution (playbook 01 §1.3): `wordBudget` = 45–130 words.** The
restrictive source (S4) governs the floor of the useful range; S1's "long
detailed prompts" governs the ceiling. 130 words ≈ 170 tokens — comfortably
inside the encoder, and it forces the condense job to actually bite on a
230-word input. Flagged for the test loop to settle.

### Settled by Stage 1, 2026-07-28 — ceiling raised to 150

The loop settled it, as planned. **Final: target 90 words, instruction ceiling
130, accepted `wordBudget` 45–150.**

The 130 was **our own test-design number, not a model constraint** — no source
states a maximum anywhere. S1 recommends long detailed prompts; S5 records no
limit for text-only t2v (token pressure only appears with an attached vision
reference); S4's 30–80 is described as the *controlled* band, meaning
predictable output, not a cap.

Measured against it: on a deliberately extreme 241-word input, with every
required element covered, `gemma-4-abliterated:12b` produces **112–143 words,
mean 129** across 9 runs — straddling the cap at roughly a coin flip. That is
after the wording mechanisms were exhausted; they moved the mean from 146 to
129 and then saturated (`validation.md`). Every one of those runs scored
`intent=2 structure=2 format=2` and passed the independent `condensed` check.

So the ceiling was ~15 words tighter than what the model can hold while
satisfying the recipe's own element requirements, and nothing in the sources
asked for it. Raised to 150 (241 → 150 is still a 38% cut, so condense still
bites, and `condensed` proves shortening independently of any budget).

**The instruction still says 130**, deliberately: the model anchors to whatever
ceiling it is told, so the prompt aims low and the contract absorbs the spread.
Recorded in the recipe as a comment so the gap does not read as a bug.

### Re-opened and raised again, 2026-07-28 — on corpus evidence

**Current: target 150, instruction ceiling 180, accepted `wordBudget` 60–220.**

Fabio challenged the 90 ("that sounds like SDXL"). He was right, and tracing it
is damning: **90 has no source at all.** It appears in neither S1–S5 nor the
draft resolution — it is simply the midpoint of the draft 45–130 range (87.5).
The only source-backed length figure in the entire research pass is **S4's
30–80 "controlled"**, and S4 is a tier-3 partner guide whose numbers match
CLIP-era 77-token guidance rather than anything measured on Qwen3-VL.

Against that, the first evidence pass (`../candid-vocabulary-evidence.md`)
measured what people actually write. Deduplicated, per model:

| Model | n | median | p25 | p75 |
|---|---|---|---|---|
| **Krea 2 Turbo (official)** | 40 | **165** | 140 | 201 |
| Chroma | 72 | 106 | 70 | 120 |

So the 90-word target sat **below the 25th percentile** of real Krea 2 usage and
the 150 "hard" cap was about the **median**. Both raised.

**Consequence — the `overlong` tier was lengthened 241 → 410 words.** At a 220
ceiling a 241-word input is a 9% trim, which is not a condense test. 410 → 220
restores a 46% cut, slightly harder than the original 38%.

**STATUS: the 24/24 Stage 1 green was measured at 45–150 and is now STALE.**
These numbers have not been through a sweep. Re-run before trusting them, and
remember one green sweep is not green — confirm with a second.

## Q2 — Structure order

From the official examples [S1]: primary subject (with scale/perspective) →
visual style/medium → lighting & mood → colour palette → composition →
texture/medium specifics.

Reinforced by S5's encoder finding: **order carries emphasis.** The Qwen3-VL
encoder front-loads — whatever comes first reads as the subject.

### Correction, 2026-07-28 — the strict 6-element order was an over-reading

The first draft turned the list above into a hard "emit these six in exactly this
order" rule. **The sources do not support that**, and Stage 1 exposed it: every
remaining failure was `structure=1` on outputs that were otherwise good Krea 2
prompts, with `intent=2` and inside budget.

Re-reading the evidence:

- **S1** describes what the official *examples* happen to do ("the examples
  demonstrate effective ordering emphasizing…"). That is descriptive, not a
  stated rule.
- **S2 — Krea's own expansion prompt, rule 2** is the closest thing to a
  canonical instruction, and it asks for *grouping*, not sequence: "Write a
  prompt that a text-to-image model can parse cleanly. **Group subjects with
  their own attributes and actions.** Use grounded phrasing for poses,
  interactions, and spatial layout." **No element order is mandated anywhere in
  it.**
- **S5** supports exactly one ordering claim, and it is about position 1: the
  encoder front-loads, so whatever comes first reads as the subject.

**Resolution.** Two hard requirements, both evidence-backed:
1. **Subject first** (S5 — measured encoder behaviour).
2. **Each subject grouped with its own attributes and actions** (S2 rule 2).

The six elements remain as the *recommended flow* and as `structureOrder` for
the picker, but a rigid sequence is not required — and demanding one actively
fights S1/S2's "one cohesive paragraph", since natural prose interleaves
lighting with texture. Enforcing it was rejecting good output.

## Q3 — Vocabulary

Camera: extreme close-up, low-angle perspective, shallow depth of field, wide
establishing shot. Lighting: studio, cinematic, directional, soft diffused.
Style: digital painting, cel-shaded, stippled, vintage, surreal. Photoreal
(Krea 2 Large's strength): motion blur, film grain, low dynamic range. [S1, S4]

## Q4 — Failure modes

- **Keyword soup / CLIP weighting.** `(word:1.5)` does not do what it does in
  SD. The encoder reads whole sentences, so scaling one token's embedding
  "shoves the entire conditioning around instead of lifting that one word" [S5].
  This is the single biggest carry-over mistake from SDXL habits.
- **Style-adjective stacking** muddies output, especially when a reference image
  already carries the look [S4].
- **Over-specification** — inventing clothing, colours, materials the input
  doesn't support [S2 rule 5].
- **Medium pivoting** — silently turning "photo of" into an illustration
  because it's easier [S2 rule 9].

## Q5 — Negatives

No negative-prompt support documented in any source. → `negativeHandling: 'none'`.

## Q6 — What is unique

1. **Qwen3-VL-4B text encoder, chat-template driven** (system → user →
   assistant) rather than CLIP/T5. Language comprehension, not tag matching.
2. **Exploratory by design** [S3] — vague prompts are a legitimate entry point
   and produce diverse interpretations rather than one canonical reading. This
   directly justifies the *expand* job: a one-word input is normal user
   behaviour for this model, not misuse.
3. **Variant split** [S4]: Medium favours illustration/anime/painting; Large
   favours photorealism and raw aesthetics (motion blur, grain, low dynamic
   range). The recipe stays variant-neutral and honours whatever medium the
   user states.

## Q7 — Examples

The official examples are style-diverse single paragraphs leading with the
subject. **Not copied** (playbook: paraphrase, preserve citation) — the recipe's
`examplePrompts` are authored to the same shape, including the cross-model
"man walking in a park" baseline.

---

## Krea's own expansion prompt vs. ours

`expansion.txt` [S2] is the highest-authority artefact found: Krea's own LLM
system prompt for expanding user input. Our recipe aligns with its rules 1–7 and
9 (faithfulness, practical structure, internal style planning, exact quoted
text, no over-specification, one paragraph, respect existing detail, preserve
medium). Two deliberate divergences:

1. **We add a condense job.** Krea's prompt has no length ceiling and no
   instruction to cut an over-budget input — it only expands or "lightly
   polishes". Our four-job requirement (playbook 02 §2.3) needs the condense
   direction, and that is also what makes this recipe **non-redundant with
   Vision**, which self-enhances Krea 2 from scratch (Option A).
2. **We drop its rule 8** ("Respect the Human Form: assume clothing covers
   genitals and intimate anatomy"). That is a sanitising clause; Prompt runs
   uncensored local models deliberately (`uncensored-model-access`, MPI-13) and
   must not override what the user asked for. Recorded here so the omission
   reads as a decision, not an oversight.

## Conflicts left for the loop

| Conflict | Draft default | Settled by |
|---|---|---|
| "Long detailed" [S1] vs 30–80 words [S4] | `wordBudget` 45–130 | **SETTLED (Stage 1): target 90, instruction ceiling 130, accepted budget 45–150 — see Q1** |
| Exploration favours vagueness [S3] vs faithfulness-first [S2] | Faithfulness wins: expand *around* the stated subject, never replace it | Stage 1 `bare` tier |

**Readiness verdict:** ready to draft. Two tier-1 official sources including
Krea's own expansion prompt; the one open question (length) has a defensible
default and a test that will settle it.
