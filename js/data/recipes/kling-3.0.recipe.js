/**
 * Recipe: Kling 3.0 (text-to-video + image-to-video).
 *
 * Synthesised from `dev-docs/recipe-research/kling-3.0/research.md`.
 * STATUS: `draft` — NOT validated on the real model. Promotion to `validated`
 * requires MPI-6 Phase 4 hand-testing on real Kling 3.0 output by Fabio.
 * Do NOT treat output as proven until then.
 *
 * t2v: full 5-layer cinematic prose (Scene→Characters→Action→Camera→Audio/Style),
 *      native multi-shot (2–6 scenes, up to 15s), separate negative-prompt field,
 *      motion intensity 0.1–1.0 scale, native audio.
 * i2v: camera-first frame-based animation — describes ONLY what evolves from the
 *      anchor image; never re-states subject. Accepts image/audio/video references.
 *      multiScene: false (frame-based primary; timecode multi-shot is advanced).
 *
 * NOTE: no official Kuaishou documentation in research sources — all guidance is
 * community/platform deep-dives. Extra caution warranted in Phase 4 validation.
 */

export const kling30 = {
  modelId: 'kling-3.0',
  family: 'kling',
  displayName: 'Kling 3.0',
  status: 'draft',
  notes:
    'VCoT reasoning engine; separate negative-prompt field; motion intensity 0.1–1.0 scale; native audio/lip-sync. t2v supports multi-shot (2–6 scenes, up to 15s); i2v is frame-based (anchor image → motion interpolation, multiScene: false). WARNING: no official Kuaishou docs in research notebook — all guidance is community/platform sources only; treat as unproven until Phase 4 real-model validation.',
  modes: {
    t2v: {
      outputFormat: 'prose',
      lengthNorm: '150–250 words',
      structureOrder: [
        'Scene — location, time of day, atmospheric lighting',
        'Characters / Elements — unique labels and fixed physical traits',
        'Action — sequential steps (beginning → middle → end) with cinematic verbs',
        'Camera — ONE shot type + ONE movement per shot; timecodes for multi-shot',
        'Audio & Style — dialogue labels, SFX cues, filmic aesthetic',
      ],
      vocabulary: {
        camera: [
          'dolly push-in',
          'slow tracking shot',
          'whip-pan',
          'crane shot',
          'handheld drift',
          'rack focus',
          'crash zoom',
          'snap focus',
          'shoulder-cam drift',
          'robotic arm control',
          'continuous circular orbit',
          'macro 85mm lens',
          'wide-angle steadicam',
          'anamorphic lens flare',
          '35mm film aesthetic',
        ],
        motion: [
          'heel-first steps',
          'fabric sway',
          'speed ramp',
          'lateral pass',
          'explosive strides',
        ],
        microMotion: [
          'breathing',
          'blinking',
          'drifting dust',
          'steam rising',
          'broth splattering',
          'condensation forming',
          'leaves swirling',
          'hair drifting',
        ],
        intensityScale: [
          '0.1–0.3: subtle / micro-motion (hair sway, breathing, steam)',
          '0.4–0.6: natural / standard (walking, gesturing, pouring)',
          '0.7–1.0: dynamic / kinetic (sprinting, dancing, striking)',
        ],
        lighting: [
          'golden hour',
          'soft diffused natural light',
          'hard directional studio lighting',
          'cool blue refrigerator glow',
          'neon-lit',
          'flickering fluorescent',
          'soft box',
        ],
        style: [
          '35mm film grain',
          'shallow focus',
          'glowing bokeh',
          'muted pastel tones',
          'cinematic',
          '24fps film look',
          'anamorphic ratio',
        ],
        audio: [
          'SFX: ambient café chatter',
          'SFX: refrigerator hum',
          'SFX: rain tapping on glass',
          'SFX: paper scraping',
        ],
      },
      dos: [
        'Write the full prompt as flowing cinematic prose — Kling processes director intent, not keyword bags.',
        'Open with Scene (location, time of day, lighting) to spatially anchor the model before introducing characters.',
        'Assign every character a unique label ([Character A: description]) and keep descriptors identical across all shots to prevent identity drift.',
        'Break action into temporal steps (beginning → middle → end) using specific cinematic verbs (heel-first steps, fabric sway, speed ramp) — never "moves" or "goes".',
        'Include a motion intensity value (0.1–1.0) for every significant action.',
        'Assign ONE shot type and ONE camera movement per shot; for multi-shot sequences use explicit timecodes (Shot 1 (0–5s): …).',
        'Integrate dialogue as [Character A: tone]: "text" and sound effects as SFX: notation.',
        'Always append a separate Negative Prompt block listing artifact classes to suppress.',
      ],
      donts: [
        'Never send keyword lists — Kling lacks the parser for bag-of-words prompts and produces static or incoherent motion.',
        'Never use pronouns for character attribution — always use the assigned label.',
        'Never vary a character\'s physical descriptors between shots, even slightly ("red jacket" → "crimson coat" causes the model to reinterpret the identity).',
        'Never stack multiple camera movements in one shot ("pan and zoom and dolly" confuses the model).',
        'Never request physics-defying actions or overcrowd a clip with too many independent complex motions.',
        'Never leave the motion endpoint undefined — the model needs a clear physical resolution or generation may hang.',
        'Never omit the Negative Prompt block; doing so reliably increases artifact rates.',
      ],
      negativeHandling: 'separate-field',
      examplePrompts: [
        'A narrow ramen stall glows with magenta neon late at night. Two patrons sit together beneath the flickering sign. Steam rises slowly from their bowls, motion intensity 0.3; broth shifts softly with each small movement. Static tripod framing. Their faces catch the red neon light. Shot on 35mm film, shallow focus, glowing bokeh.\nNegative Prompt: morphing textures, flickering, extra limbs, distorted faces, background shifting.',
        'A dance studio, soft diffused daylight from one side. A ballerina in a white tutu and pointe shoes holds a slow arabesque on the wooden floor, motion intensity 0.4; her tutu sways gently at the edges. Static medium shot from eye level, mirrored wall behind. Muted pastel tones, artistic photography aesthetic.\nNegative Prompt: motion blur, warped limbs, flickering, low quality.',
        'A dim kitchen, late night, lit by cool refrigerator glow and a flickering fluorescent bulb. [Character A: exhausted husband in a grey sweater] and [Character B: businesswoman in a black jacket].\nShot 1 (0–5s): Static medium two-shot. The husband presses a stack of documents onto the counter, motion intensity 0.7. SFX: paper scraping. [Character A: strained voice]: "We cannot keep delaying this."\nShot 2 (5–10s): Slow dolly push-in toward the woman\'s face. She draws her arms across her chest, motion intensity 0.4. [Character B: measured, tight]: "I am handling it." SFX: refrigerator hum.\nNegative Prompt: identity drift, extra fingers, warped hands, flickering, foot sliding.',
      ],
      systemPrompt: `You are an expert Kling 3.0 Text-to-Video Prompt Engineer.

Kling 3.0 uses Visual Chain-of-Thought (VCoT) reasoning — it interprets cinematic intent, not keyword lists. Write every prompt as flowing prose that reads like a director's shooting instruction.

STRUCTURE — always follow this five-layer order:
1. Scene: location, time of day, atmospheric lighting (the spatial anchor that grounds physics).
2. Characters/Elements: unique identity labels [Character A: description]. Keep descriptors identical across all shots — even a minor variation causes the model to reinterpret the character.
3. Action: movement broken into sequential steps (beginning → middle → end). Use explicit cinematic verbs (heel-first steps, fabric sway, speed ramp, explosive strides). Never write "moves" or "goes".
4. Camera: ONE shot type + ONE movement per shot (e.g. "Static tripod medium shot", "Slow dolly push-in"). For multi-shot sequences, label each with a timecode: "Shot 1 (0–5s): …"
5. Audio & Style: dialogue as [Character A: tone]: "text"; sound effects as SFX:; filmic aesthetic (35mm grain, bokeh, muted palette).

MOTION INTENSITY: include a numeric value 0.1–1.0 for every significant action.
- 0.1–0.3: subtle micro-motion (breathing, dust drifting, steam rising, hair swaying)
- 0.4–0.6: natural motion (walking, gesturing, pouring)
- 0.7–1.0: dynamic/kinetic (running, dancing, striking, explosive movement)

LENGTH: target 150–250 words. A well-structured 200-word prompt outperforms a vague 20-word one.

OUTPUT FORMAT:
- Main prompt: cinematic prose following the 5-layer structure above.
- Negative Prompt: a separate keyword block listing artifact classes to suppress — morphing textures, warped limbs, extra fingers, distorted faces, flickering, foot sliding, background shifting, floating objects.

HARD RULES:
- Never use keyword lists.
- Never use pronouns for characters — always use the assigned label.
- Never stack multiple camera movements in a single shot.
- Never describe physics-defying actions.
- Always define a clear motion endpoint.
- Always include the Negative Prompt block.

When the user provides an idea, transform it into a complete Kling 3.0 t2v prompt. Short ideas: expand with high-quality cinematic context (lighting, texture, motion detail). Complex ideas: condense into 1–3 well-structured shots with timecodes. Output only the finished prompt (main + Negative Prompt block) — no preamble, no markdown wrapper.`,
      acceptsMedia: [],
      multiScene: true,
    },

    i2v: {
      outputFormat: 'prose',
      lengthNorm: '80–150 words',
      structureOrder: [
        'Camera movement — the opening directive that defines how the anchor frame animates',
        'Scene evolution / micro-motions — what physically changes from the anchor image',
        'Motion intensity — numeric value for every evolving element',
        'Cinematic texture / lighting detail — preserve or direct ambient environment',
        'Audio & Style — optional SFX and dialogue if needed',
      ],
      vocabulary: {
        camera: [
          'slow dolly push-in',
          'cinematic tracking shot from behind',
          'macro pull-back',
          'gentle crane lift',
          'handheld shoulder-cam drift',
          'static tripod hold',
          'rack focus',
          'wide-angle steadicam',
        ],
        microMotion: [
          'breathing',
          'hair drifting',
          'sweat beading',
          'leaves swirling',
          'dust particles drifting',
          'steam rising',
          'condensation spreading',
          'fabric edge swaying',
        ],
        intensityScale: [
          '0.1–0.3: micro-motion (breathing, hair drift, steam, dust)',
          '0.4–0.6: natural motion (walking, gesturing)',
          '0.7–1.0: dynamic motion (sprinting, impact, dramatic gesture)',
        ],
        anchorPreservation: [
          'maintain [detail] exactly as in the anchor',
          'preserve the signage',
          'keep the texture consistent',
        ],
      },
      dos: [
        'Open with a precise camera movement directive — this sets the animation\'s visual energy and is the single most important line.',
        'Describe only what EVOLVES from the anchor image: camera motion, micro-motions, atmospheric changes — never the static subject.',
        'Include a motion intensity value (0.1–1.0) for every element that moves.',
        'Explicitly name any anchor details (signage, textures, props) that must not drift during generation.',
        'Keep prose concise — 80–150 words. The anchor image establishes subject and environment; the prompt only directs change.',
        'Add audio using SFX: notation or dialogue with character labels if audio is needed.',
        'Always append a separate Negative Prompt block focused on anchor-preservation failures.',
      ],
      donts: [
        'Never re-describe the anchor image subject — this wastes token budget and can override the visual anchor, causing the model to reinterpret it.',
        'Never establish a new scene or location that contradicts what is in the anchor image.',
        'Never use vague motion verbs — be specific about exactly what physically changes and how.',
        'Never omit the motion intensity value for moving elements.',
        'Never stack multiple camera movements in a single shot.',
        'Never describe structural transformations that would require the anchor image to change in ways incompatible with frame interpolation.',
      ],
      negativeHandling: 'separate-field',
      examplePrompts: [
        'Cinematic tracking shot following from behind. The man takes slow, deliberate steps forward, motion intensity 0.5. Autumn leaves drift and swirl around his feet; warm golden-hour light catches dust particles drifting in the air, motion intensity 0.2. Shot on 35mm film, shallow focus, glowing bokeh behind.\nNegative Prompt: floating walk, foot sliding, background shifting, morphed limbs, flickering.',
        'Slow dolly push-in toward the subject. Breath is barely visible in the cool air, motion intensity 0.1. The fabric of the coat shifts gently at the hem, motion intensity 0.2. Soft diffused natural light maintains the even tone of the anchor. Maintain the lettering on the shop window exactly.\nNegative Prompt: identity drift, sign morphing, background shifting, extra limbs.',
      ],
      systemPrompt: `You are an expert Kling 3.0 Image-to-Video (Frame) Prompt Engineer.

In i2v mode the user provides an anchor image. The model animates FROM that image using VCoT frame interpolation. Your job is NOT to describe the subject — the image already establishes that. Your job is to direct how the scene EVOLVES: camera movement, micro-motions, environmental changes, and temporal flow.

RULES:
1. Camera first: open with a precise camera directive that defines the animation's visual energy (e.g. "Slow dolly push-in", "Cinematic tracking shot from behind", "Macro pull-back"). This is the most important line.
2. Evolve, don't re-describe: focus entirely on what changes (sweat beading, leaves swirling, steam rising, dust drifting, fabric swaying). Never state the subject's appearance — the anchor image owns that.
3. Motion intensity: include a numeric value (0.1–1.0) for every evolving element.
   - 0.1–0.3: micro-motion (breathing, hair drift, steam, dust)
   - 0.4–0.6: natural motion (walking, gesturing)
   - 0.7–1.0: dynamic (sprinting, impact, dramatic gesture)
4. Preserve anchor detail: if specific text, textures, or props in the anchor image must not drift, name them explicitly as anchors to maintain.
5. Audio (optional): add dialogue as [Character A: tone]: "text" or sound effects as SFX: if audio output is needed.
6. Keep it concise: 80–150 words. Precise, directed prose — not an essay.

OUTPUT FORMAT:
- Main prompt: camera-first evolution prose following the rules above.
- Negative Prompt: floating motion, foot sliding, background morphing, identity drift, anchor-image reinterpretation, extra limbs, flickering textures.

HARD RULES:
- Never re-describe what is already in the anchor image.
- Never contradict the anchor scene or location.
- Never stack camera movements.
- Always include the Negative Prompt block.

When the user provides an idea or image description, produce a complete Kling 3.0 i2v prompt that animates the anchor naturally. If only a simple idea is given, invent high-quality cinematic context for the evolution. Output only the finished prompt (main + Negative Prompt block) — no preamble, no markdown wrapper.`,
      acceptsMedia: ['image', 'audio', 'video'],
      multiScene: false,
    },
  },
};
