# Research & Synthesis Worksheet — Seedance 1.5

- **Model version:** Seedance 1.5   **Mode(s):** t2v only
- **Research date:** 2026-06-22   **Sources:** see `sources.md`

---

## Part A — Research (the 7 standard questions)

### 1. Output format & length

Seedance 1.5 uses a **structured four-layer format**, neither prose nor a keyword
list. The four layers are separated by commas and function simultaneously as a
director's shot list and a sound designer's cue sheet. No hard word limit is
documented; the emphasis is on specificity rather than brevity. Clips generated
range from 4 to 12 seconds. [src #5]

Template: `[Subject & Action], "[Key Sound/Dialogue]", [Ambient Audio Cues], [Visual Style]`

### 2. Structural order

The exact four-layer sequence [src #5]:

1. **Layer 1 — Primary Action or Subject:** who/what is in the frame and what
   physical action they are performing.
2. **Layer 2 — Dialogue or Key Sound Event:** the most important audio moment,
   enclosed **in double quotes** to signal the model to prioritize synchronized
   audio-visual generation (lip-sync, frame-exact foley).
3. **Layer 3 — Environmental Audio Cues:** ambient background sounds, listed as
   comma-separated phrases (e.g., footsteps on marble, jury shifting).
4. **Layer 4 — Visual Style and Mood:** aesthetic, cinematic lighting, and
   emotional tone.

### 3. Vocabulary

Camera / motion: specificity over generic labels — "striding confidently,"
"executing pirouettes," "chopping rapidly" rather than "walking" or "dancing."
Technical API parameters include `camera_fixed` (true/false) and `aspect_ratio`
(e.g. 21:9 cinematic widescreen, 9:16 vertical). "Quick zoom in" and "temporal
markers" for dynamic energy. [src #5]

Lighting / style: "golden hour cinematography," "lightning flashes," "sunrise,"
"mist rising," "Gothic atmosphere," "courtroom drama," "epic landscape," "closing
argument power," "craftsmanship focus," "culinary precision." [src #5]

Audio (critical — primary capability): Key sound events go in quotes (Layer 2).
Vivid sound verbs for Layer 3: "cracking," "pelting," "howling," "sizzling,"
"clicking rhythmically." Environmental cues: "footsteps on marble," "jury
shifting," "birds beginning morning chorus," "traffic sounds," "orchestral music
swelling." Emotional audio: "sudden gasp," "dramatic music sting," "startled."
[src #5]

### 4. Mistakes & failure modes

**Do:** [src #5]
- Follow the four-layer structure — always.
- Enclose Layer 2 audio events in double quotes.
- Be highly specific about subject, action, and all sound cues.
- Use Action Sequencing (comma-separated actions in Layer 1) for temporal
  progression within a short clip.
- Capture a seed value when at ~80% satisfaction and iterate via positive
  text changes with the same seed.

**Don't / failure modes:** [src #5]
- Vague descriptions ("a person walking in a city") produce generic,
  audio-visual-misaligned output. Specificity is mandatory.
- Ignoring audio wastes the model's core capability — the dual-branch
  architecture has no material to sync if Layer 2 and 3 are omitted.
- Conflicting audio-visual instructions (e.g., "peaceful garden" + "loud rock
  concert") produce unpredictable artifacts, not an error message.
- Skipping Layer 3 ambient cues leaves the soundscape hollow and artificial.

### 5. Negative prompts

Seedance 1.5 has **no separate negative prompt field**. Unwanted elements are
managed through highly specific positive phrasing in the four-layer structure.
Conflicting instructions cause artifacts rather than filtering. An
`enable_safety_checker` parameter (default: true) exists as a global safety
filter, not a user-directed negative field. All negative intent must be expressed
by describing precisely what should happen, not what shouldn't. [src #5]

negativeHandling: `inline-positive`

### 6. What's unique

The defining characteristic of Seedance 1.5 is its **dual-branch diffusion
transformer** that renders audio and video **simultaneously in the same latent
space** — not as post-production steps. This enables millisecond-level precision
between visual and auditory events. Standout capabilities: native lip-sync
(character speech triggers frame-exact mouth movements), frame-exact foley
(glass shatters at the exact frame of impact), layered atmospheric soundscapes,
and temporal progression via Action Sequencing within 4–12 second clips.

Weaknesses: fails completely with vague prompts; cannot reconcile contradictory
audio-visual instructions (produces artifacts); no multi-scene/timeline
structure (single unified clip only). [src #5]

### 7. Example prompts

All three are paraphrased from source material, preserving the four-layer
structure [src #5]:

**Example 1 — Courtroom drama:**
Defense attorney declaring, "Ladies and gentlemen, reasonable doubt isn't just a
phrase, it's the foundation of justice itself," footsteps on marble, jury
shifting, courtroom drama, closing argument power.

**Example 2 — Culinary precision:**
Chef's hands chopping vegetables rapidly, "knife striking cutting board
rhythmically," sizzling as ingredients hit a hot pan, steam rising, professional
kitchen energy, culinary precision.

**Example 3 — Urban commute:**
Business professional striding confidently down rain-slicked sidewalk, "heels
clicking rhythmically," traffic sounds in background, urban morning commute,
determined energy.

---

### Conflicts & unknowns

- **Conflict — no camera movement language:** The seed file (`dev-docs/enhancer_prompts.md`)
  describes Seedance 1.5 as an i2v model using the four-layer structure. The fal.ai
  guide (src #5) does not specify whether 1.5 accepts a reference image as input or
  is truly text-only. Resolution: treated as t2v for this recipe (the seed file
  entry is titled "SeeDance 1.5" without i2v framing). Flag for Phase 3 to confirm.
- **Unknown — hard token limit:** No token ceiling is documented; "specificity over
  brevity" is the only guidance. Phase 3 should test whether very long Layer 3
  strings hurt output quality.
- **Unknown — camera control vocabulary beyond API params:** Only `camera_fixed`
  and `aspect_ratio` are mentioned as direct controls; no cinematic camera-move
  vocabulary (dolly, pan, tracking) is documented for 1.5 the way it is for 2.0.

---

## Part B — Synthesis (map to RecipeSchema)

**Recipe-level**

| Field | Value |
|---|---|
| `modelId` | `seedance-1.5` |
| `family` | `seedance` |
| `displayName` | `Seedance 1.5` |
| `status` | `draft` |
| `notes` | "Dual-branch diffusion transformer; audio and video generated simultaneously in one latent space. Four-layer format is mandatory. No negative prompt field — use positive specificity throughout. No cinematic camera-move vocabulary documented; camera control limited to API params (camera_fixed, aspect_ratio). Draft until Phase-3 validation on real model output." |
| `modes` | `t2v` only |

**t2v mode**

| Field | Value |
|---|---|
| `outputFormat` | `structured-tags` |
| `lengthNorm` | `"4–12 second clip; no hard word limit — specificity matters more than length"` |
| `structureOrder` | `["Primary Action/Subject", "Key Sound Event (in quotes)", "Environmental Audio Cues", "Visual Style and Mood"]` |
| `vocabulary` | `camera: ["camera_fixed", "aspect_ratio", "quick zoom in", "temporal markers"]`; `motion: ["striding confidently", "executing pirouettes", "chopping rapidly", "striking rhythmically", "settling", "rising visibly", "tapping"]`; `lighting: ["golden hour cinematography", "lightning flashes", "sunrise", "mist rising", "Gothic atmosphere"]`; `audio-key: ["cracking", "pelting", "howling", "sizzling", "clicking rhythmically"]`; `audio-ambient: ["footsteps on marble", "jury shifting", "traffic sounds", "orchestral music swelling", "birds beginning morning chorus"]` |
| `dos` | 1. Always use the four-layer structure. 2. Enclose Layer 2 sound/dialogue in double quotes. 3. Be highly specific about subject, action, and all audio cues. 4. Use Action Sequencing (comma-separated verbs) in Layer 1 for temporal progression. 5. Capture seed value at ~80% and iterate with fixed seed. 6. Describe what happens, not what should be avoided. |
| `donts` | 1. Do not write vague descriptions ("a person walking"). 2. Do not omit Layer 2 audio — it wastes the model's primary capability. 3. Do not combine contradictory audio-visual instructions (causes unpredictable artifacts). 4. Do not skip Layer 3 ambient cues. 5. Do not use negative phrasing — it is not supported. |
| `negativeHandling` | `inline-positive` |
| `examplePrompts` | See Part A §7 — three courtroom/kitchen/urban examples. |
| `systemPrompt` | Drafted below. |
| `acceptsMedia` | `[]` (t2v — text only) |
| `multiScene` | `false` |

### Drafted systemPrompt (t2v)

```
You are an expert Seedance 1.5 prompt engineer. Seedance 1.5 is a text-to-video
model with a dual-branch diffusion transformer that renders audio and video
simultaneously. Your task: rewrite the user's idea into a perfectly structured
Seedance 1.5 prompt using the mandatory four-layer format.

Four-layer format (output exactly one line, layers separated by commas):
[Layer 1: Subject & primary physical action], "[Layer 2: dialogue or key sound event]", [Layer 3: environmental audio cues as comma-separated phrases], [Layer 4: visual style, lighting, and emotional mood]

Rules:
- Layer 2 MUST be enclosed in double quotes. This signals the model to
  synchronize audio generation with the visual at frame-level precision.
- Be highly specific: "business professional striding down rain-slicked
  sidewalk, heels clicking" not "a person walking."
- Layer 3 provides ambient texture — list 2–4 comma-separated background sounds.
- If the input is too brief, invent cohesive sound cues, action details, and
  atmospheric mood to fill all four layers.
- If the input is too long, distill to one dominant action, one key sound event,
  the most important 2–3 ambient cues, and one style statement.
- Never use negative phrasing. Express all intent positively.
- Output ONLY the four-layer prompt string. No explanation, no preamble.
```

### Readiness verdict

- [x] All 7 questions answered with source pins.
- [x] Conflicts resolved or flagged for Phase 3 (t2v/i2v status, token limit, camera vocab).
- [x] Every schema field can be filled.
- **Verdict:** ready to author draft recipe. Phase-3 must confirm (1) whether 1.5
  accepts a reference image as input, (2) any token ceiling, and (3) whether
  camera-move vocabulary has any effect on 1.5 output.
