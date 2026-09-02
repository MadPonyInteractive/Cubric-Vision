/**
 * Recipe: Seedance 2.0 — text-to-video and image/elements-to-video.
 *
 * Synthesized from `dev-docs/recipe-research/seedance-2.0/research.md`.
 * STATUS: `draft` — NOT yet validated on the real model. Promotion to
 * `validated` runs through the MPI-6 playbook Phase 4 (hand-test on the
 * target model). Do not treat output as trusted until then.
 *
 * Two modes:
 *  - t2v: structured-tags, 8-part director order, inline-positive negatives.
 *  - i2v: timeline multi-shot, @tag multimodal reference system (up to 9
 *    images + 3 videos + 3 audio clips), Global Style block, multiScene=true.
 *
 * NOTE: Q7 example prompts were reconstructed after a NotebookLM rate-limit
 * using citations from other Q-answers and community-only sources — unverified
 * until Phase 4.
 */

export const seedance20 = {
  modelId: 'seedance-2.0',
  family: 'seedance',
  displayName: 'Seedance 2.0',
  status: 'draft',
  notes:
    'Physics-aware dual-branch diffusion transformer. t2v uses Subject→Action→Scene→Camera→Lighting→Style→Audio→Quality Suffix→Constraints order; i2v extends with @tag multimodal reference system (up to 9 images + 3 videos + 3 audio) and timeline multi-shot format. Mandatory quality suffix for every prompt. No official ByteDance docs in notebook — community-sourced only; flag for Phase 4. Q7 examples reconstructed after NotebookLM rate-limit — unverified until Phase 4.',
  modes: {
    t2v: {
      outputFormat: 'structured-tags',
      lengthNorm: '4–15 second clip; no hard word limit; 2–5 seconds per timeline segment',
      structureOrder: [
        'Subject (@tag if multimodal)',
        'Action (physics-aware verb)',
        'Scene / Atmosphere',
        'Camera (shot size + movement + angle)',
        'Lighting & Style',
        'Audio (adjectives)',
        'Quality Suffix',
        'Constraints',
      ],
      vocabulary: {
        physics: [
          'tires smoke as the car drifts 90 degrees',
          'silk fabric billows and ripples',
          'glass shatters on impact, fragments scattering outward',
          'fracture',
          'implode',
          'snap open',
          'splash',
          'clink',
          'ripple',
          'scatter',
        ],
        camera: [
          'dolly in',
          'dolly out',
          'pan left',
          'pan right',
          'tilt up',
          'tilt down',
          'tracking shot',
          '360-degree orbit',
          'crane up',
          'Steadicam glide',
          'handheld documentary style',
          'rack focus',
          'tripod stable',
          'smooth gimbal',
        ],
        cameraAngle: ['low angle', 'high angle', 'bird\'s eye', 'Dutch angle'],
        lens: ['35mm', 'anamorphic', 'macro', 'shallow depth of field', 'deep depth of field'],
        lighting: [
          'volumetric fog',
          'God rays',
          'lightning flashes',
          'backlight',
          'teal and orange cinematic grading',
          'golden hour',
          'tungsten lighting',
          'cyberpunk neon',
          'high contrast',
          'soft light',
          'harsh light',
          'flickering light',
          'film grain texture',
          'moody lighting',
        ],
        audio: [
          'reverb',
          'muffled',
          'echoing',
          'crunchy',
          'metallic clink of a coin',
          'boots on grass',
          'heavy thud',
          'rustling fabric',
          'sizzling',
          'crowd murmur',
        ],
        qualitySuffix: [
          '4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles.',
        ],
      },
      dos: [
        'Follow the exact 8-part structural order: Subject → Action → Scene → Camera → Lighting & Style → Audio → Quality Suffix → Constraints.',
        'Use physics-aware action verbs (tires smoke, glass shatters, fabric billows) — never vague motion words like "moves" or "becomes".',
        'Assign every uploaded @asset a specific role in the prompt (@Image1 as the first frame, @Video1 for camera motion reference).',
        'Implement timeline timestamps ([0s-4s]) for sequences longer than ~5 seconds.',
        'Include specific audio adjectives to trigger the native audio engine (reverb, metallic clink, crowd murmur).',
        'Always append the exact quality suffix string verbatim at the end of every prompt.',
        'Use only one camera movement per segment — never stack multiple camera moves.',
        'For character consistency, use a 3-still reference pack (front, three-quarter, profile) with neutral expressions and consistent lighting.',
      ],
      donts: [
        'Do not stack multiple camera movements in one shot segment.',
        'Do not use vague direction like "make it look cool" — the model will guess and produce generic output.',
        'Do not over-describe the face in text when a character @reference image is uploaded (causes the model to match the text category, not the face).',
        'Do not use contradictory framing terms ("close-up wide shot", "static tracking shot").',
        'Do not omit the quality suffix — its absence degrades consistency and stability.',
        'Do not assign more than one primary action per short segment to avoid "slideshowy" output.',
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        'A figure in a dark hoodie sprinting through rain-soaked neon-lit streets at midnight. Tires squeal as a vehicle fishtails behind. Handheld tracking shot at eye level, fast pace, anamorphic lens flare, cyberpunk neon lighting, 24fps film look. Rain impact on pavement, crowd gasps, distant sirens. 4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles.',
        'A bearded employee in a grey sweater sits at a modern brutalist office desk. He slams a stack of papers on the counter, motion weight with paper scattering outward. Static medium shot, overhead fluorescent lighting, cold blue tones, realistic gritty texture. Paper scraping sound, distant office hum. 4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles.',
        '@Image1 as the first frame. A boy in a blue jersey dribbling forward across a grass pitch. Medium tracking shot, warm afternoon sunlight, cinematic texture with film grain. Boots on grass, ball thud, crowd murmur. 4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles.',
      ],
      systemPrompt: `You are an expert Seedance 2.0 prompt engineer. Seedance 2.0 is a physics-aware, audio-visual video model that functions as a director's console. Your task: rewrite the user's idea into a precise, structured Seedance 2.0 text-to-video prompt.

Follow this exact structural order:
1. Subject — who or what, with physical detail (age, clothing, material). Add an @tag assignment if the user has uploaded reference media.
2. Action — one physics-aware verb per shot (tires smoke, glass shatters, fabric billows — not "moves" or "becomes").
3. Scene / Atmosphere — location, time of day, environment.
4. Camera — shot size (wide / medium / close-up) + movement (dolly in, tracking shot, 360-degree orbit) + angle (low / high / eye level).
5. Lighting & Style — cinematic look (film grain, teal-orange grade, golden hour, cyberpunk neon).
6. Audio — specific adjectives to trigger native audio engine (reverb, muffled, metallic clink of a coin, boots on grass, crowd murmur).
7. Quality Suffix — always append exactly: "4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles."
8. Constraints — any behavioral limits inline (no zoom, no warping, tripod stable, avoid hair lift).

Rules:
- One camera movement per shot — never stack camera moves in the same shot.
- Simulate real-world physics: use weight, friction, and momentum verbs; avoid soft generic motion words.
- If the input is too brief, invent 1–3 cinematic details per section to fill the structure. If too long, distill to one dominant subject, one action beat, one camera direction.
- Do not output introductory text, explanations, or any framing around the prompt.

Output ONLY the final prompt, ready to paste into Seedance 2.0.`,
      acceptsMedia: [],
      multiScene: false,
    },

    i2v: {
      outputFormat: 'timeline',
      lengthNorm: '4–15 seconds total; 2–5 seconds per segment; 3–5 segments recommended',
      structureOrder: [
        '@Asset assignments (each uploaded asset receives an explicit job)',
        'Timeline segments: [Xs-Ys] Shot type, single camera movement, subject action, audio cue',
        'Global Style block (applies across all shots)',
        'Quality Suffix',
      ],
      vocabulary: {
        atTags: [
          '@Image1 as the first frame',
          '@Image2 for character styling',
          '@Image3 for environment reference',
          '@Video1 for camera movement reference',
          '@Video2 for style reference',
          '@Audio1 to drive audio sync',
        ],
        timeline: [
          '[0s-4s]',
          '[4s-8s]',
          '[8s-12s]',
          'Shot 1:',
          'Cut to:',
          'Slow push-in',
          'Rack focus',
          'Snap cut',
        ],
        shotSize: ['wide shot', 'medium shot', 'close-up', 'extreme close-up'],
        cameraMove: [
          'dolly in',
          'dolly out',
          'tracking shot',
          'Steadicam glide',
          'tripod stable',
          'smooth gimbal',
          'crane up',
          '360-degree orbit',
        ],
        audio: [
          'reverb',
          'muffled',
          'echoing',
          'metallic clink',
          'boots on grass',
          'crowd murmur',
          'rustling fabric',
          'distant sirens',
        ],
        globalStyle: [
          'teal and orange cinematic grading',
          'golden hour warmth',
          '24fps film look',
          'volumetric fog',
          'high contrast noir',
          'film grain texture',
        ],
      },
      dos: [
        'Give every uploaded @asset an explicit, specific job before the timeline (e.g. "@Image1 as the first frame", "@Video1 for the camera movement reference").',
        'Use per-segment timestamps ([0s-4s], [4s-8s]) for every shot in the timeline.',
        'Include one camera movement per segment — never stack camera moves within the same timestamp.',
        'Include an audio cue per segment to drive the native audio engine.',
        'End the timeline with a Global Style block covering fps, color grade, and mood.',
        'Append the exact quality suffix after the Global Style block.',
        'Keep total segments to 3–5 to avoid overloading the model with conflicting direction.',
        'Scale shot size to escalate emotion: wide (context) → medium → close-up (emotional peak).',
      ],
      donts: [
        'Do not upload assets without assigning each one an explicit @tag role — untagged assets are ignored.',
        'Do not mix timeline timestamp format ([0s-4s]) and shot-label format (Shot 1:) in the same prompt.',
        'Do not stack multiple camera moves within a single segment timestamp.',
        'Do not omit the Global Style block — without it, visual consistency across shots degrades.',
        'Do not exceed 5 segments; overloaded timelines produce unpredictable or slideshowy output.',
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        '@Image1 as the first frame, @Image2 for character styling.\n[0s-4s]: Wide shot, slow dolly in, a boy in a blue jersey dribbling forward across a sunlit grass pitch, boots on grass, ball thud.\n[4s-8s]: Medium tracking shot, follows player at eye level, crowd murmur builds, warm afternoon light raking across the field.\n[8s-12s]: Close-up, tripod stable, face of the boy concentrating, shallow depth of field, crowd cheers in the distance.\nGlobal Style: golden hour warmth, 24fps film look, cinematic texture with film grain.\n4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles.',
        '@Image1 as the first frame, @Video1 for camera movement reference, @Audio1 to drive audio sync.\n[0s-5s]: Wide shot, Steadicam glide through rain-soaked neon-lit streets at midnight, figure in dark hoodie running, rain impact on pavement.\n[5s-10s]: Medium tracking shot, follows figure at eye level, tires squeal as vehicle fishtails behind, crowd gasps.\n[10s-15s]: Close-up, smooth gimbal, face of figure in hood, anamorphic lens flare, distant sirens echoing.\nGlobal Style: cyberpunk neon lighting, teal and orange cinematic grading, 24fps film grain.\n4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles.',
      ],
      systemPrompt: `You are an expert Seedance 2.0 timeline prompt director. Seedance 2.0 i2v accepts uploaded images, videos, and audio files as reference assets — up to 9 images (@Image1–@Image9), 3 videos (@Video1–@Video3), and 3 audio clips (@Audio1–@Audio3). Your task: translate the user's idea into a structured timeline prompt with @tag asset assignments and per-segment direction.

Structure (follow in this exact order):

[Asset assignments]
State what each uploaded file does, one per line before the timeline. Examples:
  @Image1 as the first frame
  @Image2 for character styling
  @Video1 for the camera movement reference
  @Audio1 to drive audio sync

[Timeline]
One segment per 2–5 seconds, format:
  [Xs-Ys]: [Shot type], [single camera movement], [subject action], [audio cue]
Limit to 3–5 segments total. Scale shot size to escalate emotion: wide → medium → close-up.

[Global Style]
One block applying across the whole clip:
  Global Style: [fps, color grade, mood, texture]

[Quality Suffix]
Always append exactly: "4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face and clothing consistency without distortion or high detail. Generate the video without subtitles."

Rules:
- Every uploaded asset MUST receive an explicit @tag job. Assets without an assigned role are ignored by the model.
- One camera movement per segment — never stack moves within the same timestamp.
- Do not mix timestamp format ([Xs-Ys]) and shot-label format (Shot 1:) in the same prompt.
- If the input is too brief, invent 2–3 logical progression beats (wide → medium → close-up). If too long, condense to 3–5 distinct camera beats.
- If no assets are provided, still write the timeline format using scene description rather than @tags.

Output ONLY the formatted timeline script, ready to paste into Seedance 2.0. No explanation, no preamble.`,
      acceptsMedia: ['image', 'audio', 'video'],
      multiScene: true,
    },
  },
};
