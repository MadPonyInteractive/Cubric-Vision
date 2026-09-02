# Source Manifest — Wan 2.2

Provenance for the Wan 2.2 recipe. Sources are Fabio's NotebookLM notebook
"Wan video prompt guides" (`ddc4ed03`); transcribed via
`notebooklm source list -n ddc4ed03 --json`.

- **Model version researched:** Wan 2.2
- **Research date:** 2026-06-22 (notebook sources added 2026-03-26)
- **Researcher:** Fabio (curation) + agent (query)
- **Notebook:** `ddc4ed03` — "Wan video prompt guides"

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | Architectural Evolution and Prompt Engineering Frameworks for the Wan Video Generative Ecosystem: From Mixture-of-Experts to Multimodal Narrative Synthesis (markdown) | community-deep-dive | 2026-03-26 | Synthesis doc covering MoE architecture, core framework, temporal brackets, i2v strategy; primary structural reference |
| 2 | https://huggingface.co/blog/MonsterMMORPG/how-to-prompt-wan-models-full-tutorial-and-guide | community-deep-dive | 2026-03-26 | Full prompting tutorial on HuggingFace; covers aesthetic control categories, prompt dictionary, and example prompts |
| 3 | https://discuss.huggingface.co/t/how-to-get-the-most-out-of-prompts-for-wan-models/170354 | community-deep-dive | 2026-03-26 | Community discussion thread; WAN-specific 5-part framework, cast-and-count rule, motion-boundaries section |
| 4 | https://www.veed.io/learn/wan-2-2-prompting-guide | community-deep-dive | 2026-03-26 | Wan 2.2 prompting guide focused on image-to-video; avoidance list and formula guidance |
| 5 | https://www.promptus.ai/blog/wan-2-2 | community-deep-dive | 2026-03-26 | Wan 2.2 in Promptus with ComfyUI; prompt formula block with inline NEGATIVE field pattern |
| 6 | https://github.com/Wan-Video/Wan2.2 — `wan/utils/system_prompt.py` + `wan/utils/prompt_extend.py` | **official-code (vendor rewriter)** | 2026-08-17 | **READ AND PARTLY ADOPTED, 2026-08-17 (MPI-27) — see the read-out below the table.** It is rank 1 AND rank 2 at once: Alibaba’s own production prompt-rewriting system prompts (T2V/I2V, ZH + EN), i.e. not documentation *about* prompting but the rewriter they ship. Enumerated slot vocabularies with closed value sets (time, light source / intensity / angle, contrast, saturation, colour tone, shooting angle, shot size, composition); per-slot defaults (daytime, centre composition, medium or wide shot unless stated); **a conditional this recipe lacks — if the prompt already describes camera movement, do NOT add a shooting angle**; style first when present, cinematic aesthetics suppressed for non-photoreal styles; *“do not output literary descriptions of atmosphere or feeling”*; length target **60–200 characters (Chinese)**, a different unit from our `wordBudget` that needs converting, never copying. Location recorded by the 2026-08-17 step-0 survey ([playbook 08](../../../docs/recipes/playbook/08-vendor-prompt-skills.md)); content deliberately not stored in-repo. |

Authority tiers (highest first): `official-docs`, `official-example`,
`community-deep-dive`, `comparison`.

## Vendor rewriter read-out (src #6, 2026-08-17, MPI-27)

Pulled at HEAD with `gh api`. `prompt_extend.py` maps task → prompt;
`T2V_A14B_EN_SYS_PROMPT` is the t2v one. **Adopted** into the recipe: the closed
value sets with their defaults (Day time when unstated, Center composition,
Medium or Wide shot) and the cap of **four** aesthetic settings per prompt; the
**shooting-angle conditional** (if the input already describes camera movement,
add no shooting angle) that this recipe entirely lacked; add-no-style-unless-
asked and no-cinematic-aesthetics-over-a-2D-style; no literary description of
atmosphere or feeling; add an action when the input has none and give the
background its own motion; deep-blue sky to hold exposure.

**Read and rejected, with reasons** — recorded so they are not re-discovered as
vendor truth:

- **Rules 8, 9 and 10** silently swap an input the vendor deems sexual,
  "bikini", or same-sex-affectionate for an unrelated one. All three break THE
  SUBJECT IS FIXED, our test enhancer is deliberately uncensored
  ([playbook 05](../../../docs/recipes/playbook/05-model-ladder.md)), and rule 10
  is discrimination we will not ship.
- **The 60–200 length target is in Chinese CHARACTERS.** It does not convert to
  our `wordBudget`; the vendor's own English examples run ~60–90 words, inside
  our 50–150 contract, so nothing changed. The encoder is **umT5-XXL with
  `text_len = 512`** (`wan/configs/shared_config.py`) — ~380 words of headroom,
  so the budget here is style, not a wall.
- **"A named style goes FIRST"** is not adopted on its own: it collides with the
  recipe's own `dos` that lighting and style tags go LAST. That ordering claim
  comes from src #1, a community synthesis, and every vendor example — plus all
  three of our `examplePrompts` — leads with the aesthetic tag cluster instead.
  **Left open for Fabio's render**, because reordering is what the recipe header
  forbids without one, and our target is a CVTI smooth-mix rather than base Wan
  2.2.
- **The i2v rewriter** (100-word cap; keep only dynamic content; *remove* static
  description the image already carries; `I2V_A14B_EMPTY_*` for an empty prompt)
  is real and useful, and this recipe is t2v-only. It is the material an i2v
  mode would be built from.

**Note on tier assignment:** No official Wan 2.2 provider documentation (Alibaba DAMO / Tongyi) appears among the notebook sources — all five are community-authored guides. Src #2 (HuggingFace tutorial) and src #3 (HuggingFace forum) are the most detailed practitioner deep-dives. Src #1 (the synthesis markdown) is the structural backbone of the notebook. Community findings supplement, never override, official sources — but here no official source is present; Phase 3 testing is therefore especially important.

**Excluded / rejected sources:** None; all five notebook sources were used.
