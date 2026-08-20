# MPI-504 — plan: Character Sheet, shippable v1

Re-scoped by Fabio 2026-08-19. **v1 takes a prompt and nothing else.** The reference-photo
path — the half that had to hold identity onto a back view it never saw — is deferred whole.
Head-swap already covers "make it look like this person": generate the sheet from a
description, then swap. That removes the one unproven step from the card.

The prompt payload (sheet template ×4 styles, the character-only enhancer recipe, the removal
prompt) is in [prompts.md](prompts.md). This file is the build.

## Current State

**2026-08-20, session 8 — BOTH OPEN DECISIONS ANSWERED AND SHIPPED; THE FLOW RAN LIVE.** The
1k/2k control is the `Input_Quality` switch bank (`70dc98cb` raw, `96c5b410` app+docs), proven at
both arms in my own instance — `Input_Quality 1 -> 1280x800`, `2 -> 1792x1120`, read off the
dispatched graph AND the files on disk (`475083cb`). The other four FLUX ratio rows are
**DECLINED** with the provenance traced (SDXL training buckets). 638/638, `release:check`, eslint
clean. **Three things are now open, all in `## Plan Drift` below:** the Enhance DOM-write bug
(root-caused to one line, NOT fixed), toggles-as-buttons, and the LoRA panel + its route. The
graphics have still not been made. Session 7's record follows.

**2026-08-20, session 7 — THE FLOW IS WIRED. `/mpi-add-flow` is done bar the live run and the
graphics.** What landed:

- **`Input_Seed` EXISTS** in `raw/qwen3vl_4b_prompt_enhancer.json` — Option A, an `MpiInt`
  titled `Input_Seed` (node 14) linked into `3 TextGenerate`'s nested `sampling_mode.seed`
  (link 16). **Fabio handed this edit over rather than doing it himself** ("you can do that
  yourself by editing the RAW workflow"), so raw/ was touched WITH his say-so — the rule
  otherwise stands. Committed by `sync-raw-workflows.mjs` as `345bbdf8`, re-converted, and
  `validate-injection-rules` clean. The API graph now reads `"sampling_mode.seed": ["14", 0]`
  instead of a baked `0`.
- **`flowCharacterSheet` REGISTERED IN THE 4 FILES** — `commandRegistry.js` (`mediaType: IMAGE`,
  `requiresImages: 0`, **no `mediaInputs`**, `promptRequired: true`, `universal: true`),
  `operationRegistry.js` + `operation_registry.json` (`1.5.0`, `universal: true`),
  `universal_workflows.js` → `flow_character_sheet.json`.
- **`comfy_workflows/flow_character_sheet.json` converted** off the live bench — **96 nodes**
  from the raw 146 (muted + virtual dropped), `validate-injection-rules` clean.
- **The `FlowDef` is written** at the end of `FLOWS`: a `fields` step carrying the prompt pair
  (`positive` → Enhance → `Input_Positive`, rows 10) and a run slide carrying the condensed
  pair plus `Input_Recipe` (**`select`**, 4 styles, 1-indexed, default 1 Photoreal),
  `Input_is_Turbo` (off) and `Input_Remove_Head` (on).
- **Guards added** — `tests/inject-params-titles.test.cjs` gained two cases: the sheet's six
  injected titles + `output_image`, and the enhancer's `input_seed` **plus an assertion that it
  is actually LINKED into a `sampling_mode.seed`**. A titled-but-dangling seed node would pass a
  title check and still freeze the phrase.
- `npm test` **636/636**, `eslint` clean on all four registry files.

**THE SEED IS PROVEN LIVE** (2026-08-20). Seeds 0 / 42 / 7777 on `a gunslinger` returned three
different men, and `execution_cached` covered nodes 5-10 but **not** `3 TextGenerate` — a node only
re-executes when an input changed, so the cache list is positive proof the link reaches the sampler.
The backend DOES accept a link on a nested dynamic-combo key. Evidence in validation.md.

**THE 8:5 RATIO WAS CORRECTED APP-WIDE** (2026-08-20, Fabio's call: *"if 1280x800 is true 8:5, then
we're lying to the user, and we should fix that"*). `FLUX_RATIOS` landscape `8:5` is now
**1280x800** (was 1280x768 = 5:3) and portrait `5:8` is **800x1280** — both fixed together because
the two orientation lists are index-mirrors and the flip maps by index, so changing one alone would
make the flip return a different aspect rather than the transpose. Reaches `flux`, `chroma`,
`klein` and `krea2`'s 1k tier (`KREA2_RATIOS['1k']` IS `FLUX_RATIOS`, shared by reference).
`nearestNamedRatio` reads CROP_RATIOS (pure aspects), so **old cards still label 8:5** and history
stays coherent. Docs swept: `docs/models/krea2/resolution.md` (the /16 verification line AND both
table rows) + a user-facing note in `docs/releases/UNRELEASED.md`. 638/638, release:check passed.

**The other four FLUX rows are still nominal and were left alone** — 3:4 is really 7:9 (3.70% off),
4:3 is 9:7, 4:5 is 14:17, 9:16 is 4:7 (1.59%). Each has an exact /16-clean value in the same ~1 MP
class (`864x1152` · `896x1120` · `720x1280` · `1024x1024` unchanged), so fixing them is a decision
not a constraint. **Offered to Fabio and not yet answered.**

**MPI-586 CREATED** — the Prop Sheet flow, split out at Fabio's call ("I think it's best to have a
separate flow for it"). Animals and props, no headless pass (so krea2 only — no klein-4b, no SAM3
chain), 8:5 AND 16:9 user-chosen, plus a PLACEMENT axis with per-option guidance. It inherits this
card's prompt-pair UI and `promptEnhance` op with its own recipe, and it **hits the same
two-nodes-one-field ratio gap**, so it must reuse whatever this card settles rather than inventing a
second answer. Should not start before this flow has had a live run.

**NOT DONE, and both need Fabio:**

1. ~~THE SEED IS STILL UNPROVEN LIVE~~ — **DONE, see above.** Kept for the reading trap: The converter emits the link and the self-check passes,
   but **whether the ComfyUI backend accepts a link on a nested dynamic-combo key has not been
   demonstrated** — that is the one thing conversion cannot tell you. A probe was written
   (`scratchpad/probe_seed.py`, a faithful `_inject` port that prints every silent skip) and
   killed mid-run when Fabio asked for the GPU. Re-run it at seeds 0/42/7777 on `a gunslinger`
   (the measured VAGUE arm — an over-specified input returns one man five times and reads as a
   dead knob). Different text across seeds = proven.
2. **THERE IS NO QUALITY CONTROL, and it is not expressible today** — see `## Plan Drift`.
   The flow runs at the graph's baked `1280x768` until that is decided.

**Also unbuilt, deliberately: the LoRA rack.** `Input_Lora_1..6` exist in the graph, but the
declared-field vocabulary has **no lora type** (`select` / `radio` / `button` / `toggle` /
`number` / `slider` / `text`, and that list is the law — a control it cannot express is a NEW
PRIMITIVE plus a new type, never a bare input). No shipped Flow has a rack. Out of scope for
this pass; it is a Flow-vocabulary feature, not a Character Sheet one.

**Graphics not made** — `preview: 'flow-character-sheet.webp'` / no `video` yet. That is
`/mpi-flow-graphics` (playbook 06), and `ltx-upscale` is in the same state, so it is the normal
order, not a gap.

**2026-08-20, session 6 — THE ENHANCER OP IS SHIPPED AND VERIFIED. Next is `/mpi-add-flow`
for the sheet itself.** The op is `promptEnhance`, and it is registered **universal, not
character-sheet-specific** — the recipe and BOTH scrub patterns are injected by the caller, so
a later flow reuses it with its own recipe instead of registering a twin. Landed in the four
files (`commandRegistry.js` · `js/core/operationRegistry.js` · `operation_registry.json` ·
`universal_workflows.js`), `outputKind: 'text'`, `universal: true`, `requiresImages: 0`, **no
`mediaInputs` at all** — text in, text out. `appVersionIntroduced: '1.5.0'`, ahead of the
released 1.4.2, same reasoning as `ltxVideoUpscale`.

`comfy_workflows/qwen3vl_4b_prompt_enhancer.json` is the converted API graph (12 nodes, off the
live bench `/object_info`), `validate-injection-rules` clean. **`npm test` 634/634 and
`release:check` passed.**

**No new app code was needed** beyond the registration. The generic path already carries it:
`getUniversalWorkflow` wins over model resolution (`commandExecutor.js:1413`), and
`generationService`'s `outputKind === 'text'` branch (`:913`) ends the job with no history item
and hands the string to `onText` — the same route `imageDescribe` takes, with the identical
`model: { id: null, mediaType: 'image' }` payload the frame already sends.

**Proven by RUNNING it, not by converting it:** `POST /prompt` 200, `execution_cached: ["7","9"]`
(recipe + loader only, so `TextGenerate` ran fresh), `Output_prompt` returned the phrase.

**`Input_Seed` — FABIO CHOSE OPTION A, 2026-08-20.** Add an **`MpiInt` node titled `Input_Seed`**
to `raw/qwen3vl_4b_prompt_enhancer.json`, wired into `3 TextGenerate`'s `sampling_mode.seed`.
His reason is a STANDARD, not this graph: *every* workflow should carry an `Input_Seed`, so that
exposing seed as a user control later is a UI change and never a graph change. The frame already
sends the plain key `Input_Seed` (`MpiBaseFlow.js:797`), so **when the node exists the only work
left is one re-convert — no app edit.** Until then the key is **silently skipped** (measured, not
assumed) and every Enhance press returns the same phrase.

**Option B was measured working and REJECTED on that standard.** `3 TextGenerate` already carries
the widget `sampling_mode.seed`, and the `Title.widget` injector splits on the FIRST dot
(`comfyController.js:1404`), so `Input_Enhancer.sampling_mode.seed` resolves and drives it — every
seed run below went through that path. It needs no new node, but it makes this graph's seed a
one-off. Recorded so nobody re-derives it.

**THE SEED MEASUREMENT, AND THE TRAP IN READING IT.** The seed moves the phrase, but **how much
depends entirely on how much the user left unspecified** — so a future "the seed does nothing"
report is most likely an over-specified test input, not a dead knob. Both arms are n≥3 on the
bench, same recipe (v4.2), same node:

- **Vague input (`a gunslinger`)** — seeds 0 / 42 / 7777 returned three different men: age 32/35/32,
  sun-bleached vs dark brown hair, rough knot vs low ponytail vs tight braid, amber eyes appearing
  only at 42, and the wardrobe shifting across all three. (Sex did not vary in this sample; the
  earlier "different ethnicity" note is not reproduced here and is not load-bearing.)
- **Over-specified input (`a retired lighthouse keeper on the Hebrides, sixties` — role, place AND
  age all given)** — seeds 0 / 42 / 111 / 999 / 7777 returned **one man five times**, differing only
  in adjectives (`sturdy`/`heavy` belt, `rusted`/`worn` buckle, `worn`/`heavy` satchel). That is the
  recipe obeying the user, not the seed failing.

**A PROBE TRAP THAT MANUFACTURES A CONFIDENT WRONG ANSWER.** `MpiText`'s widget is **`string`**, not
`value`. Writing `.value` on it adds a stray key, ComfyUI ignores it, the node keeps its BAKED
default and the run **succeeds** — so the graph returns a fluent, plausible description of a
completely different character and nothing anywhere reports an error. It cost one wrong reading
here (the baked default is a nude-woman test string, which read as the recipe being broken). Any
hand-rolled probe must inject the way `comfyController._inject` does: overwrite only keys that
ALREADY exist on the node, never invent one. Working probe kept at
`scratchpad/run_enhancer2.mjs` in the session log — it ports `_inject` and PRINTS every silent
skip, which is how `Input_Seed`'s absence was proven rather than assumed.

**Noticed, not actioned:** `getToolCommands()` in `commandRegistry.js:1296` has **zero callers**
app-wide. It is the only reader of `cmd.universal` for UI purposes, so a new universal op adds no
button anywhere — which is why `promptEnhance` needs no gate to stay off the History rail. Dead
export, pre-existing, left alone.

**2026-08-20 — THE GRAPH IS DONE AND FABIO RAN IT LIVE. It succeeded on 3-4 outputs and he
called it ready to implement. The next job is the ENHANCER OP, then `/mpi-add-flow`.**

`comfy_workflows/raw/flow_character_sheet.json` is Fabio's re-export: **146 nodes / 180 links**.
The `Masking` group holds the 14 nodes I authored (`745`–`758`) plus **his fix**; my 14 came back
from his editor with **type, widgets and titles byte-identical** (only positions/order moved, and
the group slid to `y 3870.5`).

```
736 sheet ─ 759 MpiBlocker ←(760 Get_is remove head)
              ├─ 745 face_yolov8n → 746 BboxDetectorSEGS → 747 OrderedFilter(area ASC, take 1)
              │        └─ 748 SegsToCombinedMask ← the face BOX, geometry only
              │             ├─ 749 SquareBbox(pad 0) ─ size ─ 750 MpiMath "a * 4 // 5"
              │             └─ 751 SquareBbox(pad←750) ─ x, y, size
              └─ 758 MpiBoxCrop ←(752 MpiBox) → 755 SAM3_Detect(individual_masks FALSE)
753 SAM3 ckpt ─CLIP─ 754 CLIPTextEncode "hair, face, hat"
743 W, 744 H ─ 756 SolidMask(0,W,H) ─ 757 MaskComposite(add) → 733 Set_inpaint mask
```

**THE ONE REAL BUG, AND ITS ROOT CAUSE — do not lose this.** With `Input_Remove_Head` OFF the
head branch ran anyway: YOLO, the 1.75 GB SAM3 checkpoint, the Klein inpaint. **`MpiIfElse` being
lazy was never the issue.** An output node is an **execution ROOT**, and `688 PreviewImage` was
left UNMUTED with an upstream closure of **84 nodes** — all 14 Masking nodes and the whole inpaint
chain. One debug preview dragged the entire gated branch into every run. Fabio's fix is both
halves, and both are needed:

- **`759 MpiBlocker` at the SOURCE**, driven by `760 Get_is remove head` — it blocks the image
  before `746`/`758`, so no root anywhere can pull the branch. This is the half that survives
  someone adding a preview later.
- **`688` MUTED** (mode 2), along with three new debug previews he added muted from the start
  (`765`/`767 MaskPreview`, `766 PreviewImage`).

Written up generally in `docs/workflow-authoring/mpi-nodes.md` § "A preview node defeats a lazy
gate" — the symptom is "a gated branch's models load every run and the gate looks correctly
wired", and the answer is to grep for unmuted output nodes, NOT to re-check the gate.

**Six things in the mask chain that are load-bearing and non-obvious:**

- **The face box is GEOMETRY, never the mask.** `748` only gives `749`/`751` something to measure;
  SAM3 shapes what gets filled. The retired-bbox-as-mask decision, made structural.
- **`individual_masks: false` IS the union.** One mask over hair + face + hat, and a hatless
  character contributes nothing — the degradation needs zero extra nodes. Categories stay BARE:
  `:1` detects NOTHING (`docs/masking-sam3.md`).
- **The crop is scale-free.** `Input_Width`/`Input_Height` are user-adjustable (1088×896 today),
  so a pixel constant would have broken silently. `750` makes the head box 2.6× the face box at
  any resolution. Floordiv, not `* 0.8`: `safe_math` has no `int()`, and `*` out is not a cast.
- **The crop is `MpiBox` + `MpiBoxCrop`, NOT `ImageCrop`.** Core `ImageCrop` is **deprecated**
  and `ImageCropV2` cannot replace it here (its `crop_region` is a socketless UI widget). Only
  LOADING the graph in a browser surfaced that — conversion and every offline check passed it.
- **`MpiMaskSquareBbox` clamps x/y/size inside the image itself**, which is why `MaskComposite`'s
  `x/y ≥ 0` floor and the crop's bounds hold with no clamp node.
- **`SolidMask(W, H)` cannot misalign** — `560 EmptyLatentImage` takes width/height straight from
  `676`/`677`, so the render is exactly `Input_Width × Input_Height`.

**NO new Set/Get names were added by me**; Fabio's `760` is a second `Get_is remove head`, which
is legal (many Gets, one Set).

**FABIO'S NEW ASK, 2026-08-20: `Input_Recipe` needs a DROPDOWN in the Flow UI.** It is the
1-indexed `MpiAnySwitch` over the four style templates (`671 Input_Recipe` MpiInt). The frame
already has the field type — `type: 'select'` in `js/utils/declaredFields.js:154` mounts
`MpiDropdown`, portals its list to `document.body` (a step row clips overflow), and **emits the
option's ORIGINAL `v`, never the DOM string**, so the int reaches `MpiAnySwitch` intact. Shape it
like `Input_Tier` in `flowsRegistry.js:268` but `select` rather than `radio`:
`{ id: 'Input_Recipe', type: 'select', label: 'Style', default: 1, options: [{v:1,label:'Photoreal'}, {v:2,label:'3D animation'}, {v:3,label:'Anime'}, {v:4,label:'Cartoon'}] }`
with an `info` per option. Labels/order come from `prompts.md` § The four styles. This lands at
`/mpi-add-flow`, in the FlowDef — **not** in the graph.

**Pre-existing, NOT mine, flagged not fixed:** `709 Get_steps` has no `SetNode` anywhere in the
file — the graph's one unreachable node, in the Generation half. `raw/` is his.

**The boundary contract, read off the file — kept for the record, all four anchors now wired:**

| | node | name | type |
|---|---|---|---|
| **IN** | `736 GetNode` | `sheet output` | IMAGE — the generated sheet. Now feeds `759 MpiBlocker` |
| **IN** | `743 GetNode` | `W` | INT |
| **IN** | `744 GetNode` | `H` | INT |
| **OUT** | `733 SetNode` | `inpaint mask` | **plain MASK.** Now fed by `757 MaskComposite` |

`Masking` group bbox is now `[-508.6, 3870.5, 2960.0, 1411.1]` (Fabio moved it) — anything added goes inside it.
Free canvas is roughly x `-200 … 2200`, y `4790 … 6190`; the four anchors sit at the far left
(x ≈ -450) and far right (x ≈ 2240).

**Three things that fall out of the contract:**

- **Downstream ALREADY grows and blurs.** `735 Get_inpaint mask → 690 GrowMaskWithBlur`, and
  `734` feeds `721 MpiMaskSquareBbox` + `718 InpaintCropImproved`. So do **not** bake a grow
  into the Masking group — the plan's "grow 24 @ 2k" is already someone else's job. Emit a
  clean union and let his chain shape it.
- **The gate at `742 MpiIfElse` is NOT sufficient on its own — SETTLED BY A LIVE RUN.** Its
  inputs are lazy, but an unmuted output node is an execution ROOT and pulls the branch anyway.
  That is what `759 MpiBlocker` + muting `688` fixes. Full account in the top block.
- **Set/Get names are matched by NAME and a collision cross-wires SILENTLY** — link integrity
  still passes. Taken already: `clip`, `vae`, `seed`, `model`, `Models`, `turbo`, `steps`,
  `W`, `H`, `positive text`, `negative text`, `klein clip`, `klein vae`, `klein model`,
  `sheet output`, `inpaint mask`, `is remove head`. Prefix everything new, e.g. `mask_*`.

**Every node the branch needs is already pinned** (checked 2026-08-20, `dev_configs/node_lock.json`):
`UltralyticsDetectorProvider` + `BboxDetectorSEGS` → ComfyUI-Impact-**Subpack**;
`ImpactSEGSOrderedFilter` → ComfyUI-Impact-Pack; `SAM3_Detect` → **core ComfyUI 0.28** (weight
is a shipped `engineAsset`); `face_yolov8n.pt` → the `face-yolov8n` dep, already on R2. Nothing
new to download, nothing new to pin.

**The enhancer graph still needs `Input_Seed` (`MpiInt`) — Fabio's edit, `raw/` is his.**
Confirmed absent 2026-08-20: `raw/qwen3vl_4b_prompt_enhancer.json` has 12 nodes and node `3
TextGenerate` carries a baked seed widget. Everything else that op needs is there
(`10 MpiText Input_Positive`, `7 Input_System_Prompt`, `11`/`12 RegexReplace` scrubs,
`4 PreviewAny Output_prompt`). `13 MpiClearVram` stays — MPI-157 tried removing it and was
disproven live.

**When wiring the app, the enhanced phrase goes to `Input_Positive`, NOT `Input_Character`.**
That name only ever existed in the scratch fixture and is wrong against this graph.

**2026-08-20 — THE THREE BUTTON CHANGES ARE MADE AND SCREENSHOTTED. Next is the enhancer OP.**
Enhance is now an `MpiButton`, pink, icon left of the label, and on the run slide it sits directly
under the prompt box. What it cost, and what is worth knowing next time:

- **Icon mode was the wrong door, and the trap below understates it.** `MpiButton` defaults icon
  mode to `primary` and then maps everything except danger/ghost down to `secondary` — so ~20
  buttons across the app pass `variant: 'primary'` today and render GREY. Widening that mapping
  would have repainted every one of them. **TEXT mode with the icon in `children`** gets pink,
  hover-on-background and icon-LEFT with no primitive change at all.
- **The two states are the primitive's own variants, not a bespoke class.** `--stale` is gone:
  `_paintEnhance` toggles `mpi-btn--primary` (not enhanced — loud, and the SAME pink as Generate,
  measured `255,126,182` on both) against `mpi-btn--secondary` (enhanced — quiet). Only ever one
  class at a time, because `--secondary` is declared after `--primary` and would otherwise win.
- **The run-slide fix was the `--work` fix, one selector up.** `--work` is always applied ON TOP
  of `--stacked`, so moving the `flex: 0 0 auto; max-width: none` undo onto `--stacked` fixed the
  run slide and deleted the duplicate in one edit.
- **`MpiButton.js` imported `/js/utils/icons.js` by ABSOLUTE path** — the only Primitive that did
  (its sibling `MpiRadioGroup` is relative). `declaredFields.js` is imported by
  `tests/declared-fields.test.cjs` in bare Node, so pulling MpiButton in would have broken that
  test with `ERR_MODULE_NOT_FOUND` on `C:\js\utils\icons.js`. Made relative.
- **The handoff was wrong that Add Foley moves.** Foley declares its two text fields on a STEP
  (row layout), not on the flow, so only **Extend Video** has flow-level text fields and only its
  run slide changed. Head Swap's radio is untouched. Verified by screenshot on all four.
- **Extend Video's run slide DID change and Fabio should look**: its boxes now hug `rows` (3 and
  2) instead of stretching to 320px, so the long baked negative is clipped to two rows and
  scrolls. That is the declaration being obeyed, but it is a visible difference.

**Still open, both flagged not fixed:** `MpiToolOptionsUpscale.css` carries a twin raw-button block
that would now fight the primitive — dead today (no plugin declares a `button` field) and it belongs
to live card MPI-580. And every declared field's `:focus-visible` ring is still `--accent-frost`,
app-wide; re-colouring those is its own job.

**2026-08-20 — Fabio's three changes, as he asked for them** (kept for the record; all three are
now done):

1. **The Enhance button must be an `MpiButton`, pink (`variant: 'primary'` = `--accent-heat`) with
   the `enhance` icon** (already in `js/utils/icons.js:37`), and it must change BACKGROUND on hover
   the way the rest of the app does. My `--accent-frost` outline was wrong twice over: Fabio's
   words — *"a colour that is only used in 3% of the app… it actually should be a colour that
   shouldn't be used anywhere. We end up using it for some reason."* Treat `--accent-frost` as
   a colour to move AWAY from, not a signal to reach for.
2. **On the run slide the Enhance button must sit directly UNDER the prompt box**, not down beside
   Generate. This is the `--stacked` flex-growth already noted below under "Open"; Fabio's answer
   to that open question is: put them together.
3. Its size/placement otherwise stay as they are.

**Three traps for whoever does it** (all checked, none guessed):

- **`MpiButton` in ICON MODE FORCES `secondary`.** `MpiButton.js:70` maps every variant except
  `danger`/`ghost` down to `secondary`, so `{icon:'enhance', label:'Enhance', variant:'primary'}`
  comes out grey, not pink. Decide deliberately: widen that mapping, or use text mode and put the
  icon in the label. Do NOT just pass `primary` and assume.
- **The `button` branch is in `js/utils/declaredFields.js`, which is SHARED** with MPI-580's plugin
  dropdown. Swapping the raw `<button>` for a mounted Primitive changes both surfaces and needs a
  teardown — copy the `radio` branch's `unsubs.push(() => inst?.el?.destroy?.())`, it is the only
  other mounted Primitive there and it exists for exactly this reason.
- **`_paintEnhance()` currently repaints by `qs`-ing `.mpi-base-flow__field-button`** and setting
  `textContent`/`disabled`/`--stale`. On an MpiButton that becomes the instance API, and the
  `--stale` + `--work` button CSS blocks in `MpiBaseFlow.css` change with it. Whatever replaces
  `--stale`, it must still be readable on the run slide, where the enhanced prompt is invisible and
  the button is the ONLY thing that can say "not enhanced".

Also: fixing (2) touches `--stacked`, which Extend Video and Add Foley also use — check both run
slides after, and say if they moved.

**2026-08-20, session 5 — the prompt UI's FRAME HALF IS BUILT and verified in a running app.**
All six of Fabio's rules hold, and it took **no new component** — a Flow carries no JS, so the
capability is two declarations the frame understands (`docs/playbooks/add-flow/ui/prompt-enhance.md`
is the portable record):

- **`kind: 'fields'`** — a frame-native, media-less step whose declared fields ARE the work,
  stacked where the canvas would be (`FRAME_KINDS`, `MpiBaseFlow/stepKinds.js`). It has no `role`,
  so its values live in the FLOW-level store — which is what makes one prompt a single value
  edited from the step AND the run slide.
- **`action: 'enhance'` on a `button` field** (`op` / `from` / `to`) — the frame runs the text op
  and writes `to`. That ONE declaration also drives edit-clears, the `--stale` button state, and
  the raw-prompt fallback, so they cannot disagree.

**Rules 5 and 6 turned out to be FREE.** `flowInputs` already snapshots the whole collected payload
at Run and Reuse seeds it back, so both prompts store and inject verbatim with no new storage path,
and no seed is stored because nothing declares one. Verified live, not reasoned: with Enhance
unpressed the payload was `{positive: "a rain-soaked dock worker, forties", injectionParams:
{Input_Character: "a rain-soaked dock worker, forties"}}`; with the box filled, `Input_Character`
became the enhanced text and `positive` stayed the user's own.

**NEXT: the enhancer OP.** The UI is wired to an op that does not exist yet — `getCommand` misses,
so Enhance warns and no-ops (proven; the button does not hang). That op is `raw/qwen3vl_4b_prompt_
enhancer.json` converted to an API workflow + registered in the 4 files with `outputKind: 'text'`.
The weight is **already shipped** (`qwen3vl-abliterated-clip`, shared with krea2 and the
image-describer plugin) — no new download. One open dependency: the enhancer graph needs an
`Input_Seed` node for per-press variation, and `raw/` is Fabio's.

**2026-08-20 — the prompt UI is DECIDED, and it is the next build.** Fabio settled the shape in
conversation: a **three-step Flow** with the enhancer promoted out of hiding into two user-facing
fields. Step 2 is the refine surface (user box → Enhance → editable enhanced box), step 3 is the
condensed generate surface where the enhanced prompt is invisible. Enhance is the only writer;
**no Enhance pressed means the raw user prompt is used**; editing the user prompt clears the
enhancement, visibly in step 2 and via the Enhance button's appearance in step 3; step 3's Enhance
fills step 2's box. The sidecar stores **both** prompts and Reuse injects the enhanced one verbatim.
**No seed is stored** — considered and rejected, since the phrase itself is stored. The enhancer
seed does become load-bearing inside the graph. Full spec, and what already exists vs what does
not, in **`## The prompt UI`** below.

**2026-08-19, session 4 (second half) — bench gate #1 is CLOSED, passed.** The neutralised template
(`man`→`character`, `his`→`the`, five spans) was A/B'd against Fabio's original wording on one male
character at three seeds at 1k-turbo plus the shipping 2k-quality rig — 8 generations, `raw/`
untouched. **Visually indistinguishable in all four cells.** Layout compliance does not depend on
the gendered words, so the `man`/`woman`-token fallback is not needed and should not be built. Each
cell asserted the wording actually reached the sampler by reading back `673 Output_prompt` (8 of 8),
and the builder aborts if a reversal anchor is missing — both guards exist because an arm that
silently fails to differ manufactures a false pass. Also measured in passing: 2k-quality costs
**239-240s**, not the 328s recorded earlier.

**2026-08-19, session 4 — the recipe regression ran, and the adopted hair shape was not actually
reaching the output.** Text-only, no generation, 24 samples over three arms at two seeds each. The
four v3 guarantees all survive the F-shape edit (`nothing held` even improved to 4 of 4). But
**v4.1's prose amendment was obeyed in category 2 and ignored in category 4**: the rear clause
restated the hair colour 2 of 8, and colour-and-texture together 0 of 8 — so the F shape's measured
win, which IS the rear colour, did not survive the round trip through the LLM. A **slot template**
in rule 4 fixed it (rear colour 8 of 8, main clause unharmed at 7 of 8); that is **v4.2 and it is
now the shipped recipe text in prompts.md §2**. Residual, open and Fabio's call: ~2 in 8 still write
`dark brown` in the main clause and `black` at the back. **v4.3 tried to close that with a worked
example and was disproved** — the example leaked into a red-haired character at both seeds, and 4
of 8 rear clauses became verbatim duplicates of the main clause. Two seeds also caught a false
verdict mid-pass: v4.2 looked like it cost the main clause at seed 0 and did not at seed 1.

**2026-08-19, session 3 — the rig questions are CLOSED, the flow is in good shape.** Roughly 30
generations this session settled three things and produced no code change: the F hair shape is
adopted into the recipe, **the rear-hair defect was the
test rig rather than the prompt** (turbo, not resolution — 2×2 grid at three seeds), and **turbo vs
non-turbo is a product axis, not a quality dial**: turbo locks the character across seeds and suits
the stylised styles, non-turbo varies the character and suits realistic. Anime at 2k-turbo is the
best sheet the card has produced. The head branch was redesigned by Fabio on the way past: the face
detection stays as the area SELECTOR, and the mask that gets filled becomes a SAM3 union of `hair` +
`face` + `hat`. Details in validation.md, newest entries last.

**2026-08-19, session 2.** Two graphs exist in `comfy_workflows/raw/`, exported by Fabio from the
bench editor and **verified offline** (no generation):

- **`krea2_t2i_only.json`** — 54 nodes, the t2i base. Clean: 0 orphan Gets, 0 dangling required
  inputs, every link resolves. All three silent-killer traps intact (conditioning via
  `FromBasicPipe ← Get_Models`, resolution wired direct from `Input_Width`/`Input_Height`,
  `Input_Bypass_Filter_Lora` still at strength 1), both turbo switches live, four samplers at
  25/8/3/2. No `TextGenerate` — the LLM is gone from this graph.
- **`qwen3vl_4b_prompt_enhancer.json`** — 10 nodes, text-only, no image machinery. Skeleton and
  sampler params exact. **Three gaps, all open** (see below).

The recipe is at **v4** and confirmed on the bench: 70-82 words 4/4, no example leak, nothing held
4/4, no place/light/camera 4/4, scrub clean 4/4. Full run and every output:
[research/enhancer-regression-2026-08-19.md](research/enhancer-regression-2026-08-19.md).

**What the regression established, and what it cost:**

1. **A readable example inside a system prompt gets copied as the answer.** v1's
   `("a weathered Plains chief in his late sixties, ...")` came back verbatim for *cyberpunk
   street medic* and *gunslinger*. Show a slot template, never prose.
2. **Positive phrasing cannot be won in the prompt on this 4B.** Every revision states absences.
   That is the failure that reaches Krea2, so **two `RegexReplace` nodes are part of the build** —
   verified offline on all four real outputs, not optional polish.
3. **`use_default_template` is inert** with a manual ChatML string — byte-identical true vs false,
   node executing fresh both times. Leave it `true`.
4. **The gear policy's third tier is cut** (Fabio). v4 handed `a gunslinger, no weapons` "a gunbelt
   slung low across his hips" — positively phrased, so no scrub could ever catch it. The recipe
   writes the character only; exclusion is the user's job at the review step.

**`qwen3vl_4b_prompt_enhancer.json` is patched, made UNIVERSAL, and proven live**
(2026-08-19). Fabio's call: the Image Descriptor already drives this same 4B, so this workflow
must serve any flow that needs an LLM rewrite — **the recipe is injected at run time, not baked.**

It needed retitles, not new plumbing. `comfyController._inject` sprays into `value` and `string`,
and MPI-359's `Title.widget` form addresses one named widget, so:

| inject key | node | carries |
|---|---|---|
| `Input_System_Prompt` | `PrimitiveStringMultiline` | the recipe, whole, ChatML wrapper included |
| `Input_Positive` | `MpiText` | the user's text |
| `Input_Scrub_Negation.regex_pattern` | `RegexReplace` | the negation scrub |
| `Input_Tidy.regex_pattern` | `RegexReplace` | the clause/trailing-stop tidy |

The **scrub patterns are injectable too**, deliberately. A universal workflow with a baked
character-sheet scrub would silently mangle another flow's output; a flow that wants no scrubbing
injects a pattern that cannot match (`(?!x)x` — verified live, the trailing full stop survives,
which proves the injected pattern really replaced the baked one). The character-sheet values stay
as the baked defaults so the graph still runs standalone at the bench.

Also added **`MpiClearVram` after `TextGenerate`**, exactly where `image_descriptor.json` puts it
— the 4B stays resident otherwise and a sheet generation normally follows straight after.

12 nodes, 11 links. Converts cleanly through `scripts/workflow-to-api.mjs` with `_meta.title`
intact on every injectable node.

**Live proof on the bench, two arms, no image generated:**

- **Defaults** — all four regression inputs returned 61-71 words, no negation, no trailing stop,
  and each matched the offline JS scrub prediction **byte for byte**. So Python `re` and JS agree
  on both patterns. `execution_cached` covered only `["7","9"]` (recipe + loader), so
  `TextGenerate` ran fresh every time — not the caching trap.
- **A different recipe injected** — a translator prompt plus neutralised scrub patterns returned
  French. Universality is measured, not assumed.

**Where the recipe lives now.** For this workflow it is **app payload, not graph payload** — the
flow supplies it through `injectionParams`. prompts.md §2 stays the source of truth for the text
itself. Worth considering at `/mpi-add-flow` time: this is the same shape as
`getUniversalWorkflow('imageDescribe')`, so the op could be a universal `promptEnhance` that any
flow calls with its own recipe, rather than a character-sheet-specific op.

**2026-08-19, session 3 — the sheet prompt is wired into `krea2_t2i_only.json`.** 54 → **62
nodes**, 69 → **77 links**, authorised by Fabio (raw/ is user-owned). Eight new nodes `666`-`673`:
the four recipe templates, `Recipe_Select`, `Input_Recipe`, `Sheet_Prompt` and `Output_prompt`;
build detail in § Then add, in order.

**Verified offline, no GPU, no generation:** link integrity clean; Set/Get pairing clean (the one
unread `Set_model` predates this edit — confirmed against the pre-patch copy, left alone);
**62 of 62 nodes reachable** walking upstream from `442 SaveImage` / `494 Output_Image` /
`673 Output_prompt` with `Get`→`Set` as an edge; the substitution simulated for all four recipes
(hole filled, character present, 241-246 words assembled). `scripts/workflow-to-api.mjs` converts
exit 0 against the live bench `/object_info` with `_meta.title` intact on every injectable, all
16 injectable titles unique, `51 CLIPTextEncode.text` ← `672`, and `671 Input_Recipe` lands on
an unwired `int` key, which `comfyController._inject` sprays (`js/services/comfyController.js:1373`).

**The first sheet is generated and the layout passes** (2026-08-19, `prompt_id ff505256`, 40s).
**Test rig is 1k + turbo ON, not 2k turbo-off** — Fabio: placement is what matters and the sheet
feeds another model, so quality proves nothing here and costs time. `673 Output_prompt` returned
the assembled 303-word prompt as node text, so the MPI-242 contract is proven live. Evidence and
the full read of the image: validation.md.

**The rear-panel hair drift is measured, not guessed** (A/B, two arms, validation.md): it is
SYSTEMATIC across seeds, and the description reaches that panel for COLOUR but not for TEXTURE.
It matters because the front body loses its head to the Klein pass, leaving the rear panel as the
only hair-from-behind reference the video model gets.

That arm RAN and came back NEGATIVE (arm D, validation.md): the template's global identity clause
changed nothing. Krea2 attends to the concrete rear-view description and ignores a general
"all views must match" instruction. **Settled: the knob is the character phrase's rear clause**,
so the fix is enhancer-recipe payload, the template stays as Fabio wrote it, and the graph does
not move. **The "hair texture is a v1 limitation" line is WITHDRAWN** — never established. Colour was
stated and disobeyed on one panel (a real adherence failure); texture was never asked for at all,
so the wavy back view broke no instruction and the actual defect is that the panels disagree. Arm
B only added `straight` to the REAR clause while the main clause named no texture, so the
mechanism was never tested. validation.md carries the correction.

**Fabio's call: name the hair ONCE, in full.** Colour and texture together in the main clause, the
rear clause naming only how it falls, no attribute repeated — on the reading that saying a thing
twice is what confuses the model. This REVERSES the v4.1 proposal in prompts.md §2 (which asked
the rear clause to restate the colour); that proposal stays as the record of what arm B measured,
unadopted.

**RAN — arms E and F, 2026-08-19, and the single-mention shape is NEGATIVE.** Arm E (colour and
texture in the main clause, nothing repeated) put the rear panel at sat `0.181` against the
control's `0.182` at the same seed — no movement at all. Arm F then ran the one cell nobody had
tried, the full main clause AND arm B's rear repeat together: `0.165`. So the two *repeating* arms
(B `0.161`, F `0.165`) are the only two that have ever moved the rear panel, and **Fabio's reading
is disconfirmed — repetition helps mildly rather than confusing the model.** The v4.1 rear-clause
repeat in prompts.md §2 is reinstated as the best-measured shape, with arm F its strongest form.
Reversing his explicit call needs him, so nothing is adopted and `raw/` is untouched.

**Rear-view texture IS a model limit, and now it is established rather than assumed.** `straight`
has been stated in the main clause, the rear clause, both at once and in the template; the rear
view came back wavy in all six runs across three seeds, while the portrait renders long straight
iron-grey hair correctly in the same frame. Effect size of any wording is ~0.02 saturation against
a rear-to-portrait gap of ~0.05-0.07 — the best arm narrows the disagreement, nothing closes it.
Revisit at the 10/10 stress test, where it either survives contact with real shots or does not.

**F ADOPTED (Fabio, 2026-08-19)** — his single-mention call was an observation carried over from
other models, not a verdict, and he asked to keep testing wording until it lands. Recipe categories
2 and 4 in prompts.md §2 now carry the F shape, which makes the recipe **v4.1 and owing a text-only
regression pass** over the four inputs.

**Then the seed noise floor, on Fabio's catch, and it invalidated the arm ranking.** Every arm to
that point was n=1 at seed `504504`. F against K over three fresh seeds came out **2-2 on per-seed
wins**, with the within-arm range (`-0.119…0.103`) an order of magnitude wider than the between-arm
mean difference (`0.009` vs `0.014`). K's win is withdrawn, and so is the whole G/I/K/L/M/N
ranking. The metric does not survive a seed change either — composition shifts move the fixed
sample boxes, and `F123123`'s portrait box landed on the red shirt. **Only within-seed comparisons
are valid; the visual verdict is what carries across seeds.**

**What survived, and it is the useful half.** The F shape fixes rear-panel COLOUR, replicated at
`777001`, `909090` and `123123` — control renders the rear brown, F renders it grey. Seed `504504`
is an unusually hard seed and it is the only one the investigation ran on, which made a solved
problem look unsolved for eleven arms. Rear-view TEXTURE stays wavy at every seed under every
wording while the portrait renders it straight in the same frame: a model limit, now on four seeds.

**Standing rule for this flow: one seed is a pilot, not a result.** Wording verdicts need 3-4 seeds
compared per seed. Dead levers, do not retest: the sheet template (arms D and G), the negative
prompt at 1k turbo (`72`/`162` are cfg `1.0`, so `Input_Negative` is inert — only the quality path
`311` at cfg `2.0` makes it live), and stronger texture words.

**THE REAR-HAIR DEFECT WAS THE TEST RIG — closed 2026-08-19.** A 2×2 grid at three seeds per cell,
unanimous: turbo ON renders the rear hair wavy at **both** 1k and 2k; turbo OFF renders it straight
at **both**. The 2k-turbo cell settles it — same resolution as the fix, same defect as the rig. So
resolution is irrelevant to hair texture and the sampler path is the whole effect (`72`/`162` at
8+3 steps cfg `1.0` vs `311`/`436` at 25+2 cfg `2.0`), and it reproduces at 1k, so it is cheap to
test from here (111s rather than 328s).

Eleven wording arms chased an artefact of the rig. The 1k+turbo rig was right for placement, which
is what it was picked for — it is simply not valid for texture, which nothing before this grid
could have told us.

**Fabio's rig decision, 2026-08-19:** realistic characters → **turbo OFF + 2k**; **stylised (anime,
cartoon) → turbo ON** — measured, nine runs: anime at 2k-turbo is the best sheet this card has
produced (and the wave artefact does not appear there at all), while anime at 2k-quality turns
sketchy AND puts the character's hood up, hiding the hair from behind, which is a functional
failure for a reference sheet. **Both controls stay user-facing regardless**, because low-VRAM
users need the choice.

**Turbo LOCKS the character; non-turbo VARIES it.** Fabio's observation, confirmed on this card's
runs: photoreal F wording at three seeds gives the SAME man under turbo and three visibly DIFFERENT
men without it. So non-turbo is a **variation lever** — how a user hunts for a face — not just a
quality setting, and that is a second reason it stays exposed. It also partly explains the small
between-arm wording deltas: every arm ran under turbo, against a locked character. 2k preferable where the card fits. The **seams at 2k-quality are ACCEPTED,
not a defect** — the sheet splits into three plates there where turbo keeps one continuous
backdrop, and Fabio's call is that the sheets still work as a reference, so that spec line is a
preference rather than a gate. Costs: 1k-turbo 33s · 2k-turbo 85s · 1k-quality ~105s ·
2k-quality 328s.

**The v4.1 regression is DONE and gate #1 is CLOSED (both 2026-08-19) — see below.** Next action is
the **head branch** (face detect selects the area, SAM3 union of `hair` + `face` + `hat` builds the
mask), then the Klein A/B. Run wording verdicts at 3-4 seeds, not one. Open calls 1-5 still stand;
all need the GPU, and the GPU needs the lease
(`mpi-lib/scripts/gpu_lease.py run -- <cmd>`, machine-global, one slot).

Recorded in validation.md and not to be lost again: **the character phrases of all six arms,
verbatim.** This session had to rebuild the four earlier ones from the bench's `/history` because
only their outcomes were ever written down, and that history dies on a bench restart.

## The prompt UI — DECIDED by Fabio, 2026-08-20

The enhancer stops being a hidden in-graph step and becomes a **user-facing two-field surface**.
This is a Flow with **three steps**.

| step | contents |
|---|---|
| **1 — start** | No media input for this flow. Either an N/A icon or the input section simply absent. |
| **2 — prompt (refine)** | Small **user-input** box on top → big **Enhance** button → large **enhanced-prompt** box the user can review and edit. |
| **3 — generate** | Small user input, **Enhance** button, **Generate** button. The enhanced prompt is **NOT shown here.** |

**The rules, all Fabio's, all decided:**

1. **Enhance is the only writer of the enhanced box.** Generate never enhances on its own.
2. **If the user never presses Enhance, only the user prompt is used** — it goes into the
   `[CHARACTER PROMPT]` hole raw. There is no silent enhancement.
3. **Editing the user prompt CLEARS the enhanced prompt.** In step 2 this must be visible
   immediately, so the user understands that editing their prompt discards the enhancement. In
   step 3, where the enhanced prompt is invisible, **the Enhance button changes appearance** to
   signal that the current prompt is not enhanced.
4. **Step 3's Enhance fills step 2's box.** One shared enhanced-prompt value, written from either
   step, displayed only in step 2. A user who wants to adjust what step 3 produced goes back to
   step 2 to edit it.
5. **The sidecar stores BOTH** the user prompt and the enhanced prompt. **Reuse injects the stored
   enhanced prompt verbatim and never re-enhances** — same principle as the existing reuse path.
6. **No seed is stored.** Considered and rejected by Fabio: the enhanced prompt is itself stored
   and injected verbatim, so the seed adds nothing, and nothing else in the app stores one.

**Why this shape, beyond the UI.** The character phrase is currently an invisible intermediate —
regenerated per dispatch, never shown, never stored. That costs reproducibility (the phrase moves
underneath a held image seed), repair (the v4.2 residual — ~2 in 8 outputs give the rear panel a
different hair colour — is unfixable by the user while hidden, and v4.3 proved more recipe wording
is not the answer), and the descriptor the brief's asset registry wants, since an asset is a PAIR
of image plus a phrase reused word for word. An editable, stored enhanced prompt is that phrase.

**The enhancer seed becomes load-bearing** and must be wired as an input on `TextGenerate`. Step 3's
loop is Enhance → Generate → Enhance → Generate, and without a seed input every Enhance returns the
same phrase. Measured: the same user text at seed 0 vs seed 1 returns a different ethnicity, hair
and wardrobe — a different person, not a rewording. The seed is driven internally; it is never a
user-facing field.

### What already exists, and what does NOT — checked 2026-08-20

- **The two graphs are already separate.** `krea2_t2i_only.json` contains **no `TextGenerate`** —
  the enhancer is its own workflow, `comfy_workflows/raw/qwen3vl_4b_prompt_enhancer.json`. The
  two-stage split this design needs is already the shape at the bench; the work is app-side.
- **The existing PromptBox Enhance is NOT this system and cannot be reused as-is.**
  `MpiPromptBox.js` `_runEnhance()` calls `el.injectPrompts()` with the result, **overwriting the
  prompt in place** — the user's original is destroyed, not kept beside it. It is also a **Cubric
  Prompt connector** call (`shell/connectorOps.js`, MPI-5), not the local qwen3vl enhancer. Only
  the *reuse-injects-verbatim* half has precedent (`js/utils/promptReuse.js`).
- **`enhancePrompt: false` in `js/data/promptControlDefaults.js` is a third, unrelated thing** — a
  per-model boolean control. Do not confuse it with either of the above.
- The enhancer graph carries the recipe as its baked default, so it runs standalone at the bench.
  The shipped recipe text is **v4.2** (prompts.md §2).

## The flow

| | |
|---|---|
| id / title | `character-sheet` / **Character Sheet** |
| `requiredModels` | `krea2` + `klein-4b` (klein only for the head removal) |
| `requiredDeps` | `face-yolov8n` — already hosted, declared here the way head-swap declares its LoRA |
| `mediaType` | `image` |
| inputs | a prompt; **no media slots at all** in v1 |
| output | one sheet |
| ratio | **fixed 8:5** — not a user choice. `1280×768` (1k) / `1792×1120` (2k), both already in `KREA2_RATIOS` and both ÷16-clean |

Declared `fields` (no component — MPI-531 shape):

| field | type | default | notes |
|---|---|---|---|
| `positive` | text | — | the character. Placeholder copy asks for who they are, wardrobe, age, hair, eyes, marks |
| `Input_Recipe` | radio ×4 | 1 Photoreal | Photoreal · 3D · Anime · Cartoon. **Renamed from `Input_Style`** (Fabio, 2026-08-19) — the switch picks a prompt RECIPE, so any other flow can borrow the same bank-behind-an-int pattern |
| `Input_Quality` | radio ×2 | **2k** | 1k `1280×768` · 2k `1792×1120` |
| `Input_is_Turbo` | toggle | **off** | the krea2 accelerator LoRA |
| `Input_Remove_Head` | toggle | **on** | the SAM3 + Klein pass |
| `Input_Lora_1..6` | lora rack | empty | the project LoRA slots. A user with a character LoRA loads it and describes only wardrobe, hair and face on top |

### The prompt review step — Fabio, 2026-08-19

**Why it exists.** The gear policy's third tier (user rules gear out → sheet wears none) was cut
because the regression showed the recipe cannot keep that promise (prompts.md §2). The honest
answer is to let the user see and edit the character description the enhancer wrote, rather than
instruct an LLM to omit things and hope. It generalises past weapons: *anything* the enhancer
invents becomes canon for every shot that character appears in, and this is where the user
catches it.

**It is not new architecture — it is the captioner shape, already shipped.** `Describe Image`
(MPI-310) is a text-only op end to end:

- the op declares `outputKind: 'text'` in `js/data/commandRegistry.js`
- the graph carries a `PreviewAny` titled `Output_prompt` (the MPI-242 contract) —
  `qwen3vl_4b_prompt_enhancer.json` has one, and the sheet graph gets its own pointed at the
  ASSEMBLED prompt
- `generationService.onComplete` branches on `outputKind` before the empty-media check, ends the
  job with no history item, and hands the string to `callbacks.onText`
- `js/utils/describeAction.js:66` then does `Events.emit('workspace:inject-prompts', { positive })`
  — **the text lands in the prompt box, editable**

So the flow gets a second op — "Write the character" — running
`qwen3vl_4b_prompt_enhancer.json`, which returns the description into the box for the user to
edit. Generating the sheet then takes the box **verbatim** into the `[CHARACTER PROMPT]` hole.
There is no enhance toggle anywhere, so double-enhancing is impossible rather than guarded
against.

**Optional, not the default path.** One-shot (enhance on, straight to sheet) stays the default;
the review is a button, exactly as Describe Image is today. Wire it in the `/mpi-add-flow` pass,
after the graph proves out — it costs a second op declaration, not a redesign.

## Build the graph by STRIPPING `krea2_t2i_template.json`

Simpler and safer than authoring fresh: the t2i branch, the tier switch and the enhancer group
are already proven in it. `comfy_workflows/raw/` is **user-owned** — Fabio does this in the
bench editor; the list below is the whole surgery.

> **SUPERSEDED.** A scripted version of this ran, produced an 82-node file, and was WRONG — the
> group list deletes the conditioning and the resolution. That file was removed. Fabio stripped
> the graph by hand instead; the result is `krea2_t2i_only.json`. Read `## Plan Drift` and
> `### What must survive the strip` below, not the group list under this note.

218 nodes / 10 groups today. **Delete these groups whole** (136 nodes):

`Edit` (40) · `Upscale` (27) · `Images` (21) · `Detailer` (19) · `Stitch Edit` (14) ·
`Depth` (9) · ~~`Loras` (6)~~ — **the LoRA rack is KEPT, see § The user LoRA rack STAYS.**

**Keep:** `Generation` (31), `Prompt Enhancement` (8), and the ungrouped spine (31 — it holds
`Input_is_Turbo` / `Set_turbo`, seed, W/H).

**`Styles` (12) splits — do not delete it whole.** It carries the prompt entry:

- keep `MpiText|Input_Positive`, `MpiText|Input_Negative`, `Set_positive text`, `Set_negative text`
- keep `MpiLoraModel|Input_Bypass_Filter_Lora` (`krea2filterbypass3`, baked at strength 1 in the
  template as shipped — dropping it is a behaviour change nobody asked for)
- delete `MpiStyleSelector|Input_Style_Selector`, `MpiStyleLoras`

The **accelerator LoRA is safe to lose with `Detailer` and `Upscale`**: the template carries
three copies of it (nodes `612`, `652`, and `440` in `Generation`), and `440` is the one the
t2i branch uses.

After the deletions every `Get_is edit` / `Get_is i2i` / `Get_is depth` switch in `Generation`
collapses to the t2i side — that is the point; resolve each one to its t2i input and delete the
switch rather than leaving it wired to nothing.

### The collapse worklist — audited off the stripped file, 2026-08-19

Exactly what the strip left dangling. Nothing else in the file is broken.

**Six `GetNode`s whose `SetNode` went with a deleted group** — each one is a branch that no
longer exists, so each resolves to a deletion, not a re-wire:

| orphan Get | was set in | reaches |
|---|---|---|
| `211 Get_Models` | Loras | — |
| `215 Get_img1` | Images | — |
| `490 Get_W` / `491 Get_H` | Upscale | — |
| `515 Get_Empty_latent_Resized` | Upscale | `561 MpiAnySwitch10` inputs `any_3`, `any_4` |
| `575 Get_has_mask` | Edit | `576 MpiIfElse` selector |

**Three dangling inputs:** `623 MpiReroute "detailer"`, `624 MpiReroute "upscale"` (both feed
`495 MpiAnySwitch10`), and `576 MpiIfElse.true`.

**Seven switches survive; five collapse:**

- `561 MpiAnySwitch10` — `any_1` `EmptyLatentImage` (t2i), `any_2` `VAEEncode` (i2i, dead),
  `any_3`/`any_4` orphan `515`. **Collapses to `any_1`.**
- `495 MpiAnySwitch10` — `any_1..4` one `Reroute`, `any_5`/`any_6` dead `623`, `any_7` dead
  `624`. **Collapses to that `Reroute`.**
- `576 MpiIfElse` — `true` dangling, selector is orphan `575`. **Delete, keep the `false` side.**
- `383` / `437 MpiIfElse` — pick between two `ClownsharKSampler_Beta`s off `382 GetNode`; this is
  the surviving turbo/tier split, **check `382` before touching either.**
- `619 MpiIfElse` — two live `VAEDecode`s off `620 GetNode`, same check.
- `241 MpiIfElse Input_enhance_prompt` — **keep**, it is the enhancer's own switch.

### Then add, in order

1. **DONE 2026-08-19.** Four sheet templates (`PrimitiveStringMultiline` `666`-`669`, titled
   `Recipe_Photoreal` / `Recipe_3D` / `Recipe_Anime` / `Recipe_Cartoon`) → `670 MpiAnySwitch`
   `Recipe_Select`, `select` ← `671 MpiInt` **`Input_Recipe`** (1-indexed, the head-swap
   `Input_Tier` pattern). Generated from the one skeleton in prompts.md §1 rather than typed
   four times — the Photoreal output is asserted byte-identical to the canonical block there.
2. **DONE 2026-08-19.** The hole: `672 StringReplace` `Sheet_Prompt` — `string` ← `670`,
   `find` = `[CHARACTER PROMPT]` (widget), `replace` ← `112 Input_Positive` **verbatim**.
   Its output feeds `658 Set_positive text` (old link `1386` deleted) and `673 PreviewAny`
   **`Output_prompt`**. No `241` any more — the enhancer left this graph, so what the box holds
   is what the hole gets, and `51 CLIPTextEncode.text` now reads `672` through `Get_positive text`.
3. **Swap the enhancer recipe.** Node `420`'s widget → the character-only system prompt (**v3**)
   in [prompts.md](prompts.md) §2. Keep the `<|im_start|>system` / `<|im_end|>\n<|im_start|>user`
   wrapper exactly — nodes `422` and `419` build the rest of the ChatML frame around it.
   Leave `58 TextGenerate.use_default_template` at `true`; it was measured inert.
3b. **The two scrub `RegexReplace` nodes**, between `423 StringReplace` and the hole — patterns
   in [prompts.md](prompts.md) §2. Not optional: the recipe cannot stop the model stating
   absences, and a stated absence is what makes Krea2 draw the thing.
4. **The head-removal branch**, behind `Input_Remove_Head`. Two stages: find the FRONT body's
   face, then take its head.

   **Why a face and not a head.** A face exists on exactly two panels — the portrait and the
   front body. The rear view has none. So detecting *faces* identifies the front body for free,
   with no assumption about which narrow panel is which. (This is Fabio's idea, 2026-08-19, and
   it retires the left-half rectangle that was here before.)

   **Never pick by detection index.** `SAM3_Detect` sorts its results by **confidence**, not
   size — `nodes_sam3.py:223`, `order = kept_scores.argsort(descending=True)`. "Face number
   two" is a confidence race that a third low-confidence hit reorders. Sort by area explicitly
   instead: Impact Pack ships `ImpactSEGSOrderedFilter` ("SEGS Filter (ordered)") with
   `target: area(=w*h)`, `order: ascending`, `take_start 0`, `take_count 1` → the smallest face,
   deterministically.

   - **Stage 1, detect faces.** `UltralyticsDetectorProvider` + `BboxDetectorSEGS` on
     `face_yolov8n.pt` — already a shipped dep (`face-yolov8n` in `assetDeps.js`, already on
     R2), and it emits SEGS directly, which is what the ordered filter eats. Fallback if it
     misses the small face: `SAM3_Detect` text `face` → `MaskToSEGS` (the two faces are
     spatially disjoint, so connected components separate them without `individual_masks`).
   - **Stage 2, face → head. REVISED BY FABIO 2026-08-19 — the mask is a UNION OF THREE
     SEMANTIC MASKS: `hair` + `face` + `hat`.**

     **Stage 1 is unchanged and still required — its output is a SELECTOR, not a mask.** The
     `face_yolov8n` detection plus the ordered filter still pick WHICH head is being operated on
     (the front body's, not the portrait's), and that picked region is what tells the pass where
     to inpaint. SAM3 then detects `hair`, `face` and `hat` to build the mask that is actually
     filled. So the face SEG selects the AREA; SAM3 produces the SHAPE. An earlier revision of
     this line implied the face detection was replaced — it is not.

     What is retired is using the face's **grown bbox as the mask itself**, and any box stamped
     over the head. Fabio's reasons, both from experience rather than theory:
     - **A face-only mask fails on any character wearing a hat.** Measured on the cowboy-movie
       work: inpainting a face under a hat required the hat in the mask too, or the edit fought
       the brim.
     - **Hair falling over clothing needs a PRECISE hair mask.** The anime character now on the
       bench has hair over the jacket, so anything coarser takes garment with it.
     - **Why not just stamp a square on the head:** the inpaint model rewrites everything inside
       the mask, so a box over the shoulders **destroys the clothing detail it covers and invents
       new detail in its place** — which breaks the one thing the sheet exists to hold constant.
     The three names are what SAM3's open-vocabulary text branch takes directly, so this is a
     three-detection union rather than new machinery — but that mapping is an inference to
     confirm at the bench, not Fabio's instruction. A character with no hat must degrade to
     hair+face without the empty detection zeroing the union.
     **Text and box are mutually exclusive on one `SAM3_Detect`** (`docs/masking-sam3.md`), so
     "head, inside this box" is never one node. Bare `hair` / `face` / `hat`, never `hair:1` —
     `:1` detects nothing (the `name:N` trap).
   - `GrowMask` — expand `24` at 2k, `12` at 1k.
   - Klein `klein-4b` inpaint, prompt fixed (prompts.md §3), mask-composited back so the rest
     of the sheet is never re-rendered (Higgsfield: an image never runs through a model twice).
5. Output the finished sheet only. Returning the pre-removal sheet as a second result is one
   node if Fabio wants it.

## Plan Drift

**2026-08-20, session 8 — THE ENHANCE BUTTON BUG, ROOT-CAUSED, NOT YET FIXED.** Fabio: "when I
press enhance, nothing happens... upon reusing the flow, I noticed that the character phrase box
gets filled." Both halves are the SAME defect, and the enhancer itself is innocent — it runs, the
op succeeds, `onText` fires and `_fieldValues[d.to]` receives the text. Only the LIVE DOM write
fails.

**The cause is one line.** `_writeFieldValue` (`MpiBaseFlow.js:763`) does:

```js
const inp = qs('.mpi-base-flow__field-text', wrap);
if (inp) inp.value = text;
```

But `.mpi-base-flow__field-text` is the **mount HOST `<div>`** (`declaredFields.js:340`), not the
control — the editable element is the `<textarea>` MpiInput renders inside it
(`.mpi-input__field--textarea`, confirmed live off the running app). So `inp.value = text` sets an
**expando property on a div**: no error, no exception, no log line, no repaint, clean exit. The
purest form of the silent-skip trap this repo keeps rediscovering.

**Every symptom falls out of that one line:**
- the phrase box stays empty after Enhance, while the value is really there;
- **the ENHANCE button goes GREY** — `_paintEnhance` computes `stale` off `_fieldValues[d.to]`,
  which IS filled, so it correctly switches to `--secondary`. The grey button was evidence the
  enhance SUCCEEDED, and it read as evidence of the opposite;
- reopening or reusing the flow shows the text, because the field is then rebuilt seeded from
  `_fieldValues` / `state.s_flowInputs`;
- **and the clear-on-edit path is broken the same way** — `_setFlowField` blanks `_fieldValues[to]`
  and calls the same `_writeFieldValue`, so a stale enhanced phrase stays on screen after the
  source prompt is edited. One fix, two behaviours restored.

**How to fix, and the design call to make first.** Do NOT just widen the selector to
`.mpi-base-flow__field-text textarea` — writing `textarea.value` behind MpiInput's back desyncs the
Primitive's own state, which is the same class of mistake one layer down. The right fix is to reach
the PRIMITIVE: keep the mounted instance (or expose `setValue` on the mounted `el`) so
`_writeFieldValue` calls the component's API. `_liveFields` stores the wrapper element today, so it
is the thing that has to change. Check what `MpiInput` already exposes before adding anything.

**Guard it.** A real-pixel probe is the only thing that catches this class: assert the TEXTAREA's
rendered value after a programmatic write, never that `_fieldValues` holds it — the state was right
the whole time. `tests/` cannot see the DOM, so this belongs in a desktop spec or a documented
playwright probe.

**2026-08-20, session 8 — TWO UI CHANGES REQUESTED BY FABIO, both approved, neither built.**

1. **Toggles become BUTTONS.** "Can we have MPI buttons for the toggles instead? Similar to how we
   have it in other places. The difference being you can actually use an icon and the name, so that
   you don't need labels on the top like you have now." Today `type: 'toggle'` mounts an
   `MpiCheckbox` plus a `field-label` span above it (`declaredFields.js:147-152`, 248-258). Change
   the `toggle` TYPE ITSELF rather than adding a second type — one vocabulary, one renderer — and
   make the icon OPTIONAL so ltx-extend / foley / upscale keep working label-only until someone
   gives them icons. Suppress the top label for `toggle` the way `button` already is
   (`f.type !== 'button'` at line 148 becomes a set).
2. **A LoRA button that opens a LoRA panel.** Fabio: "an extra button that opens the LoRAS panel,
   and perhaps add a new route for flow LoRAS." The graph ALREADY carries `Input_Lora_1..6`
   (`MpiLoraModel` nodes, present in the converted 101-node graph) and `comfyController` already
   routes `Input_Lora_N` through its dedicated LoRA-object branch (the MPI-219 case,
   `comfyController.js:1424`). What is missing is entirely UI: **`declaredFields.js` has no `lora`
   type — grepped, and NO shipped Flow declares a rack.** plan.md's older claim that
   `flow_ltx_extend` and `flow_ltx_foley` "already ship the same six-slot rack" is **WRONG**: they
   carry the graph nodes, not the FlowDef fields. `MpiModelSettings` has a rack (slots, strengths,
   bypass) but it is a Compound bound to model state, not liftable as a field. Open sub-decisions:
   how many slots show by default, and whether each slot exposes `strength_model`.

**2026-08-20, session 8 — BOTH open decisions are ANSWERED. Neither is open any more.**

**(1) The 1k/2k control SHIPPED as option 1, the switch bank.** Fabio: "MpiAnySwitch sounds
good because the next workflow for creating props and animals will need four different
resolutions." So the banks are built at `any_1..any_5`, not as a boolean — MPI-586 gets four
arms off the same shape with no second answer. In `raw/flow_character_sheet.json`: `676`/`677`
retitled `W_1k` (1280) / `H_1k` (**800**, was 768), new `768 W_2k` (1792), `769 H_2k` (1120),
`770 Input_Quality` (MpiInt, 1), `771 Width_Select` + `772 Height_Select` (MpiAnySwitch) feeding
`Set_W`/`Set_H`. Converted 96 → **101 nodes**, `validate-injection-rules` clean, raw committed by
`sync-raw-workflows.mjs` as `70dc98cb`. FlowDef gained an `Input_Quality` `radio` (columns 2,
default 1). The portable half is now a doc: [ui/switch-bank-fields.md](../../../docs/playbooks/add-flow/ui/switch-bank-fields.md).
Retitling `Input_Width`/`Input_Height` is free here — `smoke-workflows.mjs` snaps those titles
down for a smoke run, but its own comment (line 1068) says **no `flow_*.json` is ever reachable
by its matrix**, so the snap never applied to this graph.

**(2) The other four FLUX ratio rows: DECLINED, and the earlier recommendation was WRONG.**
Fabio pushed back — "if the resolutions we have for Flux are indeed the best image-producing
ones and we are now changing them to something else, then we are changing a commodity for a
worse output" — and asked for the investigation. It confirms him: **eight of the nine
`FLUX_RATIOS` values are exact entries in SDXL's 40-pair training-bucket list** (SDXL paper
Appendix I, all ÷64, all ≈1024²), including the `1280×768` / `768×1280` pair that was corrected.
The LABELS were fitted to the buckets afterwards, which is the whole reason 3:4 is really 7:9.
`SDXL_RATIOS` is a different hand-pick from the same list, which is what proves the provenance.
Worse, the proposed "fixes" all leave the bucket set and **`1280×720` is not even ÷32**, which
[BFL's own FLUX API](https://docs.bfl.ai/api-reference/tasks/generate-an-image-with-flux1-%5Bdev%5D)
requires (÷32, 256–1440). The 8:5 pair KEEPS `1280×800` — Fabio's call once the provenance was
known — because it is the one row where the bucket bought nothing (5:3 is not a shape anyone
asks for) and 1280×800 is ÷32-clean at 1.02 MP. Recorded in the `ratios.js` comment so this
cannot be re-opened as a "bug".

**The one thing the investigation does NOT establish:** the buckets are SDXL's, and this table
feeds flux, chroma, klein and krea2 — none of them SDXL. Nobody has measured whether a bucket
value beats a non-bucket one on any of those four. Both the labels and the pixels rest on an
unmeasured assumption; the pixels simply have the better provenance.

**2026-08-20 — `requiredDeps: ['face-yolov8n']` is WRONG and was dropped.** `## The flow` declared
it "the way head-swap declares its LoRA". The analogy fails: `getUniversalWorkflowDepIds()`
(`routes/shared.js:704`) returns **every `type:'custom_nodes'` dep PLUS every `engineAsset:true`
weight**, and those install with the ENGINE, belonging to no model. `face-yolov8n` is
`engineAsset: true` (and `bakedOnPod: true`); so are `sam3-multiplex` and — checked because
nothing declares it anywhere — `ComfyUI-Impact-Subpack`, which owns `UltralyticsDetectorProvider`.
Head-swap's `qwen-lora-headswap` is neither a custom_node nor an engineAsset, which is exactly why
it DOES need declaring. Declaring it anyway is not harmless: `_flowDepStatusCache` is empty until
the first sync and `flowAvailability` fails CLOSED, so the flow would read unavailable on open for
a weight the engine already guarantees. **Every node pack the 96-node graph uses is covered**:
RES4LYF + Impact-Pack via krea2, `comfyui-inpaint-cropandstitch` via klein-4b, Impact-Subpack and
the detectors via the engine.

**2026-08-20 — the 1k / 2k quality control CANNOT BE DECLARED, and this was not foreseen.**
`## The flow` lists `Input_Quality` as a radio x2. The graph has **two** nodes — `676 Input_Width`
and `677 Input_Height` (both feeding `560 EmptyLatentImage` AND `756 SolidMask`) — and a declared
field emits exactly **one** value into **one** param. `mapTo` does not help: it is a linear range
map, one number in, one number out (`declaredFields.js:83`). So one choice cannot set two nodes.
Three ways out, none of them free, and the choice is Fabio's:
  1. **One graph node** — an `Input_Quality` `MpiInt` behind two `MpiAnySwitch` banks for W and H,
     which is the pattern `Input_Recipe` ALREADY uses three nodes away. Zero app code. Needs a
     raw/ edit.
  2. **A new field type** that lets an option carry a param MAP rather than a scalar. Portable —
     every later Flow wanting a resolution gets it — but it is frame work in `_collectInputs`
     (`MpiBaseFlow.js`), which a peer session holds.
  3. **Ship without it**, which is where the flow stands now: baked `1280x768`.
**And a real discrepancy inside the same row:** `1280x768` is **5:3 (1.667)**, not the 8:5 the card
is built on; `1792x1120` IS 8:5 (1.600). `js/utils/ratios.js:30` mislabels the 1k pair "8:5" and
plan.md copied that label. So the two quality options would return **different shapes**, on a
three-panel layout proven at one. A true 8:5 1k is `1280x800` (both /16-clean). Not fixed here —
`ratios.js` is shared and out of this card's blast radius.

**2026-08-19 — "adopted into the recipe" was not the same as "the recipe produces it".** The F hair
shape was adopted, applied to prompts.md §2 categories 2 and 4, and the plan then carried it as
settled with only a regression owed. The regression found category 4 was **being ignored 6 times in
8**. A wording adopted on hand-written character phrases is a hypothesis about the enhancer until
the enhancer is run — arms E and F proved the shape works on Krea2, not that a 4B will write it.
Treat every future recipe-side adoption the same way: the arm that measured the effect and the
recipe that has to reproduce it are two different tests.

**2026-08-19 — the two-seed rule earns its keep on TEXT too, not just images.** The n=1 rule was
written from image arms. Mid-pass, seed 0 said v4.2 cost the main clause a hair description; seed 1
said 4 of 4 and the "cost" vanished. Sampling at temperature 0.5 varies text enough to invent a
verdict, so the runner now takes `SEED` and every arm runs twice.

**2026-08-19 — the seven-group strip list is WRONG, and it fails silently.** Two of the seven
groups carry nodes the t2i path cannot run without. Found by tracing upstream from the outputs
after the collapse pass swept `Set_positive text` and `Set_negative text` as unread.

1. **`Edit` (40) does NOT delete whole — it builds the shared conditioning.** `51` and
   `282 CLIPTextEncode` read `Get_positive text` / `Get_negative text`; `294`/`302 MpiIfElse`
   pick plain-encode vs `Krea2EditGroundedEncode`; `143 ToBasicPipe "High"` and
   `290 ToBasicPipe "Balanced"` feed `621 MpiIfElse` on `Get_turbo` → **`253 Set_Models`**. And
   `77 FromBasicPipe` — inside the KEPT `Generation` group — reads `Get_Models`. Delete `Edit`
   and every sampler loses positive, negative and vae at once.
2. **`Images` (21) does NOT delete whole — it holds the resolution.** `75 Input_Width` /
   `74 Input_Height` → `458 Set_W` / `459 Set_H` → `560 EmptyLatentImage`. Delete it and the
   flow has no resolution, which is the fixed 8:5 the whole card is about.

**Why "all links resolve" said the strip was clean.** `SetNode`/`GetNode` link by NAME, not by
link id. A `Get` whose `Set` was deleted leaves a structurally valid graph that cannot run — so
link-integrity checks are worthless here, and so is the group census that matched the plan's
counts exactly. The post-strip audit *did* list `211 Get_Models`, `490 Get_W` and `491 Get_H` as
orphan Gets; they were then classified as dead branches without tracing their consumers, which
is the mistake that let the collapse pass run on a graph that was already decapitated.

**Corrected method: strip by REACHABILITY, not by group box.** Resolve the flow's constants
(`is edit` = `is i2i` = `is depth` = `has_mask` = `has_img2` = false, `wf_type` = t2i), walk
upstream from `442 SaveImage`, `494 Output_Image` and `242 Output_prompt` following only the
selected side of each `MpiIfElse` / `MpiAnySwitch`, treat `Get` → `Set` as an edge, keep the
closure and delete the rest. This cannot miss a Set/Get spine, and it produces the collapse for
free — an unselected switch arm simply never enters the closure. The group census stays useful
as a cross-check on the result, not as the instruction.

**`flow_character_sheet.json` was removed** — the scripted strip left it at 50 nodes with no
conditioning and no resolution, so it was deleted rather than left as a trap to reopen. The
base is now Fabio's hand-stripped `krea2_t2i_only.json`.

**2026-08-19, Fabio's call: he strips it in the bench editor, and prompt enhancement becomes its
own workflow.** Both right. The editor shows what is still wired while the cut happens, which is
the thing a group-box script cannot see; and splitting the enhancer out means the sheet graph
carries no LLM at all. The keep-list and the enhancer spec below replace the seven-group
instruction above — **that list is retired, do not follow it.**

### What must survive the strip — the traps, not a node dump

The t2i path is easy to cut into by accident because three of its pieces sit in groups that are
named after something else. Everything here was traced in the file, not guessed.

| must survive | why | where it hides |
|---|---|---|
| `51` + `282 CLIPTextEncode` | the only positive/negative encoders on the t2i path | `Edit` |
| `143 ToBasicPipe "High"` + `290 "Balanced"` | the two conditioning pipes | `Edit` |
| `621 MpiIfElse` (on `Get_turbo`) → `253 Set_Models` | picks between those two pipes | `Edit` |
| `75 Input_Width` / `74 Input_Height` → `458 Set_W` / `459 Set_H` | the ONLY resolution source | `Images` |
| `245 Input_Bypass_Filter_Lora` | baked at strength 1; dropping it changes output | `Styles` |
| `440 Accelerator Lora` | the copy the t2i samplers use | `Generation` |
| `Input_Lora_1..6` | **kept deliberately** — see below | `Loras` |

### The user LoRA rack STAYS — Fabio, 2026-08-19

The earlier line here said a Flow runs clean with no project LoRAs. **Reversed.** Fabio: a user
who already has a character LoRA should be able to load it and then describe only the wardrobe,
hair and face on top. That is a real division of labour — **the LoRA carries identity, the sheet
carries the layout** — and it turns the flow into a way to build a reference sheet for a
character the user has already trained, not only for one invented from a description.

It also sits beside the card's LoRA-free bet rather than against it: prompt-only stays the
default path, the rack is an option for people who already have the weights.

Needs no new machinery. `flow_ltx_extend` and `flow_ltx_foley` already ship the same six-slot
rack, and `comfyController.js` routes `Input_Lora_N` through its dedicated LoRA-object branch
(the MPI-219 case) rather than the generic `_inject`. The FlowDef just has to declare the slots.

`77 FromBasicPipe`, inside `Generation`, reads `Get_Models` — so `253 Set_Models` in `Edit` is
load-bearing for **every sampler's positive, negative and vae**. `560 EmptyLatentImage` reads
`Get_W`/`Get_H`, so `Images` is load-bearing for the fixed 8:5.

**The sampler topology, confirmed in the file** (both switches named `is edit` merely skip the
second stage, so in t2i BOTH stages run):

- turbo → `72` (8 steps) → `162` (3 steps, denoise 0.19) → `160 VAEDecode`
- quality → `311` (25 steps) → `436` (2 steps, denoise 0.3) → `312 VAEDecode`
- `619 MpiIfElse` on `Get_turbo` picks between those two decodes — **this is the real turbo
  switch, keep it**
- `437 MpiIfElse` has no consumer at all (it fed the deleted groups) — delete
- `383 MpiIfElse` collapses to its false side, `162`

Safe to lose with their groups: the `Krea2EditGroundedEncode` pair, `Krea2ControlApply` /
`Krea2ControlLoRALoader` (Depth), `InpaintCropImproved` / `InpaintStitchImproved` (Stitch Edit),
`MaskDetailerPipe` (Detailer), `UltimateSDUpscale` (Upscale), `Input_Lora_1..6` (Loras), and the
image loaders in `Images` — but **not** `Input_Width` / `Input_Height` beside them.

**Drop the whole `Prompt Enhancement` group** (`58`, `418`, `419`, `420`, `422`, `423`, `241`) —
it moves to the workflow below. Keep `69 CLIPLoader`: it is also Krea2's own text encoder, not
just the LLM's. Keep a `PreviewAny` titled **`Output_prompt`**, but wire it to the **assembled**
sheet prompt (after the `[CHARACTER PROMPT]` StringReplace), so what the app records is what
Krea2 actually saw — that is the MPI-242 contract and it is what Reuse Prompt reads.

### The enhancer workflow — `flow_character_enhance.json`, ~10 nodes

Text only: no UNET, no VAE, no sampler, so it makes no image, costs one 4B pass and holds almost
no VRAM. Same shape as the shipped `image_descriptor.json`.

| node | title | widget values |
|---|---|---|
| `CLIPLoader` | — | `qwen3vl_4b_abliterated_fp8_scaled.safetensors`, type `krea2`, device `default` |
| `PrimitiveStringMultiline` | — | the v4 recipe, [prompts.md](prompts.md) §2, verbatim including the `<\|im_start\|>system` first line and `<\|im_start\|>user` last line |
| `MpiText` | **`Input_Positive`** | empty — the user's words |
| `StringConcatenate` | — | `string_a` = `\n`, `string_b` ← `Input_Positive`, delimiter empty |
| `StringConcatenate` | — | `string_a` ← recipe, `string_b` ← previous, delimiter empty |
| `StringConcatenate` | — | `string_a` ← previous, `string_b` = `\n<\|im_end\|>\n<\|im_start\|>assistant`, delimiter empty |
| `TextGenerate` | — | prompt ← previous, clip ← CLIPLoader, `max_length` 512, sampling on, temp `0.5`, top_k `64`, top_p `0.95`, min_p `0.05`, rep_pen `1.05`, seed `0`, presence `0`, thinking `false`, `use_default_template` `true` |
| `StringReplace` | — | find `\n`, replace empty |
| `RegexReplace` | scrub-negation | pattern + replace in [prompts.md](prompts.md) §2 |
| `RegexReplace` | tidy | pattern + replace in [prompts.md](prompts.md) §2 |
| `PreviewAny` | **`Output_prompt`** | — |

Wire it exactly in that order. The three `StringConcatenate`s are the ChatML frame and their
order is load-bearing; the two `RegexReplace`s must sit AFTER `StringReplace`, not before.

**`Input_enhance_prompt` disappears as a field.** The button enhances, the result lands in the
prompt box, and the sheet run takes the box verbatim — so there is no toggle and no way to
double-enhance. This is why the sheet graph needs no `241 MpiIfElse`.

## Open calls — bench, when the GPU frees

1. **Neutral pronouns** (prompts.md §1 diff). The one unproven edit to a prompt Fabio has run.
2. **Does `face_yolov8n` see the small face at all?** At 8:5 the two body panels are narrow, so
   the front face lands around 20-40 px at 1k. **Fabio, 2026-08-19: expects this to be fine —
   he has seen the detector pick up smaller.** Logged as a confirm-in-passing, not a risk. If
   it ever does miss, run the detection pass at 2k or fall back to the SAM3 text route.
   Front-vs-back itself needs no classifier: only the front body has a face.
3. **Klein prompt vs the no-prompt remove op** (`docs/models/klein/removal.md`) — A/B in the
   same pass.
4. **Length.** Template ~215 words + character 45-80 = ~280, over the 60-180 the krea2 recipe
   targets and above the 201-word p75 of the real-prompt corpus. Fabio's template is proven at
   that length, so this is a watch item, not a change.
5. **`krea2-nsfw` only.** A user with just the NSFW card fails the `requiredModels: ['krea2']`
   gate. Decide whether either card satisfies it.

## Definition of done

- Sheet generates at 8:5 2k with the layout intact: big 3/4 portrait right, two full bodies
  left, one grey backdrop across all three, same character in all three.
- Head removal leaves clothes and collar, backdrop continuous, and the rest of the sheet
  byte-identical outside the mask.
- All four styles return their medium and keep the catch-light.
- The 10/10 stress test from the brief: ten generations, different poses and light,
  recognisable every time, tested next to another character.

## Not in v1 — deliberately

Reference-photo input · the ~20-image LoRA-training sheet (already out of scope, see brief) ·
candidate batches for "pick the believable face" · the location sheet · the asset registry.
