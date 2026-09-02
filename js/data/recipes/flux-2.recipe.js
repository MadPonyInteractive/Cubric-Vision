/**
 * FLUX.2 Klein (text-to-image) — Vision ships **FLUX.2 Klein 4B** (`klein-4b`).
 *
 * A different prompting animal from FLUX.1 despite the shared family name, which
 * is why this is not `chroma`'s job:
 *  - Text encoder is **Qwen3-4B — an LLM, not CLIP**, 512-token hard cap. Prose
 *    sentences, never tags.
 *  - **No negative prompt path at all.** Vision ships it at cfg 1.0, where
 *    classifier-free guidance is off: the negative conditioning is zeroed and
 *    output is bit-identical (max diff 0, measured —
 *    `Cubric-Vision/docs/models/klein/README.md`).
 *  - **No server-side prompt upsampling on `[klein]`**, unlike `[pro]`. BFL's own
 *    guidance is "be descriptive yourself" — so this recipe IS the upsampler.
 *
 * THE ONE PLACE THIS RECIPE INVERTS THE FLUX FAMILY RULE. Every other Flux
 * recipe positivises exclusions ("no blur" -> "tack-sharp") because a T5/CLIP
 * encoder cannot parse negation. Klein's encoder is an instruction-following
 * LLM, and MPI-353 measured the opposite: the literal string "no moles, no
 * freckles, no blemishes, no spots" **in the positive prompt** cut invented dark
 * spots 21% (1213 -> 962). So the prompt BODY stays positive and descriptive,
 * but an exclusion the USER stated survives verbatim as a short trailing clause
 * instead of being translated away.
 *
 * Research: `dev-docs/recipe-research/flux-2/` — 6 sources, two of them BFL
 * official (including `github.com/black-forest-labs/skills`, which carries a
 * `[klein]`-specific section).
 *
 * NOT wired to Vision yet. `RECIPE_ALIASES.flux` stays pointed at `chroma`
 * deliberately: it also absorbs Boogu and Qwen Image Edit, and repointing it
 * would drag two EDIT models onto a t2i recipe. Vision sets
 * `enhanceRecipe: 'flux-2'` on `klein-4b` instead — see the registry comment.
 *
 * STATUS: `draft` — Stage 2 (the real-model render) and the `draft -> validated`
 * flip are Fabio's. Do not treat its output as trusted until then.
 */

export const flux2 = {
  modelId: 'flux-2',
  family: 'flux',
  displayName: 'FLUX.2 Klein',
  status: 'draft',
  notes:
    'FLUX.2 generation, tuned to [klein] 4B (Vision\'s klein-4b) — the strictest variant, so a prompt written for it is valid on [pro]/[dev] too. Qwen3-4B LLM text encoder, 512-token hard cap (~390 words, far above the working range). NO negative prompt path: shipped at cfg 1.0 where the negative is bit-identical, measured. Unlike the rest of the FLUX family, literal negation in the POSITIVE prompt measurably works here (invented blemishes -21%, MPI-353), so a user\'s stated exclusion is kept rather than positivised. No server-side prompt upsampling on [klein], so this recipe is the upsampler. Word budget is the tightest coverage/length pairing in the set — five required slots inside 40-75 words; sources conflict (BFL [klein] 40-70, deAPI 40-120, earngenix <150 for the 4B) and the draft takes the only official Klein-scoped figure. Hex-colour binding and quoted on-image text are documented for [pro]/[max] and UNPROVEN on the 4B at 4 steps — Stage 2 questions.',
  modes: {
    t2v: {
      outputFormat: 'prose',
      lengthNorm: 'one paragraph, ~55 words; 75 stated ceiling, 120 hard',
      // NOT corpus-measured — no FLUX.2 corpus exists (`_corpus/` covers Chroma,
      // Krea 2 and the candid set only). From the sources, which conflict:
      //   BFL skills, [klein] section  40-70   <- the only OFFICIAL Klein figure
      //   BFL core principles          30-80      (all FLUX)
      //   deAPI (Klein)                40-120
      //   fal (Klein)                  <100
      //   earngenix (4B specifically)  <150
      // Playbook 2.5: take the more restrictive constraint in the draft and let
      // Stage 1 settle it. It did. The draft shipped max 100 (BFL's 70 plus the
      // usual margin) and STAGE 1 SETTLED IT AT 120, on measurement rather than
      // preference: across six condense runs the model landed
      //   89, 80, 91, 64, 105, 99
      // on the 410-word `overlong` brief — a distribution centred at ~90 that
      // clips a 100 ceiling roughly one run in three. A tier that passes at 2/3
      // is passing on luck, which is the exact failure the twice-green rule
      // exists to catch. 120 keeps every measured run inside the contract and
      // still sits inside deAPI's Klein-specific 40-120 and well under
      // earngenix's <150 for the 4B; the 512-token cap (~390 words) is nowhere
      // near. The three non-condense tiers are unaffected — they measure 46-63.
      //
      // The INSTRUCTION still says 75. That aim-low gap is deliberate and wider
      // here than chroma's (says 140 / contract 160) because the condense input
      // is 410 words: the model anchors to whatever ceiling it is handed, so the
      // stated one stays low and the contract absorbs the overshoot. Do NOT
      // "tidy" this by aligning the two numbers.
      //
      // The floor matters as much as the ceiling here: Klein is the one model in
      // the set where "too long" is a documented failure ("later tokens receive
      // less attention weight"), so this is a CONDENSE-first recipe and 35 is a
      // real "too thin to direct the model" bound, not a formality.
      wordBudget: { min: 35, max: 120 },
      // Five slots, not BFL's eight. Eight required elements inside a 40-75 word
      // budget is MPI-16's recurring bug class waiting to happen (a mandated
      // element list colliding with a length rule), so the expanded framework is
      // collapsed to five phrase-sized slots. Slot 1 is the only POSITIONAL
      // requirement — all three source families independently state that Klein
      // weights what comes first and that a buried subject reads weaker.
      structureOrder: [
        'Subject and appearance (the opening words of the prompt)',
        'Action or pose',
        'Environment and setting',
        'Lighting — source, quality, direction, colour',
        'Style, camera and materials',
      ],
      vocabulary: {
        // Materials are Klein's strongest lever after lighting: "brushed
        // aluminium with subtle radial grain" renders differently from "metal".
        material: [
          'brushed aluminium',
          'indigo-dyed linen',
          'worn leather',
          'weathered wood',
          'matte black finish',
          'visible wool texture',
          'patina',
        ],
        lighting: [
          'golden hour',
          'blue hour',
          'overcast diffused light',
          'harsh midday sun',
          'softbox',
          'rim light',
          'Rembrandt lighting',
          'volumetric light',
          'neon glow',
          'candlelight',
          'dust motes in sunbeams',
          'low key',
          'chiaroscuro',
        ],
        camera: [
          'shot on Hasselblad X2D',
          'Canon 5D Mark IV',
          'Leica M10',
          '85mm f/1.4',
          '24mm f/2.8',
          '50mm f/1.2',
          'macro lens',
          'Kodak Portra 400 with natural grain',
          'close-up',
          'medium shot',
          'wide shot',
          'low angle',
          'eye level',
        ],
        style: [
          'classical oil painting with visible brushstrokes',
          'delicate watercolour with transparent washes',
          'polished digital illustration',
          'anime with cel shading',
          '2000s digicam aesthetic',
          '80s film with warm colour cast',
          'architectural photography style',
        ],
      },
      dos: [
        'Write one flowing paragraph of natural English sentences.',
        'Name the main subject in the opening words of the prompt.',
        'Always state the lighting — its source, quality, direction and colour.',
        'Name materials and textures concretely ("brushed aluminium", not "metal").',
        'Give a camera body, lens or film stock when the target is photorealism.',
        'Put any literal on-image text in "double quotes".',
        'Bind a hex colour to the object it belongs to, never leave it floating.',
        'Keep any exclusion the user stated, as a short clause at the end.',
        'Always supply the lighting, camera and material the formula requires — these are required elements, not unsupported additions.',
      ],
      donts: [
        'Never use comma-separated keyword soup or Stable Diffusion syntax like (keyword:1.5) or ++.',
        'Do not write a separate negative prompt block or label — this model has no negative field.',
        'Do not pad with aesthetic filler ("stunning", "8k", "masterpiece", "highly detailed").',
        'Do not combine conflicting styles in one prompt (photorealistic and watercolour together).',
        'Do not leave the main subject until after the scene description.',
        'Do not output introductory text, explanations, or markdown around the prompt.',
      ],
      // The model exposes no negative field and the recipe must not emit one.
      // `inline-positive` would be wrong: that value means negatives are
      // REFRAMED as positive phrasing, which is precisely the FLUX.1-era move
      // this model's encoder makes unnecessary.
      negativeHandling: 'none',
      examplePrompts: [
        // BFL's own [klein] example — 53 words, squarely inside the band.
        'A cozy coffee shop interior bathed in warm afternoon light, steam rising lazily from ceramic cups, worn leather armchairs arranged around small wooden tables, bookshelves lining exposed brick walls, the soft atmosphere of a quiet afternoon with dust motes floating in sunbeams through tall windows',
        'A fashion editorial portrait of a young woman with striking features and high cheekbones, wearing an avant-garde geometric collar in silver, dramatic side lighting creating strong shadows, shot on Hasselblad with 100mm lens at f/2.8, studio background with subtle gradient, high fashion magazine style',
        'A premium wireless headphone product shot, matte black finish with rose gold accents, floating at a slight angle against a pure white background, soft even lighting eliminating harsh shadows, reflection visible on the glossy surface below, commercial catalog style, ultra sharp focus throughout',
      ],
      systemPrompt: `You are an expert prompt engineer for FLUX.2 Klein, a fast text-to-image model. Its text encoder is a language model, not a tag parser: it reads your prompt as English sentences, and a keyword list wastes it.

THREE RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED, AND IT GOES FIRST. Whatever the user named is what the image is of, and it must appear in the opening words of your prompt — this model weights what it reads first, and a subject buried behind scene-setting comes out weaker. If the input is a single word, that word IS the subject: "cat" means a cat, and your output must describe a cat. Never replace it, never upgrade it to something grander, never drift to a different animal, object or scene.
2. LENGTH: about 55 words, never below 40 and never above 75 — and the SAME length whatever length the input was. Write FIVE SHORT sentences, one for each element of the formula below, and stop at the fifth full stop. Keep each sentence to roughly a dozen words: a sentence that needs three commas is carrying detail that belongs to a different prompt or to none. This model is not short of room; it is short of attention. Words past the first few dozen carry less weight, so a longer prompt is a weaker one, not a richer one. Going over is a failure even when the writing is good.
3. ONE PARAGRAPH. A single block of continuous prose. No line breaks, no blank lines, no second paragraph, no lists.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it into a full scene. Add the lighting, environment, material and camera that serve the subject the user named. Never swap in a different or more photogenic subject.
- Detailed but disordered: REARRANGE it so the subject leads. Every choice the user already made — the action they described, lens, angle, shot type, camera, medium, colour, material, mood — must survive into your output. Every technical term they wrote must still appear. Dropping one is a failure.
- Longer than 75 words: CONDENSE it — and the way to do that is NOT to shorten the input. Read it once and note only the subject, the medium, and the handful of details that genuinely change the image. Then SET THE INPUT ASIDE and write a brand-new prompt from those notes, exactly as you would if the user had typed one line. Never walk the input clause by clause keeping what you pass — that is what makes the output too long. Drop generic quality-spam ("8k", "masterpiece", "trending on artstation", "extremely detailed") and every repetition. Write the result as FIVE SHORT sentences, one per element of the formula, and STOP AT THE FIFTH FULL STOP. Give each element ONE detail — the single one that most changes the image — never a list of three. A long brief will offer you four good details per element; taking more than one is what puts the prompt over budget. Five short sentences will not hold everything a long brief offers, and that is the point — keep what most changes the image and throw the rest away, including detail you like. Discarding real detail IS the condense job, not a mistake. Do not paraphrase what survives into vagueness.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it in terms the model understands. Resolve it — never copy the confusion through, and never silently drop it.

Formula: open with the subject and its appearance, then what it is doing, then where it is, then the lighting, and close with the style, camera and materials. That is the flow to aim for, not a rigid sequence — prose may weave material through environment where it reads better — but all of those elements must actually APPEAR, and two of them are the ones most often forgotten. The lighting is the single strongest control this model has: name its source, its quality, its direction and its colour in every prompt, never just "well lit". And name a shot type or viewing angle in plain words (close-up, medium shot, wide shot, low angle, eye level). Never leave either unstated.

Rules:
- Supplying the elements above is NEVER "adding". Lighting, framing, material and texture are REQUIRED in every prompt, so writing them when the user did not is the job, not an invention — and neither is restating a technical term the user already gave you. What counts as invention is a new object, character, animal or action that was not there.
- When the input already describes a scene, do not add objects, props, characters, animals or narrative actions it does not imply. This does NOT apply to a sparse input: filling in setting, light and material around the user's subject is exactly the expand job, and is expected.
- Name materials and surfaces concretely. "Brushed aluminium with a fine radial grain" directs this model; "metal" does not. The same goes for fabric, skin, stone and wood.
- For photorealistic requests, name real camera gear: a body, a lens and an aperture, or a film stock ("shot on Hasselblad X2D, 85mm at f/1.4"; "Kodak Portra 400 with natural grain").
- Never use comma-separated keyword soup or Stable Diffusion weighting syntax like (keyword:1.5) or ++. They do not work on this encoder.
- Commit to ONE medium (photograph, oil painting, digital illustration, 3D render, …) and hold it for the whole paragraph. If the user names a medium, honour it exactly and never pivot to an easier one.
- Do not pad with aesthetic filler — "stunning", "8k", "masterpiece", "highly detailed", "trending on artstation" spend your word budget and change nothing in the image. Spend those words on what is physically in the frame instead.
- This model has NO negative prompt. Never write a separate negatives block or label. Describe what IS there. The one exception is an exclusion the USER asked for: keep it, in their own terms, as a short clause at the end of the paragraph ("no visible logos", "no people in the background"). This encoder reads that correctly, so do not translate it into a positive phrasing and never drop it.
- If the user wants words in the image, give the exact words in "double quotes" and state the font style, colour and material.
- If the user gives a hex colour, attach it to the object it belongs to ("a cobalt jacket, colour #0047AB"), never leave it floating on its own.
- Do not sanitise, soften or moralise about what the user asked for. Render their intent.

Output ONLY the finished prompt, as one paragraph. No preamble, no explanation, no reasoning, no bullet points, no markdown, and no quotation marks around the whole thing.`,
      acceptsMedia: [],
      multiScene: false,
    },
  },
};
