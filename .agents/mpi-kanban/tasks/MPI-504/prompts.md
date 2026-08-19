# MPI-504 — the prompt payload

Everything here is **graph payload**, not app code: these strings live as widget values
inside `flow_character_sheet.json` (the head-swap pattern — a flow's prompts are baked in
the graph, so the app only injects the character text, the style index and the toggles).

Two pieces:

1. **The sheet template** — one per style, `[CHARACTER PROMPT]` punched out.
2. **The enhancer recipe** — the system prompt that replaces the one in node `420`
   (`Text String (System Prompt)`) of the copied *Prompt Enhancement* group. It rewrites the
   user's idea into the CHARACTER ONLY, in a shape that drops into that hole.

---

## 1. The sheet template

Fabio's proven text, with three spans marked as style-swappable and the gendered words
neutralised (see the diff at the end of this section — **that neutralisation is untested and
is bench gate #1**).

Skeleton — `«A»`, `«B»`, `«C»`, `«D»` are the style slots:

> «A» character reference sheet of **[CHARACTER PROMPT]**, «B». A single continuous «C»
> containing three views of the same character arranged side by side in one unbroken frame,
> the grey background flowing continuously behind all three, the same character in every view
> with identical face, hair and wardrobe. The right half of the image is filled by a head and
> shoulders portrait with the head turned only slightly, about thirty degrees to camera left,
> a gentle three-quarter angle close to frontal, the whole nose clearly visible with both
> nostrils and the tip of the nose sitting well inside the outline of the face, both cheeks
> visible, both eyes visible and «D», neutral expression, mouth closed, face sharp and clear,
> hair fully visible from the crown down. The left half holds two narrow full-body standing
> views of equal width, one seen from the front and one from directly behind, arms hanging
> loose and relaxed at the sides, hands open and resting against the thighs, feet planted,
> generous headroom. Plain smooth eighteen percent grey card seamless studio background, flat
> neutral grey. Extremely even flat frontal illumination, soft open shadows, uniform
> brightness from edge to edge. «E»

### The four styles

| slot | Photoreal (default) | 3D animation | Anime | Cartoon / 2D |
|---|---|---|---|---|
| «A» | Live-action photographic | 3D animated | Anime | 2D cartoon |
| «B» | photographed as a real actor for a feature film | modelled as a hero character for a feature animation | drawn as a key character for an animated feature | drawn as a hero character for an animated series |
| «C» | studio photograph | rendered turnaround image | cel-shaded illustration | flat-colour illustration |
| «D» | looking into the lens | looking into the camera | looking at the viewer | looking at the viewer |
| «E» | Authentic skin texture with visible pores, natural hair, realistic eyes with a small bright catch-light in each pupil, 85mm lens. | Clean stylised 3D render with subsurface skin shading, groomed hair, glossy eyes with a small bright catch-light in each pupil, even studio render lighting. | Crisp line art with flat cel-shaded colour fills, clean anime eyes with a small bright highlight in each pupil, model-sheet clarity. | Bold clean outlines with flat colour fills and simple soft shading, expressive eyes with a small bright highlight in each pupil, model-sheet clarity. |

**Every style keeps the pupil catch-light.** It is not a photographic flourish — it is
Higgsfield rule (d): without it the face is dead and no video model can act with it.

**No style names a lens character, a grain, or a grade** — Higgsfield rule (c). The sheet
stays boring on purpose or the character carries that look into every scene.

The four templates are four `PrimitiveStringMultiline` nodes behind an `MpiAnySwitch` on
`Input_Style` (1-indexed, matching the head-swap `Input_Tier` pattern). Nothing about the
style reaches the app beyond that integer.

### Photoreal, assembled (the exact string for the node)

```
Live-action photographic character reference sheet of [CHARACTER PROMPT], photographed as a real actor for a feature film. A single continuous studio photograph containing three views of the same character arranged side by side in one unbroken frame, the grey background flowing continuously behind all three, the same character in every view with identical face, hair and wardrobe. The right half of the image is filled by a head and shoulders portrait with the head turned only slightly, about thirty degrees to camera left, a gentle three-quarter angle close to frontal, the whole nose clearly visible with both nostrils and the tip of the nose sitting well inside the outline of the face, both cheeks visible, both eyes visible and looking into the lens, neutral expression, mouth closed, face sharp and clear, hair fully visible from the crown down. The left half holds two narrow full-body standing views of equal width, one seen from the front and one from directly behind, arms hanging loose and relaxed at the sides, hands open and resting against the thighs, feet planted, generous headroom. Plain smooth eighteen percent grey card seamless studio background, flat neutral grey. Extremely even flat frontal illumination, soft open shadows, uniform brightness from edge to edge. Authentic skin texture with visible pores, natural hair, realistic eyes with a small bright catch-light in each pupil, 85mm lens.
```

### The neutralisation diff — BENCH GATE #1

Fabio's original says **man / his / him** five times. A flow that only makes male characters
is not shippable, so the template above swaps them. The swap is the only unproven edit to a
prompt he has already run:

| original | template above |
|---|---|
| three views of the same **man** | three views of the same **character** |
| the same **man** in every view | the same **character** in every view |
| with **his** head turned only slightly | with **the** head turned only slightly |
| at **his** sides | at **the** sides |
| against **his** thighs | against **the** thighs |

Check: one male character, both wordings, same seed. If the neutral version loses the layout,
the fallback is to let the enhancer state the sex and keep a `man`/`woman` token switched off
the same output — a second bench call, not a v1 blocker.

---

## 2. The enhancer recipe — character only

Replaces the widget on node `420` in the copied group. The ChatML wrapper is load-bearing:
node `422` appends the user's text after `<|im_start|>user`, and node `419` appends
`\n<|im_end|>\n<|im_start|>assistant`. Keep the first and last lines exactly.

**Why the current recipe cannot be reused.** Fed *"a 1870s Western Indian Chief"* it returns a
whole scene — a sun-baked plain, a smoke-stained teepee, dust in the heat, a staff in his
right hand. Every one of those is wrong here: the sheet is a grey studio backdrop, the hands
are empty at the sides, and the output has to be a **noun phrase dropped into the middle of a
sentence**, not a sentence of its own.

```
<|im_start|>system
You are a character designer. You write the CHARACTER half of a character reference sheet prompt, and nothing else.

Your output is dropped into the middle of a longer sentence that already reads "character reference sheet of ___, photographed as ...". So write a NOUN PHRASE, never a sentence: start with the person themself ("a weathered Plains chief in his late sixties, ..."), start with a lower-case letter, and end without a full stop. Never write a verb of action - the character is standing still with their arms at their sides.

Describe only these four things, in this order:
1. Who they are. Age, build, height, sex, and origin or ethnicity where the user implied one.
2. The face and head. Face shape, skin, hair colour, hair length and how it is worn, facial hair, eye colour, lines, scars, tattoos, marks.
3. The wardrobe and worn gear, head to foot. Headwear, each garment in the order it is worn, colours, fabrics, wear and dirt, belts, jewellery, footwear - and any weapon, tool, bag or kit the character keeps ON THE BODY: holstered, sheathed, slung, quivered, belted or shouldered. Say where each piece sits and how large it reads against the body, so the sheet doubles as the scale reference for that item.
4. How the wardrobe and gear read FROM BEHIND. The back of the outer garment, how the hair falls or is tied at the back, anything slung or quivered across the back. The sheet carries a rear view and the model has to know what belongs there.

Leave all of this out:
- Any location, background, ground, sky, weather, building, loose prop or furniture, and any second person or animal. The character stands on a plain grey studio backdrop.
- Any pose, gesture, action, mood or story. The pose is fixed by the rest of the prompt.
- Anything held in the hands. The hands are open and empty at the character's sides, so every weapon, tool and bag is worn rather than carried.
- Camera, lens, shot type, framing, lighting, film stock, colour grade, medium or art style. The rest of the prompt owns every one of those.

Rules:
1. Keep every attribute the user stated - age, colours, wardrobe, gear, marks - in their own words wherever those words work.
2. Fill in only what the user left open, and only inside the four categories above.
3. Gear the user named always goes in, worn on the body.
4. Where the user named no gear, you may add at most two pieces the character could not plausibly be without - a working cowboy's gunbelt, a soldier's sidearm, a hunter's quiver. Never anything exotic, story-specific or decorative.
5. Where the user rules gear out in any words at all ("no weapons", "nothing on the belt", "unarmed", "no accessories"), the character wears none. Write the description as though the subject never came up - never write the refusal itself into the output.
6. Positive phrasing only. Describe what is present, never what is absent. Never write "no", "without", "not", "free of", "empty of" or "devoid of".
7. Between 45 and 90 words, as one block of plain prose. Commas, not bullets.
8. Never write the words "character reference sheet", "front view", "back view" or "three views". That structure is already in the prompt around you.
9. Do not sanitise or soften what the user asked for.

Output ONLY the description. No preamble, no explanation, no quotes, no markdown.<|im_end|>
<|im_start|>user
```

### What it should return

Input: `a 1870s Western Indian Chief`

Expected shape (~75 words, drops straight into the hole):

> a weathered Plains chief in his late sixties, lean and upright, deep-lined copper skin over
> high cheekbones, dark brown eyes, long steel-grey hair parted centrally and wrapped in fur at
> each side, wearing a dark frayed wool tunic with faded beadwork at the collar and cuffs, a
> heavy leather belt hung with ceremonial pouches, plain hide leggings and beaded moccasins, an
> eagle-feather war bonnet whose feather trailer runs the length of his back, a hide quiver of
> arrows slung across that back and reaching from shoulder to hip

Compare with what the current recipe returns for the same input — a plain, a teepee, dust in the
heat, a staff in his right hand, a quiver across his back. The quiver **stays**: it is worn, it
belongs on the rear panel, and putting it on the sheet is what makes the sheet the scale
reference for it. The staff is the one clear failure — the sheet's hands are open and empty, so
a held object contradicts the layout the template just specified. Everything else was scene.

Regression checks for the recipe (text-only, no GPU): feed it `a 1870s Western Indian Chief`,
`a cyberpunk street medic`, `a tired schoolteacher, 40s, red hair`, `a gunslinger, no weapons`
and confirm each output (a) starts lower-case with a noun phrase, (b) names nothing held in the
hands, (c) names no place, light or camera, (d) says something about the back, (e) lands in
45-90 words, (f) carries worn gear where the archetype implies it — and **none at all** for the
fourth input, with the words "no weapons" nowhere in the output.

### The gear policy — settled 2026-08-19

Fabio: the cowboy-movie sheets this whole layout comes from had no gear on them, and *"that
would have saved quite a lot of trouble, because we wouldn't need separate item sheets, and
scale would be sorted from the beginning."* So gear on the sheet is a **feature**, not leakage:
a holstered revolver drawn once at the right size against the body is a scale reference every
later shot inherits, and it retires a second sheet.

Three tiers, all of them recipe text — **no new field, no toggle**:

| the user | the sheet |
|---|---|
| names gear | wears it, always, positioned and sized |
| names none | wears at most **two** archetype-inevitable pieces (a working cowboy's gunbelt), nothing exotic |
| rules it out in plain words | wears none |

The third tier is why this needs no UI: the user types "no weapons" into the same box, the LLM
reads it as an instruction, and the *image* prompt simply never mentions weapons. A negative
never reaches Krea2 — which matters, because Krea2 is positive-phrasing-only and "no weapons"
sent to the model draws weapons.

The counterweight is real and worth naming: anything the sheet invents becomes canon for every
shot that character appears in. The cap of two and the "nothing exotic" clause are what keep
that cheap, and the enhanced prompt is visible before the run.

---

## 3. The head-removal prompt

Fixed, never user-facing:

```
Remove the head of the character, leaving only the clothes behind.
```

Fabio has run this before and it usually works. `docs/models/klein/removal.md` records a
second path for the same job — the **remove** op takes NO prompt (the outpaint LoRA's own
instance prompt carries it) and wants crop/stitch, which is exactly the "local texture
continuation" case removal falls into. Both are one node apart; A/B them in the same bench
pass and keep the winner.
