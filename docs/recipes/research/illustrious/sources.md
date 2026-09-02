# Illustrious — sources

Provenance for the `illustrious` recipe (Cubric Vision's `ill-anime` =
animemix v8.0, and `ill-anime-beauty`).

**This manifest did not exist until 2026-08-17.** The recipe went Stage 1 green
on 2026-08-10 with its vocabulary half fully documented
(`vocabulary-evidence.md`, 178 exact-checkpoint + 208 broad Civitai prompts) and
its documentation half recorded nowhere. That is the gap this file closes; it is
also why the recipe was on the "never searched for a vendor prompting skill"
list in `docs/recipes/playbook/08-vendor-prompt-skills.md`.

- **Model version researched:** Illustrious XL (OnomaAI), as served by the
  community merge **animemix v8.0** that Vision ships. Illustrious XL is the
  prompting authority — the merge inherits its Danbooru tag grammar and its
  SDXL dual-CLIP encoder.
- **Vendor search date:** 2026-08-17 (clock checked against
  `gh api rate_limit -i` → `Mon, 17 Aug 2026 10:10:35 GMT`; VPN off, no skew).
- **Corpus measurement date:** 2026-08-10 — see `vocabulary-evidence.md`.

## Sources

| # | Source | Authority tier | Accessed | What it backed |
|---|---|---|---|---|
| 1 | [`OnomaAIResearch/Illustrious-xl-early-release-v0` model card](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0) | **1 — official docs (vendor)** | 2026-08-17 | The vendor's own prompting guidance, read below claim by claim. Composition-tag discipline, the quality-tag ladder, "no default style", two full worked prompt+negative pairs, sampling settings. |
| 2 | Illustrious technical report (linked from #1: *"For full technical details, please refer to our technical report"*) | 1 — official | **NOT READ** | Recorded so a later author does not assume it was consulted. The card's prompting claims were sufficient; the report is where a deeper tag-distribution or captioning answer would live. |
| 3 | `vocabulary-evidence.md` (this folder) — 178 exact-checkpoint + 208 broad Civitai prompts | 4 — measured corpus | 2026-08-10 | The entire vocabulary half: score chain dead (2%/4%), Animagine quality block native (73%/78%), quality-precedes-count in 84%, and the template-domination finding. |
| 4 | [`regiellis/ComfyUI-EasyNoobai`](https://github.com/regiellis/ComfyUI-EasyNoobai) — ★52 | 3 — community tool | 2026-08-17 | The top community prompt-builder for NOOBAI XL / Illustrious. Found, not read: its shipped prefix would be a third opinion on the quality block, and the corpus already settled that question on 386 prompts. |
| 5 | Cagliostro Animagine XL docs | 3 — adjacent official | (carried) | The quality-block *grammar* the corpus measured as native here. Its stated block ORDER is wrong for this model — see the conflict below. |

## Step 0 — the vendor prompting-skill search (2026-08-17)

Per `docs/recipes/playbook/08-vendor-prompt-skills.md`. Searched:

- `OnomaAIResearch` on HuggingFace (5 models: `Illustrious-xl-early-release-v0`,
  `-XL-v1.0`, `-v1.1`, `-v2.0`, `Illustrious-Lumina-v0.03`) — model cards only,
  **no prompt-rewriter code, no `.claude/skills/`, no shipped enhancer prompt.**
- GitHub repo search for Illustrious/NOOBAI prompting repos, sorted by stars —
  top result `regiellis/ComfyUI-EasyNoobai` at ★52, then a long tail under ★10.
  **No agent-skill ecosystem** of the kind Seedance has.

**Finding: there is no vendor prompting skill and no large community skill for
this model.** The vendor's model card is the only first-party prompting text,
and the corpus is the right primary source for the word lists — which is what
the recipe already did.

### What the vendor card says, and what we did with it

| Vendor claim (source #1, verbatim where quoted) | Verdict |
|---|---|
| *"We do not recommend overusing critical composition tags such as 'close-up', 'upside-down', or 'cowboy shot', as they can be conflicting and lead to confusion, affecting model results."* — and immediately after, *"We suggest using suitable composition tags like 'upper body,' 'cowboy shot,' 'portrait,' or 'full body' depending on your use case."* | **CORROBORATES the recipe, no change.** Read together these say: use exactly ONE composition tag, chosen for the shot; stacking them is the failure. The recipe's element 8 already forces exactly one framing tag from a closed five (`portrait`, `close-up`, `upper body`, `cowboy shot`, `full body`) and calls it "a label chosen rather than a description written". That rule was reached by corpus + Stage 1 iteration, and the vendor states it independently. The known "slot keeps taking two tags" symptom is the exact failure the vendor names. |
| Supported quality tags: *"worst quality," "bad quality," "average quality," "good quality," "best quality,"* and *"masterpiece (quality)."* | **CORROBORATES, no change.** `masterpiece` and `best quality` — the first two tags the recipe emits — are both on the vendor's own list. The other three in our block (`very aesthetic`, `absurdres`, `newest`) are Danbooru/Animagine metadata the vendor does not enumerate, and they were kept on measurement (49%/38%, 24%/47%, 24%/35%), not on documentation. |
| *"Note: The model does not have any default style. This is intended behavior for the base model."* | **CORROBORATES a rule the recipe already enforces** — the line must end on an explicit style tag. A prompt that names no style gets no style here; on a model with a house look that rule would be optional. |
| Two worked examples, pure booru tags, no `score_*` chain anywhere. | **CORROBORATES the corpus finding** (score chain dead: 2%/4%) from the vendor side. |
| Sampling: Euler a, 20–28 steps, CFG 5–7.5. | Out of scope — Vision's workflow, not the prompt's. Recorded only. |
| The vendor's own negative prompt: `worst quality, comic, multiple views, bad quality, low quality, lowres, displeasing, very displeasing, bad anatomy, bad hands, scan artifacts, monochrome, greyscale, signature, twitter username, jpeg artifacts, 2koma, 4koma, guro, extra digits, fewer digits`. | **RECORDED, not adopted.** The recipe emits a positive prompt only (the connector cannot return a negative field — MPI-27 Phase 2, deferred by Fabio). This is the first-party baseline to start from if Phase 2 ever runs. |

### Conflict left standing

**Quality-block position.** Vendor example #2 ends `…low contrast, masterpiece`
— quality LAST — and Animagine's documentation also orders the block last. The
recipe puts it FIRST, on 84% of corpus prompts that carry both a quality tag and
a count anchor. **The measurement wins** (playbook §1.4: a word-list *and* its
ordering are measured, not argued), and one hand-written vendor demo tag order
does not outweigh 386 prompts. Recorded rather than resolved: only a Stage 2
render can price it, and it is a candidate A/B alongside the withheld
`amazing quality` tag.

## Not reached

Civitai model pages (2290816 / animemix v8.0's own page, and the Illustrious
base pages) are UK-region-blocked to agent `WebFetch`; the corpus pull went
through Fabio's VPN with shell tools. The merge author's own recommended prompt
is in that bucket — the same gap `pony/sources.md` records.
