# Source Manifest — Seedance 2.0

Provenance for the Seedance 2.0 recipe. Sources are Fabio's NotebookLM notebook
"Seedance Prompt Guies" (`119a088d`); transcribed via `notebooklm source list -n
119a088d --json`.

Note: this notebook is **shared** with Seedance 1.5. Source #5 (fal.ai guide)
is dedicated to Seedance 1.5; all other sources (#1–4, #6–10) cover Seedance 2.0.

- **Model version researched:** Seedance 2.0
- **Research date:** 2026-06-22
- **Researcher:** Fabio (curation) + agent (query)
- **Notebook:** `119a088d-5e99-4803-8f6d-56ba82f13a52` — "Seedance Prompt Guies"

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | https://www.imagine.art/blogs/seedance-2-0-prompt-guide — "Exclusive Seedance 2.0 Prompt Guide With 70 Ready-To-Use AI Video Prompts" | community-deep-dive | 2026-03-26 | 70 ready-to-use prompts; covers t2v and asset usage |
| 2 | https://wavespeed.ai/blog/posts/blog-character-consistency-seedance-2-0/ — "How to Keep Character Consistency in Seedance 2.0" | community-deep-dive | 2026-03-26 | Reference pack technique, 3-still method, ID drift prevention |
| 3 | https://www.mindstudio.ai/blog/timeline-prompting-seedance-2-cinematic-ai-video-3 — "How to Use Timeline Prompting with Seedance 2.0 for Cinematic AI Video" | community-deep-dive | 2026-03-26 | Timeline/multi-shot prompting with timestamp syntax for i2v |
| 4 | https://resource.digen.ai/quick-guide-to-seedance-2-0/ — "Quick Guide to Seedance 2.0 - Digen AI" | community-deep-dive | 2026-03-26 | Quick-start covering @mention system and quality suffix |
| 5 | https://fal.ai/learn/devs/seedance-1-5-prompt-guide — "Seedance 1.5 Prompt Guide: Mastering ByteDance's Audio-Video Generation Model - Fal.ai" | official-docs | 2026-03-26 | Seedance 1.5 dedicated guide; useful for version contrast only |
| 6 | https://www.promeai.pro/blog/seedance-2-0-camera-movement-cheat-sheet/ — "Seedance 2.0 Camera Movement Cheat Sheet - PromeAI" | community-deep-dive | 2026-03-26 | Authoritative camera terminology cheat sheet: pan, dolly, tracking, rack focus |
| 7 | https://www.weshop.ai/blog/seedance-2-0-guide-how-to-master-the-prompt-script/ — "Seedance 2.0 Guide: How To Master the Prompt Script - WeShop AI" | community-deep-dive | 2026-03-26 | Full prompt script breakdown; covers @tag system and multi-shot |
| 8 | https://chatcut.io/blog/seedance-2-prompt-guide — "Seedance 2.0 Prompt Guide: How to Create Better AI Videos - ChatCut" | community-deep-dive | 2026-03-26 | Comprehensive t2v guide including Subject→Action→Camera→Style formula |
| 9 | https://seadanceai.com/blog/seedance-2-prompt-guide-cinematic-ai-video-generation — "Seedance 2.0 Prompt Guide: Master Cinematic AI Video Generation" | community-deep-dive | 2026-03-26 | Cinematic control, quality suffix, constraints |
| 10 | YouTube: "The ULTIMATE Seedance 2.0 Prompting Guide (Complete Control + Amazing Results)" | community-deep-dive | 2026-03-26 | Video tutorial; multi-shot escalation technique, @Image1 as first frame example, audio sync per shot |

Authority tiers (highest first): `official-docs`, `official-example`,
`community-deep-dive`, `comparison`. Community findings supplement, never
override, official sources.

No dedicated official-docs source from ByteDance/Seedance for 2.0 exists in this
notebook; all 2.0 coverage comes from community deep-dives. Flag for Phase 3:
locate official ByteDance documentation if available.

## Step 0 locations, recorded not read (out of v1.0)

Seedance 2.0 is registered but **out of v1.0** — Vision ships it on no card — so
nothing here is urgent. These are the step-0 locations
(`docs/recipes/playbook/08-vendor-prompt-skills.md`) so the next author does not
re-run the search. Every row above is tier 3–5; the rows below outrank all of them.

| Source | Tier | Found | Note |
|---|---|---|---|
| `krea-ai/skills` → `krea-generate/references/models/seedance-2.md` and `seedance-2-examples.md` | **1–2 — platform-vendor skill** | 2026-08-17 | Krea's own official skills repo (★18) carries a per-model Seedance 2 reference. Krea is the serving platform rather than ByteDance, so it is not the model author — but it is a first-party production reference, which is a tier above every source in the table above. **Not read.** Found while running `krea-2`'s step 0. |
| `dexhunter/seedance2-skill` ★3,315, `songguoxs/seedance-prompt-skill` ★2,672, `liangdabiao/Seedance2-Storyboard-Generator` ★2,112, + six more in the hundreds-to-thousands | 3 — community skill ecosystem | 2026-08-17 | The full list, and why it is load-bearing for this model specifically, is in playbook 08. **Read the top two before drafting**: for Seedance, users do not write prompts without a skill, so our output gets compared to theirs. |

The Phase 3 flag above — *"locate official ByteDance documentation"* — is still
open. Neither row is ByteDance.

## Status

Sources captured. Research complete — 7 standard questions + i2v follow-up
queried against notebook `119a088d`. See `research.md` for findings.
