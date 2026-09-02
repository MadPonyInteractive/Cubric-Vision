# Research & Synthesis Worksheet — Kling 3.0

- **Model version:** Kling 3.0   **Mode(s):** t2v AND i2v
- **Research date:** 2026-06-22   **Sources:** see `sources.md`
- **Notebook:** `a848d66a` — "Kling 3.0 prompt guides"

---

## Part A — Research (the 7 standard questions + mode follow-up)

### Q1. Output format & length

Kling 3.0 does not accept keyword lists. It expects **structured cinematic
prose** — prompts written like a director's shooting notes, in flowing sentences
that describe intent, motion, and atmosphere in a logical sequence. [src 2, 7]

Within that prose, certain elements use lightweight structured tags for
precision: dialogue is attributed with `[Character A: Name, tone]: "text"`,
multi-shot breaks are labelled `Shot 1 (0–5s): …`, audio cues use `SFX:`, and
motion is calibrated with a numerical intensity value `0.1–1.0`. [src 3, 7]

**Typical length:** No hard token ceiling, but the sources consistently point to
roughly **150–250 words** as the sweet spot for a fully structured prompt. A
200-word well-ordered prompt outperforms a vague 20-word one. Prompts should
cover the full intended duration (3–15 seconds) — longer structure is encouraged
as long as narrative order is maintained. [src 1, 2]

### Q2. Structural order

The consensus across sources is a **five-layer sequence** that grounds the model
in spatial context before introducing motion complexity:

1. **Scene** — physical location, time of day, atmospheric lighting (the spatial
   anchor; establish this first so physics are coherent). [src 7, 3]
2. **Characters / Elements** — unambiguous identities and fixed physical traits
   (use labels, e.g. "[Character A: the woman in the red coat]"); keep descriptors
   identical across all shots to prevent identity drift. [src 7, 1]
3. **Action** — movement broken into temporal steps (beginning → middle → end);
   use explicit cinematic verbs, never vague ones like "moves". [src 7, 1]
4. **Camera** — shot type (wide, close-up, macro 85mm) + specific movement
   (slow dolly push-in, handheld shoulder-cam drift, crane shot). [src 7, 1]
5. **Audio & Style** — dialogue (with character labels), SFX cues, filmic
   aesthetic (35mm grain, muted palette, etc.). [src 7, 1]

**Alternative orderings noted:** Some sources lead with Camera before Subject
(Camera → Subject → Environment → Lighting → Texture → Emotion) to set visual
energy first. A simpler pattern — Subject details → Motion → Camera → Environment
→ Style/Lighting — also appears. The 5-layer order above is cited as the industry
benchmark for Kling 3.0 and is the safest default. [src 5, 7]

### Q3. Vocabulary

Kling 3.0 responds to professional filmmaking terminology, not generic language.
Key terms by domain:

**Camera:** dolly push-in, slow tracking shot, whip-pan, crane shot, handheld
drift, rack focus, crash zoom, snap focus, shoulder-cam drift, robotic arm
control, continuous circular orbit, macro 85mm lens, wide-angle steadicam,
anamorphic lens flare, 35mm film aesthetic. [src 1, 3]

**Motion (physical actions):** heel-first steps, fabric sway, explosive strides,
speed ramp, lateral pass. [src 1, 7]

**Motion (micro-motions):** breathing, blinking, drifting dust, steam rising,
broth splattering, condensation forming, leaves swirling, hair drifting. Adding
micro-motions produces tactile realism. [src 1, 3]

**Motion intensity scale (numerical):**
- `0.1–0.3` — subtle / micro-motion (slight hair sway, breathing)
- `0.4–0.6` — natural / standard (walking, gesturing)
- `0.7–1.0` — dynamic / kinetic (sprinting, dancing, action) [src 1, 3, 7]

**Lighting:** golden hour, soft diffused natural light, hard directional studio
lighting, cool blue refrigerator glow, neon-lit, flickering fluorescent, soft box.
[src 1, 3]

**Style/film:** 35mm film grain, shallow focus, glowing bokeh, muted pastel
tones, cinematic, 24fps film look, anamorphic ratio. [src 1, 3]

**Audio (t2v-specific):** SFX notation, ambient café chatter, refrigerator hum,
rain tapping on glass, paper scraping. [src 1, 7]

### Q4. Mistakes & failure modes

**Common failures:**
- Treating Kling like an image generator — sending keyword lists instead of
  cinematic prose yields static or incoherent motion. [src 2, 7]
- Physics overload — requesting too many complex movements in a single 10-second
  clip, or physics-defying actions, produces choppy / distorted output. [src 1]
- Vague motion verbs ("moves", "goes") — the model lacks sufficient data to render
  realistic kinetics without specific cinematic verbs. [src 1, 3]
- Identity drift — using multiple subjects with independent complex actions causes
  tracking issues; varying a character's description between shots (e.g. "red
  jacket" → "crimson coat") causes the model to reinterpret the character. [src 1]
- Extreme close-up + rapid motion — produces unnatural warping around eyes and
  mouth. [src 1]
- The "99% stuck" bug — generation hangs at the final stage when the prompt
  provides no clear motion endpoint; the model cannot finalize its physics path.
  [src 1]
- Skipping the negative prompt — omitting negatives increases the rate of morphing
  textures, extra limbs, and flickering. [src 1, 4]

**Do's:**
- Write every prompt as a flowing cinematic take, not a list. [src 2]
- Use unique character labels (`[Character A]`), never pronouns, for dialogue. [src 1]
- Include a motion intensity value (0.1–1.0) for every significant action. [src 1, 3]
- Assign ONE camera movement per shot — stacking ("pan and zoom and dolly")
  confuses the model. [src 1]
- For multi-shot, use explicit timecodes: `Shot 1 (0–5s): …`. [src 1]
- End with a Negative Prompt block to eliminate artifacts. [src 1, 4]

**Don'ts:**
- Don't use pronouns — always label characters. [src 1]
- Don't vary descriptors between shots. [src 1]
- Don't stack multiple complex camera movements in one shot. [src 1]
- Don't describe physics-defying actions (floating, teleporting, instantaneous
  transformations). [src 1]
- Don't leave the motion endpoint undefined on longer clips. [src 1]

### Q5. Negative prompts

Kling 3.0 **explicitly supports and benefits from a separate negative prompt
field**. The negative prompt is described as a "critical layer of protection"
against technical failure and artifacts; using it is recommended as a core
prompting principle. [src 1, 4]

**Main prompt:** cinematic intent — what to see, feel, hear. Follows the 5-layer
structure. [src 1]

**Negative prompt field:** precision and cleanup — keyword list of artifacts and
constraints to suppress. [src 1, 4]

Typical negative prompt content:
- Physical mutations: extra limbs, extra fingers, deformed hands, distorted faces,
  warped limbs. [src 1, 4]
- Motion artifacts: morphing textures, flickering, background shifting, floating
  objects, foot sliding. [src 1, 4]
- Technical quality: motion blur, glitches, low quality, unreadable typography.
  [src 4]
- Cinematic constraints: "No shake", "No circular motion" — if a stable or
  non-orbiting shot is required. [src 1]

**Negative handling: `separate-field`** — the negative prompt is a distinct field,
not embedded in the main prompt as positive phrasing.

### Q6. What's unique about Kling 3.0

**Does unusually well:**
- **Visual Chain-of-Thought (VCoT) reasoning** — the model performs scene
  decomposition and causal reasoning before rendering, understanding spatial
  relationships and lighting logic (e.g. how window light interacts with wood
  vs. glass). This is structurally different from pattern-matching models. [src 7]
- **Native multi-shot sequences** — can generate 2–6 distinct scenes in a single
  pass, maintaining narrative continuity across up to 15 seconds. [src 7, 1]
- **Integrated native audio** — generates frame-accurate, character-specific
  dialogue and SFX simultaneously with the video; lip sync and accents are natively
  aligned without external tools. [src 7]
- **Granular motion intensity control** — the 0.1–1.0 numerical scale is a
  standout differentiator for calibrating kinetic energy precisely. [src 7, 3]
- **Physics-driven realism** — excels at liquid dynamics, authentic fabric
  movement, and collision interactions. [src 7]
- **Consistent character identity** — uses label-based anchoring to maintain
  character traits across shots. [src 1, 7]

**Does poorly / known limitations:**
- Extreme facial close-ups during rapid motion produce warping. [src 1]
- Multi-subject scenes with independent complex actions lead to tracking failures.
  [src 1]
- Generic or vague inputs yield noticeably worse output than structured ones —
  more prompt-sensitive than some competitors. [src 2, 7]

### Q7. Example prompts from sources

**Example 1 — Neon ramen shop (micro-motions + cinematic texture):**
A narrow neon-lit ramen shop at night. Static tripod framing. Condensation fogs
the window. A couple sits side by side under a flickering magenta sign; steam
rises slowly from their bowls as they eat in a gentle synchronized rhythm, broth
splattering softly, motion intensity 0.3. Their faces are lit by red neon glow.
Shot on 35mm film with shallow focus and glowing bokeh in the background. [src 1, 3]

**Example 2 — Professional ballerina (motion intensity + physics):**
A professional ballerina in a white tutu and pointe shoes performs a slow
arabesque in a minimalist studio. Controlled leg extension, motion intensity 0.4.
Smooth fluid movement. Static medium shot from eye level. Wooden floor and mirrored
wall behind. Soft diffused natural light creating gentle shadows. Artistic dance
photography aesthetic, muted pastel tones. [src 1]

**Example 3 — Kitchen argument (multi-shot + dialogue labels):**
A dim kitchen late at night, lit by a cool refrigerator glow and flickering
fluorescent bulb. [Character A: exhausted husband in a grey sweater] and
[Character B: frustrated wife in a business suit].
Shot 1 (0–5s): Static medium two-shot. The husband slams a stack of papers on
the counter, motion intensity 0.7. Paper scraping sound. [Character A: angry
shouting voice]: "We can't keep ignoring these!"
Shot 2 (5–10s): Quick dolly push-in to the wife's face. She crosses her arms
defensively, motion intensity 0.4. [Character B: sharp defensive tone]: "I'm
doing the best I can!" Ambient refrigerator hum. [src 1, 7]

### Q8 (Follow-up). t2v vs i2v/Elements mode differences

**Text-to-Video (t2v):** The prompt must be exhaustive and foundational. The
model generates everything from scratch, so the full 5-layer structure is
mandatory — Scene, Characters, Action, Camera, Audio & Style. Without all five
layers, the model produces generic movement or inconsistent physics. Multi-shot
is available and uses timecodes. [src 1, 7]

**Image-to-Video (i2v / Frame / Elements):** The prompt acts as a cinematic
director's instruction for an existing scene. Instead of establishing the subject
(the anchor image already does that), the prompt focuses exclusively on *how the
scene evolves from the image* — camera movements, environmental changes, micro-
motions, and temporal flow. Re-describing the static subject wastes token
budget and can conflict with the anchor. [src 1, 7, 3]

Key i2v rules:
- Lead with camera: open with a specific camera movement to define how the frame
  animates (e.g. "Slow dolly push-in", "Cinematic tracking shot"). [src 1]
- Focus on evolution: describe what *changes* from the anchor (sweat beading,
  leaves moving, dust drifting) rather than re-stating the subject's appearance.
  [src 1, 3]
- Include motion intensity for the evolving elements. [src 1, 3]
- Maintain detail: explicitly instruct the model to preserve specific image
  details (signage, textures) that should not drift. [src 7]

**Media i2v can reference:**
- **Images** — first frame, last frame, or both; up to 10 images to anchor
  character traits and style. [src 7, 1]
- **Audio** — native dialogue (character labels + tone) and SFX notation;
  audio directives are embedded in the prompt the same way as t2v. [src 7]
- **Video** — reference videos for style/subject consistency anchors (advanced
  use). [src 7]

**Multi-scene vs frame-based:**
i2v operates as **frame-based** — the prompt guides the VCoT to interpolate
motion between fixed visual reference points (start frame, end frame). This
reduces randomness and constrains how the output resolves visually. Multi-shot
timecodes are also possible in i2v but the primary mode is single-shot frame
interpolation. t2v can freely span 2–6 multi-shot scenes. [src 7, 1]

**i2v acceptsMedia:** `['image', 'audio', 'video']`
**i2v multiScene:** `false` (frame-based primary; timecode multi-shot is advanced
and not the default workflow)

---

### Conflicts & unknowns

- **Structural order disagreement:** Three different orderings appear across
  sources (5-layer Scene-first; Camera-first; Subject-first). All are compatible
  with Kling's VCoT in principle. Defaulting to the 5-layer Scene-first as it is
  the only one cited as "the industry benchmark" [src 7]. Flag for Phase 3 to test
  Camera-first for i2v (since i2v leads with camera per the seed file).
- **i2v multiScene ambiguity:** Sources confirm timecode multi-shot works in i2v
  but treat it as advanced/secondary. Setting `multiScene: false` (frame-based
  default) is conservative; needs Phase 3 confirmation.
- **No first-party Kuaishou documentation:** The notebook has no official-docs
  tier sources. All guidance is community-deep-dive or platform-hosting guides.
  Phase 3 testing on real model output is especially important here.
- **Token length ceiling:** Sources do not state an official token limit. The
  "200 words outperforms 20 words" guidance implies no hard cap, but longer
  prompts have not been tested for degradation. Phase 3 should probe length
  boundaries.
- **i2v video reference:** Whether reference-video anchoring is natively supported
  in all hosting platforms (vs only some) is unclear from sources. Mark
  `video` in `acceptsMedia` but flag for verification.

---

## Part B — Synthesis (map to RecipeSchema)

### Recipe-level

| Field | Value |
|---|---|
| `modelId` | `kling-3.0` |
| `family` | `kling` |
| `displayName` | `Kling 3.0` |
| `status` | `draft` |
| `notes` | VCoT reasoning engine; separate negative-prompt field; motion intensity 0.1–1.0 scale; native audio. No official Kuaishou docs in notebook — all guidance from community/platform sources. t2v is multi-shot (2–6 scenes, up to 15s); i2v is frame-based (anchor image → motion interpolation). |
| `modes` | `t2v`, `i2v` |

---

### Mode: t2v

| Field | Value |
|---|---|
| `outputFormat` | `prose` (flowing cinematic prose with structured inline tags for dialogue, multi-shot breaks, and SFX) |
| `lengthNorm` | `150–250 words` |
| `structureOrder` | `["Scene", "Characters / Elements", "Action", "Camera", "Audio & Style"]` |
| `vocabulary` | see below |
| `dos` | see below |
| `donts` | see below |
| `negativeHandling` | `separate-field` |
| `examplePrompts` | Neon ramen shop; Professional ballerina; Kitchen argument (see Part A Q7) |
| `systemPrompt` | drafted below |
| `acceptsMedia` | `[]` |
| `multiScene` | `true` (2–6 shots, up to 15s, timecode-labelled) |

**Vocabulary (t2v):**

- camera: dolly push-in, slow tracking shot, whip-pan, crane shot, handheld drift, rack focus, crash zoom, shoulder-cam drift, wide-angle steadicam, macro 85mm lens, anamorphic lens flare
- motion: heel-first steps, fabric sway, speed ramp, lateral pass, explosive strides
- micro-motion: breathing, blinking, drifting dust, steam rising, broth splattering, condensation, leaves swirling
- intensity: 0.1–0.3 subtle, 0.4–0.6 natural, 0.7–1.0 dynamic
- lighting: golden hour, soft diffused natural light, directional studio lighting, cool blue glow, neon-lit, flickering fluorescent
- style: 35mm film grain, shallow focus, glowing bokeh, muted pastel tones, cinematic, 24fps film look

**Dos (t2v):**

1. Write the prompt as flowing cinematic prose, never a keyword list.
2. Open with Scene (location, time of day, lighting) to anchor the model spatially.
3. Assign unique character labels (`[Character A: description]`) and keep descriptors identical across all shots.
4. Break action into beginning → middle → end sequential steps using specific cinematic verbs.
5. Include a `motion intensity 0.1–1.0` value for every significant action.
6. Assign ONE camera movement per shot; label multi-shot sequences with timecodes (`Shot 1 (0–5s): …`).
7. Integrate dialogue using `[Character A: tone]: "text"` format; SFX with `SFX:`.
8. Always include a separate Negative Prompt block.

**Donts (t2v):**

1. Never use keyword lists — Kling processes cinematic intent, not bag-of-words.
2. Never use pronouns ("he", "she") for dialogue attribution; always use character labels.
3. Never vary a character's physical descriptors between shots (even small changes cause identity drift).
4. Never stack multiple camera movements in a single shot ("pan and zoom and dolly").
5. Never request physics-defying actions or overcrowd a clip with too many complex motions.
6. Never leave the motion endpoint undefined — give the model a clear physical resolution.
7. Never omit the negative prompt; doing so reliably increases artifact rates.

**System prompt (t2v draft):**

```
You are an expert Kling 3.0 Text-to-Video Prompt Engineer.

Kling 3.0 uses Visual Chain-of-Thought (VCoT) reasoning. It does not process keyword lists — it interprets cinematic intent. Write prompts as flowing prose that reads like a director's shooting instruction.

STRUCTURE — always follow this five-layer order:
1. Scene: location, time of day, atmospheric lighting (the spatial anchor).
2. Characters/Elements: unique identities with fixed physical labels (e.g. "[Character A: the woman in the red coat]"). Never use pronouns. Never vary descriptors between shots.
3. Action: movement in sequential steps (beginning → middle → end). Use explicit cinematic verbs (heel-first steps, fabric sway, speed ramp). Never write "moves" or "goes".
4. Camera: ONE shot type + ONE movement per shot (e.g. "Static tripod medium shot", "Slow dolly push-in"). For multi-shot, label with timecodes: "Shot 1 (0–5s): …"
5. Audio & Style: dialogue with [Character A: tone]: "text", SFX: cues, filmic aesthetic (35mm grain, bokeh, palette).

MOTION INTENSITY: include a numeric value 0.1–1.0 for every significant action.
- 0.1–0.3: subtle micro-motion (breathing, dust drifting, steam rising)
- 0.4–0.6: natural motion (walking, gesturing, pouring)
- 0.7–1.0: dynamic/kinetic (running, dancing, striking)

LENGTH: target 150–250 words. A structured 200-word prompt outperforms a vague 20-word one.

OUTPUT FORMAT:
- Main prompt: cinematic prose following the 5-layer structure.
- Negative Prompt: a separate keyword list of artifacts to suppress (morphing textures, warped limbs, extra fingers, distorted faces, flickering, foot sliding, background shifting).

DO NOT stack camera movements. DO NOT describe physics-defying actions. DO NOT leave the clip without a defined motion endpoint.

When the user provides an idea, transform it into a complete Kling 3.0 t2v prompt. If the idea is short, expand with high-quality cinematic context. If it is complex, condense into 1–3 well-structured shots. Output only the finished prompt (main + Negative Prompt block).
```

---

### Mode: i2v

| Field | Value |
|---|---|
| `outputFormat` | `prose` (motion-evolution prose; camera-first; does NOT re-describe the anchor image) |
| `lengthNorm` | `80–150 words` (shorter than t2v — subject is anchored by image, not prose) |
| `structureOrder` | `["Camera movement", "Scene evolution / micro-motions", "Motion intensity", "Cinematic texture / lighting detail", "Audio & Style (if applicable)"]` |
| `vocabulary` | same camera + motion vocabulary as t2v; micro-motions especially important |
| `dos` | see below |
| `donts` | see below |
| `negativeHandling` | `separate-field` |
| `examplePrompts` | i2v park walk (see below) |
| `systemPrompt` | drafted below |
| `acceptsMedia` | `['image', 'audio', 'video']` |
| `multiScene` | `false` (frame-based interpolation; timecode multi-shot is advanced and not the primary i2v pattern) |

**Dos (i2v):**

1. Open with a specific camera movement — this defines how the anchor frame animates.
2. Describe only what *evolves* from the anchor: camera movement, environmental changes, micro-motions.
3. Include motion intensity for every evolving element.
4. Explicitly instruct the model to maintain key anchor details (signage, textures) if they must not drift.
5. Reference audio cues using the `SFX:` notation and dialogue using character labels if speech is present.
6. Keep prose concise — the image already establishes subject and environment.
7. Always include a separate Negative Prompt block focused on anchor-preservation failures (foot sliding, background morphing, floating).

**Donts (i2v):**

1. Never re-describe the subject from the anchor image — waste of context and can override the visual anchor.
2. Never establish a new scene or location that contradicts the anchor image.
3. Never use vague motion verbs; be specific about what physically changes.
4. Never omit motion intensity.
5. Never stack multiple camera movements in a single shot.
6. Never describe physics-defying transitions that would require the anchor image to transform structurally.

**Example prompt (i2v — park walk baseline):**

Cinematic tracking shot following from behind, starting from the anchor image of a man in the park. The man takes slow natural steps, motion intensity 0.5. Autumn leaves swirl gently around his feet; warm golden-hour light catches dust particles drifting in the air. Shot on 35mm film, shallow focus, glowing bokeh.
Negative Prompt: floating walk, foot sliding, background shifting, motion blur, morphed limbs. [src 1]

**System prompt (i2v draft):**

```
You are an expert Kling 3.0 Image-to-Video (Frame) Prompt Engineer.

In i2v mode, the user provides an anchor image. The model animates FROM that image. Your job is NOT to describe the subject — the image already does that. Your job is to direct how the scene EVOLVES: camera movement, micro-motions, environmental changes, and temporal flow.

RULES:
1. Camera first: open with a precise camera move that defines the animation's visual energy (e.g. "Slow dolly push-in", "Cinematic tracking shot from behind", "Macro pull-back").
2. Evolve, don't re-describe: focus on changes (sweat beading, leaves swirling, steam rising, dust drifting) — not the static subject.
3. Motion intensity: include a value (0.1–1.0) for every evolving element.
   - 0.1–0.3: micro-motion (breathing, hair drift, steam)
   - 0.4–0.6: natural motion (walking, gesturing)
   - 0.7–1.0: dynamic (sprinting, impact, dramatic gesture)
4. Preserve anchor detail: if the image contains specific text, textures, or props that must not drift, explicitly name them as anchors to maintain.
5. Audio (optional): add dialogue with [Character A: tone]: "text" or SFX: cues if audio is needed.
6. Keep it short: 80–150 words. Concise, directed prose — not an essay.

OUTPUT FORMAT:
- Main prompt: camera-first evolution prose.
- Negative Prompt: floating motion, foot sliding, background morphing, identity drift, extra limbs, flickering textures.

When the user provides an idea or image description, produce a complete Kling 3.0 i2v prompt that animates the anchor naturally. If only a simple idea is given, invent high-quality cinematic context. Output only the finished prompt (main + Negative Prompt block).
```

---

### Readiness verdict

- [x] All 7 questions answered with source pins.
- [x] Mode follow-up answered (t2v vs i2v differences, acceptsMedia, multiScene).
- [x] Conflicts identified and resolved conservatively (structural order; i2v multiScene; video reference support).
- [x] Every schema field filled, or gap documented as a Phase 3 test.
- [x] No official-docs tier sources — all guidance is community/platform. Flag for Phase 3.

**Verdict: ready to author draft recipe** — sufficient coverage across 7 sources for both modes. Key Phase 3 validation points: (1) Camera-first vs Scene-first ordering for i2v; (2) confirm i2v multiScene default (frame-based vs timecode multi-shot); (3) probe length upper bound; (4) verify video reference support across platforms; (5) validate negative prompt effectiveness for the listed artifact classes on the real model.
