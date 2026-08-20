# MPI-504 — validation

## 2026-08-19 · enhancer recipe regression (no generation)

**Ran:** the Prompt Enhancement chain of `krea2_t2i_template.json`, rebuilt node for node in API
form and posted to the bench engine `127.0.0.1:8188` — `qwen3vl_4b_abliterated_fp8_scaled`
through core `TextGenerate`, temperature 0.5, seed 0, four regression inputs per arm, four arms
(v1, v2, v2 with `use_default_template` false, v3). No image was generated.

**Result: the drafted recipe FAILED and was replaced.** v1 returned the example that lived
inside its own instruction as the answer for 2 of the 4 inputs, discarding the user's character
entirely. v3 fixes the leak, the length band and the place/light/camera exclusion; it does NOT
fix positive phrasing, which no wording tried could fix on this model.

**Not closed by the recipe, closed in the graph instead:** two core `RegexReplace` nodes,
verified offline against all four real v3 outputs — negation gone 4/4, rear-view clause kept
4/4, trailing full stop gone 4/4. Patterns in prompts.md §2.

**Null result worth keeping:** `use_default_template` true vs false on `58 TextGenerate` with a
manual ChatML string produced byte-identical output on all four inputs, with node `58` executing
fresh in both arms (`/history` reports only `["69","420"]` as `execution_cached`, so this is not
the caching trap).

Full run, every output verbatim, and the runner:
[research/enhancer-regression-2026-08-19.md](research/enhancer-regression-2026-08-19.md).

## 2026-08-19 · graph strip

**Ran:** a script copy of `comfy_workflows/raw/krea2_t2i_template.json` to
`comfy_workflows/raw/flow_character_sheet.json` with the seven groups named in plan.md deleted
whole. Group membership was computed from each group's bounding box and asserted against the
plan's per-group counts (Edit 40 · Upscale 27 · Images 21 · Detailer 19 · Stitch Edit 14 ·
Depth 9 · Loras 6 = 136) **before** anything was written; all seven matched.

**Result:** 218 → 82 nodes, 276 → 98 links, 10 → 3 groups. 178 dead links removed, 3 dangling
input refs and 1 dangling output ref nulled, `extra.reroutes` 9 → 6 and `extra.linkExtensions`
4 → 4 pruned to surviving link ids. Post-strip audit: node ids unique, **every remaining link
resolves to two live nodes**, 82 = the plan's predicted 31 + 8 + 12 + 31.

**Not yet done, and not claimed:** the graph has not been opened in the bench editor, not
executed, and nothing has been added. The collapse pass is the next step and its worklist is in
plan.md.

## 2026-08-19 · the sheet prompt wired into `krea2_t2i_only.json` (no generation)

**Ran:** a scripted patch of `comfy_workflows/raw/krea2_t2i_only.json`, on Fabio's explicit
authorisation (raw/ is user-owned; the pre-patch file is the commit `27217516` version and a copy
was kept). 54 → **62 nodes**, 69 → **77 links**, `last_node_id` 665 → 673,
`last_link_id` 1435 → 1444.

**Built:** `666`-`669 PrimitiveStringMultiline` (`Recipe_Photoreal` / `Recipe_3D` / `Recipe_Anime`
/ `Recipe_Cartoon`) → `670 MpiAnySwitch` `Recipe_Select`, `select` ← `671 MpiInt`
**`Input_Recipe`** (renamed from `Input_Style` by Fabio — the node picks a prompt RECIPE, so the
pattern generalises, and it stays clear of the `Input_Style_Selector` LoRA rack). `672 StringReplace`
`Sheet_Prompt` holds `find = [CHARACTER PROMPT]` with `string` ← `670` and `replace` ←
`112 Input_Positive` **verbatim**; its output feeds `658 Set_positive text` (old link `1386` gone)
and `673 PreviewAny` **`Output_prompt`**.

**The four templates were generated, not transcribed** — one skeleton, the «A»-«E»
table from prompts.md §1, and an assertion that the generated Photoreal equals the canonical
assembled block in that file byte for byte (1417 chars). A fifth style is one table row.

**Verified offline, no engine execution, no image:**

- Link integrity: every input link resolves, every endpoint agrees with its slot, every link is
  claimed by its origin's output list.
- Set/Get pairing by NAME (the check that link integrity cannot make): **0 orphan Gets**. One
  unread `Set_model` (`529`) exists — confirmed present in the pre-patch copy too, so it predates
  this edit and was left alone.
- Reachability walking upstream from `442 SaveImage`, `494 Output_Image` and `673 Output_prompt`,
  treating `Get`→`Set` as an edge: **62 of 62 nodes**. Nothing was orphaned and nothing is dead.
- Substitution simulated for all four recipes: hole filled, character present, 241-246 words
  assembled.
- `node scripts/workflow-to-api.mjs` exit 0 against the live bench `/object_info`:
  `672` converts to `{find: "[CHARACTER PROMPT]", string: ["670",0], replace: ["112",0]}`,
  `670` to `{any_1..any_4: the four recipes, select: ["671",0]}`, `_meta.title` intact on every
  injectable, and **`51 CLIPTextEncode.text` ← `672`** — so Krea2 encodes the assembled sheet
  prompt, not the raw box.
- All 16 `Input_*` / `Output_*` titles are unique, and `671 Input_Recipe` presents an unwired `int`
  key, which is in `comfyController._inject`'s target list
  (`js/services/comfyController.js:1373`) — same path `Input_Width` already uses.

**Not claimed:** the graph has not been opened in the bench editor and nothing has been generated.
No sheet image exists.

**Aside — this card's earlier event stamps are wrong, and not because of the clock.** The
`14:20` / `15:05` / `16:00Z` events and the `16:40Z` handoff sit ~5-6h ahead of real time
(GitHub's `Date` header read `2026-08-19T10:47:55Z` while this session ran, and the machine
clock agrees with it at BST+1). Fabio confirms **the VPN has been off for two days**, so the
documented VPN skew is not the cause — those stamps were simply authored by hand rather than
read from a clock. Treat `at` on this card's earlier events as narrative, not measurement;
the ordering is still the append order.

## 2026-08-19 · FIRST SHEET GENERATED — placement passes at 1k turbo

**Ran:** one generation on bench 8188 under the GPU lease, `prompt_id ff505256`, **40.0s**,
`status success`, `execution_cached` only `["69"]` so everything else ran fresh. Photoreal recipe
(`Input_Recipe 1`), **1280×768**, **turbo ON**, seed `504504`, `Input_Positive` a hand-written
v4-shape character phrase (the enhancer is already proven; this run tests placement only).
Fabio's call: 1k + turbo is the right test rig — *"we don't need the quality here to supply the
sheet to another model"*, and 2k turbo-off would cost time to prove nothing.

**The graph works end to end.** `673 Output_prompt` returned the **assembled** 303-word prompt as
node text, which proves the MPI-242 contract live, not just in conversion. No node errors.

**Layout — PASS, and it matches the spec:**

- Two narrow full-body views of equal width on the LEFT half, one front and one from directly
  behind; large head-and-shoulders 3/4 portrait filling the RIGHT half.
- One continuous grey backdrop across all three panels, flat even frontal light, no grain, no
  lens character.
- Wardrobe consistent across panels: fringed buckskin coat, red trade shirt, brass-buckle belt
  with the sheathed knife at the right hip, fringed moccasin boots.
- Face: scar on the left cheekbone present, clean-shaven, catch-light in both pupils, mouth
  closed, neutral.

**The one real deviation: the REAR panel's hair drifts.** Front body and portrait carry straight
iron-grey hair; the back view is brown and wavy. Identity holds on face and wardrobe and breaks on
hair from behind — which is the axis the sheet exists to lock, so it is a bench item, not a
pass-with-note. Cheapest first move is wording (the character phrase already says how the hair
falls at the back; the template does not repeat hair colour in the rear clause), then seed
variance across a few pulls to see whether it is systematic or this seed.

**Observations, no action taken (raw/ is user-owned):** `442 SaveImage` is `mode 4` (bypassed) in
the hand-stripped graph, so only `494 Output_Image` emits — which is what the app contract wants
anyway. The output is a ComfyUI **temp** file (`ComfyUI_temp_arilp_00001_.png`), so it does not
survive a bench restart; the seed is fixed, so the run reproduces.

**Still not done:** the head-removal branch does not exist yet, so the front body still has its
head. Nothing in the app is wired.

## 2026-08-19 · rear-panel hair drift — A/B, two arms, 1k turbo

**Ran:** two generations on bench 8188 under one GPU lease (queued behind another agent's hold),
both 1280×768, turbo ON, Photoreal, same character phrase except where stated.

| arm | change | seed | rear panel |
|---|---|---|---|
| run 1 | control | `504504` | dark **brown**, wavy |
| **C** | control wording, verbatim | `777001` | dark **brown**, wavy |
| **B** | rear clause → `the same straight iron-grey hair falling…` | `504504` | **grey-streaked**, still wavy |

**C closes the seed question: the drift is SYSTEMATIC.** Same failure, fresh seed, wording
untouched. It is not one unlucky pull.

**B shows the wording knob is real but partial.** Naming the colour in the rear clause moved the
back view from brown to grey-streaked at the *same seed*, so the description does reach that panel.
The word `straight` did nothing — the rear hair stayed wavy in all three runs. **Colour responds
to the description; texture does not.**

Everything else held on both arms: layout, one continuous backdrop, wardrobe, the knife at the
right hip, catch-light. Watch item, one sample only: arm C's portrait came back closer to straight-on
than the requested ~30°.

**Why this is not cosmetic.** The front body's head is removed by the Klein pass, so the REAR panel
is the only hair-from-behind reference the video model ever gets.

**Next arm proposed (not run):** strengthen the TEMPLATE's global identity clause —
`the same character in every view with identical face, hair and wardrobe` → name hair colour and
texture there, where it governs all three panels — rather than leaning harder on the character
phrase, which has now shown its ceiling. Template payload only, no graph change.

## 2026-08-19 · arm D — the template's identity clause is a NO-OP

**Ran:** one generation, 1280×768, turbo ON, Photoreal, character phrase and seed held at run 1
(`504504`), 35.1s, `success`. Only the template changed, and only in the API payload —
`comfy_workflows/raw/` was not touched, deliberately, until a wording earns its place.

Clause under test, kept CHARACTER-AGNOSTIC (it names the invariant, never a colour — the colour
belongs to the character phrase, so the template stays reusable):

> `the same character in every view with identical face, hair and wardrobe.`
> → `the same character in every view with identical face and wardrobe, and identical hair colour,
> hair length and hair texture in all three views.`

**Result: negative.** The rear panel came back dark brown and wavy — indistinguishable from the
control at the same seed. **Do not ship this clause.**

**The three arms at seed `504504`, ranked:**

| arm | where the words went | rear panel |
|---|---|---|
| run 1 | control | dark brown, wavy |
| **B** | the CHARACTER phrase's rear clause names the colour | **grey-streaked**, wavy — best |
| D | the TEMPLATE's global identity clause | dark brown, wavy — no better than control |

**What this settles.** The knob is the character phrase's rear clause, not the template. Krea2
attends to the concrete rear-view description and ignores a general "all views must match"
instruction — which is consistent with the sheet layout being carried by concrete panel-by-panel
description throughout this prompt. Consequence: the fix is **enhancer-recipe payload**, the
template stays exactly as Fabio wrote it, and the graph does not move.

**Texture is not fixed by wording, and is now a known v1 limitation.** The rear hair stayed wavy
across three seeds and both clause positions, including an arm that said `straight` outright. It is
recorded rather than chased; revisit at the 10/10 stress test, where it either survives contact
with real shots or does not.

## 2026-08-19 · CORRECTION to the two entries above, and Fabio's call: name the hair ONCE

**The "texture is a known v1 limitation" line above is withdrawn — it was never established.**
Two different defects were conflated:

1. **Colour — a real adherence failure.** The character phrase says `long iron-grey hair`. Front
   body and portrait rendered iron-grey; the rear panel rendered brown, on two seeds. A stated
   attribute was not adhered to on one panel.
2. **Texture — nothing was ever asked for.** The phrase says `worn loose past the shoulders` and
   stops; it never says straight or wavy. So a wavy back view violates no instruction. The real
   defect is that the **panels disagree with each other** — and for a reference sheet that is what
   matters, whichever texture the model picks.

**The bad inference:** arm B put `straight` in the REAR clause only, while the main hair clause
still named no texture at all. When the back came back wavy, that was written up as "texture does
not respond to wording". It does not follow — the attribute was never stated where every panel
reads it. A patch was tested and a conclusion was drawn about the mechanism.

**Fabio's call, 2026-08-19: reference the hair ONCE.** Describe it fully in the main hair clause —
colour and texture together — and let the rear clause say only how it falls or is tied, with no
attribute repeated. His reasoning: saying the same thing twice is the likelier source of the
confusion, so the single full mention should read cleaner to the model.

Noted honestly against it: **arm B measured better** (brown → grey-streaked) *by* repeating the
colour. So the two readings genuinely differ, and one run separates them — the arm below is that
run, and it is the first test of the single-reference shape.

**The next arm, unrun:** `long straight iron-grey hair worn loose past the shoulders` in the main
clause, the rear clause left exactly as it was (no colour, no texture), seed `504504` held so it
compares against run 1, B and D directly. If the panels agree, this was a description gap and the
recipe rule follows Fabio's shape. If they still disagree, texture consistency is a model limit —
and *then* it is established, on evidence rather than by assumption.

## 2026-08-19 · arms E and F — the single-mention arm is NEGATIVE, and the repeat is reinstated

> **READ THE NOISE-FLOOR ENTRY AT THE END OF THIS FILE BEFORE TRUSTING THE NUMBERS BELOW.** Every
> arm here is n=1 at seed `504504`, and a later six-run test showed the within-arm spread across
> seeds is an order of magnitude larger than the between-arm differences ranked below. The
> **conclusion** survives — the F shape is right, and it replicates at three further seeds — but
> the saturation *ranking* does not, and the "one wording beat another by 0.02" readings are noise.

**Ran:** two generations under the GPU lease, both 1280×768, turbo ON, Photoreal, seed `504504`
held, every node byte-identical to run 1 except `112 Input_Positive` (asserted in the builder, not
assumed). Arm E `129315bb`, 45.1s, `execution_cached []`. Arm F `6c9f5c5b`, 36.1s, cached only the
loaders and constants — no sampler or encoder node in that list, so it executed fresh.

- **Arm E — the single full mention, Fabio's shape.** Main clause `long straight iron-grey hair
  worn loose past the shoulders`; rear clause left exactly as run 1, repeating nothing.
- **Arm F — the untested cell.** Arm E's main clause AND arm B's rear repeat together
  (`with the same straight iron-grey hair falling between the shoulder blades`). B repeated colour
  with no texture in the main clause; E stated both with no repeat; the combination had never run,
  and it is the cell that decides whether "model limit" is established or merely asserted.

**Result: the rear panel is brown and wavy in all six runs.** No wording position has ever produced
a rear view that agrees with the other two panels.

| arm | where the hair words went | seed | rear sat | rear lum | portrait sat |
|---|---|---|---|---|---|
| run 1 | control — colour in the main clause only | `504504` | 0.182 | 61.3 | 0.110 |
| **B** | + rear clause repeats colour | `504504` | **0.161** | 64.0 | 0.116 |
| C | control wording, fresh seed | `777001` | 0.244 | 66.2 | 0.122 |
| D | template's global identity clause | `504504` | 0.184 | 60.9 | 0.117 |
| **E** | colour + texture, main clause ONLY | `504504` | 0.181 | 65.3 | 0.121 |
| **F** | colour + texture in main clause + rear repeat | `504504` | **0.165** | 66.7 | 0.130 |

**What this settles, and it reverses Fabio's reading.** Removing the repeat changed nothing — arm E
sits on the control to three decimals. The two arms that *repeat* (B `0.161`, F `0.165`) are the
two lowest rear saturations, and they are the only two that ever moved. So "saying it twice is what
confuses the model" is **disconfirmed**: repetition is mildly helpful, not harmful. The v4.1
rear-clause repeat in prompts.md §2 goes back to being the best-measured shape.

**And texture is now a real finding rather than an assumption.** `straight` has been stated in the
main clause (E), the rear clause (B), both at once (F) and in the template (D). The rear view came
back wavy every time, across three seeds. The portrait renders long straight iron-grey hair
correctly in the same image, so this is not a prompt the model cannot parse — it is the rear view
specifically not inheriting it. **That is the claim the earlier withdrawal was waiting for, and it
is now supported: six runs, four wording positions, three seeds.**

**Honest limits on that.** The effect size the wording does buy is small — the whole spread across
six arms is ~0.02 saturation, against a rear-to-portrait gap of ~0.05-0.07 in every arm. Nothing
tested closes the gap; the best arm narrows it. And this is one character, one wardrobe, at 1k
turbo. A different character with a more distinctive hairstyle has not been tried.

**A measurement mistake worth recording, because it produced a confident backwards number.** The
first metric sampled the darkest 30% of a head box — that is *shadow*, not hair, and it reported
the grey front-body hair as more saturated (0.386) than the brown rear hair (0.283), which is the
wrong way round. The numbers above come from hand-picked hair-only boxes restricted to mid-tone
pixels (luminance 45-170), so shadow cores and highlights are both excluded. The front-body head is
only ~70 px tall and its box catches collar and skin at some seeds, so **front-body numbers are not
trustworthy at this resolution** — the rear-vs-portrait comparison is the one carrying the weight,
and both are large clean hair regions (2 600-5 500 sampled pixels).

**The character phrases, recorded verbatim so no future arm has to recover them from `/history`.**
This session had to reconstruct all four earlier arms from the bench's history because only their
*outcomes* were ever written down — and history dies on a bench restart.

- Control (run 1, C, D): `a broad-shouldered man in his late fifties, weathered sun-darkened skin,
  deep lines around narrow brown eyes, long iron-grey hair worn loose past the shoulders,
  clean-shaven, a pale scar across the left cheekbone, wearing a fringed buckskin coat over a faded
  red trade shirt, dark wool trousers and knee-high moccasins, a wide leather belt with a brass
  buckle and a sheathed knife at the right hip, the coat hanging plain across the back with the
  hair falling between the shoulder blades`
- Arm B: control, with the tail replaced by `…with the same straight iron-grey hair falling between
  the shoulder blades`
- Arm E: control, with `long iron-grey hair` → `long straight iron-grey hair`
- Arm F: both of the above at once

**Everything else held on both arms:** layout, one continuous backdrop, wardrobe, the knife at the
right hip, the scar on the left cheekbone, catch-light in both pupils.

**Needs Fabio, because it reverses his call:** the recipe's hair rule. The evidence says name the
hair in full in the main clause **and** repeat it in the rear clause (arm F's shape); his call was
to name it once. Recorded, not adopted — the sheet template and `raw/` are untouched.

## 2026-08-19 · THE SEED NOISE FLOOR — it invalidates the arm ranking above, and rescues the finding underneath it

**Fabio asked whether these arms had been run on one seed or several.** They had been run on one:
run 1, B, D, E, F, G, I, K, L, M and N are all seed `504504`, n=1 each. Only arm C used a second
seed, and it carried control wording. So every wording verdict above rests on a single sample at a
single seed.

**Why "seed held, so wording is the only variable" was weaker than it kept being written.** The
seed fixes the initial noise tensor; it does not fix the outcome, because editing the prompt
changes the conditioning and the sampler takes a different path. Same seed + edited prompt is a
fresh draw, not a controlled one. Holding the seed removes one source of variance, not the
sampling variance the edit itself introduces.

**Ran:** arms F and K at three fresh seeds each — `777001`, `123123`, `909090` — six generations,
1280×768, turbo ON, Photoreal, one lease. Plus arms G, I, K, L, M, N at `504504` before them.

### Result 1 — F and K are not separable, and K's win is withdrawn

Primary statistic is the rear-to-portrait **gap**, not rear saturation alone: both samples come
from one frame, so exposure cancels.

| seed | F gap | K gap |
|---|---|---|
| `504504` | 0.035 | 0.029 |
| `777001` | 0.077 | **0.103** |
| `123123` | −0.119 | **−0.123** |
| `909090` | 0.044 | 0.048 |

Per-seed wins **2–2**. Mean gap F `0.009`, K `0.014`; within-arm range F `−0.119…0.077`, K
`−0.123…0.103`. **The spread inside one arm is an order of magnitude larger than the difference
between the arms.** `worn loose` → `hanging straight down` is not an established effect, and
neither is anything else in the G/I/K/L/M/N ranking. All of it was one seed, n=1.

### Result 2 — the metric itself does not survive a seed change

Composition shifts between seeds, so the fixed sample boxes drift off target. `F123123` reports
portrait saturation `0.289` because the box landed on the **red shirt**, not hair — which is why
that gap is negative. **Cross-seed numeric comparison with fixed boxes is invalid.** Only
within-seed comparisons mean anything, and the visual read is what carries across seeds.

### Result 3 — the F shape DOES fix rear-panel colour, and this one replicates

At seed `777001`, control wording (arm C) renders the rear panel brown and wavy; **F wording
renders it grey.** Same at `909090` and `123123`. Three independent seeds, one wording change.

**Seed `504504` is an unusually hard seed** — it is the one where F only partly fixes the colour,
and it is the only seed the whole investigation ran on. Testing exclusively there made a solved
problem look unsolved and sent eleven arms chasing it.

### Result 4 — rear-view texture IS a model limit, now on four seeds

The rear hair is wavy in every run, at every seed, under every wording, while the portrait renders
long straight iron-grey hair correctly in the same frame. This claim was made, withdrawn as
premature, re-established on arm K, and withdrawn again when K failed to reproduce. It now rests on
four seeds and roughly a dozen wordings rather than one, and **that is the version to trust**. Both
earlier flips had the same cause: single samples at one seed.

### What is dead as a lever, and does not need retesting

- **The sheet template.** Arm D (global identity clause) and arm G (concrete panel-local clause on
  the rear view) are both no-ops. Two different positions, both negative — stop editing the
  template for this.
- **The negative prompt, on this rig.** The turbo path is `72` cfg `1.0` → `162` cfg `1.0`, so
  `Input_Negative` is **inert**. It only becomes live on the quality path (`311`, cfg `2.0`). Do
  not spend a run on a negative-prompt arm at 1k turbo.
- **Stronger texture words.** `poker-straight` reads identically to `straight` (arm I).

### The rule this leaves behind

**One seed is a pilot, not a result.** Any wording verdict on this flow needs the same wording at
3-4 seeds, compared per seed, with the visual verdict as primary and the numbers as support. A
tidy-looking gradient across single samples — which is exactly what the F/L/M/N/K ranking looked
like — is what noise produces when you sort n=1 draws.

## 2026-08-19 · THE REAR-HAIR DEFECT WAS THE TEST RIG, NOT THE PROMPT

**Ran:** twelve generations, F wording throughout, three seeds per cell (`504504`, `777001`,
`909090`), paired. Turbo OFF changes the sampler path as well as any resolution change — `72`/`162`
at 8+3 steps cfg `1.0` becomes `311`/`436` at 25+2 steps cfg `2.0` — so resolution and sampler were
separated into their own cells rather than compared as one "2k quality vs 1k turbo" arm.

| rear-panel hair | 1k (1280×768) | 2k (2048×1280) |
|---|---|---|
| **turbo ON** — 8+3 steps, cfg 1.0 | wavy, drifts brown | **wavy** — 33s / 85s |
| **turbo OFF** — 25+2 steps, cfg 2.0 | **straight** | **straight, grey, matches** — 111s / 328s |

**Unanimous, 3/3 seeds in every cell. Resolution has no bearing on rear-hair texture.** The 2k-turbo
cell is the control that settles it: same resolution as the fix, same wavy hair as the defect.
Turning turbo OFF is the whole effect, and it reproduces at 1k, so this is testable cheaply forever
after — 111s, not 328s.

**So the defect this card chased for eleven wording arms was an artefact of the test rig.** The
1k+turbo rig was the right call for placement, which is what it was chosen for; it simply is not
valid for anything about hair texture, and nobody had grounds to know that until the grid was run.
Every wording verdict in this file above — the F shape aside, which fixed COLOUR and replicates —
was measured inside a rig that was generating the defect.

**Sequence of claims about texture, for the record:** asserted → withdrawn as never established →
re-established on arm K → withdrawn when K failed to reproduce across seeds → **finally explained**,
as a turbo artefact rather than a model limit or a wording failure. The first four all rest on n=1
at seed `504504`. The fifth rests on a 2×2 grid at three seeds.

### The seams at 2k-quality — ACCEPTED, not a defect (Fabio, 2026-08-19)

At 2k-quality the sheet stops being one continuous frame: all three seeds render three plates with
visible vertical seams and slightly different backdrop tones, where the turbo runs keep one
continuous backdrop. **Fabio's call: this is not an issue — the sheets still work as a reference.**
Recorded so it is not re-raised as a bug; the spec line about a continuous backdrop is a preference
here, not a gate.

### The rig decision (Fabio, 2026-08-19)

- **Realistic characters → turbo OFF, 2k.** That is the quality rig, and it is what Photoreal ships
  at.
- **Turbo → mainly the stylised styles** (anime, cartoon), where the wave artefact is expected to
  matter far less or not at all.
- **Both controls stay exposed to the user regardless.** Some users have low VRAM, so resolution and
  turbo are user-facing choices, not a baked policy. 2k is preferable overall where the card fits.
- Cost, measured: 1k-turbo 33s · 2k-turbo 85s · 1k-quality ~105s · 2k-quality 328s.

### What this does NOT change

The F hair shape stays adopted. It fixed rear-panel **colour**, which replicated at three seeds and
is a separate axis from the texture artefact — the rear panel went brown under control wording and
grey under F wording in the same rig. Recipe categories 2 and 4 carry it, and the v4.1 text-only
regression is still owed.

## 2026-08-19 · ANIME / CYBERPUNK — turbo WINS for stylised, and turbo vs quality is a real product axis

**Ran:** nine generations, `Recipe_Anime` (`Input_Recipe 3`), one hand-written cyberpunk phrase in
the adopted F shape (hair named in full in the main clause, restated in the rear clause), three
rigs × three seeds (`504504`, `777001`, `909090`). Phrase deliberately heavy on wardrobe and gear,
**~105 words — above the recipe's own 90-word ceiling**, so it stresses the length band (open call
#4) at the same time; a failure here would not be cleanly attributable to style alone. No failure
occurred, so the length overrun is a null result rather than a confound.

### Anime at 2k-turbo — PASS, and it is the best sheet this card has produced

Crisp cel-shaded line art, layout correct, **one continuous backdrop** (no seams — the seam is a
quality-path effect, not a resolution one). Everything the phrase asked for is present and
consistent across all three panels: cropped black techwear jacket with magenta piping, high collar,
charcoal mesh top, ribbed grey cargo trousers with thigh straps, holstered pistol at the right hip,
coiled data-cable at the left, fingerless gloves, black boots with pink laces, chrome data-jack
behind the left ear. **The rear panel shows the printed magenta circuit motif on the jacket back
and the hair straight, black with vivid pink ends** — the rear reference the sheet exists to
provide. Pupil catch-lights present.

**And the wave artefact does not appear.** The rear hair is straight under turbo here, where the
photoreal character's was wavy under the same setting. So the turbo wave defect is not universal —
it did not survive the move to a stylised recipe.

### Anime at 2k-quality — WORSE, and Fabio called it before the images were read

Line art turns sketchy and rough — concept-sketch quality rather than model-sheet clarity, which is
the one thing the Anime style block explicitly asks for. **And the rear panel put the character's
HOOD UP, hiding the hair completely.** For a reference sheet whose whole job is to show the hair
from behind, that is a functional failure, not a style preference.

**Fabio's verdict, 2026-08-19: anime takes turbo ON.** Non-turbo is a downside here — "the quality
of the character is not up to par, looks much better with turbo". This is the exact inverse of the
photoreal verdict, and it is why the rig has to stay a user-facing control rather than a baked
policy.

### The real axis: turbo LOCKS the character, non-turbo VARIES it

**Fabio's observation, and this session's own runs confirm it.** The photoreal F wording at three
seeds:

- **turbo** → the same man three times. Same bone structure, same hairline, same build; the seeds
  barely move him.
- **non-turbo** → three visibly different men. Different faces, hairlines and builds at the same
  three seeds.

So the two modes do different jobs:

| | turbo ON | turbo OFF |
|---|---|---|
| character across seeds | **locked** — same person | **varied** — real candidate spread |
| use | you have the character, you want it held | you are still hunting for the face |
| photoreal rear hair | wavy (artefact) | straight |
| anime | **crisp, correct** | sketchy, hood up, hair hidden |
| seams | none | three plates (accepted) |
| cost at 2k | 85s | 328s |

**This also partly explains the seed-noise result above.** Every wording arm ran under turbo, which
locks the character — so the prompt had less room to move the image than an unlocked rig would give
it, and the between-arm deltas were correspondingly small. The noise floor measured a locked model.

### Rig policy (Fabio, 2026-08-19)

- **Realistic → turbo OFF, 2k.**
- **Stylised (anime, cartoon) → turbo ON.** 2k preferable, 1k simply lower resolution.
- **Non-turbo stays valid as a VARIATION lever for any style**, not just as a quality setting —
  it is how a user gets candidate faces to choose between.
- **Both controls stay exposed to the user regardless**, because low-VRAM users need the choice.

## 2026-08-19 · the v4.1 recipe regression — the adopted F shape was NOT reaching the output, and a slot template fixed it

Text-only, no generation. Bench `8188`, `qwen3vl_4b_abliterated_fp8_scaled` through core
`TextGenerate`, the Prompt Enhancement chain rebuilt node for node, temperature 0.5,
`use_default_template` true, four regression inputs. **Three arms at two seeds each — 24 samples.**
Every output is recorded verbatim in
[research/enhancer-regression-2026-08-19.md](research/enhancer-regression-2026-08-19.md).

### The four v3 guarantees survive the F-shape edit

`45–90 words`, `no example leak`, `nothing held`, `no place / light / camera` and `scrub clean`
all hold at v4.1 — `nothing held` improved from 3 of 4 to 4 of 4. The two pre-existing conditions
are unchanged and still cleared by the two `RegexReplace` nodes: the raw output ends with a full
stop, and it states absences. The known stub ceiling moved input (v3 left `, the back of the coat,`
on input 4; v4.1 leaves `the back of the vest,` on input 2) — same cause, same verdict. Input 4's
watch passes at every arm and seed: `no weapons` never reaches Krea2.

### The finding: category 2 landed, category 4 did not

| | v4.1 (8 samples) | v4.2 (8) | v4.3 (8) |
|---|---|---|---|
| main clause names colour + length + texture | 6 of 8 | **7 of 8** | 3 of 8 |
| **rear clause restates the COLOUR** | **2 of 8** | **8 of 8** | 8 of 8 |
| rear clause restates colour AND texture | 0 of 8 | 5 of 8 | 8 of 8 |
| main/rear colour contradiction | 0 of 8 | **2 of 8** | 2 of 8 (leak-caused) |
| rear clause a verbatim copy of the main clause | 0 of 8 | 0 of 8 | **4 of 8** |
| example leaked out of the instruction | 0 of 8 | 0 of 8 | **2 of 8** |

**v4.1 — the prose amendment — obeyed the main clause and ignored the rear one.** Category 2 is
clean (`dark brown hair cut short and stiff`, `short black wavy hair`, `long thick black hair tied
back in a low ponytail`). Category 4 restated the colour twice in eight, and colour-and-texture
together zero times in eight. The only colour hits are the schoolteacher, and only because the user
typed `red hair` themselves.

**This mattered because the F shape's measured win IS the rear colour** — control renders the back
view brown, F renders it grey, replicated at three seeds (the noise-floor entry above). Arms E and
F were hand-written character phrases. At v4.1 that win **did not survive the round trip through
the LLM**, because the LLM was not writing the clause it depends on. A wording adopted on
hand-written evidence is not adopted until the enhancer reproduces it.

**v4.2 — a slot template in rule 4 — fixes it, and is now the shipped recipe.** Rear colour
2 of 8 → 8 of 8, colour-and-texture 0 of 8 → 5 of 8, and it costs nothing on the main clause
(7 of 8 vs 6 of 8). The seed-0 run showed the gunslinger losing hair from the main clause and it
read like a real cost — **seed 1 came back 4 of 4 and it was sampling noise.** That is this card's
own n=1 rule catching a second false verdict; the two-seed rig is why the write-up says the
opposite of what one seed said.

### Open residual — ~2 in 8 write a different colour at the back

Both times: `dark brown` in the main clause, `black` in the rear. A wrong-coloured rear panel is
the exact defect the F shape exists to kill, so this is smaller, not closed. **Fabio's call
whether to accept it.** The path that does NOT work is more wording — see below.

### v4.3 is DISPROVED, and it re-proved a rule already written down

The attempt at the residual demanded a verbatim copy and illustrated it: *"if you wrote 'dark
brown' above, the rear clause says 'dark brown', not 'black'"*.

1. **The example leaked**, exactly as v1's parenthetical did — `dark brown` was copied out of the
   instruction into a **red-haired** character at both seeds (`the red hair dark brown texture worn
   in a loose braid`). prompts.md already said *do not put a readable example in this prompt again*;
   this arm is that rule violated and re-measured. The rule is not about long examples — **any**
   readable example is read as the target. Slot templates only.
2. **"Verbatim" was obeyed too literally** — 4 of 8 rear clauses are a character-for-character
   duplicate of the main clause, which says nothing about how the hair reads from behind. The
   length word also drops out of the main clause in 5 of 8.

### Verified

`prompts.md` §2's recipe block was diffed byte-for-byte against the v4.2 system prompt that was
actually measured — identical, 4239 chars, ChatML head and tail intact — and the two shipped scrub
regexes were re-applied offline to all 8 measured v4.2 outputs: negation gone, rear clause kept,
no trailing punctuation, 8 of 8. The recipe on disk is the recipe that was tested.

**Still text-only. No sheet has been generated from a v4.2 enhancer output** — whether the
8-of-8 rear colour actually moves the rendered rear panel is an image question and remains open.

## 2026-08-19 · BENCH GATE #1 — the neutralisation PASSES, four cells, no visible difference

**Ran:** 8 generations under the GPU lease, `krea2_t2i_only.json` converted to API form and patched
in the payload only — **`raw/` untouched**. `Recipe_Photoreal` (`Input_Recipe 1`), one male
character held constant (arm F's phrase, verbatim from the arms E/F entry above, chosen because it
is male — which is what this gate needs — and because its sheets are already known-good).

| cell | rig | neutral | original |
|---|---|---|---|
| seed `777001` | 1280×768 turbo | 35s | 36s |
| seed `909090` | 1280×768 turbo | 35s | 34s |
| seed `123123` | 1280×768 turbo | 33s | 35s |
| seed `777001` | 1792×1120 quality | 239s | 240s |

**Verdict: the neutral wording loses nothing.** In all four cells the two arms are visually
indistinguishable beyond the noise a changed conditioning produces anyway — same man, same three
panels in the same arrangement, same continuous backdrop, same wardrobe, the knife at the right
hip, the scar on the left cheekbone, catch-light in both pupils. Nothing about layout compliance
depends on the words `man` / `his`. **The fallback in prompts.md §1 (let the enhancer state the sex
and switch a `man`/`woman` token) is not needed and should not be built.**

Two things this run confirms in passing, both consistent with what was already measured: the
1k-turbo rear hair is wavy and the 2k-quality rear hair is **straight**, independently reproducing
the turbo finding; and 2k-quality shows the three-plate seams, which are accepted.

**The wording was verified to reach the graph on every single cell, not just in the builder.** Each
run reads back node `673 Output_prompt` — the assembled string the sampler actually saw — and
asserts that the `man`/`his` tokens are present in the original arm and absent in the neutral one.
8 of 8 OK. This matters because the arm that silently fails to differ is the one that manufactures
a false "no difference" verdict. The builder also aborts if any of the five reversal anchors is
missing from the template, for the same reason.

**Rig note.** 1k-turbo was chosen as the cheap instrument (33-36s vs 239s) because layout was first
proven at 1k turbo and the rear-hair work established that the sampler path, not the resolution,
carries these effects. The 2k-quality pair is the shipping rig for a realistic character and was
run to confirm the result holds there. It does. Measured 2k-quality cost is **239-240s**, not the
328s recorded earlier — worth re-checking that figure if it is ever used for planning.

**The images are in a session scratchpad and are transient**, like every sheet this card has made:
`…/350fcf8d-…/scratchpad/gate1/{neutral,original}_seed<seed>_<w>x<h>_{turbo,quality}.png`, with
`gate1-log.json` beside them holding the character phrase and the five reversals. Say if they
should be kept somewhere durable — they are ~20 MB total, so they do not belong in the task
workspace as-is.

**Fabio's eyes still own the call**, per the standing rule that these sheets are judged by eye. The
read above is mine; if he sees a layout difference I missed, the gate reopens.

---

## 2026-08-20, session 5 — the prompt UI's FRAME half, built and verified live

**What was built.** No new component. A Flow carries no JS (MPI-572), so the whole capability is
two things the frame understands, both declarable by a third-party manifest:

| | |
|---|---|
| `kind: 'fields'` | Frame-native, media-less step — declared fields ARE the work, stacked where the canvas would be. `FRAME_KINDS` in `MpiBaseFlow/stepKinds.js`. No `role`, so its values live in the FLOW-level store |
| `action: 'enhance'` | On a `button` field, with `op` / `from` / `to`. The frame runs the text op and writes `to` |

Files: `MpiBaseFlow.js` (+`.css`), `stepKinds.js`, `flowsRegistry.js` (typedefs only),
`docs/playbooks/add-flow/ui/prompt-enhance.md` (new, the portable record).

**Two design calls worth keeping.**

1. **A step kind was the wrong shape and a `fields` step was the right one.** A bespoke `prompt`
   gizmo would have needed the `{media, value, onChange}` contract on a flow that has NO media at
   all, and its value would have landed in `stepValues[role]` — a *different store* from the run
   slide's, which is exactly the divergence rule 4 forbids. A `fields` step has no role, so
   flow-level is the only coherent place for its values, and rule 4 falls out for free rather than
   being enforced by a flag.
2. **One declaration drives all three behaviours.** Fill, clear-on-edit and the button's state all
   read the same `from`/`to` pair, and the Run fallback derives from it too. Declaring the fallback
   separately (`fallbackFrom:`) was the first draft and was dropped: a pair wired one way is a bug
   that only shows up on the one run nobody edited.

**Rules 5 and 6 were already free.** `flowInputs` snapshots the whole collected payload at Run
(`03-storage-and-reuse.md`) and Reuse seeds it back, so storing both prompts and injecting the
enhanced one verbatim needed NO new storage path — and no seed is stored because nothing declares
one. This was checked, not assumed.

### Verified in a running app (own `app:isolated` instance, `:51955`, user's `:3000` untouched)

| Check | Result |
|---|---|
| 3-step carousel, step 1 media-free | `01 Inputs · 02 Prompt · 03 Generate`; step 1 reads *"This flow needs no input media."* |
| Step 2 composition | 3-row user box → full-width Enhance → 10-row enhanced box, all 620px, title above, hint below |
| Enhance button initial state | `--stale` (accent). Not-enhanced is the ACTIONABLE state, so it is the loud one |
| Enhanced box filled → button | modifier drops, button goes quiet |
| Edit the user prompt | enhanced box **visibly cleared to `''`** AND button flips back to `--stale` — rule 3, both halves |
| Step 3 | ONE box (the user prompt, value carried), Enhance `--stale`, Generate. Enhanced prompt NOT shown |
| Shared value across surfaces | filled on step 2 → step 3's button quiet → back on step 2, both values intact |
| Run with NO enhancement | payload `{positive: "a rain-soaked dock worker, forties", injectionParams: {Input_Character: "a rain-soaked dock worker, forties"}}` — raw prompt, rule 2 |
| Run WITH enhancement | `Input_Character: "THE ENHANCED PHRASE, verbatim"`, `positive` still the user's own — both stored, rule 5 |
| No seed anywhere in the payload | confirmed — rule 6 |
| Enhance on an unregistered op | warns *"The prompt enhancer is not available in this build"*, button stays enabled, no crash |

`npm run lint` clean, `npm test` 630/630.

### One real bug the screenshot caught that the DOM did not

The first render put the prompt **260px above** the Enhance button and the boxes narrower than it.
Cause: `.mpi-base-flow__fields .mpi-base-flow__field:has(.mpi-base-flow__field-text)` carries
`flex: 1 1 320px; max-width: 480px` — written for the ONE-ROW layout, where those mean *width*. In
a column they mean **a 320px-tall box that grows**. Fixed with a `--work`-scoped override, and it
needed the same `:has()` shape to win on specificity (a plain `.--work .field` loses to it).

**This is why the step was screenshotted and not just measured.** Every DOM assertion passed while
the layout was visibly broken.

### The scratch fixture — REVERTED, kept here to re-mount

The flow itself does not exist (no op, no graph), so the smoke ran against a temporary `FLOWS`
entry that was removed before the session ended. Paste it back into `js/data/flowsRegistry.js` to
re-drive the UI, and drop it again afterwards:

```js
{
    id: 'character-sheet', title: 'Character Sheet',
    preview: 'ltx23_balanced_preview.webp',
    description: 'Describe a character and get a locked reference sheet back.',
    requiredModels: [], operation: 'flowCharacterSheet',
    workflow: 'flow_character_sheet.json', mediaType: 'image',
    inputSchema: { media: [] },
    steps: [{
        kind: 'fields', tickerLabel: 'Prompt', title: 'Describe the character',
        hint: 'Enhance rewrites your description into the phrase the sheet needs. Edit it freely — what is in the box is what generates.',
        fields: [
            { id: 'positive', type: 'text', rows: 3, label: 'Your character',
              placeholder: 'Who they are, wardrobe, age, hair, eyes, marks…' },
            { id: 'enhance', type: 'button', label: 'Enhance', icon: 'enhance', action: 'enhance',
              op: 'flowCharacterEnhance', from: 'positive', to: 'Input_Character' },
            { id: 'Input_Character', type: 'text', rows: 10, label: 'The character phrase',
              placeholder: 'Press Enhance, or write the phrase yourself.' },
        ],
    }],
    fields: [
        { id: 'positive', type: 'text', rows: 3, label: 'Your character',
          placeholder: 'Who they are, wardrobe, age, hair, eyes, marks…' },
        { id: 'enhance', type: 'button', label: 'Enhance', icon: 'enhance', action: 'enhance',
          op: 'flowCharacterEnhance', from: 'positive', to: 'Input_Character' },
    ],
}
```

Driving it: `Events.emit('flow:open', {flowId:'character-sheet'})` from a `playwright-cli eval`.
**A project must be open first** — on Landing the overlay mounts into the DOM but is not visible,
which reads as a broken flow and is not one.

### Open — Fabio's call

**The run slide separates Enhance from the prompt it acts on.** Same `flex: 1 1 320px` growth as
the bug above, but on `--stacked`, which every flow's run slide uses: the prompt box sits at the
top of the 236px column and Enhance ends up ~260px below it, next to Generate. The one-line fix is
the same override on `--stacked` — **but that also changes Extend Video's and Add Foley's run
slides**, so it was left alone rather than restyled under this card. **RESOLVED 2026-08-20** — Fabio said put them together; done, and only Extend Video actually moved (see the newest entry).

### Noticed, not actioned

`carousel-frame.md` § *Results are not real until Apply* says hold-until-Apply SHIPPED (commit
`bcbe161f`). `flowService.js` says the opposite in a code comment: *"Phase 3 was built, then
REMOVED after the UX pass — an Apply step the user never wanted to skip is friction."* The code has
no Apply. The doc is stale; not this card's to fix.

## 2026-08-20 · the Enhance button, Fabio's three changes — screenshotted on all four run slides

**Ran:** `npx eslint` on the four changed files (clean), `npm test` (**630/630**, before and after
the scratch fixture went in and came out), then the UI on my own `npm run app:isolated` instance
at `127.0.0.1:60667` with the scratch FlowDef pasted back in — driven with `playwright-cli`, a real
project open, and a screenshot at every step, not just DOM assertions.

**All three changes verified:**

1. **Pink `MpiButton` with the `enhance` icon.** Measured through a 1×1 canvas so the `oklch()`
   serialisation cannot lie: the Enhance fill is **`255,126,182`** and Generate's is
   **`255,126,182`** — the same pink, not a near miss. A real `playwright-cli hover` moved it to
   **`255,119,164`**, so it changes BACKGROUND on hover like the rest of the app. Icon renders to
   the LEFT of the label. `--accent-frost` is gone from the button entirely.
2. **The run slide puts Enhance directly UNDER the prompt box.** Screenshotted: prompt, Enhance,
   then Generate, in one column. Was ~260px away, beside Generate.
3. **Size/placement otherwise unchanged** — full width in the `fields` step between the two boxes,
   same 236px column on the run slide.

**The two states, live.** Filling `Input_Character` flipped the button to `mpi-btn--secondary`
(quiet: the work is done); editing the source prompt cleared `to` and flipped it back to
`mpi-btn--primary` (loud: the prompt is not enhanced). Both read clearly on the run slide, which is
the surface that hides the enhanced text.

**What the other three flows did — this is the part the handoff got wrong.**

| flow | run slide | why |
|---|---|---|
| **Extend Video** | **CHANGED** — boxes now hug `rows` (3 and 2) instead of stretching to 320px | the only flow with flow-level `text` fields |
| **Add Foley** | unchanged | declares its two texts on a STEP, so it is the ROW layout, not `--stacked` |
| **Head Swap** | unchanged | flow-level field is a `radio`; the `:has(text)` rule cannot match it |
| **Character Sheet** | fixed, as asked | — |

**Fabio should look at Extend Video.** Its long baked negative is now clipped to two rows and
scrolls, because `rows: 2` is what the flow declares and the column no longer overrides it. That is
the declaration being obeyed, but it is a visible difference from what shipped.

**Three things worth carrying forward:**

- **Icon mode was a dead end, worse than the trap note said.** `MpiButton` defaults icon mode to
  `primary` and then maps everything except danger/ghost down to `secondary`, so ~20 buttons across
  the app pass `variant: 'primary'` today and render GREY. Widening that mapping repaints all of
  them. TEXT mode with the icon in `children` gets pink, hover-on-background and icon-left with the
  primitive untouched.
- **`--stale` is gone, not replaced.** `_paintEnhance` toggles the primitive's own
  `mpi-btn--primary` / `mpi-btn--secondary`. Only ever one at a time — `--secondary` is declared
  after `--primary` in `MpiButton.css` and would win if both were present.
- **`MpiButton.js` imported `/js/utils/icons.js` by ABSOLUTE path**, alone among the Primitives
  (its sibling `MpiRadioGroup` is relative). `tests/declared-fields.test.cjs` imports
  `declaredFields.js` in bare Node, so pulling MpiButton in through it would have died with
  `ERR_MODULE_NOT_FOUND` on `C:\js\utils\icons.js`. Made relative; that is why the test still
  passes.

### Noticed, not actioned (2026-08-20)

- **`MpiToolOptionsUpscale.css` carries a twin raw-`<button>` block** (`background: none`, ink-3,
  `--line` border) that would now fight the primitive. Dead today — nothing in the repo declares a
  `type: 'button'` field except this card's scratch fixture — and the file belongs to live card
  **MPI-580**, so it was left alone rather than edited across cards.
- **Every declared field's `:focus-visible` ring is still `--accent-frost`**, in both consumer
  blocks. Fabio wants that colour gone app-wide; re-colouring the focus rings is its own job, not
  this card's.
- **An orphan `.mpi-modal-backdrop` survives the 18+ gate** on a fresh profile: the changelog
  dialog mounts behind it and the backdrop intercepts every click, so the landing page reads as
  frozen. Removing the node let the app through. Unrelated to this card; reproducible on a first
  run of `app:isolated`.
