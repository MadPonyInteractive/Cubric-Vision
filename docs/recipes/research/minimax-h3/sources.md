# Source Manifest — MiniMax-H3

Provenance for the `minimax-h3` recipe. Written 2026-08-17, late: the recipe had
shipped, gone green, been rewritten and gone green again before it had a manifest
at all. It is the **only recipe authored against a vendor prompting skill**, so
its provenance was the most worth recording and was the last to be written.

- **Model version researched:** MiniMax-H3 (open weights)
- **Research dates:** 2026-08-05 (templates), 2026-08-10 (model repo), 2026-08-17 (vendor skill + field evidence)
- **Researcher:** Fabio (templates, production) + agent (repo, skill, sweeps)
- **Modes:** `t2v` / `i2v` / `r2v` — `r2v` is a `RecipeMode` this model introduced

**Content is deliberately NOT stored in this repo** (Fabio, 2026-08-17). Locations
only, so Cubric Studio can integrate the skills later as the agentic app.

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | https://github.com/MiniMax-AI/MiniMax-H3 — `.claude/skills/h3-prompt-writing/` (an identical `.agents/skills/` copy also exists) | **official vendor skill** | 2026-08-17 | **The primary source, and it sat unread for four sessions across two repos.** There is **no `skills/` folder at the repo root**, which is why looking for one found nothing and concluded wrongly — list the git tree. `SKILL.md` says to read `references/base-en.txt` and follow its **final prompt structure**; §2 of that file is titled "Final Prompt Structure", which is what overturned the earlier reading that these guides only described MiniMax's internal rewriter. **Merged into the recipe 2026-08-17.** |
| 2 | `references/base-en.txt` and `references/ref-en.txt` inside source #1 | **official vendor skill** | 2026-08-17 | **Byte-identical to the two published HuggingFace guides** — verified by `diff`, exit 0 on both. So the *content* was never new; the **skill wrapper** was the finding, because it frames that text as the final prompt structure rather than as rewriter internals. `base-en.txt` §4.2 is the cut notation: *"Do not add a timestamp to the first shot. Use sequential shot numbers for later shots, and begin each one with a strictly increasing cut time."* It also states the shot rule verbatim: *"Use multiple shots only when they are explicitly specified."* |
| 3 | `ref-en.txt` §"how rewrite outputs are organized" (six sections: `subject_definitions`, `retention_analysis`, …) | official vendor skill — **deliberately NOT adopted** | 2026-08-17 | For **reference mode only**, the rewriter reading survives: this describes a rewriter OUTPUT, not user input. Fabio adopted it **surgically** — the `[Shot N]` cut syntax and the two sound fields, nothing else — on top of the shape that actually shot the film. "One format change per measurement" is now a playbook rule. Its 350–500-word `detailed_description` target is what proved the old 230-word ceiling was fiction. |
| 4 | The three official ComfyUI templates — `h3_t2v`, `h3_i2v`, `h3_r2v`, and the prompts they ship with | official-example | 2026-08-05 | Supplied by Fabio, recorded in `.agents/mpi-kanban/tasks/MPI-26/brief.md` after the horizontal rule. Ground truth for what a user actually **types**, as opposed to what a rewriter emits. Source of the five-part skeleton (look line, beats, camera, sound, constraint line). |
| 5 | https://huggingface.co/MiniMaxAI/MiniMax-H3 — `tokenizer/tokenizer_config.json` + README | **official-code (model repo)** | 2026-08-10 | Measured, not read from a guide: **`model_max_length: 262144`** and the text encoder is **Qwen3-VL-32B** (full pretrained weights, hidden states from layer 50). H3's text path is an **LLM, not CLIP**, so there is no prompt-length wall at any length a human types. Also: documented output duration **4–15s** (24 FPS, 32 kHz stereo), and the repo ships `FL2VA/` (four operations) and `Ref2VA/` folders where Cubric Vision surfaces only two ops. |
| 6 | `MadPony-Identity/production/cubric-western/findings/h3-prompting.md` | **in-house measurement (Stage 2)** | 2026-08-17 | Fabio's ~100-clip cowboy film, whose own README names this repo as its audience. **It is reference-to-video ONLY** — 24 clips of first-class `r2v` evidence and **zero** evidence about `t2v`/`i2v`, which share the recipe file. Contradicted the shipped recipe in four places and invalidated its 72/72 green. Reachable: `MadPony-Identity` is granted via `.claude/settings.json` → `permissions.additionalDirectories`. |

Authority tiers (highest first): `official vendor skill`, `official-code`,
`official-example`, `in-house measurement`, `community-deep-dive`.

**Note on tier assignment.** This is the only recipe in the registry whose top
source is the model author's own prompt-writing skill, and the only one with a
real production behind it. Where they disagree, **the render wins**: field
evidence outranks a Stage 1 green
([09-field-evidence.md](../../../docs/recipes/playbook/09-field-evidence.md)).
But scope every field claim to the mode that produced it — a finding in the mode
under discussion is a result; a finding from a neighbouring mode is a hypothesis.

**What no source settles.** Which prompt length actually *renders* best. Source
#5 only proves 230 was never a limit; #3 gives a vendor target for one section of
a reference prompt. That is Fabio's Stage 2, and it is not a Stage 1 question.
