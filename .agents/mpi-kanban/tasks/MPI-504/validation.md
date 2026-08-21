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

## 2026-08-20 · the `Masking` group is filled — 13 nodes, offline-verified, converts clean

**What shipped.** `comfy_workflows/raw/flow_character_sheet.json`, the `Masking` group only:
nodes `745`–`758`, links `1532`–`1556`, `last_node_id 758` / `last_link_id 1556`. The graph went
127 nodes / 150 links → **141 / 175**.

```
736 Get_sheet output ─┬─ 745 UltralyticsDetectorProvider  bbox/face_yolov8n.pt
                      │    └─ 746 BboxDetectorSEGS        thr .5, dilation 0, crop_factor 3.0
                      │         └─ 747 ImpactSEGSOrderedFilter  area(=w*h), ASCENDING, 0, 1
                      │              └─ 748 SegsToCombinedMask       ← the face BOX
                      │                   ├─ 749 MpiMaskSquareBbox(pad 0) ─ size
                      │                   │    └─ 750 MpiMath  "a * 4 // 5"
                      │                   └─ 751 MpiMaskSquareBbox(pad ← 750) ─ x, y, size
                      └─ 752 MpiBox(size, size, x, y) ─ 758 MpiBoxCrop(pad false)
                           └─ 755 SAM3_Detect  .5 / refine 2 / individual_masks FALSE
753 CheckpointLoaderSimple  sam3.1_multiplex_fp16 ─CLIP─ 754 CLIPTextEncode  "hair, face, hat"
743 Get_W, 744 Get_H ─ 756 SolidMask(0.0, W, H) ─┐
                                     757 MaskComposite(dest, src, x, y, "add") → 733 Set_inpaint mask
```

**Why it is shaped this way** (each of these was checked, not assumed):

- **The face box never becomes the mask.** `748` exists only to give `749`/`751` something to
  measure. SAM3 shapes what gets filled — the retired-bbox-as-mask decision made structural.
- **Ascending area picks the right head.** `prompts.md` puts one LARGE head-and-shoulders portrait
  in the right half and two narrow full bodies (front + back) in the left. YOLO sees two faces;
  the smaller is the front body's. Ordering by area, never by detection index.
- **`individual_masks: false` IS the union** (`docs/masking-sam3.md`: off, SAM3 unions
  everything). One mask over hair + face + hat, and a hatless character contributes no hat — the
  degradation needs no extra nodes. Categories BARE, because `:1` detects nothing.
- **The crop is resolution-independent.** `676`/`677` (`Input_Width`/`Input_Height`) are
  user-adjustable, so a pixel padding constant would silently break at any other size. `750`
  computes `pad = 0.8 × face`, making the head box **2.6× the face box at any resolution**.
  Floordiv, not `* 0.8`: `safe_math` (`ComfyUi-MpiNodes/help_funcs.py`) exposes only `math.*` and
  has **no `int()`**, and a float into an INT socket is the kind of thing that only fails at run
  time.
- **No clamp node is needed.** `MpiMaskSquareBbox` clamps x/y/size inside the image itself
  (`img.py:728`), which satisfies `MaskComposite`'s `x/y ≥ 0` floor and the crop's bounds.
- **The crop is `MpiBox` + `MpiBoxCrop`.** Core `ImageCrop` is **deprecated**; `ImageCropV2`'s
  `crop_region` is a socketless UI bounding-box widget and cannot be driven from INT sockets, so
  the first-party pair is the replacement. See the browser evidence below — this is the one defect
  that survived every offline check.
- **`SolidMask(W, H)` cannot misalign** — `560 EmptyLatentImage` takes width/height straight from
  `676`/`677`, so the render is exactly `Input_Width × Input_Height`. Checked in the converted
  graph rather than assumed.
- **No grow baked in.** `757` feeds `733`, and the existing `735 → 690 GrowMaskWithBlur` /
  `734 → 721 + 718` chain does the shaping, confirmed resolved in the converted API below.
- **No new Set/Get names**, so the silent-collision failure mode does not apply at all.

**Evidence.**

- **Surgical diff** — a pre-edit copy compared node-by-node: 14 added (`745`–`758`), 0 removed,
  25 links added, 0 removed, exactly 4 pre-existing nodes modified (`733`, `736`, `743`, `744` —
  the anchors), `groups` and `extra` byte-identical, only `last_node_id`/`last_link_id` changed at
  the top level. `json.dumps(indent=2)` round-trips Fabio's file **byte-identically**, so the
  formatting is his, not the script's.
- **Offline graph check** — duplicate ids, link-endpoint integrity both directions, slot ranges,
  dead links, Set/Get orphans and collisions, reachability from the three output nodes
  (`494`, `673`, `688`) through Set/Get teleports, unique `Input_`/`Output_` titles, group-bbox
  containment for all 13, counters. **PASS**; all 13 new nodes reachable.
**Proved it opens in the ComfyUI editor, not just that it converts** — loaded into a
browser at the bench (`:8188`) off a temp CORS server, never touching Fabio's own tab:
**141 nodes / 175 links, no Missing Node dialog, no new console errors, every widget value on
the right widget, every intended socket linked.** That load is what caught the one thing every
offline check passed: **core `ImageCrop` is DEPRECATED** (`/object_info` `deprecated: true`,
`[DEPR]` on the node in the editor). `ImageCropV2` is not the replacement here — its
`crop_region` is a socketless UI bounding-box widget that cannot be driven from these INTs —
so the crop is the first-party pair **`752 MpiBox` + `758 MpiBoxCrop`**. Re-verified after the
swap: no `[DEPR]`, no missing nodes, no unwired required sockets.
- **Converts against the LIVE engine** (`COMFY_URL=http://127.0.0.1:48188 node
  scripts/workflow-to-api.mjs …`) → 96 API nodes, no error. The converter's own self-check
  (every required input satisfied) is the thing that would have caught a widget-mapping slip.
- **Teleports resolve correctly in the API output**: `690 GrowMaskWithBlur`, `721
  MpiMaskSquareBbox` and `718 InpaintCropImproved` all read `["757", 0]`; `746`/`758` read
  `["730", 0]` (the reroute behind `Set_sheet output`); `756` reads `["676", 0]` / `["677", 0]`.
- **`node scripts/validate-injection-rules.mjs`** on the converted API → clean, exit 0.
- **`npm test` → 631/631 pass**, 0 fail (re-run after the crop swap).

**Still GPU-gated** (nothing here proves pixels): does `face_yolov8n` see the ~70px front-body
face at 1088×896; does ascending-area pick that one and not the portrait; does the 2.6× crop stay
clear of the neighbouring panel; does the SAM3 union actually cover a hat.

### Noticed, not actioned

- **`709 Get_steps` has no `SetNode`** anywhere in the file — the graph's one unreachable node,
  in Fabio's Generation half. Pre-existing (confirmed against the pre-edit copy). `raw/` is his.
- **Zero-face runs will error**, not degrade: `MpiMaskSquareBbox` returns `size 0` and an empty
  crop fails downstream. Left unhandled deliberately — a sheet with no detectable face has no head to
  remove, and a guard written before the bench proves detection would be guesswork.

## 2026-08-20 · FABIO RAN IT — the branch works, and one real bug came out of the live test

**Result: 3-4 outputs, all succeeded, "ready to be implemented"** (Fabio). He re-exported the
graph with his fixes; `comfy_workflows/raw/flow_character_sheet.json` is now **146 nodes / 180
links** (`last_node_id 767`, `last_link_id 1570`).

**The bug, and why it was not the gate.** With `Input_Remove_Head` OFF the head branch executed
anyway — YOLO, the SAM3 checkpoint, the Klein inpaint. `MpiIfElse` laziness was correct and
irrelevant: **an output node is an execution ROOT**, and `688 PreviewImage` sat UNMUTED with an
upstream closure of **84 nodes** — measured, not guessed: all 14 `Masking` nodes plus `690`,
`718`, `721`, `733`, `734`, `735`. One debug preview pulled the whole gated branch into every run.

**Fabio's fix, both halves:**

- **`759 MpiBlocker`** between `736 Get_sheet output` and both consumers (`746 BboxDetectorSEGS`,
  `758 MpiBoxCrop`), driven by a new **`760 Get_is remove head`**. Blocking at the SOURCE is the
  half that survives someone adding a preview later.
- **`688` muted** (mode 0 → 2), plus three debug previews added muted from the start
  (`765`/`767 MaskPreview` on `718`'s cropped mask and on `757`'s output, `766 PreviewImage` on
  the blocker output).

Generalised into `docs/workflow-authoring/mpi-nodes.md` § "A preview node defeats a lazy gate",
because the symptom ("models load every run, gate looks correctly wired") sends you to re-check
the gate, which is exactly the wrong place.

**Re-verified against his re-export, not just mine:**

- My 14 nodes returned from his editor with **`type`, `widgets_values` and `title` identical** —
  0 substantive changes. Only `pos`/`order` moved, and the `Masking` group slid to `y 3870.5`.
- Offline check → **PASS** (146 nodes / 180 links, 141 reachable; the 5 unreachable are the
  pre-existing `709 Get_steps` and the four muted debug previews).
- `workflow-to-api.mjs` vs live `/object_info` → clean.
- `validate-injection-rules.mjs` → clean, exit 0.

### Open, and now product work rather than graph work

- **`Input_Recipe` wants a DROPDOWN in the Flow UI** (Fabio, 2026-08-20). `type: 'select'` already
  exists in `js/utils/declaredFields.js:154` — it mounts `MpiDropdown`, portals the list to
  `document.body` because a step row clips overflow, and emits the option's ORIGINAL `v` rather
  than the DOM string, so the 1-indexed int reaches `MpiAnySwitch` intact. Model it on
  `Input_Tier` (`flowsRegistry.js:268`) but `select`, four options from `prompts.md` § The four
  styles, default 1 = Photoreal. FlowDef work, at `/mpi-add-flow`.

---

## 2026-08-20, session 6 — the `promptEnhance` op, verified

**Verdict: PASSES.** Registered, executes, returns text. The remaining gap is `Input_Seed`,
which is Fabio's graph edit and needs no app change once it exists.

**What ran, and what it proved:**

| check | result |
|---|---|
| `workflow-to-api.mjs` on `raw/qwen3vl_4b_prompt_enhancer.json` vs live `/object_info` (:8188) | exit 0, 12 nodes, `_meta.title` intact on every injectable |
| `validate-injection-rules.mjs comfy_workflows/qwen3vl_4b_prompt_enhancer.json` | clean, 1/1 conform |
| `node --check` on the 3 edited JS files + `json.load` on the JSON mirror | clean |
| `npm run release:check` | **passed** (this is the gate that catches a forgotten `operation_registry.json` entry) |
| `npm test` | **634/634** |
| `POST /prompt` with the converted API graph | 200, `completed: true`, `status: success` |
| `execution_cached` on that run | `["7","9"]` — recipe + CLIP loader ONLY, so `TextGenerate` ran fresh. Not the caching trap |
| `Output_prompt` (node 4) | returned the phrase — the MPI-242 contract holds through conversion |

**`tests/text-op-completion.test.cjs` FIRED, and it was right to.** Its assertion reads
*"exactly one text op today — a new one must be added here deliberately"*. It was extended, not
loosened: the expected list is now `['imageDescribe', 'promptEnhance']`, and a new assertion pins
`promptEnhance.mediaInputs === undefined`, because a media slot appearing there would make the
empty-run guard demand an image this flow never has.

**The op needed NO new app code.** `getUniversalWorkflow` wins over model resolution
(`commandExecutor.js:1413`) and `generationService`'s `outputKind === 'text'` branch (`:913`)
already ends a zero-media job and calls `onText`. The frame's payload
(`model: { id: null, mediaType: 'image' }`) is byte-for-byte the shape `describeAction.js:57`
already sends.

### `Input_Seed` — Option A chosen, and why the alternative was rejected

`Input_Seed` is **silently skipped today** — proven, not assumed: the probe ports
`comfyController._inject` and prints every title that matches no node, and `Input_Seed` printed
as a miss on every run.

**Fabio's call: add an `MpiInt` titled `Input_Seed`** into `3 TextGenerate`'s `sampling_mode.seed`.
The reason is a project-wide STANDARD — every workflow should carry an `Input_Seed` so that
exposing seed as a user control later is a UI change, never a graph change. **Option B** (retitle
the node and inject the dotted `Title.sampling_mode.seed`, which the first-dot split at
`comfyController.js:1404` resolves — and which drove every seed run below) works but makes this
graph a one-off, so it was rejected.

### The seed measurement — and why "the seed does nothing" will be a false report

Seed variance scales with what the user LEFT OUT. Same recipe (v4.2), same node, same bench:

- **`a gunslinger`** (vague) — seeds 0 / 42 / 7777 gave three different men: 32 / 35 / 32,
  sun-bleached vs dark brown hair, rough knot vs low ponytail vs tight braid, amber eyes only at
  42, wardrobe moving across all three.
- **`a retired lighthouse keeper on the Hebrides, sixties`** (role + place + age all stated) —
  seeds 0 / 42 / 111 / 999 / 7777 gave **one man five times**, differing only in adjectives
  (`sturdy`/`heavy` belt, `rusted`/`worn` buckle, `worn`/`heavy` satchel).

So a collapsed sample is the recipe obeying an over-specified prompt, not a dead knob. Test the
seed on a VAGUE input or the result is meaningless. (Sex did not vary in either arm; the earlier
"different ethnicity" note is not reproduced and should not be relied on.)

### The trap that produced a confident wrong answer

**`MpiText`'s widget is `string`, not `value`.** A probe that writes `.value` adds a key ComfyUI
ignores, the node keeps its BAKED default, and **the run succeeds** — returning a fluent,
plausible description of an entirely different character with no error anywhere. Here the baked
default is a nude-woman test string, so the first run read as the recipe being broken when the
graph was fine and the probe was wrong.

The rule that avoids it: inject the way `comfyController._inject` does — overwrite only keys that
ALREADY exist on the node, never invent one, and PRINT every title that matched nothing. That
print is what turned `Input_Seed`'s absence from an assumption into a measurement.


## Session 7 — the flow wiring (2026-08-20)

**VERIFIED, by running the check and reading the result:**

- `npm test` **638/638 pass** (was 636 before the two new guards).
- `npm run release:check` **passed**.
- `npx eslint` clean on `flowsRegistry.js`, `commandRegistry.js`, `operationRegistry.js`,
  `universal_workflows.js`.
- `validate-injection-rules.mjs` clean on BOTH converted graphs.
- `flow_character_sheet.json` converts off the live bench `/object_info`: **96 nodes** from the
  raw 146 (muted + virtual dropped). Its six injected titles and `output_image` all exist.
- The converted enhancer graph emits `"sampling_mode.seed": ["14", 0]` — a LINK, not the baked
  `0` — and no other widget value shifted, so the nested positional decode did not slip.

**NOT VERIFIED, and named as such:**

- **The seed does not reach the sampler until a live run says so.** The converter's self-check
  only asserts required inputs are PRESENT; whether ComfyUI accepts a link on a nested
  dynamic-combo key (`sampling_mode.seed`) is a backend question conversion cannot answer. The
  probe was killed mid-run when Fabio asked for the GPU. One run at three seeds on a VAGUE input
  settles it.
- **Nothing has been generated through the Flow overlay.** No live run, so playbook 05's list is
  entirely open.

**A guard was added for the failure that already happened once.** The seed test does not merely
check that a node titled `Input_Seed` exists — a titled node wired to nothing passes that and
still freezes the phrase. It resolves the node id and asserts some node's `sampling_mode.seed`
points AT it.


### The seed link is PROVEN LIVE (2026-08-20, session 7)

`POST /prompt` x3 on the bench, `Input_Positive: "a gunslinger"` (the VAGUE arm), seeds
0 / 42 / 7777 -> **three distinct descriptions**. So the ComfyUI backend DOES accept a link on a
nested dynamic-combo key (`sampling_mode.seed`) — which conversion alone could never have shown,
and which was the one open question the converter's own self-check cannot answer.

- seed 0 — 32, sun-bleached hair in a rough knot, brown leather coat
- seed 42 — 35, dark brown hair in a low ponytail, deep-set amber eyes, black leather coat
- seed 7777 — 32, dark brown hair in a tight braid, worn leather coat

**The second and stronger proof is in `execution_cached`.** Runs 2 and 3 cached
`['5','6','7','8','9','10']` — the whole string-assembly chain plus the CLIP loader — and did
**NOT** cache `3 TextGenerate`. A node only re-executes when an input actually changed, so the
cache list is positive evidence that the seed reached the sampler, rather than an inference from
the text merely differing.

This also reproduces the session-6 bench arm exactly (32 / 35 / 32, the same three hairstyles,
amber eyes only at seed 42), which independently confirms the injected path and the bench path
drive the same knob.


### The LIVE RUN — the flow works end to end (2026-08-20, session 8)

Own instance (`node scripts/launch-instance.mjs` under a held GPU lease,
`CUBRIC_MODELS_ROOT=G:/CubricModels`), port 49251, throwaway project `MPI-504 sheet verify`.
RTX 4060 Ti 16 GB, local engine 48188. Fabio's app on :3000 untouched.

**What the UI proved, in order:**

- Flow Library: **Character Sheet · READY**, "5 ready · 0 need models"; detail pane lists Krea 2
  INSTALLED + FLUX.2 Klein INSTALLED, which confirms the `requiredDeps: []` call.
- **`OPEN` on the LANDING does nothing with no project loaded** — the button is Gallery-only
  (`types.js:953`). Not a bug, and not obvious: it fails silently with no console entry. Open a
  project first, then `Events.emit('flow:open', { flowId: 'character-sheet' })`.
- Overlay: three ticks — **01 Inputs / 02 Describe / 03 Generate**. Step 0 renders
  **"This flow needs no input media."** beside the hero: the media-free path with no `inputSchema`.
- Run slide renders every declared field — YOUR CHARACTER, ENHANCE, STYLE (Photoreal),
  **QUALITY 1K|2K**, TURBO, HEADLESS FRONT BODY — and the status/result pane reaches
  "Done — saved to your gallery."
- `FLUX_RATIOS` read out of the LIVE page: `8:5=1280x800`, `5:8=800x1280`, the other seven
  untouched. The corrected row is what the running app serves.

**The switch bank is proven at BOTH arms, from the DISPATCHED graph rather than inferred:**

| run | UI note | dispatched `770 Input_Quality` | file on disk |
|---|---|---|---|
| 1K | `1280 × 800` | `1` | `flowCharacterSheet_001.png` — **1280 x 800** |
| 2K | `1792 × 1120 · ~2× time` | `2` | `flowCharacterSheet_002.png` — **1792 x 1120** |

Both graphs read back off `/queue` and `/history`, with
`560 EmptyLatentImage {width: ["771",0], height: ["772",0]}` and the switches resolving
`any_1 -> 676/677`, `any_2 -> 768/769`. The radio's `note` swapped with the arm, so label and
graph moved together. Every other control was identical across the two runs
(`remove_head=True turbo=False recipe=1`).

**The sheet itself is correct at 1K.** Prompt: a weathered desert scavenger, shaved head, scar on
the left cheek, goggles pushed up, patched canvas coat. Output: full-body front **HEADLESS** (a
clean hollow collar), full-body back with the head, and a three-quarter portrait carrying the
scar, the goggles, the amber eyes and the pupil catch-light, on a plain grey backdrop.

**Enhance was never pressed**, so this also proves the raw-prompt fallback: an untouched enhanced
box sends the user's own words to `Input_Positive`, exactly as `_collectInputs` documents.

#### OPEN OBSERVATION — the headless pass looked different at 2K, and it is NOT isolated

At 2K the front body came back with a **pale head-shaped fill** where 1K gave a clean hollow
collar. Tempting to call it a resolution bug; it is not established. **The two runs had different
seeds** (`2263222034277` vs `8958563981589`) because the flow injects a fresh `Input_Seed` per
press, so seed and resolution moved together and one run cannot separate them.

The controlled test is a fixed seed dispatched straight to the engine at both arms — two runs,
same seed, only `Input_Quality` differing. **Not run** (it needs the GPU again). This belongs to
the already-open "Klein removal A/B" checklist item, not to the switch bank, which did exactly
what it declares.


## 2026-08-20 · session 9 — the Enhance dead-box and the toggle buttons (no GPU)

**Ran:** `npm test` → **640/640**. `npm run test:desktop` → **20/20**. `npx eslint` on every
touched file → **0 errors** (4 warnings, all pre-existing bare `<button>`s in MpiBaseFlow's own
template at 172/445/518, untouched by this session). `npm run release:check` → passed.

**Two new desktop specs, and each was MUTATION-TESTED — a guard nobody has watched fail is not a
guard.** Both mutations were applied and reverted by a script whose restore sits in `finally`, so
a crash could not leave a source file broken.

| spec | mutation applied | result |
|---|---|---|
| `flow-enhance-writes-textarea.spec.js` | `_writeFieldValue` put back to `qs('.mpi-base-flow__field-text', wrap)` + `inp.value = text` | **FAILED** at the clear-on-edit assertion, then restored byte-identical |
| `flow-toggle-is-a-button.spec.js` | `inst.on('toggle', ({ active }) => onChange(active))` → `inst.on('toggle', () => {})` | **FAILED** at the round-trip assertion, then restored byte-identical |

**What the enhance spec asserts, and why it is shaped that way.** The rendered `<textarea>`'s
value, never `_fieldValues` — that state was correct for the entire life of the bug, which is
precisely why it went unnoticed for a session. Both directions of the one broken line are covered
with no GPU: text IN through `MpiInput.setValue` on the live field, and text OUT through
clear-on-edit, which runs the same `_writeFieldValue`.

**What the toggle spec asserts.** That the button renders in icon mode, that the caption appears
ONCE (no `field-label` span above it), that declared defaults paint (Turbo off, headless on) —
and then the flip is round-tripped through a slide rebuild. `is-active` alone proves nothing:
MpiButton flips that class internally whether or not anyone listened. `state.s_flowInputs` cannot
be the witness either — a live flow never writes it while the user edits; its only writers are the
RUN path (`MpiBaseFlow._doRun`, at dispatch) and `flowService.openFlowFromReuse`, which SEEDS it
from a history card before the flow mounts. A spec opening the flow with `flow:open` therefore
reads `undefined` no matter what it touched. The slide rebuild reseeds every field from
`_fieldValues[id] ?? f.default`, so a lost `onChange` comes back as the declared default.

**CORRECTED after the claim auditor ran.** The first version of this section said
`s_flowInputs` is "written only at DISPATCH", which is FALSE — `flowService.js:148` writes it too.
The spec's behaviour and its conclusion are unaffected (that writer only fires on Reuse, which this
spec does not use), but the stated reason was wrong, and it had been copied into `docs/testing.md`
as guidance for the next spec author. Both fixed. The auditor's other two findings: the
"ONLY driveable Primitive with no write API" claim was overstated and I had already corrected it
mid-close-out after pre-verifying it; the caller COUNT was wrong and is now recounted line by line
(seven modules, eleven sites — see plan.md `## Plan Drift`).

**Two constraints these specs had to work around, both worth reusing.** With no project open the
Flow overlay mounts into a main-area the landing page keeps hidden, so nothing inside it is
clickable or fillable to a synthetic Playwright gesture — every interaction goes through the real
handler in-page instead, and only the ASSERTIONS use locators (they read fine on hidden elements).
And slide 0 is always the INPUTS slide even for a media-free flow, so the `fields` step is slide
1 and the run slide is slide 2.

**NOT verified here:** how it looks. Both changes are visual and Fabio's app needs a reload (no
bundler, ES modules off `express.static`, nothing under `routes/` changed). A screenshot was
attempted and abandoned — the overlay is not renderable without a project, and forcing it visible
was not worth more machinery than the check is worth.


## 2026-08-20 · session 9 — the LoRA panel (no GPU)

**Ran:** `npm test` → **646/646** (6 new). `npm run test:desktop` → **21/21** (1 new). eslint on
every touched file → **0 errors**. `npm run release:check` → passed.

**What is proven, and what is deliberately not.** The flow's own half is a real desktop probe:
`flow-lora-button.spec.js` opens character-sheet, walks to the run slide, asserts the LoRAs
button renders with no duplicate caption, subscribes to `ui:open-model-settings`, presses the
button, and asserts the payload is exactly `{ modelId: 'krea2' }`. The payload IS the assertion —
an event firing with `undefined` opens nothing and logs nothing, which is the same dead-button
shape this card started with.

The OPEN itself is not reachable from that spec: `MpiModelSettings` is mounted by
MpiGalleryBlock and MpiGroupHistoryBlock, and with no project open neither Block is mounted. So
`tests/flow-lora-rack.test.cjs` pins the listener in **both** — the twin trap, since each Block
mounts its own overlay and wiring one leaves the button dead in the other workspace.

**The injection chain is pinned by source assertions**, the same call `flow-defer-commit` makes
about `deferCommit`: the chain is three browser modules deep and standing it up costs more than
it proves. What the assertions guard is a chain where **every hop drops an unknown key in
silence** — `runCommand` takes an explicit whitelist, so a key not named there simply never
arrives. Nothing throws: the panel opens, the slots save, the run succeeds, and the image has no
LoRA in it. Four assertions cover the three hops plus the gate being the explicit
`payload.loraModelId` rather than `payload.operation` (which would have switched LoRA injection
on for every universal tool in the app).

**NOT verified — and this one needs the GPU, so it is Fabio's or a later session's.** That a
LoRA picked in the panel visibly changes the sheet. Everything above proves the params are BUILT
and carry the right values; nothing here proves ComfyUI loaded the weight. The graph's
`Input_Lora_1..6` nodes were already present and `comfyController`'s dedicated LoRA-object
branch (MPI-219) already routes them, so the remaining risk is small — but it is untested.


## 2026-08-20 · session 10 — the GPU sweep: the recipe that never shipped, and where the head branch breaks

Fabio freed the GPU for this card. Everything below is a real dispatch on the **app engine
(48188)** — the user-replica engine, deliberately, because the open observation this session
had to settle was made there. Each batch ran under `gpu_lease.py run`, serially.

### THE SHIPPED ENHANCER WAS RUNNING A RECIPE TWO REVISIONS OLD — found before any GPU spun

`comfy_workflows/qwen3vl_4b_prompt_enhancer.json` carried a **3885-character** recipe.
prompts.md § 2 — the source of truth, and what every measurement in this card was made
against — is **4239 characters**. The two v4.x edits were missing from the graph in full:

- category 2's *"Name the hair in full here — colour, length and texture together in one clause"*
- category 4's rear-clause slot template, *"the &lt;colour&gt; &lt;texture&gt; hair &lt;worn how at the back&gt;"*,
  which is the whole reason v4.2 took rear-clause colour from 2 of 8 to 8 of 8

**This was not cosmetic, because nothing injects the recipe.** `MpiBaseFlow._runEnhance` sends
exactly one injection param — `Input_Seed` — so the BAKED text is what the Enhance button runs.
The commandRegistry comment says the recipe *"is INJECTED by the caller"* and describes the
baked value as existing *"only so it still runs standalone at the bench"*; for this flow that is
aspiration, not fact. Users were getting v3-era phrasing, and the one measured fix this card
made to the enhancer had never reached a single generation.

How it happened is ordinary drift: the graph got its recipe in `27217516` (2026-08-19), v4.1 →
v4.2 landed in prompts.md later the same day (`b56727f5`), and three later commits touched the
graph without re-syncing the text.

**Fixed at the source.** The v4.2 block is now extracted from prompts.md programmatically and
baked into `comfy_workflows/raw/qwen3vl_4b_prompt_enhancer.json` as a text substitution on the
two changed lines, so Fabio's export formatting survives byte for byte — a one-line diff.
`node scripts/sync-raw-workflows.mjs` then committed raw (`796060bf`), converted, and passed
`validate-injection-rules.mjs`. Nothing in the app changed: the recipe was already in the right
place, it was simply the wrong text.

### THE ENHANCER REGRESSION, RE-RUN END TO END THROUGH THE BUILT GRAPH

The owed checklist item. Every prior v4.x measurement ran against a hand-rebuilt chain; this run
is the shipped file — baked v4.2 → the three `StringConcatenate` ChatML hops → `TextGenerate` →
`Input_Scrub_Negation` → `Input_Tidy` → `Output_prompt`. Four regression inputs × seeds 0 and 1,
16-20s each.

| guarantee | end to end, 8 runs | recipe-only, v4.2 |
|---|---|---|
| lower-case noun phrase | 8 of 8 | — |
| no trailing full stop | 8 of 8 | — |
| 45-90 words (49-71) | 8 of 8 | 8 of 8 |
| nothing held | 8 of 8 | 7 of 8 |
| no place / light / camera | 8 of 8 | 7 of 8 |
| **positive phrasing only** | **8 of 8** | 0 of 8 |
| rear clause restates COLOUR | 8 of 8 | 8 of 8 |
| rear clause restates colour AND texture | 5 of 8 | 5 of 8 |
| main/rear colour contradiction | **2 of 8** | 2 of 8 |

Two readings matter. **The scrub nodes carry the whole positive-phrasing guarantee, live** —
the recipe has never once achieved it and the graph achieves it every time, which is exactly
what they were added for. And **the numbers replicate**, so the recipe-only measurements can be
trusted for the rest of this card rather than re-run.

Three "failures" the automatic checks raised are false positives, kept here so the next reader
does not re-chase them: *"a heavy brass belt **holding** a holstered revolver"* (worn, not held),
*"street"* inside the user's own words *"a cyberpunk street medic"*, and *"the back of the coat
hangs **plain**"* — which is the recipe's own prescribed phrase.

**The contradiction residual has a shape.** Both failures are the same one: the main clause says
`dark brown`, the rear clause says `black`. It is not random drift between arbitrary colours, it
is dark-brown collapsing to black in the rear clause. That is Fabio's open call and it is now
narrower than "accept the drift or move the invariant".

### THE 2K HEADLESS PASS — RESOLUTION, NOT SEED. AND IT IS TWO FAULTS, NOT ONE

The controlled test session 8 could not run: the same prompt and the same seed dispatched at both
`Input_Quality` arms, three seeds, `remove_head` on, turbo off, Photoreal.

| seed | 1K quality | 2K quality |
|---|---|---|
| `8958563981589` | clean hollow collar | **pale head-shaped fill** on the front body |
| `2263222034277` | faint ghost silhouette | faint ghost + a smeared collar |
| `504504` | clean, correct panel | **the REAR head was removed and the front kept its head** |

Seed is ruled out — `8958563981589` and `2263222034277` are session 8's own two seeds, now run
at both arms. 2K is worse in 3 of 3, and the third seed is a different failure altogether:

1. **The fill degrades.** Klein leaves a pale head silhouette instead of backdrop. Present in
   weak form at 1K too, so this is a matter of degree, not a 2K-only bug.
2. **The wrong head is picked** (seed `504504` at 2K only). `747 ImpactSEGSOrderedFilter` takes
   the smallest-area face on the sheet, which stands in for "the front body's head, never the big
   portrait". It holds while the detector sees exactly two faces. At 2K it evidently fires on the
   rear head as well, with a smaller box than the true front face, and the proxy inverts — the
   sheet comes back with its rear view decapitated and its front view intact, which is the exact
   opposite of the spec.

The second is the more serious: 2K + turbo off is the **shipping realistic rig**, so the failure
lives on the default path for the style most users will reach for first.

### A TALL HAT IS COVERED — the open head-branch question, answered

`"hair, face, hat"` through `SAM3_Detect` with `individual_masks: false` takes a full stovepipe
top hat with the head, and the 2.6× crop clears its crown with room to spare. Three seeds at
1K turbo on a deliberately hat-heavy character (a frock-coated undertaker); the front body comes
back with collar, shirt and waistcoat intact and no hat. The crop never reached a neighbouring
panel in any of the three.

What it also shows: **the ghost silhouette is not a 2K artefact.** At 1K turbo the removed
head-and-hat leaves a clearly visible lighter shape in the backdrop, hat brim and crown and all.
So the ghost tracks the FILL, which is the same fault as (1) above, and 2K only makes it opaque.

### THE FOUR STYLES — ALL PASS, and the batch killed a rule before it shipped

One character (a copper-braided ranger), each style at the rig it ships on, two seeds each.
**Medium and catch-light hold in 8 of 8:** Photoreal at 2k-quality (pores, film-real skin), 3D at
2k-turbo (subsurface skin, groomed hair), Anime at 2k-turbo (cel line art), Cartoon at 2k-turbo
(bold outlines, flat colour fills). Wardrobe, knife at the left hip and the quiver across the
back survive every panel, and the rear panel carries the copper-red braid in all eight.

**The incidental finding is the load-bearing one: THE LAYOUT MIRRORS, and it does so per SEED.**
At seed `820001` three of the four styles put the big portrait on the LEFT and both bodies on the
right; at `820002` the same 3D and Anime recipes came back the other way round. The template says
*"The right half of the image is filled by a head and shoulders portrait"* and *"The left half
holds two narrow full-body standing views"* — the model treats that as a preference, not a
constraint, and nothing in the prompt orders the two body panels against each other at all.

**No pick rule may assume panel position.** This is written here because it killed the obvious
fix for the section below: "take the LEFT-most face" reads as the natural repair for a mispick,
and it would have picked the PORTRAIT on three of the four styles.

### THE MISPICK — ROOT-CAUSED, FIXED, AND VERIFIED

**The rule that was there.** `747 ImpactSEGSOrderedFilter`, area ASCENDING, take 1 — "the smallest
face on the sheet is the front body's head, never the big portrait". It is a proxy, and it holds
only while the detector finds exactly two faces.

**Why it breaks.** The rear body is not always a clean back view. At seed `504504` the rear figure's
head is turned to profile with the face visible, `face_yolov8n` detects it, and its box is SMALLER
than the true frontal face. Area-ascending then takes the rear head, and the sheet comes back with
its rear view decapitated and its front view intact — the exact inverse of the spec.

**Enumerated with a detector-only probe** — three pre-removal 2K sheets uploaded to the engine and
run through detection alone, no sampler, ~2s a prompt, so every candidate rule was compared without
regenerating anything:

| sheet | detections (x, size) | shipped rule | rule A (leftmost) | rule B |
|---|---|---|---|---|
| `2263222034277` | front 142/121 · portrait 998/641 | front | front | front |
| **`504504`** | **rear 636/97** · front 149/106 · portrait 1006/452 | **rear ✗** | front | **front ✓** |
| `8958563981589` | front 162/122 · portrait 1050/618 | front | front | front |

Two numbers decided it. At `504504` the confidence order is **portrait → front face → rear profile**,
so the frontal face outranks the turned-away head even on the sheet built to break that assumption.
And the portrait is the largest face by a factor of four (452-641 against 97-122), so "drop the
largest" is not a marginal call.

**Rule B, shipped (Fabio's call, 2026-08-20):**

```
747  drop the portrait (the largest face)   area · DESCENDING · take_start 1 · take_count 999
773  the frontal body head, not the rear    confidence · DESCENDING · take 1
748  SegsToCombinedMask  <- 773
```

Both stages rest on something intrinsic rather than incidental: the template *does* prescribe that
the portrait fills a half of the frame, and `face_yolov8n` *is* a frontal-face detector, so a
frontal face outscoring the back of a head is its job description. Rule A rested on the model's
habit of putting the front body first, which the styles batch proved it does not keep.

**Verified live at 2K, 3 of 3 seeds**: at `504504` the removal moved from the rear body to the
FRONT body and the rear kept its head; at `8958563981589` and `2263222034277`, both already
correct under the old rule, it stayed correct — so the fix carries no regression on the sheets the
area rule happened to get right. (The third seed was re-run after an engine restart killed it
mid-batch; Fabio installed a model, which restarts the app engine.) Raw `1e6ba5cc`, converts clean through
`validate-injection-rules.mjs`, `npm test` 655/655.

**The hole this leaves, stated rather than hidden.** With only ONE detection, `take_start: 1`
selects nothing and the branch errors instead of producing a sheet. That case is already broken
today — one detection means the portrait is the only face found, and every area rule then removes
the PORTRAIT's head — so B turns a silently ruined sheet into a loud failure. Accepted knowingly.

### THE FILL IS A SEPARATE FAULT, AND IT IS NOT MAINLY ABOUT RESOLUTION

**Correcting this session's own earlier entry.** The 2K headless table above reads as "2K degrades
the fill". The wider evidence does not carry that:

- 7 of the 8 style runs left a head-shaped ghost at 2K, under BOTH turbo and quality — `threed_s1`
  was the only clean one
- the tall-hat runs ghosted at **1K turbo**, hat brim and crown legible in the backdrop
- only 1K-quality has produced consistently clean collars, and only on 2 of 3 seeds
- both rule-B verification sheets still ghost, with the pick now provably correct — so the fill
  fault is independent of the pick fault, which is what those two runs establish

The honest statement: **the fill is unreliable generally**. The resolution reading rests on a single
clean same-seed pair (`8958563981589` at 1K against 2K) and one pair is a pilot, not a result — this
card's own standing rule. What IS established is that Klein leaves a pale head-shaped silhouette
instead of backdrop across rigs, resolutions and styles.

**The lead worth testing, from `docs/models/klein/removal.md`:** the outpaint LoRA's instance prompt
is `"Fill the green spaces according to the image"`, removal *"takes no prompt — the instance prompt
alone is enough"*, and the measured removal config is **4 steps**. The sheet graph sends node `712`
the sentence *"Remove the head, leaving only the clothes behind."* at `704 Flux2Scheduler steps: 2`.
So the branch may never be hitting the trigger the LoRA was trained on, and it is running at half
the measured step count.

### THE KLEIN INSTANCE PROMPT — RUN AND DISPROVED. DO NOT RETRY IT

`docs/models/klein/removal.md` says the outpaint LoRA's instance prompt is
`"Fill the green spaces according to the image"`, that removal *"takes no prompt — the instance
prompt alone is enough"*, and that the measured removal config is **4 steps**. The sheet's head
branch sends `712` the sentence *"Remove the head, leaving only the clothes behind."* at
`704 Flux2Scheduler steps: 2`, so it looked like the branch was missing its own trigger and
running at half the step count. **Both leads are wrong, and the first is dangerously wrong.**

2×2, prompt × steps, three seeds, on the hat character at 1k-turbo (45-70s a run — the cheap rig
that reproduces the ghost, chosen over 2k-quality at 250s because the fault shows at both):

| arm | prompt | steps | result, 3 of 3 seeds |
|---|---|---|---|
| **A** shipped | the description | 2 | head removed, faint ghost |
| **B** | the instance prompt | 2 | **a whole new head painted back**, green plate still showing through |
| **C** | the description | 4 | indistinguishable from A |
| **D** | the instance prompt | 4 | **same rebuild** |

**Why the doc's rule does not transfer.** It is written for generic object removal, where "fill the
green according to the image" means *continue the surrounding surface*. Here the surrounding image
is a person with a collar and shoulders, so the same sentence reads as *reconstruct the head* — and
the LoRA obliges, complete with hair and ears. The shipped description is doing real work: it is the
only thing telling the model that what belongs there is BACKDROP, not a face.

**Settled, and neither needs re-running:** `712` keeps its sentence, `704` keeps `steps: 2`.

**Where the fill fault actually points now.** The ghost is a head-shaped LIGHTER patch, not a failed
fill — the model paints a faint head rather than nothing. `718 InpaintCropImproved` runs
`mask_expand_pixels: 6`, `mask_blend_pixels: 32` and `mask_hipass_filter: 0.1` against the RAW SAM3
mask (`757`; the grow at `690` feeds only the second pass). A 32-pixel feather on a ~220-pixel crop
is an enormous soft band, so `713 ImageCompositeMasked` never fully destroys the head — it blends
green over a still-visible one — and the model reconstructs what it can still see underneath. Next
batch: blend 32→4, expand 6→24, both, and hipass 0.1→0.9, three seeds each against the A control.

### THE REAR CLAUSE REACHES THE RENDERED PANEL — and the contradiction residual is INERT

Two questions in one batch, both fed by the enhancer's OWN v4.2 output rather than hand-written
wording, three seeds each at 1k-quality (turbo off, the realistic path):

**1. Does the rear clause move the rear PANEL, or only the text? It moves the panel, 3 of 3.**
The agreeing phrase — `a tired schoolteacher … red hair long and wavy, tied back in a loose braid
… the red wavy hair hangs loose at the back` — renders a copper braid in the rear panel at every
seed, matching its own portrait. The 8-of-8 rear-colour figure measured in TEXT does carry through
to pixels. That closes the checklist item that had this open.

**2. Does the 2-in-8 main/rear contradiction matter? NO — and this settles Fabio's open call.**
The contradicting phrase — `dark brown hair cut short and slicked back` … `the black hair tied
tightly at the back` — renders a rear panel indistinguishable from its own portrait at all three
seeds. **The two colours the recipe confuses are the two that look the same.** Dark brown and
black are visually adjacent, so the drift is real in the text and invisible in the image.

**The call: ACCEPT the drift.** No recipe change, and specifically not another wording attempt —
v4.3 already proved that road ends in an instruction example leaking into the output. The
invariant does not need moving out of the recipe either, because there is nothing to fix in the
render.

**The one caveat, stated so it is not lost:** every contradiction v4.2 has ever produced is
dark-brown → black. A `red` → `black` contradiction WOULD show, and nothing has produced one in
16 samples across v4.1 and v4.2. If one ever appears, this verdict is void for that case.

### THE GHOST IS MASK COVERAGE, NOT MASK SOFTNESS — `mask_expand_pixels` 6 → 40

Four candidate edge knobs on `718 InpaintCropImproved`, three seeds each, hat character at
1k-turbo, against the `A_desc_2_*` control from the batch above (same seeds, same rig):

| arm | change | s1 | s2 | s3 |
|---|---|---|---|---|
| A control | — | ghost | strong ghost | faint ghost |
| E | `mask_blend_pixels` 32 → 4 | ghost, slightly worse | strong ghost | worse |
| **F** | **`mask_expand_pixels` 6 → 24** | **cleanest** | softest of the five | **cleanest** |
| G | both | clean-ish, but a **red patch inside the collar** | strong ghost | ghost |
| H | `mask_hipass_filter` 0.1 → 0.9 | worse, sharp hat outline | strong ghost | worse, sharp outline |

**The softness knobs do nothing or hurt, and H is the diagnostic one:** binarising the mask makes
the ghost SHARPER rather than removing it. That rules out the feather as the cause — a soft edge
was the obvious suspect and it is not what is happening.

**What is happening: the SAM3 mask UNDER-COVERS the head.** Hair edge and the hat's soft boundary
sit outside the `threshold 0.5` union, so a rim of the original head survives `713`'s green plate,
the model can still see a head under the green, and it paints a faint one back. Every arm that
destroys more of the head helps; every arm that only changes the edge profile does not.

**The ladder, same three seeds:**

| `mask_expand_pixels` | s1 | s2 (the stubborn seed) | s3 | collar / shoulders |
|---|---|---|---|---|
| 6 (shipped) | ghost | strong ghost | ghost | intact |
| 24 | clean | faint ghost | clean | intact |
| **40** | **clean** | **clean** | **clean** | **intact** |
| 56 | clean | clean | clean | intact |

**40 is the pick, not 56.** It is the smallest value clean at every seed, which matters because
the expansion is in CROP pixels and `718` resizes the crop to the head box — 56 on a ~220px crop
is a quarter of the frame, and on a character whose head box sits lower or tighter that is the
value that reaches the collar first. 40 buys the same result with headroom.

**Do not re-derive the two dead knobs.** `mask_blend_pixels` and `mask_hipass_filter` were both
tested at three seeds and both make it worse; the green plate's soft edge is a symptom of the
under-coverage, not its cause.

### THE SECOND REMNANT: THERE WAS NO NECK IN THE VOCABULARY — FIXED, 3 OF 3 AT BOTH RIGS [REVERTED — see 2026-08-21 below]

Expanding the mask to 40 cleared the backdrop ghost but at 2K seed `504504` it left something
new: an eye-shaped piece of skin sitting **inside the collar**. The obvious suspect was
`682 MaskDetailerPipe`, which repaints the region at `denoise: 0.4` with an EMPTY prompt — a
wider mask hands it more room to invent, and with nothing saying *backdrop* what it invents
would be face-shaped.

**Wrong, and the test that killed it is worth keeping.** Denoise `0.4 → 0.25 → 0.15` left the
fragment unchanged, and `mask_expand_pixels: 32` did too. A thing that does not respond to
denoise is not being invented — **it is a remnant.**

**`754 SAM3 vocabulary` reads `"hair, face, hat"`. There is no NECK in it.** On any seed where
the coat collar stands open, the neck and the underside of the chin are never masked, so removing
the head leaves skin behind in the collar. It also explains the "fleshy neck stump" visible in
several earlier control images, and why the high-collared undertaker at 1k-turbo looked clean —
his collar hid the neck outright.

`"hair, face, hat"` → `"hair, face, hat, neck"`, and with `mask_expand_pixels: 40`:

| seed (2k-quality) | shipped | expand 40 | expand 40 + neck |
|---|---|---|---|
| `504504` | head fill + ghost | eye fragment in the collar | **clean hollow collar** |
| `8958563981589` | strong pale head fill | neck stump remains | **clean, inner collar visible** |
| `2263222034277` | ghost + fleshy stump | pale stump remains | **clean, collar closes over** |

**Regression-checked at the other rig too:** the hatted undertaker at 1k-turbo, same three seeds,
**3 of 3 clean** — hat ghost gone, collar, shirt and waistcoat intact. Six clean sheets against a
control that produced zero.

**So the ghost was two remnants wearing one symptom, exactly as the pick fault was:** the mask
under-covered the head (a rim outside `threshold 0.5`), and the vocabulary omitted the neck
entirely. Expanding fixed the first and, by clearing the fog, made the second visible.

**Dead ends, measured, do not re-derive:** `mask_blend_pixels` 32→4 and `mask_hipass_filter`
0.1→0.9 (both worse at three seeds — binarising makes the ghost SHARPER, which is what ruled the
feather out), pass-2 denoise at 0.25 and 0.15 (no change), `mask_expand_pixels: 56` (works, but
spends headroom for nothing), and the Klein instance prompt (rebuilds the head — see above).

Shipped: raw + `49d9fc37`. `npm test` 655/655.

### THE NECK WAS REVERTED — AND THE SECTION ABOVE RECORDS THE WRONG MECHANISM (2026-08-21, `ca4fdc0d`)

`754` is back to `"hair, face, hat"`. The section above still reads FIXED; it is not. Two wrong
explanations die here, and the second one is mine.

**WRONG — "the head box is a square 2.6× the face, so a garment reaching the jaw falls inside it,
and only the geometry or the composite can fix it."** That was in the session handoff and it is
false. `751 MpiMaskSquareBbox` feeds `752 MpiBox` → `758 MpiBoxCrop` → `755 SAM3_Detect` **and
nothing else**. The square is the crop SAM3 SEARCHES; it is not the region that gets destroyed.
What gets destroyed is SAM3's own mask, pasted back at full size by `757` and expanded by `718`.
A collar sitting inside that square is untouched unless something puts it in the MASK. **Do not
go chasing the head-box geometry — there is nothing there.**

**RIGHT (Fabio, 2026-08-21): Klein grows the region it rebuilds well beyond the mask it is
handed.** That growth is not a defect — it is what stops hair strands and ear edges surviving as
ghosts, and it is why `mask_expand_pixels: 40` reads as sufficient rather than excessive. But it
means **anything admitted to the mask propagates outward from there**. Put the neck in and Klein
destroys what is BEHIND and AROUND the neck: collar, shoulders, the background between them.
The earlier theory — that SAM3 binds `neck` to the garment when no bare throat exists — is
superseded; it may also be true, but it is not what makes this unsafe.

**Consequence for the open "clothing damage on high-necked characters" item:** it is the same
mechanism at reduced scale, not a separate bug. A scarf or turtleneck wound to the jaw sits
immediately outside a mask Klein is already growing past. Expand 6 vs 40 barely moved it because
Klein's growth dominates the 34px difference. So the lever is Klein's growth or what is fed to
it — NOT the SAM3 vocabulary (adding words makes it worse) and NOT the crop square (it changes
nothing that is removed).

**Fabio's ranking, unchanged:** a leftover neck and a faint head rim are ACCEPTABLE. Changed
CLOTHING is not.

### THE 10/10 STRESS TEST — SCOPE SETTLED (Fabio, 2026-08-21)

**What it must prove: the branch NEVER picks the back of the head.** Not "does the face hold
across ten poses and ten lights" — that is a CHARACTER-ASSET test from the brief, and this flow
emits one fixed thing (same three panels, same flat light, same pose) so it cannot answer it.
Feeding the sheet into t2i/i2v is a different flow's job.

**Why the design already resists it:** `745` is `face_yolov8n` — a FACE detector, deliberately
not a head detector. A true back-of-head presents no face, so it cannot be picked at all. That
is the structural guarantee, and it is why the first detection must stay a face detector.

**So the residual risk is exactly one thing:** a rear figure turned far enough to show a face.
That is the 2K fault already measured — `face_yolov8n` fires on the rear profile, and before
`773` the area rule handed it the smaller box and decapitated the rear view. The test must
therefore MAXIMISE rear-head turn, not vary pose and light.

**Pass criterion, binary, 10 of 10:** portrait panel intact, front-body panel headless, rear-body
panel head INTACT.

### KREA2-NSFW-ONLY INSTALL CASE — CLOSED, NOT INVESTIGATED (Fabio, 2026-08-21)

"Krea2 NSFW. Leave it alone." Off the card's remaining bench items. Do not re-open it.

## 2026-08-21 · THE 10/10 STRESS TEST — RUN, AND IT PASSES ON THE THING IT PROVES

**Rig:** 2k-quality (`Input_Quality 2` = 1792×1120, `Input_is_Turbo false`),
`Input_Remove_Head true`, bench 8188. Ten characters, ten seeds, all four recipes.
~250 s a sheet, ~42 min for the batch. Harness + sheets in the session scratchpad
(`headpick/`, `_contact.jpg` is the whole batch as one image).

Each run carried three `PreviewAny` probes on `751` (x, y, size), so the verdict has the
chosen head box behind it and not only my eyes.

### THE RESULT: THE BACK OF THE HEAD WAS NEVER PICKED. 10 OF 10.

| # | character | recipe | head box (x,y,size) | pick | note |
|---|---|---|---|---|---|
| 01 | desert scavenger | Photoreal | 66, 53, 270 | OK | neck stump in the open collar — the accepted leftover |
| 02 | Victorian undertaker | Photoreal | 64, 67, 264 | OK | faint hat ghost over the front body |
| 03 | cyberpunk medic | Anime | 125, 0, 224 | OK | clean |
| 04 | dock worker | Photoreal | 88, 0, 263 | OK | clean |
| 05 | swordswoman (braid) | 3D | 76, 11, 329 | OK | rear braid intact |
| 06 | crusader knight | 3D | 60, 0, 348 | OK | **mail coif REMOVED from the front body** |
| 07 | pop idol (twin tails) | Anime | 13, 0, 400 | OK | clean |
| 08 | cartoon detective | Cartoon | **0, 0, 0** | **FAIL** | zero faces — see below |
| 09 | salvage diver | Photoreal | 29, 0, 309 | OK | clean |
| 10 | swamp sorcerer | Cartoon | 146, 170, 325 | OK | strong hair-silhouette ghost |

`face_yolov8n` as stage 1 held exactly as designed. **The face detector IS the guarantee**
— a true back-of-head presents nothing to detect — and the only case that could defeat it,
a rear figure turned far enough to show a face, did not occur once in ten 2K sheets.

### THE PORTRAIT WAS ON THE RIGHT IN 10 OF 10 — the mirroring objection does NOT replicate

Recorded because it reverses a disproved lead. The earlier session ruled out a
"leftmost face" pick with *"3 of 4 styles mirror the layout and the mirroring varies by
SEED"*. **At 2k-quality, across all four recipes and ten seeds, the layout never
mirrored:** two full-body views left, portrait filling the right half, exactly as every
recipe template prescribes. Every chosen head box landed at x ≤ 146 with size ≤ 400, so
the whole head branch stayed inside the left ~30% of a 1792 px sheet.

That is what makes **restricting the masking branch to the left half** (Fabio's call) a
supportable change rather than a bet — the portrait then cannot be a candidate at all,
and `747`'s "drop the largest face" heuristic stops being load-bearing. The earlier
mirroring measurement was presumably taken on the 1k-turbo rig; it is not what 2K does.

### RUN 08 IS NOT A PICK FAULT — IT IS THE EMPTY-DETECTION CASE, AND IT IS UNGUARDED

`face_yolov8n` found **zero faces** on the flat cartoon render. What follows is not a
graceful degradation:

1. `748` produces an empty mask, so `751 MpiMaskSquareBbox` returns `size 0`.
2. `752 MpiBox` is therefore `(0, 0, 0, 0)`.
3. **`MpiBoxCrop` passes the FULL IMAGE THROUGH on a zero box** — by design, and the
   intent is written on the line: `img.py:618`, *"ponytail: empty intersection passes
   through rather than erroring mid-graph"*.
4. So `755 SAM3_Detect` receives the **entire sheet** instead of a head crop, masks the
   heads it finds across all three panels, and Klein destroys the portrait.

**This corrects an earlier note in this file** (the `Zero-face runs will error, not
degrade` line): they do not error. They silently escalate to a whole-sheet removal, which
is the worst possible outcome — the portrait is the one panel a user cannot lose.

Cropping the branch to the left half CONTAINS this (the portrait becomes unreachable) but
does not fix it: the same run would then destroy both full-body views instead. The empty
case needs its own guard — the natural one is to fall back to the untouched sheet, which
is what `Input_Remove_Head false` already does, so the wiring exists (`742 MpiIfElse`
selects `730` the raw sheet over `681` the inpaint output). `MpiCompare` and
`MpiBooleanCompare` are both in the node pack.

### TWO FINDINGS THE BATCH SURFACED THAT ARE NOT THIS TEST'S SUBJECT

- **06 lost the mail coif.** The high-neck clothing damage, caught in the wild rather than
  reproduced deliberately. Consistent with Klein growing past the mask.
- **Cartoon and Anime wash out at 2K.** 07, 08 and 10 came back near-greyscale with flat,
  under-described wardrobe, while every Photoreal and 3D sheet held its colour. Not a head
  branch fault — it is upstream of the whole branch. Worth its own card.

### THE GROWTH IS BOUNDED BY THE STITCH, AND IT IS THREE SURFACES — corrects this file, 2026-08-21

Written earlier today: *"Klein grows the region it rebuilds well beyond the mask it is
handed"* and *"expand 6 vs 40 barely moved it because Klein's growth dominates the 34 px
difference."* **The wiring does not support that.** Traced through the graph:

- **Pass 1** — `718 InpaintCropImproved` (`mask_expand_pixels 40`, `mask_blend_pixels 32`),
  green plate via `713 ImageCompositeMasked` off `718`'s cropped image + cropped mask,
  stitched back by `696 InpaintStitchImproved` whose stitcher IS `718`.
- **Pass 2** — `689 InpaintCropImproved` (`mask_expand_pixels 6`, `mask_blend_pixels 32`),
  stitched back by `680`.

The sampler does repaint the whole crop, but **the stitch composites it back through the
expanded/blended mask**, so pixels outside that mask are restored from the original. The
damaged region is therefore bounded by `expand + blend`, which is ~72 px on pass 1 and
~38 px on pass 2 at 2K — a real, tunable number, not an unbounded model behaviour.

**So the correct reading of "expand 6 and 40 measured near-identical" is that the coif
sits within ~38 px of the head mask, not that the growth swamps the difference.** The
mechanism Fabio described is right — anything admitted to the mask propagates outward, and
that is why `neck` was unusable — but the propagation has a ceiling and the ceiling is
set by these nodes.

**A third growth surface that is in neither InpaintCrop**, and easy to miss when tuning:
`682 MaskDetailerPipe` — `feather 6`, `noise_mask_feather 20`, `crop_factor 1.8`,
`denoise 0.4`. It runs inside pass 2 and feathers on its own terms.

Minor caveat, unmeasured: both crops run `output_resize_to_target_size: True`, so the
stitch-back resamples and the boundary can smear a pixel or two. Not enough to explain
a removed coif.

### THE FAR-LEFT FIGURE IS THE FRONT BODY IN 10 OF 10 — measured, 2026-08-21

Fabio's question, and it is the one that decides whether stage 1 can be deleted:
*has any generation put the far-left figure with its back to camera?* Measured across
the whole 2k-quality stress batch (all four recipes, ten seeds): **no. The far-left
figure faces the camera in 10 of 10, and is never the rear view.** The head-box probes
agree independently — every chosen head sat at `x <= 146` with a right edge `<= 471` on
a 1792 px sheet, inside the left 26%.

Column positions, as a fraction of sheet width (rules drawn at 26/30/34/38% over the
left 45% of every sheet; `headpick/_columns.jpg` in the session scratchpad):

| | position |
|---|---|
| front figure, including a top hat (02), antlers (10) and a fedora (08) | ends by **~20%** |
| rear figure's body edge | starts **~24%** |
| rear figure's **head** | starts **~29%** |

**So a cut at ~25% of sheet width** — 448 px at 1792, 320 px at 1280 — contains the whole
front figure and clips no rear head, with ~5% of width (~90 px at 2K) of margin either
side. Nothing crossed the 26% rule in either direction in ten sheets.

**What this buys: stage 1 becomes deletable.** `745`/`746` (`face_yolov8n`), `747` (drop
the largest face) and `773` (highest confidence) exist only to locate the front body's
head. If the crop itself guarantees only the front body is in frame, none of them is
needed — and the zero-face failure (run 08, and Fabio hit the same thing at 1K) cannot
happen, because there is no detector left to return nothing.

**The caveat, stated so nobody treats 25% as a law:** the recipe templates prescribe the
left half holds *"two narrow full-body standing views of equal width"* but do NOT pin
their x. So a percentage cut is a heuristic with measured margin, not a guarantee, and a
sheet that centres the pair differently would clip.

**A variant that does not depend on the panels landing at a particular x:** `755
SAM3_Detect` already carries `individual_masks`, currently `false` (unioned). Set it
`true`, feed it the left **HALF** — a slack, safe cut — and take the **leftmost** mask.
Same rule, same node, one flag, and it still deletes stage 1. Untested.
