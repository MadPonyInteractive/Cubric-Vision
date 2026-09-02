# Research & Synthesis Worksheet — SDXL

- **Model version:** SDXL (Stable Diffusion XL)   **Mode(s):** t2v (text-to-image only)
- **Research date:** 2026-06-22   **Sources:** see `sources.md`

---

## Part A — Research (the 7 standard questions)

All answers derive from a single notebook source (src #1): a YouTube deep-dive
("I Spent 1000 Hours Researching This…") representing ~1000 hours of empirical
testing. No official Stability AI documentation is in the notebook.

### Q1 — Output format & length

SDXL responds best to a **structured-tag** format — not flowing prose and not
an undifferentiated keyword dump, but a specific sequence of comma-separated
keyword-phrase segments, one segment per structural slot. The author distilled
this into a 10-element template after extensive iteration. There is no stated
token count, but the guiding principle is restraint: avoid "overloading" the
model with too many directives. Each slot should be concise — often a single
evocative word or a compact noun phrase (e.g., "pensive" for mood, "Sony A7 III"
for camera). A typical full prompt fills roughly 10–15 comma-separated segments
across the 10 slots. [src #1]

### Q2 — Structural order

The recommended 10-part sequence, in order: [src #1]

1. **Style of photo** — sets the aesthetic register and "grounds" the image
   (e.g., candid photography, documentary photography, lifestyle photography).
   This is the most important slot; never skip it.
2. **Subject** — the primary person or object (e.g., "young woman", "elderly man").
3. **Important features and details** — physical specifics and one-word mood
   adjectives (e.g., "long blonde hair, blue eyes, pensive"). Mood adjectives
   give the model interpretive "flavor".
4. **Pose or action** — evocative verbs or simple action descriptions
   (e.g., "sitting", "laughing", "leaning against a wall").
5. **Framing of the image** — shot composition (e.g., "close up on face",
   "full body", "headshot", "upper body").
6. **Background / Setting** — contextual cues without micromanaging every element
   (e.g., "city park in Autumn with fallen leaves", "rocky edge of a cliff
   overlooking a misty forested valley").
7. **Lighting** — mood and realism driver (e.g., "golden hour", "cinematic
   lighting", "overcast lighting", "chiaroscuro").
8. **Camera angle** — perspective (e.g., "eye level", "from above", "Dutch angle").
9. **Camera properties** — specific hardware or film names, not generic specs
   (e.g., "Sony A7 III", "shot on Red camera", "Agfa Vista").
10. **In the style of [photographer name]** — optional but reinforces artistic
    direction (e.g., "in the style of Walker Evans", "in the style of Tim Walker").

Not every slot is mandatory; the style tag and at least subject + framing are
the minimum for reliable photorealism.

### Q3 — Vocabulary

The model responds to specific named entities and evocative descriptors rather
than technical abstractions. [src #1]

**Subject / mood:**
- Mood adjectives: pensive, shy, angry (single words convey character most
  efficiently)
- Physical traits: long blonde hair, blue eyes, grey hair and weathered skin
- Clothing: casual hiking clothes, simple t-shirt, street fashion
- Actions: laughing, dancing, playing guitar, leaning against a wall,
  standing with hands on hips

**Style of photo:**
- Authenticity register: candid photography, documentary photography,
  lifestyle photography
- Artistic register: pictorialist style, surrealist photo (use weight ~1.5),
  abstract views, large format
- Note: "glamor photography" risks unintended nudity — requires NSFW in negative

**Lighting:**
- Dramatic: chiaroscuro, cinematic lighting, creative shadowplay
- Natural: golden hour, overcast lighting (flat realistic look)
- Artificial/studio: high key lighting, neon lighting, lit by candlelight

**Camera / technical (use named gear, not generic specs):**
- Camera bodies: Sony A7 III, Canon EOS 5D, shot on Red camera, Bolex H16
- Vintage cameras: Diana F+, Hasselblad 500CN, Holga 120N, Kodak Brownie,
  Polaroid SX-70
- Lenses with real visual impact: 8mm fisheye lens, Voigtlander Nocturn 50mm
- Film stocks: Agfa Vista, Ilford HP5 Plus (B&W), Lomochrome Color, Velvia 100
- Note: "50mm" or "f-stops" as generic specs produce no measurable difference
  in focal length or background blur; they function only as mild photorealism cues

**Quality enhancers (via LoRA, flagged for Phase 3):**
- "polyhedron new skin" LoRA — improves skin texture realism
- "detailed eyes" LoRA — improves eye realism

### Q4 — Mistakes & failure modes

**Common failure modes:** [src #1]

- **Prompt overload** — too many directives at once overwhelm the model and
  reduce coherence. Leave interpretive room.
- **Hands and feet** — SDXL is better than older SD versions but still prone to
  anatomical errors here. Avoid foregrounding hands/feet; correct with in-painting
  after generation.
- **Generic focal length specs** — "50mm lens", "150mm lens", "f/2.8" make no
  measurable difference to background blur or composition. Use named cameras and
  distinctive lenses instead.
- **"Same face" syndrome from A-Detailer** — the A-Detailer post-processor can
  produce the same face repeatedly across images. Skip it; fix faces via
  in-painting instead.
- **"Glamor photography" triggering nudity** — this style tag can generate
  unclothed subjects unless NSFW appears in the negative prompt.
- **Camera props in-hand** — camera-related keywords (hardware names, etc.)
  can cause the model to place a physical camera in the subject's hands unless
  "camera" is added to the negative prompt.
- **Skipping the style-of-photo slot** — without a photography style anchor,
  skin tones flatten and realism degrades.
- **Micromanaging the background** — listing every background element removes
  the model's interpretive advantage; contextual cues outperform exhaustive lists.

**Do's:** Use the 10-part structure; weight "unrealistic dream" at 1.4 in the
negative for maximum realism (1.1–1.2 for a deliberate grungy/film-grain look);
use evocative single-word mood adjectives; name specific cameras with distinct
visual signatures; use in-painting for facial corrections rather than fighting
the prompt.

**Don'ts:** Use generic f-stop or focal-length specs; micromanage every
background element; forget NSFW in negative when using glamor photography;
rely on A-Detailer for production work.

### Q5 — Negative prompts

SDXL **actively benefits from a dedicated negative prompt field** — this is the
model's primary mechanism for quality control, anatomical correction, and content
safety. Negatives and positives occupy separate fields. [src #1]

**What belongs in the negative prompt:**
- Quality / dream-filter removal: `bad dream`, `unrealistic dream:1.4`
  (reduce weight to 1.1–1.2 to preserve a grungy/film-grain aesthetic)
- Anatomical correction: `bad hands 5`, `big eyes`
- Content safety: `NSFW` (required when using glamor photography or other
  suggestive style tags)
- Object prevention: `camera` (stops the model placing a literal camera in
  the subject's hands when hardware names appear in the positive prompt)

**What stays in the positive prompt:**
All constructive description — the 10-part structural sequence. The positive
prompt handles everything you want to see; the negative handles what to exclude
or suppress.

Weights are meaningful: `bad hands 5` uses a weight of 5 to strongly suppress
hand artifacts; `unrealistic dream:1.4` at standard weight is strongest for
photorealism. This weighted syntax is specific to SDXL / Automatic1111-style
interfaces.

### Q6 — What is unique about SDXL

**Unusually good at:** [src #1]

- **Hand and foot rendering** — relative improvement over older SD models (though
  still imperfect; the source acknowledges hands still need in-painting attention).
- **Authentic skin texture** — particularly responsive to "documentary photography"
  as a style tag, which unlocks realistic wrinkles, lines, and grounded skin tones
  without LoRAs.
- **Hardware simulation** — strongly responds to named camera bodies (Sony A7 III,
  Red camera) and film stocks (Agfa Vista, Ilford HP5 Plus), producing visually
  distinct results for each named emulation.
- **Mood capture from single adjectives** — the model translates one-word mood
  descriptors ("pensive", "shy", "angry") into expressive imagery without needing
  extended description.
- **Candid / unposed aesthetic** — the "candid photography" tag reliably produces
  images where subjects appear genuinely engaged in activity rather than posing,
  which is hard to achieve with generic prompting.

**Unusually poor at:** [src #1]

- **Technical camera math** — f-stops, focal lengths as numbers (50mm, 150mm)
  produce no actual change in depth-of-field or field-of-view. The model treats
  them as weak photorealism signals, not optical parameters.
- **Hands/feet detail** (still, despite SDXL improvement over SD 1.5) — anatomical
  errors in extremities remain common and typically require in-painting.
- **Complex multi-element backgrounds via explicit enumeration** — the model
  performs better with evocative contextual cues than with exhaustive lists of
  background items.
- **Facial consistency across generations** — without strong LoRA or ControlNet
  anchoring, faces vary between runs.

### Q7 — Example prompts

Three example prompts derived from the source's demonstrated examples. [src #1]

**Example 1 — The cliff scene (source's primary demo)**

Positive: `Candid photo, pensive young woman, long blonde hair, casual hiking clothes, sitting, full body, on the rocky edge of a cliff overlooking a misty forested valley, outdoor, golden hour, eye level, Sony A7 III`

Negative: `bad hands 5, bad dream, unrealistic dream:1.4, NSFW, big eyes, camera`

**Example 2 — Autumn park lifestyle shot**

Positive: `Lifestyle photography, smiling young man, simple t-shirt, standing with hands on hips, upper body, city park in Autumn with fallen leaves, overcast lighting, eye level, Canon EOS 5D`

Negative: `bad hands 5, bad dream, unrealistic dream:1.4, NSFW, big eyes, camera`

**Example 3 — Gritty documentary portrait**

Positive: `Documentary photography, pensive elderly man, grey hair and weathered skin, headshot, sitting on a wooden bench, cinematic lighting, eye level, shot on Red camera, in the style of Walker Evans`

Negative: `bad hands 5, bad dream, unrealistic dream:1.4, NSFW, big eyes, camera`

---

### Conflicts & unknowns

- **Single source, no cross-validation:** All findings come from one YouTube
  creator's empirical testing. No official Stability AI documentation is in the
  notebook. The 10-part structure and vocabulary are well-evidenced within the
  source but have not been cross-checked against Stability AI's own prompting
  guides or the Civitai community. Flag for Phase 3 to validate the structure
  against official docs.

- **Negative prompt weighting syntax assumes Automatic1111/ComfyUI-style
  interface:** The `bad hands 5` and `unrealistic dream:1.4` notation is specific
  to AUTOMATIC1111's weighting syntax. If accessed via a different host (fal.ai,
  Replicate, etc.), weight tokens may not be supported. Phase 3 must confirm the
  interface before relying on weights.

- **LoRA recommendations not testable via Enhancer:** The "detailed eyes" and
  "polyhedron new skin" LoRA references describe local ComfyUI/A1111 add-ons,
  not prompt text. The enhancer cannot inject LoRA selections. These improve
  output quality but are outside the recipe's scope; note in `notes` field.

- **"Glamor photography" and NSFW:** The source warns that this style tag can
  generate nudity. The enhancer should either flag this in the system prompt or
  default to adding NSFW to the negative when glamor photography is selected.
  Defaulting NSFW-in-negative is the safer choice; flag for Phase 3 confirmation.

- **SDXL version / checkpoint specificity unknown:** The source references
  "SDXL" but also mentions specific community checkpoints with names like
  "Absolutely Realism". The recipe scope assumes base SDXL unless a checkpoint
  is specified. Phase 3 should confirm which checkpoint the recipe is being
  validated against.

---

## Part B — Synthesis (map to RecipeSchema)

### Recipe-level

| Field | Value |
|---|---|
| `modelId` | `sdxl` |
| `family` | `sdxl` |
| `displayName` | `SDXL` |
| `status` | `draft` |
| `notes` | Single community source (YouTube deep-dive, no official docs). Negative prompt weights use A1111 syntax (`bad hands 5`, `unrealistic dream:1.4`) — confirm host interface in Phase 3. LoRA recommendations (detailed eyes, polyhedron new skin) are out-of-scope for the enhancer; document in UI guidance only. "Glamor photography" style should default NSFW to negative. Checkpoint specificity unknown — validate against base SDXL or a named checkpoint in Phase 3. |
| `modes` | `t2v` only |

### Per mode — t2v (text-to-image)

| Field | Value |
|---|---|
| `outputFormat` | `structured-tags` |
| `lengthNorm` | `10–15 comma-separated segments across the 10-part structure; each segment is 1–4 words; avoid overloading` |
| `structureOrder` | `["Style of photo", "Subject", "Features and details (physical traits + mood adjective)", "Pose or action", "Framing", "Background / setting", "Lighting", "Camera angle", "Camera properties (named body or film stock)", "Photographer style (optional)"]` |
| `vocabulary` | See Q3 above — subject/mood, style, lighting, camera/film domains |
| `dos` | See Q4 above — 6 concrete do's |
| `donts` | See Q4 above — 5 concrete don'ts |
| `negativeHandling` | `separate-field` |
| `examplePrompts` | 3 examples from Q7 (positive + negative pairs) |
| `systemPrompt` | Drafted below |
| `acceptsMedia` | `[]` (text-only) |
| `multiScene` | `false` |

### System prompt (draft)

```
You are an expert prompt engineer for SDXL (Stable Diffusion XL), a text-to-image model that produces best results with a structured sequence of keyword-phrase tags — not prose paragraphs.

POSITIVE PROMPT — use the 10-part structure, in this order:
1. Style of photo (REQUIRED — never skip): candid photography, documentary photography, lifestyle photography, large format, pictorialist style, surrealist photo, etc.
2. Subject: the main person or object.
3. Features and details: specific physical traits (hair color, eye color) + one-word mood adjective (pensive, shy, angry).
4. Pose or action: evocative verbs — laughing, dancing, sitting, leaning against a wall.
5. Framing: close up on face, headshot, upper body, full body.
6. Background / setting: contextual cues only — "city park in Autumn with fallen leaves". Do not list every background element; give the model interpretive room.
7. Lighting: golden hour, overcast lighting, cinematic lighting, chiaroscuro, creative shadowplay.
8. Camera angle: eye level, from above, Dutch angle.
9. Camera properties: name a specific camera body or film stock — Sony A7 III, Canon EOS 5D, shot on Red camera, Bolex H16, Agfa Vista, Ilford HP5 Plus. DO NOT use generic specs like "50mm" or "f/2.8" — they have no effect on depth-of-field in SDXL.
10. Photographer style (optional): in the style of Walker Evans, in the style of Tim Walker.

NEGATIVE PROMPT (always provide as a separate field):
Standard baseline: bad hands 5, bad dream, unrealistic dream:1.4, big eyes, camera
Add NSFW whenever a style tag could imply nudity (especially "glamor photography").
Reduce unrealistic dream weight to 1.1–1.2 if a grungy or film-grain aesthetic is desired.

CRITICAL RULES:
- Keep each slot concise (1–4 words or a short phrase). Do not overload slots.
- Avoid foregrounding hands or feet — SDXL still struggles with anatomical accuracy in extremities.
- Do not use f-stop or focal-length numbers as functional optical specs.
- Deliver the result as two clearly labelled blocks: POSITIVE PROMPT and NEGATIVE PROMPT.
- Do not micromanage every background element — give contextual cues and let the model interpret.
```

### Readiness verdict

- [x] All 7 questions answered with source pins.
- [x] Conflicts resolved or flagged for Phase 3 (single source, weight syntax, checkpoint specificity, glamor-NSFW default).
- [x] Every schema field can be filled (or the gap is a documented Phase-3 test).
- **Verdict:** Ready to author draft recipe. Phase 3 must validate: (1) against base SDXL or a named checkpoint, (2) confirm A1111 weight syntax works in the target interface, (3) cross-check structure against any official Stability AI prompting docs, (4) confirm glamor-photography NSFW default behavior.
