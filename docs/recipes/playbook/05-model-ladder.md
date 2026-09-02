# 5 — The enhancer model ladder

Which LLM rewrites the prompt during Stage 1, and when to move to a bigger one.

**Two rules govern this, and they pull against each other:**

1. **Uncensored, always.** A safety-tuned model sanitises instead of shaping —
   it quietly softens what the user asked for. Vision measured this on a locked
   seed: stock Gemma produced "hand on hip" where the abliterated build produced
   "hand on buttock" from the same input. That is not an edge case, it is the
   model overriding the user. Every rung is abliterated or uncensored-tuned.
2. **Small before big.** A recipe that only works on a 12B model is a recipe
   most users cannot run. Exhaust the small rungs first; a VRAM bump is a last
   resort and must be recorded as a finding, not taken for convenience.

---

## The ladder

Climb in order. Move up only when a rung **fails a rule it was told clearly** —
see [03-test-loop.md](03-test-loop.md) §3.4, which lists the recipe-side fixes
to exhaust first.

| Rung | Model | Size | Notes |
|---|---|---|---|
| 1 | `huihui_ai/dolphin3-abliterated` | ~4.9 GB | Dolphin 3.0 (Llama 3.1 8B), abliterated. In `MODEL_REGISTRY` as `dolphin3-abliterated`. Fine-tuned-uncensored is reportedly steadier than pure abliteration. |
| 2 | ~~`huihui_ai/qwen3-vl-abliterated:4b`~~ | ~3.5 GB | **REJECTED 2026-07-28 — do not retry.** A reasoning model that ignores `think: false`; see below. Vision uses this family as the Krea 2 **text encoder** / image-describer, which is a different job it is good at. |
| 3 | Another small uncensored build (Heretic / Dolphin line, ≤8B) | ~5 GB | Only if 1 and 2 both fail the *same* rule — that pattern says "small models can't", and a third data point is what proves it. |
| — | **bump** `gemma-3-12b-it-abliterated` | ~8–11 GB | Vision's own enhancer LLM in the LTX graph. The known-good fallback. Reaching for it is a finding: record which rule the small rungs could not hold. |

**Don't confuse the roles.** Vision's `qwen3vl_4b_abliterated` is a *text
encoder / describer*, not its enhancer; its enhancer is the abliterated Gemma
12B. Both are useful here, at different rungs, for different reasons.

## Measured: what rung 1 can and cannot do

From the first real run of this playbook (Krea 2, 2026-07-28, 4 iterations ×
4 tiers × 3 runs). Useful because it separates *recipe wording problems* from
*model capability problems* — the distinction that decides whether you rewrite a
rule or climb a rung.

**Fixed by wording** (`huihui_ai/dolphin3-abliterated`, 8B):

| Failure | The rule that fixed it |
|---|---|
| Subject drift — "cat" became a lion, a garden, a lake, every run | An explicit subject lock hoisted **above** everything else: "if the input is a single word, that word IS the subject". Eliminated it outright. |
| Multi-paragraph output on long inputs | "ONE PARAGRAPH. No line breaks, no blank lines, no lists" as a top-level rule. The polite "output as one paragraph" at the end was ignored. |
| Describing one image as both a photo and an oil painting | "Commit to ONE medium and hold it for the whole paragraph." |
| Dropping the user's technical terms | Naming them in the rearrange job: "every technical term they wrote must still appear." |

**NOT fixed by wording:** the numeric word cap. Rung 1 learned to condense —
241 words in, 188–220 out, single paragraph, judge scoring 2/2/2 on intent and
structure — but **never once landed under a stated 130-word ceiling**, across
every phrasing tried (bare ceiling, target-plus-ceiling, "never return more
words than you were given"). An 8B model will compress; it will not count.

That is the shape of a capability limit: the behaviour is right, the arithmetic
is not. Wording changes stopped moving the number, which is the signal to climb.

### The threshold, measured

Same recipe, same 45–130 word budget, same 12 runs. Only the model changed:

| Model | Word counts across 12 runs |
|---|---|
| Dolphin 8B | 28, 134, 271, 211, 324, 224 … — **no length control** |
| Gemma 12B | 119, 109, 111, 108, 104, 110, 111, 106, 114, 158, 138, 159 — **tight** |

Nine of twelve landed 104–119 words, mid-budget; the three misses were all the
*condense* tier, near-missing from a 241-word input. `bare` went **3/3**.

**Word-budget adherence is a capability threshold between 8B and 12B.** So:
when a recipe's only remaining failure is a numeric constraint, climb — do not
keep rewriting the rule. Conversely, this is why the ladder starts small: every
*other* failure class (subject drift, ordering, format) was fixable by wording
at 8B, and would have been hidden by starting at 12B.

(The 12B here was stock `gemma3:12b`, run purely as a capability probe —
**censored, therefore not shippable**. See the uncensored requirement above.)

## The judge is a separate choice — and do not go small on it

The judge is not the model under test — grading needs the best
instruction-following model on hand, and it never generates the content it
grades. Swap to an uncensored judge only if the *content being graded* would
trip a refusal; for the four standard tiers, nothing does, so a censored model
is fine here.

**Use a 12B-class judge. A 4B judge is not reliable enough to gate a recipe.**
Measured on Krea 2 (2026-07-28): with `gemma4:e4b` (~4B), **three of five**
late-stage failures were fabrications — it scored a 117-word prompt as
exceeding 130 words, called a prompt opening "A close-up shot of a cowboy…"
badly front-loaded, and penalised an output for *correctly* resolving the
garbled term. Swapping to `gemma3:12b` cleared all three and the recipe went
green without further recipe changes.

The cost of a weak judge is worse than a slow one: you "fix" defects that do not
exist, and each fix damages a recipe that was already right.

```bash
npm run recipe:test -- <recipe-id> --engine dolphin3-abliterated --judge gemma3:12b --runs 3
```

Note this means engine and judge are usually **both 12B**, so they swap in and
out of VRAM on every call. That is slower per run — accept it; the alternative
is false verdicts.

`--engine` and `--judge` take either a registry id or a raw Ollama name, so a
ladder rung can be tried before it earns a registry entry. Add the entry only
for the rung that wins.

---

## Gotcha: empty completions (the context window, not the model)

**Symptom:** the model returns nothing. Not an error, not a truncated prompt —
an empty string, which reaches the user as a blank enhanced prompt.

**Cause, measured 2026-07-28:** Ollama defaults to a **4096-token context**. A
recipe `systemPrompt` is around **950 tokens** before the user's idea is added,
and a reasoning model's hidden thinking consumes more. Overrun the window and
Ollama returns empty `content` rather than failing.

| Setting | Empty runs | Word counts |
|---|---|---|
| `num_ctx` default (4096) | **1 / 3** | 99, 111, **0** |
| `num_ctx: 8192` | **0 / 3** | 95, 112, 97 |

Same model (`qwen3-vl-abliterated:4b`), same Krea 2 recipe, same ~300-token
idea. Across a full 4-tier × 3-run sweep at the default, **7 of 12 runs came
back empty** — enough to look like a catastrophic recipe failure when nothing
was wrong with the recipe at all.

`OllamaEngine` now sends `num_ctx: 8192` **and** `think: false` on every
request. The second is a separate, smaller issue: reasoning models split their
reply into `message.thinking` + `message.content`, and `think: false` keeps
content populated (Ollama accepts the flag on non-reasoning models too, verified
on `gemma4:e4b`, so there is no per-model branch). If you talk to Ollama outside
that engine, send both yourself.

**The lesson for the loop:** an empty output is an infrastructure symptom, not a
recipe verdict. Check `num_ctx` before you rewrite a single rule.

### …but a model that ignores `think: false` is simply unusable

`num_ctx` was not the whole story. `huihui_ai/qwen3-vl-abliterated:4b` **ignores
the flag entirely** and reasons until it runs out of room:

| `num_ctx` | content | thinking | `done_reason` |
|---|---|---|---|
| 8192 | **0 chars** | 24,579 | `length` |
| 8192 | **0 chars** | 30,201 | `length` |
| 16384 | 380 chars | 26,752 | `stop` |
| 16384 | **0 chars** | 53,786 | `length` |

Up to **53,000 characters (15,450 tokens) of reasoning**, then nothing. Raising
the context does not fix it — 16384 still failed half the time while doubling
the KV-cache VRAM.

The trigger is diagnostic: it spiralled on the **`directed`** tier, whose input
is deliberately garbled ("shooting on a Thufpik"). Ambiguity is what sets a
reasoning model off — and inferring intent from ambiguity is precisely the job
this recipe needs. **Rule: reject any rung that ignores `think: false`.** Do not
try to tune around it, and do not raise `num_ctx` to compensate.

Related harness rule: **never let a judge grade an empty output.** Asked to score
nothing, it invents a verdict — observed returning intent=2 structure=2 format=2
on a blank prompt. `recipe-test.mjs` skips the judge when the output is empty.

## Gotcha: Ollama's model directory is not where you think

The Ollama **desktop app** stores its model-location setting in its own
`db.sqlite` (`%LOCALAPPDATA%\Ollama\`) and passes it to the server it launches —
it is **not** an environment variable and **not** in the registry. A server
started any other way (`ollama serve`, or our own `ensureOllama()` spawn)
inherits nothing and falls back to `~/.ollama/models`.

Symptom: `ollama list` returns an empty table while the models are sitting on
another drive. Confirm with:

```bash
grep -o 'OLLAMA_MODELS:[^ ]*' "$LOCALAPPDATA/Ollama/server.log" | tail -1
```

Fix: stop the stray server and start `"%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"`,
which relaunches it with the configured path. Do **not** set `OLLAMA_MODELS`
by hand — it would shadow whatever the user chose in the app.
