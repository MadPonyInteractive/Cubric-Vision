# Source Manifest — Flux / Chroma / Krea

Provenance for the Flux / Chroma / Krea recipe. Sources are from Fabio's NotebookLM
notebook "Flux based models prompting" (`1a01cf17`); transcribed via
`notebooklm source list -n 1a01cf17 --json`.

- **Model version researched:** Flux / Chroma / Krea (FLUX.1 ecosystem, text-to-image)
- **Research date:** 2026-06-22
- **Researcher:** Fabio (curation) + agent (query)
- **Notebook:** `1a01cf17` — "Flux based models prompting"

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | [Best Prompts of Flux.1 AI for Flux Images — March 4, 2025](https://fluxproweb.com/blog/detail/Best-Prompts-of-Flux1-AI-for-Flux-Images-%E2%80%94-March-4-2025-736584797497/) | community-deep-dive | 2026-03-26 | Community prompt gallery with annotated examples |
| 2 | [Creating images with Flux: Your prompt guide — Nebius](https://nebius.com/blog/posts/creating-images-with-flux-prompt-guide) | community-deep-dive | 2026-03-26 | Practical guide covering structure, lighting, layered composition, and first-image walkthrough |
| 3 | Deep Systems Analysis of Prompt Engineering and Architectural Optimization for FLUX.1 Ecosystems: A Specialized Review of Chroma and Krea Integration (markdown) | community-deep-dive | 2026-03-26 | Dense synthesis doc covering T5/CLIP dual-encoder, Chroma de-distillation, Krea real-time mode, artifact remediation, foundational formula |
| 4 | [FLUX Prompting Guide: Tips and Techniques for Image Creation — Segmind](https://blog.segmind.com/flux-prompting-guide-image-creation/) | community-deep-dive | 2026-03-26 | Covers correct/incorrect syntax, negative prompt usage, token limits (~500) |
| 5 | [FLUX.1 Prompt Manual: A Foundational Guide — r/FluxAI](https://www.reddit.com/r/FluxAI/comments/1imha0t/flux1_prompt_manual_a_foundational_guide/) | community-deep-dive | 2026-03-26 | Community manual; avoidance of SD syntax; do's and don'ts |
| 6 | [Flux — Krea Documentation Home](https://docs.krea.ai/user-guide/features/flux) | official-docs | 2026-03-26 | Krea's official Flux feature documentation; real-time, Draw Mode, Enhancer |
| 7 | [Generate faster with Chroma! — r/StableDiffusion](https://www.reddit.com/r/StableDiffusion/comments/1nbhbsa/generate_faster_with_chroma/) | community-deep-dive | 2026-03-26 | Chroma-Flash variant details; CFG 1, negative-prompt avoidance recommendation |
| 8 | [How to write AI image prompts like a pro [2026] — Let's Enhance](https://letsenhance.io/blog/article/ai-text-prompt-guide/) | community-deep-dive | 2026-03-26 | General AI prompt guide; natural language advocacy, structural tips |
| 9 | [Krea AI Prompt for Content Generation With Cheat Sheet — Picwand](https://www.picwand.ai/ai-generation/krea-ai-prompts/) | community-deep-dive | 2026-03-26 | Krea-specific prompt cheat sheet; negative prompt field exists on platform |

Authority tiers (highest first): `official-docs`, `official-example`, `community-deep-dive`, `comparison`.
One official-docs source (Krea documentation); remainder are community-deep-dives and synthesis documents.
Community findings supplement, never override, official sources.

**Excluded / rejected sources:** None explicitly excluded; all 9 notebook sources retained as relevant.

## Step 0 — the vendor prompting-skill search (2026-08-17)

Per `docs/recipes/playbook/08-vendor-prompt-skills.md`, run because `chroma` was
on the never-searched list. Clock checked against `gh api rate_limit -i` →
`Mon, 17 Aug 2026 10:10:35 GMT`, no skew.

**Note this folder is still named for the deprecated `flux-chroma-krea` recipe**
(MPI-25 split it into `chroma` + `krea-2`). The rows below are `chroma`'s; the
nine rows above predate the split and were written for the merged Flux/Chroma/Krea
entry, which is why not one of them is Chroma's vendor.

Searched: `lodestone-rock` on GitHub (30 repos), `lodestones/*` on HuggingFace,
and GitHub repo search — the last is close to useless for this model, because
"chroma" collides with ChromaDB and returns vector-store RAG projects.

**Finding: Chroma's vendor publishes no prompting guide, no prompt-rewriter and
no skill.** What the vendor does publish is inference and training code, which
is rank 2 and settled two things documentation had wrong.

| # | Source | Tier | Accessed | What it backed |
|---|---|---|---|---|
| 10 | [`lodestones/Chroma1-HD` model card + config](https://huggingface.co/lodestones/Chroma1-HD) | **1 — official (vendor)** | 2026-08-17 | 8.9B, FLUX.1-schnell-derived, Apache 2.0. `text_encoder/config.json` → `T5EncoderModel`, `d_model: 4096` (T5-XXL). `tokenizer/tokenizer_config.json` → **`model_max_length: 512`**. One worked example prompt (prose, ~55 words) with a tag-shaped negative, at `guidance_scale: 3.0`. |
| 11 | [`lodestone-rock/flow`](https://github.com/lodestone-rock/flow) — ★171, the Chroma training repo | **2 — vendor inference/training code** | 2026-08-17 | `t5_max_length: 512` in every shipped inference config. Dataset schema `caption_or_tags` + `is_tag_based` (bool), with `shuffle_tags` and `tag_drop_percentage` — the model was trained on **both** prose captions and comma tag lists, and the tag branch was trained with the tag order **shuffled**. |

### Read-out

| Claim | Verdict |
|---|---|
| **The encoder ceiling is 512 T5 tokens (~380 words), not ~10,000.** | **DEFECT FOUND AND FIXED.** `chroma.recipe.js`'s `notes` claimed a *"~10,000-token context window"* and justified the budget as *"the architecture allows ~10,000 tokens but real users do not use them"*. The vendor's own tokenizer config and its own training configs both say 512. Nothing was truncated in practice — the budget is 160 words, well inside 512 — so the number was never load-bearing, which is exactly why it survived: **a false premise supporting a correct conclusion.** The hazard is the next author who reads it and "uses the capacity": at ~380 words the prompt starts being silently cut. Same family as `minimax-h3`'s fictional ceiling and `ltx-2.3`'s wrong-version citation, inverted — here the fiction was too GENEROUS. `notes` is consumed by nothing (not the enhancer system prompt, not `judgePrompt()`), so the correction is documentation-grade and costs no re-sweep. |
| The 160-word budget itself. | **UNCHANGED, and now properly grounded.** It came from 86 measured Chroma prompts (median 107). With the encoder answered at 512 tokens the budget is confirmed as *taste inside a real ceiling* rather than a wall — the distinction `.claude/rules/engine-recipes.md` requires per mode. |
| Chroma reads prose **and** comma tags; tag order was shuffled in training. | **RECORDED, not adopted.** The recipe is prose-only (`outputFormat: 'prose'`), which the corpus supports (real Chroma users write prose) and the vendor's own example demonstrates. The finding to keep is the negative one: on the tag branch this model was trained with tag order randomised, so **tag position carries no weight here** — do not import Pony/Illustrious-style ordering discipline into a Chroma prompt on the assumption that front-loading helps. |
| The vendor's example ships a real negative prompt at `guidance_scale: 3.0`. | **RECORDED — a variant distinction the recipe already draws, from the other side.** Source 7 above ("CFG 1, avoid negatives") speaks for **Chroma-Flash**, the speed-baked variant Vision ships, which is why `negativeHandling: none` is correct for us. Base Chroma1-HD is de-distilled and takes negatives normally. First-party baseline if MPI-27 Phase 2 (deferred) ever runs. |

**Net effect on the recipe: one `notes` correction, no behavioural change**, so
the Stage 1 green stands and no sweep is owed.

## Coverage note

Source 3 (the deep-systems-analysis markdown) is the single most detailed synthesis document and
the likely origin of many seed-recipe claims. Source 6 (Krea official docs) is the only
first-party documentation in the set. Absence of a Black Forest Labs / official FLUX.1 developer
guide means architecture claims come from community synthesis — flag for Phase 3 if any claim
needs first-party confirmation.
