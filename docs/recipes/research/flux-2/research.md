# Research & Synthesis Worksheet — FLUX.2 Klein

- **Model version:** FLUX.2 [klein] 4B (Vision's `klein-4b`)  **Mode(s):** `t2v`
  (text→image; the schema's `t2v` is "text → video/image")
- **Research date:** 2026-08-05  **Sources:** see `sources.md`

> **Scope note.** The recipe id is `flux-2` because it targets the FLUX.2
> *generation* (Qwen3/Mistral LLM encoder, no negative prompt, native
> reference-image editing), which is a different prompting animal from FLUX.1
> and therefore from `chroma`. Every constraint below is taken at the **Klein
> 4B** setting, the strictest of the family — a prompt written for Klein is
> valid for `[pro]`/`[dev]` too; the reverse is not true.

---

## Part A — Research (the 7 standard questions)

### 1. Output format & length

**Flowing natural-language prose.** Not tags, not keyword soup, not
`(keyword:1.5)` weighting. Klein's text encoder is **Qwen3-4B — an LLM, not
CLIP** [4, 8], so sentence structure and context are what it consumes; CLIP-era
comma-tag prompts are out of distribution. BFL's own Klein section says to
"write like a novelist describing a scene" [1]. Measured worked example: *"A
woman in her 30s standing at a rain-soaked Tokyo crosswalk"* outperforms
*"woman, 30s, Tokyo, rain, crosswalk"* [5].

**Length — the number this phase must produce:**

| Source | Figure | Scope |
|---|---|---|
| BFL skills, `[klein]` section [1] | **40–70 words** | Klein, both sizes |
| BFL core principles [1] / docs [2] | 30–80 words | all FLUX |
| deAPI [5] | 40–120 words | Klein |
| fal [7] | under 100 words | Klein |
| earngenix [6] | under 150 words | **4B specifically** |
| Reference impl [4] | hard cap **512 tokens**, truncated beyond | Klein encoder |

The only source that is both official *and* Klein-scoped is [1]. Everything else
is a looser ceiling. **Resolved: `lengthNorm` 40–75 words, `wordBudget`
{ min: 35, max: 100 }** — the official figure with the customary overshoot
margin the other recipes carry. The 512-token cap is ~390 English words, far
above the working range; it is a truncation backstop, not the budget.

Longer is actively worse here, and for a stated reason: "later tokens receive
less attention weight" [2], and Klein is optimised for speed over detail
resolution [1]. This is a **condense-first** recipe.

### 2. Structural order

BFL's formula, consistent across [1] and [2]:

```
[Subject] + [Action/Pose] + [Style/Medium] + [Context/Setting] + [Lighting] + [Technical]
```

expanded in `t2i-prompting.md` [1] to: Main Subject → Attributes → Action/Pose →
Environment → Style/Medium → Lighting → Composition → Technical.

Two rules bite harder than the ordering itself:

- **Front-load the subject.** "FLUX prioritizes elements that appear earlier"
  [1]; "word order matters — FLUX.2 pays more attention to what comes first"
  [2]; "burying the main subject after extensive scene description weakens its
  presence in output" [5]. All three sources, independently. This is the one
  positional requirement that is non-negotiable.
- **Lighting is not optional.** "Always specify lighting — it has the single
  greatest impact on image quality" [1]; "source, quality, direction and colour
  temperature have the single highest impact on output quality" [5]; "neglected
  lighting" is listed as a top failure mode [7].

Klein-specific refinement: depth layering (foreground → midground → background)
reads well [5], and Klein responds particularly to lighting/atmosphere emphasis
[1].

**Eight slots do not fit in 40–75 words.** Resolved into five, each a phrase
rather than a sentence — see Part B, and the tension flagged under
*Conflicts & unknowns*.

### 3. Vocabulary

Concrete, physical, professional. Abstraction is the enemy: "concrete, specific
language outperforms abstraction" [7].

**Materials & texture** — Klein's strongest lever after lighting [5]:
`brushed aluminium with subtle radial grain` (vs. plain "metal"),
`indigo-dyed linen`, `clay dust`, `white cotton`, `worn leather`, `weathered
wood`, `matte black finish`, `visible wool texture`, `patina`.

**Lighting** [1]:
- Natural: `golden hour`, `blue hour`, `overcast, soft diffused`, `harsh midday`,
  `dappled forest light`
- Studio: `softbox`, `rim light`, `butterfly lighting`, `Rembrandt lighting`,
  `split lighting`, `loop lighting`
- Atmospheric: `volumetric light`, `neon glow`, `candlelight`, `practical
  lighting`, `dust motes in sunbeams`
- Mood: `high key`, `low key`, `dramatic shadows`, `chiaroscuro`

**Camera / technical** [1, 5]:
- Bodies: `shot on Hasselblad X2D`, `Canon 5D Mark IV`, `Leica M10`,
  `Fujifilm GFX100S`, `iPhone 15 Pro`
- Lenses & apertures: `85mm f/1.4`, `24mm f/2.8`, `50mm f/1.2`, `110mm`,
  `macro lens`, `tilt-shift`
- Film/sensor: `Kodak Portra 400, natural grain`, `ISO 100 clean`,
  `ISO 3200 visible grain`
- Framing: `extreme close-up`, `close-up`, `medium shot`, `full shot`,
  `wide shot`, `establishing shot`
- Angle: `eye level`, `low angle`, `high angle`, `bird's eye`, `worm's eye`

**Style/medium** [1]: `classical oil painting, visible brushstrokes`,
`delicate watercolour, transparent washes`, `polished digital illustration`,
`anime, cel shading`, `2000s digicam aesthetic, slight noise, flash
photography`, `80s film, warm colour cast`, `architectural photography style`.

**Two FLUX.2-only vocabulary items** [2]:
- **Hex colours**, bound to a named object: `a cobalt jacket, colour #0047AB`.
  "Vague references like 'use #FF0000 somewhere' may produce inconsistent
  results."
- **Quoted literal text**: `the text "OPEN" appears in red neon letters above
  the door`. Quotation marks are the mechanism.

### 4. Mistakes & failure modes

**Don'ts** [1, 2, 5, 6, 7]:
- Comma-separated keyword soup / SD-style weighting — wrong encoder family.
- Burying the subject behind scene-setting.
- Omitting lighting.
- Conflicting instructions in one prompt (`photorealistic` + `watercolour`).
- Vague aesthetic filler (`make it look good`, `stunning`, `8k`).
- Hex codes not attached to an object.
- Prompts past ~100 words on the 4B — later tokens lose attention weight.
- (Operator-side, not prompt-side, but it is the usual "bad prompt" complaint:
  running the 4B at 20+ steps *reduces* quality — it is trained for 4 — and a
  mismatched text encoder produces blur [6].)

**Do's** [1, 2, 5]: prose sentences; subject first; lighting always; name
materials; name camera/lens/film when photorealism is wanted; quote literal
text; bind hex codes to objects; repeat a character description verbatim across
a sequence for consistency.

### 5. Negative prompts

**There is no usable negative path on Klein**, and this is measured rather than
inferred. Vision ships Klein at **cfg 1.0**, where classifier-free guidance is
off: the negative conditioning is `ConditioningZeroOut`'d and output is
**bit-identical, max diff 0** [8]. `negativePrompt: false` in the ModelDef.
BFL agrees family-wide: "FLUX does NOT support negative prompts" [1, 2].

**But the FLUX family rule "never write what you don't want" does not survive
contact with Klein.** In-house, MPI-353 [8]: appending the literal
`"no moles, no freckles, no blemishes, no spots"` **to the positive prompt** cut
invented dark spots by **21%** (1213 → 962) at zero cost. The FLUX.1-era advice
to positivise every exclusion (`no blur` → `tack-sharp`) was written for a
T5/CLIP encoder; Qwen3 is an instruction-following LLM and evidently parses the
negation.

**Schema mapping:** `negativeHandling: 'none'` — the model exposes no negative
field and the recipe must not emit one. The behavioural consequence for the
system prompt is the interesting half: the enhancer should keep the prompt body
positive and descriptive, **but must not scrub or "positivise" an exclusion the
user themselves stated.** If the user writes "no glasses", that survives as a
short trailing clause rather than being rewritten into "unobstructed gaze". That
is a cheap, checkable Stage 1 rule and it is the opposite of what `chroma` does.

### 6. What's unique

**Unusually well:**
- **Native editing without a separate model** — every FLUX.2 model does
  reference-image editing; the FLUX.1 Kontext line is obsolete. Klein takes up
  to 4 references [1] (Vision's graph wires 3). Multi-reference composition is
  a first-class prompt form: *"the subject from the first image wearing the
  jacket from the second, photographed in the environment from the third"* [7].
- **In-image text rendering** — quoted strings, materially better than FLUX.1 [5].
- **Hex-code colour control** [2].
- **Speed** — 4 steps at cfg 1.0, sub-second class; the fastest image model
  Vision ships, and the only one that can *remove* objects [8].
- **Prose comprehension** — an LLM encoder with 512 tokens of room means spatial
  relationships and multi-clause sentences actually land [5].

**Unusually badly:**
- **No prompt upsampling on `[klein]`** — "be descriptive yourself" [1]. `[pro]`
  has a server-side upsampler; Klein has none. **Cubric Prompt *is* the missing
  upsampler for this model.** That is the clearest product justification any
  recipe in the set has.
- Detail resolution is modest next to Krea 2 — it is built for speed [8].
- It **invents skin blemishes** on generative fill [8].
- Prompt-adherence drifts with text-encoder quantisation, so a multi-constraint
  prompt is the honest test, not a pretty-picture one [8].

### 7. Example prompts (verbatim from sources)

**1 — BFL's own `[klein]` example** [1]:
> A cozy coffee shop interior bathed in warm afternoon light, steam rising
> lazily from ceramic cups, worn leather armchairs arranged around small wooden
> tables, bookshelves lining exposed brick walls, the soft atmosphere of a quiet
> afternoon with dust motes floating in sunbeams through tall windows

*(53 words — squarely inside the 40–70 band BFL states for Klein.)*

**2 — editorial portrait, FLUX.2 t2i** [1]:
> A fashion editorial portrait of a young woman with striking features and high
> cheekbones, wearing an avant-garde geometric collar in silver, dramatic side
> lighting creating strong shadows, shot on Hasselblad with 100mm lens at f/2.8,
> studio background with subtle gradient, high fashion magazine style

**3 — product, FLUX.2 t2i** [1]:
> A premium wireless headphone product shot, matte black finish with rose gold
> accents, floating at slight angle against pure white background, soft even
> lighting eliminating harsh shadows, reflection visible on glossy surface
> below, commercial catalog style, ultra sharp focus throughout

**4 — typography, showing the quoting mechanism** [2]:
> An Entry of a Sushi Restaurant, The text "OPEN" appears in red neon letters
> above the door

---

### Conflicts & unknowns

1. **Negative prompts — resolved against fal.ai.** [7] advises "strategic
   negative prompts targeting common failure modes". Two official sources [1, 2]
   and one in-house bit-level measurement [8] say the model has no negative
   path at all at its shipped settings. **Resolution: no negatives.** [7] is
   demoted for this claim; it reads as FLUX.1-era advice pasted onto a FLUX.2
   page.

2. **"Positive descriptions only" vs. the measured 21%.** BFL states the rule
   family-wide [1]; Vision measured the opposite on Klein [8]. **Resolution:**
   both, scoped — the *body* of the prompt is positive and descriptive (BFL's
   rule is about not building a prompt out of negations), while a user's own
   stated exclusion is preserved literally at the end rather than translated.
   Stage 2 can confirm whether the 21% result generalises from the fill path to
   plain t2i; Stage 1 can only check that the enhancer stops deleting the user's
   exclusions.

3. **Which encoder.** [2] and [3] describe Mistral Small 3.1 — that is
   `[pro]`/`[dev]`. Klein uses **Qwen3** (4B on the 4B) [4], which Vision's own
   dependency list confirms (`qwen3-4b-clip`, "Qwen3-4B TEXT-ONLY") [8]. No
   prompting consequence for prose-vs-tags (both are LLMs), but it is why the
   512-token cap and the negation tolerance are Klein facts, not FLUX.2 facts.

4. **Word budget vs. slot count — the live Stage 1 tension.** BFL's expanded
   framework has eight slots; the official Klein budget is 40–70 words. Eight
   slots at that length is ~7 words per slot, and MPI-16's recurring bug class
   is exactly this — a required-element list colliding with a length rule. The
   draft therefore ships **five** slots (Part B). If the sweep still fails the
   bare tier on coverage or the overlong tier on length, the fix is to merge
   slots further or raise `wordBudget.max` toward deAPI's 120 — **not** to add
   a "be concise" sentence. Reframe the operation, per
   `playbook/07-when-a-rule-wont-hold.md`.

5. **Untested on the 4B distilled:** whether hex-code colour binding and quoted
   text rendering (documented for `[pro]`/`[max]` [2]) hold up at 4 steps. Both
   are Stage 2 questions — they cannot be checked in text.

6. **No corpus.** `docs/recipes/research/_corpus/` covers Chroma, Krea 2 and
   the candid set only; there is no FLUX.2 prompt corpus, so none of the
   vocabulary above is corpus-measured (playbook §1.4). It is documentation-
   sourced, which is exactly the class of evidence MPI-19 showed can measure at
   zero. v1.0 ships general-only and declares **no `styleVocabulary`**, so
   nothing here is load-bearing for a register — but do not promote any of these
   words into a `styleVocabulary` in v1.1 without measuring them first.

---

## Part B — Synthesis (map to RecipeSchema)

**Recipe-level**

| Field | Value |
|---|---|
| `modelId` | `flux-2` |
| `family` | `flux` |
| `displayName` | `FLUX.2 Klein` |
| `status` | `draft` |
| `notes` | FLUX.2 generation — a different prompting model from FLUX.1/`chroma` despite the shared family name. Tuned to `[klein]` 4B (Vision's `klein-4b`), the strictest variant; valid for `[pro]`/`[dev]` too. Qwen3-4B LLM text encoder, 512-token hard cap. **No negative prompt path** — shipped at cfg 1.0, where the negative is bit-identical (measured, `Cubric-Vision/docs/models/klein/README.md`). Unlike the rest of the FLUX family, literal negation in the positive prompt measurably works here (invented blemishes −21%), so a user's stated exclusion is kept, not positivised. **No server-side prompt upsampling on `[klein]`** — this recipe is the upsampler. |
| `modes` | `t2v` only (see "Modes" below) |

**Per mode: t2v**

| Field | Value |
|---|---|
| `outputFormat` | `prose` |
| `lengthNorm` | `40–75 words — one flowing paragraph, subject first` |
| `wordBudget` | `{ min: 35, max: 100 }` |
| `structureOrder` | `["Subject and appearance (first words of the prompt)", "Action or pose", "Environment and setting", "Lighting (source, quality, direction, colour)", "Style, camera and materials"]` |
| `vocabulary` | materials: `["brushed aluminium", "indigo-dyed linen", "worn leather", "weathered wood", "matte black finish", "visible wool texture", "patina"]`; lighting: `["golden hour", "blue hour", "overcast diffused light", "harsh midday sun", "softbox", "rim light", "Rembrandt lighting", "volumetric light", "neon glow", "candlelight", "dust motes in sunbeams", "low key", "chiaroscuro"]`; camera: `["shot on Hasselblad X2D", "Canon 5D Mark IV", "Leica M10", "85mm f/1.4", "24mm f/2.8", "50mm f/1.2", "macro lens", "Kodak Portra 400 with natural grain", "close-up", "medium shot", "wide shot", "low angle", "eye level"]`; style: `["classical oil painting with visible brushstrokes", "delicate watercolour with transparent washes", "polished digital illustration", "anime with cel shading", "2000s digicam aesthetic", "80s film with warm colour cast", "architectural photography style"]` |
| `styleVocabulary` | **omitted** — v1.0 is general-only, and none of the above is corpus-measured (Conflict 6) |
| `dos` | `["Write one flowing prose paragraph in natural English sentences", "Name the main subject in the opening words of the prompt", "Always state the lighting: source, quality, direction and colour", "Name materials and textures concretely (brushed aluminium, not metal)", "Give camera body, lens and film stock when the target is photorealism", "Put literal on-image text in double quotes", "Bind a hex colour to the object it belongs to", "Keep every exclusion the user stated, as a short clause at the end"]` |
| `donts` | `["No comma-separated keyword lists or Stable-Diffusion weight syntax", "No separate NEGATIVE PROMPT block or label", "No aesthetic filler (stunning, 8k, masterpiece, highly detailed)", "No conflicting style instructions in one prompt (photorealistic and watercolour)", "No unattached hex codes", "The subject must not appear after the scene description"]` |
| `negativeHandling` | `none` |
| `examplePrompts` | the three t2i examples in Q7 (BFL's Klein coffee-shop example first) |
| `systemPrompt` | authored in the draft phase (playbook 02), not here |
| `acceptsMedia` | `[]` |
| `multiScene` | `false` |

**Modes — `t2v` only, deliberately.** Klein's Vision ops include `i2i`,
`kleinEdit` and `inpaint`, and BFL documents reference-image prompting well
enough to author an `i2v` mode from. It is out of v1.0 for two reasons: (a)
Vision does not send a mode at all — everything arrives as `t2v` (MPI-26), so an
`i2v` mode would be unreachable from the caller that motivates the recipe; and
(b) edit prompting wants an **instruction**, not a scene description, which is
the open question **MPI-21** already owns for Boogu and Qwen Image Edit. The
edit evidence is recorded in Q6 so MPI-21 can use it without re-researching.

**Wiring — do NOT repoint the `flux` alias.** `RECIPE_ALIASES.flux → 'chroma'`
currently absorbs three Vision models: `klein-4b`, Boogu Image Edit and Qwen
Image Edit. Repointing `flux` to `flux-2` would drag the two *edit* models onto
a FLUX.2 **t2i** recipe — trading one wrong answer for another, and violating
"only alias a key the caller deliberately chose"
(`.claude/rules/engine-recipes.md`). The correct change is one line **in
Vision**: `enhanceRecipe: 'flux-2'` on `klein-4b`, exactly as `pony` will need.
Leave `flux: 'chroma'` in place as the fallback for the two edit models until
MPI-21 resolves them. (Vision reads `models.js` once at boot — a repoint needs a
restart to take effect.)

---

### Readiness verdict

> **Closed 2026-08-05 — recipe authored and Stage 1 GREEN (24/24, two sweeps).**
> Two things this document predicted were settled empirically and the numbers
> above are superseded by `js/data/recipes/flux-2.recipe.js`:
> **Conflict 4 happened exactly as flagged** — five slots collided with the
> length rule, and the fix was to align the countable unit with the structure,
> not to harden the number. **The budget moved 35–100 → 35–120**, decided by a
> measured six-run condense distribution (89/80/91/64/105/99) rather than by
> re-reading the sources; 120 still sits inside deAPI's Klein-scoped 40–120. The
> systemPrompt's *stated* ceiling remains 75. Full record:
> `.agents/mpi-kanban/tasks/MPI-25/validation.md`.

- [x] All 7 questions answered with source pins.
- [x] Q1 produced a number: `lengthNorm` 40–75 words, `wordBudget` 35–100, from
      the only official Klein-scoped figure. *(Stage 1 later widened the
      contract to 120 — see the note above.)*
- [x] Conflicts resolved (negatives, encoder, positivisation) or flagged as
      Stage 2 pixel questions (hex binding, quoted text, whether the 21%
      generalises).
- [x] Every schema field has a concrete value.
- **Verdict: ready to author the draft recipe.** The one thing to watch through
  Stage 1 is Conflict 4 — five required slots inside a 40–75 word budget is the
  tightest coverage/length pairing in the recipe set, tighter than `sdxl`'s
  30–90.
