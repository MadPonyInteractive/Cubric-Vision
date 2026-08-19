# MPI-504 — enhancer recipe regression, 2026-08-19

Bench engine `127.0.0.1:8188`, `qwen3vl_4b_abliterated_fp8_scaled.safetensors` through
core `TextGenerate`. The Prompt Enhancement chain of `krea2_t2i_template.json` rebuilt node
for node in API form — `CLIPLoader 69` → system string `420` + user string `112` →
`StringConcatenate 422/418/419` (ChatML) → `TextGenerate 58` → `StringReplace 423` →
`PreviewAny 242`. `max_length` 512, `sampling_mode` on, temperature 0.5, top_k 64, top_p 0.95,
min_p 0.05, repetition_penalty 1.05, **seed 0**, presence_penalty 0, thinking false.

No image was generated. One sample per input per arm.

**API gotcha, worth keeping.** `TextGenerate.sampling_mode` is a `COMFY_DYNAMICCOMBO_V3`:
its sub-inputs are flat keys **prefixed with the parent id** — `"sampling_mode.temperature"`,
not a nested object and not a bare `temperature`. Getting that wrong returns
`prompt_outputs_failed_validation` / `required_input_missing` naming every sub-input at once,
which reads like the node is broken. `comfy_api/latest/_io.py:1599` is the authority.

---

## v1 — the recipe as drafted (prompts.md, session 1)

**Disproved.** 2 of 4 inputs came back as the example that lives inside the instruction — the
parenthetical `("a weathered Plains chief in his late sixties, ...")`. The user's character was
discarded entirely. Every output also overran the 45-90 word band (86-129) and stated absences.

### `a 1870s Western Indian Chief` — 129 words — FAIL: a_lowercase_nounphrase, c_no_place_light_camera, e_words_45_90

> a weathered Plains chief in his late sixties, broad-shouldered and tall, with a lean, muscular frame, dark skin, salt-and-pepper hair tied back in a thick braid, no facial hair, deep-set brown eyes, faint lines around the mouth and forehead, a small scar above the left eyebrow, no tattoos or marks, wearing a worn leather vest over a faded wool shirt, a heavy wool coat with frayed cuffs and collar, a buckled gunbelt with a single revolver holstered at hip level, a quiver of arrows slung across the back, a heavy leather satchel strapped to the left thigh, the coat’s back shows a rawhide patch over the right shoulder, the braid hangs loose at the nape, the quiver’s strap crosses the spine, the satchel’s strap dips low on the hip.

### `a cyberpunk street medic` — 103 words — FAIL: a_lowercase_nounphrase, e_words_45_90

> a weathered Plains chief in his late sixties, broad-shouldered and tall, with a thick neck and sun-bleached skin, wearing a faded leather vest over a tattered flannel shirt, a worn denim jacket slung low on his hips, a heavy gunbelt with a holstered revolver at his right hip, a leather satchel strapped across his chest, a quiver of arrows tucked beneath his left arm, his hair tied back in a rough braid, scars etched along his jawline and temple, tattoos inked on his forearms, eyes narrowed with age, face lined with deep creases, no facial hair, standing still with arms at his sides.

### `a tired schoolteacher, 40s, red hair` — 91 words — FAIL: a_lowercase_nounphrase, e_words_45_90

> a tired schoolteacher, 40s, medium build, standing at 5'10", female, of mixed heritage, face with soft oval shape, pale skin, long red hair tied back in a loose braid, sparse salt-and-pepper stubble, hazel eyes, faint lines around mouth and forehead, no visible scars or tattoos, wearing a faded navy blazer over a cream blouse, dark trousers with frayed cuffs, worn leather belt with a single buckle, no weapon or pouch, gunbelt absent, quiver or bag not present, rear view shows braid trailing down the back, no slung gear or quivered items.

### `a gunslinger, no weapons` — 86 words — FAIL: a_lowercase_nounphrase, c_no_place_light_camera, f_gear

> a weathered Plains chief in his late sixties, broad-shouldered and tall, with a rugged face and salt-and-pepper hair tied back in a rough knot, deep-set eyes with faint scars across the left cheek, wearing a faded brown leather vest over a coarse wool shirt, a worn gunbelt slung low across his hips, sturdy boots caked with dust, and a heavy duffel bag slung over one shoulder, the back of his vest showing the raw edge of the belt and the duffel’s strap taut against his spine.

---

## v2 — slot-template shape, no readable example, length rule hoisted

Example leak gone, all four on-topic, length down. Absences still stated on 4 of 4, and
`a gunslinger, no weapons` wrote the refusal out five times. Trailing full stop on 4 of 4.

### `a 1870s Western Indian Chief` — 92 words — FAIL: a2_no_trailing_stop, e_words_45_90, g_positive_only

> a 30 year old tall, broad-shouldered male, of mixed indigenous heritage, with a square jaw, dark brown skin, long black hair tied back in a thick braid, no facial hair, deep brown eyes, faint scars along the left cheek and neck, wearing a dark woolen coat over a fringed shirt, leather chaps, a heavy belt with a brass buckle, a holstered rifle at his right hip, a quiver of arrows slung across his back, the coat’s back shows the braid trailing down his spine, the quiver’s strap visible against his shoulder blades.

### `a cyberpunk street medic` — 89 words — FAIL: a2_no_trailing_stop, g_positive_only

> a 32 year old lean, tall, male, of mixed asian descent, with a sharp angular face, pale skin, short black hair slicked back, no facial hair, deep brown eyes, faint scars across the left cheek, wearing a matte black tactical vest over a faded grey t-shirt, dark blue cargo pants, worn combat boots, a silver medical badge pinned to the vest’s right chest, a holstered pistol at hip level, a quiver of needles slung across the back, the vest’s rear panel shows the quiver’s strap and the badge’s edge.

### `a tired schoolteacher, 40s, red hair` — 102 words — FAIL: a2_no_trailing_stop, e_words_45_90, g_positive_only

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, pale skin, long red hair tied back in a loose braid, no facial hair, hazel eyes, faint lines around the mouth, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather boots, a thin brown belt with a silver buckle, a small leather satchel slung across her left shoulder, the back of the blazer shows a slight crease down the spine, the braid trails down her back, the satchel hangs low on her left hip, the belt is snug against her waist.

### `a gunslinger, no weapons` — 83 words — FAIL: a2_no_trailing_stop, f_gear, g_positive_only

> a 32 year old lean male, standing at 5'10", with a rugged face and sun-weathered skin, wearing a faded brown leather jacket over a black shirt, dark trousers, and worn boots, no belt or holster, hair tied back in a tight braid, face unmarked except for a faint scar above the left eyebrow, no tattoos or jewelry, no weapon on body, back of jacket shows no holster or quiver, hair falls straight down the spine, no gear slung or strapped across the back.

### `use_default_template` A/B

Same recipe, `use_default_template` false instead of true. Output was **byte-identical on all
four inputs**. Node `58` executed fresh in both arms — `/history` reports only `["69","420"]`
as `execution_cached`, so this is a real null result and not the caching trap. The flag is
inert for this node and model; leave the shipped `true`.

Identical-output proof: confirmed byte-identical.

---

## v3 — substitution table for absences, "aim for 70 words"

Length lands 4 of 4 (50-81 words). `clean-shaven` and `the back ... hangs plain` are adopted.
Absences still stated on 4 of 4. Prompt-only iteration is at its ceiling on this model.

### `a 1870s Western Indian Chief` — 65 words — FAIL: a2_no_trailing_stop, g_positive_only

> a 30-year-old tall, broad-shouldered male, of mixed indigenous heritage, with a strong jawline and clean-shaven face, dark brown hair tied back in a thick braid, wearing a faded red woolen coat over a black leather vest, a heavy copper belt with a rusted buckle, a worn leather satchel slung across his chest, the back of the coat hangs plain with no visible gear or markings.

### `a cyberpunk street medic` — 50 words — FAIL: a2_no_trailing_stop, b_nothing_held, f_gear, g_positive_only

> a 32-year-old lean, wiry male, clean-shaven, with short dark hair slicked back, wearing a matte black tactical vest over a faded grey t-shirt, layered with a worn leather jacket, carrying a medical kit slung across his chest, the back of the jacket hangs plain with no visible gear or markings.

### `a tired schoolteacher, 40s, red hair` — 81 words — FAIL: a2_no_trailing_stop, g_positive_only

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of mixed heritage, with a round face, pale skin, red hair tied back in a loose bun, clean-shaven, light brown eyes, faint lines around the mouth, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather shoes, a single silver pendant on a chain around her neck, no weapon or belt, the back of the blazer hangs plain, hair tied tightly at the nape, no slung gear visible.

### `a gunslinger, no weapons` — 72 words — FAIL: a2_no_trailing_stop, f_gear, g_positive_only

> a 32-year-old lean, wiry man, standing at 5'10", with a clean-shaven face and sharp jawline, wearing a faded brown leather jacket over a black t-shirt, with no visible tattoos or scars, his hair is short, dark, and slicked back, the jacket hangs loose at the back, no quiver or belt, the back of the coat shows no weapon or gear, the fabric is worn but uncreased, the hands remain open and empty.

---

## The scrub, applied to the v3 outputs (offline)

Two core `RegexReplace` nodes:

```
scrub-negation  \s*(?:with|and|but|showing|shows)?\s*\b(?:no|not|none|without|absent|unarmed|devoid|lacking)\b[^,]*   ->  ""
tidy            ,\s*(?=,)|[\s,.]+$                                                                                  ->  ""
```

Cutting the negative **tail** rather than the whole clause is load-bearing: the whole-clause
version was tried first and ate the rear-view sentence on 2 of 4, because the model likes to
end that clause with a negation ("the back of the coat hangs plain with no visible gear").

### `a 1870s Western Indian Chief`

- **65w → 59w**, negation gone, rear view kept, no trailing stop

> a 30-year-old tall, broad-shouldered male, of mixed indigenous heritage, with a strong jawline and clean-shaven face, dark brown hair tied back in a thick braid, wearing a faded red woolen coat over a black leather vest, a heavy copper belt with a rusted buckle, a worn leather satchel slung across his chest, the back of the coat hangs plain

### `a cyberpunk street medic`

- **50w → 44w**, negation gone, rear view kept, no trailing stop

> a 32-year-old lean, wiry male, clean-shaven, with short dark hair slicked back, wearing a matte black tactical vest over a faded grey t-shirt, layered with a worn leather jacket, carrying a medical kit slung across his chest, the back of the jacket hangs plain

### `a tired schoolteacher, 40s, red hair`

- **81w → 73w**, negation gone, rear view kept, no trailing stop

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of mixed heritage, with a round face, pale skin, red hair tied back in a loose bun, clean-shaven, light brown eyes, faint lines around the mouth, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather shoes, a single silver pendant on a chain around her neck, the back of the blazer hangs plain, hair tied tightly at the nape

### `a gunslinger, no weapons`

- **72w → 57w**, negation gone, rear view kept, no trailing stop

> a 32-year-old lean, wiry man, standing at 5'10", with a clean-shaven face and sharp jawline, wearing a faded brown leather jacket over a black t-shirt, his hair is short, dark, and slicked back, the jacket hangs loose at the back, the back of the coat, the fabric is worn but uncreased, the hands remain open and empty

Residual: input 4 leaves the stub `, the back of the coat,` where the verb sat inside the cut.
Positive-only and harmless to Krea2; not worth a bigger regex.

---

## v4.1, v4.2, v4.3 — the F hair shape through the enhancer, and how the rear clause was finally made to carry it

Run 2026-08-19, same rig as v1–v3 (bench `8188`, `qwen3vl_4b_abliterated_fp8_scaled`, ChatML
rebuilt node for node, temperature 0.5, `use_default_template` true, one sample per input per
arm). **Two seeds per arm this time, 0 and 1** — 24 samples total — because this card's own
standing rule is that one sample is a pilot, not a result. The runner gained a `SEED` env var
and a positional hair-clause dump; both are in the Runner section below.

**v4.1** is the recipe as prompts.md §2 carried it after Fabio adopted the F shape: category 2
gained *"Name the hair in full here - colour, length and texture together in one clause"*,
category 4 gained *"Restate the hair's colour and texture here, in the rear clause itself"*.
That text had been edited but never run — this pass is the regression it owed.

**v4.2** replaces category 4's restate sentence with a slot template, the same device that killed
v1's example leak:

> Write the rear hair clause in this exact shape: `"the <colour> <texture> hair <worn how at the
> back>"`. The colour word and the texture word must both appear again here even though you
> already wrote them above - the rear view is rendered from this clause alone.

**v4.3** adds a verbatim-copy instruction on top of v4.2, to close v4.2's residual colour drift.
**It was disproved — see below.**

### The four v3 guarantees — v4.1 holds all of them

| gate | v3 | v4.1 |
|---|---|---|
| stays on the user's character | 4 of 4 | **4 of 4** |
| 45–90 words | 4 of 4 (50–81) | **4 of 4** at seed 0 (49–81); 3 of 4 at seed 1 (chief 95w) |
| nothing held | 3 of 4 | **4 of 4** |
| no place / light / camera | 4 of 4 | **4 of 4** |
| no example leak | 4 of 4 | **4 of 4** |
| post-scrub: negation gone / rear clause kept / no trailing stop | 4 of 4 | **4 of 4**, both seeds |

Unchanged pre-existing conditions, both cleared by the two `RegexReplace` nodes, neither a
regression: the raw output still ends with a full stop, and still states absences. The known stub
ceiling merely moved input — v3 left `, the back of the coat,` on input 4, v4.1 leaves
`the back of the vest,` on input 2. Same cause, same verdict.

**Input 4 (`a gunslinger, no weapons`) passes its watch at every arm and every seed.** The user's
negative never reaches Krea2.

### The hair — scored by reading the clauses, over two seeds

The checker booleans are a screen, not the evidence. They false-negative in three known ways:
they split on commas so a description spanning two clauses scores false; the texture word list
lacks `stiff`; and the rear/main classifier reads the `back` inside `slicked back` as a rear
marker. The positional clause dump (`@offset`) is what these scores were read off.

| | v4.1 (8 samples) | v4.2 (8) | v4.3 (8) |
|---|---|---|---|
| main clause names colour + length + texture | 6 of 8 | **7 of 8** | 3 of 8 — length is dropped |
| rear clause restates the colour | 2 of 8 | **8 of 8** | 8 of 8 |
| rear clause restates colour AND texture | 0 of 8 | **5 of 8** | 8 of 8 |
| main/rear colour **contradiction** | 0 of 8 | 2 of 8 | 2 of 8 (leak-caused) |
| rear clause is a **verbatim copy** of the main clause | 0 of 8 | 0 of 8 | **4 of 8** |
| **example leak from the instruction** | 0 of 8 | 0 of 8 | **2 of 8** |

**v4.1 fails the gate that matters.** Category 2 landed cleanly — `dark brown hair cut short and
stiff`, `short black wavy hair`, `long thick black hair tied back in a low ponytail`. Category 4
did not: the rear clause restates the colour twice in eight, and colour-and-texture together
zero times in eight. The only colour hit at seed 0 is the schoolteacher, and only because the
user typed `red hair` themselves.

This is not cosmetic. validation.md records the F shape's measured, replicating win as rear-panel
**colour** at three seeds — control renders the back view brown, F renders it grey. Arms E and F
were hand-written character phrases. **At v4.1 the win does not survive the round trip through the
LLM**, because the LLM does not write the clause the win depends on.

**v4.2 fixes it: rear colour 2 of 8 → 8 of 8, colour-and-texture 0 of 8 → 5 of 8.** The seed-0
run also showed the gunslinger losing hair from the main clause entirely, which read like a cost —
seed 1 came back 4 of 4 on that gate, so it was sampling noise, and across both seeds v4.2 is
*better* on the main clause than v4.1 (7 of 8 vs 6 of 8). The slot template costs nothing it was
feared to cost.

**v4.2's real residual: 2 of 8 write a different colour at the back.** Both times the model wrote
`dark brown` in the main clause and `black` in the rear — a rear panel rendering the wrong hair
colour, which is precisely the defect the F shape exists to kill. Note that v4.1's clean
contradiction column is not a win: it never states colour at the back at all, so it fails the same
thing silently instead of visibly.

### v4.3 — DISPROVED, and it re-proved a lesson already in this file

The attempt at v4.2's residual was to demand a verbatim copy, with an illustrative pair:

> Copy the colour word and the texture word from the clause above VERBATIM - the same words, never
> a synonym, never a different shade. If you wrote "dark brown" above, the rear clause says "dark
> brown", not "black". …

Two failures, both structural:

1. **The example leaked, exactly as v1's did.** On `a tired schoolteacher, 40s, red hair` the
   phrase `dark brown` was copied out of the *instruction* into the *output*, at both seeds:
   `the red hair dark brown texture worn in a loose braid` (seed 0) and a red-haired character
   given `the dark brown wavy hair tied back in a loose braid` (seed 1). **A 4B reads any readable
   example as the target.** This file already said *"do not put a readable example in this prompt
   again"* — v4.3 is that rule violated and re-measured. The slot-template form (`<colour>`,
   `<texture>`) is safe precisely because it is not readable prose.
2. **"Verbatim" was obeyed too literally.** Four of eight rear clauses are a character-for-character
   copy of the main clause — `dark brown wavy hair tied back in a low knot` appearing twice in one
   output. A duplicated clause is not a rear-view description: it says nothing about how the hair
   reads from behind, which is the entire job of category 4. The length word also disappears from
   the main clause in 5 of 8.

**Verdict: adopt v4.2, discard v4.3.** The residual colour drift stays open at ~2 in 8, and the
upgrade path is not a wording example — it is either accepting it, or moving the invariant out of
the recipe entirely.

### The outputs, verbatim

Recorded in full because this card has already had to rebuild arms from `/history` once. Text
shown is post-scrub — what actually reaches Krea2.

### v4.1, seed 0

**`a 1870s Western Indian Chief`** — 73w → 73w scrubbed

> a 30-year-old tall, broad-shouldered male, of mixed Anishinaabe and Ojibwe descent, with a strong jawline, clean-shaven face, dark brown hair cut short and stiff, wearing a full woolen war bonnet, a frayed leather vest over a buckskin shirt, a heavy steel belt with holstered rifle, a quiver slung across the back, the back of the coat hangs plain, the hair is tied back in a tight knot, the texture is coarse and unruly

- hair clauses: `dark brown hair cut short and stiff` · `the hair is tied back in a tight knot`

**`a cyberpunk street medic`** — 64w → 59w scrubbed

> a 28 year old lean wiry female, clean-shaven, with short black wavy hair, wearing a matte black tactical vest over a grey compression suit, with a worn leather belt and a holstered pistol at her hip, the back of the vest, her hair falls in loose waves behind her, the vest’s seams and straps are frayed from constant use

- hair clauses: `with short black wavy hair` · `her hair falls in loose waves behind her`

**`a tired schoolteacher, 40s, red hair`** — 81w → 77w scrubbed

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, fair skin, long red hair, wavy and loose over the shoulders, clean-shaven, brown eyes, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather belt, black ankle boots, a worn satchel slung across the left shoulder, the back of the blazer hangs plain, red hair tied loosely at the nape, the satchel’s strap visible across the spine

- hair clauses: `long red hair` · `red hair tied loosely at the nape`

**`a gunslinger, no weapons`** — 49w → 40w scrubbed

> a 32-year-old lean, tall male, clean-shaven, with dark brown, shoulder-length wavy hair, wearing a faded black leather jacket over a worn denim shirt and chipped boots, the back of the coat hangs plain, hair tied back in a loose braid

- hair clauses: `shoulder-length wavy hair` · `hair tied back in a loose braid`


### v4.1, seed 1

**`a 1870s Western Indian Chief`** — 95w → 90w scrubbed

> a 30-year-old tall, broad-shouldered male, of mixed Indigenous descent, with a square jaw, dark brown skin, long thick black hair tied back in a low ponytail, clean-shaven, deep-set brown eyes, wearing a dark woolen coat over a faded red shirt, leather chaps, a heavy brass belt with a large buckle, a holstered revolver at his hip, a quiver of arrows slung across his back, the back of the coat hangs plain, the hair falls straight down the spine, the quiver reads as a wide, curved band across the lower back

- hair clauses: `long thick black hair tied back in a low ponytail` · `the hair falls straight down the spine`

**`a cyberpunk street medic`** — 74w → 71w scrubbed

> a 28 year old lean, tall, male, of mixed asian descent, with a sharp jawline, pale skin, jet-black hair cut short and slicked back, clean-shaven, wearing a matte black tactical vest over a grey jumpsuit, with a silver belt, a holstered pistol at hip, a medical kit slung across the chest, the back of the vest, the hair is tied tight at the nape, the fabric hangs smooth against the spine

- hair clauses: `jet-black hair cut short and slicked back` · `the hair is tied tight at the nape`

**`a tired schoolteacher, 40s, red hair`** — 76w → 71w scrubbed

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, fair skin, long red hair, wavy and loose over her shoulders, clean-shaven, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather boots, a thin belt with a silver buckle, the back of the blazer hangs plain, red hair tied loosely at the nape, falling in soft waves down her spine

- hair clauses: `long red hair` · `red hair tied loosely at the nape`

**`a gunslinger, no weapons`** — 61w → 61w scrubbed

> a 32-year-old lean male, standing 5'10", with a clean-shaven face and sharp jawline, wearing a faded brown leather jacket over a black shirt, dark trousers, and worn boots, with a gunbelt slung low across his hips, the back of the coat hangs plain, his hair is long, dark, and wavy, tied back in a loose braid that trails down his spine

- hair clauses: `his hair is long` · `tied back in a loose braid that trails down his spine.`


### v4.2, seed 0

**`a 1870s Western Indian Chief`** — 55w → 55w scrubbed

> a 30-year-old tall, broad-shouldered male, of mixed heritage, with a square jaw, clean-shaven face, dark brown hair cut short and slicked back, wearing a dark woolen coat over a leather vest, a frayed bandana around his neck, a brass belt with a holstered revolver at his hip, the black hair tied tightly at the back

- hair clauses: `dark brown hair cut short and slicked back` · `the black hair tied tightly at the back`

**`a cyberpunk street medic`** — 58w → 58w scrubbed

> a 28 year old lean wiry male, clean-shaven, with short black curly hair, wearing a patched tactical vest over a dark grey hoodie, layered with a worn leather belt and a silver pendant, carrying a holstered medical injector on the right thigh, the black curly hair tied back in a tight knot at the nape of the neck

- hair clauses: `with short black curly hair` · `the black curly hair tied back in a tight knot at the nape of the neck.`

**`a tired schoolteacher, 40s, red hair`** — 73w → 69w scrubbed

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, fair skin, red hair long and wavy, tied back in a loose braid, clean-shaven, light brown eyes, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather belt with a silver buckle, black boots, a holstered pistol at her hip, the red wavy hair hangs loose at the back

- hair clauses: `red hair long and wavy` · `tied back in a loose braid` · `the red wavy hair hangs loose at the back.`

**`a gunslinger, no weapons`** — 70w → 66w scrubbed

> a 32 year old lean male, 6'1", clean-shaven, with a sharp jawline and deep-set eyes, wearing a faded brown leather coat over a black shirt and dark trousers, the back of the coat hangs plain, the dark hair tied back in a loose braid, the texture smooth and thick, the braid runs down the nape of the neck, the coat’s hem rests just above the ankles

- hair clauses: `the dark hair tied back in a loose braid` · `the braid runs down the nape of the neck`


### v4.2, seed 1

**`a 1870s Western Indian Chief`** — 76w → 71w scrubbed

> a 30-year-old tall, broad-shouldered male, of mixed indigenous heritage, with a square jaw, clean-shaven face, dark brown hair long and wavy, tied back in a thick braid, wearing a dark woolen coat over a leather vest, with a heavy brass belt holding a holstered revolver at his right hip, the blackened leather straps visible against his thigh, the dark brown wavy hair hangs loose at the back, the coat’s rear seam

- hair clauses: `dark brown hair long and wavy` · `tied back in a thick braid` · `the dark brown wavy hair hangs loose at the back`

**`a cyberpunk street medic`** — 52w → 52w scrubbed

> a 28 year old lean, tall, male cyberpunk street medic, clean-shaven, with short dark brown hair slicked back, wearing a matte black tactical vest over a reinforced grey jumpsuit, with a holstered pulse rifle at his hip, a medical kit slung across his chest, the black hair tied tightly at the back

- hair clauses: `with short dark brown hair slicked back` · `the black hair tied tightly at the back`

**`a tired schoolteacher, 40s, red hair`** — 72w → 68w scrubbed

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, fair skin, red hair long and wavy, tied back in a loose braid, clean-shaven, brown eyes, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather belt with a silver buckle, black boots, a holstered pistol at her hip, the red wavy hair hangs loose at the back

- hair clauses: `red hair long and wavy` · `tied back in a loose braid` · `the red wavy hair hangs loose at the back.`

**`a gunslinger, no weapons`** — 53w → 49w scrubbed

> a 32 year old lean tall male, clean-shaven, with dark brown wavy hair cut to shoulder length, wearing a faded black leather jacket over a worn denim shirt and chipped boots, the back of the coat hangs plain, the dark brown wavy hair tied back in a loose knot

- hair clauses: `with dark brown wavy hair cut to shoulder length` · `the dark brown wavy hair tied back in a loose knot.`


### v4.3, seed 0

**`a 1870s Western Indian Chief`** — 78w → 74w scrubbed

> a 30-year-old tall, broad-shouldered male, of mixed Anishinaabe and Sioux descent, with a square jaw, clean-shaven face, dark brown wavy hair tied back in a low bandana, wearing a dark red woolen coat over a buckskin shirt, leather chaps, a heavy brass belt with holstered revolver at hip, a quiver of arrows slung across the back, the dark brown wavy hair tied back in a low bandana, the back of the coat hangs plain

- hair clauses: `dark brown wavy hair tied back in a low bandana` · `the dark brown wavy hair tied back in a low bandana`

**`a cyberpunk street medic`** — 50w → 50w scrubbed

> a 28 year old lean wiry male, clean-shaven, with short black hair slicked back, wearing a matte black tactical vest over a faded grey hoodie, dark blue cargo pants, and worn combat boots, with a holstered medical injector on the right thigh, the black hair slicked back at the nape

- hair clauses: `with short black hair slicked back` · `the black hair slicked back at the nape.`

**`a tired schoolteacher, 40s, red hair`** — 81w → 77w scrubbed

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, fair skin, red hair long and wavy, tied back in a loose braid, clean-shaven, blue eyes, wearing a faded navy blazer over a cream blouse, dark trousers, brown leather belt with a silver buckle, a worn canvas satchel slung across the shoulder, the red hair dark brown texture worn in a loose braid, the back of the blazer hangs plain

- hair clauses: `red hair long and wavy` · `tied back in a loose braid` · `the red hair dark brown texture worn in a loose braid`

**`a gunslinger, no weapons`** — 53w → 49w scrubbed

> a 32-year-old lean, tall male, clean-shaven, with dark brown wavy hair tied back in a low knot, wearing a faded black leather jacket over a worn denim shirt and chipped boots, the dark brown wavy hair tied back in a low knot, the back of the coat hangs plain

- hair clauses: `with dark brown wavy hair tied back in a low knot` · `the dark brown wavy hair tied back in a low knot`


### v4.3, seed 1

**`a 1870s Western Indian Chief`** — 73w → 67w scrubbed

> a 30-year-old tall, broad-shouldered male, of mixed Indigenous descent, with a square jaw, clean-shaven face, dark brown wavy hair tied back in a low knot, wearing a dark woolen coat over a faded red shirt, leather belt with holstered revolver at his right hip, a quiver of arrows slung across his back, the dark brown wavy hair tied back in a low knot, the coat hangs plain

- hair clauses: `dark brown wavy hair tied back in a low knot` · `the dark brown wavy hair tied back in a low knot`

**`a cyberpunk street medic`** — 59w → 59w scrubbed

> a 28 year old lean, wiry male, of mixed asian and european descent, with a sharp jawline, clean-shaven, black slicked-back hair, wearing a matte black tactical vest over a grey armored jacket, with a holstered pulse rifle at his hip, a medical kit slung across his back, the black slicked-back hair tied in a low ponytail at the back

- hair clauses: `black slicked-back hair` · `the black slicked-back hair tied in a low ponytail at the back`

**`a tired schoolteacher, 40s, red hair`** — 84w → 80w scrubbed

> a tired schoolteacher, 40s, medium build, standing at 5'8", female, of european descent, with a round face, fair skin, red hair long and wavy, tied back in a loose braid, clean-shaven, brown eyes, wearing a faded navy blazer over a cream blouse, dark trousers, worn leather belt with a silver buckle, black ankle boots, a holstered pistol at her hip, the red hair tied back in a loose braid, the dark brown wavy hair tied back in a loose braid

- hair clauses: `red hair long and wavy` · `tied back in a loose braid` · `the red hair tied back in a loose braid` · `the dark brown wavy hair tied back in a loose braid.`

**`a gunslinger, no weapons`** — 53w → 49w scrubbed

> a 32-year-old lean, tall male, clean-shaven, with dark brown wavy hair tied back in a low knot, wearing a faded black leather jacket over a worn denim shirt and chipped boots, the dark brown wavy hair tied back in a low knot, the back of the coat hangs plain

- hair clauses: `with dark brown wavy hair tied back in a low knot` · `the dark brown wavy hair tied back in a low knot`

---

## Runner

Kept verbatim so the next revision is one command, not a rebuild. `HERE` is the session
scratchpad and has to be repointed each session — the scratchpad does not survive.

**Two deltas added for the v4.x pass, not shown in the listing below:**

- `const SEED = Number(process.env.SEED || 0);`, with `run(input, SEED)` at the call site, so an
  arm re-runs at a second seed with `SEED=1 node enhancer-regression2.mjs …`. Use it: the v4.2
  main-clause "cost" looked real at seed 0 and was sampling noise.
- The hair-clause dump prints each clause with its character offset
  (`for (const c of r.hairClauses) console.log('  @' + String(r.text.indexOf(c)).padStart(4) + '  ' + c)`)
  rather than a main/rear split. The split classifier is wrong — it reads the `back` inside
  `slicked back` as a rear marker — and position disambiguates without a smarter classifier.
  Plus the checks `s1`–`s3` (the two scrub nodes applied offline) and `v1`–`v5` (the hair shape).
  **The `v*` booleans are a screen, not evidence: read the clause dump.**

```js
// MPI-504 enhancer regression, arm-based.
//   node enhancer-regression2.mjs <sysprompt file> <use_default_template true|false> <label>
import fs from 'node:fs';
import path from 'node:path';

const HOST = process.env.COMFY || 'http://127.0.0.1:8188';
const HERE = 'C:/Users/Fabio/AppData/Local/Temp/claude/c--AI-Mpi-Cubric-Vision/7a009b7a-7406-464b-874a-082fadc7cb2a/scratchpad';
const [spFile, udtArg, label] = process.argv.slice(2);
const SYSTEM = fs.readFileSync(path.join(HERE, spFile), 'utf8');
const UDT = udtArg === 'true';

const INPUTS = [
  'a 1870s Western Indian Chief',
  'a cyberpunk street medic',
  'a tired schoolteacher, 40s, red hair',
  'a gunslinger, no weapons',
];

const graph = (user, seed) => ({
  '69': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_4b_abliterated_fp8_scaled.safetensors', type: 'krea2', device: 'default' } },
  '420': { class_type: 'PrimitiveStringMultiline', inputs: { value: SYSTEM } },
  '112': { class_type: 'PrimitiveStringMultiline', inputs: { value: user } },
  '422': { class_type: 'StringConcatenate', inputs: { string_a: '\n', string_b: ['112', 0], delimiter: '' } },
  '418': { class_type: 'StringConcatenate', inputs: { string_a: ['420', 0], string_b: ['422', 0], delimiter: '' } },
  '419': { class_type: 'StringConcatenate', inputs: { string_a: ['418', 0], string_b: '\n<|im_end|>\n<|im_start|>assistant', delimiter: '' } },
  '58': { class_type: 'TextGenerate', inputs: {
    clip: ['69', 0], prompt: ['419', 0], max_length: 512, sampling_mode: 'on',
    'sampling_mode.temperature': 0.5, 'sampling_mode.top_k': 64, 'sampling_mode.top_p': 0.95,
    'sampling_mode.min_p': 0.05, 'sampling_mode.repetition_penalty': 1.05,
    'sampling_mode.seed': seed, 'sampling_mode.presence_penalty': 0,
    thinking: false, use_default_template: UDT } },
  '423': { class_type: 'StringReplace', inputs: { string: ['58', 0], find: '\n', replace: '' } },
  '242': { class_type: 'PreviewAny', inputs: { source: ['423', 0] } },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(user, seed) {
  const r = await fetch(HOST + '/prompt', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: graph(user, seed), client_id: 'mpi504-regression' }),
  });
  const j = await r.json();
  if (!j.prompt_id) throw new Error('queue failed: ' + JSON.stringify(j).slice(0, 900));
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const h = await (await fetch(HOST + '/history/' + j.prompt_id)).json();
    const rec = h[j.prompt_id];
    if (!rec) continue;
    if (rec.status && rec.status.status_str === 'error') throw new Error(JSON.stringify(rec.status.messages).slice(0, 1500));
    if (rec.status && rec.status.completed) {
      const out = (rec.outputs || {})['242'];
      if (!out) return '';
      const v = out.text || out.string || out.value;
      return Array.isArray(v) ? String(v[0]) : JSON.stringify(out);
    }
  }
  throw new Error('timeout');
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const HELD = /\b(hold(s|ing)?|held|carr(y|ies|ying)|grip(s|ping)?|clutch\w*|in (his|her|their|one) hand|in hand|wield\w*)\b/i;
const PLACE = /\b(background|backdrop|studio|desert|street|alley|classroom|sky|sunlight|sunlit|dust|dusty|neon|rain|lighting|shadow|lens|camera|\d+mm\b|shot|framing|photograph\w*|render\w*|grain|bokeh|cinematic|close-up)\b/i;
const BACK = /\b(back|behind|rear|slung|quiver\w*|spine|shoulder blades?|nape)\b/i;
const GEAR = /\b(belt|holster\w*|gunbelt|revolver|pistol|sidearm|knife|sheath\w*|quiver|pouch\w*|satchel|bandolier|rifle|blade|strap\w*|harness)\b/i;
const NEG = /\b(no|not|none|without|absent|devoid|lacking|bare of|free of)\b/i;
const LEAK = /plains chief|weathered plains/i;

const results = [];
for (const [i, input] of INPUTS.entries()) {
  process.stderr.write('\n--- [' + label + ' ' + (i + 1) + '/4] ' + input + '\n');
  let text = '';
  let err = null;
  try { text = await run(input, 0); } catch (e) { err = e.message; }
  const w = words(text);
  const t = text.trim();
  const checks = {
    a_lowercase_start: /^[a-z]/.test(t),
    a2_no_trailing_stop: t.length > 0 && !/\.$/.test(t),
    b_nothing_held: !HELD.test(text),
    c_no_place_light_camera: !PLACE.test(text),
    d_mentions_back: BACK.test(text),
    e_words_45_90: w >= 45 && w <= 90,
    f_gear: i === 3 ? (!GEAR.test(text) && !/no weapons?/i.test(text)) : GEAR.test(text),
    g_positive_only: !NEG.test(text),
    h_no_example_leak: i === 0 ? true : !LEAK.test(text),
  };
  results.push({ input, err, words: w, text, checks });
  console.log(JSON.stringify({ input, err, words: w, checks, text }, null, 1));
}
fs.writeFileSync(path.join(HERE, 'results-' + label + '.json'), JSON.stringify(results, null, 2), 'utf8');
console.log('\n=== SUMMARY [' + label + '] sysprompt=' + spFile + ' use_default_template=' + UDT + ' ===');
for (const r of results) {
  const fails = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log((fails.length ? 'FAIL' : 'PASS') + '  ' + r.input + '  (' + r.words + 'w)' + (fails.length ? '  -> ' + fails.join(', ') : ''));
}
```
