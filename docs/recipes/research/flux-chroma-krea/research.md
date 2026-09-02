# Research & Synthesis Worksheet — Flux / Chroma / Krea

- **Model version:** FLUX.1 ecosystem (Chroma + Krea variants)   **Mode(s):** t2v only
- **Research date:** 2026-06-22   **Sources:** see `sources.md`
- **Notebook:** `1a01cf17` — "Flux based models prompting" (9 sources)

Seed recipe being provenanced: `js/data/recipes/flux-chroma-krea.recipe.js`
(ported from `dev-docs/enhancer_prompts.md`). Seed claims are assessed against notebook
findings in Part A and summarised in the readiness verdict.

---

## Part A — Research (the 7 standard questions)

### Q1. Output format & length

The required output format is **natural, descriptive narrative prose** — not keyword lists or
structured tags [src 3, 2, 8]. The model's T5-XXL encoder is purpose-built for long-form natural
language and understands contextual relationships that randomised keyword stacks cannot express
[src 3]. The final prompt reads as if describing a scene to another person: conversational
sentences, active verbs, no SD-style weight syntax. A proven structural template exists (see Q2),
but the output remains a single flowing block of prose, not a formatted list [src 3, 2].

Typical length varies by model variant:
- Standard FLUX models: up to ~500 tokens; practical prompts fall in three buckets — short
  (10–20 words), medium (30–50 words), long (50+ words) [src 4].
- Chroma: 10,000-token context window — enables dense, long-form narrative descriptions
  impossible on standard models [src 3].
- General guidance: avoid "overloading" prompts with conflicting or redundant detail even
  when the window allows it; prioritise clarity over exhaustiveness [src 4, 3].

**Seed recipe claim — "one rich paragraph, no hard word cap":** SUPPORTED. Standard FLUX
and Chroma both accept rich paragraphs; Chroma's extended window specifically rewards them.

### Q2. Structural order

Sources converge on a 7-element hierarchical sequence [src 3, 2]:

1. **Technical framework / art style** — establishes image quality and aesthetic direction.
   Specify real camera gear (e.g. "Hasselblad X2D 100C") or an artistic genre (e.g.
   "Studio Ghibli style") to anchor the generation [src 3, 2].
2. **Main subject** — concrete noun defining the focal point; include texture, material,
   and physical attributes [src 3, 2].
3. **Action** — active verbs to create dynamic energy ("emerging through swirling mist"
   rather than "misty mountain") [src 3, 2].
4. **Environment / context** — layered scene description: foreground → middle ground →
   background to create spatial depth and prevent cluttered compositions [src 2, 3].
5. **Lighting / atmosphere** — light source, colour temperature (in Kelvin if precise),
   and how the light interacts with the environment [src 3, 2].
6. **Camera / perspective** — focal length, aperture, camera angle (e.g. "low-angle
   perspective", "85mm f/1.8") [src 3, 2].
7. **Mood** — emotional tone of the scene, e.g. "serene and contemplative" [src 2, 3].

Additional formatting notes from sources:
- Brackets around the most critical elements can act as "spotlights" for the T5 encoder [src 2].
- Text in the image must be enclosed in **double quotation marks**, limited to 2–5 words,
  with font style and material specified [src 3, 2].

**Seed recipe claim — 5-element structure (Technical framework → Subject → Environment →
Lighting → Special elements / mood):** MOSTLY SUPPORTED. The notebook expands this to 7
elements (splitting subject/action and camera/mood). The seed recipe collapses Camera into the
leading "Technical framework" position, which the sources also recommend — no conflict, just
a compression. Action and Mood being implicit in the seed prose is acceptable.

### Q3. Vocabulary

The model responds best to professional, specific, concrete descriptors rather than vague quality
words like "beautiful" or "ultra-detailed" [src 4, 5].

**Camera and optics** [src 3]:
- Hasselblad X2D 100C — colour accuracy and tonal range for nature/studio
- Sony Alpha 7R IV / Alpha 7 III — high-resolution micro-textures for fashion/portraits
- GoPro HERO12 Black — wide-angle, HDR action scenes with motion blur
- iPhone 15 Pro ProRAW — casual, authentic look with realistic lens distortion
- Lens phrases: "85mm f/1.8", "50mm standard lens", "100mm macro lens", "35mm film look"
- Perspective: "low-angle perspective", "wide-angle view"

**Lighting** [src 3, 2]:
- "Golden hour glow" or "3200K key light" for warmth and contour
- "Alpenglow effect" for mountain/dramatic scenes
- "Early dawn atmospheric conditions" with "soft morning light"
- "Volumetric god rays", "shafts of dusty sunset light"
- "Dramatic light beams" on rain-slicked surfaces
- "Neon signs casting vibrant pink and electric green" hues
- "Harsh side shadows" or "Rembrandt lighting" to break flat textures

**Texture and materiality** [src 3]:
- "Highly detailed skin texture", "fine pores", "subtle imperfections" (counteracts waxy AI look)
- "Crystalline ice formations", "intricate salt hexagons"
- "Detailed wood grain textures", "weathered red brick"
- "Embossed gold foil", "etched stone", "fitted black leather"
- "Rain-soaked glass" with "beautiful distortion"

**Style anchors** [src 3, 2]:
- "Cyberpunk metropolis" with "holographic advertisements"
- "Studio Ghibli meets Makoto Shinkai" for anime aesthetic
- "Spider-Verse inspired" with "comic book halftone dots"
- "Film noir atmosphere", "1980s retro sci-fi"
- "Linocut illustration", "Risograph print style"

**Seed recipe vocabulary claims:** SUPPORTED. Camera pairings (Hasselblad, Sony Alpha 7R IV,
GoPro HERO12, iPhone 15 ProRAW), texture descriptors ("highly detailed skin texture, subtle
imperfections, 35mm film grain"), and active verb guidance are all confirmed by the notebook.

### Q4. Mistakes and failure modes

**Common failure modes** [src 3, 4, 5]:
- "Kitchen sink" overloading: too many conflicting details overwhelm the model, causing missing
  elements or disjointed visuals [src 4, 3].
- "Plastic" / "waxy" textures: the model defaults to an artificially smooth look when organic
  imperfections are not explicitly described [src 3].
- "Flux chin" and facial artifacts: repetitive facial structure and flat skin without specific
  lighting or camera cues [src 3].
- Chaotic / unordered prompts: random element ordering confuses the model's spatial
  prioritisation [src 3].
- Cut-off subjects: the model may truncate full-body shots (feet, limbs) unless clothing and
  environmental grounding details are included [src 4, 5].

**Do's** [src 3, 2, 4, 5]:
- Write in natural, descriptive, conversational prose — as if describing to another person.
- Layer composition explicitly: foreground, middle ground, background.
- Use active verbs for dynamic energy ("soaring", "emerging", "power-washing").
- Name real camera gear and lens settings for photoreal work.
- Enclose rendered text in double quotation marks; specify font style and material.
- Describe light source, temperature, and environmental interaction.
- Focus on positive inclusions; describe what *should* be there.

**Don'ts** [src 3, 4, 5]:
- No SD-style weight syntax: no `(keyword:1.5)`, no `++`.
- No vague quality boosters: "beautiful", "best quality", "ultra-detailed" are ignored.
- No "white background" in FLUX.1 [dev] — causes blurring/undefined subjects.
- No conflicting style combinations (e.g. "cyberpunk + medieval" in one prompt).
- No keyword soup / comma-separated tag lists.
- Do not exceed ~500 tokens on standard FLUX (Chroma exceeds this; standard does not).
- Avoid jargon that doesn't correspond to a visible scene element.

**Seed recipe do's/don'ts claims:** SUPPORTED. All seed recipe don'ts (keyword soup, SD
syntax, negative phrasing, "white background", abstract concepts, introductory text) are
confirmed by multiple sources.

### Q5. Negative prompts

Negative prompt support is **variant- and platform-dependent** [src 4, 9]:

- Platforms like Krea and Segmind expose a negative prompt field and treat it as useful for
  professional cleanup work [src 9, 4].
- Standard FLUX.1 [dev]: negative prompts can exclude technical artifacts (watermarks, blur)
  and anatomical defects (extra fingers, deformed limbs) [src 4].
- Chroma1-Flash: sources specifically recommend **avoiding negative prompts** (use CFG 1)
  because adding them slows generation without meaningful quality gain [src 7, 4].
- Expert consensus: the T5-XXL encoder is capable enough at following positive instructions
  that positive reinforcement generally outperforms negative listings [src 3, 4].

**Preferred strategy across all variants:** Use positive affirmation instead of negatives.
To avoid waxy skin: add "highly detailed skin texture, fine pores, subtle imperfections" to
the main prompt rather than "no plastic skin" in a negative field [src 3].

When a negative field is available and used, restrict it to junk removal only: `blur`,
`low quality`, `watermarks`, `extra fingers`, `deformed limbs` [src 4].

**Seed recipe claim — `negativeHandling: 'none'` and positive-reinforcement-only rule:**
PARTIALLY SUPPORTED with a nuance. The recipe's guidance ("never emit negative phrasing")
is the right default for Chroma and for general Flux use. However, standard FLUX.1 [dev] and
Krea do expose negative prompt fields and community sources consider them useful for artifact
removal. The `none` setting and positive-only rule is correct for the system-prompt instruction
(the enhancer output should be positive prose), but the recipe notes could acknowledge that some
platforms expose a separate negative field. Flag for Phase 3: test whether Krea's native
negative field changes the recipe's recommended user flow.

### Q6. What's unique

**Architecture** [src 3]:
- FLUX.1 is a 12-billion-parameter rectified-flow transformer, not a U-Net like SD1.5/SDXL.
  Noise-to-data follows a straight trajectory, meaning fewer sampling steps for high-quality
  convergence.
- Dual-encoder: T5-XXL handles long-form natural language and complex logic; CLIP-L anchors
  stylistic and compositional keywords. Together they enable narrative-driven prose prompting
  that was impossible on pure CLIP models.

**Chroma** [src 3, 7]:
- De-distilled variant — restores fine-tuning capability (LoRAs) removed in distilled models
  like Flux Schnell.
- 10,000-token context window — can process extremely dense descriptions.
- Explicitly uncensored, reintroducing anatomical and artistic nuances filtered in corporate
  models.
- Chroma1-Flash: speed-optimised, 1–4 steps, CFG 1, negative prompts not recommended.

**Krea** [src 6, 3]:
- "Realtime" engine: guides generation live via brushstrokes (Draw Mode), webcam feeds, or
  screen recording — not just static text.
- Enhancer can push output to 22K resolution for large-format print.
- Default Flux on Krea leans toward a graphic/illustrative aesthetic; less suited to raw
  photorealism without additional refinement.

**Does unusually well** [src 3, 6]:
- Legible stylised text within images (SD and generic models fail at this).
- Complex multi-layered spatial instructions (foreground/background separation).
- Prompt adherence for long, detailed descriptions.
- High-resolution output without quality collapse.

**Does unusually poorly** [src 3]:
- "Plastic" / "waxy" skin textures without explicit texture descriptors.
- Anatomical accuracy in hands and feet (common artifact across all FLUX variants).
- "Flux chin" — repetitive facial structure without targeted lighting/camera cues.
- Sensitivity to "white background" phrase in FLUX.1 [dev] (blurs subject).
- High VRAM requirement for local LoRA training (up to 28 GB for full-precision Rank-16).

**Seed recipe uniqueness claims:** SUPPORTED. T5-encoder natural-language preference,
positive-reinforcement skin texture technique, double-quote text rendering rule, and
"white background" avoidance are all confirmed by the notebook.

### Q7. Example prompts (paraphrased from sources)

**Person — portrait in a realistic style** [src 1]:
A portrait of a male musician with soulful brown eyes, a warm charismatic smile, medium-length
wavy black hair slightly tousled, and a well-groomed beard. Soft warm golden-hour light
highlights the contours of his face and casts gentle shadows. He wears a fitted black leather
jacket over a white shirt. A blurred urban nightlife background with colourful bokeh effects.
Mood: energetic yet intimate, evoking a live concert. Shallow depth of field from a slightly
low angle to convey strength and presence. Realistic contemporary portrait photography,
emphasising texture and detail.

**Landscape — nature documentary style** [src 3]:
Nature documentary capture, Hasselblad X2D 100C with XCD 90V lens at f/4. A majestic
snow-capped mountain peak emerges through swirling morning mist; golden sunrise light catches
crystalline ice formations, creating an ethereal alpenglow effect. Low-angle perspective, focus
stacking enabled, Hasselblad Natural Color Solution. Early dawn atmospheric conditions with
layered cloud formations behind.

**Object — layered composition demonstrating hierarchical structure** [src 1]:
A hanging glass terrarium housing a miniature rainforest scene with colourful orchids and tiny
waterfalls in the foreground. A neon sign reading "Rainforest Retreat" in bright green and
yellow letters occupies the middle ground just beyond the glass. Rain-soaked glass in the
background creates a soft glow and beautiful distortion of the sign's vibrant colours.

---

### Conflicts & unknowns

1. **Negative prompts — `none` vs platform-available field:** The seed recipe and Chroma guidance
   align on positive-only reinforcement. Standard FLUX.1 [dev] and the Krea/Segmind platforms
   do offer a negative field that community sources consider useful for artifact removal. The
   recipe's `negativeHandling: 'none'` governs what the *enhancer outputs* (positive prose) —
   this is correct. Whether users should also be advised to fill a platform negative field is
   a UX question outside the recipe schema. Resolved: keep `none`; add a note to `notes`
   field acknowledging platform-side negative fields. Flag for Phase 3 live test on Krea.

2. **Structural order — 5 elements vs 7:** Seed recipe collapses Camera into the opening
   Technical Framework block and treats Mood as a Special Elements suffix. The notebook's 7-step
   sequence separates Subject from Action, and Camera from Technical Framework. Both patterns
   produce valid prose; the seed's compression is a stylistic choice, not a functional error.
   Resolved: no change needed; document as known variance.

3. **Krea graphic-bias on photorealism:** The notebook notes Krea defaults toward an
   illustrative aesthetic, less suited for strict photorealism. The seed recipe's camera-gear
   pairs are designed to push photorealism — they should counteract this tendency, but this
   is unconfirmed until Phase 3 testing on real Krea output.

4. **"White background" behaviour:** The `dev` model variant is specifically sensitive to this
   phrase; whether Chroma and Krea have the same behaviour is not confirmed by sources. The
   seed recipe's don't rule ("Avoid the phrase 'white background'") is a safe conservative
   default. Confirmed by sources for FLUX.1 [dev]; apply universally as the safer option.

5. **Token length for Chroma in practice:** The 10,000-token window is architecturally confirmed
   [src 3], but the sources don't provide tested guidance on whether extremely long prompts
   (e.g. 1,000+ words) actually improve Chroma output in practice. Flag for Phase 3.

---

## Part B — Synthesis (map to RecipeSchema)

### Recipe-level

| Field | Value |
|---|---|
| `modelId` | `flux-chroma-krea` |
| `family` | `flux` |
| `displayName` | `Flux / Chroma / Krea` |
| `status` | `draft` |
| `notes` | Draft — ported from dev-docs/enhancer_prompts.md, notebook-provenanced 2026-06-22. Flux uses positive reinforcement only; never emit negative phrasing. Chroma supports a 10,000-token context window. Standard FLUX.1 handles ~500 tokens. Some platforms (Krea, Segmind) expose a native negative prompt field for artifact cleanup — this recipe governs enhancer output only (positive prose). Phase 3: test Krea photorealism bias and negative-field interaction. |
| `modes` | `t2v` only |

### Per-mode: t2v

| Field | Value |
|---|---|
| `outputFormat` | `prose` |
| `lengthNorm` | one rich paragraph; standard FLUX ~500 tokens max, Chroma up to 10,000 tokens |
| `structureOrder` | Technical framework / camera specs → Main subject → Action → Environment (foreground/middle/background) → Lighting / atmosphere → Camera / perspective → Mood |
| `vocabulary` | camera: Hasselblad X2D 100C, Sony Alpha 7R IV, GoPro HERO12 Black, iPhone 15 ProRAW; lens: 85mm f/1.8, 100mm macro, 35mm film look; lighting: golden hour rim light, 3200K key light, volumetric god rays, alpenglow effect; texture: highly detailed skin texture, fine pores, subtle imperfections, 35mm film grain, crystalline, weathered; style: film noir, cyberpunk, Studio Ghibli, Spider-Verse |
| `dos` | Write in natural conversational sentences (T5 encoder thrives on prose). Use active verbs ("emerging through swirling mist" not "misty mountain"). Layer foreground/middle ground/background for depth. Name real camera gear and lens specs for photoreal work. Enclose rendered text in double quotes, 2–5 words max, specify font + material. Describe lighting source, colour temperature, and how light interacts with the environment. Focus on positive inclusions; express what should be there, not what to avoid. |
| `donts` | Never use SD weight syntax: (keyword:1.5) or ++. No keyword soup / comma-separated tag lists. Avoid "white background" — causes blurring in FLUX.1 dev. No vague quality boosters (beautiful, ultra-detailed). Do not mix incompatible styles in one prompt. Do not render abstract non-visual concepts (infinity, justice). Do not output introductory text, explanations, or markdown framing. |
| `negativeHandling` | `none` |
| `examplePrompts` | (paraphrased) 1. Sony Alpha 7R IV, 85mm f/1.8, a man walks unhurried along a tree-lined park path, autumn leaves drifting across the foreground, warm golden-hour rim light catching dust in the air, highly detailed fabric texture on his coat, shallow focus with creamy bokeh, calm reflective mood. 2. Hasselblad X2D 100C, 100mm macro at f/2.8, a single dew-covered spiderweb strung between two reeds in the middle ground, soft out-of-focus pond glittering behind, cool overcast morning light, crisp organic detail, serene and quiet. |
| `systemPrompt` | (existing seed systemPrompt confirmed structurally sound — see recipe file) |
| `acceptsMedia` | `[]` (text-only, default) |
| `multiScene` | `false` |

### Readiness verdict

- [x] All 7 questions answered with source pins.
- [x] Conflicts resolved or flagged for Phase 3 (negative-prompt nuance, Krea photorealism
      bias, Chroma long-prompt practical ceiling, structural-order compression).
- [x] Every schema field can be filled.
- [x] Seed recipe claims provenanced against notebook findings.

**Verdict: ready to proceed as draft — seed recipe claims are SUPPORTED by the notebook.**

The existing `flux-chroma-krea.recipe.js` seed recipe is structurally and factually sound
relative to what the notebook contains. Its core rules (T5-encoder prose preference, positive
reinforcement, camera-gear vocabulary, active verbs, layered composition, double-quote text
rendering, white-background avoidance, SD-syntax ban) are all confirmed by multiple sources.

The one nuance: the recipe's `negativeHandling: 'none'` is the correct setting for the
enhancer's *output* (positive prose only), but standard FLUX.1 [dev] and some platforms do
expose a native negative-prompt field that community sources use for artifact cleanup. This is
a platform-layer concern, not a recipe-layer concern — the recipe is correct as written.

Phase 3 priorities:
1. Live-test the Krea photorealism vs. illustrative bias and whether camera-gear pairs
   adequately counteract it.
2. Confirm "white background" avoidance is necessary on Chroma (confirmed only on dev variant).
3. Test Chroma with dense long-form prompts (500+ words) to confirm quality gain is real.
4. Evaluate whether the 5-element structural compression matches or trails the full 7-element
   sequence in practice.
