# LTX-2.3 Prompt Contract (→ Cubric-Prompt recipe)

> Durable finding, 2026-06-23. This is the LTX prompt SHAPE Cubric-Prompt must
> generate. Recipe home (when the ship LoRA set is locked):
> `Cubric-Prompt/src/main/recipes/{model-id}.recipe.ts` + research under
> `Cubric-Prompt/dev-docs/recipe-research/`.

## VBVR / Singularity are PROMPT-CONTRACT LoRAs

No trigger word, no baked template (VBVR-V1 meta = `LTX2.3_reasoning_big`,
ai-toolkit; V4 = zero metadata). **The sequence STRUCTURE is the trigger.**

**Contract:** brief scene anchor FRONT-LOADED, then DISCRETE ORDERED literal motion
steps, named body parts, no run-on action piles.

- **i2v** = MINIMAL scene anchor (the start frame already carries the description;
  over-describing fights the pixels) + ordered steps.
- **t2v** = FULL scene description (no frame to lean on) + ordered steps.

Matches Singularity's "Cinematic Timeline" template shape: `[Scene & Style]` first,
then `[Action Timeline 0–Xs]`.

## Audio prompt rule

If ambient/diegetic sound is NOT described, the model defaults to placing **MUSIC**
over the clip. Always either:
- specify ambient sound ("room tone, footsteps, breathing, no music"), OR
- add `music, soundtrack, score` to the negative prompt.

(Durable → bake into the Cubric-Prompt recipe.)
