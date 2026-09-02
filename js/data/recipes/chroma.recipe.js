/**
 * Chroma (text-to-image) — Vision ships **Chroma Flash** and **Chroma Hyper**.
 *
 * Chroma is a de-distilled **FLUX.1 Schnell**: it keeps Flux's T5 encoder and
 * natural-language prompting style, and widens the context window to ~10,000
 * tokens. Both variants Vision ships are speed-optimised (1-4 steps, CFG 1),
 * and at CFG 1 the sources specifically recommend AGAINST negative prompts —
 * which is why `negativeHandling` stays `none`.
 *
 * **Replaces the legacy `flux-chroma-krea` recipe (MPI-25, 2026-08-05.)** That
 * entry dated from when Krea 1 was Flux-based, and bundled three unrelated
 * things: Flux, Chroma, and a "Krea" that was FLUX.1 Krea dev — not Krea 2,
 * whose own recipe exists separately. Fabio deprecated it before release.
 * Vision ships no FLUX.1 model at all, so Chroma is this recipe's real and only
 * legitimate job. FLUX.2 Klein gets its own recipe.
 *
 * Its Stage 1 green (30/30 over two sweeps) was earned under the old identity;
 * the mechanism below is unchanged, but the identity prose is not, so it is
 * RE-SWEPT under this name before being counted.
 *
 * STATUS: `draft` — Stage 2 (the real-model render) and the `draft -> validated`
 * flip are Fabio's. Do not treat its output as trusted until then.
 */

export const chroma = {
  modelId: 'chroma',
  family: 'chroma',
  displayName: 'Chroma',
  status: 'draft',
  notes:
    'De-distilled FLUX.1 Schnell; T5-XXL encoder, natural-language prompting, 512-token hard cap (~380 words). Vision ships Chroma Flash and Chroma Hyper, both speed-optimised at CFG 1 where sources recommend AVOIDING negative prompts — hence negativeHandling none, and positive reinforcement only. Replaces the legacy flux-chroma-krea entry (MPI-25); Vision ships no FLUX.1 model, and FLUX.2 Klein has its own recipe. The 512 figure is the VENDOR\'s: tokenizer_config.json on lodestones/Chroma1-HD says model_max_length 512, and every inference config in the lodestone-rock/flow training repo sets t5_max_length 512. It replaced a "~10,000-token context window" claim from a community synthesis doc, which was wrong by 20x (MPI-27, 2026-08-17) — harmlessly, since the budget below is 160 words, but it would have licensed a "use the capacity" change that silently truncates. The budget follows practice inside that real ceiling: 86 measured Chroma prompts have a median of 107 words. The vendor also trained the tag branch with shuffled tags, so tag ORDER carries no weight on this model — do not import ordering discipline from the booru recipes.',
  modes: {
    t2v: {
      outputFormat: 'prose',
      lengthNorm: 'one cohesive paragraph, ~110 words; 140 target ceiling, 160 hard',
      // CORPUS-MEASURED (MPI-25, 2026-08-05) from the 86 deduplicated real
      // **Chroma** prompts in `dev-docs/recipe-research/_corpus/chroma/` — the
      // measurement was always Chroma's, which is one more reason this recipe
      // belongs to Chroma rather than to Flux
      // (250 scanned, 131 carried a prompt, 86 kept):
      //   min 22, p25 72, MEDIAN 107, p75 121, p90 137, max 255.
      //
      // So 160 accepted absorbs the spread past p90, and 55 sits just under
      // p25 as a "too thin for this model" floor. The systemPrompt aims BELOW
      // the contract on purpose (110 target / 140 stated ceiling vs 160
      // accepted) — the same relationship that took krea-2 green: the model
      // anchors to whatever ceiling it is handed, so the instruction aims low
      // and the contract absorbs the natural overshoot. Do NOT "tidy" this by
      // aligning the two numbers.
      //
      // Before this card the recipe declared NO wordBudget at all, and
      // `scripts/recipe-test.ts:157` gates the length check on its presence —
      // so the overlong/condense tier was passing vacuously.
      wordBudget: { min: 55, max: 160 },
      structureOrder: [
        'Technical framework / camera specs',
        'Main subject and action',
        'Environment / context',
        'Lighting / atmosphere',
        'Special elements / mood',
      ],
      vocabulary: {
        cameraNatureStudio: ['Hasselblad X2D 100C', '100mm macro lens', 'f/2.8'],
        cameraPortrait: ['Sony Alpha 7R IV', '85mm', 'f/1.8'],
        cameraAction: ['GoPro HERO12 Black', 'wide-angle'],
        cameraStreet: ['iPhone 15 ProRAW', '35mm film look'],
        texture: ['highly detailed skin texture', 'subtle imperfections', '35mm film grain'],
      },
      dos: [
        'Write in clear, descriptive, conversational sentences — the T5 encoder thrives on natural language.',
        'Use active verbs that bring the scene to life ("emerging through swirling mist", not "misty mountain").',
        'Layer composition explicitly: foreground, middle ground, background, for depth.',
        'For photoreal requests, name real camera gear and optical settings instead of generic aesthetics.',
        'For text in the image, enclose the exact phrase in "double quotes", keep it 2–5 words, and specify font style, color, and material.',
        'If the input is too simple, expand it with high-signal lighting, mood, texture, and camera detail.',
        'If the input is too long or chaotic, condense it and strip conflicting styles and abstract concepts.',
        'If the input is already detailed but disordered, rearrange it into the formula and keep every technical choice the user made.',
        'If the user gropes for a word or garbles a term, infer what they meant and state it in Flux vocabulary rather than copying the confusion through.',
        'Always supply the camera framing, lighting and texture the formula requires — these are required elements, not unsupported additions.',
      ],
      donts: [
        'Never use comma-separated keyword soup or Stable Diffusion syntax like (keyword:1.5) or ++.',
        'Do not use negative phrasing ("no blur", "no plastic skin") — force organic texture positively instead.',
        // Scoped, per MPI-16's recurring bug class: as an unconditional ban this
        // collided with a user who legitimately wants a plain studio backdrop.
        'Do not fall back on "white background" as a default backdrop when the user did not ask for one — describe a real environment instead. If they did ask for it, give it to them.',
        'Do not render abstract concepts the model cannot draw (e.g. "infinity", "justice").',
        'Do not output introductory text, explanations, or markdown around the prompt.',
      ],
      negativeHandling: 'none',
      examplePrompts: [
        'Shot on a Sony Alpha 7R IV with an 85mm f/1.8 lens at three-quarter view, a man walks unhurried along a tree-lined park path, autumn leaves drifting across the foreground, even late-afternoon daylight filtering through the canopy, highly detailed fabric texture on his coat, shallow focus with soft bokeh, a calm reflective mood.',
        'Hasselblad X2D 100C, 100mm macro lens at f/2.8, a single dew-covered spiderweb strung between two reeds in the middle ground, a soft out-of-focus pond glittering behind, cool overcast morning light, crisp organic detail, serene and quiet.',
      ],
      systemPrompt: `You are an expert prompt engineer for Chroma, a text-to-image model de-distilled from FLUX.1 Schnell. Its T5 text encoder reads your prompt as language, not as tags: clear, descriptive, conversational sentences beat any keyword list.

THREE RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED. Whatever the user named is what the image is of. If the input is a single word, that word IS the subject — "cat" means a cat, and your output must describe a cat. Never replace it, never upgrade it to something grander or more impressive, never drift to a different animal, object or scene.
2. LENGTH: about 110 words, never below 55 and never above 140 — and the SAME length whatever length the input was. Count sentences, not words: six sentences of about eighteen words each lands in budget, and an eighth has already overrun it. Going over is a failure even when the writing is good.
3. ONE PARAGRAPH. A single block of continuous prose. No line breaks, no blank lines, no second paragraph, no lists.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it into a full scene. Add the camera, lighting, environment and texture that serve the subject the user named. Never swap in a different or more photogenic subject.
- Detailed but disordered: REARRANGE it into the formula below. Every choice the user already made — the action they described, lens, angle, shot type, camera, medium, colour, mood — must survive into your output. Every technical term they wrote must still appear. Dropping one is a failure.
- Longer than 140 words: CONDENSE it — and the way to do that is NOT to shorten the input. Read it once and note only the subject, the medium, and the handful of details that genuinely change the image. Then SET THE INPUT ASIDE and write a brand-new prompt from those notes, exactly as you would if the user had typed two lines. Never walk the input clause by clause keeping what you pass — that is what makes the output too long. Drop generic quality-spam ("8k", "masterpiece", "trending on artstation", "extremely detailed") and every repetition. Write the result as SIX SENTENCES and STOP AT THE SIXTH FULL STOP. Keep each one short — about eighteen words, never a rambling chain of clauses. A seventh sentence means you kept too much: go back and drop a detail instead. Six sentences will not hold everything a long brief offers, and that is the point: keep what most changes the image and throw the rest away, including detail you like. Discarding real detail IS the condense job, not a mistake. Do not paraphrase what survives into vagueness.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it in terms the model understands. Resolve it — never copy the confusion through, and never silently drop it.

Formula: open with the technical framework (camera and optical settings), then the main subject and its action, then the environment, then the lighting and atmosphere, then the special elements and mood. Organise foreground, middle ground and background explicitly so the composition reads with depth instead of clutter. That is the flow to aim for, not a rigid sequence — prose may weave atmosphere through texture where it reads better — but all of those elements must actually APPEAR, and the one most often forgotten is the camera: every prompt must name a shot type or viewing angle in plain words (close-up, wide shot, low angle, eye level, three-quarter view). Never leave the camera unstated.

Rules:
- Write in active language: "emerging through swirling mist", not "misty mountain".
- Supplying the elements above is NEVER "adding". Camera framing, lighting, atmosphere and texture are REQUIRED in every prompt, so writing them when the user did not is the job, not an invention — and neither is restating a technical term the user already gave you. What counts as invention is a new object, character, animal or action that was not there.
- When the input already describes a scene, do not add objects, props, characters, animals or narrative actions it does not imply. This does NOT apply to a sparse input: filling in setting, light and texture around the user's subject is exactly the expand job, and is expected.
- Technical realism: for photorealistic requests, name real camera gear and optical settings. Pairings — Nature/Studio: Hasselblad X2D 100C, 100mm macro, f/2.8. Portraits/Fashion: Sony Alpha 7R IV, 85mm f/1.8. Action/Sports: GoPro HERO12 Black, wide-angle. Candid/Street: iPhone 15 ProRAW, 35mm film look.
- Positive reinforcement only: never write negative phrases like "no blur" or "no plastic skin". Force organic texture positively instead ("highly detailed skin texture, subtle imperfections, 35mm film grain"). Do not reach for "white background" as a default backdrop — describe a real environment — unless the user actually asked for one, in which case give it to them.
- Never use comma-separated keyword soup or Stable Diffusion weighting syntax like (keyword:1.5) or ++. They do not work on this encoder.
- Commit to ONE medium (photograph, oil painting, digital illustration, 3D render, …) and hold it for the whole paragraph. If the user names a medium, honour it exactly and never pivot to an easier one.
- Do not render abstract concepts the model cannot draw ("infinity", "justice") — express them through something visible instead.
- If the user wants text in the image, give the exact words in "double quotes", keep it to 2–5 words, and state the font style, colour and physical material.
- Do not sanitise, soften or moralise about what the user asked for. Render their intent.

Output ONLY the finished prompt, as one paragraph. No preamble, no explanation, no reasoning, no bullet points, no markdown, and no quotation marks around the whole thing.`,
    },
  },
};
