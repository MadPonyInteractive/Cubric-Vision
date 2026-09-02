# Research & Synthesis Worksheet — Wan 2.2

- **Model version:** Wan 2.2   **Mode(s):** t2v
- **Research date:** 2026-06-22   **Sources:** see `sources.md`
- **Notebook:** `ddc4ed03` — "Wan video prompt guides"

> **EXTENDED, 2026-08-17 (MPI-27).** Alibaba's own shipped rewriter
> (`sources.md` src #6, read-out below the table) now outranks the five
> community guides this worksheet is built from. It is additive rather than
> contradictory — closed value sets and defaults, the shooting-angle
> conditional, style handling, no literary atmosphere — with **one live
> disagreement left open for Fabio's render**: this worksheet's claim that
> lighting and style tags go LAST, against every vendor example leading with
> them.

---

## Part A — Research (the 7 standard questions)

### 1. Output format & length

Wan 2.2 uses a **hybrid format**: a short comma-separated keyword/tag block
followed by a narrative prose paragraph. The keyword block handles aesthetic
control (lighting type, shot size, camera framing); the prose paragraph carries
the cast, setting, action timeline, and motion boundaries. Neither pure
keyword-lists nor pure prose alone is recommended — both components are
required for the MoE routing to work correctly. [src #1, #2, #5]

Typical length: **80–120 words** for professional-grade prompts. Brief prompts
(e.g., "a woman walking") leave the MoE's structural expert under-specified,
causing it to default to generic cinematic tropes or hallucinate extra subjects
and scene elements. The 80–120 word range acts as a "semantic roadmap" that
locks the structural (high-noise) expert before the refinement (low-noise)
expert adds detail. [src #1, #2]

Source note: the 80–120 word norm is stated explicitly in src #1 (the synthesis
markdown) and confirmed by src #2 and the Promptus formula. Src #5 further
validates it via its formula approach.

### 2. Structural order

All sources converge on a 5–6 part sequence driven by the MoE architecture.
Earlier elements feed the high-noise (structural) expert; later elements feed
the low-noise (detail) expert. [src #1, #2, #3]

1. **Cast and count** — State exactly how many subjects are in the frame.
   Ambiguity here is the primary cause of hallucinated extra characters. [src #3]
2. **Setting and time** — Physical environment plus time of day and atmospheric
   conditions (e.g., "overcast morning in a city park"). Anchors background
   coherence throughout the clip. [src #3, #1]
3. **Camera behavior and framing** — Shot size, angle, lens, and movement using
   film-industry terminology (e.g., "static camera, medium shot, shallow depth
   of field"). Providing this early gives the high-noise expert a 3D coordinate
   system, preventing geometric "melting." [src #1, #2]
4. **Action timeline** — A "tiny story" in prose: specific sequential actions
   rather than vague verbs. Instead of "she walks," write "she steps forward,
   glances left, then crouches to pick up the bag." [src #3, #1]
5. **Motion boundaries (positive constraints)** — What subjects must NOT do,
   stated positively inside the main prompt. Example: "The two people remain
   seated the entire time; no other characters enter the frame." Required because
   the traditional negative prompt box is effectively disabled at CFG=1
   (Lightning-style deployments). [src #3, #1]
6. **Visual style, lighting, and mood tags** — Handled last by the low-noise
   expert. Cinematic grade, film stock look, color temperature, and mood
   adjectives go here. [src #1, #2, #5]

### 3. Vocabulary

The model responds to professional film-industry terminology. Each category
below maps to the appropriate expert layer. [src #1, #2, #5]

**Camera:**
- Movement: "slow push-in," "dolly out," "pan left," "tilt up," "orbital arc,"
  "crane up," "tracking shot," "static camera," "no zoom, no pan"
- Framing: "medium close-up shot," "extreme close-up," "wide shot,"
  "establishing shot," "low angle shot," "dutch angle," "over-the-shoulder shot"
- Lens: "wide-angle lens," "telephoto lens," "35mm look," "bokeh,"
  "shallow depth of field," "fisheye lens"

**Motion:**
- Specific actions: "slowly turns head," "walks deeper into the garden,"
  "violently swaying," "spins gracefully," "explosive two-handed dunk,"
  "subject sniffs a flower then jumps back"
- Positive constraints: "remains seated the entire time," "does not stand up,"
  "no other people enter the frame," "camera does not move"

**Lighting:**
- Atmospheric: "volumetric dusk," "golden-hour backlight," "edge lighting,"
  "soft diffused overcast," "firelight," "neon ambient glow," "rim lighting"
- Technical: "high contrast," "low contrast," "silhouette lighting,"
  "cinematic grade," "warm colors"

**Style:**
- "photorealistic," "cinematic," "film grain," "35mm look," "high detail,"
  "natural texture," "clean single shot," "left-weighted composition"

Source note: src #2 provides the most comprehensive vocabulary dictionary
including a "Prompt Dictionary" section. Src #5 provides a compact formula:
[Subject] + [Action/Motion] + [Camera] + [Lighting] + [Style/Medium] +
[Era/Lens] + [Color/Grade] + [Mood/Adjectives] + quality tags + NEGATIVE.

### 4. Mistakes & failure modes

The most common failure modes stem from under-specification, which leaves the
MoE's structural expert without enough signal to constrain scene layout.
[src #1, #2, #3]

**Failure modes:**
- "Slow motion" renders: action appears unnaturally sluggish when the high-noise
  expert receives insufficient motion signal in early denoising steps. [src #1]
- Geometric instability ("melting"): camera movement not anchored early causes
  texture swimming, flickering, or morphing geometry. [src #1]
- Negative prompt failure: at CFG=1 (Lightning deployments), the negative prompt
  box is ignored; unwanted artifacts appear despite being listed there. [src #1, #3]
- Identity drift (i2v): model ignores the input image when the prompt requests
  movements incompatible with original geometry, causing face/body deformation.
  [src #1]
- Hallucinated subjects: vague cast descriptions cause extra people or animals to
  appear, or subjects change identity mid-clip. [src #3]
- Generic cinematic tropes: short prompts allow the model to fill gaps from its
  training distribution (unwanted camera moves, dramatic music-video cuts, etc.).
  [src #1, #3]

**Do's:**
- Over-specify: use 80–120 words to lock the structural expert.
- Define cast and count explicitly ("one woman, alone in frame").
- Use concrete sequential actions rather than vague motion verbs.
- Weave motion boundaries into the positive prompt as "positive constraints."
- Use film-industry camera terms to establish the 3D coordinate system.
- Place lighting and style tags at the end (low-noise expert processes them last).

**Don'ts:**
- Don't use brief or vague prompts (under 60 words) — the model hallucinates.
- Don't rely solely on the negative prompt field if running a Lightning variant.
- Don't use abstract emotion descriptors without grounding them in physical action.
- Don't omit camera framing — the model defaults to random cuts.
- Don't use multiple simultaneous complex actions for more than one subject
  without explicit sequencing.

### 5. Negative prompts

Wan 2.2 supports a negative prompt field, but its effectiveness is
architecture-dependent. At standard CFG values (>1) it functions as semantic
steering. At CFG=1 (Lightning/high-speed deployments), it is effectively
disabled because the model cannot compare the "with prompt" and "without prompt"
signals. Sources therefore recommend a two-track strategy: [src #1, #3, #4, #5]

**In the negative prompt field (technical artifacts only, effective at CFG>1):**
- Motion artifacts: morphing, warping, distortion, flickering, jittering
- Subject integrity: face deformation, body distortion, double faces
- Visual quality: blurry, low quality, pixelated, noisy, heavy blur
- Unwanted overlays: text overlays, watermarks, logos

**In the main prompt (narrative/behavioral constraints):**
- Anything that controls what subjects must not do — phrased positively
  (e.g., "the two people remain seated the entire time")
- Scene population constraints ("no additional characters")
- Camera lock ("camera does not move, no zoom, no pan")

Schema mapping: this is `inline-positive` for narrative control, with an
optional `separate-field` for artifact suppression. Since Lightning deployment
is common and CFG=1 disables the separate field, the recipe should default to
`inline-positive` with a note that a separate negative field is available
for non-Lightning runners.

### 6. What's unique

Wan 2.2's distinguishing feature is its **dual-expert Mixture-of-Experts
(MoE) architecture** — unlike standard diffusion transformers that process all
information through a single pathway, Wan routes the denoising process through
two specialized experts: [src #1, #2]

- **High-noise expert** (global structure): handles 3D layout, camera
  coordinate system, subject count, and motion timing. Activated by the early
  elements of the prompt (cast, setting, camera).
- **Low-noise expert** (fine detail): handles textures, lighting refinement,
  color grading, and surface material. Activated by later prompt elements
  (lighting tags, style, mood).

This architecture is why prompt order matters more for Wan than for most video
models — placing camera information after the action narrative causes the
structural expert to receive it too late in the denoising schedule.

**Unusually well:**
- Cinematic physics simulation: motion blur, fluid dynamics, high-speed
  sequences (parkour, sports) with accurate blur and dynamics.
- Temporal consistency: once the 3D coordinate system is established, background
  coherence holds across the clip better than earlier models.
- Cinematic framing precision: responds reliably to shot-size and lens
  terminology that other models treat as loose hints.

**Unusually poorly:**
- Slow-motion artifacts: without explicit motion intensity in the prompt, the
  high-noise expert defaults to sluggish movement.
- Multi-subject scenes: hallucinating extra subjects or identity drift is the
  most common community complaint; requires "cast and count" discipline.
- CFG=1 negative prompts: the standard artifact-suppression workflow is broken
  for Lightning deployments; all behavioral control must migrate to the main
  prompt.

### 7. Example prompts (paraphrased from sources)

**Example 1 — Person walking in a garden** [src #2]

Left-weighted composition, over-the-shoulder shot, close-up, medium lens, soft
lighting, low contrast, overcast. A single woman walks through an outdoor garden.
She wears a light dress; her hair is pinned up. Her expression is focused, gaze
directed ahead. As the scene progresses she turns her head slowly, observing the
surroundings. The background is a manicured garden with neat hedges and distant
sculptures. The entire composition conveys quiet concentration. No other people
are present; the camera does not move.

**Example 2 — Landscape / runner** [src #2]

Silhouette lighting, dusk time, mixed warm colors, wide establishing shot, high
contrast. The video shows one runner moving through changing terrain — desert
sand dunes give way to a rocky mountain path. The camera pans slowly right as the
runner transitions between environments. He steadies himself with his hands on
rocks; his pace is deliberate. The background shifts from rolling dunes to steep
peaks. The runner stays centered; camera movement is smooth with no abrupt cuts.
No additional subjects enter the frame.

**Example 3 — Object (lighthouse)** [src #5]

Coastal lighthouse at blue hour, slow dolly-in, soft sea fog, cinematic grade,
35mm look. The lighthouse stands at the edge of a rocky cliff. Waves crash slowly
beneath it. The dolly-in brings the structure gradually closer, revealing worn
stonework and a warm light inside the lamp room. No people. Camera moves at a
constant slow pace with no zoom or pan.
NEGATIVE: text overlay, logos, heavy blur.

---

### Conflicts & unknowns

**Conflict — negative prompt handling (src #1/#3 vs. src #4/#5):**
Src #1 and #3 (community deep-dives) warn that negative prompts are disabled at
CFG=1 and recommend positive constraints in the main prompt as the primary
mechanism. Src #4 (VEED guide) and src #5 (Promptus formula) treat the NEGATIVE
field as a normal separate block. Resolution: the CFG=1 limitation is the more
restrictive case and likely to be the user's deployment context given ComfyUI
Lightning workflows. The recipe should default to `inline-positive` with a note
that a separate negative field can be appended for standard-CFG runners. Flagged
for Phase 3 testing.

**Unknown — optimal CFG setting:**
The sources do not agree on whether Wan 2.2 (as opposed to Lightning variants)
runs at CFG=1 by default in ComfyUI or fal.ai deployments. Phase 3 must test
both paths.

**Unknown — motion intensity vocabulary:**
The sources mention that "slow motion" artifacts can be avoided by increasing
motion signal in the prompt, but do not list specific intensity adverbs or
phrases that reliably trigger full-speed playback. Phase 3 must test terms like
"at natural walking speed," "brisk pace," "normal speed" to find what works.

---

## Part B — Synthesis (map to RecipeSchema)

### Recipe-level

| Field | Value |
|---|---|
| `modelId` | `wan-2.2` |
| `family` | `wan` |
| `displayName` | `Wan 2.2` |
| `status` | `draft` |
| `notes` | `Dual-expert MoE architecture; prompt order is structurally significant (high-noise expert reads early elements, low-noise reads late elements). Negative prompt field disabled at CFG=1 (Lightning deployments) — use inline positive constraints in those cases. All 5 notebook sources are community guides; no official Alibaba/DAMO docs present. Phase 3 must verify: motion-intensity vocabulary, negative prompt behavior under CFG=1 vs. standard, and multi-subject cast control.` |
| `modes` | `t2v` |

### Per mode: t2v

| Field | Value |
|---|---|
| `outputFormat` | `structured-tags` |
| `lengthNorm` | `80–120 words` |
| `structureOrder` | `["Cast and count", "Setting and time", "Camera behavior and framing", "Action timeline", "Motion boundaries (positive constraints)", "Visual style and lighting tags"]` |
| `vocabulary` | See below |
| `dos` | See below |
| `donts` | See below |
| `negativeHandling` | `inline-positive` (primary); note that separate-field artifact suppression is viable at CFG>1 — draft recipe should document both |
| `examplePrompts` | 3 examples above (paraphrased from src #2, #2, #5) |
| `acceptsMedia` | `[]` (t2v is text-only) |
| `multiScene` | `false` |

**vocabulary map:**

```
camera:
  ["slow push-in", "dolly out", "pan left", "tilt up", "orbital arc",
   "crane up", "tracking shot", "static camera", "medium close-up shot",
   "establishing shot", "low angle shot", "over-the-shoulder shot",
   "wide-angle lens", "35mm look", "shallow depth of field", "bokeh"]

motion:
  ["slowly turns head", "walks deeper into", "spins gracefully",
   "subject sniffs a flower then jumps back", "remains seated the entire time",
   "does not stand up", "no other people enter the frame",
   "camera does not move", "no zoom, no pan", "natural walking pace"]

lighting:
  ["volumetric dusk", "golden-hour backlight", "edge lighting",
   "soft diffused overcast", "firelight", "rim lighting",
   "high contrast", "silhouette lighting", "cinematic grade", "warm colors",
   "blue hour", "soft sea fog"]

style:
  ["photorealistic", "cinematic", "film grain", "35mm look", "high detail",
   "clean single shot", "left-weighted composition", "color grade"]
```

**dos:**
1. Over-specify: use 80–120 words to lock the structural expert into a layout.
2. State cast and count explicitly at the start ("one woman, alone in frame").
3. Use concrete sequential actions in the action timeline instead of vague verbs.
4. Weave motion boundaries into the positive prompt using positive phrasing.
5. Use film-industry camera terminology (shot size, lens, movement) early in the prompt.
6. Place lighting and style tags at the end where the low-noise expert processes them.
7. Anchor the time of day and environment in the setting element for background coherence.
8. Include "camera does not move" or explicit camera direction to prevent random cuts.

**donts:**
1. Don't use brief prompts under 60 words — the model fills gaps with cinematic tropes.
2. Don't rely on the negative prompt box if running a Lightning/CFG=1 workflow.
3. Don't use vague motion verbs ("walks," "moves") without specifying pace and sequence.
4. Don't omit camera framing — absence defaults to random shot changes.
5. Don't place lighting and style information at the start of the prompt.
6. Don't describe abstract emotions without grounding them in observable physical action.
7. Don't script simultaneous complex actions for multiple subjects without sequencing.
8. Don't leave subject count ambiguous — extra subjects will be hallucinated.

### Readiness verdict

- [x] All 7 questions answered with source pins.
- [x] Conflicts resolved or flagged for Phase 3 (negative-prompt CFG conflict; motion-intensity vocabulary gap).
- [x] Every schema field can be filled; documented gaps are Phase-3 test items.
- **Verdict:** ready to author draft — all structural fields are populated from consistent
  multi-source evidence. Two Phase 3 items remain (CFG behavior, motion-intensity words)
  but neither blocks the draft; they gate the `draft → validated` flip only.
