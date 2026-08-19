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
