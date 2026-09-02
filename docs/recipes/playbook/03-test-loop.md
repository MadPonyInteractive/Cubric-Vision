# 3 — Stage 1: the autonomous test loop

**Text only. No image or video is generated here.** An agent runs this phase
start to finish on its own, iterating the recipe until it passes — no
per-iteration check-in. Stage 2 ([04-promote.md](04-promote.md)) costs real
generation time and only runs on a recipe that already passes here.

```bash
npm run recipe:test -- <recipe-id> --engine <model> --runs 3
```

The harness is [`scripts/recipe-test.ts`](../../../scripts/recipe-test.ts). It
runs each tier, applies the deterministic checks, asks a judge model for a
verdict, and exits non-zero if anything failed. It **reports**; the agent
decides what to change. There is deliberately no auto-rewrite loop in code — the
fix is a judgement about which rule misfired.

---

## 3.1 The four tiers

One per job from [02-draft.md](02-draft.md). They live in the harness so every
recipe faces the same inputs and results are comparable across models.

| Tier | Input | Proves |
|---|---|---|
| `bare` | `cat` | Expand — does a one-word input become a full prompt without the subject drifting? |
| `medium` | A man on a rocking chair with two cats by the fireplace… | Restructure — plain English into the model's element order |
| `directed` | Close-up cowboy shot with **deliberately garbled** technical direction | Rearrange + infer intent — every technical choice survives, the garbled part gets resolved |
| `overlong` | ~230-word rambling samurai brief | Condense — into format and budget, keeping the specific detail |

`directed` is the intent test. Its input contains "shooting on a Thufpik eye skin
detail" — a user reaching for something they cannot phrase. A recipe passes when
the output resolves it into a real instruction, not when it copies it through or
deletes it.

**Four more tiers appear if the recipe declares `styleVocabulary`** — the
register tiers, covered in [06-registers.md](06-registers.md). A recipe without
that field skips them and sweeps at four tiers exactly as before. The rule that
matters here: **a register check belongs only on a register tier.** On a job
tier it competes with the user's own stated direction — `overlong`'s input is
explicitly cinematic, so demanding two `general` terms from it contradicts the
recipe's first rule. Measured: it failed exactly that way while the judge scored
it 2/2/2.

## 3.2 What decides "good"

Two layers. The deterministic ones cannot be argued with; the judge covers what
a regex cannot see.

**Deterministic** (in the harness):

- `non-empty`
- `no preamble/wrapper` — no "Here is your prompt", no markdown fences, not
  wrapped in quotes. This one fails constantly on small models; it is usually
  fixed by a blunter final line in the `systemPrompt`.
- `not an echo` — the output is not the input handed back.
- `no reasoning` — no self-correction narrated mid-output ("Wait, let me
  refine…", "Self-correction:"). Lands *after* a valid opening, so the preamble
  check cannot see it.
- `no list markers` — the recipe's own element numbering reproduced as literal
  prompt text (`5. close up, 6. sun-dappled garden…`). Anchored to line-start or
  a preceding comma, so `unrealistic dream:1.4` and `f/2.8` are safe.
- `word budget` — within the recipe's `wordBudget`. This is what makes
  "condense" real.
- `condensed` (overlong tier only) — output shorter than input.
- `forbidden: <why>` — one per entry in the recipe's optional
  `ModeRecipe.forbiddenPatterns` (`{ pattern, why }`). **Put anything
  *objectively* wrong here rather than in `donts`.** `donts` reach only the
  judge (§7.2d), and the judge waves objective breaches through: `pony` read
  `ALL PASS` at 2/2/2 on every sweep it ever ran while emitting bracketed
  placeholders, a leaked quality word, welded count tags and an emoji — all four
  already banned in `donts`. Optional and opt-in, so a recipe declaring none is
  unaffected; note it is a **higher bar than the recipes that went green before
  it existed**.

**LLM judge** — a second model scores 0/1/2 on:

- **intent** — the user's subject and every choice they made survived; anything
  vague was resolved sensibly rather than replaced.
- **structure** — elements appear in the recipe's order.
- **format** — matches `outputFormat` + `lengthNorm`, breaks no `donts`.

A run passes only when every deterministic check passes **and** the judge
returns `pass` with no zero. Judge with the strongest instruction-following
model available, not the model under test — see
[05-model-ladder.md](05-model-ladder.md).

## 3.3 Consistency is the gate, not a single good run

`--runs 3` runs every tier three times. **A recipe is done when every tier
passes every run.** One good output is luck; the product ships the average.

A tier that passes 2/3 is a *failing* tier — the rule it depends on is not
stated firmly enough. Tighten the wording rather than accepting the flake.

### One ALL PASS is not a result — confirm with a second sweep

**Measured on Krea 2, 2026-07-28.** A sweep reported `ALL PASS`, with the
condense tier at 129/129/127 against a 130-word cap. An immediate, identical
re-run returned **1/3** on that tier (133/112/143). Nothing had changed.

`--runs 3` catches an unreliable *rule*. It does **not** catch a *distribution
straddling a threshold*: output centred on 129 against a cap of 130 passes a
three-run sweep roughly one time in eight by luck, and that reads exactly like
green. The tell is a passing tier sitting within a few percent of any limit.

**So: before declaring Stage 1 green, run the full sweep twice.** Stage 2 costs
real generation time; a false green spends it on a recipe that is not ready.
And when a tier passes but hugs a bound, say so in `validation.md` — a 1-word
margin is a finding, not a pass.

## 3.4 Iterating

When a run fails, change **the rule that caused it**, then re-run only what
failed (`--tier <name>`) before a full `--runs 3` confirmation sweep. Patterns
worth knowing before you start guessing:

| Symptom | Usually |
|---|---|
| Preamble / markdown / quotes | The output-format rule is too polite. Make it the last line and absolute. |
| Over budget on `overlong` | The condense job is missing or ranks below "be detailed". State the cap as a number in the `systemPrompt`, not only in the schema. |
| Under budget on `bare` | No floor stated. Give the expand job a minimum. |
| Subject drifts on `bare` | Add "never invent a different subject" — small models embellish their way off-topic. |
| Technical choices dropped on `directed` | The rearrange job is being read as "rewrite freely". Say the user's choices are load-bearing and must survive verbatim. |
| Garbled part copied through | The intent job is missing. Tell it to resolve unclear phrasing rather than preserve it. |
| Structure order ignored | The order is buried in prose. Number the elements. |

Stuck after two failed fixes? The escalation ladders are their own reference —
[07-when-a-rule-wont-hold.md](07-when-a-rule-wont-hold.md). It covers a numeric
constraint that will not hold (attack the *operation*, then the *unit*, only
then the number), a prohibition that will not hold (a growing ban list means the
operation is framed wrong; never illustrate a prohibition with the sentence you
are prohibiting), a judge that is itself the problem (roughly half of Krea 2's
late-stage failures were fabrications, and an over-broad lens fails a correct
recipe), and when it is finally fair to blame the model.

## 3.5 Recording it

Write `docs/recipes/research/{model-id}/validation.md`: the engine + judge
model used, the run count, the final per-tier tally, the representative output
for each tier, every iteration made and why, and anything left as a known
limitation. That file is what Fabio reads before Stage 2 — the point is that he
sees four finished prompts and the reasoning, not a test log.
