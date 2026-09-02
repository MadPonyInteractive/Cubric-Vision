# Research & Synthesis Worksheet — PONY Mix (Pony Diffusion V6 XL family)

- **Model version:** ANImergeMEij v3.0+VAE, a **Pony Diffusion V6 XL** merge
  (Vision's `pony-mix`)  **Mode(s):** `t2v` (the schema's `t2v` is
  "text → video/image")
- **Research date:** 2026-08-09  **Sources:** see `sources.md`

> **Scope note.** The recipe id is `pony` because what it targets is the **Pony
> V6 XL tag grammar** — `score_*` / `source_* `/ `rating_*` plus booru tags —
> not one merge. Any Pony-lineage checkpoint Vision ships later inherits it.
> Every constraint is taken at the SDXL encoder setting the merge actually runs
> on, which is the same 77-token CLIP window the `sdxl` recipe already reasons
> about.

> **STATUS: COMPLETE.** The documentation half was written 2026-08-09; the
> measured half landed the same day from a VPN window and is written up in
> **[`vocabulary-evidence.md`](vocabulary-evidence.md)** — 32 prompts from the
> exact checkpoint plus 209 from base Pony, split before counting. Sections
> below that were marked ⧗ CORPUS now carry the measurement and link to it.

---

## Part A — Research (the 7 standard questions)

### 1. Output format & length

**Comma-separated booru-style tags, led by the score chain.** The official model
card says Pony V6 "is trained on combination of natural language prompts and
tags and is capable of understanding both" [1] — so prose is *not* broken here,
unlike on a pure booru model. But two things push the recipe to tags anyway:
the community practice for anime Pony checkpoints is tag-form [3, 4, 6], and
Civitai's own guide warns that Pony has "their own prompt syntax … which must be
used to obtain good outputs" [5]. **MEASURED and settled: tag-form 88% on the
merge / 94% on base Pony, prose 0% / 2%.** The card's "understands both" is true
of base Pony V6 and irrelevant to how anyone prompts this checkpoint.

The one thing every source agrees on: **the score chain leads the prompt.**

```
score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, <the rest>
```

verbatim from the official card [1] and shipped verbatim as
`lazy-pony-prompter`'s Pony V6 XL template with the note that it must be
"exactly like this" because of a training-time mistake [2]. The short form
`score_9, score_8_up, score_7_up` is the working baseline in [4] and in the
readable summaries of the blocked pages ("use the top 3 to top 6 … you need at
least 3").

**Length — the number this phase must produce:**

| Source | Figure | Scope |
|---|---|---|
| Official card [1] | none stated | — |
| Community guides [3, 4] | none stated (tag counts, not word counts) | — |
| CLIP encoder [9] | **77 tokens hard window** (~75 usable) | SDXL architecture |

**No source states a word budget**, so playbook §1.3's fallback applies: derive
it from real examples and say so. **Derived from the corpus** — median **33
words / 24 comma segments** on the merge, **41 / 25** on base Pony; both medians
land on ~24–25 tags, which is the stable number across the two sets. p90 is
inflated by LoRA-stuffed prompts. **Resolved: `lengthNorm` ~20–28 comma-separated
tags, `wordBudget` { min: 25, max: 75 }.** Full distribution:
[`vocabulary-evidence.md` §4](vocabulary-evidence.md).

Two constraints that already bound the answer regardless of the measurement:

- The **77-token window** [9]. ComfyUI chunks past it, so a longer prompt is not
  discarded — but the first window carries the most weight, so the recipe
  targets it. Identical reasoning to `sdxl.recipe.js`, and it is architectural,
  not a taste call.
- **The score chain is not free.** Each `score_*` tag is a digits-and-underscore
  string costing several BPE tokens — window spent before the subject is named.
  This argued for the short form on cost alone; the corpus then settled it on
  evidence (§3). The estimate was never needed.

### 2. Structural order

Consistent across [1], [3], [4] and [2]'s template, in this sequence:

```
score chain → source/rating → subject count → identity → physical traits →
attire → pose/expression → background → framing → style
```

Three rules bite harder than the order itself:

- **Score chain first, always** [1, 2, 4]. Not negotiable, and not optional.
- **Front-load what matters.** SDXL weights earlier tokens more [3]; a prompt
  builder written for this model explicitly pushes character tags "closer to the
  beginning" [2].
- **Group related tokens.** "Keeping similar tokens grouped together increases
  the chances of them being included in the final output" [5] — so hair, eyes
  and face belong in one run, clothing in another, rather than interleaved.

Booru grammar specifics [3]: the count anchor is `1girl` / `1boy` / `2girls`,
`solo` for a single subject, and multi-word booru tags carry **underscores**
(`purple_eyes`, `pleated_skirt`) so the model reads them as one concept.

### 3. Vocabulary

**MEASURED — full record in
[`vocabulary-evidence.md`](vocabulary-evidence.md).** Pony's vocabulary is
*entirely* a tag vocabulary, so guessing it would have been guessing the whole
recipe; MPI-19's two guessed sets scored ~zero against 209 real prompts.

The five results that changed the recipe:

1. **Score chain: THREE, not six.** The six-tag chain appears in **0 of 32**
   prompts on our checkpoint and 30% on base Pony; `score_6_up` falls 47% → 3%.
   Matches the merge author's own line on Civitai 734527 exactly. Conflict 1
   closed by measurement.
2. **`source_anime` is the merge's signature** — 56% vs 13% on base Pony
   (+43, the strongest discriminator measured). `source_pony`/`furry`/`cartoon`:
   **0%** on the merge. Always emit `source_anime`, never the others.
3. **`rating_*` tags are rare on both sides (8–9%)** — so the recipe emits none.
   This overruled the draft's plan to default to `rating_safe` as a product
   call; real practice is no rating tag at all. See Conflict 4.
4. **Tag-form 88%, prose 0%** (§1).
5. **The Illustrious/Animagine block is strong here and deliberately withheld** —
   `absurdres` +29, `very aesthetic` +21, `masterpiece` +21, `best quality` +17,
   `newest` +13 against base Pony. Eight tags from one family moving together is
   a real pattern, but it costs 4–6 tags of a 77-token window and no text test
   can price that. **Held as a Stage 2 A/B for Fabio**
   ([`vocabulary-evidence.md` §3](vocabulary-evidence.md)) — the one open
   question that can move the prefix.

Per-slot booru vocabulary, and everything excluded with its reason, are in
[§7 of the evidence doc](vocabulary-evidence.md). Method followed: split before
counting, whole-word matching, exclusions recorded.

### 4. Failure modes

- **Wrong register entirely — and it is live today.** `pony-mix` declares
  `type: 'sdxl'` and no `enhanceRecipe` [8], so Vision's Enhance on this model
  currently runs Prompt's **`sdxl` photography recipe** — the one that emits
  "candid photography … Sony A7 III … Kodak Portra". Handing an anime Pony merge
  a film-stock prompt with no score chain is the single largest defect this
  recipe fixes. (Vision must set `enhanceRecipe: 'pony'`; there is no alias.)
- **Omitting or truncating the score chain** — the model was trained with it and
  the card's whole design is "an opinionated default prompt template" [1].
- **Overrunning the 77-token window** [9] — the tail stops carrying weight.
- **Wrong `source_` tag** — `source_pony` on an anime request drags the output
  toward MLP-style art; that is why the community puts `source_pony` and
  `source_furry` in the *negative* [6].
- **Unrequested `rating_explicit`.** This lineage generates adult content
  readily. The enhancer must never volunteer it — see the product call in
  Conflicts.
- **SDXL extremity weakness** — hands/feet, same as the `sdxl` recipe. Do not
  volunteer them as a focal point; do honour them when asked.
- **Emitting A1111 syntax Vision's graph cannot execute.** The corpus is full of
  it and it would be the easiest failure to ship: **`BREAK` (44% of real merge
  prompts)**, `<lora:name:0.8>` (25%), and `[a, b|c, d]` alternation. Vision's
  `t2i_pony_mix.json` encodes through stock `CLIPTextEncode`, and `BREAK`
  appears nowhere in the parser — grepped across `comfy/sd1_clip.py`,
  `comfy_extras/` and `nodes.py` in Vision's bundled engine, it is present
  **only inside tokenizer vocab JSONs**. Emitted, it encodes as the literal
  word. All three are hard bans. `(tag:1.2)` weighting is the opposite case:
  `parse_parentheses`/`token_weights` do exist, so it is legal — but 0% of merge
  prompts use it, so the recipe does not emit it either.
- **Not a prompting matter but adjacent:** Pony V6 requires **clip skip 2**,
  "otherwise you will be getting low quality blobs" [1]. That is Vision's
  workflow's job, not the recipe's; recorded so nobody blames the prompt.

### 5. Negatives

**Supported and live.** `pony-mix` sets `capabilities: { controlStrength: true }`
and does **not** set `negativePrompt: false`, and per Vision's ModelDef contract
the flag "defaults to TRUE when absent" [8] — so this model ships a real
negative field, unlike Klein.

The sources disagree on whether to use it. The official card says the model "is
designed to not need negative prompts in most cases" [1]; a shipped workflow
pairs its positive with `score_6, score_5, score_4, score_3, score_1,
source_furry, source_comic, …` [6], and the general community baseline adds the
usual anatomy/quality set [4]. Score tags in the negative have a stated ceiling:
you can only go as low as `score_4`, so they exclude the bottom band rather than
pushing hard away from it.

**Schema mapping:** `negativeHandling: 'separate-field'`, same as `sdxl`.

**Baseline: the merge author's own, and it is a pure score ladder** —
`score_1, score_2, score_3, score_4, score_5, score_6` (Civitai 734527). No
anatomy spam, no `source_furry`, nothing else. It outranks [4] and [6] because
it is the person who built this checkpoint.

**This is the one part of the vocabulary with NO measurement behind it.**
Civitai's image API returns `meta: null` and the prompt is recovered from the
page's `__NEXT_DATA__`, which carries the **positive prompt only** — so neither
corpus contains a single negative prompt. Documentation-sourced, flagged as
such, and listed as re-measurable work in the evidence doc.

> **Defect found while checking this, NOT fixed here.** Prompt's
> `prompt.enhance` responder returns only `{ prompt, backend, model, recipeId,
> note }` (`src/main/connector.ts`) — it never sets `negativePrompt`, even
> though Vision reads `data.output.negativePrompt` (`js/shell/connectorOps.js`)
> and the field is in the contract on both sides. So for any `separate-field`
> recipe the whole two-block output, `NEGATIVE PROMPT:` label included, lands in
> Vision's **positive** box. This is true of `sdxl` today and would be true of
> `pony`. It belongs with **MPI-27**, which already owns that responder.

### 6. What's unique

**Unusually well:**
- **Booru knowledge.** Danbooru/e621-style tags, including character and series
  tags, are in-distribution [3] — a single correct tag does what a paragraph of
  description cannot.
- **An explicit quality dial.** The `score_*` chain is a real trained control,
  not the "masterpiece, best quality" superstition [1].
- **Style selection by `source_*`** — `anime` / `cartoon` / `furry` / `pony`
  swing the whole look from one token [1].
- **Anime/stylised subjects**, which is exactly why Vision ships it
  (`dropdownMeta: 'STYLIZED'`, "different animation styles") [8].

**Unusually badly:**
- **Photorealism** — wrong tool; that is what Vision's SDXL and Krea cards are
  for.
- **The 77-token window**, spent partly on the score chain before the prompt
  starts.
- **Extremities**, inherited from SDXL.
- **Prose**, tolerated but not the native form [1 vs 3, 5].

### 7. Example prompts (verbatim from sources)

**1 — the official template** [1]:
> score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, just
> describe what you want, tag1, tag2

**2 — a shipped workflow's pair** [6]:
> **positive:** score_9, score_8_up, score_7_up, best quality, masterpiece,
> source_anime …
> **negative:** score_6, score_5, score_4, score_3, score_1, source_furry,
> source_comic, bad eyes, deformed ayes, cartoon
> *(typo `ayes` is in the source; quoted verbatim.)*

**3 — booru tag form, generic SDXL anime** [3]:
> masterpiece, best quality, 1girl, hatsune_miku, vocaloid, solo, teal_hair,
> twintails, white_shirt, collared_shirt, pleated_skirt, indoors, sunlight,
> upper_body
> *(Illustrious-style quality prefix, not Pony's — quoted for the **grammar**,
> not the quality tags.)*

**4–6 — real prompts from the shipped checkpoint** (`animergemeij-v3.json`,
verbatim, LoRA- and `BREAK`-free):

> score_9, score_8_up, score_7_up, masterpiece, best quality, absurdres,
> highres, 1girl, magical-girl, victorian, posing, source_anime, 1990s, vibrant

> score_9, score_8_up, score_7_up, masterpiece, best quality, absurdres,
> highres, 1girl, magical-girl, steampunk, posing, source_anime, 1990s, vibrant

> abstract art, abstract body, abstract figure, black background, blue lines,
> dynamic pose, ethereal atmosphere, floating, flowing lines, glowing body,
> glowing effects, glowing eyes, glowing halo, humanoid, light trails, neon
> colors, rainbow colors, surreal art, white figure, very aesthetic, absurdres,
> newest, masterpiece, (best quality, realistic)

These are what the recipe's own `examplePrompts` are modelled on — note the
score chain leading, `source_anime` present, the era tag (`1990s`), and the
third one carrying **no score chain at all**, which is the 34% case. The
Animagine block visible in all three is measured but withheld from the recipe
(§3).

---

### Conflicts & unknowns

1. ~~**Three score tags or six.**~~ **CLOSED by measurement** — three. Six
   appears in 0/32 merge prompts (30% on base Pony), and the merge author's own
   template is the three-tag form. §3.
2. ~~**Tags vs natural language.**~~ **CLOSED** — tags, 88% / 0% prose. §1.
3. **Negative prompt: needed or not.** Official says no [1], practice says yes
   [4, 6], the merge author ships a score ladder, and the field is live [8].
   Recipe emits the author's ladder. **Still the weakest-evidenced part of the
   recipe** — no corpus can reach a negative prompt (§5). Stage 1 checks the
   recipe emits it consistently; only Stage 2 can say whether it helps.
4. ~~**`rating_*` default — a product call for Fabio.**~~ **CLOSED by
   measurement, and it overruled the plan.** The draft was going to default to
   `rating_safe` and ask Fabio to confirm. Rating tags appear in 8–9% of real
   prompts on *both* sets, so the measured default is **no rating tag**. The
   recipe emits none and never volunteers `rating_explicit`. No ruling needed
   unless Fabio wants to override practice.
5. ~~**The merge author's own recommendation is unread.**~~ **CLOSED** — fetched
   under the VPN window from Civitai 734527 and it is now the highest-authority
   source in the set: `score_9, score_8_up, score_7_up, source_anime,` positive
   / `score_1 … score_6` negative / Euler a.
6. **Slot count vs the window.** §2 lists ten slots. At tag length (1–3 words
   each) that is ~25 words plus the score chain, and the corpus median is 24
   comma segments — so the slot list and real practice agree, which is better
   evidence than either alone. Still MPI-16's recurring collision, and `sdxl`
   runs ten slots against 30–90. Watch the bare and overlong tiers; if it fails,
   merge slots. Do **not** add a "be concise" sentence.
7. **The Illustrious/Animagine block — the one live question.** Measured strong
   on this checkpoint, withheld from v1.0, resolvable only in pixels. Stage 2
   A/B defined in [`vocabulary-evidence.md` §3](vocabulary-evidence.md).
8. **n=32.** `--nsfw None` on a checkpoint with 1,706 downloads is the whole
   population at that browsing level. The direction of every finding is
   consistent and cross-checked against the author's own template; the
   *magnitudes* are soft.

---

## Part B — Synthesis (map to RecipeSchema)

**Recipe-level**

| Field | Value |
|---|---|
| `modelId` | `pony` |
| `family` | `sdxl` |
| `displayName` | `PONY Mix` |
| `status` | `draft` |
| `notes` | Pony Diffusion V6 XL tag grammar (`score_*`/`source_*`/`rating_*` + booru tags), targeting Vision's `pony-mix` = ANImergeMEij v3.0+VAE, a Pony V6 merge. SDXL encoder → the same 77-token CLIP window as `sdxl`, and the score chain spends part of it. Requires clip skip 2 in the workflow (Vision's job, not the prompt's). Vision must set `enhanceRecipe: 'pony'` — there is no alias, and `pony-mix` otherwise falls through `type: 'sdxl'` onto the photography recipe. |
| `modes` | `t2v` only — Vision sends no mode (MPI-26), and `pony-mix`'s other ops are `i2i`/`control`/`upscale`/`detail`, which per MPI-21 either enhance as t2i or want a describe-image pass (MPI-15). |

**Per mode: t2v**

| Field | Value |
|---|---|
| `outputFormat` | `structured-tags` |
| `lengthNorm` | `~20–28 comma-separated booru tags on one line; corpus median 24` |
| `wordBudget` | `{ min: 25, max: 75 }` — from the measured distribution (§1), under the ~55-word equivalent of the 77-token window at its top |
| `structureOrder` | `["Score chain", "Source tag", "Subject count (1girl/1boy/solo)", "Identity or character", "Physical traits (hair, eyes, face)", "Attire", "Pose, action and expression", "Background and setting", "Framing and camera angle", "Style and finish"]` — `rating_` dropped from the draft's slot 2, per the measurement |
| `vocabulary` | the per-slot booru sets measured in [`vocabulary-evidence.md` §7](vocabulary-evidence.md) |
| `styleVocabulary` | **omitted** — v1.0 is general-only |
| `dos` | score chain first (three tags); `source_anime` always; booru tag form; underscores inside multi-word tags; group related tags; count anchor always (MPI-28 rule 1, native here); keep every technical choice the user already made; mirror the user's content register |
| `donts` | no photography vocabulary (film stock, camera bodies) — wrong register for an anime merge; no prose paragraph; **no `BREAK`**; **no `<lora:…>`**; no `[a\|b]` alternation; no rating tag unless the user's intent requires one, and never `rating_explicit` unrequested; no `source_pony`/`furry`/`cartoon`; no quality spam (`8k`, `ultra-detailed`); do not volunteer hands/feet |
| `negativeHandling` | `separate-field` — baseline `score_1 … score_6`, the merge author's own |
| `examplePrompts` | modelled on the three real checkpoint prompts in Q7 |
| `systemPrompt` | authored in the draft phase (playbook 02) |
| `acceptsMedia` | `[]` |
| `multiScene` | `false` |

---

### Readiness verdict

- [x] All 7 questions answered with source pins.
- [x] **Q1 produced a number** — `lengthNorm` ~20–28 tags, `wordBudget` 25–75,
      derived from the measured distribution because no source states one.
- [x] **Q3 and Q7 are measured**, not authored — 32 checkpoint-exact + 209
      base-Pony prompts, split before counting.
- [x] Conflicts 1, 2, 4 and 5 closed **by measurement** (and Conflict 4's
      measurement overruled a product call the draft was going to ask Fabio
      for). Conflict 3 is the weakest link and says so. Conflict 7 is a Stage 2
      A/B.
- [x] Every schema field has a concrete value.
- **Verdict: ready to author the draft recipe.** Two things to watch through
  Stage 1: Conflict 6 (ten slots against a 25–75 budget — the same coverage /
  length pairing that has bitten `ltx-2.3` and `flux-2`), and whether the
  enhancer LLM leaks `BREAK` or `<lora:…>` from its own training on A1111
  prompts. The second is deterministically checkable and should be, because the
  corpus shows it in 44% and 25% of real prompts.
