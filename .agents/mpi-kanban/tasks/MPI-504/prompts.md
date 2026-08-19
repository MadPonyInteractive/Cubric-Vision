# MPI-504 — the prompt payload

The **sheet template** is graph payload — four widget values inside the sheet graph, the
head-swap pattern, with the app injecting only the character text and the style index.

The **enhancer recipe is NOT**, as of 2026-08-19. `qwen3vl_4b_prompt_enhancer.json` was made
universal so it can serve any flow that needs an LLM rewrite, so the recipe is **injected at run
time** into `Input_System_Prompt` and lives in app code. This file stays the source of truth for
the text; the graph only carries it as a bench default. See plan.md for the inject keys.

Two pieces:

1. **The sheet template** — one per style, `[CHARACTER PROMPT]` punched out.
2. **The enhancer recipe** — the system prompt injected into `Input_System_Prompt` on
   `qwen3vl_4b_prompt_enhancer.json`. It rewrites the user's idea into the CHARACTER ONLY, in a
   shape that drops into that hole.

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
**`Input_Recipe`** (1-indexed, matching the head-swap `Input_Tier` pattern). Nothing about the
style reaches the app beyond that integer.

**The field is `Input_Recipe`, not `Input_Style`** (Fabio, 2026-08-19): the node picks a prompt
RECIPE, so the same bank-behind-an-int is reusable by any later flow that needs one. It also
keeps the name clear of `Input_Style_Selector`, which is the style-LoRA rack and a different
thing entirely.

Built 2026-08-19 in `comfy_workflows/raw/krea2_t2i_only.json` as nodes `666`-`669`
(`Recipe_Photoreal` / `Recipe_3D` / `Recipe_Anime` / `Recipe_Cartoon`), `670 Recipe_Select`
and `671 Input_Recipe`. The three non-photoreal strings were generated from the skeleton above,
with the Photoreal output asserted byte-identical to the block below — so the skeleton and the
table stay the source of truth, and a fifth style is one row plus one node.

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

**PASSED 2026-08-19 — the gate is closed.** One male character (arm F's phrase), both wordings, at
three seeds at 1k-turbo plus the shipping 2k-quality rig — 8 generations, `raw/` untouched, patched
in the API payload only. **Visually indistinguishable in all four cells:** same man, same three
panels in the same arrangement, same continuous backdrop, wardrobe, knife at the right hip, scar on
the left cheekbone, catch-light in both pupils. Layout compliance does not depend on `man` / `his`.

**The fallback below is therefore NOT needed and should not be built** — kept only as a record of
what was considered:

> ~~If the neutral version loses the layout, let the enhancer state the sex and keep a
> `man`/`woman` token switched off the same output.~~

Each cell asserted the wording actually reached the sampler by reading back `673 Output_prompt` —
8 of 8 — and the builder aborts if any of the five reversal anchors is missing. Both guards exist
because an arm that silently fails to differ manufactures a false pass. Full entry and the image
paths: validation.md.

---

## 2. The enhancer recipe — character only

Injected whole into `Input_System_Prompt` on `qwen3vl_4b_prompt_enhancer.json`. **The ChatML
wrapper is part of this string and is load-bearing** — the workflow's three `StringConcatenate`
nodes append the user's text after `<|im_start|>user` and then
`\n<|im_end|>\n<|im_start|>assistant`, so the first and last lines must survive verbatim.
The graph carries this text as its baked default too, so it runs standalone at the bench.

**Why the current recipe cannot be reused.** Fed *"a 1870s Western Indian Chief"* it returns a
whole scene — a sun-baked plain, a smoke-stained teepee, dust in the heat, a staff in his
right hand. Every one of those is wrong here: the sheet is a grey studio backdrop, the hands
are empty at the sides, and the output has to be a **noun phrase dropped into the middle of a
sentence**, not a sentence of its own.

```
<|im_start|>system
You are a character designer. You write the CHARACTER half of a character reference sheet prompt, and nothing else.

Your output is dropped into the middle of a longer sentence that already reads "character reference sheet of ___, photographed as ...". So write a NOUN PHRASE, never a sentence, in this shape: "a <age> <build> <who they are>, <face and hair>, wearing <garments head to foot>, <worn gear and where it sits>, <how it all reads from behind>". Start with a lower-case letter and end WITHOUT a full stop. Never write a verb of action - the character is standing still with their arms at their sides.

LENGTH: aim for 70 words. 90 words is a hard ceiling - stop there even if something is left unsaid.

Describe only these four things, in this order:
1. Who they are. Age, build, height, sex, and origin or ethnicity where the user implied one.
2. The face and head. Face shape, skin, hair colour, hair length, hair texture and how it is worn, facial hair, eye colour, lines, scars, tattoos, marks. Name the hair in full here - colour, length and texture together in one clause.
3. The wardrobe and worn gear, head to foot. Headwear, each garment in the order it is worn, colours, fabrics, wear and dirt, belts, jewellery, footwear - and any weapon, tool, bag or kit the character keeps ON THE BODY: holstered, sheathed, slung, quivered, belted or shouldered. Say where each piece sits and how large it reads against the body, so the sheet doubles as the scale reference for that item.
4. How the wardrobe and gear read FROM BEHIND. The back of the outer garment, how the hair falls or is tied at the back, anything slung or quivered across the back. The sheet carries a rear view and the model has to know what belongs there. Write the rear hair clause in this exact shape: "the <colour> <texture> hair <worn how at the back>". The colour word and the texture word must both appear again here even though you already wrote them above - the rear view is rendered from this clause alone.

Leave all of this out:
- Any location, background, ground, sky, weather, building, loose prop or furniture, and any second person or animal. The character stands on a plain grey studio backdrop.
- Any pose, gesture, action, mood or story. The pose is fixed by the rest of the prompt.
- Anything held in the hands. The hands are open and empty at the character's sides, so every weapon, tool and bag is worn rather than carried.
- Camera, lens, shot type, framing, lighting, film stock, colour grade, medium or art style. The rest of the prompt owns every one of those.

Rules:
1. Keep every attribute the user stated - age, colours, wardrobe, gear, marks - in their own words wherever those words work.
2. Fill in only what the user left open, and only inside the four categories above. Every character you write comes from the user's words alone; you have no house character and no default character.
3. Gear the user named always goes in, worn on the body.
4. Where the user named no gear, you may add at most two pieces the character could not plausibly be without - a working cowboy's gunbelt, a soldier's sidearm, a hunter's quiver. Never anything exotic, story-specific or decorative.
5. Positive phrasing only. Every clause names something that IS there. An absence is either rewritten as a presence or deleted outright:
   - "no facial hair" -> "clean-shaven"
   - "no tattoos or scars" -> delete the clause
   - "no weapon on body", "no belt or holster" -> delete the clause
   - "the back shows no quiver" -> "the back of the coat hangs plain"
   Before you output, reread your draft and delete every clause containing "no", "not", "none", "without", "absent", "unarmed", "free of", "empty of", "devoid of", "lacking" or "bare of". An output containing any of those words is wrong.
6. One block of plain prose. Commas, not bullets.
7. Never write the words "character reference sheet", "front view", "back view" or "three views". That structure is already in the prompt around you.
8. Do not sanitise or soften what the user asked for.

Output ONLY the description: 45 to 90 words, lower-case first letter, no full stop at the end. No preamble, no explanation, no quotes, no markdown.<|im_end|>
<|im_start|>user
```

### What it returns — MEASURED 2026-08-19, five revisions

The recipe above is **v4.2**. v1, v2, v4.1 and v4.3 were run and disproved on the bench engine
(8188) against the four regression inputs, with the real Prompt Enhancement chain rebuilt node
for node — same `qwen3vl_4b_abliterated_fp8_scaled`, same ChatML assembly, temperature 0.5.
v1–v3 ran at seed 0 only; **the v4.x arms ran at seeds 0 and 1**, 8 samples each. Full outputs:
[research/enhancer-regression-2026-08-19.md](research/enhancer-regression-2026-08-19.md).

| | v1 (drafted blind) | v2 | v3 | v4.1 | v4.2 (above) |
|---|---|---|---|---|---|
| stays on the user's character | **2 of 4** | 4 of 4 | 4 of 4 | 4 of 4 | 4 of 4 |
| 45–90 words | 0 of 4 (86–129) | 2 of 4 | **4 of 4** (50–81) | 7 of 8 | 8 of 8 |
| nothing held | 4 of 4 | 4 of 4 | 3 of 4 | 4 of 4 | 7 of 8 |
| no place / light / camera | 2 of 4 | 4 of 4 | **4 of 4** | 4 of 4 | 7 of 8 |
| says something about the back | 4 of 4 | 4 of 4 | 4 of 4 | 4 of 4 | 8 of 8 |
| positive phrasing only | 0 of 4 | 0 of 4 | **0 of 4** | 0 of 4 | 0 of 8 |
| **rear clause restates the hair COLOUR** | — | — | — | **2 of 8** | **8 of 8** |
| rear clause restates colour AND texture | — | — | — | 0 of 8 | 5 of 8 |
| main/rear colour contradiction | — | — | — | 0 of 8 | **2 of 8 — open** |

v1–v3 are 4 samples (seed 0); v4.1 and v4.2 are 8 (seeds 0 and 1). `positive phrasing only` has
never landed at any revision and is fixed in the graph, not the recipe — see the scrub nodes below.

**v1's killer was an example inside the instruction.** The parenthetical
`("a weathered Plains chief in his late sixties, ...")` that showed the noun-phrase shape was
copied out verbatim as the answer: *a cyberpunk street medic* and *a gunslinger* both came back
as the Plains chief, wardrobe and all. A 4B reads a complete example as the target, not as a
shape. v3 shows the shape as a slot template (`"a <age> <build> <who they are>, ..."`), which no
model can mistake for prose — **do not put a readable example in this prompt again.**

**Re-proved at v4.3, 2026-08-19.** An attempt to close the rear-clause colour drift wrote *"if you
wrote 'dark brown' above, the rear clause says 'dark brown', not 'black'"* — and `dark brown` was
copied out of the instruction into the output of a **red-haired** character, at both seeds. The
rule is not v1-specific and it is not about long examples: **any readable example is read as the
target.** Slot templates only.

**Positive phrasing never landed, at any revision.** Every output states absences —
"no facial hair", "no tattoos or scars", and for `a gunslinger, no weapons` the model wrote the
refusal five times over ("no belt or holster, ... no weapon on body, ... back of jacket shows no
holster or quiver"). This is the one failure that actually reaches Krea2, which is
positive-phrasing-only: *"no weapon on body"* draws a weapon. v3's substitution table
(`"no facial hair"` → `"clean-shaven"`) is adopted about half the time and no wording tried
closes it. **Fix it in the graph, not in the recipe** — see below.

`use_default_template` was A/B'd true vs false with the manual ChatML in place: **byte-identical
output on all four inputs**, node `58` executing fresh both times (only `69` and `420` came back
`execution_cached`). The flag is inert for this node and model — leave the shipped `true`.

### The two scrub nodes — required, not optional

Two core `RegexReplace` nodes between `TextGenerate` and the `[CHARACTER PROMPT]` hole. Verified
offline against all four real v3 outputs: negation gone 4/4, rear-view clause kept 4/4, trailing
full stop gone 4/4.

| node | `regex_pattern` | `replace` |
|---|---|---|
| scrub-negation | `\s*(?:with\|and\|but\|showing\|shows)?\s*\b(?:no\|not\|none\|without\|absent\|unarmed\|devoid\|lacking)\b[^,]*` | *(empty)* |
| tidy | `,\s*(?=,)\|[\s,.]+$` | *(empty)* |

They cut the negative **tail** of a clause rather than the clause, which is what keeps
*"the back of the coat hangs plain"* when the model wrote *"...hangs plain with no visible
gear"*. Cutting whole clauses (tried first) silently ate the rear-view sentence on 2 of 4.
`case_insensitive` stays at its default `true`.

Known ceiling: a clause whose verb sat inside the cut leaves a bare subject stub
(*"the back of the coat,"* on input 4). Harmless to a positive-only model and rare; the upgrade
path is recipe wording, not a bigger regex.

Regression checks for the recipe (text-only, needs a running engine, no generation): feed it
`a 1870s Western Indian Chief`, `a cyberpunk street medic`, `a tired schoolteacher, 40s, red
hair`, `a gunslinger, no weapons` and confirm each output (a) starts lower-case with a noun
phrase and no trailing full stop, (b) names nothing held in the hands, (c) names no place, light
or camera, (d) says something about the back, (e) lands in 45-90 words, (f) carries worn gear
where the archetype implies it.

**The fourth input is a WATCH, not a gate**, since tier 3 was cut. What it must still prove is
that the words "no weapons" do not survive into the output — the user's negative reaching Krea2
is the failure that matters. Whether the gunslinger ends up wearing a gunbelt is now the user's
call at the review step, not a check.

Runner: `scratchpad/enhancer-regression2.mjs <sysprompt file> <use_default_template> <label>`,
copied into the research file.

### Hair — name it ONCE, in full (Fabio, 2026-08-19). RAN AND DISCONFIRMED — the v4.1 proposal below stands

**The shape tested:** the main hair clause carries the whole description — colour AND texture together, `long straight iron-grey hair worn loose past the shoulders` — and the rear clause names only how it falls, repeating no attribute. Fabio's reasoning: saying the same thing twice is the likelier source of the confusion.

**Measured 2026-08-19 (arms E and F, validation.md), and it does not hold.** Removing the repeat changed nothing — arm E's rear panel sits on the control to three decimals. The two arms that DO repeat are the only two that ever moved the rear panel (B `0.161`, F `0.165` against a `0.181`-`0.184` control band). Repetition is mildly helpful, not harmful.

**So the amendment below is reinstated as the best-measured shape**, and arm F is its strongest form: name the hair in full in the main clause AND repeat colour and texture in the rear clause. **Not adopted — this reverses Fabio's explicit call and needs his go.**

**Rear-view texture is a model limit** — wavy in every run, at every seed, under every wording, while the portrait renders it straight in the same frame. Four seeds, ~a dozen wordings. (This claim was stated, withdrawn as premature, re-established on arm K, and withdrawn again when K failed to reproduce across seeds. Both flips came from n=1 at seed `504504`. The four-seed version is the one to trust.)

**The F shape's real win is COLOUR, and it replicates.** At seed `777001` the control renders the rear panel brown and F renders it grey; same at `909090` and `123123`. Seed `504504` — the only seed the investigation ran on — is an unusually hard one where F only partly fixes it, which made a solved problem look unsolved. **No wording variant beyond F is established:** a six-run noise floor put F against K at 2-2 per-seed wins with the within-arm spread an order of magnitude wider than the between-arm difference. See validation.md, the noise-floor entry.

### Rear clause — restate the hair COLOUR, measured 2026-08-19 (v4.1 — REINSTATED, see above)

Rule 4 currently asks for *"how the hair falls or is tied at the back"*. Measured on the sheet,
that is not enough: with the rear clause naming only how the hair falls, Krea2 rendered the back
view's hair dark brown against straight iron-grey on the other two panels, on **two different
seeds**. Repeating the colour in that clause moved it to grey-streaked at a held seed — the one
wording change of three tried that did anything.

Proposed amendment to rule 4, appended to its existing sentence:

> … **and restate the hair's colour there, in the rear clause itself — not only where the hair is
> first described.** The rear view is rendered from that clause alone.

Two things this does NOT fix, both measured:

- **Hair texture.** An arm that said `the same straight iron-grey hair` in the REAR clause still
  returned wavy hair at the back. That was first written up as "texture does not respond to
  wording", withdrawn as premature (the main clause named no texture, so the attribute was never
  stated where every panel reads it) — and then **re-established on evidence** by arms E and F,
  which stated it in the main clause and in both clauses at once. Wavy in all six runs, three
  seeds. It is a limitation, and now a measured one.
- **A template-side instruction.** Naming the invariant in the sheet template's global identity
  clause (`identical hair colour, hair length and hair texture in all three views`) did nothing at
  all — arm D, validation.md. The words have to be in the character phrase.

**APPLIED AND REGRESSED 2026-08-19 — and the prose amendment was not enough.** Written as the
sentence quoted above (that arm is **v4.1**), the model obeyed category 2 but not category 4:
across 8 samples the rear clause restated the hair colour **2 times in 8**, and colour-and-texture
together **0 times in 8**. The only colour hits came on the input where the user typed `red hair`
themselves. So the F shape's measured win — rear-panel colour, replicated at three seeds on
hand-written phrases — **did not survive the round trip through the LLM**, because the LLM was not
writing the clause the win depends on.

What fixed it is a **slot template**, the same device that killed v1's example leak — now the
shipped wording in rule 4 above:

> Write the rear hair clause in this exact shape: `"the <colour> <texture> hair <worn how at the
> back>"`. The colour word and the texture word must both appear again here even though you
> already wrote them above - the rear view is rendered from this clause alone.

That is **v4.2**: rear colour **8 of 8**, colour-and-texture **5 of 8**, and it costs nothing on
the main clause (7 of 8 vs v4.1's 6 of 8 — the one seed-0 regression there was sampling noise and
did not reproduce at seed 1).

**Open residual, ~2 in 8: the model writes `dark brown` in the main clause and `black` at the
back.** A wrong-coloured rear panel is the exact defect this shape exists to kill, so it is not
closed — it is smaller. Do NOT try to close it with a worked example: **v4.3 did, and was
disproved** (research file). Demanding a verbatim copy with the illustrative pair *"if you wrote
'dark brown' … not 'black'"* leaked `dark brown` into a **red-haired** character at both seeds, and
made 4 of 8 rear clauses a character-for-character duplicate of the main clause, which describes
nothing about the back at all. The upgrade path is accepting the drift or moving the invariant out
of the recipe — not more wording.

### The gear policy — settled 2026-08-19

Fabio: the cowboy-movie sheets this whole layout comes from had no gear on them, and *"that
would have saved quite a lot of trouble, because we wouldn't need separate item sheets, and
scale would be sorted from the beginning."* So gear on the sheet is a **feature**, not leakage:
a holstered revolver drawn once at the right size against the body is a scale reference every
later shot inherits, and it retires a second sheet.

**Two tiers, both recipe text** — no new field, no toggle:

| the user | the sheet |
|---|---|
| names gear | wears it, always, positioned and sized |
| names none | wears at most **two** archetype-inevitable pieces (a working cowboy's gunbelt), nothing exotic |

### The third tier was CUT — Fabio, 2026-08-19, after the regression

The original policy had a third tier: *"rules it out in plain words → wears none"*, on the
reasoning that the LLM reads "no weapons" as an instruction so the image prompt simply omits
them. **The regression disproved it.** v1 handed `a gunslinger, no weapons` a gunbelt outright,
and v3 only came back clean because the model *named* the absences and the scrub deleted the
naming — phrasing luck, not compliance. When it writes "a worn gunbelt slung low across his
hips" instead, nothing downstream can tell that clause from a wanted one.

Fabio's call: **the recipe writes the character, and the character only. Gear exclusion is the
user's job, through the prompt they can see and edit.** A user who wants no weapons deletes the
clause, or writes the description themselves with the enhancer off.

Rejected on the way: a `StringContains` trigger feeding a weapon-clause `RegexReplace`. It is
buildable from shipped core nodes, but the vocabulary is open-ended and a wordlist that catches
"bandolier" also deletes the satchel the user wanted. The review step below solves it generally
and correctly instead.

**Note the scrub nodes stay regardless.** Negation is not a weapons problem: "no facial hair"
and "no tattoos or scars" turn up on inputs that never mention gear, and they reach Krea2 just
the same. Cutting tier 3 removes a promise the recipe could not keep; it does not remove the
need to strip negatives.

The counterweight that motivated tier 3 is still real: anything the sheet invents becomes canon
for every shot that character appears in. The cap of two, the "nothing exotic" clause, and the
review step are what keep that cheap.

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
