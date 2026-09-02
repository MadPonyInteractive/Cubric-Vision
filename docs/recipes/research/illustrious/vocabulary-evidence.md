# Illustrious vocabulary — measured evidence

Playbook §1.4: a finding that is a **list of words** must be measured, never
authored from documentation. This is that measurement for the `illustrious`
recipe, which serves Cubric Vision's `ill-anime` and `ill-anime-beauty`.

- **Pulled:** 2026-08-10, Fabio's VPN on (Netherlands exit; Civitai
  region-blocks the UK). Clock checked against `gh api rate_limit -i` →
  `Mon, 10 Aug 2026 15:43:07 GMT` vs local `15:43:07` — **no skew**. (Two VPN
  sessions in a row with no skew; the ~14h hazard in `CLAUDE.md` is real but not
  a certainty. Measure, don't assume.)
- **Corpora** (`docs/recipes/research/_corpus/`, gitignored), all
  `--nsfw None`, sorted Most Reactions, neutral match terms (`a,e,i,o,u`) so the
  filter cannot skew a frequency:

| Set | File | n (deduped) | What |
|---|---|---|---|
| **exact** | `illustrious/a.json` | **178** | `modelVersionId=2290816` — animemix **v8.0**, the exact checkpoint Vision ships as `ill-anime` |
| **broad** | `illustrious-broad/a.json` | **208** | `baseModel` contains "Illustrious", any checkpoint |
| *(excluded)* | `anima-broad/a.json` | 128 | `baseModel: Anima` — see §6 |

---

## 1 — The exact-checkpoint corpus is TEMPLATE-DOMINATED, and the broad set is the honest one

This inverts `pony`, where the exact checkpoint was the discriminator and the
broad set was the control. Here the exact set is 178 prompts written largely by
**two users**:

| Signal | count |
|---|---|
| distinct 3-tag openers across 178 prompts | **71** |
| prompts opening `<lora:a dmd2-lighting8step_cfg1.5:1>, official style, masterpiece` | 28 |
| prompts carrying a `sysdeep_*` LoRA trigger | ~45 |
| `anime coloring` occurrences | 105 |
| …of those, inside one of those two templates | **103** |
| …genuinely independent | **2** |

`anime coloring` (62% family-weighted), `anime screencap` (13%), `anime style`
(10%) and `official style` (9%) are therefore **one workflow, not checkpoint
vocabulary** — the MPI-19 single-user-family hazard, at the largest magnitude
yet measured. A whole-corpus count would have put `anime coloring` in the recipe
as the single strongest Illustrious marker. It is not in the recipe.

Jaccard family-collapsing at 0.7 does **not** catch this (178 → 156 families,
largest 6): the templates share a header and differ everywhere else, so
similarity clustering scores them as distinct. **The check that worked was
looking at the openers.** Do that before trusting any frequency table.

Everything below is therefore reported twice: **exact-clean** (n=45, the exact
checkpoint with those two users removed) and **broad** (n=208, 203 families,
largest family 2). Where they agree, the finding is load-bearing.

---

## 2 — The score chain is DEAD, and the quality block replaces it

The single most consequential measurement, and it is not close:

| tag | exact-clean (45) | broad (208) | `pony` merge (32) | `pony` base (209) |
|---|---|---|---|---|
| `score_9` | **2%** | **4%** | 66% | 88% |
| `score_8_up` | 2% | 4% | 66% | 87% |
| `source_anime` | **0%** | **0%** | 63% | 13% |
| `masterpiece` | **73%** | **78%** | 38% | 21% |
| `best quality` | **73%** | **73%** | 38% | 16% |
| `very aesthetic` | **49%** | **38%** | 22% | 1% |
| `amazing quality` | 36% | 31% | 13% | 2% |
| `absurdres` | 24% | **47%** | 34% | 6% |
| `newest` | 24% | **35%** | 13% | 0% |
| `highres` | 13% | 17% | 16% | 3% |
| `high resolution` | 42% | 10% | — | — |
| `rating_*` | 0% | 0% | 3–13% | 5–7% |
| `8k` | 2% | 24% | 16% | 4% |

This is the **positive** confirmation of `vocabulary-evidence.md` §3 in the pony
research, which could only observe the block leaking *backwards* into a Pony
merge. On Illustrious it is native grammar: `masterpiece, best quality, very
aesthetic, absurdres` is the Animagine XL 3.1 block verbatim, `newest` is its
recency tag, and every one of them is a majority-or-near tag on both sets.

**The recipe emits five: `masterpiece, best quality, very aesthetic, absurdres,
newest`.** `amazing quality` measured comparably (36/31) and is **excluded on
window budget** — it is the Stage 2 A/B here, the same shape as pony's, and the
same one-line change if it wins.

`score_*` and `source_*` are Pony grammar arriving on an Illustrious model in
the residue of Pony-trained users' habits. They are in `forbiddenPatterns`, not
in `donts`: emitting a score chain here is objectively the wrong model's syntax.

## 3 — The quality block goes FIRST (this was the guess most at risk)

Animagine's own documentation orders its template `1girl, character, series,
rating, quality tags` — quality **last**. The corpus says otherwise, on every
set:

| | n | quality in first 20% | middle | last 20% |
|---|---|---|---|---|
| exact | 65 | **98%** | 2% | 0% |
| broad | 171 | **80%** | 8% | 12% |
| anima | 96 | 85% | 10% | 4% |

And directly against the count anchor, across both Illustrious sets:
**quality before `1girl`/`solo` in 84% of the 168 prompts carrying both.**

So the recipe keeps `pony`'s header-first shape. Documentation would have
inverted it.

## 4 — Form, anchors, length

| | exact-clean | broad |
|---|---|---|
| tag-form (≥5 segments, <20% over 6 words) | **98%** | **95%** |
| prose (>50% of segments over 6 words) | 1% | 1% |
| `1girl` | 36% | 54% |
| `solo` | 38% | 50% |
| `1boy` | 29% | 5% |
| `looking at viewer` | 62% | 29% |
| `no humans` | 0% | 4% |
| `<lora:…>` | 40% | 34% |
| `BREAK` | 4% | 9% |
| weighted `(tag:1.2)` | 7% | 33% |
| escaped `\(series\)` in a character tag | 10% | 15% |
| underscores inside a tag | 40% | 52% |

**Length**, LoRA syntax and the quality block stripped so the body is what is
measured:

| | min | p25 | median | p75 | p90 | max |
|---|---|---|---|---|---|---|
| exact-clean — body tags | 6 | 9 | **18** | 34 | 42 | 96 |
| exact-clean — body words | 10 | 17 | **35** | 61 | 86 | 176 |
| broad — body tags | 2 | 17 | **24** | 37 | 59 | 127 |
| broad — body words | 3 | 32 | **50** | 86 | 135 | 416 |

The recipe targets **≈28 tags total** (a 5-tag header + ≈23 body tags), landing
near 45 words. That sits between the two medians and inside the same
architectural ceiling as `sdxl`/`pony`: Illustrious is SDXL-architecture, so
CLIP's 77-token window is ~55 words of tag text in the first, most-weighted
chunk. `wordBudget: { min: 30, max: 75 }`.

The exact set runs shorter (18 body tags) because 40% of it is LoRA-driven —
a character LoRA does the describing that our users will have to do in words.
That is why the broad median is the better target for Prompt's traffic.

## 5 — Vocabulary kept

Body tags, family-weighted, `exact-clean% / broad%`. Kept where a tag is real on
**either** set and is not a LoRA trigger or a single-user artifact. This is a
seeding vocabulary, not an inventory — booru tag space is enormous and almost
every individual tag is rare, which is why nothing below is a threshold rule.

- **count / framing** — `1girl` 36/54, `solo` 38/50, `1boy` 29/5, `portrait`
  16/4, `upper body` 7/9, `full body` 9/7, `close-up` 4/7, `cowboy shot` 2/4,
  `from side` 0/4, `from below` 0/5, `dutch angle` 0/12, `dynamic angle` 2/11,
  `wide shot` 2/2
- **gaze / expression** — `looking at viewer` 62/29, `open mouth` 49/8, `smile`
  36/11, `blush` 7/8, `closed eyes` 3/2, `closed mouth` 1/5, `parted lips` 1/4,
  `happy` 1/4
- **hair** — `long hair` 9/26, `short hair` 16/4, `medium hair` 7/2,
  `very long hair` 4/2, `bangs` 18/4, `hair between eyes` 16/3, `blonde hair`
  22/9, `brown hair` 9/3, `black hair` 4/5, `white hair` 9/3, `pink hair` 0/11,
  `orange hair` 11/1, `hair ornament` 7/6, `hair ribbon` 2/3, `twintails` 2/3
- **eyes** — `red eyes` 22/9, `purple eyes` 2/13, `blue eyes` 0/9 (31% on the
  raw exact set), `green eyes` 7/3, `brown eyes` 7/3, `detailed eyes` 0/8
- **attire** — `white shirt` 16/3, `long sleeves` 9/9, `collared shirt` 11/1,
  `jacket` 7/3, `dress` 0/6, `skirt` 4/3, `gloves` 7/3, `jewelry` 7/7,
  `earrings` 2/6, `belt` 9/2, `boots` 4/3, `bare shoulders` 7/2, `hat` 4/3
- **pose / action** — `standing` 11/8, `sitting` 2/11, `dynamic pose` 4/12,
  `holding` 0/4, `wind` 9/2, `motion blur` 2/4
- **setting** — `scenery` 4/15, `outdoors` 7/10, `indoors` 7/6, `night` 7/6,
  `city` 18/1, `blue sky` 9/3, `forest` 4/2, `simple background` 2/5,
  `black background` 0/7, `detailed background` 2/9, `blurry background` 0/3
- **light / finish** — `depth of field` 4/22, `cinematic lighting` 13/13,
  `volumetric lighting` 4/10, `soft lighting` 0/10, `sharp focus` 2/8,
  `high contrast` 4/5, `glowing` 2/6, `vibrant colors` 0/7, `illustration` 0/7,
  `light particles` 2/3, `bokeh` 2/3, `flat color` 4/2, `backlighting` 4/1,
  `rim lighting` 4/1

## 6 — Excluded, and why (read this before re-adding anything)

- **`anime coloring`, `anime screencap`, `anime style`, `official style`** — §1.
  Two users. 103 of 105 occurrences inside their templates.
- **LoRA triggers** — `sysdeep_*` (6%/5% on the raw exact set), `civchan` (12%
  broad), `lazypos` (8%), `xuer guangying` (5%), `bnhabakugo`, `1carrotv1`,
  `IllusP0s`, `InkSplash`. These are *another user's file*, unusable by anyone
  else, and Vision owns LoRA selection in its own UI regardless.
- **`amazing quality`** (36/31) — real, excluded on window budget. Stage 2 A/B.
- **`8k`, `4k`, `ultra-detailed`, `intricate details`, `photorealistic`** — `8k`
  is 24% on the broad set, so this is a *choice*, not an absence of evidence:
  the five-tag header is already the quality request, and the same argument that
  settled it for `pony` applies unchanged — a tag spent asking twice is a tag
  not spent on the image, inside a 77-token window.
- **`rating_*` / `safe` / `sensitive` / `general`** — 0% on both Illustrious
  sets. (`pony` reached the same conclusion from a product call; here the corpus
  reaches it alone.)
- **The `anima-broad` corpus (128 prompts)** — pulled because
  `ill-anime-beauty`'s upstream model (CivitAI 2578175) now lists only
  `baseModel: Anima` versions. It is **the wrong lineage for what Vision
  ships**: our file is the delisted 6.46GB `ramthrustsNSFWPINK_alchemyMix176`,
  and the surviving Anima versions are 3.9GB. The Anima set also reads
  differently enough to matter — median 103 words, only 62% tag-form, 7% prose —
  so if Vision ever updates that checkpoint to an Anima build, **this recipe's
  length norm should be re-measured**, not assumed.
- **Escaped-paren character tags** (`nekomusume \(gegege no kitarou 6\)`) —
  10–15%, genuine danbooru grammar, and still banned by `forbiddenPatterns`.
  The bracket ban is what stops the bracketed-placeholder defect that `pony`
  carried through twelve ALL PASS runs; a character-with-series tag is the price,
  and Vision's users type ideas, not danbooru disambiguators.

## 7 — Method

`--match "a,e,i,o,u"` keeps every prompt containing a vowel, i.e. all of them:
matching on a content term (`masterpiece`, `1girl`) would guarantee that term at
100% and make the whole table circular. Counting is whole-tag after normalising
underscores to spaces, stripping `<lora:…>`, weights and escaped parens. The
scripts are throwaway; every number here is reproducible from the two corpus
JSONs by the method described above.
