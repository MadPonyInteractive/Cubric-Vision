# Source Manifest — SDXL

Provenance for the SDXL recipe. Sources are Fabio's NotebookLM notebook
"SDXL prompting" (`94339b6e`); transcribed via `notebooklm source list -n
94339b6e --json`.

- **Model version researched:** SDXL (Stable Diffusion XL)
- **Research date:** 2026-06-22
- **Researcher:** Fabio (curation) + agent (query)
- **Notebook:** `94339b6e` — "SDXL prompting"

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | "I Spent 1000 Hours Researching This - You Won't Believe What I Discovered About Stable Diffusion!" (YouTube) | community-deep-dive | 2026-03-25 | Primary source; 1000-hour empirical research on photorealistic prompting; covers 10-part structure, vocabulary, negative prompts, LoRAs, camera/lens tags, failure modes. Single source in notebook. |

## Notes on source coverage

Single community-deep-dive source. The author presents empirical findings from
extensive personal testing (claims ~1000 images created for an accompanying
prompt guide book). No official Stability AI documentation is included in the
notebook. The findings are practical and repeatable but lack cross-validation
from official docs. This gap is flagged for Phase 3.

**Excluded / rejected sources** (not in notebook — flagged as gaps):

- Official Stability AI SDXL model card / documentation — not added to notebook; should be cross-checked in Phase 3. **CLOSED 2026-08-17, see below.**
- Civitai community model pages — absent; may contain additional LoRA and checkpoint-specific guidance.

## Step 0 — the vendor prompting-skill search (2026-08-17)

Per `docs/recipes/playbook/08-vendor-prompt-skills.md`, run because `sdxl` was on
the never-searched list. This also closes the official-docs gap the manifest
itself flagged above. Clock checked against `gh api rate_limit -i` →
`Mon, 17 Aug 2026 10:10:35 GMT`, no skew.

Searched: the official model card, `Stability-AI/generative-models` (its whole
git tree carries exactly one `.md` — the README), and GitHub repo search for
SDXL prompting skills sorted by stars (top hits are ★0 hobby projects).

**Finding: Stability AI publishes no prompting guide, no prompt-rewriter and no
skill, and there is no large community skill either.** For this recipe that is
the expected answer rather than a gap — SDXL is a base architecture, and the
recipe serves Vision's *photography* cards, whose grammar was measured from a
corpus. The measured corpus stays the primary source.

| # | Source | Authority tier | Accessed | What it backed |
|---|---|---|---|---|
| 2 | [`stabilityai/stable-diffusion-xl-base-1.0` model card](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | **official-docs** | 2026-08-17 | *"two fixed, pretrained text encoders (OpenCLIP-ViT/G and CLIP-ViT/L)"* — first-party confirmation of the dual-CLIP encoder the recipe's 77-token window rests on. Prompting content: one throwaway example (`"An astronaut riding a green horse"`), nothing more. |
| 3 | `Stability-AI/generative-models` | official code | 2026-08-17 | Searched for a rewriter or prompting doc; **none exists**. Recorded as a search, not an assumption. |

### The one prompting-relevant thing the vendor states

The card's **Limitations** section, verbatim: *"The model cannot render legible
text"*; *"The model struggles with more difficult tasks which involve
compositionality, such as rendering an image corresponding to 'A red cube on top
of a blue sphere'"*; *"Faces and people in general may not be generated
properly"*; *"The model does not achieve perfect photorealism."*

**Verdict: corroborates, nothing to change.** These are first-party support for
two things the recipe already does — it does not emit quoted on-image text, and
it emits a flat tag sequence rather than nested spatial relations. Worth having
on the record because "why does this recipe not carry a spatial-relation slot"
now has a vendor answer instead of an inference.

**Net effect on the recipe: nothing.** Stage 1 green untouched, no sweep owed.
