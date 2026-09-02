# Krea 2 — sources

- **Model version researched:** Krea 2 (variants: Medium, Large, Turbo)
- **Research date:** 2026-07-28
- **Method:** web search first (playbook 01-research §1.1). No NotebookLM
  notebook exists for Krea 2 — noted, not blocking.

| # | Source | Tier | Accessed | What it backed |
|---|---|---|---|---|
| 1 | [krea-ai/krea-2 `docs/prompting.md`](https://github.com/krea-ai/krea-2/blob/main/docs/prompting.md) | 1 — official docs | 2026-07-28 | Natural-language prose format; "long detailed prompts yield best results"; quotes around text to render; no hard token limit stated; element ordering visible in the official examples |
| 2 | [krea-ai/krea-2 `docs/expansion.txt`](https://raw.githubusercontent.com/krea-ai/krea-2/main/docs/expansion.txt) | 1 — official | 2026-07-28 | Krea's OWN LLM expansion system prompt. Faithfulness-first, practical T2I structure, style planning internal, avoid over-specification, one cohesive paragraph, respect existing detail, preserve user medium |
| 3 | [Krea blog — Exploratory prompting in Krea 2](https://www.krea.ai/blog/explorative-prompting-krea-2) | 1 — official | 2026-07-28 | Vague prompts are a legitimate entry point; detail level controls output tightness; no single "right" prompt shape |
| 4 | [fal — Krea 2 prompting guide](https://fal.ai/learn/tools/krea-2-prompting-guide) | 3 — high-signal community/partner | 2026-07-28 | Length ranges: 5–20 words exploratory, 30–80 words controlled; too many style adjectives muddy output; Medium vs Large strengths |
| 5 | [fblissjr/krea-explorations — `krea2_text_encode.md`](https://github.com/fblissjr/krea-explorations/blob/main/docs/krea2_text_encode.md) | 3 — community deep-dive, measured | 2026-07-28 | Qwen3-VL chat template (system→user→assistant); **no CLIP-style weighting**; emphasis comes from order/presence, not syntax; vision-reference token accounting |
| 6 | [ethanfel/ComfyUI-Krea2TextEncoder](https://github.com/ethanfel/ComfyUI-Krea2TextEncoder) | 3 — community implementation | 2026-07-28 | Confirms the encoder is Qwen3-VL-4B driven by a chat template, system prompt overridable |

## Cross-repo corroboration

Cubric Vision independently ships Krea 2 with
`qwen3vl_4b_abliterated_fp8_scaled.safetensors` as the text encoder
(`Cubric-Vision/js/data/modelConstants/assetDeps.js`), confirming source 5's
Qwen3-VL-4B claim against our own working system.

## Rejected

SEO "best Krea 2 prompts" listicles (promptspace.in, incrypted.com) — no
attribution, no testing, restate the official guide.

## Step 0 — the vendor prompting-skill search (2026-08-17)

Per `docs/recipes/playbook/08-vendor-prompt-skills.md`, run because this recipe
was on the never-searched list. Clock checked against `gh api rate_limit -i` →
`Mon, 17 Aug 2026 10:10:35 GMT`, no skew.

**The search found an official Krea skills repo that this manifest did not
list**, and it is worth being precise about what that changes: source #2 above
(`docs/expansion.txt`) is already Krea's own LLM *expansion system prompt*, so
this recipe was never short of rank-1/rank-2 rewriter material. The new find
adds an agent-facing operating reference, not a new prompt shape.

| # | Source | Tier | Accessed | What it backed |
|---|---|---|---|---|
| 7 | [`krea-ai/skills`](https://github.com/krea-ai/skills) — ★18, official Krea org, ships as a Claude/Codex/Cursor plugin (`.claude-plugin/`, `evals/`, `VERSION`) | **1 — vendor skill** | 2026-08-17 | The vendor's own agent skills: `krea-generate`, `krea-marketing`, `krea-motion`. |
| 8 | `krea-generate/references/models/krea-2.md` (front-matter `name: krea-2-moodboards`) | **1 — vendor skill, model-specific** | 2026-08-17 | The per-model reference for Krea 2 — read claim by claim below. |

### Read-out — adopted / rejected

| Vendor claim | Verdict |
|---|---|
| *"the prompt controls subject, scene, composition, camera, lighting, and constraints, while moodboards, style references, and LoRAs carry taste, palette, texture, and art direction"* — restated as *"Moodboards control taste; prompts control what is in the frame"*, plus *"if no moodboard or style-reference field exists in the live schema, do not fake the moodboard in the prompt."* | **NOT ADOPTED, and the reason matters.** This is a division of labour across Krea's *hosted API surface*, where a moodboard input exists. Vision runs Krea 2 locally in ComfyUI with no moodboard and no style-reference field, so on our path the prompt is the only channel taste can travel through — and the vendor's own escape clause covers exactly that case: when the field is absent, do not fake it, proceed prompt-only. Our recipe carrying style words is therefore the vendor's own fallback branch, not a contradiction of it. **If Prompt ever targets Krea's API, this rule inverts and the recipe would need a mode.** |
| `creativity` field, enum `raw` / `low` / `medium` / `high`, described as *"Prompt expansion mode."* | **RECORDED — a live double-expansion hazard on the API path only.** Krea's own platform expands the prompt unless `creativity: raw`. An enhanced prompt submitted at any other setting is expanded twice, by us and by source #2's expander. Irrelevant to Vision's local ComfyUI path; a hard requirement for any future API path. |
| *"`intensity`, `complexity`, `movement` … are opt-in controls. Never set them unless the user explicitly requests them."* | Out of scope — generation parameters, not prompt text. Same shape as the sampler settings we ignore elsewhere. |
| Moodboard discovery endpoints, strength bands (0.15–0.3 light … 0.6–1.0 strong), the 3,549-board preset gallery. | Out of scope for a prompt recipe. Recorded because it is the vendor's own material and Cubric **Studio** is the app that would use it. |
| *"Watch for over-transfer: the output copying a moodboard subject, layout, or object when only style was intended."* | Consistent with our THE SUBJECT IS FIXED rule; nothing to change. |

**Net effect on the recipe: nothing.** No element order, budget, vocabulary or
`dos`/`donts` line changes, so the recipe's Stage 1 green is untouched — no
re-sweep owed.

### Pointers recorded for other cards, not followed here

- `krea-generate/references/models/seedance-2.md` + `seedance-2-examples.md` and
  `nano-banana.md` + `nano-banana-examples.md` — first-party-adjacent references
  for two models in our registry that are **out of v1.0**. Logged in
  `docs/recipes/research/seedance-2.0/sources.md`.
- `krea-motion/references/{cinematic-craft,cut-architecture,dimensional-motion}.md`
  — a vendor's shipped vocabulary for camera and cut language. Potentially
  relevant to the video recipes and to the deferred register axis (MPI-19).
  **Not read.** Recorded so it is found rather than re-searched.
