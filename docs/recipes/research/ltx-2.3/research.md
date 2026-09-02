# Research & Synthesis Worksheet — LTX 2.3

- **Model version:** LTX 2.3   **Mode(s):** t2v (text-to-video; native audio included)
- **Research date:** 2026-06-22   **Sources:** see `sources.md`

> **PARTLY SUPERSEDED, 2026-08-17 (MPI-27).** Lightricks' own shipped rewriter
> for LTX-2.3 was read on that date (`sources.md` rows 10–11) and it outranks
> the community synthesis this worksheet was built from. Where they disagree the
> vendor wins, and they disagree in three places recorded here: the **150–300
> word** figure below is the vendor's **150–220**; **"use collective nouns, never
> exact counts"** is reversed (identify people specifically, differentiate them
> consistently); and the closing **guardrails** element is an **aesthetic
> quality** pass. This worksheet is left as the record of what the community
> sources said — do not re-adopt its numbers from here.

---

## Part A — Research (the 7 standard questions)

### 1. Output format & length

Single, flowing prose paragraph — the sources call it a "mini-screenplay." Keyword lists, bullet points, and fragmented phrases are explicitly forbidden: they break the model's temporal continuity understanding. [1, 3, 5, 6, 8]

Typical length: **150–300 words** (roughly 4–8 descriptive sentences) for a standard 10-second video. Prompt length must scale with video length; a short prompt for a long video causes the model to "rush" action or collapse into static frames. [1, 7, 8]

### 2. Structural order

The sources describe a **Six-Element Prompt Framework** as the industry standard for LTX 2.3. The ordered sequence is: [1, 3]

1. **Shot Establishment** — initial framing (Macro, Wide, Close-up) plus genre/style cue (Noir, Sci-Fi) to set visual scale.
2. **Scene Setting** — lighting conditions, surface textures (wet pavement, worn fabric), and environmental mood.
3. **Action Progression** — core movement described as a natural chronological sequence, beginning to end, in present tense.
4. **Character Definition** — physical features and emotion expressed as physical manifestations (gestures, micro-expressions), not abstract labels.
5. **Camera Movement** — spatial navigation (Dolly-in, Handheld) plus the "end-state" of the subject after the move, so the model can complete the trajectory.
6. **Audio Integration** — ambient foley, environmental acoustics, and spoken dialogue (in quotation marks) for bimodal synchronization.

Alternative patterns also cited: a simplified **Subject → Action → Camera → Mood** order for short or legible prompts [1, 8]; and for high-fidelity 4K output, a **Scene Anchor → Subject/Action → Camera/Lens → Visual Style → Motion/Time Cues → Guardrails** layered format. [5]

### 3. Vocabulary

The model responds best to **formal cinematographic syntax** and **concrete, descriptive verbs**; abstract aesthetic labels ("dynamic," "stunning," "hyper-realistic") carry less weight than specific physical descriptions. [1, 3]

**Camera:**
- Focal lengths: "24mm" (expansive space), "35mm" (documentary realism), "50mm" (natural eye), "85mm" (character intimacy/shallow DoF), "200mm" (telephoto depth flattening) [1, 6, 7]
- Movements: "slow dolly-in," "handheld jitter," "whip pan," "side tracking shot," "crane lift," "low-angle slow tracking shot" [1, 8]
- Shutter: "180-degree shutter equivalent," "natural motion blur," "fast shutter" [1]
- Framing: "macro shot," "extreme wide," "over-the-shoulder," "establishing shot" [1, 5]

**Motion:**
- Environmental: "drifting," "pouring," "rising into frame," "swirling," "rippling" [1]
- Acting beats (instead of emotions): "downward-cast eyes," "shoulders slumped forward," "a slight tremor in the hands," "clenched jaw," "fingers tighten" [1, 3]
- Temporal cues: "on the heavy drum beat," "at the 4-second mark," "after a beat of silence" [1, 4]

**Lighting:**
- "Golden Hour," "tungsten highlights," "cold neon glow," "high-contrast chiaroscuro," "harsh desert noon sunlight" [1, 5]
- Surface/atmosphere: "wet pavement," "dust motes," "volumetric fog," "rain reflections" [1]

**Style:**
- Genres: "noir," "cyberpunk," "documentary," "period drama," "anime" [1]
- Aesthetic markers: "VHS," "Fujifilm Provia 100F film texture," "claymation," "fashion editorial" [1]
- Color: "muted desaturation," "cyberpunk purple and teal contrast," "earthy ochre and deep moss green" [1]

### 4. Mistakes & failure modes

**Failure modes with specific technical names:** [1, 3]
- *Latent distortion* — complex physics, rapid fighting, chaotic collisions
- *Composition artifacts* — numerical over-constraining ("exactly 5 people")
- *Latent space confusion* — conflicting lighting sources in the same scene
- *Temporal rushing / static frames* — prompt too short for the video duration
- *Reduced visual clarity* — overloaded scenes with too many subjects or competing actions

**Do's:** [1, 3, 5, 6, 8]
- Write a single, flowing prose paragraph (mini-screenplay structure)
- Use present-tense verbs throughout
- Describe physical manifestations of emotion, not the emotion label itself
- Focus on one dominant scene priority per prompt
- Match prompt length to video duration (150–300 words for 10 s)
- Describe the "end-state" after a camera move to help the model complete the trajectory
- Use formal cinematographic language: focal lengths and named camera moves
- Use collective nouns ("a group," "a crowd") instead of exact counts

**Don'ts:** [1, 3, 5, 8]
- No keyword lists or bullet points
- No abstract emotional labels ("happy," "confused," "sad")
- No aesthetic fluff words ("stunning," "hyper-realistic," "dynamic")
- No multiple scene ideas in a single prompt
- No exact numerical constraints ("pan right at 2 degrees per second," "5 people")
- No conflicting internal instructions (e.g., "peaceful lake" + "crashing waves")

### 5. Negative prompts

LTX 2.3 does **not** have a traditional separate negative-prompt field. The sources describe two mechanisms instead: [1, 5]

1. **Guardrails** — the final layer of the 4K layered prompt format. These are written as prose statements in the positive direction ("no distortion," "no blown highlights," "no AI artifacts," "smooth gimbal stabilization," "stable dolly push") embedded at the end of the main paragraph rather than in a separate list. [1, 5]

2. **Strategic avoidance** — simply omit problematic elements from the prompt entirely, using professional alternatives instead: swap emotional labels for physical acting beats; swap exact counts for collective nouns; swap complex physics for smooth sequenced movements; swap conflicting lighting for a single logical light source. [1, 3]

**Schema mapping:** `negativeHandling: "inline-positive"` — negatives are reframed as positive-direction constraints and appended to the prose; no separate field exists.

### 6. What's unique

**Unusually well:** [1, 2, 4, 6]
- *Native audio-visual joint generation* — sound (lip sync, SFX, ambient) and video are produced simultaneously rather than added in post; audio sync is a first-class prompt target via temporal cues. This is a defining difference from Sora, Kling, and Flux. [2, 4]
- *Optical precision* — formal focal length and shutter specs are interpreted as direct hardware instructions; depth compression and motion blur respond to cinematographic vocabulary with professional accuracy. [1, 6]
- *Fine detail and textures* — new VAE architecture preserves hair texture, skin calluses, fine fabric weaves. [1]
- *Micro-expressions and gestural performance* — excels when emotion is specified through physical acting beats. [1]
- *Atmospheric lighting* — treats light as a physical force interacting with specific surfaces; particularly strong with complex reflective environments. [1, 6]
- *Native portrait (vertical) video* — trained on portrait data for native 1080×1920, not cropped from horizontal. [2]
- *Temporal audio cueing* — can synchronize specific visual actions ("glass shatters on the third bass hit") to auditory beats and timestamps. [4, 6]

**Unusually poorly:** [1, 3, 4]
- Abstract emotional labels map to nothing — always requires physical-beat substitution.
- Exact counts and numerical constraints produce composition artifacts.
- Complex physics / rapid chaotic motion (fights, collisions) causes latent distortion.
- Legible text and logos are unreliable (better than predecessors, not yet production-ready).
- Long-take actor adherence is inconsistent — model may drift from character instruction mid-clip. [4]

### 7. Example prompts (paraphrased from sources)

These are illustrative paraphrases reflecting the source examples, not verbatim copies.

**Example 1 — Person walking (desert)** [src 2]
A lone traveller crosses a scorching noon desert, boots pressing into sand with a soft crunch. The camera tracks from behind and slightly to the side, following the rhythm of each step. A metal canteen swings at his waist catching harsh light. A mirage wavers along the distant horizon as he continues forward without slowing.

**Example 2 — Landscape (cabin at dawn)** [src 2]
Fog rolls over pine trees around a mountain cabin at dawn. A slow rising drone-like camera move; cool blue light; soft wind in the branches; contemplative cinematic tone.

**Example 3 — Object / product (beauty bottle)** [src 2]
A luxury skincare bottle rests on a wet stone surface. A gentle push-in camera; soft morning light with subtle water movement; premium beauty commercial mood; minimal background distraction.

---

### Conflicts & unknowns

- **Structural order conflict:** The community-deep-dive (src 1) recommends the Six-Element framework (Shot → Scene → Action → Character → Camera → Audio), while src 5 (fal.ai) describes a 4K Layered Format (Scene Anchor → Subject/Action → Camera/Lens → Visual Style → Motion/Time Cues → Guardrails). The two are compatible but label the layers differently. Resolution: adopt the Six-Element order as the primary sequence (most cited, [1, 3, 6]) and treat the 4K Layered format as an alias noting that "Guardrails" maps to the inline-positive negatives appended at the end. Flag for Phase 3 testing.

- **Negative handling ambiguity:** Src 5 implies the guardrails are a distinct final block; src 1 and 3 treat strategic avoidance as main-prompt positivisation. The approach is the same in practice; the schema field `inline-positive` captures both correctly.

- **Audio in t2v:** Native audio generation is confirmed by official sources [2, 4, 6, 7] but the API guide [8] does not detail a separate audio-prompt parameter. Whether audio is a field or only described in the main prose is unknown. Flag for Phase 3.

- **Prompt length scaling:** Src 1 states 150–300 words for 10 s. The scaling rule for shorter (e.g., 5 s) or longer (e.g., 20 s) clips is not quantified beyond "match length to duration." Flag for Phase 3.

---

## Part B — Synthesis (map to RecipeSchema)

**Recipe-level**

| Field | Value |
|---|---|
| `modelId` | `ltx-2.3` |
| `family` | `ltx` |
| `displayName` | `LTX 2.3` |
| `status` | `draft` |
| `notes` | Native audio-visual joint model (Lightricks). Audio sync via temporal cues in prose. Portrait video (1080×1920) natively supported. No separate negative-prompt field — negatives expressed as positive-direction guardrails appended to prose. Prompt length must scale with video duration (baseline 150–300 words / 10 s). |
| `modes` | `t2v` |

**Per mode: t2v**

| Field | Value |
|---|---|
| `outputFormat` | `prose` |
| `lengthNorm` | `150–300 words (4–8 sentences); scale with video duration` |
| `structureOrder` | `["Shot Establishment", "Scene Setting", "Action Progression", "Character Definition", "Camera Movement", "Audio Integration", "Guardrails (inline)"]` |
| `vocabulary` | camera: ["slow dolly-in", "handheld jitter", "whip pan", "crane lift", "24mm", "85mm", "180-degree shutter equivalent", "macro shot", "extreme wide"]; motion: ["drifting", "pouring", "swirling", "rippling", "rising into frame"]; lighting: ["golden hour", "tungsten highlights", "cold neon glow", "volumetric fog", "chiaroscuro"]; style: ["noir", "cyberpunk", "documentary", "VHS", "Fujifilm Provia 100F", "fashion editorial"]; acting: ["downward-cast eyes", "shoulders slumped forward", "a slight tremor in the hands", "clenched jaw"] |
| `dos` | ["Write a single flowing prose paragraph structured as a mini-screenplay", "Use present-tense verbs throughout", "Describe emotion as physical acting beats not abstract labels", "Specify focal lengths and named camera movements", "Match prompt word count to video duration (150-300 words per 10 seconds)", "Describe the end-state of a subject after a camera move", "Use collective nouns (a group, a crowd) for quantities", "Include audio integration: ambient sound, foley, and dialogue in quotes"] |
| `donts` | ["No keyword lists or bullet points", "No abstract emotional labels (happy, sad, confused)", "No aesthetic fluff (stunning, dynamic, hyper-realistic)", "No multiple competing scene ideas in one prompt", "No exact numerical counts for subjects", "No conflicting lighting sources in the same scene", "No complex chaotic physics (rapid fighting, simultaneous collisions)"] |
| `negativeHandling` | `inline-positive` |
| `examplePrompts` | ["A lone traveller crosses a scorching noon desert, boots pressing into sand with a soft crunch. The camera tracks steadily from behind and to the side. A metal canteen swings at his waist catching the harsh sunlight. A mirage wavers on the distant horizon as he continues without slowing.", "Fog rolls over pine trees around a mountain cabin at dawn. A slow rising drone-like camera move. Cool blue light filters through the branches. Contemplative cinematic tone. Quiet ambient wind.", "A luxury skincare bottle on a wet stone surface. A gentle push-in camera. Soft morning light with subtle water movement. Premium beauty commercial mood. Clean minimal background."] |
| `systemPrompt` | (to be authored in Phase 2.2 recipe-authoring step — not this file) |
| `acceptsMedia` | `[]` (t2v — text only) |
| `multiScene` | `false` |

---

### Readiness verdict

- [x] All 7 questions answered with source pins.
- [x] Conflicts resolved or flagged for Phase 3 (structural order aliases, audio parameter shape, length-scaling rule).
- [x] Every schema field can be filled; three open items are Phase 3 test targets, not blockers.
- **Verdict:** ready to author draft recipe — all schema fields have concrete values; open items (audio prose vs. field, duration scaling, Six-Element vs. 4K-Layered naming) are testable in Phase 3 against the real model.
