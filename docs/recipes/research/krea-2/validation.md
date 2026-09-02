# Validation Record — Krea 2

## Stage 1 — autonomous text-only loop (agent)

- **Recipe / mode:** `krea-2` / `t2v`
- **Enhancer model:** `huihui_ai/gemma-4-abliterated:12b` (7.6 GB, uncensored, non-reasoning)
- **Judge model:** `gemma3:12b` *(changed from `gemma4:e4b` — see "The judge was the last blocker")*
- **Runs per tier:** 3 (a tier passes only if all 3 pass)
- **Harness:** `npm run recipe:test -- krea-2 --engine huihui_ai/gemma-4-abliterated:12b --judge gemma3:12b --runs 3`
- **Date:** 2026-07-28

### Result — ALL PASS, confirmed on two independent sweeps

24 consecutive passing runs (4 tiers × 3 runs × 2 sweeps), every judge verdict
`intent=2 structure=2 format=2`.

| Tier | Result | Words (sweep A / sweep B) |
|---|---|---|
| `bare` | **3/3, twice** | 71,65,79 / 81,69,67 |
| `medium` | **3/3, twice** | 94,73,86 / 95,89,67 |
| `directed` | **3/3, twice** | 74,72,66 / 75,78,87 |
| `overlong` | **3/3, twice** | 127,116,125 / 117,132,109 *(241 in)* |

Condense now peaks at 132 against a 150 ceiling — **18 words of headroom**,
against the 1-word margin it had at the old cap.

**A single sweep is not a result.** One sweep reported ALL PASS with `overlong`
at 129/129/127 against the then-130 cap. An independent re-run immediately
returned **1/3** (133/112/143). The tier had not stabilised; it was sitting on
the boundary and the green was luck. Two independent sweeps are now the bar
for this record — `--runs 3` catches an unreliable *rule*, but it does not
catch a distribution straddling a threshold.

### Tally by iteration

| # | Engine | bare | medium | directed | overlong | What changed |
|---|---|---|---|---|---|---|
| 1 | dolphin3-abliterated | 0/3 | 2/3 | 1/3 | 0/3 | initial draft |
| 2 | dolphin3-abliterated | 1/3 | 0/3 | 2/3 | 0/3 | subject lock + length hoisted to top; one-medium rule |
| 3 | dolphin3-abliterated | 2/3 | 3/3 | 1/3 | 0/3 | scoped the faithfulness `donts`; 90-word target; actions must survive |
| 3b | dolphin3-abliterated | — | — | — | 0/3 | ONE PARAGRAPH rule → condensing started working (241→188 words) |
| 4 | qwen3-vl-abliterated:4b | 0/3 | 1/3 | 0/3 | 1/3 | **rung 2 REJECTED** — see ladder |
| 5 | dolphin3-abliterated | 0/3 | 0/3 | 0/3 | 0/3 | back to rung 1 with `num_ctx` fix; all failures now `structure=1` |
| 6 | dolphin3-abliterated | 0/3 | 1/3 | 0/3 | 0/3 | strict element order relaxed to subject-first + grouping |
| 7 | dolphin3-abliterated | 2/3 | 0/3 | 0/3 | 0/3 | judge prompt reframed to match the recipe's actual rule |
| 8 | gemma3:12b *(probe only)* | 3/3 | 0/3 | 0/3 | 0/3 | capability probe — censored, NOT shippable as enhancer |
| 9 | **gemma-4-abliterated:12b** | 3/3 | 1/3 | 0/3 | 0/3 | first candidate meeting every constraint |
| 10 | gemma-4-abliterated:12b | 3/3 | 1/3 | 2/3 | 0/3 | condense target tightened to "100 words or fewer" |
| 11 | gemma-4-abliterated:12b | — | — | — | 0/3 | **condense REFRAMED** (see below) + subject noun-phrase rule |
| 12 | gemma-4-abliterated:12b | — | — | — | 0/3 | anti-ceiling framing; `structureOrder[0]` split |
| 13 | gemma-4-abliterated:12b | — | — | — | 0/3 | detail cap (≤6 details) — no effect |
| 14 | gemma-4-abliterated:12b | — | — | — | 2/3 | **four-sentence rule** — first ever pass on this tier |
| 15 | gemma-4-abliterated:12b | — | — | — | 3/3 | sentence handle hoisted into the override block |
| 16 | gemma-4-abliterated:12b | 3/3 | 1/3 | 0/3 | 3/3 | full sweep; judge still `gemma4:e4b` |
| 17 | gemma-4-abliterated:12b + **judge gemma3:12b** | 3/3 | 3/3 | 1/3 | 2/3 | camera rule; judge upgraded |
| 18 | gemma-4-abliterated:12b + judge gemma3:12b | 3/3 | 3/3 | 3/3 | 3/3 | elements≠additions; condense 3–4 sentences; judge placeholders |
| 19 | *(independent re-run of 18, no change)* | 3/3 | 3/3 | 3/3 | **1/3** | **the 18 green was luck** — condense straddling the cap (133/112/143) |
| 20 | gemma-4-abliterated:12b + judge gemma3:12b | — | — | — | 2/3 | hard four-sentence stop + shorter sentences — mechanism saturated at mean 129 |
| **21** | **gemma-4-abliterated:12b + judge gemma3:12b** | **3/3** | **3/3** | **3/3** | **3/3** | **ceiling 130 → 150 (see below); CONFIRMED on two independent sweeps** |

---

## How the condense blocker was actually solved

This tier failed **every run of iterations 1–13** and was the reason the card
could not close. It is worth writing down properly, because the lesson is
transferable to every future recipe.

### What did not work: rewording the number

Five separate phrasings of the word cap were tried — a bare ceiling, a
target-plus-ceiling, "never return more words than you were given", "target 100
or fewer", and an explicit anti-ceiling ("130 is where this fails, not where it
should land"). Measured means across 3 runs each:

| Mechanism | Words | Mean |
|---|---|---|
| baseline instruction | 149 / 135 / 153 | 146 |
| "target ≤100 words" | 133 / 135 / 148 | 139 |
| **extract-and-rewrite reframe** | 131 / 124 / 129 | **128** |
| anti-ceiling framing | 123 / 127 / 149 | 133 |
| detail cap (≤6 details) | 140 / 135 / 125 | 133 |
| **four-sentence rule** | 114 / 129 / 139 | 127 |
| **+ sentence handle in override block** | 113 / 117 / 116 | **115** |

### What worked, and why

**1. Reframe the operation, not the number.** "Shorten this input" keeps the
model in editing mode, where it walks the source clause by clause and anchors to
the source's length. The rule now says: *do not shorten the input — read it,
note the subject and the details that matter, then SET THE INPUT ASIDE and write
a brand-new prompt from those notes, exactly as you would for a two-line input.*
That single change moved the mean from 146 to 128, after five rewordings had
moved it by 7.

**2. Give it a unit it can actually count.** Every output was ~22 words per
sentence, dead constant; the only variable was sentence *count* (5 or 6). A
model cannot count words — that requires tokenizer arithmetic it has no access
to — but it can observe itself finishing a sentence. Switching the budget handle
from words to sentences, and hoisting it into the three-rule override block at
the top, produced 113/117/116: the tightest, most stable run in the whole
history.

**The generalisable rule (now in the playbook):** when a numeric constraint will
not hold, do not restate it. Ask (a) whether the model is in the wrong *mode* —
editing when it should be rewriting — and (b) whether the constraint is
expressed in a unit the model can perceive. Words are not such a unit;
sentences and paragraphs are.

### 3. Only then, the number — and the order matters

The cap was eventually raised from 130 to 150. **It was raised last, and that
is the whole point.** Raising it at iteration 11 would have turned the tier
green instantly and hidden every real defect found afterwards — the editing-mode
anchor, the uncountable unit, the missing camera rule, the elements-vs-additions
contradiction. All four were found *because* the number was held.

What changed the verdict was running out of mechanism. After the reframe and the
sentence handle, the recipe's own element requirements cost ~14 words back
(condense rose from 113–117 to a 112–143 spread) and three further wording
attempts moved the mean by nothing. Nine runs pooled at mean 129 against a 130
cap: a coin flip.

At that point the evidence pointed at the constraint, not the recipe:

- **No source states a maximum.** S1 (official): "long detailed prompts yield
  best results". S5: no limit for text-only t2v. S4's 30–80 is the *controlled*
  band — predictable output, not a cap.
- `research.md` recorded 130 as a test-design number chosen so condense would
  bite on a 230-word input, explicitly **"Flagged for the test loop to settle"**.
- Every over-budget run still scored `intent=2 structure=2 format=2`, and the
  independent `condensed` check passed 9/9.

Raised to 150 (241 → 150 is still a 38% cut). Confirmed: 24/24 runs across two
sweeps, condense peaking at 132 — 18 words of headroom.

**The instruction still says 130.** The model anchors to whatever ceiling it is
told, so the prompt aims low and the contract absorbs the spread. That gap is
commented in the recipe so it does not read as a bug.

**The general rule:** exhaust mechanism before touching the number, because a
loosened constraint hides every defect downstream of it. But when mechanism is
genuinely exhausted and no source backs the constraint, holding it is no longer
rigour — it is just the wrong number.

---

## The judge was the last blocker, not the recipe

At iteration 16 the recipe produced good output on every tier and the run still
failed. The failures were the **judge** (`gemma4:e4b`, ~4B) inventing
violations. Three verifiable examples:

- Scored a **117-word** prompt as *"slightly exceeds the 130-word limit"*.
- Scored a prompt opening *"A close-up shot of a cowboy…"* as *"fails to
  front-load the primary subject in the opening words"*.
- Failed an output for *"not explicitly covering the 'Thufpik eye skin detail'"*
  — i.e. penalising the recipe for **doing the intent job correctly** and
  resolving the garbled term instead of copying it through.

Swapping to `gemma3:12b` (playbook 05: *judge with the strongest
instruction-following model available*) fixed all three. The judge never
generates the graded content, so a censored model is fine here.

**Cost of the small judge:** three of five failures at iteration 16 were judge
fabrications. Had they been believed, the recipe would have been "fixed" for
problems it did not have.

---

## Harness bugs found (these were NOT recipe faults)

Four failures looked like catastrophic recipe problems and were not. All four
are the same species — **the judge is a model, so anything it can misread as an
answer, it eventually will** — and each is now fixed:

1. **Ollama's 4096-token default context.** The `systemPrompt` is ~950 tokens; a
   long idea overruns the window and Ollama returns **empty content with no
   error**. Measured 1/3 empty at 4096 vs 0/3 at 8192; across a full sweep,
   **7 of 12 runs came back empty**. `OllamaEngine` now sends `num_ctx: 8192`.
   *This was a live bug in the shipped enhance flow, not just the harness.*
2. **The judge rubber-stamped empty outputs**, returning intent=2 structure=2
   format=2 on a blank prompt. The harness now skips the judge when the output
   is empty. An LLM-judge-only design would have reported four green tiers on
   nothing at all.
3. **The judge was policing length.** It was handed `lengthNorm` *and* the
   harness computed `word budget` exactly — duplicate enforcement where one side
   is arithmetic and the other is a model guessing. It guessed wrong (117 > 130).
   Length is now the deterministic layer's job alone and the judge is told to
   ignore it entirely. **Each check belongs to whichever layer can decide it.**
4. **The judge echoed the template.** The reply example ended
   `"why":"one short sentence"`, and the judge returned that line verbatim as
   its grade — scoring 0/0/0 on a good output. Placeholders are now
   self-evidently placeholders (`<your one-sentence reason>`) with an explicit
   "copying this back is not a grade".
5. **VRAM was released only on the success path**, so aborted runs left weights
   resident — and a zombie `vite-node` survived the kill and kept reloading
   them. Now released on abort, signal and error.

---

## Recipe corrections (real defects in what I wrote)

| Symptom | Correction |
|---|---|
| `bare` drifted the subject every run (cat → lion / garden / lake) | Subject lock hoisted **above** everything: "if the input is a single word, that word IS the subject". Eliminated it outright. |
| Good `bare` outputs failed for "inventing detail" | **A self-contradiction:** the expand job requires inventing setting/light, while the `donts` forbade unsupported detail. Scoped every faithfulness rule to "when the input already describes a scene". |
| Same contradiction again, in `dos` | "Polish rather than inflating" also fires on sparse inputs. Scoped it too. |
| **The contradiction a third time, on `directed`** | A *described* scene still needs lighting, palette and texture — `structureOrder` requires them — but the scoped `dont` read them as invention, scoring `intent=0`. Added the explicit carve-out: **supplying the six required elements is never "adding"; nor is restating a technical term the user already gave. Invention means a new object, character, animal or action.** |
| Multi-paragraph output; condense not happening | "ONE PARAGRAPH, no line breaks" as a top-level rule. The polite version at the end was ignored. Condensing then worked: 241 → 188 words. |
| `directed` dropped the user's technical terms | Named them in the rearrange job: "every technical term they wrote must still appear." |
| Every failure `structure=1` on otherwise-good prompts | **The rule was wrong, not the output** — see the Q2 correction in `research.md`. Krea's own expansion prompt mandates *grouping*, not a fixed order; only subject-first is evidence-backed. |
| `structure=1` persisted after that fix | `structureOrder[0]` still read "Primary subject FIRST, **with scale and viewing perspective**", so the judge demanded scale+perspective in the opening words — the very over-reading Q2 rejected. Split into two elements. |
| Model opened with a subordinate clause | "Your first three or four words must be the subject itself", with counterexamples ("Standing at the edge of a cliff, …", "Bathed in orange light, …"). |
| `medium` omitted any camera/shot type | The element list was aspirational. Added: **every prompt must name a shot type or viewing angle in plain words. Never leave the camera unstated.** Took `medium` from 1/3 to 3/3. |
| `directed` invented narrative ("prepares for a duel", "eyes squint") | Extended the faithfulness `dont` from objects/props/characters/animals to **narrative actions**: "describe the image, do not write a plot for it." |

---

## The four finished prompts

**These are the prompts to render in Stage 2.** All four are verbatim output
from confirmation sweep A, on the final recipe.

**`bare` — input: `cat`** (79 words) — expand, subject held:

> A sleek ginger cat sits perched upon a rustic wooden fence. This detailed
> photograph captures the animal in a high-angle shot while it basks in the warm
> glow of late afternoon sun. Its fur has a rich, velvety texture with hints of
> golden and burnt orange throughout its coat. The soft earth tones of the scene
> create a peaceful mood across the verdant garden background. Every whisker is
> sharp and defined against the blurred textures of the surrounding greenery.

**`medium` — man, rocking chair, two cats, fireplace** (94 words) — restructure:

> A man sitting on a rocking chair has two cats resting at his feet near a
> glowing fireplace in a cozy room. This warm scene is captured in a medium
> shot, emphasizing the inviting textures of the wood and fabric. The color
> palette is dominated by golden ambers and deep oranges, creating a peaceful
> atmosphere. A soft firelight illuminates the scene from the side while heavy
> shadows settle into the corners. The tactile grain of the wooden chair and the
> plush fur of the cats are rendered in high detail within this intimate setting.

**`directed` — garbled cowboy brief** (72 words) — note "Thufpik" resolved into
skin texture and pores, and every technical term the user wrote (anamorphic,
low angle, cinema camera, close-up) still present:

> A close-up shot of a cowboy wearing a wide-brimmed hat and firing his weapon.
> The cinematic scene highlights extreme skin details, focusing on the realistic
> texture of every pore. Captured through an anamorphic lens with a low-angle
> perspective, the image feels grounded and intimate. A warm color palette and
> dramatic lighting emphasize the rugged atmosphere. Every thread of the
> weathered leather and dusty fabric is visible in this detailed cinema camera
> masterpiece.

**`overlong` — 241-word rambling samurai brief → 116 words** — condense:

> A lone samurai warrior stands at the edge of a cliff overlooking a vast valley
> of blooming cherry blossoms. He wears intricate red and black lacquered armor
> detailed with silk cords and battle-worn textures including scratches, dents,
> and dried mud. The low-angle shot captures him holding a katana pointed toward
> his side while his long hair and a torn banner on a pole flap in the wind.
> Under an orange and purple sunset, cinematic film lighting creates drama across
> the scene of blowing petals and distant birds. The anamorphic lens provides a
> shallow depth of field with beautiful bokeh and subtle lens flares,
> highlighting his tired yet determined face marked by a scar over one eye.

---

## Word-count evidence across models (identical recipe family, identical inputs)

| Model | 12 runs, words |
|---|---|
| dolphin3-abliterated (8B) | 28, 134, 271, 211, 324, 224 … no control |
| gemma3:12b (probe, censored) | 119,109,111,108,104,110,111,106,114,158,138,159 |
| **gemma-4-abliterated:12b** (final) | **72,73,77, 89,84,93, 80,80,61, 129,129,127** |

## Ladder movements

| Rung | Model | Verdict |
|---|---|---|
| 1 | `huihui_ai/dolphin3-abliterated` (8B) | **Condenses, cannot count.** Reliable, never empty, `intent=2` throughout — but never lands under a stated numeric word cap on any phrasing. |
| 2 | `huihui_ai/qwen3-vl-abliterated:4b` | **REJECTED — do not retry.** Ignores `think: false`; emits 24k–53k characters of reasoning on ambiguous input, hits `done_reason: length`, returns nothing. Raising `num_ctx` does not fix it. Triggered by the `directed` tier. |
| bump | `huihui_ai/gemma3-abliterated:12b` | **BROKEN BUILD — do not retry.** `check_tensor_dims: tensor 'token_embd.weight' has wrong shape`. A 24GB unquantized upload; not a VRAM problem. |
| — | `huihui_ai/mistral-nemo-abliterated` | Does not exist — `pull model manifest: file does not exist`. |
| **bump** | **`huihui_ai/gemma-4-abliterated:12b`** (7.6GB) | **The winner.** Uncensored, non-reasoning, 12B, fits the ~10.5GB ceiling on a 12GB card. All four tiers 3/3. |

**Follow-up:** this model is still passed as a raw Ollama name. It should earn a
`MODEL_REGISTRY` entry in `engine/registry.ts` (playbook 05: "add the entry only
for the rung that wins").

## Stage 2 — real-model render (Fabio)

**First pass done, 2026-07-28 — NOT signed off.** Fabio rendered all four Stage 1
prompts on **Krea 2 NSFW** in Cubric Vision (project "Cubric prompt tests",
896×1888, ~33–39s each). Verdict: *"looking good"* — an impression, not the gate.

What the renders confirm, per job:

| Tier | Confirmed in pixels |
|---|---|
| `bare` | Subject held — one word in, a real photograph of *that* subject out. This was the failure that killed iterations 1–3. |
| `medium` | Every mandated element visible: shot type, firelight direction, amber palette, wood/fur texture. The tier the camera rule took from 1/3 to 3/3. |
| `directed` | **The intent job proven.** "Thufpik eye skin detail" rendered as actual visible pores and skin texture, with close-up, low angle, anamorphic falloff and cinema-camera grade all surviving. |
| `overlong` | 241 words → ~116, nothing load-bearing lost: cliff, blossom valley, torn banner, lowered katana, orange/purple sunset, low angle. |

**Observed, not a recipe defect:** the `medium` render shows three cats (one held,
two at his feet) where the prompt says two at his feet. The prompt is
unambiguous, so this is Krea 2's count fidelity. Logged so it is not later
mistaken for a recipe fault.

### Why this is still `draft` — the open gate

Fabio's outstanding test: **candid photography, real-life and documentary-style
input, without cinematic enhancement.** Every Stage 1 output is art-directed
("cinematic scene", "dramatic lighting", "warm glow of late afternoon sun", and
one run reaching for "rustic oil painting"), because `structureOrder` *mandates*
"visual style or medium" and "lighting and mood" in every prompt — a rule
strengthened during this card to fix the `directed` tier.

A candid or documentary photograph is defined largely by the **absence** of that
direction, so the recipe as it stands cannot produce one. This is a genuine
register gap, not a tuning detail. Carded as **[[MPI-19]]** (recipe "flavours" /
register handling). Fabio will test with his own prompts before any sign-off.

## Known limitations

- Krea's own expansion prompt has **no condense direction** — it only expands or
  lightly polishes. Our condense job is an addition, and it was by far the
  hardest of the four for the model to obey.
- **Word-budget adherence is a model-capability threshold between 8B and 12B.**
  This recipe is not expected to hold its budget on an 8B enhancer.
- **Condense is the tier to watch.** It is the only one that ever approaches the
  ceiling (109–132 vs 65–95 for the rest), and every element added to the recipe
  costs words there first. Any future required element should be re-measured on
  `overlong` specifically, not assumed from a full-sweep pass.
- The `wordBudget` ceiling (150) and the instruction ceiling (130) deliberately
  differ. Do not "fix" the recipe by aligning them — see the comment in
  `krea-2.recipe.js`.

## Verdict (proposal only)

- [x] Every tier passed every run of **two independent sweeps** (24/24).
- [x] `systemPrompt` is self-contained and copy-paste testable.
- [x] Recipe parses through `RecipeSchema` as `draft`, with `wordBudget` set.
- **Needs Fabio's call:** the ceiling was raised from 130 to 150. That is a
  product-contract change, not a test knob, and it was made by the agent after
  arguing all session for holding 130 — the reasoning is in Q1 of
  `research.md`, and it is fair to want to review it directly.
- **Proposed to Fabio:** Stage 1 complete; Stage 2 first pass rendered and
  looking good.
- **Fabio's decision, 2026-07-28: NOT validated yet.** Sign-off is gated on his
  own test prompts — candid / real-life / documentary registers without
  cinematic enhancement (see the open gate above, [[MPI-19]]). Status remains
  `draft`.

---

# MPI-19 — the style axis, iteration log (2026-07-28)

The register gap flagged above, closed. Three styles on a shared axis;
`structureOrder` identical across all three, only the per-slot vocabulary
inverts. Engine `huihui_ai/gemma-4-abliterated:12b`, judge `gemma3:12b`
throughout — the pair validated in MPI-16.

Two changes were in flight at once, so a failure could have come from either:
the style axis itself, and the word budget raised `45-150 -> 60-220` on corpus
evidence (with the `overlong` input grown 241 -> 410 words to keep it a real
condense test, and the condense mechanism scaled four sentences/~75 words ->
six/~110). Both are recorded here because the sweeps carry both.

## Iteration 1 — 4/8 tiers, and neither failure was the vocabulary

`bare` `medium` `directed` `cinematic` `general` all 3/3.

**`overlong` 2/3 — the check was wrong, not the output.** It failed
`register vocabulary` at 1 term while the judge scored it 2/2/2. The cause:
the `overlong` input is *explicitly cinematic* ("anamorphic", "lens flare",
"colour grade"), so demanding two `general` terms from it contradicts the
recipe's first rule — preserve every choice the user made. **Fix: the two
register checks now run on the REGISTER tiers only.** The job tiers test the
four jobs; the register tiers test the register. That is the brief's own split
and it should have been implemented that way first.

**`candid-explicit` and `candid-bare` 0/3 each — and every deterministic check
passed.** 6-8 vocabulary hits, zero cross-register leaks, in budget, on all six
runs. All six failures came from the judge, which called the register
vocabulary itself art direction: *"overuses descriptive language ('authentic',
'unpolished', 'intimate')"*, *"introduces art-directional language
('perfect, unpolished summer afternoon')"*.

This is **verify-the-judge** again (MPI-16's third rule), in a new form: not a
too-small judge fabricating violations, but a correctly-sized judge given a lens
it could over-apply. The lens said "penalise art direction even if the prompt
says candid"; the judge generalised that into "the candid words are themselves
suspect" — and so penalised the recipe for doing exactly what 209 real prompts
show candid prompts do.

**Fix: carve the register vocabulary out of the lens explicitly** — the same
shape as the recipe's own "supplying the six elements is NEVER adding" clause,
and the same shape as the two-style-adjective carve-out added this session for
"candid amateur snapshot". The lens now names what IS art direction (designed
light, deliberate composition, a colour grade, staging, writerly flourishes)
rather than leaving the judge to infer it. `candid-bare` 0/3 -> 2/3.

## Iteration 2 — the ban list was growing, which is the smell

The remaining failures were now the judge being *right*: the recipe really did
write "the composition is unpolished yet balanced" and "a vibrant palette".
Banning `balanced` produced `centered` on the next run. Whack-a-mole on
adjectives is the same trap MPI-16 hit with word counts, and the same ladder
applies: **reframe the operation before reaching for a longer prohibition.**

Both slots were rewritten from a prohibition into a positive instruction:

- Colour: *name two or three actual colours you can see* ("the turquoise water,
  white lounge chairs, a red towel"). Naming them IS the colour answer.
- Composition: *say where the phone was and how it was held* (arm's length,
  from across the table, from the doorway). That IS the composition answer, and
  it supplies the shot type the recipe separately requires.

`candid-bare` 3/3, and the prose changed visibly: "Captured from arm's length",
"the turquoise water and white lounge chairs", "without any deliberate grading".

## What is load-bearing here, for the next recipe

1. **A register check belongs only on a register tier.** On a job tier it
   competes with the user's own stated direction.
2. **A judge lens needs its carve-out written in.** Any lens that says
   "penalise X even when the prompt claims not-X" will be over-applied to the
   vocabulary that legitimately signals not-X.
3. **A growing ban list means the operation is framed wrong.** Give the model
   the sentence to write, not a longer list of words to avoid.

## Iteration 3 — the negative example was seeding the failure

Sweep A came back ALL PASS, 24/24, with healthy margins (98-177 words against a
60-220 budget; 7-9 register terms where 2 are required; zero leaks). Sweep B,
same code, same models, nothing changed: **`candid-bare` 1/3.**

That is the second-sweep rule paying for itself a second time, and the failure
was worth the wait, because all three runs failed the same way — a closing
sentence that admires the image:

- "Every detail feels unpolished but intentional in this everyday moment."
- "…this authentic moment feels like a perfect slice of a summer afternoon."
- "Every detail feels authentic to an everyday summer afternoon."

The directive already banned exactly this, and named the pattern in its ban:
*no "every detail feels intentional", no "the simple beauty of…"*. **The ban was
producing the behaviour.** A negative example of a SENTENCE PATTERN seeds that
pattern — the model had "every detail feels ___" sitting in its context and
filled the blank. This is the ban-list trap one level up: the earlier iteration
banned adjectives and got a synonym; this one banned a sentence and got the
sentence.

**Fix, the same ladder a third time — reframe, and delete the examples.**

> END ON A THING, NOT A THOUGHT. Your final sentence must describe something
> physically present in the frame — an object, a surface, what somebody is
> wearing, what is on the table. Never close by saying what the scene means,
> feels like, amounts to or is a moment of.

`candid-bare` 1/3 -> **5/5** (run at `--runs 5` deliberately, because this is
the tier that has now failed twice at 3 runs).

### The rule this adds to the playbook

**Never illustrate a prohibition with the sentence you are prohibiting.** State
what to write instead. If a rule must name the bad pattern, name its *shape*
("a closing line about what the scene means"), never a usable instance of it.

## Result — Stage 1 GREEN on two independent sweeps

| Sweep | Result |
|---|---|
| A | ALL PASS 24/24 — superseded (pre-fix) |
| B | **FAILED** `candid-bare` 1/3, same code as A |
| **C** | **ALL PASS 24/24** |
| **D** | **ALL PASS 24/24** |

Eight tiers x 3 runs, engine `huihui_ai/gemma-4-abliterated:12b`, judge
`gemma3:12b`. Word counts 96-183 against a 60-220 budget; 4-7 register terms
where 2 are required; zero cross-register leaks in any run of either sweep.

This also clears the two changes that were in flight together: the style axis
AND the raised word budget (`45-150 -> 60-220`, `overlong` input 241 -> 410
words, condense mechanism four sentences -> six). Both are now swept twice.

**Status stays `draft`.** Stage 2 — the real-model render and the
`draft -> validated` flip — is Fabio's.

### Known residue, deliberately not chased

Candid output still occasionally writes "The colour palette features white
ceramic, warm wood grain and deep brown coffee". It names real colours, which is
the substance the register wants; it just keeps the framing phrase. Chasing that
after a two-sweep green is how you re-enter the whack-a-mole loop that iterations
2 and 3 just cost — leave it unless Stage 2 says otherwise.
