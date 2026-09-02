# Source Manifest — Kling 3.0

Provenance for the Kling 3.0 recipe (both t2v and i2v modes). Sources are
Fabio's NotebookLM notebook "Kling 3.0 prompt guides" (`a848d66a`); transcribed
via `notebooklm source list -n a848d66a --json`.

- **Model version researched:** Kling 3.0
- **Research date:** 2026-06-22
- **Researcher:** Fabio (curation) + agent (query)
- **Notebook:** `a848d66a` — "Kling 3.0 prompt guides"

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | https://www.atlabs.ai/blog/kling-3-0-prompting-guide-master-ai-video-generation | community-deep-dive | 2026-03-26 | Comprehensive prompting guide; covers t2v 5-layer structure, character labels, multi-shot |
| 2 | https://glif.app/use-cases/kling-3-prompting-guide | community-deep-dive | 2026-03-26 | "Thinks in shots" framing; anatomy of great prompts; prose-flow emphasis |
| 3 | https://blog.fal.ai/kling-3-0-prompting-guide/ | official-example | 2026-03-26 | fal.ai hosting guide; vocabulary, motion intensity scale, i2v framing tips |
| 4 | https://www.veed.io/learn/kling-3-0-prompts | community-deep-dive | 2026-03-26 | 5-step practical guide; prompt template; negative prompt emphasis |
| 5 | https://magichour.ai/blog/kling-30-reference-guide | community-deep-dive | 2026-03-26 | Character/style/camera reference index for Kling 3.0 |
| 6 | https://higgsfield.ai/blog/Kling-3.0-is-on-Higgsfield-User-Guide-AI-Video-Generation | official-example | 2026-03-26 | Higgsfield platform user guide for Kling 3.0 deployment |
| 7 | The Architecture of Temporal Narrative: A Comprehensive Analysis of Prompt Engineering for the Kling 3.0 Video Model (markdown) | community-deep-dive | 2026-03-26 | Synthesis doc; VCoT reasoning; 5-layer table; t2v vs i2v contrast section |

Strong community-deep-dive coverage with two official-example sources (fal.ai,
Higgsfield). No first-party Kuaishou/Kling developer documentation available in
this notebook — official-docs tier is absent. Community guides supplement but
cannot override official documentation; findings should be validated on the real
model (Phase 3).

**Excluded / rejected sources:** None — all 7 notebook sources are 2026-03-26
and cover Kling 3.0 specifically.

## Status

Sources captured 2026-06-22. 8 questions asked (7 standard + t2v/i2v follow-up).
Research synthesised in `research.md`.
