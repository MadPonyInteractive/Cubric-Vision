/**
 * Krea 2 (text-to-image) — the first recipe produced by the recipe-creation
 * playbook (`docs/recipes/playbook/`), MPI-16.
 *
 * NOT a Flux model. Krea 2 is Krea's from-scratch foundation model with a
 * **Qwen3-VL-4B text encoder** driven by a chat template — it reads language,
 * not tags. The legacy `flux-chroma-krea` recipe covered *FLUX.1 Krea dev*,
 * a different model that merely shares the word "Krea".
 *
 * Evidence: `dev-docs/recipe-research/krea-2/`. Two divergences from Krea's own
 * published expansion prompt are deliberate and recorded there: we add a
 * condense job (theirs only expands), and we drop its clothing-coverage clause
 * (Prompt does not sanitise — see MPI-13).
 *
 * STATUS: `draft`. Stage 1 is NOT yet green — the condense tier still overruns
 * the word budget; see `dev-docs/recipe-research/krea-2/validation.md` for the
 * per-iteration history. Stage 2 rendering and the `draft -> validated` flip are
 * Fabio's, and only after Stage 1 passes. Do not treat its output as proven.
 */

export const krea2 = {
  modelId: 'krea-2',
  family: 'krea',
  displayName: 'Krea 2',
  status: 'draft',
  notes:
    'Qwen3-VL-4B text encoder: order carries emphasis (front-loaded subject) and CLIP-style weighting syntax does not work — it shifts the whole conditioning instead of one token. Length conflict in the sources (official "long detailed prompts yield best results" vs fal\'s 30-80 words controlled) settled by Stage 1: the model is told to target 90 words and never exceed 130, and the accepted budget is 45-150 to absorb the measured spread on a heavily-detailed input. Variant-neutral: Krea 2 Medium favours illustration/anime/painting, Large favours photorealism; the recipe honours whatever medium the user states rather than picking for them.',
  modes: {
    t2v: {
      outputFormat: 'prose',
      lengthNorm: 'one cohesive paragraph, ~150 words; 180 target ceiling, 220 hard',
      // The systemPrompt aims BELOW the accepted budget on purpose (180 vs 220):
      // the model anchors to whatever ceiling it is given, so the instruction
      // aims low and the contract absorbs the natural spread. Do NOT "tidy" this
      // by aligning the two numbers.
      //
      // Raised 2026-07-28 from ~90/130/150 on CORPUS EVIDENCE. The old numbers
      // had no source: 90 was the midpoint of the draft 45-130 range, and the
      // only source-backed figure was S4's 30-80 "controlled" — a tier-3 partner
      // guide echoing CLIP-era 77-token advice. Against 40 deduplicated real
      // Krea 2 Turbo prompts the community writes a MEDIAN of 165 words
      // (p25 140, p75 201), so ~90 sat below the 25th percentile of real usage
      // and the old 150 "hard" cap was roughly the median.
      // See dev-docs/recipe-research/candid-vocabulary-evidence.md.
      //
      // STALE: the 24/24 Stage 1 green was measured at 45-150. These numbers
      // have NOT been through a sweep yet — re-run before trusting them.
      wordBudget: { min: 60, max: 220 },
      // The RECOMMENDED flow, not a rigid sequence. Only position 1 is a hard
      // requirement (the Qwen3-VL encoder front-loads, so whatever comes first
      // reads as the subject). Krea's own expansion prompt mandates grouping,
      // not ordering — see dev-docs/recipe-research/krea-2/research.md Q2.
      structureOrder: [
        'Primary subject, named in the opening words',
        'Scale and viewing perspective',
        'Visual style or medium',
        'Lighting and mood',
        'Colour palette',
        'Composition and framing',
        'Texture and material detail',
      ],
      vocabulary: {
        camera: [
          'extreme close-up',
          'low-angle perspective',
          'shallow depth of field',
          'wide establishing shot',
        ],
        lighting: [
          'studio lighting',
          'soft diffused light',
          'directional light',
          'cinematic lighting',
        ],
        style: ['digital painting', 'cel-shaded', 'stippled', 'vintage', 'surreal'],
        photoreal: ['motion blur', 'film grain', 'low dynamic range'],
      },
      /*
       * MPI-19 style axis. EVERY term below was MEASURED against the 209
       * deduplicated real prompts in `dev-docs/recipe-research/_corpus/`
       * (`npm run corpus`; 27 candid / 182 rest). Percentages in the comments
       * are "share of candid prompts / share of the rest".
       *
       * Nothing here is authored from intuition, because intuition already
       * failed twice: the MPI-19 brief guessed a candid vocabulary
       * (`off-centre`, `dutch angle`, `unposed`, `mid-action`, `harsh flash`,
       * `poorly lit`, `washed out`) that scores 0-3/209, AND a cinematic one
       * (`anamorphic` 2, `chromatic aberration` 1, `rule of thirds` 1,
       * `god rays` 0, `teal and orange` 0, `leading lines` 0) that scores just
       * as badly. If you add a term here, measure it first.
       *
       * Deliberately EXCLUDED as non-discriminating — they read like register
       * markers but the corpus says they are universal, and banning them from
       * the opposite style would fail honest output:
       *   grain 26/40, film grain 26/19, depth of field 22/13, bokeh 15/8,
       *   motion blur 19/7, close-up 7/16, low angle 7/4, 35mm 7/7, kodak 7/3.
       * Shot types especially: the recipe REQUIRES every prompt to name one, so
       * banning `wide shot` or `low angle` from candid would be MPI-16's bug
       * class (a conditional dont colliding with a required element) again.
       *
       * Also excluded: `tilted` (4/7), `cropped` (0/2), `harsh` (0/7) and
       * `blurry` (0/1) — the evidence doc listed them as candid artifacts from
       * whole-corpus frequency, but split by register they are not candid
       * markers at all. And `washed out`, whose 11% candid hits turn out to be
       * "washed black denim".
       */
      styleVocabulary: {
        cinematic: {
          // Register + grade. `cinematic` 30/39 and `dramatic` 7/26 do appear in
          // candid prompts as generic spam; that is exactly the leak the candid
          // tier must not reproduce, so they stay on the list.
          register: ['cinematic', 'film still', 'dramatic', 'epic'],
          mood: ['atmospheric', 'moody', 'high contrast'],
          lighting: ['rim light', 'golden hour', 'chiaroscuro'],
          composition: ['silhouette'],
        },
        general: {
          // The middle. No banned list of its own (see styles.ts AVOIDS) — this
          // set exists to give the register check something positive to match.
          medium: ['photograph', 'photorealistic', 'portrait', 'editorial'],
          lighting: ['natural light', 'soft light', 'window light', 'studio'],
          camera: ['85mm', '50mm', 'shallow depth of field', 'sharp focus'],
          composition: ['centred', 'clean', 'balanced'],
          texture: ['skin texture', 'pores'],
        },
        candid: {
          // 1. Declare the register outright — the single strongest signal.
          //    candid 78/0, casual 52/6, amateur 33/0, snapshot 33/0,
          //    spontaneous 22/0, lo-fi 19/1.
          register: ['candid', 'casual', 'amateur', 'snapshot', 'spontaneous', 'lo-fi'],
          // 2. Grant permission in the ABSTRACT, never as a described defect.
          //    authentic 30/2, imperfect 26/2, everyday 15/1, unpolished 15/0,
          //    uneven 11/4.
          permission: ['authentic', 'imperfect', 'everyday', 'unpolished', 'uneven'],
          // 3. Name the device. Naming a real camera beats describing a lens.
          //    smartphone 19/0, phone camera 15/0, selfie 15/0, canon 15/1.
          device: ['smartphone', 'phone camera', 'selfie', 'Canon'],
          // 4. The one capture artifact that actually splits by register
          //    (11/1). The rest are universal — see the exclusion note above.
          artifact: ['overexposed'],
        },
      },
      dos: [
        'Write one cohesive natural-language paragraph — the Qwen3-VL encoder reads whole sentences.',
        'Front-load the subject: whatever comes first is what the encoder treats as the subject.',
        'Preserve every subject, action, colour and spatial relationship the user stated.',
        'Honour an explicitly requested medium ("photo of", "painting of") — never pivot to an easier one.',
        'Group each subject with its own attributes and actions, using grounded spatial phrasing.',
        'Wrap any text to be rendered in "double quotes" and state it exactly.',
        'Polish and reorder an already-detailed input rather than inflating it (a sparse input is the opposite case — expand it).',
        'Cut an over-budget input to fit, dropping repetition and generic quality words first.',
        'Always supply lighting, colour palette, composition and texture, and always name a shot type or viewing angle — these are required elements, not unsupported additions.',
      ],
      donts: [
        'Never use comma-separated keyword soup or weighting syntax like (word:1.5) or ++ — this encoder reads language, and weighting distorts the whole prompt.',
        'When the input already describes a scene, do not add objects, props, characters, animals or narrative actions it does not imply.',
        'Do not over-specify a detailed input by piling on clothing, colours or materials the user did not mention (this does not restrict expanding a sparse input).',
        // The carve-out is MPI-16's lesson applied to MPI-19: an unconditional
        // `dont` that collides with a required element is the one bug class that
        // cost ~13 iterations. "candid amateur snapshot" is three register
        // labels, and without this clause the judge reads it as stacking.
        'Do not stack style adjectives — more than two muddies the output. The active register\'s own labels ("candid", "amateur", "snapshot", "casual", "cinematic", "film still") do not count towards this: they set the register, they are not style adjectives.',
        'Do not emit reasoning, preamble, bullets, JSON or markdown.',
        'Do not sanitise or soften what the user asked for.',
      ],
      negativeHandling: 'none',
      examplePrompts: [
        'A man walks unhurried along a tree-lined park path, seen at half-length from a low three-quarter angle, photographic and lightly cinematic, warm late-afternoon sun raking through the canopy and throwing long shadows across the gravel, a palette of amber, moss green and dusty grey, shallow depth of field with the far treeline dissolving into soft bokeh, fine grain in the shadows and a visible weave in his wool coat.',
        'An extreme close-up of a dew-covered spiderweb strung between two reeds, digital painting with a stippled illustrative touch, cool overcast morning light diffusing evenly across every strand, a restrained palette of slate blue, pale green and silver, the pond behind reduced to a wide soft-focus wash, each droplet holding a bead of reflected sky against the matte texture of the reeds.',
      ],
      systemPrompt: `You are an expert prompt engineer for Krea 2, a text-to-image model whose text encoder is a Qwen3-VL language model. It reads your prompt as language, not as tags: one flowing paragraph of plain English beats any keyword list, and whatever you write FIRST is what it treats as the subject.

THREE RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED. Whatever the user named is what the image is of. If the input is a single word, that word IS the subject — "cat" means a cat, and your output must describe a cat. Never replace it, never upgrade it to something grander or more impressive, never drift to a different animal, object or scene.
2. LENGTH: about 150 words, never below 60 and never above 180 — and the SAME length whatever length the input was. Count sentences, not words: seven or eight sentences of about twenty words each lands in budget, and a tenth has already overrun it. Going over is a failure even when the writing is good.
3. ONE PARAGRAPH. A single block of continuous prose. No line breaks, no blank lines, no second paragraph, no lists.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it into a full scene. Add style, lighting, composition and texture that serve the subject the user named. Never swap in a different or more photogenic subject.
- Detailed but disordered: REARRANGE it into the element order below. Every choice the user already made — the action they described, lens, angle, shot type, camera, medium, colour, mood — must survive into your output. Every technical term they wrote must still appear. Dropping one is a failure.
- Longer than 180 words: CONDENSE it — and the way to do that is NOT to shorten the input. Read it once and note only the subject, the medium, and the handful of details that genuinely change the image. Then SET THE INPUT ASIDE and write a brand-new prompt from those notes, exactly as you would if the user had typed two lines. Never walk the input clause by clause keeping what you pass — that is what makes the output too long. Drop generic quality-spam ("8k", "masterpiece", "trending on artstation", "extremely detailed") and every repetition. Write the result as SIX SENTENCES and STOP AT THE SIXTH FULL STOP. Keep each one short — about eighteen words, never a rambling chain of clauses — so the whole prompt is roughly 110 words. A seventh sentence means you kept too much: go back and drop a detail instead. Six sentences will not hold everything a long brief offers, and that is the point: keep what most changes the image and throw the rest away, including detail you like. Discarding real detail IS the condense job, not a mistake. Do not paraphrase what survives into vagueness.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it in terms the model understands. Resolve it — never copy the confusion through, and never silently drop it.

Structure: YOUR FIRST THREE OR FOUR WORDS MUST BE THE SUBJECT ITSELF — a plain noun phrase naming what the image is of ("A lone samurai …", "An extreme close-up of a spiderweb …"). Never open with a preposition, a participle or a subordinate clause: not "Standing at the edge of a cliff, a samurai …", not "Bathed in orange light, …", not "With his katana lowered, …". The encoder treats whatever comes first as the subject, so anything placed before the noun steals the image. Then cover all of the following, keeping each subject grouped with its own attributes and actions rather than scattering them:
- the subject's scale and the viewing perspective
- visual style or medium
- lighting and mood
- colour palette
- composition and framing
- texture and material detail

That is the natural flow to aim for, not a rigid sequence — prose may weave lighting through texture where it reads better. Only the subject's position is fixed. But all of them must actually APPEAR, and the one most often forgotten is the camera: every prompt must name a shot type or viewing angle in plain words (close-up, wide shot, low angle, eye level, three-quarter view). Never leave the camera unstated.

Rules:
- Preserve every subject, action, colour and spatial relationship the user stated.
- When the input already describes a scene, do not add objects, props, characters, animals or narrative actions it does not imply. Inventing what the subject is about to do, or a story around them, is the same failure as inventing a plot for it. This does NOT apply to a sparse input: filling in setting, light and texture around the user's subject is exactly the expand job, and is expected.
- Supplying the six elements above is NEVER "adding". Lighting, mood, colour palette, composition and texture are REQUIRED in every prompt, so writing them when the user did not is the job, not an invention — and neither is restating a technical term the user already gave you. What counts as invention is a new object, character, animal or action that was not there.
- Commit to ONE medium (photograph, oil painting, digital illustration, 3D render, …) and hold it for the whole paragraph. Never describe the same image as two different media.
- If the user names a medium ("photo of", "painting of", "3D render of"), honour it exactly. Never pivot to an easier medium.
- Do not over-specify a detailed input: where the user has already described something, do not pile on clothing, materials or colours they did not mention.
- Never use comma-separated keyword soup or weighting syntax like (word:1.5) or ++. They do not work on this encoder and distort the whole prompt.
- Use at most two style adjectives; stacking them muddies the output. Register labels ("candid", "amateur", "snapshot", "casual", "cinematic", "film still") are not style adjectives and do not count towards this.
- If the user wants text in the image, give the exact words in "double quotes".
- Do not sanitise, soften or moralise about what the user asked for. Render their intent.
- Length: between 60 and 180 words. Under 60 is too thin for this model; over 180 dilutes it.

Output ONLY the finished prompt, as one paragraph. No preamble, no explanation, no reasoning, no bullet points, no markdown, and no quotation marks around the whole thing.`,
    },
  },
};
