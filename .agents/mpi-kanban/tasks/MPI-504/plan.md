# MPI-504 — plan: Character Sheet, shippable v1

Re-scoped by Fabio 2026-08-19. **v1 takes a prompt and nothing else.** The reference-photo
path — the half that had to hold identity onto a back view it never saw — is deferred whole.
Head-swap already covers "make it look like this person": generate the sheet from a
description, then swap. That removes the one unproven step from the card.

The prompt payload (sheet template ×4 styles, the character-only enhancer recipe, the removal
prompt) is in [prompts.md](prompts.md). This file is the build.

## Current State

**2026-08-19, session 1 (no GPU available).** Everything writable without a GPU is written:
this plan, [prompts.md](prompts.md), [checklist.md](checklist.md), and the v1 section on
[brief.md](brief.md). Nothing has been generated and no graph exists yet — `raw/` is untouched
by design. Two design questions were closed this session rather than deferred: the **gear
policy** (three tiers, recipe text only, no field — prompts.md §2) and **how the front body's
head is picked** (faces exist only on the portrait and the front panel, so area-sorted face
detection identifies it with no classifier — see step 4 below).

Next session starts at the bench: build the graph by stripping `krea2_t2i_template.json`, then
work the open calls. The enhancer regression is the one check that needs no GPU beyond a
running engine — do it first, it validates the recipe before a single image is made.

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
| `Input_enhance_prompt` | toggle | **on** | already exists in the graph; off = the user's words go into the hole verbatim |
| `Input_Style` | radio ×4 | 1 Photoreal | Photoreal · 3D · Anime · Cartoon |
| `Input_Quality` | radio ×2 | **2k** | 1k `1280×768` · 2k `1792×1120` |
| `Input_is_Turbo` | toggle | **off** | the krea2 accelerator LoRA |
| `Input_Remove_Head` | toggle | **on** | the SAM3 + Klein pass |

## Build the graph by STRIPPING `krea2_t2i_template.json`

Simpler and safer than authoring fresh: the t2i branch, the tier switch and the enhancer group
are already proven in it. `comfy_workflows/raw/` is **user-owned** — Fabio does this in the
bench editor; the list below is the whole surgery.

218 nodes / 10 groups today. **Delete these groups whole** (136 nodes):

`Edit` (40) · `Upscale` (27) · `Images` (21) · `Detailer` (19) · `Stitch Edit` (14) ·
`Depth` (9) · `Loras` (6 — `Input_Lora_1..6`; a Flow runs clean, no project LoRAs).

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

### Then add, in order

1. **Four sheet templates** (`PrimitiveStringMultiline`) → `MpiAnySwitch` on `Input_Style`
   (1-indexed, the head-swap `Input_Tier` pattern).
2. **The hole.** `StringReplace`: string = the selected template, find `[CHARACTER PROMPT]`,
   replace ← the *Prompt Enhancement* group's output (node `241` `Input_enhance_prompt`, which
   already picks enhanced-vs-raw). The result feeds `Set_positive text` in place of
   `Input_Positive`'s direct wire — the user's raw text now only ever reaches the enhancer.
3. **Swap the enhancer recipe.** Node `420`'s widget → the character-only system prompt in
   [prompts.md](prompts.md) §2. Keep the `<|im_start|>system` / `<|im_end|>\n<|im_start|>user`
   wrapper exactly — nodes `422` and `419` build the rest of the ChatML frame around it.
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
   - **Stage 2, face → head.** Grow the picked SEG's bbox, mostly **upward** (hair sits above
     the face). Then either feed that box to `SAM3_Detect`'s **box** branch for an exact
     head+hair mask, or crop to it and run SAM3 text `head` on the crop and paste back.
     **Text and box are mutually exclusive on one `SAM3_Detect`** (`docs/masking-sam3.md`), so
     "head, inside this box" is never one node. Bare `head`, never `head:1` — `:1` detects
     nothing (the `name:N` trap).
   - `GrowMask` — expand `24` at 2k, `12` at 1k.
   - Klein `klein-4b` inpaint, prompt fixed (prompts.md §3), mask-composited back so the rest
     of the sheet is never re-rendered (Higgsfield: an image never runs through a model twice).
5. Output the finished sheet only. Returning the pre-removal sheet as a second result is one
   node if Fabio wants it.

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
