# MPI-504 — Character Sheet flow: attributes or a reference photo in, a video-reference sheet out

Opened 2026-08-09. Fabio: *"I really want to do a character sheet one where the
user supplies one image and Flow creates a character sheet… where the full body
doesn't have a head."* Refined the same day:

> *"The flow will probably be something that can take in a reference photo or
> just imagine from a prompt. So the user could simply specify: what the
> character would be, what he would be wearing, if he had scars, how old he was,
> colour of the hair, colour of the eyes… Then we would just restructure the
> prompt so that it comes out as a character sheet, with the same type of output
> that we found works for video."*

Three of the four shipped flows (`image-regen`, `sdxl-4k`, `video-stitch`) are
marked for deprecation; only `head-swap` follows through. This is the next real
flow.

## V1 SCOPE — RE-SCOPED 2026-08-19: PROMPT ONLY, NO IMAGE INPUT

Fabio, 2026-08-19: **make it shippable by dropping the image input.** The user writes the
character down and nothing else. *"We already have a recipe for creating these sheets with
Krea2. All the user has to write down is the character description. We already have head
swap, so the user can use head swap to later on swap it with a character image. Taking in an
image as input, we might do that in the future, but not for this version."*

That kills the one unproven step this card was carrying — holding identity onto a **back view**
the source photo never shows. The reference-photo path is deferred whole, not solved; head-swap
covers "make it look like this person" as a second pass on the finished sheet.

The build lives in [plan.md](plan.md); the prompt payload — sheet template in four styles, the
character-only enhancer recipe, the removal prompt — in [prompts.md](prompts.md). In short:

- **Krea2 t2i**, one proven prompt template with a `[CHARACTER PROMPT]` hole, at a **fixed 8:5**
  (`1280x768` / `1792x1120`). User picks 1k or 2k (**2k default**) and turbo on/off (**off
  default**).
- **The headless front body is an OPTIONAL step, on by default**: SAM3 selects the head from a
  text prompt, the mask is grown, and Klein 4B inpaints it away with a baked prompt (*"remove
  the head of the character, leaving only the clothes behind"*) — a method Fabio has already
  run by hand. This keeps the sheet's own pixels untouched outside the mask.
- **The enhancer recipe is the other half of the work.** The existing in-graph recipe (the
  *Prompt Enhancement* group inside `krea2_t2i_template.json`) writes a whole SCENE: given *"a
  1870s Western Indian Chief"* it returns a sun-baked plain, a smoke-stained teepee, dust in
  the heat and a staff in his right hand. Every one of those contradicts the sheet. The new
  recipe describes the CHARACTER only, as a noun phrase that drops into the hole.
- **The style axis is new.** Fabio's prompt is written for a live-action character; the same
  skeleton ships in four styles (photoreal, 3D, anime, cartoon) by swapping five marked spans.

Everything below this section is the ORIGINAL research brief. It still holds, with one
correction: where it describes a reference-photo path or an edit model, that is now v2.


## The LoRA-training sheet is OUT OF SCOPE — a different beast, not a layout option

The first version of this card framed the two layouts as a conflict to settle,
then as a layout option. **Both wrong** (Fabio, 2026-08-09):

> *"A lot of the training sheet is completely different. We're talking about
> something with 20 different images. It's a whole different beast, but this is
> something for when the flow is actually addressed, not for now."*

So [MPI-348 §8.4](../MPI-348/brief.md) (one square image: face side profile +
face front profile + full body) is not a variant of this — it is a separate,
much larger job (~20 images) with a different consumer, and it gets addressed
when that flow is addressed. **MPI-504 owns the video-reference sheet only.**

| | Video-reference sheet (**this card**) | LoRA-training sheet (later, separate) |
|---|---|---|
| Output | 3 panels | ~20 images |
| Panels | face close-up (3/4), full body **front (headless)**, full body **back** | face side profile, face front profile, full body — plus many more views |
| Consumer | a video model reading a reference | a trainer |

(Also mentioned in passing by MPI-475 — H3 `ref2va` is *"the LoRA-free character
bet: a character sheet in, a consistent character out, no training"* — and
MPI-478 uses a 2048px sheet as a VRAM measurement case.)

## The video-reference spec

From Higgsfield's **HELL GRIND** production brief (95-minute AI feature, 15
people, under $500K, 14 days of generation, screened at the 2026 Cannes Marché
du Film). Unusually, it gives the failure each choice fixes.

### Why the front body is headless

> *"On wide shots the model kept taking the face from the small full-body figure
> on the sheet — where the face is tiny and blurry. Remove that head, and the
> model has only one place to take the face from: the close-up."*

Zero-cost, fixes a whole class of broken wides.

### The rest of their sheet spec

- **Keep the sheet boring on purpose.** Neutral grey background, flat light,
  real skin with visible pores, no retouch.
- **Do NOT bake film grain or cinematic lens character into the sheet** — *"the
  character will carry that look into every scene and stop reacting to new
  light."* The cinema look belongs in the location assets and the video prompts.
- **Always check the pupil catch-light**, even on dark eyes. *"Without it the
  face looks dead, and no video model can act with a dead face."*
- **Pick the most believable candidate face, never the most beautiful.** *"A
  'beautiful but fake' face will show its fakeness later, in video — when it is
  too late to fix."* Implies the flow should surface candidates rather than
  auto-pick.

## Two input paths — and therefore TWO MODELS

Fabio, 2026-08-09:

> *"I think it's gonna need two different models anyway. If the user gives a
> reference, we're going to need an edit model. If the user doesn't use a
> reference, we're going to have to look for which model responds better to a
> prompt that asks it to display the character in that certain way. That's the
> flexibility with flows. We can have multiple models in a flow, and we select
> the best models for that flow."*

So the model is **per path, chosen by bench**, not one model for the flow:

| Path | Model class | Selection question |
|---|---|---|
| reference photo | an **edit** model | which one holds identity onto views the source never shows |
| attributes only | a **t2i** model | which one actually obeys *"display the character in this layout"* — a layout-compliance test, not an aesthetics one |

That second question has no answer on the board yet and is not the same
question as "which model makes the nicest face". Bench it as **layout
compliance**: does the model return the requested panels, in the requested
arrangement, with a consistent character across them.

### Path 1 — attributes only, no photo. **Ship this first.**

The user states what the character is, wardrobe, scars and marks, age, build,
hair colour, eye colour, and so on; the flow restructures that into the sheet
prompt and a t2i model invents the character front and back.

**This is exactly what Higgsfield did** — Soul Cinema, prompt → sheet, best of
several returns. There is no identity-projection problem at all, because there
is no source identity to project. Low risk, and it is the whole feature for a
user who has no photo.

### Path 2 — reference photo in. **The hard one.**

Must hold identity onto a **back view the source photo never shows**. Nothing on
the board proves a local model does that. Per
[MPI-348 §7](../MPI-348/brief.md): Qwen-Edit is *"strongest at COMBINING images;
weak on single-image instruction edits"* — the wrong half for this. Krea2 is the
single-ref identity path (`ref_boost` ~4, §8.3). Boogu Image Edit is the
fallback.

**Prove the back-view step alone at the bench before building this path.** If no
local path holds it, path 2 ships front + 3/4 close-up only and says so honestly
rather than shipping a drifting third panel.

## Template or enhancer — decide before building

The user supplies **structured fields**. Structured fields into a fixed slot
template need **no LLM at all**. An enhancer round-trip (Cubric Prompt) earns
its place only if the user types free prose instead of filling a form, or if the
wording needs per-target-model shaping.

Start with the template. Reach for Prompt when the template measurably falls
short — not before.

## One Higgsfield rule that does NOT transfer

Their brief: *"Never write age in any language — the content filter becomes much
stricter the moment it reads a minor; instead of age, give the role, the
clothes, the action."*

That is a **hosted-platform content filter**. Vision runs local models, so age
is a normal attribute field here. Do not copy that rule across.

## The headless panel is a mask op, not a prompt

Do not ask a model to draw a headless body. Generate the front body normally,
then **SAM3-segment the head** ([docs/masking-sam3.md](../../../../docs/masking-sam3.md)
— `sam3.1_multiplex_fp16`, click-point or text branch) and remove it, letting
the backdrop fill. `klein-4b` has a real `inpaint` op, and Cubric Prompt's rules
already record that **Klein's removal path wants the prompt empty**.

This also honours the brief's hardest asset rule:

> *"An image never runs through a model twice in full. Every extra pass destroys
> texture and drifts colour — after two passes the face turns symmetrical,
> plastic and lifeless, and that dead texture later hurts the acting in video."*

Their point-change workflow (clothes, scars, blood) is the same shape: edit on
the sheet in an edit model, then composite back **through a mask** so the
original skin texture survives. `head-swap` already owns that machinery, and
MPI-348 §6 already picked the compositing paths (`ImageCompositeMasked` for
~1–1.5MP sources; `InpaintCropImproved`→`InpaintStitchImproved` for 4K/8K).

## Candidate pipeline (shortest thing that could work)

1. **Collect attributes** (form) → restructure into the sheet prompt.
2. **3/4 close-up** — t2i, or from the reference photo relit flat onto neutral grey.
3. **Full body front** — same prompt shape; on path 2, the single-ref identity path.
4. **Full body back** — same. **On path 2 this is the risky step; bench it first.**
5. **Head removal on panel 3** — SAM3 mask → inpaint with an empty prompt.
6. **Composite** — the panels onto one neutral-grey canvas.

Steps 2–4 are three *different panels*, not three passes over the same image, so
the never-twice rule is not violated. Step 5 is masked, which is the point.

## Definition of done includes the stress test

Not a nice-to-have — it is how they decided an asset was locked:

> *"Ten generations in different poses and different light. The character must be
> recognizable in ten out of ten. And not alone — next to the other assets, and
> in the light of the real scenes ahead. A hero who looks stable alone often
> breaks when he shares the frame with someone. If the test fails, the problem is
> your description, not the model."*

## Adjacent, same brief — separate cards if wanted

- **Location sheet flow.** Shoot 3/4, never frontal (*"a frontal pretty picture
  becomes flat wallpaper on wides, and past its edges the model invents new
  surroundings every time"*); leave an anchor object and tie staging to it; one
  light logic, never two suns. Their reverse-angle method, found late: **generate
  a video of the empty location with the camera walking slowly through it** — the
  video model draws the other sides consistently with the sheet — then screenshot
  the angle and texture-clean it. *"A full location sheet out of a single image."*
  Vision has every piece of that already.
- **Asset registry.** An asset is a **pair**: image + a **descriptor** that goes
  into every prompt *word for word, never shortened*. Every **state** is its own
  asset (`@roco`, `@roco_wet`, `@roco_blood`) because *"mix the states in one
  text, and the model starts mixing them between shots"*; locations split
  day/night/rain; props split by use. One tag dictionary across docs, prompts and
  UI. **This is the Vision↔Prompt seam** — the descriptor is exactly what Cubric
  Prompt would carry verbatim, and it is the subject of Prompt's MPI-28 §B.

## Sources

Full distillation: `~/.claude/memory/domain/ai-video-asset-production.md`.
Raw material saved 2026-08-09 to `C:\Users\Fabio\Downloads\seedance_skills\` —
`HELL GRIND project brief (extracted).txt` (the saved page is a 1.25MB SPA that
WebFetch cannot read; `extract-html-text.py` in the same folder strips it), plus
`CINEDANCE HIGGSFIELD SKILL.md`, `ACTING SKILL.md`, `LIRA SKILL.md` and the
`prompt-builder-2-5.skill` zip.

The recipe/enhancer half of the same brief is **Cubric Prompt's MPI-28**.
