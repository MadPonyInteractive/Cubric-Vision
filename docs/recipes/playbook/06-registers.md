# 6 — Registers (the style axis)

**Input:** a recipe that already passes Stage 1 on the default register.
**Output:** a `styleVocabulary` block on the mode, plus four extra sweep tiers.

A register is *how directed the image is* — not what it contains and not which
model renders it. It is a **cross-cutting property of all four jobs, never a
fifth job**: expand, rearrange, condense and infer intent all still run, they
just resolve into different words.

---

## 6.1 Why the axis exists

Measured 2026-07-28: candid pool-party prompts came back from **both** Krea 2
NSFW and Chroma composed, centred, evenly lit and colour-graded. The enhanced
prompt literally said *"the candid photo captured on a phone"* and then
art-directed anyway.

Two things follow, and both are load-bearing:

- The model already **detects** the register. What it lacked was *permission* —
  `structureOrder` mandates "lighting and mood" and "visual style or medium" in
  every prompt, and those mandated elements out-vote a register word.
- Chroma failed identically, so this is **not a target-model weakness**, and
  **inferring the register from the input is ruled out**. The caller picks it.

## 6.2 The three styles

| Style | Register | Notes |
|---|---|---|
| `cinematic` | Maximum art direction — a frame lifted from a film | avoids `candid` |
| `general` | **DEFAULT.** A skilled photographer, not theatre | avoids nothing |
| `candid` | Reckless and undirected — a snapshot nobody produced | avoids `cinematic` |

`general` is asymmetric on purpose: it has **no deterministic banned list** and
is judged by the LLM lens alone. A competent photograph legitimately reaches for
either neighbour's words — `cinematic` alone appears in 39% of non-candid real
prompts.

## 6.3 Where each half lives

| Layer | File | Contains |
|---|---|---|
| Register + per-slot **intent** | `js/data/recipes/styles.ts` | Model-agnostic. Authored once, shared by every recipe. |
| The **words** a model responds to | `{model}.recipe.js` → `styleVocabulary` | Per model, per style, per vocabulary domain. |

`composeSystemPrompt(mode, style)` joins them and appends the register block
**last**, so recency works for it — the observed failure was the model reading
the register and then building something beautiful anyway, so the register has
to be the final word.

`selectSystemPrompt(modelId, mode, style)` defaults `style` to `general`.

## 6.4 The structural invariant — `structureOrder` never changes

Every style fills **every** slot. Only what fills it inverts.

That is what keeps the judge's element-coverage check and the word-budget floor
working unchanged across all three styles, and it is what stops a style from
ever saying "skip lighting" — a conditional instruction colliding with an
unconditional required element is the one bug class that cost ~13 iterations in
MPI-16, and a register is its most tempting third form.

Two consequences worth stating outright:

- **A shot type can never go in a banned list.** The recipe requires every
  prompt to name one, so banning `wide shot` or `low angle` from `candid` is
  that same bug.
- **The banned set derives for free.** `avoidedTerms` = the opposing style's
  vocabulary **minus** anything the active style also claims. A term shared by
  both registers (`film grain`, `depth of field`, `bokeh` — measured as
  universal) is not a discriminator and drops out on its own. It is also the
  escape hatch: if a ban ever fires falsely, add the term to **both** styles and
  it stops discriminating, with no code change.

## 6.5 Author the vocabulary from a corpus, never from intuition

**This is the expensive lesson.** Both vocabulary sets guessed in the MPI-19
brief measured at ~zero against 209 deduplicated real prompts — and the second
one was the *control*:

| Guessed candid | Hits | Guessed cinematic | Hits |
|---|---|---|---|
| `off-centre`, `dutch angle`, `unposed`, `mid-action`, `harsh flash` | ~0 | `anamorphic` | 2/209 |
| | | `chromatic aberration` | 1 |
| | | `rule of thirds` | 1 |
| | | `god rays`, `teal and orange`, `leading lines` | 0 |

The lesson is **not** "candid is hard to research". It is that **guessing
misses**, and it misses just as badly on the register everyone believes they
already know. See [01-research.md](01-research.md) §1.4 for the measurement
step, and `docs/recipes/research/candid-vocabulary-evidence.md` for the
worked example.

Two traps that measurement exposes and reading cannot:

- **A frequency taken over the whole corpus hides the split.** `grain` 26/40,
  `film grain` 26/19, `depth of field` 22/13 all look like candid markers until
  you separate candid prompts from the rest — they are universal. Only
  `overexposed` (11/1) survived as a real candid artifact.
- **Substring matches lie.** `washed out` scored 11% and turned out to be
  *"washed black denim"*. Match whole words.

Record the measured split as a comment on every term you keep, and list what you
**excluded as non-discriminating and why** — the exclusions are the part a later
author will otherwise re-add.

## 6.6 Testing a register — the four extra tiers

The harness adds four tiers on top of the four job tiers. They exist because
**every job tier rewards art direction**, so a recipe that cannot produce a
candid photograph still passes a full job sweep. That is exactly what happened.

| Tier | Style | Input | Catches |
|---|---|---|---|
| `candid-explicit` | `candid` | *candid photo of my kitchen table this morning* | Decorating a produced photograph with candid words |
| `candid-bare` | `candid` | *two friends at a pool party* | **The observed failure** — sparse input + mandated elements driving the model back to lighting design |
| `cinematic` | `cinematic` | *a lone samurai at the edge of a cliff* | Failing to push all the way |
| `general` | `general` | *a woman drinking coffee by a window* | Drifting to either edge |

Two deterministic checks, both free of model opinion:

- **register vocabulary** — at least 2 terms from the active style, verbatim.
- **no cross-register leak** — zero terms from the avoided style.

A recipe with no `styleVocabulary` **skips all four tiers automatically** and
sweeps exactly as it did before. That is what lets the axis be proven on one
model before paying the *N recipes × 3 sets* authoring cost.

### The register checks run on the REGISTER tiers only

On a job tier they compete with the user's own stated direction. `overlong`'s
input is explicitly cinematic ("anamorphic", "lens flare", "colour grade"), so
demanding two `general` terms from it contradicts the recipe's first rule —
preserve every choice the user made. Measured: it failed exactly that way while
the judge scored it 2/2/2.

**The job tiers test the jobs; the register tiers test the register.**

### The judge lens needs its carve-out written in

The lens folds into the existing `format` score (not a fifth score — the verdict
JSON keeps its shape). It must **name what counts as art direction** rather than
leaving the judge to infer it: designed or motivated light, composition
described as deliberate or balanced, a colour grade, staging, and writerly
flourishes that admire the image.

Without that, a correctly-sized 12B judge failed **all six** candid runs for
*"overusing descriptive language (authentic, unpolished)"* while every
deterministic check passed underneath — it read the register vocabulary itself
as the offence. See
[07-when-a-rule-wont-hold.md](07-when-a-rule-wont-hold.md) §7.3.

## 6.7 Status

Proven on **Krea 2 only**, Stage 1 green on two independent sweeps (MPI-19).
The other recipes have no `styleVocabulary` and are unchanged. Extending the
axis waits on Fabio's Stage 2 render — Stage 1 green means the prompt *says* the
right things, and these models are trained toward pleasing output, so bad
framing may be the one instruction they quietly refuse.

Nothing in `cubric-api` or the renderer picks a style yet; that wiring is
deliberately deferred until the axis is proven in pixels.
