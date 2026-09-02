# Source Manifest — FLUX.2 Klein

Provenance for the `flux-2` recipe. **Web-search sourced** (playbook §1.1) — no
NotebookLM notebook exists for FLUX.2, which is not a blocker (§1.2).

- **Model version researched:** FLUX.2 [klein], 4B distilled — the variant Cubric
  Vision ships as `klein-4b`. Where a source speaks for FLUX.2 generally
  (`[pro]`/`[max]`/`[dev]`), that is marked; where it speaks for `[klein]`, that
  wins.
- **Research date:** 2026-08-05 (clock checked against `gh api rate_limit -i` →
  `Wed, 05 Aug 2026 18:17:31 GMT`; VPN off, no skew).
- **Researcher:** agent (web search + BFL's official skills repo + Vision's own
  bench measurements).

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | https://github.com/black-forest-labs/skills — `skills/flux-best-practices/rules/` | official-docs | 2026-08-05 | **The primary source.** BFL's own agent-skill prompting rules, pulled at HEAD via `gh api`. Files used: `core-principles.md`, `flux2-models.md`, `t2i-prompting.md`, `negative-prompt-alternatives.md`, `i2i-prompting.md`. Contains a **`[klein]`-specific** section: narrative prose, front-load subject, heavy lighting emphasis, **40–70 words**, no prompt upsampling, up to 4 reference images. |
| 2 | https://docs.bfl.ml/guides/prompting_guide_flux2 | official-docs | 2026-08-05 | The published FLUX.2 prompting guide. Explicitly scoped to **`[pro]` & `[max]`**. Subject→Action→Style→Context formula, word-order weighting, 30–80 words "usually ideal", **no negative prompts**, hex colours, quoted text, JSON prompting. |
| 3 | https://huggingface.co/blog/flux-2 | official-docs | 2026-08-05 | Diffusers integration post. `max_sequence_length` 512. Describes the **`[dev]`/`[pro]` Mistral Small 3.1 encoder** — *not* Klein's. |
| 4 | https://deepwiki.com/black-forest-labs/flux2/3.2-text-encoders · https://zread.ai/black-forest-labs/flux2/10-text-encoders | official-docs (code-derived) | 2026-08-05 | Reference-implementation walkthrough: `MAX_LENGTH = 512` caps both embedders; **Klein uses a Qwen3 embedder (4B on the 4B model, 8B on the 9B)**, not Mistral. |
| 5 | https://deapi.ai/blog/prompting-flux-2-klein-what-works-what-doesnt-and-why | community-deep-dive | 2026-08-05 | Klein-specific. Prose beats keywords (worked example), 40–120 words, front-load subject, foreground→midground→background layering, **materials/texture specificity**, lighting has "the single highest impact", negatives don't work, fixed 4-step. |
| 6 | https://www.earngenix.com/workflows/flux2-klein-image-comfyui | community-deep-dive | 2026-08-05 | Local/ComfyUI angle, and the only source splitting the variants by length: **9B 100–400 words, 4B under 150**. Confirms 20+ steps *reduces* 4B quality (trained for 4) and that encoder/model mismatch is a common blur cause. |
| 7 | https://fal.ai/learn/devs/flux-2-klein-prompt-guide | competitor/tool-guide | 2026-08-05 | **Partly rejected.** Useful on hierarchy (subject → environment → style → technical), "under 100 words", and failure modes. But it recommends *negative prompts* for a model that has no usable negative path — see Conflict 1. Treated as non-authoritative wherever it disagrees with #1/#2. |
| 8 | `Cubric-Vision/docs/models/klein/README.md` + `js/data/modelConstants/models.js` (`klein-4b`) | **in-house measurement** | 2026-08-05 | Fabio's own bench, MPI-353/MPI-354. Shipped config **cfg 1.0 / euler / 4 steps**, so the negative prompt is **bit-identical (max diff 0)** and gets `ConditioningZeroOut` — `negativePrompt: false` in the ModelDef. TE is **Qwen3-4B, an LLM not CLIP**. And the finding no public source has: literal `"no moles, no freckles, no blemishes, no spots"` **in the positive prompt** cut invented dark spots **21%** (1213 → 962). |
| 9 | https://github.com/black-forest-labs/flux2 — `docs/flux2_with_prompt_upsampling.md` | official-docs | 2026-08-17 | **Not yet read — and the only vendor item the 2026-08-17 step-0 survey found that is not already covered above.** Worth stating plainly, because the survey table first implied otherwise: **this is the one recipe that DID get a vendor-skill reading** — `black-forest-labs/skills` is source #1 and was pulled at HEAD on 2026-08-05. Caveat on that: the survey notes the skills repo has since moved to target **FLUX 3**, so #1 records what was pulled in August, not necessarily what sits at HEAD today. |

Six sources survive the hierarchy (#7 is retained only for the claims it shares
with the others). Two are official BFL, one is code-derived from the reference
implementation, one is an in-house measurement on the exact shipped
configuration — which outranks everything else where they touch.

## Status

Sources captured, all 7 standard questions answered in `research.md`, conflicts
resolved or flagged. **Ready to author the draft recipe.**
