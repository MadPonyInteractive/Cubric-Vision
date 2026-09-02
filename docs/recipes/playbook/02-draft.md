# 2 — Draft

**Input:** the research record. **Output:** `js/data/recipes/{model-id}.recipe.js`
at `status: 'draft'`, parsing through `RecipeSchema` at module load.

---

## 2.1 Map findings to the schema

[`js/data/recipes/types.ts`](../../../js/data/recipes/types.ts) is the source
of truth — read it, don't restate it. The key is **model + mode**: ONE recipe per
model, with a `modes` map (`t2v` / `i2v`). A model offering both is one recipe
with two mode entries, never two recipe ids.

Recipe-level: `modelId` (kebab slug), `family`, `displayName`, `status`, `notes`.
Per mode: `outputFormat`, `lengthNorm`, **`wordBudget`**, `structureOrder`,
`vocabulary`, `dos`, `donts`, `negativeHandling`, `examplePrompts`,
`systemPrompt`, plus `acceptsMedia` / `multiScene` for i2v.

**`wordBudget` is not optional in practice.** It is the `{min, max}` the test
harness enforces, and without it the condense job cannot be checked — the recipe
is only ever graded on opinion. Convert research question 1 into that range
(English prose runs ~1.3 tokens/word; size the range against the model's real
token limit and leave headroom). Keep `lengthNorm` as the human sentence beside
it.

Copy the file shape from an existing recipe; mirror its comment density.

## 2.2 Write the `systemPrompt`

This is the whole product. Everything else in the schema serves the picker; this
string is what reaches the LLM, and it must work **self-contained** — the model
never sees the schema fields.

Structure that has held up:

1. **Role + target identity** — "You are a prompt engineer for <model>", one
   sentence on what that model is.
2. **Core behavioural rule** — the one thing this model needs and the one thing
   it rejects. The strongest signal in the whole prompt; put it early.
3. **Input handling — all four jobs, explicitly.** See below.
4. **Structural rules** — the element order, numbered or named.
5. **Vocabulary guidance** — concrete term lists, not "use good camera terms".
6. **Output-format rule** — bare prompt only, no preamble, no markdown, no
   quotes around the whole thing, ready to paste.

## 2.3 The four jobs — write all four or the recipe is half-built

The recipe must **detect which job the input needs** and do it. Name them
explicitly in the `systemPrompt`; a model that is only told "expand" will pad an
already-overlong input and blow the budget.

- **Too short → expand.** Add lighting, texture, camera, mood that *serve the
  stated subject*. Never swap the subject for a more photogenic one.
- **Disordered → rearrange.** Re-emit the same content in the model's element
  order. Every technical choice the user made survives the rewrite — if they
  said anamorphic and low-angle, both appear in the output.
- **Too long → condense.** Cut to the budget by dropping low-signal repetition
  and generic quality-spam ("8k, masterpiece, trending on artstation"), keeping
  the specific detail. Trimming, not paraphrasing into vagueness.
- **Vague / undescribable → infer intent.** When the user gropes for a word,
  reaches for a feeling, or garbles a term, work out what they were reaching
  for and express it in the model's vocabulary. Resolve it — do not echo the
  confusion, and do not silently drop it.

An instruction that carries all four in a few lines:

> Decide what the input needs before rewriting. If it is sparse, expand it with
> detail that serves the subject the user named. If it is already detailed but
> disordered, reorder it and keep every choice they made. If it exceeds the
> budget, cut it down — drop repetition and generic quality words, keep the
> specific ones. If part of it is vague or garbled, infer what they meant and
> say it in terms this model understands. Never invent a different subject.

## 2.4 Register — the optional fifth field, not a fifth job

`styleVocabulary` is optional and a new recipe should ship **without** it. When
you do add one, understand what it is: a register (`cinematic` / `general` /
`candid`) is a **cross-cutting property of all four jobs above**, not a job of
its own. All four still run — expand, rearrange, condense, infer intent — they
just resolve into different words.

The split: the register and the per-slot *intent* are model-agnostic and live
once in `js/data/recipes/styles.ts`; the **words** a particular model responds
to live on the mode, in `styleVocabulary`, keyed by style then by vocabulary
domain. `structureOrder` stays **identical** across styles — every style fills
every slot, only what fills it inverts.

Author the vocabulary **from a measured corpus, never from intuition** — both
sets guessed in the MPI-19 brief measured at ~zero against 209 real prompts.

Full process, the four extra test tiers, and the traps:
[06-registers.md](06-registers.md).

## 2.5 Conflicts

If sources disagree (80–120 words vs 200–300), record the conflict in `notes`,
default the draft to the **more restrictive** constraint, and let
[03-test-loop.md](03-test-loop.md) settle it — a budget that the model
consistently fails is evidence, not a defeat.

## 2.6 The negative prompt is for ARTEFACTS — never for the user's own intent

Only for recipes with `negativeHandling: 'separate-field'`, and it cost `sdxl` a
live defect (MPI-35 Finding 11, fixed 2026-09-02).

The negative prompt names **things you do not want rendered** — deformed hands,
extra fingers, blur. It is not a moderation lever, and Fabio notes even the
artefact use is model-dependent: several modern checkpoints need little or no
negative at all. **Nothing the user asked for ever goes in it.**

`sdxl` shipped a rule saying *"Add NSFW to the negative prompt whenever a style
tag could imply nudity"* — in the `systemPrompt`, in `dos` (so also in the
grading contract), and in all three exemplars. On the NSFW-capable checkpoints
Vision actually ships — SDXL-NSFW, Chroma, Wan Smooth, LTX+LoRA, **any model
with a LoRA** — that instructs the enhancer to negate the user's entire intent.
It came from one YouTube source, with the recipe's own `notes` admitting
*"checkpoint specificity unknown."*

**The mechanism is the part that generalises, and it is a POSITIVE-prompt fact:**

> *"The negative prompt does not need NSFW in it. The only time it would need
> that is if the prompt is too vague on an NSFW model… 'a woman lying on a towel
> at the beach' — you're most likely going to get a naked woman. 'a woman lying
> on a red towel wearing a red bikini' — the woman comes out dressed."*
> — Fabio, 2026-09-02

A checkpoint fills whatever the positive prompt leaves unstated. So **on an
NSFW-capable checkpoint an unstated detail is not neutral — it is a gap the
model fills**, and the control is stating it (clothing, state, covering) in the
positive block. That means every recipe's specificity job is already doing
safety work nobody wrote down. At the other end of the range the negative lever
does not work at all: against a LoRA trained purely on NSFW and pushed hard,
`NSFW` in the negative changes nothing. **Useless at both ends**, which is why it
is deleted rather than made conditional — a checkpoint-kind seam on `ModeRecipe`
was drafted for this and correctly thrown away.

Two rules for any recipe with a negative field:

- The negative block is a fixed artefact baseline. **No conditional rule may
  route any part of the user's request into it.** Delete the route, not just the
  instance — the shape is what gets reused.
- **State carry-verbatim unconditionally** next to THE SUBJECT IS FIXED. The
  user's vocabulary is the vocabulary the checkpoint was trained on, so a
  softened or clinical substitute is a token the model never saw and conditions
  on nothing. This is correct on an SFW checkpoint too: an SFW user's terms are
  SFW, so it needs no checkpoint knowledge to be safe to state.

And a check before you cite MPI-25's *"a slot is fixed by demonstration, not
instruction"*: **`examplePrompts` has no runtime consumer.** It reaches no
model — only `systemPrompt` text does. An exemplar there that contradicts the
instruction is stale documentation and a trap for the next author, worth fixing,
but it is not what the model saw.

## 2.7 Add it to the registry

(Nothing to do with §2.4's registers — this is `registry.ts`.)

Add the import + array entry in `js/data/recipes/registry.ts`. In a parallel
batch, the orchestrator owns that single edit after all authors return; a lone
author does it directly. `npm test` covers the registry.
