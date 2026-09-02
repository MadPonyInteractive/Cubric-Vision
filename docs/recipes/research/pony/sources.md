# Source Manifest — PONY Mix (Pony Diffusion V6 XL family)

Provenance for the `pony` recipe. **Web-search sourced** (playbook §1.1) — no
NotebookLM notebook exists for Pony, which is not a blocker (§1.2).

- **Model version researched:** the checkpoint Cubric Vision actually ships as
  `pony-mix` — **ANImergeMEij v3.0+VAE** (`animergemeij_v30VAE`, Civitai model
  734527, author `reijlita`), an anime **merge whose base is Pony Diffusion V6
  XL**. Pony V6 XL is therefore the prompting authority: the merge inherits its
  tag grammar (`score_*`, `source_*`, `rating_*`) and its SDXL/CLIP encoder.
  Where a source speaks for base Pony V6 it is marked; where it speaks for an
  anime Pony merge, that is noted as the closer case.
- **Research date:** 2026-08-09 (clock checked against `gh api rate_limit -i` →
  `Sun, 09 Aug 2026 07:18:01 GMT`; VPN off, local clock matched to 2s, no skew).
- **Researcher:** agent (web search + Cubric Vision's own shipped config).

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | https://huggingface.co/LyliaEngine/Pony_Diffusion_V6_XL | **official-docs (mirror)** | 2026-08-09 | AstraliteHeart's own Pony V6 XL model card, mirrored on HF. The canonical page (Civitai 257749) is unreachable to any agent tool — UK block, see the VPN note below — so this mirror is the primary. Carries: the full score prefix `score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up`; **"the model is designed to not need negative prompts in most cases"**; `source_pony/furry/cartoon/anime`; `rating_safe/questionable/explicit`; **clip skip 2** ("otherwise you will be getting low quality blobs"); **"trained on combination of natural language prompts and tags"**; Euler a, 25 steps, 1024px. |
| 2 | https://github.com/Siberpone/lazy-pony-prompter | official-tool (community) | 2026-08-09 | A prompt-builder whose shipped Pony V6 XL template is the score prefix **verbatim and complete**, with a comment that it must be "exactly like this" because of the training mistake. Independent confirmation that the six-tag chain is the canonical form, and that a builder pushes **character tags toward the front**. |
| 3 | https://techtactician.com/booru-style-tagging-sdxl-anime-prompts-guide/ | community-deep-dive | 2026-08-09 | Booru grammar for SDXL anime models: `1girl`/`1boy` + `solo` as the count anchor, **underscores inside a multi-word booru tag** (`purple_eyes`), and a five-step order (quality → subject/identity → physical traits → attire → background/framing). Negatives are written as tags, "the exact same way" as the positive. Worked example verbatim. |
| 4 | http://anakin.ai/blog/pony-diffusion-prompt-guide/ | community/tool-guide | 2026-08-09 | The **three-tag** short prefix (`score_9, score_8_up, score_7_up`) as the working baseline, a generic anatomy negative baseline, clip skip `-2`, and score-first / source-and-rating-late ordering. Conflicts with #1 on prefix length — see Conflict 1. |
| 5 | https://education.civitai.com/civitais-prompt-crafting-guide-part-1-basics/ | platform-docs | 2026-08-09 | Civitai's own guide. Two claims used: **group related tokens together** ("keeping similar tokens grouped together increases the chances of them being included"), and Pony has "their own prompt syntax … which must be used to obtain good outputs" — i.e. a generic SDXL photo prompt is the wrong shape for this checkpoint. |
| 6 | https://huggingface.co/ddpr/pony1/blob/main/README.md | community | 2026-08-09 | A shipped Pony workflow's actual pair: positive `score_9, score_8_up, score_7_up, …`, negative `score_6, score_5, score_4, score_3, score_1, source_furry, source_comic, …`. Evidence that **negative score tags + unwanted `source_` tags** is the community's default negative, against #1's "no negative needed". |
| 7 | Civitai 734527 (ANImergeMEij), Civitai 257749 (Pony V6 XL), Civitai article 4248 ("What is score_9…"), stable-diffusion-art.com, whatlab.ai, tensor.art | **NOT READ — access-blocked** | 2026-08-09 | Recorded so a later author does not assume they were consulted. Civitai region-blocks the UK and agent WebFetch can never reach it; `stable-diffusion-art.com`, `whatlab.ai` and `tensor.art` returned **403** to both WebFetch and a shell fetch (Cloudflare interstitial). Their *search-result summaries* are visible and are used only where an already-read source says the same thing. **The merge author's own recommended prompt is in this bucket** — it needs Fabio's VPN and a shell fetch. |
| 8 | `Cubric-Vision/js/data/modelConstants/{models.js,modelDeps.js}`, `docs/models/community-merges-licences.md` | **in-house, shipped config** | 2026-08-09 | The ground truth for what this recipe actually serves. `pony-mix`: `type: 'sdxl'`, **no `enhanceRecipe`**, ops `t2i/i2i/control/upscale/detail`, `capabilities: { controlStrength: true }` — and `negativePrompt` is absent, which per the ModelDef contract **defaults to TRUE**, so this model has a live negative field. Upstream file `animergemeij_v30VAE`. |
| 9 | HuggingFace `transformers` CLIP docs — `max_position_embeddings` = 77 | official-docs (architecture) | 2026-08-05 (carried from the `sdxl` recipe) | The encoder ceiling. Pony V6 XL is an SDXL fine-tune, so it inherits CLIP ViT-L + OpenCLIP ViT-bigG and the **77-token window**. Same reasoning already written into `sdxl.recipe.js`. |

Six sources survive the hierarchy (#1 official, #2 and #6 shipped tool/workflow
artefacts, #3–#5 community/platform), plus one in-house config source that
outranks everything where they touch. **#7 is the honest record of what could
not be reached** — the merge author's page among it.

## Conflicts

1. **How many score tags.** #1 and #2 give the full six-tag chain; #4 (and the
   readable search summaries of the blocked pages) work with three. Both agree
   the chain leads the prompt. **Not resolvable from documentation** — this is a
   word list, so playbook §1.4 applies: settle it against a real Pony corpus.
2. **Negative prompt.** #1 (official) says the model is built not to need one;
   #6 and #4 ship substantial negatives anyway, and Vision gives `pony-mix` a
   live negative field (#8). Draft takes the **more useful** reading rather than
   the more restrictive: emit a short, tag-shaped negative, because the field
   exists and the community default fills it. Settled empirically in Stage 1.
3. **Tags vs natural language.** #1 says the model reads both; #3 and #5 say the
   booru tag form is what an anime Pony checkpoint actually wants. Corpus
   question again — measured, not argued.

## Step 0 — the vendor prompting-skill search (2026-08-17)

Per `docs/recipes/playbook/08-vendor-prompt-skills.md`, run because `pony` was on
the never-searched list. Clock checked against `gh api rate_limit -i` →
`Mon, 17 Aug 2026 10:10:35 GMT`, no skew.

Searched: `AstraliteHeart` on GitHub (30 repos — training forks, captioning
tools, `pony-diffusion` which is the old SD1.x finetune; **no prompting skill, no
rewriter, no `.claude/skills/`**), and GitHub repo search for Pony prompting
repos sorted by stars. The community tail is prompt *builders*, not agent skills:
`dan4in/Stable-diffusion-Prompt-Helper-Pony` ★25,
`ZealousMagician/Ponymaster` ★18, `Siberpone/ponyverse` ★4, then ★0s.

**Finding: no vendor skill exists, and the largest community artefact is already
source #2 above** (`Siberpone/lazy-pony-prompter`), whose shipped template this
manifest read when the recipe was authored. Nothing outranks what is already
here; the split Civitai corpus (`vocabulary-evidence.md`) remains the primary
source, which is the right answer for a community merge.

**Net effect on the recipe: nothing.** Stage 1 green untouched, no sweep owed.
The one thing this search did NOT close is #7 above — the merge author's own
recommended prompt is still behind the Civitai region block and still needs
Fabio's VPN.

## Status

Documentation half complete; all 7 standard questions answered in
`research.md`. **The vocabulary half (§1.4) is NOT done** — it needs a Civitai
corpus pull, which needs Fabio's VPN. Do not author the recipe's tag vocabulary
until that measurement exists.
