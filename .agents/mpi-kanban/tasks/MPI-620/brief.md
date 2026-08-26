# MPI-620 — Scribble: draw on a blank canvas, SDXL renders it

**Run `/mpi-add-flow`** — it enforces `docs/playbooks/add-flow/`. Graphics afterwards via
`/mpi-flow-graphics`.

Carded 2026-08-25 from the Draw It In brainstorm. Draw It In is being rebuilt Klein-only
(see the sibling rebuild card), which deletes its SDXL + ControlNet render phase. **This flow
is where that half goes to live**, and it is a better home for it: the render phase was always
a general-purpose scribble-to-image engine wearing a photo-insertion costume.

Fabio, 2026-08-25: *"let's just make sure that we don't lose the SDXL information."*

## The shape

| Step | Kind | What it collects |
|---|---|---|
| 1 | ratio | aspect ratio → the canvas size the user draws on |
| 2 | `paint` | the drawing, **on a blank white canvas**, plus the prompt beneath it |
| last | run | `Input_Control_Net` (drawing type) + `Input_Control_strength` (follow the drawing) |

**No input media at all.** The user never uploads anything. That is the flow's whole
character — it starts from nothing.

Fabio's framing of what it is for: *"users to create anything, really: new characters,
scenarios, boards for their stories, whatever."*

## What it reuses — this is most of the flow

Lift wholesale from `comfy_workflows/flow_draw_it_in.json` nodes 17–27, which are already
proven and already tuned:

- both preprocessor arms — `ScribblePreprocessor` + `CannyEdgePreprocessor` behind two
  `SetUnionControlNetType` banks, switched by `MpiAnySwitch(Input_Control_Net)`
- the ONE `ControlNet-Union-ProMax-SDXL.safetensors` loader every SDXL card already declares
- **`Input_Control_strength` with its remap intact** — `MpiFloat(1)` →
  `MpiNormalizeValue(0-1 → 0-0.5)` → `ControlNetApplyAdvanced(end_percent 0.569)`. Do NOT
  re-derive this. Shipping it as 0-1 at `end_percent 1` gave double the app's max strength
  held to the final denoise step, and Fabio hit it immediately (*"lines that look like poop"*).
  Read the long comment on the field in `flowsRegistry.js` before touching any number here.
- sampling off the SDXL Realistic template — `lcm` / `simple`, 7 steps, cfg 1.5
- the five-model render slot (`sdxl-realistic`, `sdxl-nsfw`, `ill-anime-beauty`, `ill-anime`,
  `pony-mix`) with `loras: true`, and the copy rule that says **TONAL, never "structured"**
  for the canny arm

## What it does NOT need

`rembg` / `RemoveBackground`, the scale-and-paste chain, the box step, `InpaintCrop`/`Stitch`,
LanPaint, Klein, and the whole blend phase. Roughly 55 nodes → ~15.

**Nor the isolate-on-white suffix (node #18).** That suffix exists to produce a clean cutout
for pasting; this flow's output IS the image. **MPI-618 therefore does not apply here** — do
not port that string across. Whatever framing guidance this flow wants is a different problem
with a different answer.

## The one piece of genuinely new work

`MpiStepPaint` sizes and displays its canvas from `props.media?.url`
(`MpiStepPaint.js:609`). With no uploaded photo there is no URL, so it needs a fallback: a
blank canvas at the ratio chosen in step 1.

Two sub-questions the plan session must answer, neither guessed:

1. **Where does the ratio live?** A dedicated step kind, a `fields` step (`FRAME_KINDS`
   already supports media-less steps — `stepKinds.js`), or a flow-level field. The constraint
   is that step 2's canvas has to READ it, which is a cross-step dependency the frame may not
   express today. Check before designing.
2. **Does `composePaintLayer` still return the right thing** when there is no source image to
   be "at the resolution of"? Today it returns the layer ALONE at the photo's resolution.
   Here the layer IS the image.

Everything else is a descriptor plus a workflow.

## Naming

Fabio's name: **Scribble**. Watch the collision — the existing flow's `id` is
`scribble-object` and its op is `flowScribObj` (kept deliberately when "Scribble to Object"
was renamed to "Draw It In", because gallery cards carry the `FLOWSCRIBOBJ_` prefix). Pick an
`id` and op key that cannot be confused with those at a glance.

## Definition of done

1. The flow renders a drawing from a blank canvas at a chosen ratio, on at least two of the
   five model arms (one realistic, one anime) — the anime arm matters because Draw It In's
   Klein rebuild abandons it, and this flow is where those users land.
2. Both preprocessor arms produce visibly different, on-brief results from one drawing.
3. `npm test` **and** `npm run test:desktop`.
4. Live run in the app, not validation alone.

---

## Open question 2 ANSWERED 2026-08-25 — the output path needs no media at all

Traced in code, no GPU needed.

**`composePaintLayer(value)` is already media-independent.** `stepKinds.js:151` registers it as
`paint: value => composePaintLayer(value)` with the comment stating it outright: *"The value
already carries the layer and the source's natural size, so this needs no media — the argument
is kept for the shared signature."* The body (`MpiStepPaint.js:146`) reads only `value.paint`
and `value.size.{w,h}`. Nothing reaches for the photo.

So does everything else downstream: the brush, `PaintManager`, undo, the reported value.

**The media dependency is TWO lines, both on the display side:**

| line | what it does | Scribble needs |
|---|---|---|
| `MpiStepPaint.js:609` | `props.media?.url` → `imgEl.src`; falls back to `''` and simply never loads | a white canvas at the chosen ratio |
| `MpiStepPaint.js:588` | `_natural = { w: imgEl.naturalWidth \|\| 1, h: ... }`, set in the image's `load` handler | `_natural` seeded from the ratio instead |

So this is a **value-source swap, not a new component.**

**The trap — and it is silent.** With no media, no `load` fires, `_natural` keeps its `|| 1`
fallback, and `size` reports `{w:1, h:1}`. That passes `composePaintLayer`'s `w > 0 && h > 0`
guard, so the flow gets a **1×1 PNG** and runs. No error, no warning, a generation that
produces nothing anyone asked for. Whatever seeds `_natural` for this flow must be proven to
run before the first `_report()`, not assumed.

## Open question 1 — still open, but narrowed

The ratio's only job is to seed `_natural`. That is a single `{w, h}` handed to step 2 before
it reports, so the question is purely **where that value comes from**, not how the canvas
works.

`FRAME_KINDS` already supports a media-less `fields` step (`stepKinds.js:64`), and its values
live in the FLOW-level store rather than `stepValues` — which is the store a later step can
actually read. That is the promising route: a `fields` step (or a plain flow-level field)
holding the ratio, read by the paint step at mount.

Still to confirm: whether a gizmo step can read a flow-level field at mount time. The frame
collects `{ [role]: value }` per step and a kind *"never learns which flow hosts it"*
(`stepKinds.js` header), so a cross-step read may not be expressible today. **Check that
before designing** — it is the difference between a FlowDef change and a frame change.

---

## SETTLED DESIGN — 2026-08-26

Everything above this line was written before the graph was traced. Two of its premises turned
out to be wrong; this section supersedes them. Read this first.

### The brief above is STALE in two places

1. **"Lift `flow_draw_it_in.json` nodes 17–27"** — MPI-621 (`249bd357`) already landed the Klein
   rebuild. That file at HEAD is 35 Klein nodes with no preprocessor, no `SetUnionControlNetType`,
   no `ControlNetApplyAdvanced`, no `MpiNormalizeValue` and no SDXL loader. Node 17 at HEAD is
   `Input_Positive`, node 26 is `Input_Seed` — the numbers no longer address the nodes the brief
   means. Fabio's *"let's just make sure that we don't lose the SDXL information"* had therefore
   already half-happened. The 68-node original is recovered from **`fe525d8e`** and preserved on
   this card as `recovered_sdxl_graph.json`.
2. **"`MpiNormalizeValue(0-1 → 0-0.5)`"** — the shipped value was **0.6**, and 0.5 is the value
   Fabio measured live as *not following the drawing at all*. See § The ceiling below.

### Source graph — the SDXL t2i template, not Draw It In

Fabio's call, 2026-08-26, and it is the better source: `t2i_sdxl_realistic.json` (86 nodes)
already carries the whole ControlNet apparatus, the LoRA rack, and `Input_Width`/`Input_Height`.

> **TRAP — do NOT prune `comfy_workflows/raw/sdxl_t2i_template.json` in place.** Its `_template`
> suffix routes it to a **generator**, and it is the single source that produces BOTH shipped
> runtime workflows `t2i_sdxl_realistic.json` AND `t2i_sdxl_nsfw.json`. Pruning it would gut the
> SDXL model cards, not build a flow. **Copy it to a bare-name raw file first** —
> `comfy_workflows/raw/flow_blank_canvas.json` — because a bare name routes to a direct runtime
> file, which is the flow case.

What the template already has, by node id:

| What | Nodes |
|---|---|
| Control select (1=openpose, 2=depth, 3=scribble, 4=canny) | `1624` `Input_Control_Net`, switches `1629` (preprocessor) + `1623` (bank) |
| Preprocessor arms | `1620` openpose, `1602` depth, `1617` scribble, `1615` canny |
| Union banks | `1576` openpose, `1625` depth, `1626` hed/pidi/scribble/ted, `1627` canny/lineart/anime_lineart/mlsd |
| Strength chain | `1622` `Input_Control_strength` → `1621` `MpiNormalizeValue` (0.5) → `1578` `ControlNetApplyAdvanced` (`end_percent` 0.569) |
| LoRA rack | `1535`–`1540` `Input_Lora_1..6` |
| Sizing | `1633` `Input_Width` / `1634` `Input_Height` → `1455` `EmptyLatentImage` |
| Drawing input | `1640` `Input_Image` — `MpiLoadImageFromPath`, `block_if_empty: true`, already path-reading and self-gating |

### The title contract — what the app WILL and WON'T inject

`_buildParams` (`commandExecutor.js:609`) emits **`Input_Positive`, `Input_Negative`,
`Input_Negative_Audio`, `Input_Seed` on every run, unconditionally**, whatever the flow declares.
Injection silently skips a title with no node. That asymmetry is the whole of the table below.

| Title | Action | Why |
|---|---|---|
| `Input_Positive` (1472) | **keep** | flow declares a `positive` field |
| `Input_Negative` (1473) | **RETITLE away** | see § The negative — keeping the title wipes the bake on every run |
| `Input_Seed` (1599) | **keep** | always emitted |
| `Input_Control_Net` (1624) | **keep** | the drawing-type radio |
| `Input_Control_strength` (1622) | **keep** | the follow-the-drawing slider |
| `Input_Width` (1633) / `Input_Height` (1634) | **keep** | this is where the ratio lands — no `GetImageSize` needed |
| `Input_Image` (1640) | **keep** | the paint layer arrives here |
| `Checkpoint` (1462) | **RETITLE → `Input_Base_Model`** | `modelParams` selects the per-arm checkpoint through this title; `ckpt_name` is on the injector spray list (`comfyController.js:1376`), so a plain `Input_Base_Model` key writes it. Draw It In titled node 12 exactly this way |
| `Input_Lora_1..6` (1535–1540) | **RETITLE → `Input_Lora_Phase1_1..6`** | see § LoRAs |

### LoRAs (Fabio: *"this is gonna have loras"*)

`_buildParams` emits `Lora_Phase<N>_<i>` per declared phase, plus — **phase 1 only** — the flat
compatibility key `Lora_<i>`. So the template's existing `Input_Lora_1..6` *would* fill correctly
for a single-phase flow. **Retitle anyway.** The code comment states no flow with a declared rack
is on the flat form any more (`flow_character_sheet` was the last, phase-titled by MPI-610), marks
the line *"Drop this line once no flow graph has flat nodes"*, and warns that **a graph carrying
BOTH forms takes the same rack twice**. Shipping flat would resurrect a compat path the codebase
is retiring.

Declare `loras: true` on the **slot**, never as a flow-level `settingsModel` — the rack is the
model's own settings, so it follows whichever card the user picked. All five candidates
(`sdxl-realistic`, `sdxl-nsfw`, `ill-anime-beauty`, `ill-anime`, `pony-mix`) are verified
flat-slot with no `loraStages`, so none trips the *"staged-LoRA model; skipped"* bail.

### The negative — BAKED, not exposed (Fabio, 2026-08-26)

```
blurry, (lowres:1.2), (worst quality:1.4), (low quality:1.4), (bad anatomy:1.4), bad hands, multiple views, jpeg artifacts
```

Set as the value of node `1473`, **retitled away from `Input_Negative`** (Draw It In used
`MpiText | Edit Guardrails` for the same dodge). `CLIPTextEncode` parses the `(term:weight)`
syntax natively. The FlowDef declares **no** `negative` field.

> **This is a live bug we found, not a hypothetical.** Draw It In's node 19 was titled
> `Input_Negative` and held a baked `"blurry, low quality, watermark, text, multiple objects,
> cropped"`, wired through to the sampler. Because the FlowDef declared no `negative` field,
> `payload.negative` was always `undefined`, so `Input_Negative: ''` was injected over it on
> **every single run**. Every Draw It In render ever made ran with an empty negative. Nothing
> failed and nothing logged.
>
> The add-flow README documents this trap for `Input_Positive` only. It generalises to all three
> unconditional titles — `Input_Positive`, `Input_Negative`, `Input_Negative_Audio`. **Fix that
> playbook line when this card closes.**

### The flat-white composite MUST be carried over — the template has no equivalent

In the template the preprocessors read `Input_Image` (1640) **directly**, because that input is an
opaque photo. Scribble's input is the paint gizmo's **RGBA layer**, whose RGB is undefined wherever
alpha is 0. Fed straight to `ScribblePreprocessor` it reads the transparent region as black, so a
dark drawing on nothing yields a near-empty or inverted hint.

Carry the three nodes from the recovered Draw It In graph and wire the composite's output into the
preprocessors in place of 1640's direct image link:

- `EmptyImage` (5) — `color: 16777215` (white), sized from the paint layer
- `InvertMask` (3) — off the loader's alpha
- `ImageCompositeMasked` (6) — paint over white

### The ceiling — DEAD SECTION, superseded 2026-08-26

**Everything this section argued is moot and its conclusion was WRONG. Do not act on it, and do
not re-open the argument without a fresh live sweep.**

It argued for raising `output_max` to **0.6** on the reasoning that 0.5 "did not follow the
drawing". Fabio's three live `flowScribble` runs showed the OPPOSITE failure: the drawing was
followed TOO literally — red terrain strokes came back as physical white road markings and
barriers across the cliff face. That is the ink-as-edges failure Draw It In's own history records
at high strength. Raising the ceiling would have made it worse.

Moot in any case: the flow moved to EDIT MODELS and the ControlNet is gone, so there is no
`output_max`, no `MpiNormalizeValue` and no arm-pruning bar to clear.

**`tests/flow-model-choice.test.cjs` keeps `CEILING` EMPTY.** MPI-621 emptied it explicitly "NOT
because the rule was relaxed", and nothing here re-earns an entry.

### Open question 1 — ANSWERED: the ratio lives on the paint step itself

The cross-step dependency the brief worried about does not need to exist.

A **gizmo step's own declared `fields`** seed into `_stepValues[role].fields` at SETUP
(`MpiBaseFlow.js:381-393`) and that object is handed to the gizmo as `props.value` at mount — so
the ratio is readable **before the first `_report()`** with zero frame plumbing. The frame already
calls `el.onField(id, val)` on a step-field change (`MpiBaseFlow.js:1326`), with a comment naming
*"a ratio lock"* as the use case.

A **flow-level** field would NOT work: mount props are `{media, step, value, onChange}` and
`_fieldValues` is not among them.

No new field type needed — `declaredFields.js` supports `select` and `radio`. The ratio must emit
**SDXL-native buckets** (1024x1024, 1152x896, 896x1152, 1216x832, 832x1216) straight into
`Input_Width`/`Input_Height`.

### App-side work — three touch points, and the brief only caught one

Zero-media flows already work end to end (`character-sheet` has no `inputSchema`; step 0 renders
*"This flow needs no input media."*).

1. `MpiBaseFlow.js:1284` — `_buildStepSlide` refuses to mount a gizmo when `_mediaForRole(role)`
   is null, printing *"Add the image for this step on the first step."*
2. `MpiBaseFlow.js:2211` — `_deriveRunMedia` does `if (!media) continue`, so with nothing uploaded
   the painted layer never becomes media at all. **Second half of the same blocker, easy to miss.**
3. `MpiStepPaint.js:588` — ALL init (`_natural`, `paint.init`, `undo.clear`, `_syncCanvasSize`,
   `_refit`, restore, `_draw`, `_report`) sits inside the `imgEl` `load` handler, which never fires
   with no url. Extract `_initSurface(w, h)` and call it from the ratio. **That extraction is
   exactly what kills the brief's silent 1x1 PNG trap.**

### Naming — DECIDED, then REVERSED. The shipped names are the second set.

Title stays Fabio's **"Scribble"**. Shipped: internal id **`scribble`**, op **`flowScribble`**,
workflow **`flow_scribble.json`**, gallery prefix **`FLOWSCRIBBLE_`**.

The `blank-canvas` / `flowBlankCanvas` / `FLOWBLANKCANVAS_` set recorded here first was reversed
on 2026-08-26 — it named the CANVAS rather than the thing the user does, and "Scribble" is the
title on the tile. The `flowScrib` prefix it shares with Draw It In's `flowScribObj` was the
stated objection and was accepted as liveable; `flowScribObj` itself can never be freed, because
shipped gallery cards carry `FLOWSCRIBOBJ_` in their filenames and their sidecars' `flowId`.

Any file still saying `flow_blank_canvas.json` is stale — that name was never written to disk.

---

## THE PIVOT — 2026-08-26. Edit models only. Supersedes every ControlNet section above.

Fabio's call after a live side-by-side on one drawing. It retires SDXL scribble-to-image from the
product, which was this card's original stated purpose — a deliberate call, asked and answered,
not drift.

### Model list — SETTLED

**`klein-9b` (recommended) + `klein-4b`. Nothing else.**

| Tried | Verdict |
|---|---|
| Klein 9B / 4B | **PASS.** Placed the scene correctly first run, no leftover strokes, 14-27s |
| Boogu Image Edit | Passed on the winning prefix, but **DROPPED** — Klein beat it on quality *and* speed (38-39s), and it would have forced a second sampler chain into this graph behind a switch |
| Krea 2 | **DROPPED.** Rendered the drawn pink dashes as real pink road paint, and survived three prompt reframings |
| SDXL + ControlNet | **DROPPED.** Strokes came back as physical white road barriers; sea on the wrong side |

**Why SDXL lost, and it is the diagnosis not a preference:** both ControlNet arms are monochrome
LINE DETECTORS. `ScribblePreprocessor` and `CannyEdgePreprocessor` discard colour, so a blue fill
contributes an outline indistinguishable from a red terrain stroke and carries no "sea goes here"
signal. An edit model reads actual RGB. Same drawing, same prompt, only the model path differing.

**Why Krea 2 lost:** almost certainly its `Krea2EditModelPatch` shipping `ref_boost 2`, which per
`docs/models/krea2/editing.md` biases the whole reference against the instruction and is tuned for
identity preservation — i.e. "keep what is in the picture", the exact opposite of this flow. Klein
has no such patch. Untested at `ref_boost 1.0`; if anyone re-opens Krea 2, that is the first move,
then cfg, and only then the wording.

**Why Boogu cannot simply be added later without graph work:** a flow op resolves as a UNIVERSAL
workflow — `getUniversalWorkflow(op)` returns ONE file and short-circuits before any model lookup
(`commandExecutor.js:1456`), so a flow cannot route per model. Klein is `Flux2Scheduler` +
`CFGGuider` + `SamplerCustomAdvanced`; Boogu is `ModelSamplingAuraFlow` + `BasicScheduler` +
`SamplerCustom` with a tier int. Both in one graph means both chains behind a switch.

### The graph's title contract — what the app injects

| Title | Node | Form |
|---|---|---|
| `Input_Edit_Model` | UNETLoader | **plain** — `unet_name` IS on `comfyController._inject`'s spray list |
| `Input_Edit_Clip` | CLIPLoader | **dotted** `Input_Edit_Clip.clip_name` — `clip_name` is NOT on that list |
| `Input_Positive` | subject text | prefix concatenates ahead of it |
| `Input_Seed` | | emitted every run whether declared or not |
| `Input_Image` | the composited drawing | |
| `Input_Lora_Phase1_1..6` | LoRA rack | **phase-titled, never `Input_Lora_1..6`** — a graph carrying both forms takes the rack TWICE |
| **NOT** `Input_Negative` | | retitle it away, or the unconditional emit wipes the bake every run |

That last row is the live bug this card found on Draw It In: `_buildParams` emits
`Input_Positive`, `Input_Negative`, `Input_Negative_Audio` and `Input_Seed` **unconditionally**,
whatever the flow declares. Draw It In's node 19 held a baked negative under the title
`Input_Negative`, so `Input_Negative: ''` was written over it on every render ever made. Nothing
failed and nothing logged.

The per-tier weights are in `flowsRegistry.js` `modelParams`. The CLIP arm is not optional trim:
9B needs `qwen_3_8b_int8_convrot`, 4B needs `qwen_3_4b`, and crossing them dies with a shape error
that reads as a model bug and is not one (MPI-600).

### The baked prefix — settled live over three reframings

Goes in an `MpiText` node concatenated ahead of `Input_Positive`, so the user types only the
subject.

```
Replace this sketch with a fully rendered image of the same scene. The sketch is a layout guide only: no drawn line, outline or patch of flat colour survives into the final image. The finished image shows
```

Two properties are load-bearing and a reword must keep both:

1. **It says REPLACE, not "change the drawing".** Asking a model to *change* a drawing licenses it
   to keep part of one — that framing is what left strokes in the output on every failing run.
2. **It names NO output medium.** An earlier version said "photorealistic photograph" and worked,
   but Fabio caught that a BAKED prefix would then make anime unreachable. Neutral, so the user's
   own words (or a style LoRA) decide.

Verified both ways on Klein 9B: an Anime style LoRA at 1.00 drove the whole look with the prompt
saying nothing about style, and "Anime Illustration of ..." typed into the subject worked too.

**No `style` select field, and that is a decision.** The LoRA already does it better than a
dropdown would.

### App-side state — GRAPHS NOW EXIST, authored offline 2026-08-26

DONE in `js/data/flowsRegistry.js`: the `Input_Control_Net` radio and `Input_Control_strength`
slider are gone (the flow now declares NO flow-level fields), the step hint is rewritten, the slot
is the two Klein tiers with `loras: true`, and `modelParams` carries both tiers' unet + clip.

NOT DONE, and gated on the graph existing: the `flow_scribble` case in
`tests/inject-params-titles.test.cjs` still pins both AIO_Preprocessor arms, the two-switch wiring
and `input_control_*`. It reads the graph file directly, so it cannot be rewritten before the
graph lands. `tests/flow-model-choice.test.cjs` fails until then too, on
`"Input_Edit_Model" has no node titled "input_edit_model" in flow_scribble.json` — that is the
FlowDef and the graph being required to land together, which is the test doing its job.

**Both graphs are built and engine-verified.** `flow_draw_it_in.json` 41 nodes, `flow_scribble.json`
30 nodes, both clean through `scripts/verify-workflow.mjs` against 48188 and
`scripts/validate-injection-rules.mjs`. The `flow_scribble` case in
`tests/inject-params-titles.test.cjs` is rewritten to the edit-model shape. `npm test` 737/738 and
`npm run test:desktop` 26/26; the single failure is the unrelated orphan-sweep isolation leak.

**Draw It In also gained the rack** (Fabio's call, so both flows benefit) and its FlowDef slot now
carries `loras: true`. It stays 9B-only — 4B's exclusion rests on separate live evidence.

**The one thing not done is a LIVE RUN.** Verification proves the engine would accept exactly the
graph that was designed — class existence, link types, COMBO widget values, the injection contract
— and it cannot prove the picture is good. Run Scribble once on each Klein tier, with and without a
style LoRA, before this card leaves `doing`.

**Then:** `/mpi-flow-graphics` for the tile + hero, and the `preview` / `video` keys go in the SAME
commit as the art files — never ahead of them.

---

## FOLLOW-UPS — BOTH BUILT 2026-08-26. Specification below, outcome at the end.

Both came out of Fabio's live runs. `files.json` gained the four files they needed
(`flowService.js`, `generationService.js`, `MpiGalleryGrid.js`, `statusBar.js`).

### 1. Reuse must open the flow even when a model is missing

`flowService.openFlowFromReuse` currently refuses: `flowAvailability()` fails, the user is told
"needs its model installed — opening Flows" and is bounced to the Flow Library. The flow never
opens, so the saved `flowInputs` are never restored — and for Scribble that is **the drawing**.

Fabio: *"He should be able to reuse it anyway ... This way he doesn't lose his drawing."*

Wanted:
- Reuse **always** opens the flow and restores the inputs.
- A missing tier is a SUBSTITUTION, not a failure — a card made on 9B reruns on 4B when only 4B
  is installed. `flowModelIds` already resolves that correctly today; only the refusal is wrong.
- Say it in a **toast**: a warning when a different candidate will run, and an ERROR toast
  ("No models installed for this flow") when no candidate of a slot is installed — with the flow
  still open and the drawing intact, so the user installs and presses Generate rather than
  redrawing.

### 2. Record `flowModelIds` at dispatch; badge the single-choice case

A flow card carries `modelId: null` by design, so the gallery badge renders only `FLOW: SCRIBBLE`
and nothing says whether 9B or 4B ran. The tier IS recoverable from
`generationSettings.injectionParams.Input_Edit_Model` (that is how `flowScribble_006` was
identified as the 4B run), but that means mapping weight filenames to model ids, which breaks on a
re-export.

Fix the storage, not the badge: `flowService` already calls `flowModelIds(flow)`, so record the
resolved array on the sidecar — one entry per slot, any number of slots.

**Display is a SEPARATE decision, and Fabio's objection is why:** a four-stage flow has four
models and they cannot live in a two-row corner label. Drive the card off
`flowModelChoices(flow)`, which already filters to slots with more than one candidate:

| Choosable slots | Card row 1 |
|---|---|
| 0 | nothing — the flow always runs the same models |
| exactly 1 | that pick (`FLUX.2 KLEIN 4B`) — the comparison case |
| 2+ | nothing — the card is the wrong surface |

So Scribble and Draw It In badge; Character Sheet does not, and should not. There is no
user-facing surface for the full per-slot list today — `generationSettings` is read only by
`projectModel`, migrations, `generationService` and `promptReuse`, never displayed — so for a
multi-slot flow the answer stays "read the sidecar", exactly as it already is for the prompt. A
real detail panel (prompt + seed + models + settings) is its own card, not this one.

This pairs with follow-up 1: the substitution toast has to NAME the tier it is substituting.

---

### BOTH SHIPPED — what was built, and the four decisions inside it

**Storage rides `generationSettings`, not a new item field.** `flowService` puts
`flowModelIds: flowModelIds(flow)` on the config; `generationService` copies it into the
`generationSettings` blob beside `injectionParams`. That blob is already the sidecar's
free-form run snapshot, so this needed **no** route, `projectModel`, reconciler or migration
change — the alternative (a top-level item field like `flowId`/`flowInputs`) would have
touched `projectModel` x3, `generationService` x2, `projectService`, five parity sites in
`routes/projects.js` and the reconciler. Proven on disk rather than assumed: Fabio's eight
live `flowScribble` sidecars carry `generationSettings` with exactly the keys
`generationService` builds (`operation, modelId, injectionParams, mediaItems, previewOnly`),
so the new key lands beside them and survives a restart the same way.

**`ui:error` IS NOT A TOAST — that is why `ui:danger` now exists.** `ui:error` opens the
blocking `MpiErrorDialog` (`shell.js:423`), and Fabio asked for a toast. `MpiToast` already
had the `danger` variant with no event channel, so `statusBar.js` gained one line beside
`ui:success` / `ui:warning` / `ui:info`. Verified rendering, not just emitting: one
`.mpi-toast--danger` element, labelled "Failed".

**Reuse now opens FIRST and toasts SECOND, in the same deferred tick.** The `setTimeout(0)`
that already existed (so the reuse menu's `ui:close-all-popups` teardown cannot eat the
overlay) now also carries the toast, so it lands over the open flow rather than behind it.
`_missingLabel` was extracted from `submitFlowGeneration` — both toasts have to name whether
a MODEL or a DEP is absent (MPI-304), and duplicating that ternary would have drifted.

**The badge is suppressed by `flowModelChoices().length !== 1`, and Draw It In does NOT
badge.** The follow-up text above says it would; measured, `scribble-object` has ONE slot with
ONE candidate (klein-9b, 9B-only by its own live evidence), so it has **zero** choosable slots
and correctly shows nothing — a card naming the only model it could ever run says nothing.
Scribble and Outpaint are the flows with exactly one choosable slot today. Reading
`ids[choices[0].index]` and not `ids[0]` is load-bearing: `flowModelIds` is indexed by
`requiredModels` position, and `flowModelChoices` filters — which is exactly why it kept
`index` (MPI-608).

**Measured in a real renderer** (own isolated instance, `openFlowFromReuse` driven four ways
with `s_installedModelIds` stubbed):

| Case | Result |
|---|---|
| recorded 9B, only 4B installed | flow opens, inputs seeded, warning: *"Scribble will run on FLUX.2 Klein 4B instead of FLUX.2 Klein 9B — the model this was made with isn't installed."* |
| nothing installed | flow opens, inputs seeded, DANGER toast: *"Scribble needs a model installed — install from Flows, then press Generate. Your inputs are kept."* |
| recorded 9B, 9B installed | flow opens, no toast |
| pre-MPI-620 card (no recorded ids) | flow opens, no toast — no guess made from weight filenames |

Badge, four synthetic cards through a real `MpiGalleryGrid` mount: `scribble` +
`flowModelIds:['klein-4b']` → row 1 `FLUX.2 KLEIN 4B`; `character-sheet` (2 choosable),
`scribble-object` (0 choosable) and a scribble card with nothing recorded → row 1 suppressed,
only `FLOW: SCRIBBLE`.

`npm test` 737/738 (the failure is the same unrelated orphan-sweep isolation leak this card
has carried throughout — `_localSharedDepsMap` stats the REAL models root, so an installed
Boogu makes the fixture's "orphan" genuinely wanted; CI has no models and stays green).
eslint clean on all four files.

**Noticed, not actioned:** `badgeRows` in `MpiGalleryGrid._render` builds its row classes from
the index AFTER `.filter(Boolean)`, so a card with an empty row 1 renders its operation text
with the `--model` row class. Pre-existing and unchanged — every flow card has always looked
that way — but it means "row 1 vs row 2" in the code is positional, not semantic.

---

## GRAPHICS — SHIPPED 2026-08-26 (`/mpi-flow-graphics`)

`flow-scribble.webp` 107 KB (896×1120) + `flow-scribble.mp4` 1.30 MB (1280×800, 6.0s, 24fps).
Both keys wired in `flowsRegistry.js` in the same commit as the files.

**Plates are ONE real run, proven by hash rather than assumed.** `imported_002.png`'s sha256
(`3f9d5b58…`) IS the `.preview-assets` filename that both `kleinEdit_011` (anime) and
`kleinEdit_012` (photoreal) ate — same sketch, same model, same baked prefix, only the wording
differing. Fabio first named `imported_001.png`; the hash said otherwise and a pixel diff put
the two sketches **10.77% apart**, so it mattered. He confirmed 002. The two renders came from
the `kleinEdit` op rather than `flowScribble`, which is the same graph and the same prefix.

**Device — the layout holds while the LOOK changes**, which no shipped hero did before. The
seam wipes the drawing away to the anime render, that crossfades to the photoreal one and back,
and the composition never moves — so the only thing the eye reads is the style. Chosen over
Draw It In's two-subjects device because Scribble's pitch is not "any subject" but "your shapes,
your words decide the look". **The loop point IS the tile frame** (seam parked at 45%, base back
on anime), which makes the loop invisible AND stops the `poster` cutting to a different picture.

**Two rebuilds, both silent, both now in the playbook's trap table:**

1. **A sliding cover shows the WRONG COLUMNS.** Sliding the sketch off to the left leaves its
   RIGHT side sitting on the frame's LEFT — the drawn sea appeared on the wrong side of the
   picture. Registered plates need `geq` + `alphamerge` with a moving SEAM, not a moving plate.
2. **`split` then `format=gray` on one branch turns BOTH branches gray.** Negotiation runs back
   through the split, so the sketch lost its pink and green and read as a pencil study. The mask
   needs its own `color=black` source.

Neither errored, and both were only visible at 446 px — which is the playbook's whole point
about judging at real size.

**Measured:** loop seam = first vs last frame MAD **0.53** (codec noise); wipe motion = first vs
t=0.7 MAD **21.0** (so it genuinely animates — the `drawbox`/`crop` traps read as 0); style beat
= anime vs real MAD **59.2**. Live in an isolated instance with the project open on the gallery:
hero selected BY SRC (not `querySelector('video')`), `paused:false`, `muted`, `loop:true`,
`currentTime` 2.455 → 3.356, `1280x800`, **cssW 444** — a real visible hero, not the 0-width
hidden-overlay trap — poster `flow-scribble.webp`. Both assets **200** at exactly 107,188 and
1,296,998 bytes. `npm test` **739/739** (the orphan-sweep flake did not reproduce this run).
