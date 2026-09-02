# 08 — Vendor and community prompting skills

**Read this before step 1.** It changes where research starts.

A recipe's `systemPrompt` is a prompting skill. The only difference between it
and the ones on GitHub is that ours ships inside a product instead of being
copied into an agent folder. So the skills that already exist for a target model
are not background reading — they are **the closest thing to a specification we
will ever get**, and for some models they are how every serious user writes a
prompt at all.

This was learned the expensive way. See [09-field-evidence.md](09-field-evidence.md)
for what it cost on `minimax-h3`.

---

## The rule

**Before writing a line of a recipe, search for a prompting skill for that
model — the vendor's first, the community's second.** Record what you found and
what you did with it. "I could not find one" is a finding; "there isn't one" is
a claim that needs the search behind it.

Order of authority:

| Rank | Source | Why |
|---|---|---|
| 1 | **The vendor's own prompt-writing skill or guide** | It is the model author telling you the input shape. Nothing outranks it. |
| 2 | **The vendor's inference code / node** | What the model *actually* accepts, as opposed to what a doc says. Settles negative fields, token caps, resolution grids. |
| 3 | **A large community skill** | Real users, measured against real output, usually more practical than the vendor doc |
| 4 | **A measured corpus** (Civitai etc.) | What people actually type — see [01-research.md](01-research.md) |
| 5 | A blog post | Weakest. Often generic video-model advice with the model's name pasted on. |

Rank 5 is not a joke entry. A `forvideo.ai` H3 "native audio guide" recommended
ranked-pair mix phrasing (*"dialogue forward, faint street noise"*); a deliberate
A/B on a saloon scene measured it as **actively worse**, and the page still
carried an unfilled `[INSERT_IMAGE: ...]` placeholder. Generic advice with a
model name on it is worse than no advice, because it reads as specific.

---

## Where to look

- **The model's own GitHub org**, including dotfolders. MiniMax ship theirs at
  `MiniMax-AI/MiniMax-H3` → `.claude/skills/h3-prompt-writing/` **and**
  `.agents/skills/h3-prompt-writing/` (identical copies). There is no `skills/`
  folder at the repo root, so a search for one finds nothing and concludes
  wrongly. Use the git tree, not a guess at the path:

  ```sh
  gh api repos/<org>/<repo>/git/trees/main?recursive=1 --jq '.tree[].path'
  ```

- **The HuggingFace model repo `docs/`.** Often the same file. Diff them rather
  than assuming — on H3 the skill's `references/*.txt` are **byte-identical** to
  the HF `docs/VIDEO_PROMPT_WRITING_GUIDE_*.md`, which is itself the finding
  that stopped a wasted re-read.

- **A GitHub search, sorted by stars.** This is where the community ecosystem
  shows up and it is not small:

  ```sh
  gh api "search/repositories?q=<model>+skill&per_page=10" \
    --jq '.items[] | "\(.full_name) — ★\(.stargazers_count)"'
  ```

---

## Seedance is the case that proves the rule

Measured 2026-08-17. `seedance-1.5` and `seedance-2.0` are registered but out of
v1.0, so nothing here is urgent — it is recorded now because it is what the
search returns today and because Fabio flagged it directly: **for Seedance,
people do not touch the prompt without a skill.**

| Repo | Stars |
|---|---|
| `dexhunter/seedance2-skill` | 3,315 |
| `songguoxs/seedance-prompt-skill` | 2,672 |
| `liangdabiao/Seedance2-Storyboard-Generator` | 2,112 |
| `beshuaxian/higgsfield-seedance2-jineng` | 754 |
| `MapleShaw/seedance2.0-prompt-skill` | 730 |
| `liangdabiao/make-prompt-seedance2` | 608 |

Plus `xiaoliangliang/seedance-2.5-prompt-skill`,
`AtlasCloudAI/awesome-seedance-2.5-prompts-skills`, `LeoYeAI/seedance-skills`
(28 skills, T2V/I2V/V2V/FLF2V) and others.

**When Seedance is implemented, those are the specification and the
competition.** A `seedance-2.0` recipe that ignores a 3,000-star skill is not
under-researched, it is *wrong* — the users we are enhancing for are already
using it, and our output will be measured against theirs whether we like it or
not. Read the top two before drafting, and record which conventions were adopted
and which were rejected with a reason.

The same search is owed to every model in the registry that has one. **As of
2026-08-17 all 12 recipes have had it** — see the survey below — but only
`minimax-h3` and `flux-2` were *authored* this way; the rest had step 0 applied
retroactively, which is how three of them turned out to be confidently specified
from the wrong source.

---

## What to do with what you find

**Adopt surgically, and say what you did not adopt.** A vendor guide can
describe a shape that is not your input shape — H3's `ref-en.txt` documents a
six-section *rewrite output* (`subject_definitions`, `summary`,
`retention_analysis`, …), and there is a live question about whether that is the
user's input format or the vendor rewriter's intermediate. Fabio's production
took the `[Shot N]` cut syntax and the two sound fields and left the other four
sections alone, on the reasoning that changing the prompt format in the same
roll as a content change makes a bad result unattributable. That is the right
instinct and it is now the rule: **one format change per measurement.**

**Do not let a guide overturn a measurement.** Where the doc and a real render
disagree, the render wins and the disagreement gets written down. Where they
agree, you have a rule worth building a `forbiddenPatterns` entry on.

**A guide is evidence about the MODEL, not about your recipe's mode.** See
[09-field-evidence.md](09-field-evidence.md) — evidence is scoped to the mode
that produced it, and the vendor's base-mode guide says nothing about how your
reference mode behaves.

---

## The registry survey, 2026-08-17 — READ THIS BEFORE REVISING ANY RECIPE

A first pass of step 0 across the registry, run read-only in one session.
**TWO** recipes that were Stage 1 **green** had official vendor
prompt-enhancement material nobody had opened — `wan-2.2` and `ltx-2.3`.

**Both were read and merged on 2026-08-17 (MPI-27)**, which reset each one's
twice-green counter, as any recipe edit does. The claim-by-claim read-outs —
including what was rejected and why — live in the matching
`docs/recipes/research/<id>/sources.md`, not here.

**Corrected 2026-08-17, same day.** This section first said *three*, and that
*"none of the 12 recipes was authored with any of this"*. Both overstated the
gap, and checking the per-recipe manifests is what caught it: `flux-2` had
already been authored against BFL's official skills repo — it is **source #1 in
`docs/recipes/research/flux-2/sources.md`, pulled at HEAD via `gh api` on
2026-08-05**, with the five rule files it used listed. `ltx-2.3` likewise already
carries official Lightricks docs, the model card and the API prompting guide;
what it lacks is specifically the shipped rewriter **code**. A survey that reads
the world but not our own records will invent work that is already done — check
`sources.md` before adding a recipe to a work-list.

**Locations live in `docs/recipes/research/<id>/sources.md`, not here**
(Fabio, 2026-08-17). Skill *content* is deliberately not stored in this repo; the
online location is what gets recorded, so Cubric Studio can integrate the skills
later as the agentic app. Every row below has since been written into the
matching manifest, and `minimax-h3` — which had no research folder at all, despite
being the only recipe authored from a vendor skill — now has one.

| Recipe | What exists | Authority |
|---|---|---|
| `minimax-h3` | `MiniMax-AI/MiniMax-H3` → `.claude/skills/h3-prompt-writing/` | vendor skill — **merged 2026-08-17** |
| `wan-2.2` | `Wan-Video/Wan2.2` → `wan/utils/system_prompt.py` + `prompt_extend.py` | vendor's own shipped rewriter prompt — **read and partly merged 2026-08-17** |
| `ltx-2.3` | `Lightricks/LTX-2` → `…/gemma/encoders/prompts/gemma3_{t2v,i2v}_system_prompt.txt` | vendor's own shipped rewriter. NOT `Lightricks/LTX-Video` (retired 0.9.x line) and NOT the `gemma4_*` files in the same directory — those are **LTX-2.5's**, and are what got merged on 2026-08-17 by mistake. `base_encoder.py:84-90` selects by `model_type`; `MODELS-LTX-2.3.md` names Gemma 3. **Merge unresolved — see below** |
| `ltx-2.5` *(not yet a recipe)* | `Lightricks/LTX-2` → `…/gemma/encoders/prompts/gemma4_{t2v,i2v}_system_prompt.txt` | **step 0 already done, 2026-08-17, accidentally** — read in full and transcribed while surveying `ltx-2.3`. Vendor-stated target "roughly 150–220 words"; framing triple; closing AESTHETIC QUALITY pass; camera movement "expected and good" |
| `flux-2` | `black-forest-labs/skills` (official, ★99) + `black-forest-labs/flux2` → `docs/flux2_with_prompt_upsampling.md` | vendor skill — **the skills repo was ALREADY READ** (source #1, 2026-08-05); only the upsampling doc is outstanding. Note the skills have since moved to target FLUX **3** |
| `seedance-1.5` / `seedance-2.0` | a large community ecosystem, top entry ★3,315 — **plus** `krea-ai/skills` → `krea-generate/references/models/seedance-2.md`, a serving-platform vendor reference found 2026-08-17 | community + platform vendor |
| `kling-3.0` | community only, inside multi-model kits (`ai-shortfilm-prompts` ★352) | community |
| `krea-2` | `krea-ai/skills` (official Krea org, ★18) → `krea-generate/references/models/krea-2.md` — **found 2026-08-17.** Note the recipe already carried Krea's own `docs/expansion.txt` rewriter as source #2 | vendor skill — **read, nothing adopted** (it is API-surface guidance; see the manifest) |
| `chroma` | **no vendor prompting material exists** — searched 2026-08-17. The vendor ships inference/training code only: `lodestones/Chroma1-HD` config + `lodestone-rock/flow` | vendor code (rank 2) — **read; it corrected a shipped 20x-wrong token-window claim** |
| `sdxl` | **no vendor prompting material exists** — searched 2026-08-17. Official model card read (closes the gap `sdxl/sources.md` flagged itself); `Stability-AI/generative-models` has one `.md` in its whole tree | official docs — **read, corroborates only** |
| `pony` | **no vendor prompting material exists** — searched 2026-08-17 (`AstraliteHeart`, 30 repos). Largest community artefact is `Siberpone/lazy-pony-prompter`, already the recipe's source #2 | community tool — **already read at authoring time** |
| `illustrious` | **no vendor skill; the vendor's model card IS prompting guidance** — `OnomaAIResearch/Illustrious-xl-early-release-v0`, found and read 2026-08-17. Top community artefact `regiellis/ComfyUI-EasyNoobai` ★52 | official docs — **read, corroborates three recipe rules** |

### `wan-2.2` — the vendor ships the exact thing our recipe is

`system_prompt.py` holds Alibaba's own prompt-rewriting system prompts (T2V/I2V,
ZH and EN). It is not documentation *about* prompting; it is the production
rewriter, which makes it rank 1 **and** rank 2 at once. It specifies, with
enumerated vocabularies:

- A fixed slot list — time, light source, light intensity, light angle, contrast,
  saturation, colour tone, **shooting angle**, **shot size**, composition — each
  with a closed value set.
- **Defaults per slot**: daytime unless stated; centre composition unless stated;
  medium or wide shot unless stated.
- **A conditional we do not have**: *if the original prompt already describes
  camera movement, do NOT add a shooting angle.* That is a real interaction
  between two of our own slots.
- **Style goes first when present**, and cinematic aesthetics are suppressed
  entirely for non-photoreal styles (2D illustration and similar).
- *"Do not output literary descriptions of atmosphere or feeling"* — the opposite
  of what a generic enhancer does.
- A length target of **60–200 characters** (Chinese), which is a different unit
  from our `wordBudget` and needs converting rather than copying.

### `ltx-2.3` — and the version trap that nearly shipped as vendor authority

**This section originally cited the wrong model line, and the correction is the
more useful finding.** It named `Lightricks/LTX-Video` →
`ltx_video/utils/prompt_enhance_utils.py`, quoting its **150-word limit, stated
twice**, and its 7-element order. That file is genuine vendor code — for **LTXV
0.9.x**, a line the repo's own README retires: *"LTX-2 is now the primary home
for LTX development."* Its companion pipeline caps the text encoder at
`text_encoder_max_tokens: int = 256` (T5). None of it describes LTX-2.3.

The real material is in **`Lightricks/LTX-2`**, at
`packages/ltx-core/src/ltx_core/text_encoders/gemma/encoders/prompts/` —
`gemma4_t2v_system_prompt.txt` and `gemma4_i2v_system_prompt.txt` (plus `gemma3_*`
variants). Read and merged into the recipe on 2026-08-17; the claim-by-claim
read-out lives in `docs/recipes/research/ltx-2.3/sources.md`, rows 9–11.

### …and then the same mistake, one level deeper, in the same session

**That paragraph is wrong, and it is wrong in the most instructive way
available: the fix for the version error contained a version error.** The
correction above was "use the right repo" — so the survey moved to
`Lightricks/LTX-2`, found the artefact, and stopped. But that repo serves **two
model lines at once**, and the rewriter is chosen by a filename prefix:

- `base_encoder.py:84-90` — `model_type == "gemma3"` → `gemma3_*_system_prompt.txt`;
  `model_type == "gemma4"` → `gemma4_*`.
- `MODELS-LTX-2.3.md` — LTX-2.3's text encoder is **Gemma 3**
  (`google/gemma-3-12b-it-qat-q4_0-unquantized`).
- `encoder_configurator.py:112` — *"LTX-2.3 / gemma3 checkpoints"*; `:118` —
  *"(LTX 2.5 / gemma4)"*.

So `gemma4_*` is **LTX-2.5's** rewriter and `gemma3_*` is LTX-2.3's. Right org,
right repo, right directory, right file name, still the wrong model — and this
time the artefact was not even ambiguous, the selection logic is four lines long.

**The rule this yields: a version check that stops at the repo boundary is not a
version check.** Read the code that SELECTS the artefact for your checkpoint, not
merely the code that contains it.

**It matters, because the two rewriters disagree in the direction that changes
output.** `gemma4` closes on an AESTHETIC QUALITY pass (*"richly saturated
film-grade color"*, *"warm cinematic lighting"*); `gemma3` demands *"Restrained
language: Avoid dramatic/exaggerated terms"*, *"Colors: Use plain terms ('red
dress'), not intensified ('vibrant blue')"*. `gemma4` says *"Camera movement is
expected and good"*; `gemma3` says *"DO NOT invent camera motion unless requested
by the user"*. `gemma4` says *"roughly 150–220 words"*; `gemma3` states **no
target at all**, so a `wordBudget` was reset from a neighbouring model's taste.
`gemma3` also carries two rules we have never had: a leading `Style: <style>`
prefix, and *"No timestamps or cuts … unless explicitly requested"*.

**The cheapest version check available was already on the page.** The manifest's
row 11 cites `MODELS-LTX-2.3.md` for "Gemma 3" two lines below row 10 adopting
`gemma4_*` — written in the same session, by the same pass. **Read your own rows
against each other before trusting either.**

**And a wrong-version read is not wasted work.** The `gemma4` merge is the
vendor's own authority for **LTX 2.5**, which Fabio has flagged as the next model
(HF `Lightricks/LTX-2.5`, created 2026-07-23, weights gated, `text_encoders/
gemma4-12b-with-proj-ltx-2.5-bf16.safetensors`). Step 0 for that model is
already done. File a wrong-version read under the model it actually describes
rather than deleting it.

What it actually says, none of which the 0.9.x file does: the output is a
**training-caption**, not an instruction; the framing **triple** (one shot type
from a closed set, camera motion always stated, camera viewpoint) is mandatory
and must be prose, *"never as tags or labels"*; the target is *"roughly 150–220
words"*; and it **reverses a community rule we had shipped** — identify people
specifically and differentiate them consistently, where our `dos` said use
collective nouns and never exact counts.

**A VENDOR-CODE CITATION IS ONLY AS GOOD AS ITS VERSION.** Right organisation,
right file name, right kind of artefact, wrong model — and nothing in the act of
reading it says so. This survey found the file by searching for the artefact, and
that is precisely how the version gets skipped. Before treating any vendor file
as authority, confirm the repo serves the model in the recipe's `modelId`: read
its README for a "primary home has moved" notice, and look for a repo named after
the model generation.

**And resist the generalisation about budgets in either direction.** H3's ceiling
was fiction. LTX-2.3's target is real but is **not** a wall either: the encoder is
**Gemma 3 12B** with `TOKENIZER_MAX_LENGTH = 1024` (~750 words), so 150–220 is the
vendor's stated taste, adopted because the model was trained on captions of that
length — not because anything truncates. *Check the encoder per model*, which is
what `.claude/rules/engine-recipes.md` requires: a budget comes from the encoder,
and where the encoder imposes none, from the vendor's own stated target.

The vendor also ships an **i2v** rewriter (first-frame grounding: open on the
reference image exactly, never contradict it, single continuous take, no hard
cuts). `ltx-2.3` has no i2v mode, so it is recorded and not built — the material
an i2v mode would start from.

### What this survey does NOT claim

It was a **search result, not a reading** — each file opened far enough to
establish what it is. That distinction has since been closed for exactly two
rows: `wan-2.2` and `ltx-2.3` were read claim by claim on 2026-08-17 and their
recipes changed on the strength of it. **`seedance-1.5`, `seedance-2.0` and
`kling-3.0` remain search results**, and those three are out of v1.0 anyway.

The reading is also where the survey's one hard error surfaced: `ltx-2.3`'s row
named the wrong model line, and only opening the repo's README showed it. A
search result cannot tell you a version is wrong — see the `ltx-2.3` section.

**It covered 7 of 12 recipes. The remaining five were searched on 2026-08-17 and
the table above now covers the whole registry.** `chroma`, `krea-2`, `sdxl`,
`pony` and `illustrious` had been absent because nobody looked, not because
nothing exists — **"not surveyed" is not "nothing exists"**, the same distinction
`.claude/rules/behaviour.md` draws between "I could not find it" and "it does not
exist". Running it settled which of the two each one was.

### The five never-searched recipes — result, 2026-08-17

One find, one defect, three confirmations, and **not one sweep owed** — no
element order, budget, vocabulary or `dos`/`donts` line changed on any of the
five, so all five greens stand. Read-outs live in each
`docs/recipes/research/<id>/sources.md`.

- **`krea-2` — a find.** `krea-ai/skills` is an official Krea skills repo (★18,
  ships as a Claude/Codex/Cursor plugin) carrying
  `krea-generate/references/models/krea-2.md`. **Nothing was adopted, and the
  reason generalises:** its central rule — *"moodboards control taste; prompts
  control what is in the frame"* — is scoped to Krea's hosted API, where a
  moodboard input exists. Vision runs Krea 2 in local ComfyUI where it does not,
  and the vendor's own escape clause covers that case (*"do not fake the
  moodboard in the prompt"*, proceed prompt-only). **A vendor rule can be
  correct and still not apply, because it is scoped to a SURFACE we do not use.**
  Same shape as scoping a field claim to its mode. Also recorded: Krea's API has
  a `creativity` enum (`raw`/`low`/`medium`/`high`) that is *"prompt expansion
  mode"* — anything but `raw` expands the prompt a second time, so an API path
  would double-expand.
- **`chroma` — a defect, found in our own recipe rather than in the world.** The
  vendor publishes no prompting guide at all, but its code says the T5 encoder
  caps at **512 tokens** (`model_max_length` on the model card, `t5_max_length`
  in every `lodestone-rock/flow` inference config). The recipe's `notes` claimed
  a *"~10,000-token context window"* from a community synthesis doc — **wrong by
  20x**. It was harmless *because* the budget is 160 words, i.e. the false
  premise was supporting a correct conclusion, which is precisely why it survived
  review for months. Fixed. `notes` reaches no prompt, so it cost no sweep. This
  is the third form of the ceiling trap this playbook now carries: H3's ceiling
  was fiction that was too LOW, `ltx-2.3`'s citation was the wrong VERSION, and
  chroma's was fiction that was too HIGH. **Check the encoder yourself, per
  model, every time.**
- **`illustrious` — no skill, but the vendor's model card *is* prompting
  guidance, and it corroborated three rules the recipe had reached the hard way.**
  OnomaAI state the composition-tag discipline (*"do not overuse critical
  composition tags … they can be conflicting"* + *"use suitable composition tags
  like 'upper body,' 'cowboy shot,' 'portrait,' or 'full body'"* → exactly one),
  enumerate `masterpiece` and `best quality` as supported, and state *"the model
  does not have any default style"*. All three are already enforced. Their
  examples carry no `score_*` chain, confirming the corpus from the vendor side.
  One conflict left standing: a vendor example ends on `masterpiece`, and the
  recipe puts the block first on 84% of 386 measured prompts — **the measurement
  wins**, and it is a Stage 2 A/B, not an edit. This recipe also had **no
  `sources.md` at all** until this pass; it has one now.
- **`sdxl` and `pony` — confirmed negatives, with the search behind them.**
  Stability ships one `.md` in the whole `generative-models` tree and no
  rewriter; `AstraliteHeart`'s 30 repos carry no prompting skill, and the biggest
  community artefact was already the recipe's source #2. The official SDXL card
  did close a gap the manifest had flagged against itself, and its Limitations
  section gives first-party backing for two existing rules (no legible text, no
  nested spatial relations). For these two the measured **split** Civitai corpus
  remains the primary source, which is the right answer for a community
  checkpoint ([01-research.md](01-research.md)).

**The lesson for the next survey is about cost.** All five took one session,
read-only, no GPU, and changed one string in one recipe. The expensive half of
step 0 is never the search — it is the merge, and a search that ends in
"corroborates" or "does not apply to our surface" is a *result*, not a wasted
pass. Two of these five had defensible reasons to be skipped and one of those
two ("`chroma` is just a gap") is where the defect was.
