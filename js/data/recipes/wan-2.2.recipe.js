/**
 * Recipe: Wan 2.2 (text-to-video).
 *
 * Synthesized from `dev-docs/recipe-research/wan-2.2/research.md` (5 community
 * sources, research date 2026-06-22). The systemPrompt adapts the proven Wan 2.2
 * entry from `dev-docs/enhancer_prompts.md`, refined by the multi-source
 * research synthesis in Part B.
 *
 * Reworked under MPI-25 (the v1.0 general-only sweep): a research-backed
 * `wordBudget`, all four recipe jobs spelled out, the required-elements
 * carve-out, and the register pulled back from cinematic to what a skilled
 * camera operator would actually shoot. The systemPrompt used to instruct
 * "invent coherent CINEMATIC details" on a sparse input — theatrical by
 * default, on the model Vision routes its `wan` key to.
 *
 * STATUS: `draft` — NOT yet validated on the real model. Promotion to
 * `validated` runs through the MPI-6 playbook Phase 3 (hand-test on target
 * model by Fabio). Two Phase 3 items remain open: (1) motion-intensity
 * vocabulary that avoids slow-motion artifacts, (2) negative prompt behavior
 * under CFG=1 vs. standard CFG.
 *
 * Key architecture note: Wan 2.2 uses a dual-expert MoE. Prompt order is
 * structurally significant — early elements feed the high-noise (structure)
 * expert; late elements feed the low-noise (detail) expert. Do NOT reorder the
 * five-part sequence without Phase 3 evidence.
 *
 * VENDOR REWRITER READ, 2026-08-17 (MPI-27 step-0 survey). Alibaba ship their
 * own production prompt-rewriter in `Wan-Video/Wan2.2` —
 * `wan/utils/system_prompt.py` (+ `prompt_extend.py`, which maps task → system
 * prompt), pulled at HEAD via `gh api`. `T2V_A14B_EN_SYS_PROMPT` is the t2v
 * one. This is not documentation ABOUT prompting; it is the rewriter they ship,
 * so it outranks the five community guides this recipe was built from.
 *
 * Adopted here (all additive — no element was reordered):
 * - Closed value sets with defaults for the aesthetic slots, and a cap of FOUR
 *   per prompt. Defaults: Day time when unstated, Center composition, Medium or
 *   Wide shot.
 * - THE RULE THIS RECIPE LACKED: if the input already describes camera
 *   movement, do NOT add a shooting angle. The two fight each other.
 * - Style handling: add no style when the user named none, and for a 2D /
 *   illustration style drop the cinematic aesthetics entirely rather than
 *   layering film language over a drawing. The third half of the vendor's rule
 *   — a named style goes FIRST — is NOT adopted, because it belongs to the
 *   ordering conflict left open at the bottom of this comment; adopting it
 *   alone would have put a `dos` ("style first") straight into a fight with the
 *   `dos` beside it ("lighting and style tags at the end"), which is MPI-16's
 *   recurring bug class.
 * - No literary description of atmosphere or feeling — stated outright by the
 *   vendor, and a sharper version of the "generic quality words" rule already
 *   here.
 * - When the input contains no action, add one, and give the background motion
 *   of its own (drifting cloud, wind in leaves). A still prompt is a still video.
 * - Sky described as deep blue, to avoid a blown-out exposure.
 *
 * Read and deliberately NOT adopted:
 * - Rules 8, 9 and 10 replace an input the vendor deems sexual, "bikini", or
 *   same-sex-affectionate with a different, unrelated prompt — silently. We
 *   reject all three: they break THE SUBJECT IS FIXED, our enhancer LLM is
 *   deliberately uncensored (playbook 05), and rule 10 is discrimination we
 *   will not ship. Recorded so nobody "discovers" them again as vendor truth.
 * - The vendor's length target is 60–200 CHINESE CHARACTERS. That unit does not
 *   convert to our `wordBudget`, and its own English examples run ~60–90 words,
 *   inside our range. Unchanged. (The encoder is umT5-XXL with `text_len = 512`
 *   in `wan/configs/shared_config.py`, so ~150 words has plenty of headroom —
 *   the budget is style, not a wall.)
 * - The i2v rewriter (100-word cap, dynamic content only, static description
 *   REMOVED because the image already carries it) is real and useful, but this
 *   recipe is t2v-only. Recorded in `sources.md` for the i2v mode work.
 *
 * OPEN CONFLICT, for Fabio's Stage 2 — do not silently resolve it: every one of
 * the vendor's four examples LEADS with the aesthetic tag cluster ("Edge
 * lighting, medium close-up shot, daylight, left-heavy composition. A young
 * girl…"), and so do all three `examplePrompts` below. Element 6 and the
 * matching `dos` line say the opposite — lighting and style go LAST, for the
 * low-noise expert. That claim comes from a community synthesis doc, not from
 * Alibaba, and the recipe has been internally inconsistent about it since it
 * was written. It is left alone here because reordering is exactly what the
 * note above forbids without a render, and because our target is a CVTI
 * smooth-mix rather than base Wan 2.2. It needs a render to settle.
 */

export const wan22 = {
  modelId: 'wan-2.2',
  family: 'wan',
  displayName: 'Wan 2.2',
  status: 'draft',
  notes:
    'TARGET IS A COMMUNITY MIX, NOT BASE WAN 2.2 (Fabio, 2026-08-05): the family '
    + 'runs a CVTI smooth-mix build, so base-model prompting research may not '
    + 'transfer exactly. Combined with Wan being displaced (LTX first, now '
    + 'MiniMax H3), v1.0 deliberately accepts "produces a good prompt" here '
    + 'rather than a tuned one — the bar is no errors and nothing that is not '
    + 'part of a prompt. Most real use is i2v, which this recipe does not yet '
    + 'cover (t2v only). '
    + 'Dual-expert MoE architecture; prompt order is structurally significant ' +
    '(high-noise expert reads early elements, low-noise reads late elements). ' +
    'Negative prompt field is disabled at CFG=1 (Lightning deployments) — use ' +
    'inline positive constraints in those cases. All 5 research sources are ' +
    'community guides; no official Alibaba/DAMO docs present. Phase 3 must ' +
    'verify: motion-intensity vocabulary, negative prompt behavior under CFG=1 ' +
    'vs. standard CFG, and multi-subject cast control.',
  modes: {
    t2v: {
      outputFormat: 'structured-tags',
      lengthNorm: '80–120 words; 150 hard',
      // The systemPrompt instructs 80–120 (the range in
      // `dev-docs/recipe-research/wan-2.2/research.md`); the contract is wider
      // at both ends to absorb the spread, the same relationship proven on
      // krea-2 and chroma. Do NOT align the two numbers.
      //
      // FLOOR LOWERED 60 -> 50 by Fabio, 2026-08-05. The reasoning stays here
      // because playbook 7.1 rung 3 requires a loosened number to be auditable.
      // The research doc claims prompts "under 60 words" leave the MoE's
      // structural expert under-specified so it hallucinates subjects, and the
      // floor was set to 60 on that basis. Seven Stage 1 iterations later the
      // `bare` tier still failed ~20% of runs at 58–59 words — and Fabio's
      // field experience contradicts the claim outright: **very basic prompts
      // work well on Wan 2.2, especially i2v, which is how most people use
      // it.** A community guide loses to the person who ships renders with it.
      //
      // 50 is not "no floor". It still catches what Fabio actually cares about
      // — output that is broken or is not a prompt at all — while allowing the
      // short, clean expansion a one-word input legitimately produces.
      //
      // No corpus exists for Wan — `dev-docs/recipe-research/_corpus/` covers
      // Chroma, Krea 2 and the candid set only. If a Civitai corpus run ever
      // happens for this family, re-measure and replace these numbers.
      wordBudget: { min: 50, max: 150 },
      structureOrder: [
        'Cast and count',
        'Setting and time',
        'Camera behavior and framing',
        'Action timeline',
        'Motion boundaries (positive constraints)',
        'Visual style and lighting tags',
      ],
      vocabulary: {
        camera: [
          'slow push-in',
          'dolly out',
          'pan left',
          'tilt up',
          'orbital arc',
          'crane up',
          'tracking shot',
          'static camera',
          'medium close-up shot',
          'establishing shot',
          'low angle shot',
          'over-the-shoulder shot',
          'wide-angle lens',
          '35mm look',
          'shallow depth of field',
          'bokeh',
        ],
        motion: [
          'slowly turns head',
          'walks deeper into',
          'spins gracefully',
          'subject sniffs a flower then jumps back',
          'remains seated the entire time',
          'does not stand up',
          'no other people enter the frame',
          'camera does not move',
          'no zoom, no pan',
          'natural walking pace',
        ],
        lighting: [
          'volumetric dusk',
          'golden-hour backlight',
          'edge lighting',
          'soft diffused overcast',
          'firelight',
          'rim lighting',
          'high contrast',
          'silhouette lighting',
          'cinematic grade',
          'warm colors',
          'blue hour',
          'soft sea fog',
        ],
        style: [
          'photorealistic',
          'cinematic',
          'film grain',
          '35mm look',
          'high detail',
          'clean single shot',
          'left-weighted composition',
          'color grade',
        ],
      },
      // dos/donts ARE the grading contract — rendered verbatim into
      // `judgePrompt()` as "Must do" / "Must never", never seen by the enhancer.
      // They were updated in the SAME edit as the systemPrompt when Alibaba's
      // own rewriter landed (MPI-27, 2026-08-17). Playbook 07 §7.3.
      dos: [
        'Over-specify: use 80–120 words to lock the structural expert into a concrete layout.',
        'State cast and count explicitly at the very start ("one woman, alone in frame").',
        'Use concrete sequential actions in the action timeline instead of vague motion verbs.',
        'Give the scene motion even when the input has none — the subject acts, and the background moves with it (drifting cloud, wind through leaves).',
        'Weave motion boundaries into the main prompt using positive phrasing ("the subject remains seated; the camera does not move").',
        'Use film-industry camera terminology (shot size, lens, movement) early in the prompt to establish the 3D coordinate system.',
        'Pick at most four aesthetic settings, each from the vendor value sets (time, light source, intensity, angle, colour tone, shot size, shooting angle, composition).',
        'Default to Day time when the input does not say, to Center composition, and to a Medium or Wide shot.',
        'Place lighting and style tags at the end where the low-noise expert processes them.',
        'Anchor time of day and environment in the setting element to maintain background coherence throughout the clip.',
        'Include explicit camera lock ("camera does not move") or explicit camera direction to prevent random cuts.',
        'Describe sky as deep blue, to hold the exposure.',
      ],
      donts: [
        'Don\'t leave a prompt thin — the research warns that under ~60 words the MoE fills gaps with generic tropes. The accepted floor is 50 (Fabio, 2026-08-05: basic prompts do work well on this model), so treat 60 as the target and 50 as the hard edge.',
        'Don\'t rely on the negative prompt box if running a Lightning or CFG=1 workflow.',
        'Don\'t use vague motion verbs ("walks," "moves") without specifying pace and sequential action.',
        'Don\'t omit camera framing — absence defaults to random shot changes.',
        'Don\'t add a shooting angle when the input already describes camera movement.',
        'Don\'t add a style the user did not ask for, and don\'t add cinematic aesthetics to a 2D or illustration style.',
        'Don\'t place lighting and style information at the start of the prompt.',
        'Don\'t write literary description of atmosphere or feeling ("the frame brims with life", "a formal mood pervades").',
        'Don\'t describe abstract emotions without grounding them in observable physical action.',
        'Don\'t script simultaneous complex actions for multiple subjects without explicit sequencing.',
        'Don\'t leave subject count ambiguous — extra subjects will be hallucinated.',
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        'Left-weighted composition, over-the-shoulder shot, close-up, medium lens, soft lighting, low contrast, overcast. A single woman walks through an outdoor garden. She wears a light dress; her hair is pinned up. Her expression is focused, gaze directed ahead. As the scene progresses she turns her head slowly, observing the surroundings. The background is a manicured garden with neat hedges and distant sculptures. The entire composition conveys quiet concentration. No other people are present; the camera does not move.',
        'Silhouette lighting, dusk, mixed warm colors, wide establishing shot, high contrast. One runner moves through changing terrain — desert sand dunes give way to a rocky mountain path. The camera pans slowly right as the runner transitions between environments. He steadies himself with his hands on rocks; his pace is deliberate. The background shifts from rolling dunes to steep peaks. The runner stays centered; camera movement is smooth with no abrupt cuts. No additional subjects enter the frame.',
        'Coastal lighthouse at blue hour, slow dolly-in, soft sea fog, cinematic grade, 35mm look. The lighthouse stands at the edge of a rocky cliff. Waves crash slowly beneath it. The dolly-in brings the structure gradually closer, revealing worn stonework and a warm light inside the lamp room. No people are present. Camera moves at a constant slow pace with no zoom or pan.',
      ],
      systemPrompt: `You are an expert prompt engineer and video generation specialist for the Wan 2.2 video model. Wan 2.2 uses a dual-expert Mixture-of-Experts (MoE) architecture: a high-noise expert handles global structure, camera motion, and scene layout; a low-noise expert handles fine details, textures, and lighting. Because prompt order maps directly onto which expert processes each element, you must follow the exact five-part sequence below — reordering it defeats the routing.

Your task: take the user's raw input — whether a bare fragment or an overlong description — and rewrite it into a single, perfectly structured Wan 2.2 prompt.

TWO RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED. Whatever the user named is what the video is of. If the input is a single word, that word IS the subject — "cat" means a cat, and your output must show a cat. Never replace it, never upgrade it to something grander or more impressive, never drift to a different animal, object or scene.
2. LENGTH: write SIX SENTENCES — one for each element of the six-part sequence below — and STOP AT THE SIXTH FULL STOP. Each one runs about twenty words, so the whole prompt lands at 80–120 words. The SAME six sentences whatever length the input was: a one-word input and a four-hundred-word brief both come out as six. A seventh sentence means you kept too much. Falling short of 60 words is equally a failure — a thin prompt leaves the structural expert to invent subjects you did not ask for. So every one of the six sentences carries real, observable content: name materials, colours, distances, times of day, camera gear, body movements. Generic quality words ("beautiful", "high quality", "soft and natural") fill the sentence without filling the frame, and waste a twenty-word budget. This holds for every job below, whether you are expanding two words or condensing four hundred.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it into a full scene. Fill in the setting, camera, action steps and light that serve the subject the user named — concrete and observable, never a different or more photogenic subject.
- Detailed but disordered: REARRANGE it into the six-part sequence below. Every choice the user already made — the action they described, lens, shot size, angle, camera move, time of day, colour, mood — must survive into your output. Every technical term they wrote must still appear. Dropping one is a failure.
- Longer than 120 words: CONDENSE it — and the way to do that is NOT to shorten the input. Read it once and note only the cast, the setting, the camera, and the two or three actions that genuinely change the shot. Then SET THE INPUT ASIDE and write a brand-new prompt from those notes, exactly as you would if the user had typed two lines. Never walk the input clause by clause keeping what you pass — that is what makes the output too long. Drop generic quality-spam ("8k", "masterpiece", "cinematic masterpiece", "extremely detailed") and every repetition. Then write the six sentences from those notes, never a rambling chain of clauses. A long brief will not fit in six sentences, and that is the point: keep what most changes the shot and throw the rest away, including detail you like. Discarding real detail IS the condense job, not a mistake.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it in terms the model understands. Resolve it — never copy the confusion through, and never silently drop it.

Over-specification: lack of detail causes the high-noise expert to hallucinate subjects or default to generic tropes. Over-specify every element — with concrete, observable specifics (what is there, how it moves, how it is lit), not with grandeur.

Supplying the six elements below is NEVER "adding". Cast, setting, camera, action, motion boundaries and lighting are REQUIRED in every prompt, so writing them when the user did not is the job, not an invention — and neither is restating a technical term the user already gave you. What counts as invention is a new character, object or event that was not there. This does not restrict the expand job on a sparse input, where filling in the scene around the user's subject is exactly what is wanted.

Register: aim for what a skilled camera operator would actually shoot — deliberate, plainly lit, plausible. Do not reach for theatrical film-grade drama unless the user asked for it. If they do ask for cinematic treatment, give it to them fully.

Write what a camera records, never what the picture feels like. "The frame brims with life and tension", "a formal atmosphere pervades the room", "the mood is one of quiet triumph" — none of that reaches the model as anything; it is literary description of atmosphere, and it costs you words you needed for what is actually there.

Prompt structure — follow this order exactly. Each numbered element below lists the things it must NAME. Name every one of them, specifically, rather than gesturing at them: "one woman, alone in frame" names the cast, "a person" does not. That is what fills a twenty-word sentence, and it is why even a one-word input still yields a full prompt — you are not padding, you are answering six questions completely.

1. Cast and count — state the exact number of subjects at the very start (e.g., "Exactly one woman, alone in frame"). Ambiguity here is the primary cause of hallucinated extra characters.

2. Setting and time — physical environment, weather, and time of day (e.g., "overcast morning, lush city park"). This anchors background coherence throughout the clip. If the user did not say when it happens, it is day time. If sky is in the shot, it is deep blue — that phrasing holds the exposure where "bright sky" blows it out.

3. Camera behavior and framing — shot size, angle, lens, and movement using film-industry terminology (e.g., "static camera, eye-level medium shot," "slow dolly-in"). Providing this early gives the high-noise expert a 3D coordinate system and prevents geometric instability. Shot size comes from this set: medium shot, medium close-up shot, wide shot, medium wide shot, close-up shot, extreme close-up shot, extreme wide shot — and if the user gave you nothing to go on, it is a medium shot or a wide shot. A shooting angle — over-the-shoulder, low angle, high angle, Dutch angle, aerial, overhead — is optional and CONDITIONAL: if the input already describes the camera moving, do not add one at all. A move and an angle fight each other, and the move is the one the user asked for.

4. Action timeline — describe the primary action as a tiny story: concrete sequential steps rather than vague verbs. Instead of "she walks," write "she steps forward, glances left, then crouches to pick up the bag." If the input names no action at all, give it one that suits the subject, and give the background its own small motion as well (cloud drifting, wind moving through leaves, water rippling) — a prompt with nothing moving in it produces a video with nothing moving in it.

5. Motion boundaries (positive constraints) — state what must NOT happen using positive phrasing inside the main prompt, not in a separate negative field. At CFG=1 (Lightning deployments), the negative prompt box is ignored. Example: "The two people remain seated the entire time; no other characters enter the frame; the camera does not zoom."

6. Visual style and lighting tags — aesthetic descriptors, lighting type, color grade, and mood go last, where the low-noise expert processes them (e.g., "overcast daylight, neutral grade, muted colors, film grain"). Name the light that is actually in the scene rather than reaching for a signature look. Choose AT MOST FOUR settings in total, each from these sets: light source — daylight, artificial lighting, moonlight, practical lighting, firelight, fluorescent lighting, overcast lighting, sunny lighting; intensity — soft lighting or hard lighting; angle — top lighting, side lighting, underlighting, edge lighting; colour tone — warm colors, cool colors, mixed colors; composition — center, balanced, right-heavy, left-heavy, symmetrical or short-side composition, defaulting to center. Four chosen deliberately beat nine listed. A named art style belongs here only if the user asked for one: never invent a style, and if the style they asked for is 2D — anime, illustration, cel-shaded, claymation — then drop the cinematic aesthetics entirely, because film-grade lighting language does not describe a drawing.

Output format: provide ONLY the finalized 80–120 word prompt, ready to copy and paste directly into Wan 2.2. No preamble, no explanation, no markdown wrapper around the output.`,
    },
  },
};
