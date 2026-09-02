# Source Manifest — LTX 2.3

Provenance for the LTX 2.3 recipe. Sources are Fabio's NotebookLM notebook
"LTX 2.3 prompts" (`92f4a19f`); transcribed via `notebooklm source list -n
92f4a19f --json`.

- **Model version researched:** LTX 2.3
- **Research date:** 2026-06-22 (notebook sources added 2026-03-26)
- **Researcher:** Fabio (curation) + agent (query)
- **Notebook:** `92f4a19f` — "LTX 2.3 prompts"

## Sources

| # | Title / URL | Authority tier | Accessed | Notes |
|---|---|---|---|---|
| 1 | Comprehensive Architecture of Prompt Engineering for the LTX 2.3 Video Foundation Model (markdown) | community-deep-dive | 2026-03-26 | Synthesis doc; the seed file's likely origin |
| 2 | https://ltx23.github.io/ltx-2-3-best-prompts/ | official-example | 2026-03-26 | Provider example prompts |
| 3 | https://ltx23.github.io/ltx-2-3-prompt-guide/ | official-docs | 2026-03-26 | Provider prompt guide |
| 4 | https://www.reddit.com/r/StableDiffusion/comments/1rf7ao5/ | community-deep-dive | 2026-03-26 | Mastering guide: audio/video sync |
| 5 | https://fal.ai/ltx-2.3 | official-example | 2026-03-26 | Host platform model page |
| 6 | https://ltx.io/model/model-blog/ltx-2-3-prompt-guide | official-docs | 2026-03-26 | Lightricks blog prompt guide |
| 7 | https://huggingface.co/Lightricks/LTX-2.3 | official-docs | 2026-03-26 | Model card |
| 8 | https://docs.ltx.video/api-documentation/prompting-guide | official-docs | 2026-03-26 | Official API prompting guide |
| 9 | https://github.com/Lightricks/LTX-Video — `ltx_video/utils/prompt_enhance_utils.py` | ~~official-code (vendor rewriter)~~ **WRONG MODEL LINE — REJECTED 2026-08-17** | 2026-08-17 | Read at HEAD and **not adopted**: this repo is the **LTXV 0.9.x** line, which its own README retires (*"LTX-2 is now the primary home for LTX development"*). Its `T2V_CINEMATIC_PROMPT` / `I2V_CINEMATIC_PROMPT` do state a 150-word limit twice and a 7-element order, and its pipeline caps the text encoder at `text_encoder_max_tokens: int = 256` (T5) — but all of that describes a **different model**. Kept in the table because the mistake is instructive: it was logged as this recipe's vendor rewriter on 2026-08-17 and would have been adopted as vendor authority. See #10 for the real one. |
| 10 | https://github.com/Lightricks/LTX-2 — `…/gemma/encoders/prompts/gemma4_t2v_system_prompt.txt` (+ `gemma4_i2v_…`) | ~~official-code (vendor rewriter, LTX-2.3)~~ **WRONG VERSION — this is LTX-2.5's rewriter. See #12.** | 2026-08-17 | **READ AND ADOPTED into the t2v recipe, 2026-08-17 (MPI-27) — and the adoption is now in question.** `base_encoder.py:84-90` picks the file by the enhancer's `model_type` (`gemma3` → `gemma3_*`, `gemma4` → `gemma4_*`), and #11's own `MODELS-LTX-2.3.md` names **Gemma 3** as this model's encoder; `encoder_configurator.py` states the split in prose (line 112 "LTX-2.3 / gemma3 checkpoints", line 118 "(LTX 2.5 / gemma4)"). So this file is the **LTX-2.5** rewriter and #12 is LTX-2.3's. It remains a first-class source — **for the LTX 2.5 recipe Fabio has flagged as coming** (HF `Lightricks/LTX-2.5`, created 2026-07-23, gated; its `text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors` is the gemma4 tie). Step 0 for that model is therefore already done, by accident. Content as read: Key content: the output is a **training-caption**, opened on action or visual detail with *"The scene opens…" / "We see…" / "There is…"* named as off-style; **observable only**, no inferred emotion or intention; a mandatory **framing triple** per shot — exactly one shot type from a closed set, camera motion *always* stated (explicitly static if it does not move), and camera viewpoint — woven as prose, *"never as tags or labels"*; a **complete soundscape** (dialogue quoted exactly, tone of voice, background music type/mood/volume, environmental sound); chronological transitions *"Initially… / A moment later… / Simultaneously…"*; one unlabelled paragraph, *"no labels like 'Audio:' or 'Visual:'"*; **"roughly 150–220 words"**; and a closing **AESTHETIC QUALITY** pass (cinematic film-grade colour, natural lighting, crisp detail) that adds no new objects or actions. It also **reverses a community rule we shipped** — it asks for people to be identified specifically and "differentiate multiple people consistently", where our `dos` said use collective nouns and never exact counts — while forbidding inferred ethnicity, nationality, religion or culture. The i2v variant adds first-frame grounding (open on the reference image exactly, never contradict it, single continuous take, no hard cuts) and is **not adopted**, because this recipe has no i2v mode yet. |
| 11 | https://github.com/Lightricks/LTX-2 — `packages/ltx-core/src/ltx_core/text_encoders/gemma/gemma_assets.py`, `…/gemma/tokenizer.py`, `MODELS-LTX-2.3.md` | **official-code (encoder)** | 2026-08-17 | The encoder answer the playbook demands before any `wordBudget` change. LTX-2.3 encodes with **Gemma 3 12B** (`MODELS-LTX-2.3.md`), and `TOKENIZER_MAX_LENGTH = 1024` with `truncation=True` — roughly 750 words. So there is **no prompt-length wall** in our range, exactly like `minimax-h3`; the 150–220 target is the vendor's **taste**, not a limit, and it was adopted for that reason (caption-distribution match), not out of fear of truncation. **This row is also the refutation of #10** — it cites `MODELS-LTX-2.3.md` for "Gemma 3" and #10 then adopted the *gemma4* prompt, in the same session. The contradiction was inside the manifest from the moment it was written. |
| 12 | https://github.com/Lightricks/LTX-2 — `…/gemma/encoders/prompts/gemma3_t2v_system_prompt.txt` (+ `gemma3_i2v_…`), `…/gemma/encoders/base_encoder.py`, `…/gemma/encoders/encoder_configurator.py` | **official-code (vendor rewriter, THE REAL ONE for LTX-2.3)** | 2026-08-17 | **READ, NOT YET MERGED — merging it changes graded fields and owes two sweeps, so it is Fabio's call.** Selected for this model because `base_encoder.py:84-90` maps `model_type == "gemma3"` → this file and `MODELS-LTX-2.3.md` names Gemma 3. It **contradicts three rules #10 put into the recipe**: (a) it states **no word target at all**, so the 110–260 contract is LTX-2.5's taste; (b) *"Restrained language: Avoid dramatic/exaggerated terms"*, *"Colors: Use plain terms ('red dress'), not intensified ('vibrant blue')"*, *"Lighting: Use neutral descriptions ('soft overhead light'), not harsh"* — the direct opposite register to #10's closing AESTHETIC QUALITY pass, which slot 7 now instructs; (c) *"Camera motion: DO NOT invent camera motion unless requested by the user"*, against #10's *"Camera movement is expected and good"*. Two rules it adds that we have **never** carried: a leading *`Style: <style>, <rest of prompt>`* prefix (default cinematic-realistic, omit if unclear), and *"No timestamps or cuts: DO NOT use timestamps or describe scene cuts unless explicitly requested"* — which lands squarely on MPI-27's subject. Corroborates #10 on: no *"The scene opens…"* opener, one continuous paragraph with no markdown/headings, complete soundscape with dialogue quoted exactly, chronological connectors (*"as, then, while"* — the phrasing this recipe already had before #10 replaced it with *"Initially…"*), and "DO NOT invent unrequested characters". It gives **no count guidance**, so the collective-nouns reversal is unsupported on 2.3 rather than contradicted. |

Strong official-source coverage (Lightricks docs, model card, API guide) plus
two community deep-dives. Community findings supplement, never override, the
official guides — and **official code outranks official prose**, which is what
#10 settled against #1's 150–300-word figure.

## Status

Sources captured; vendor rewriter read and merged 2026-08-17 (MPI-27). Still
open: run the 7 standard questions
(`notebooklm ask -n 92f4a19f "<question>" --json`) into `research.md`, and the
**i2v mode** the vendor ships a rewriter for (#10) — the material is now in
hand, the mode is not built.

**The lesson from #9, worth more than the rows around it:** a vendor-code
citation is only as good as its **version**. `Lightricks/LTX-Video` is the right
organisation, the right file name, the right kind of artefact, and the wrong
model — and nothing about reading it says so until you check which line the repo
serves. Confirm the repo covers the model in the recipe's `modelId` before
treating anything in it as vendor authority.

**And #10 is the same lesson one level deeper, committed while writing #9 down.**
The fix for #9 was "use the right repo", so the survey moved to `Lightricks/LTX-2`
and stopped — but that repo serves **two model lines at once**, and the rewriter
is chosen by a filename prefix. Right repo, right directory, right file name,
still the wrong model. A version check that stops at the repo boundary is not a
version check: verify which artefact the code **selects for this checkpoint**
(`base_encoder.py:84-90` here), not merely which repo contains it. The tell was
present and ignored — #10 and #11 were written in the same session and #11 says
"Gemma 3" while #10 reads `gemma4_*`.
