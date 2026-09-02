# Research & Synthesis Worksheet — Seedance 2.0

- **Model version:** Seedance 2.0   **Mode(s):** t2v and i2v
- **Research date:** 2026-06-22   **Sources:** see `sources.md`

---

## Part A — Research (the 7 standard questions)

All questions queried against notebook `119a088d` ("Seedance Prompt Guies").

### 1. Output format & length (t2v)

Seedance 2.0 uses a **technical, structured format** that functions like a
director's shooting script rather than a narrative paragraph or keyword list.
Three sub-formats exist depending on complexity [src #7, #8]:

- **Standard five-part structure:** Subject → Action → Camera → Style → Quality
  Suffix (basic single-shot prompt).
- **Timeline / multi-shot format:** Per-segment timestamps (`[0s-4s]`) or shot
  labels (`Shot 1`, `Shot 2`) with camera + action per segment.
- **@Asset reference system:** `@Image1`, `@Video1`, `@Audio1` syntax to assign
  uploaded media a specific "job" in the prompt.

Duration: 4–15 seconds per generation. No hard word limit; technical specificity
is prioritized over length. Each timeline segment should be 2–5 seconds to avoid
over-instruction. [src #3, #8]

### 1a. Output format & length (i2v / elements)

For i2v, the timeline multi-shot structure is primary. Per segment: timestamp,
shot type, camera movement, subject description, audio. Global Style block
appended at the end applies across all shots. Up to 12 reference assets (9
images, 3 videos, 3 audio clips) assignable via @tags. [src #3, #8, #10]

### 2. Structural order (t2v)

Extended recommended sequence [src #8, #9]:

1. **Subject** — who/what, age/material/type; @tag assignment if multimodal
2. **Action** — one clear physics-aware verb per shot
3. **Scene / Atmosphere** — location, environment, time of day
4. **Camera** — shot size + movement + angle + optional lens
5. **Lighting & Style** — visual anchor, mood, film look
6. **Audio** — audio adjectives to trigger native audio engine
7. **Quality Suffix** — mandatory: "4K ultra HD, rich detail, sharp clarity,
   cinematic textures, stable picture. Maintaining face and clothing consistency
   without distortion or high detail. Generate the video without subtitles."
8. **Constraints** — inline negative phrasing ("no zoom," "no subtitles")

### 2a. Structural order (i2v / timeline)

Per shot: `[Xs-Ys]: [Shot type], [camera movement], [subject description and
action], [audio cue]`

Conclude with: `Global Style: [aesthetic, fps, lighting]`

### 3. Vocabulary (t2v and i2v)

**Physics-aware action verbs** [src #8, #9]: "tires smoke as the car drifts 90
degrees," "silk fabric billows and ripples," "glass bottles tumble shattering on
impact," "fragments scattering outward," "fracture," "implode," "snap open,"
"splash," "clink," "ripple," "scatter."

**Camera movement terms** [src #6, #8]: dolly in/out (push in/pull back), pan
left/right, tilt up/down, tracking shot, 360-degree orbit, crane up/down,
Steadicam glide, handheld documentary style, rack focus, shallow/deep depth of
field, tripod stable, smooth gimbal. Angles: low angle, high angle, bird's eye,
Dutch angle. Lenses: 35mm, anamorphic, macro.

**Lighting** [src #8, #9]: volumetric fog, God rays, lightning flashes,
backlight, teal and orange cinematic grading, golden hour, tungsten lighting,
cyberpunk neon, high contrast, soft/harsh/flickering light, film grain texture,
moody lighting.

**Audio adjectives** (trigger native audio engine) [src #8]: "reverb" (space),
"muffled" (distance/underwater), "echoing" (large halls), "crunchy" (gravel),
"metallic clink of a coin," "boots on grass," "heavy thud," "rustling fabric,"
"sizzling," "crowd murmur."

**Quality suffix** (mandatory, exact string) [src #8, #9]:
"4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture.
Maintaining face and clothing consistency without distortion or high detail.
Generate the video without subtitles."

### 4. Mistakes & failure modes

**Do:** [src #7, #8, #9]
- Follow Subject→Action→Scene→Camera→Lighting→Style→Audio→Quality Suffix→
  Constraints order exactly.
- Use physics-aware verbs (smoke, drift, billow, fracture) not soft words
  (becomes, moves, changes).
- Assign every uploaded @asset a specific role in the prompt.
- Implement timeline prompting ([0s-4s]) for sequences longer than ~5 seconds.
- For character consistency: use three stills max (front, three-quarter, profile)
  with neutral expressions and consistent lighting.
- Trigger the native audio engine with specific audio adjectives.
- One camera move per segment — never stack them.

**Don't / failure modes:** [src #7, #8, #9]
- Overloading segments (multiple actions + camera moves in one timestamp) →
  unpredictable, "slideshowy" output.
- Vague direction ("make it look cool") → model guesses, results feel generic.
- Identity drift: over-describing the face in text causes the model to match
  category ("young woman") over the reference image.
- Conflicting terms ("close-up wide shot," "static tracking shot") confuse the
  model.
- Wobble/jitter: fast camera + fast cuts + busy scene → add stability cues
  ("tripod stable," "smooth gimbal") to prevent.
- Omitting the quality suffix → degraded consistency and stability.

### 5. Negative prompts

Seedance 2.0 has **no separate negative prompt field**. Negatives are placed
either appended to the quality suffix as constraints, or inline within specific
categories (e.g., Camera: "no zoom, tripod stable"). The model respects negative
phrasing when written as behavioral constraints. [src #7, #8]

negativeHandling: `inline-positive` (constraints block appended, not a separate
field; expressed as "no X," "avoid X," "maintain X without Y")

Common constraint examples: "no zoom," "no warping," "avoid dramatic turns,"
"avoid hair lift," "no accessories changes," "without distortion," "without
subtitles."

### 6. What's unique

Seedance 2.0's standout capability is the **multimodal @Reference system**:
users can upload up to 12 reference files (9 images, 3 videos, 3 audio clips)
and assign each a specific role via @tag. This enables using an image as a first
frame, a video for camera motion reference, and audio to drive sync — all in one
generation. [src #8, #10]

Other standouts: physics-aware simulation (gravity, friction, momentum render
realistically); native audio-visual sync without post-production; multi-shot
timeline control within a single 15-second clip; strong character consistency
within a generation via reference pack (3-still method). [src #2, #8, #10]

Weaknesses: character ID drift across different generations; "wobble city" from
stacked fast moves; no official ByteDance documentation in notebook — all 2.0
coverage is community-sourced. [src #2, #7]

### 7. Example prompts (t2v)

Note: Q7 query to NotebookLM was rate-limited. Examples below are reconstructed
from source citations appearing in Q1 and Q6 answers, and from the seed file
(`dev-docs/enhancer_prompts.md`). All are paraphrased.

**Example 1 — Football tracking shot** (paraphrased from src #10 citation in Q1
answer, YouTube tutorial):
@Image1 as the first frame. A boy in a blue jersey, dribbling forward. Medium
tracking shot, warm afternoon sunlight, cinematic texture with film grain.
Boots on grass, ball thud, crowd murmur. 4K ultra HD, rich detail, sharp
clarity, cinematic textures, stable picture. Maintaining face and clothing
consistency without distortion or high detail. Generate the video without
subtitles.

**Example 2 — Neon city action** (paraphrased from src #1 citation in Q1 answer):
A figure in a dark hoodie sprinting through rain-soaked neon-lit streets at
midnight. Tires squeal as a vehicle fishtails behind. Handheld tracking shot at
eye level, fast pace, anamorphic lens flare, cyberpunk neon lighting, 24fps film
look. Rain impact on pavement, crowd gasps, distant sirens. 4K ultra HD, rich
detail, sharp clarity, cinematic textures, stable picture. Maintaining face and
clothing consistency without distortion or high detail. Generate the video without
subtitles.

**Example 3 — Standard structured single-shot** (paraphrased from Q2 2.0 answer,
src #8):
A bearded employee in a grey sweater sits at a modern brutalist office desk.
He slams a stack of papers on the counter, motion weight with paper scattering
outward. Static medium shot, overhead fluorescent lighting, cold blue tones,
realistic gritty texture. Paper scraping sound, distant office hum. 4K ultra HD,
rich detail, sharp clarity, cinematic textures, stable picture. Maintaining face
and clothing consistency without distortion or high detail. Generate the video
without subtitles.

---

### i2v / elements follow-up

Queried: "Seedance 2.0 @tag system: images videos audio supported? Timeline per
segment?"

Confirmed from Q6 and Q1/Q2/Q3 answers:
- Accepts: **image** (@Image1 etc., up to 9), **video** (@Video1 etc., up to 3),
  **audio** (@Audio1 etc., up to 3). Total: up to 12 reference files. [src #8, #10]
- Image can be used as first frame, character reference, style reference, or
  all-round reference.
- Video can be used for camera motion reference or style reference.
- Audio drives audio-visual sync.
- Multi-scene / timeline output: **yes** — per-segment timestamps (`[0s-4s]`)
  with individual shot type, camera movement, action, and audio per segment;
  Global Style block at end. [src #3, #10]

acceptsMedia: `["image", "audio", "video"]`
multiScene: `true`

---

### Conflicts & unknowns

- **Conflict — no official docs in notebook:** All 2.0 coverage is community
  sourced (no ByteDance official guide). Findings are consistent across sources
  but unverified against first-party docs. Flag for Phase 3.
- **Unknown — exact @Audio behavior:** Sources confirm audio @tags sync audio
  generation, but whether audio drives video timing or just texture is unconfirmed.
  Phase 3 should test.
- **Unknown — Q7 examples:** Q7 query was rate-limited; example prompts above
  are reconstructed from citations in other answers plus the seed file. Phase 3
  validation will exercise the structure on real output.

---

## Part B — Synthesis (map to RecipeSchema)

**Recipe-level**

| Field | Value |
|---|---|
| `modelId` | `seedance-2.0` |
| `family` | `seedance` |
| `displayName` | `Seedance 2.0` |
| `status` | `draft` |
| `notes` | "Physics-aware dual-branch diffusion transformer. t2v uses Subject→Action→Scene→Camera→Lighting→Style→Audio→Quality Suffix→Constraints order; i2v extends with @tag multimodal reference system (up to 9 images + 3 videos + 3 audio) and timeline multi-shot format. Mandatory quality suffix for every prompt. No official ByteDance docs in notebook — community-sourced only; flag for Phase 3." |
| `modes` | `t2v` and `i2v` |

**t2v mode**

| Field | Value |
|---|---|
| `outputFormat` | `structured-tags` |
| `lengthNorm` | `"4–15 second clip; no hard word limit; 2–5 seconds per timeline segment"` |
| `structureOrder` | `["Subject (@tag if multimodal)", "Action (physics-aware verb)", "Scene/Atmosphere", "Camera (shot size + movement + angle)", "Lighting & Style", "Audio (adjectives)", "Quality Suffix", "Constraints"]` |
| `vocabulary` | `physics: ["tires smoke as car drifts", "silk fabric billows", "glass shatters on impact", "fracture", "implode", "scatter"]`; `camera: ["dolly in", "dolly out", "pan left", "tracking shot", "360-degree orbit", "Steadicam glide", "rack focus", "tripod stable", "handheld documentary style"]`; `lighting: ["volumetric fog", "God rays", "teal and orange grading", "golden hour", "cyberpunk neon", "film grain texture"]`; `audio: ["reverb", "muffled", "echoing", "metallic clink", "boots on grass", "crowd murmur"]` |
| `dos` | 1. Follow the 8-part structural order exactly. 2. Use physics-aware action verbs. 3. Assign every @asset a specific role. 4. Add timeline timestamps for sequences >5s. 5. Include audio adjectives to trigger native audio engine. 6. Always append the exact quality suffix string. 7. One camera movement per segment. 8. For characters, use a 3-still reference pack. |
| `donts` | 1. Do not stack camera moves in one segment. 2. Do not use vague direction ("look cool"). 3. Do not over-describe face in text when using character @reference. 4. Do not use contradictory framing ("close-up wide shot"). 5. Do not omit the quality suffix. 6. Do not assign more than one action per short segment. |
| `negativeHandling` | `inline-positive` |
| `examplePrompts` | See Part A §7 — football/neon-city/office examples. |
| `systemPrompt` | Drafted below (t2v). |
| `acceptsMedia` | `[]` (t2v text-only path) |
| `multiScene` | `false` |

**i2v mode**

| Field | Value |
|---|---|
| `outputFormat` | `timeline` |
| `lengthNorm` | `"4–15 seconds total; 2–5 seconds per segment; up to 3–5 segments"` |
| `structureOrder` | `["@Asset assignments (each asset gets a job)", "Timeline segments: [Xs-Ys] Shot type, Camera, Action, Audio", "Global Style block"]` |
| `vocabulary` | (same as t2v; additionally) `@tags: ["@Image1 as the first frame", "@Image2 for character styling", "@Video1 for camera movement", "@Audio1 to drive sync"]`; `timeline: ["[0s-4s]", "[4s-8s]", "Shot 1:", "Cut to:", "Slow push-in", "Rack focus", "Snap cut"]` |
| `dos` | 1. Give every uploaded @asset a specific explicit job. 2. Use timeline timestamps per segment. 3. Assign one camera move per segment. 4. Include audio cue per segment. 5. End with Global Style block. 6. Append quality suffix after Global Style. 7. Keep total segments to 3–5 (avoid confusing the model). |
| `donts` | 1. Do not upload assets without assigning their role. 2. Do not mix timeline and shot-label formats in the same prompt. 3. Do not stack camera moves per segment. 4. Do not omit Global Style block. |
| `negativeHandling` | `inline-positive` |
| `examplePrompts` | See Part A i2v follow-up section — football @Image1 multi-shot example. |
| `systemPrompt` | Drafted below (i2v). |
| `acceptsMedia` | `["image", "audio", "video"]` |
| `multiScene` | `true` |

### Drafted systemPrompt (t2v)

```
You are an expert Seedance 2.0 prompt engineer. Seedance 2.0 is a
physics-aware, audio-visual video model that functions as a director's console.
Your task: rewrite the user's idea into a precise, structured Seedance 2.0
text-to-video prompt.

Follow this exact structural order:
1. Subject — who or what, with physical detail (age, clothing, material)
2. Action — one physics-aware verb per shot (tires smoke, glass shatters,
   fabric billows — not "moves" or "becomes")
3. Scene / Atmosphere — location, time of day, environment
4. Camera — shot size (wide/medium/close-up) + movement (dolly in, tracking
   shot, 360-degree orbit) + angle (low/high/eye level)
5. Lighting & Style — cinematic look (film grain, teal-orange grade, golden hour)
6. Audio — specific adjectives to trigger native audio engine (reverb, muffled,
   metallic clink of a coin, boots on grass)
7. Quality Suffix (always append, exact wording):
   "4K ultra HD, rich detail, sharp clarity, cinematic textures, stable picture.
   Maintaining face and clothing consistency without distortion or high detail.
   Generate the video without subtitles."
8. Constraints — any behavioral limits (no zoom, no warping, tripod stable)

Rules:
- One camera movement per shot; never stack camera moves.
- Simulates real-world physics: use weight, friction, momentum verbs.
- If the input is too brief, invent 1–3 cinematic details per section to fill
  the structure. If too long, distill to one dominant subject, one action beat,
  one camera direction.
- Output ONLY the final prompt. No explanation, no preamble.
```

### Drafted systemPrompt (i2v)

```
You are an expert Seedance 2.0 timeline prompt director. Seedance 2.0 i2v
accepts uploaded images, videos, and audio files as reference assets. Your task:
translate the user's idea into a structured timeline prompt with @tag asset
assignments and per-segment direction.

Structure:
[Asset assignments] — explicitly state what each uploaded file does.
  Examples: "@Image1 as the first frame", "@Image2 for character styling",
  "@Video1 for the camera movement", "@Audio1 to drive audio sync".
[Timeline] — one segment per 2–5 seconds:
  [Xs-Ys]: [Shot type], [single camera movement], [subject action], [audio cue]
[Global Style] — one block applying to the whole clip (fps, color grade, mood)
[Quality Suffix] — always: "4K ultra HD, rich detail, sharp clarity, cinematic
  textures, stable picture. Maintaining face and clothing consistency without
  distortion or high detail. Generate the video without subtitles."

Rules:
- Every uploaded asset MUST receive an explicit job (@tag + role).
- One camera movement per segment — never stack.
- Limit total segments to 3–5 to avoid overloading the model.
- Scale shot size to escalate emotion: wide (context) → medium → close-up (emotion).
- If the input is too brief, invent 2–3 logical progression beats (wide →
  medium → close-up). If too long, condense to 3–5 distinct camera beats.
- Output ONLY the formatted timeline script. No explanation.
```

### Readiness verdict

- [x] All 7 questions answered with source pins (Q7 examples reconstructed
  from other-answer citations — flagged).
- [x] i2v follow-up answered: acceptsMedia confirmed [image, audio, video];
  multiScene confirmed true.
- [x] Conflicts resolved or flagged for Phase 3 (no official ByteDance docs,
  @audio behavior, Q7 example reconstruction).
- [x] Every schema field can be filled.
- **Verdict:** ready to author draft recipe for both t2v and i2v modes. Phase-3
  must validate (1) quality suffix exact string on real model, (2) @audio sync
  behavior, (3) whether 3–5 segment limit is firm or advisory.
