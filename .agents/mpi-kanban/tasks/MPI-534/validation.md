# MPI-534 validation

**Closed won't-fix 2026-08-16 (user decision). No code changed, no merge run.**

## What was actually verified

- Blast radius mapped: the two dep ids reach only 4 places (`modelDeps.js`,
  `models.js`, `generate_sdxl.py` `MODEL_VARIANTS`, `smoke-evidence.json`).
- Replacement candidates found and licence-checked on Hugging Face, with hashes
  (see `brief.md`). `AstraliteHeart/pony-diffusion-v6` (OpenRAIL-M) and
  `Laxhar/noobai-XL-1.1` (FAIPL) were selected before the card was closed; both
  remain valid picks if the models are ever swapped on quality grounds.
- **DMD2 hash-proven `cc-by-nc-4.0`** — our local copy is byte-identical to
  `tianweiy/DMD2` (787,359,616 bytes, sha256 `a374289e…5010a1bb`). That it is merged
  at 0.7 into all five SDXL weights is an INFERENCE (shared template + a 7-step /
  CFG 1.5 / `lcm` sampler that needs a distillation LoRA), not a directly evidenced
  fact: `Model Merger.json` wires one checkpoint and its SDXL chain is bypassed.
  Either way the card's goal is unreachable — see below.

## Why it closes without action

The card's premise was that RentCivit-only licences block users from selling
their output. The user's decision, 2026-08-16:

1. Vision is **free and open-source** and forces the same on anyone who builds on
   it. It is not a commercial product, and commercial rights in generated output
   were never a guarantee we made to users.
2. Output responsibility already sits with the user via the existing consent-box
   pattern (the MiniMax H3 territory-restriction flow).
3. **DMD2 makes the card's goal unreachable anyway.** It is merged into the SDXL
   checkpoints (directly evidenced for `PONY_Mix`; inferred for the other four — see
   the caveat above), so a "cleanly-licensed" replacement base is re-merged with an
   NC LoRA and inherits it. Swapping the two bases would have produced a weight
   that was still non-commercial while being RECORDED as clean — strictly worse
   than leaving it alone, because the licence doc would then be wrong.
4. Dropping DMD2 is not free: it is what makes 7 steps / CFG 1.5 / `lcm` work.
   The cost is real speed/quality; the benefit is a guarantee nobody asked for.

## The standing rule this produced

Only **gated or forced** licence obligations matter on this project — where a
provider blocks access until something is done, or a term explicitly names apps
like ours. Examples: MiniMax H3's territory restriction, Klein 9B's gate.
Everything else (CivitAI badge flags, NC clauses on community LoRAs, FAIPL
share-alike on merges) is noise for a free open-source app and must not be raised
again unsolicited. Saved to memory as `feedback_model_licence_noise_threshold`.

## Left deliberately untouched

`ill-anime`, `ill-anime-beauty` and `pony-mix` ship unchanged. `ill-anime-beauty`
was ruled out of scope by the user: it grants the `Image` flag, and whether its
uploader honoured his own upstream terms is his responsibility, not ours.
