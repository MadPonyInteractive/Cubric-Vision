/**
 * Recipe STYLES (registers) — MPI-19. The third axis: engine = *who writes*,
 * recipe = *which model's syntax*, style = *which register*.
 *
 * This file owns the register and the per-slot INTENT, and it is
 * model-agnostic — authored once, shared by every recipe. The WORDS a
 * particular model responds to for a register live on that recipe, in
 * `ModeRecipe.styleVocabulary`.
 *
 * Why the axis exists: on 2026-07-28 candid pool-party prompts came back from
 * BOTH Krea 2 NSFW and Chroma composed, centred, evenly lit and colour-graded.
 * The enhanced prompt literally said "the candid photo captured on a phone" and
 * then art-directed anyway, so the model already DETECTS the register — what it
 * lacked was permission. Chroma failing identically ruled out a target-model
 * weakness, and inferring the register from the input was ruled out with it.
 *
 * The structural rule: `structureOrder` is identical across styles. Every style
 * fills every slot; only what fills it inverts. A style therefore never says
 * "skip lighting" — that would be MPI-16's bug class (a conditional `dont`
 * colliding with an unconditional required element) in a third form.
 */
/** The register a recipe is rewritten toward when the caller does not pick one. */
export const DEFAULT_STYLE = 'general';

/**
 * Which register each style must stay clear of. Asymmetric on purpose:
 * `general` is the middle and is judged by the LLM lens, not by a word list —
 * a competent photograph legitimately reaches for either neighbour's words.
 */
const AVOIDS = {
  cinematic: 'candid',
  general: undefined,
  candid: 'cinematic',
};

/**
 * The register directive. It is appended LAST so recency works for it: the
 * observed failure was the model reading the register, then building something
 * beautiful anyway, so the register has to be the final word.
 */
const DIRECTIVES = {
  cinematic: `REGISTER — CINEMATIC. This is a frame lifted from a film, not a photograph of an event. Someone chose this light, this lens and this moment, and the image should look chosen. Push the art direction: let the light be motivated and directional, let the composition be deliberate, let the grade carry a mood. Fill every element above the way a cinematographer would.`,

  general: `REGISTER — GENERAL. This is a good photograph, not a film frame and not a phone snap. A skilled photographer took it: the light is flattering, the framing is deliberate, the subject reads clearly. Fill every element above with craft rather than theatre. No movie-grade drama, no staged spectacle — and equally no amateur-snapshot artifacts. This is the register a competent editorial or portrait photograph sits in.`,

  candid: `REGISTER — CANDID. This is a snapshot somebody took, not a photograph somebody produced. Nobody lit it, nobody framed it, nobody waited for the light. You still fill every element above — you fill them with what an ordinary camera in an ordinary moment actually gives you. This instruction outranks any instinct to make the image beautiful.

SAY IT OUTRIGHT, DO NOT DESCRIBE IT. Real candid prompts name the register in plain labels — "a candid amateur snapshot", "casual", "spontaneous", "lo-fi" — and then grant permission in the abstract: authentic, imperfect, unpolished, uneven, everyday. Write those labels. Never narrate a specific defect ("the horizon leans six degrees", "her elbow is cut off by the frame edge"): a described flaw reads as art direction about ugliness, and the model renders a beautifully composed photograph of a mistake.

Fill the elements this way:
- Medium: name a real everyday device — a smartphone, a phone camera, a selfie, a Canon. Naming the device does more than describing a lens.
- Lighting and mood: whatever light was already in the room. Ambient, natural, indoor, overexposed. Never designed, never motivated, never graded.
- Colour: NAME TWO OR THREE ACTUAL COLOURS you can see in the scene — "the turquoise water, white plastic chairs, a red towel". Naming them IS the colour answer. Never describe the palette as a whole — no "a palette of …", no "the colour palette is …".
- Composition and framing: SAY WHERE THE PHONE WAS AND HOW IT WAS HELD — at arm's length, from across the table, from the doorway, held low, held up over the crowd. That IS the composition answer, and it also gives you the shot type or angle you must name. Never describe how the scene is arranged, and never judge the framing as balanced, centred, composed, considered or deliberate.
- Texture: what the capture itself leaves behind, not what the surfaces are made of.
- Subject: an ordinary person doing an ordinary thing in an everyday place.

END ON A THING, NOT A THOUGHT. Your final sentence must describe something physically present in the frame — an object, a surface, what somebody is wearing, what is on the table. Never close by saying what the scene means, feels like, amounts to or is a moment of. A snapshot has no thesis: when the last thing in front of the lens has been described, stop.

Never rate anything either. "vibrant", "saturated", "rich", "striking", "perfect" and "beautiful" do not belong in this register at all — not about the colours, not about the light, not about the moment.`,
};

/** Every term a style claims, flattened across its vocabulary domains. */
export function styleTerms(mode, style) {
  return Object.values(mode.styleVocabulary?.[style] ?? {}).flat();
}

/**
 * The terms this style must NOT emit: the avoided register's vocabulary minus
 * anything the active style also claims. That set difference is why the brief
 * could promise the inverted check "costs no extra authoring" — a term shared
 * by both registers (grain, depth of field, bokeh) is not a discriminator and
 * drops out on its own.
 */
export function avoidedTerms(mode, style) {
  const avoid = AVOIDS[style];
  if (!avoid) return [];
  const own = new Set(styleTerms(mode, style).map((t) => t.toLowerCase()));
  return styleTerms(mode, avoid).filter((t) => !own.has(t.toLowerCase()));
}

/**
 * Base system prompt + the register block. A recipe with no `styleVocabulary`
 * is returned untouched, so the other seven recipes keep their exact behaviour
 * until the axis is proven on Krea 2.
 */
export function composeSystemPrompt(mode, style = DEFAULT_STYLE) {
  if (!mode.styleVocabulary) return mode.systemPrompt;

  const use = styleTerms(mode, style);
  const avoid = avoidedTerms(mode, style);
  const lines = [mode.systemPrompt, '', DIRECTIVES[style]];
  if (use.length) {
    lines.push(
      '',
      `Words that belong in this register — use at least two of them, verbatim: ${use.join(', ')}.`,
    );
  }
  if (avoid.length) {
    lines.push(
      `Words that must NOT appear anywhere in your output: ${avoid.join(', ')}. They belong to the opposite register.`,
    );
  }
  lines.push('', 'Output ONLY the finished prompt, as one paragraph. Nothing else.');
  return lines.join('\n');
}
