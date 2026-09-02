/**
 * Draft recipe: Seedance 1.5 (text-to-video).
 *
 * Synthesized from `dev-docs/recipe-research/seedance-1.5/research.md`.
 * STATUS: `draft` — NOT yet validated on the real model. Promotion to
 * `validated` runs through the MPI-6 playbook Phase 3 (hand-test on the target
 * model). Do not treat its output as trusted until then.
 *
 * Seedance 1.5 uses a mandatory four-layer structured format: Subject & Action,
 * Key Sound Event (in double quotes), Environmental Audio Cues, Visual Style.
 * The model's dual-branch diffusion transformer renders audio and video
 * simultaneously in the same latent space — audio layers are not optional.
 *
 * Phase-3 must confirm: (1) whether 1.5 accepts a reference image as input
 * (currently treated as t2v only), (2) any hard token ceiling, (3) whether
 * cinematic camera-move vocabulary has any effect on 1.5 output.
 */

export const seedance15 = {
  modelId: 'seedance-1.5',
  family: 'seedance',
  displayName: 'Seedance 1.5',
  status: 'draft',
  notes:
    'Dual-branch diffusion transformer; audio and video generated simultaneously in one latent space. Four-layer format is mandatory. No negative prompt field — use positive specificity throughout. No cinematic camera-move vocabulary documented; camera control limited to API params (camera_fixed, aspect_ratio). Draft until Phase-3 validation on real model output.',
  modes: {
    t2v: {
      outputFormat: 'structured-tags',
      lengthNorm: '4–12 second clip; no hard word limit — specificity matters more than length',
      structureOrder: [
        'Primary Action/Subject',
        'Key Sound Event (in quotes)',
        'Environmental Audio Cues',
        'Visual Style and Mood',
      ],
      vocabulary: {
        camera: ['camera_fixed', 'aspect_ratio', 'quick zoom in', 'temporal markers'],
        motion: [
          'striding confidently',
          'executing pirouettes',
          'chopping rapidly',
          'striking rhythmically',
          'settling',
          'rising visibly',
          'tapping',
        ],
        lighting: [
          'golden hour cinematography',
          'lightning flashes',
          'sunrise',
          'mist rising',
          'Gothic atmosphere',
        ],
        audioKey: [
          'cracking',
          'pelting',
          'howling',
          'sizzling',
          'clicking rhythmically',
        ],
        audioAmbient: [
          'footsteps on marble',
          'jury shifting',
          'traffic sounds',
          'orchestral music swelling',
          'birds beginning morning chorus',
        ],
      },
      dos: [
        'Always use the four-layer structure: Subject & Action, "Key Sound Event", Environmental Audio Cues, Visual Style.',
        'Enclose Layer 2 (dialogue or key sound event) in double quotes — this signals the model to synchronize audio and video at frame-level precision.',
        'Be highly specific about subject, action, and all audio cues; vague descriptions produce generic, audio-visually misaligned output.',
        'Use Action Sequencing (comma-separated verbs in Layer 1) to convey temporal progression within the clip.',
        'List 2–4 comma-separated background sounds in Layer 3 for a rich ambient soundscape.',
        'Describe only what should happen — express all intent positively.',
      ],
      donts: [
        'Do not write vague descriptions ("a person walking in a city") — specificity is mandatory.',
        'Do not omit Layer 2 audio — Seedance 1.5\'s core capability is simultaneous audio-video generation; leaving it empty wastes the model.',
        'Do not combine contradictory audio-visual instructions (e.g. "peaceful garden" + "loud rock concert") — they produce unpredictable artifacts, not an error.',
        'Do not skip Layer 3 ambient cues — the soundscape will be hollow and artificial.',
        'Do not use negative phrasing — there is no negative prompt field; negative intent must be replaced with precise positive description.',
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        'Defense attorney striding to the jury box, "Ladies and gentlemen, reasonable doubt isn\'t just a phrase — it\'s the foundation of justice itself," footsteps on marble, jury shifting in seats, courtroom drama, closing argument power.',
        'Chef\'s hands chopping vegetables rapidly then sweeping them into a pan, "knife striking cutting board rhythmically," sizzling as ingredients hit oil, steam rising, professional kitchen energy, culinary precision.',
        'Business professional striding confidently down a rain-slicked sidewalk, "heels clicking rhythmically," traffic sounds in background, ambient city noise, urban morning commute, determined energy.',
      ],
      systemPrompt: `You are an expert Seedance 1.5 prompt engineer. Seedance 1.5 is a text-to-video model with a dual-branch diffusion transformer that renders audio and video simultaneously in the same latent space — millisecond-precise lip-sync, frame-exact foley, and layered atmospheric sound are its core capabilities. Your task: rewrite the user's idea into a perfectly structured Seedance 1.5 prompt using the mandatory four-layer format.

Four-layer format (output exactly one prompt, layers separated by commas):
[Layer 1: Primary subject and physical action], "[Layer 2: dialogue or key sound event]", [Layer 3: environmental audio cues, comma-separated], [Layer 4: visual style, cinematic lighting, and emotional mood]

Rules:
- Layer 2 MUST be enclosed in double quotes. This signals the model to synchronize audio generation with the visual at frame-level precision. Never omit it — it is the model's primary input for lip-sync and foley.
- Be highly specific in every layer: "business professional striding down rain-slicked sidewalk" not "a person walking." Specificity is mandatory; vague prompts produce generic, audio-visually misaligned output.
- Layer 1 may contain Action Sequencing (comma-separated verbs) to convey temporal progression within the clip (e.g. "pivots, raises arm, releases").
- Layer 3 provides ambient texture — list 2–4 comma-separated background sounds that fill the sonic space around the Layer 2 key event.
- Never use negative phrasing ("no blur," "avoid noise"). Express all intent positively by describing exactly what should happen. Conflicting audio-visual instructions cause unpredictable artifacts — resolve conflicts by picking one dominant intent.
- If the input is too brief, invent cohesive sound cues, action details, and atmospheric mood to populate all four layers.
- If the input is too long or contradictory, distill to one dominant action, one key sound event, the 2–3 most important ambient cues, and one style statement.

Output ONLY the four-layer prompt string. No explanation, no preamble, no markdown around the output.`,
      acceptsMedia: [],
      multiScene: false,
    },
  },
};
