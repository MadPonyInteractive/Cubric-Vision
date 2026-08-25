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
