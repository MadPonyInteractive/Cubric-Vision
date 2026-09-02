# Pony vocabulary — measured evidence

Playbook §1.4: a finding that is a **list of words** must be measured, never
authored from documentation. This is that measurement for the `pony` recipe.

- **Pulled:** 2026-08-09, Fabio's VPN on (Civitai region-blocks the UK). Clock
  checked against `gh api rate_limit -i` → `Sun, 09 Aug 2026 18:11:05 GMT` vs
  local `18:11:04` — **1s, no skew**, despite the VPN. (The ~14h skew in
  `CLAUDE.md` is a real hazard but not a certainty; measure, don't assume.)
- **Written up:** 2026-08-10.
- **Corpora** (`docs/recipes/research/_corpus/`, gitignored):

| Set | File | n (deduped) | What |
|---|---|---|---|
| **merge** | `pony/animergemeij-v3.json` | **32** | `modelVersionId=990917` — **the exact checkpoint Vision ships** as `pony-mix` (ANImergeMEij v3.0+VAE) |
| **base** | `pony-broad/pony-base-broad.json` | **209** | `baseModel` contains "Pony", any checkpoint |

Both at `--nsfw None`, sorted by Most Reactions — i.e. prompts that produced
images people actually liked. Civitai's `/api/v1/images` returns `meta: null`
for every item, so the prompt comes from each image page's `__NEXT_DATA__`;
**only the positive prompt is recoverable that way.** No negative prompt in
either corpus — §5 below is documentation-sourced and says so.

---

## 1 — Split before counting (the finding that matters)

A merged count would have called the score-chain question a coin flip. Split, it
is not close:

| | merge (32) | base (209) | Δ |
|---|---|---|---|
| any `score_` tag | 66% | 88% | −22 |
| exactly **3** distinct score tags | **59%** | 35% | +24 |
| exactly **6** distinct score tags | **0%** | **30%** | **−30** |
| `score_9` | 66% | 80% | −14 |
| `score_8_up` | 66% | 86% | −20 |
| `score_7_up` | 66% | 77% | −11 |
| `score_6_up` | **3%** | **47%** | **−44** |
| `score_5_up` | 3% | 32% | −29 |
| `score_4_up` | **0%** | 28% | −28 |

**The official six-tag chain does not appear on our checkpoint at all** (0/32),
while it is the second-most-common form on base Pony (30%). The lower half of
the ladder is what disappears: `score_6_up` falls 47% → 3%.

This is the *only* thing that settles `sources.md` Conflict 1, and it agrees
exactly with the merge author's own line on the model page (Civitai 734527,
fetched under the same VPN window):

```
4 prompting:    score_9, score_8_up, score_7_up, source_anime,
4 neg. promptin: score_1, score_2, score_3, score_4, score_5, score_6,
```

Highest-authority source and measured majority practice agree. **Kept: the
three-tag chain.**

## 2 — `source_` is the merge's strongest marker

| | merge | base | Δ |
|---|---|---|---|
| `source_anime` | **56%** | 13% | **+43** |
| `source_pony` | 0% | 5% | −5 |
| `source_furry` | 0% | 6% | −6 |
| `source_cartoon` | 0% | 6% | −6 |

`source_anime` is the single most discriminating tag in the whole measurement.
**Kept, always emitted.** The other three are **excluded**: zero occurrences on
the merge, and `source_pony` in particular drags output toward MLP-style art.

## 3 — The Illustrious/Animagine block, and what it implies

Eight tags from the Animagine XL 3.1 / Illustrious quality vocabulary all move
the same direction at once:

| | merge | base | Δ |
|---|---|---|---|
| `absurdres` | 34% | 5% | **+29** |
| `very aesthetic` | 22% | 1% | **+21** |
| `masterpiece` | 38% | 17% | +21 |
| `best quality` | 31% | 14% | +17 |
| `newest` | 13% | 0% | +13 |
| `best aesthetic` | 13% | 0% | +13 |
| `amazing quality` | 13% | 2% | +11 |
| `highres` | 16% | 3% | +13 |

`masterpiece, best quality, very aesthetic, absurdres` **is** the Animagine
quality block verbatim, and `newest` is its recency tag. Eight independent tags
agreeing is a pattern, not a single-tag artifact — but n=32 with repeated prompt
families from a few users means the *magnitudes* are soft.

**What this does and does not license.** The corpus measures what users write
and keep, not what was merged in; `baseModel: Pony` is a label the uploader
picks. The honest claim is that **this checkpoint's users adopted
Illustrious-family quality tags while abandoning the lower score ladder**, which
is the same actionable fact without a guess about the weights.

**Excluded from v1.0 — deliberately, and this is the exclusion to re-read
before anyone re-adds it.** The recipe does *not* emit the Animagine block. It
costs 4–6 tags out of a 77-token window that the score chain has already eaten
into, and no text-only test can tell whether it earns them. **It is a Stage 2
A/B for Fabio:** same seed, same body, prefix A `score_9, score_8_up,
score_7_up, source_anime` vs prefix B with `masterpiece, best quality, very
aesthetic, absurdres` appended. If B wins, this is a one-line change.

## 4 — Form, length, and the count anchor

| | merge | base |
|---|---|---|
| tag-form (≥5 comma segments, <20% of them over 6 words) | **88%** | **94%** |
| prose (>50% of segments over 6 words) | **0%** | 2% |
| `1girl`/`1boy`/`2girls`… | 47% | 43% |
| `solo` | 9% | 34% |
| `looking at viewer` | 19% | 19% |
| underscores inside a tag | 75% | 47% |

**Conflict 2 settled: tags, not prose.** The official card's "trained on
combination of natural language prompts and tags" is true of base Pony V6 and
irrelevant to how anyone actually prompts this checkpoint — 0/32 prose.

**Length** (whole prompt, then with `score_`/`source_`/`rating_`/BREAK stripped):

| | min | p25 | median | p75 | p90 | max |
|---|---|---|---|---|---|---|
| merge — words | 2 | 15 | **33** | 74 | 129 | 140 |
| merge — comma segments | 1 | 14 | **24** | 34 | 56 | 64 |
| base — words | 5 | 24 | **41** | 60 | 94 | 133 |
| base — comma segments | 1 | 14 | **25** | 32 | 44 | 113 |
| merge body only — words | 2 | 13 | 35 | 73 | 125 | 136 |
| base body only — words | 2 | 23 | 41 | 56 | 89 | 220 |

Both medians sit at **~24–25 comma segments**, which is the stable number across
the two sets; the word counts differ more because tag length varies. The p90 tail
is inflated by LoRA-stuffed prompts. **This is where `wordBudget` comes from** —
Q1 of the research phase had no documented figure, and §1.3 says derive it from
real examples and say so. Derived: **`{ min: 25, max: 75 }`**, bracketing both
medians with room for the required slots, well under the ~55-word equivalent of
the 77-token window at its top end.

**MPI-28 rule 1 (count locking) lands here natively.** A count anchor is already
in 43–47% of real prompts, it costs one token, and booru grammar has a slot for
it — unlike `ltx-2.3`, whose own sources say exact counts *cause* artifacts
(`ltx-2.3.recipe.js:150`). The recipe emits one always. Same rule, opposite
answer per model: that is why MPI-28's numbers are per-recipe.

## 5 — Negatives are NOT measured

The corpus carries positive prompts only (see the header). The negative baseline
is therefore **documentation-sourced**, and the source that outranks the rest is
the merge author's own: `score_1 … score_6`. It is a pure score ladder — no
anatomy spam, no `source_furry`. Recorded as such in the recipe, and flagged as
the one part of the vocabulary with no measurement behind it.

## 6 — Host-incompatible syntax the corpus is full of

Real prompts use A1111/Forge syntax that **Vision's graph cannot execute**.
`t2i_pony_mix.json` encodes through stock `CLIPTextEncode`; grep for `BREAK`
across `comfy/sd1_clip.py`, `comfy_extras/` and `nodes.py` in Vision's bundled
engine returns **only tokenizer vocab files**, never a parser keyword.

| syntax | merge | base | status |
|---|---|---|---|
| `BREAK` / `<break>` | **44%** | 13% | **hard ban** — encodes as the literal word |
| `<lora:name:0.8>` | 25% | 33% | **hard ban** — Vision owns LoRAs in its own UI |
| `[a, b\|c, d]` alternation | present | present | **hard ban** — A1111 prompt-editing, not in ComfyUI |
| `(tag:1.2)` weights | **0%** | 28% | **supported but not emitted** — `parse_parentheses`/`token_weights` do exist in `sd1_clip.py`, so it is legal; nobody uses it on this checkpoint, so the recipe stays clean |

The `(tag:1.2)` row is the one worth remembering: **legal on the host, absent in
practice.** Banning it would be wrong, emitting it would be inventing a habit
the corpus does not show.

## 7 — Booru vocabulary kept, by slot

Whole-tag matches, present in ≥3 prompts of either set, filtered to tags that
generalise (single-user prompt families dropped — the four `pilgrim's
scallop-shaped pupils` / `scallop shell` prompts are one series, not a
vocabulary).

- **count / framing:** `1girl`, `1boy`, `solo`, `portrait`, `upper body`,
  `full body`, `half-length portrait`, `side view`, `head focus`
- **gaze / expression:** `looking at viewer`, `smile`, `open mouth`, `blush`,
  `happy`, `seductive look`, `determined`
- **hair:** `long hair`, `short hair`, `twintails`, `ponytail`, `double bun`,
  `bangs`, `white hair`, `black hair`, `pink hair`, `blue hair`
- **eyes:** `blue eyes`, `green eyes`, `brown eyes`, `detailed eyes`,
  `glowing eyes`
- **attire:** `white shirt`, `jacket`, `hoodie`, `yukata`, `kimono`,
  `school uniform`, `japanese clothes`, `jewelry`, `necklace`, `earrings`,
  `boots`, `bow`
- **pose / action:** `standing`, `dynamic pose`, `posing`, `holding`,
  `action-pose`, `dancing`, `looking up`
- **setting:** `outdoors`, `indoors`, `night`, `sunset`, `evening`, `blue sky`,
  `forest`, `black background`, `detailed background`, `blurry background`
- **light / finish:** `cinematic lighting`, `volumetric_lighting`,
  `depth of field`, `neon glow`, `vibrant`, `pastel`, `high contrast`,
  `illustration`, `realistic`, `chibi`
- **era (merge-specific, unusual and real):** `1990s`, `2000s`, `newest`

**Excluded as non-discriminating or as noise:**

- `masterpiece`, `best quality`, `absurdres`, `very aesthetic`, `highres`,
  `amazing quality`, `best aesthetic` — high on the merge but **held for the
  Stage 2 A/B** (§3), not because they are weak.
- `8k`, `ultra-detailed`, `intricate details`, `highly detailed`,
  `perfect anatomy` — generic SD quality spam, ≤16% either side, and every
  other Cubric recipe already drops this class.
- `breasts`, `thighs`, `cleavage`, `underwear` — anatomy tags that appear
  because Pony's lineage is adult-heavy. Never volunteered; honoured if the user
  asks.
- `feral`, `anthro` — 17% on **base** (furry lineage), **0%** on the merge.
- `rating_safe` / `rating_questionable` / `rating_explicit` — **8–9% on both
  sets.** This is the measurement that overruled a plan: the draft was going to
  default to `rating_safe` as a product call. Real practice emits no rating tag
  at all, so neither does the recipe. Never volunteer `rating_explicit`.

---

## What a later author should re-measure

1. **The Stage 2 A/B in §3** — the single open question, and the only one that
   can move the prefix.
2. **The negative baseline** (§5) — needs a source the image API does not carry.
   Civitai's model-page example images sometimes show it; that is a VPN job.
3. **n=32 is thin.** `--nsfw None` on a checkpoint with 1,706 downloads is all
   there is at that browsing level. A future pull could widen the level, at the
   cost of adult content in a local contact sheet.
