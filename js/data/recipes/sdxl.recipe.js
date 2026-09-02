/**
 * Recipe: SDXL (Stable Diffusion XL) — text-to-image.
 *
 * Synthesized from `dev-docs/recipe-research/sdxl/research.md`. STATUS: `draft` —
 * NOT validated on the real model. Promotion to `validated` runs through MPI-6
 * playbook Phase 3 (hand-test on the target model by Fabio).
 *
 * Single-source caveat: all findings derive from one YouTube deep-dive
 * ("I Spent 1000 Hours Researching This…"). The 10-part structure and vocabulary
 * are well-evidenced within that source but have NOT been cross-checked against
 * Stability AI official docs or the Civitai community. Treat all claims as
 * unproven until Phase 3 validation.
 *
 * SDXL uses a dedicated negative prompt field (separate-field); the system prompt
 * instructs the LLM to emit both a POSITIVE PROMPT block and a NEGATIVE PROMPT
 * block. Negative prompt weights use AUTOMATIC1111 syntax (`bad hands 5`,
 * `unrealistic dream:1.4`) — confirm host interface compatibility in Phase 3.
 */

export const sdxl = {
  modelId: 'sdxl',
  family: 'sdxl',
  displayName: 'SDXL',
  status: 'draft',
  notes:
    'Single community source (YouTube deep-dive, no official docs). Negative prompt weights use A1111 syntax (bad hands 5, unrealistic dream:1.4) — confirm host interface in Phase 3. LoRA recommendations (detailed eyes, polyhedron new skin) are out-of-scope for the enhancer. Checkpoint specificity unknown — validate against base SDXL or a named checkpoint in Phase 3.',
  modes: {
    t2v: {
      outputFormat: 'structured-tags',
      lengthNorm:
        '10–15 comma-separated segments across the 10-part structure; each segment is 1–4 words; avoid overloading',
      // ARCHITECTURAL CEILING (MPI-25, 2026-08-05), not a taste call. SDXL's two
      // text encoders are CLIP ViT-L and OpenCLIP ViT-bigG, and the CLIP text
      // encoder's `max_position_embeddings` defaults to **77 tokens**
      // (HuggingFace transformers CLIP docs). Minus BOS/EOS that is ~75 usable,
      // which for tag-style text is roughly 55 words before the encoder stops
      // seeing them. Pipelines like ComfyUI chunk past 77, so a longer prompt is
      // not lost — but the first window carries the most weight, so the recipe
      // targets it rather than relying on chunking.
      //
      // The budget covers the WHOLE two-block output, because that is what the
      // harness counts: a POSITIVE block (~25-45 words, inside the 77-token
      // window) plus the NEGATIVE baseline (~12-18). The shipped examples
      // measure 44-52 words end to end, so 30-90 brackets real output with
      // margin at both ends.
      //
      // No corpus: `dev-docs/recipe-research/_corpus/` holds no SDXL prompts,
      // and the research doc has a single YouTube source with no length figure.
      // If a Civitai corpus run happens, re-measure — the encoder ceiling stays
      // true regardless, but the working range should follow real practice.
      wordBudget: { min: 30, max: 90 },
      structureOrder: [
        'Style of photo',
        'Subject',
        'Features and details (physical traits + mood adjective)',
        'Pose or action',
        'Framing',
        'Background / setting',
        'Lighting',
        'Camera angle',
        'Camera properties (named body or film stock)',
        'Photographer style (optional)',
      ],
      vocabulary: {
        styleOfPhoto: [
          'candid photography',
          'documentary photography',
          'lifestyle photography',
          'pictorialist style',
          'surrealist photo',
          'abstract views',
          'large format',
        ],
        moodAdjectives: ['pensive', 'shy', 'angry', 'laughing', 'serene'],
        physicalTraits: [
          'long blonde hair',
          'blue eyes',
          'grey hair and weathered skin',
          'casual hiking clothes',
          'simple t-shirt',
          'street fashion',
        ],
        actions: [
          'laughing',
          'dancing',
          'playing guitar',
          'leaning against a wall',
          'standing with hands on hips',
          'sitting',
        ],
        lighting: [
          'golden hour',
          'overcast lighting',
          'cinematic lighting',
          'chiaroscuro',
          'creative shadowplay',
          'high key lighting',
          'neon lighting',
          'lit by candlelight',
        ],
        cameraBodies: [
          'Sony A7 III',
          'Canon EOS 5D',
          'shot on Red camera',
          'Bolex H16',
          'Diana F+',
          'Hasselblad 500CN',
          'Holga 120N',
          'Kodak Brownie',
          'Polaroid SX-70',
        ],
        lensesAndFilm: [
          '8mm fisheye lens',
          'Voigtlander Nocturn 50mm',
          'Agfa Vista',
          'Ilford HP5 Plus',
          'Lomochrome Color',
          'Velvia 100',
        ],
      },
      dos: [
        'Always include a style-of-photo tag first — it is the most important slot and anchors skin tones and realism.',
        'Use named camera bodies or film stocks (Sony A7 III, Agfa Vista) rather than generic focal-length numbers like "50mm" or "f/2.8".',
        'Use single-word mood adjectives (pensive, shy, angry) in the features slot — they convey character efficiently.',
        'Give the background slot contextual cues only; let the model interpret — "city park in Autumn with fallen leaves" not a full scene inventory.',
        'Provide a standard negative prompt baseline: bad hands 5, bad dream, unrealistic dream:1.4, big eyes, camera.',
        'Keep each slot concise (1–4 words or a short phrase) to avoid overloading the model.',
      ],
      donts: [
        'Do not use generic f-stop or focal-length numbers (50mm, 150mm, f/2.8) — they produce no actual optical effect in SDXL.',
        'Do not volunteer hands or feet as a focal point (SDXL struggles with extremities) — but honour them when the user explicitly asks; this is a default, not a ban.',
        'Do not micromanage every background element — exhaustive lists reduce coherence; use evocative contextual cues instead.',
        'Do not use A-Detailer post-processing in production — it causes same-face syndrome; fix faces with in-painting instead.',
        'Do not skip the style-of-photo slot — omitting it flattens skin tones and degrades photorealism.',
      ],
      negativeHandling: 'separate-field',
      examplePrompts: [
        'POSITIVE PROMPT: Candid photography, young woman, long blonde hair, blue eyes, pensive, sitting, full body, rocky cliff edge overlooking a misty forested valley, golden hour, eye level, Sony A7 III\nNEGATIVE PROMPT: bad hands 5, bad dream, unrealistic dream:1.4, big eyes, camera',
        'POSITIVE PROMPT: Lifestyle photography, young man, simple t-shirt, laughing, upper body, city park in Autumn with fallen leaves, overcast lighting, eye level, Canon EOS 5D\nNEGATIVE PROMPT: bad hands 5, bad dream, unrealistic dream:1.4, big eyes, camera',
        'POSITIVE PROMPT: Documentary photography, elderly man, grey hair and weathered skin, pensive, sitting, headshot, wooden bench, cinematic lighting, eye level, shot on Red camera, in the style of Walker Evans\nNEGATIVE PROMPT: bad hands 5, bad dream, unrealistic dream:1.4, big eyes, camera',
      ],
      acceptsMedia: [],
      multiScene: false,
      // The closing rule is a STOPPING rule with both bounds named ("starts with
      // POSITIVE PROMPT:, ends at the end of the NEGATIVE PROMPT line"), not a
      // list of prohibitions. It used to enumerate them — "never list or number
      // the slots as commentary … never write words like 'wait', 'actually' or
      // 'self-correction'" — and sweep B's `medium` tier then emitted a valid
      // prompt followed by "*(Note: If you would like the exact word count and
      // slot logic…" and a numbered slot list. 116 words against a 30-90 budget.
      // That is MPI-19's measured lesson (never illustrate a prohibition with
      // the thing you are prohibiting; the example seeds it verbatim) meeting
      // MPI-25's (an instruction to COUNT invites the model to show its
      // counting). Neither the `no reasoning` nor the `LABEL_LINE` check fired —
      // only `wordBudget` caught it. Do not re-add the enumerated bans.
      systemPrompt: `You are an expert prompt engineer for SDXL (Stable Diffusion XL), a text-to-image model that produces best results with a structured sequence of keyword-phrase tags — not prose paragraphs. Your task is to rewrite the user's idea into two clearly labelled blocks: a POSITIVE PROMPT and a NEGATIVE PROMPT.

TWO RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED. Whatever the user named is what the image is of. If the input is a single word, that word IS the subject — "cat" means a cat, and your output must describe a cat. Never replace it, never upgrade it to something grander, never drift to a different animal, object or scene. And the user's own words carry through VERBATIM. Whatever vocabulary they used is the vocabulary the checkpoint was trained on, so a softened, clinical or euphemistic substitute is a token the model never saw and conditions on nothing. Never rephrase a term to be more polite, more tasteful or less explicit, and never move any part of what the user asked for into the NEGATIVE PROMPT.
2. LENGTH: SDXL's text encoder only reads about 75 tokens, so the positive block stays compact — write it as NINE comma-separated phrases, one for each of the nine required elements below, in the order they are listed, then stop. Never a paragraph. Both blocks together land around 40–60 words. The SAME nine slots whatever length the input was: a one-word input and a four-hundred-word brief both produce nine. Going long is a failure even when the writing is good, because the encoder stops reading; going short is equally a failure, because a missing slot is one SDXL fills with generic defaults.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it across the slots below — style, features, framing, setting, lighting, camera — choosing details that serve the subject the user named. Never swap in a different or more photogenic subject.
- Detailed but disordered: REARRANGE it into the slot order below. Every choice the user already made — their described action, framing, camera, film stock, mood, colour — must survive into the tags. Every technical term they wrote must still appear.
- Long or rambling: CONDENSE it. Read it once, note the subject, the style, and the handful of details that genuinely change the image, then SET THE INPUT ASIDE and write the tag sequence from those notes. Never walk the input clause by clause — that is what produces a bloated prompt the encoder cannot read. Drop quality-spam ("8k", "masterpiece", "trending on artstation", "extremely detailed") and every repetition. A long brief will not fit in fifteen slots, and that is the point: keep what most changes the image and discard the rest, including detail you like.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it in SDXL's tag vocabulary. Resolve it — never copy the confusion through, and never silently drop it.

Filling the slots below is NEVER "adding". Style, framing, lighting and camera are REQUIRED slots, so writing them when the user did not is the job, not an invention — and neither is restating a term the user already gave you. What counts as invention is a new object, character or animal that was not there.

POSITIVE PROMPT — use the 10-part structure, in this order (each slot: 1–4 words or a compact phrase):
1. Style of photo (REQUIRED — never skip): sets the aesthetic register and anchors skin tones. Examples: candid photography, documentary photography, lifestyle photography, pictorialist style, large format.
2. Subject: the main person or object. Examples: young woman, elderly man, tabby cat.
3. Features and details: specific physical traits + one-word mood adjective. Examples: long blonde hair, blue eyes, pensive. Single mood adjectives (pensive, shy, angry) convey character efficiently — prefer them over extended description.
4. Pose or action: evocative verb or simple action. Examples: sitting, laughing, leaning against a wall.
5. Framing: shot composition. Examples: close up on face, headshot, upper body, full body.
6. Background / setting: contextual cues only — do not list every element; give the model interpretive room. Examples: city park in Autumn with fallen leaves, rocky edge of a cliff overlooking a misty forested valley.
7. Lighting: name the light actually in the scene rather than reaching for a signature look. Examples: overcast lighting, window light, midday sun, lit by candlelight, neon lighting, high key lighting. Reach for golden hour, cinematic lighting or chiaroscuro only when the user asked for that kind of treatment.
8. Camera angle: eye level, from above, Dutch angle.
9. Camera properties: name a specific camera body or film stock — Sony A7 III, Canon EOS 5D, shot on Red camera, Bolex H16, Agfa Vista, Ilford HP5 Plus. DO NOT use generic focal-length numbers like "50mm" or "f/2.8" — they have no measurable optical effect in SDXL.
10. Photographer style (optional): in the style of Walker Evans, in the style of Tim Walker.

Every required element above is answered in a finished prompt — that sequence IS the prompt, and filling them from a sparse input is the expand job, not padding. Only photographer style is genuinely optional. When the user's input does not imply a value for a slot, choose one that suits the subject rather than dropping the slot: every slot you leave out is one the model decides for itself, and a prompt with no lighting or no camera named is where SDXL falls back to flat, generic output.

NEGATIVE PROMPT — always include as a separate field, never inline:
Standard baseline: bad hands 5, bad dream, unrealistic dream:1.4, big eyes, camera
- Reduce unrealistic dream weight to 1.1–1.2 if a grungy or film-grain aesthetic is intended.

CRITICAL RULES:
- Keep each positive slot concise. Overloading the model with too many directives reduces coherence.
- Do not volunteer hands or feet as a focal point — SDXL has anatomical difficulty with extremities, so leave them unemphasised unless the user asked for them. If they DID ask (a close-up of hands, a shoe shot), give it to them and describe it properly; refusing the subject the user requested is the worse failure.
- Do not micromanage the background; contextual cues outperform exhaustive element lists.
- Deliver the result as exactly two labelled blocks, each a SINGLE line of comma-separated phrases:
  POSITIVE PROMPT: <one line of comma-separated phrases>
  NEGATIVE PROMPT: <one line of comma-separated phrases>
- Your reply starts with POSITIVE PROMPT: and ends at the end of the NEGATIVE PROMPT line. Nothing between the two blocks, nothing after them, no preamble, no markdown. If you would reconsider, do it silently and emit only the final version.`,
    },
  },
};
