# 06 — The flow's preview image

Every flow ships **one** image. This file is how it gets made, and what it has to
survive.

## The slot: ONE field, THREE placements

`FlowDef.preview` is a filename under `comfy_workflows/display/`. There is no
second field — no separate tile thumb, no separate hero. One asset is drawn three
times, twice cropped and once whole:

| Placement | Code | Treatment |
|---|---|---|
| Flow Library tile | `MpiTileSheet.css:56` (`.mpi-tile--image .mpi-tile__thumb`) | `aspect-ratio: 4/5`, `object-fit: cover`, idle `filter: saturate(.92) brightness(.92)`, hover `scale(1.04)` |
| Slide-over detail thumb | `MpiModelManager.css:300` (`.mpi-detail__thumb--image`) | `aspect-ratio: 4/5`, `object-fit: cover` |
| Hero inside the open flow | `MpiBaseFlow.js:735` → `.mpi-base-flow__example img` | `width:100%; height:auto` — **natural aspect, no crop** |

Consequences, and they are the whole brief:

- **Ship it at 4/5.** Then the two cropped placements crop nothing, and the hero
  shows exactly what the tile showed. Any other ratio means the tile silently
  centre-crops an image you composed for the hero.
- **It must read at ~220 px wide.** The grid is
  `repeat(auto-fill, minmax(220px, 1fr))` (`MpiTileSheet.css:22`), so the tile
  thumb is ≈220×275 CSS px. Fine detail, thin type and two-panel diptychs die at
  that size.
- **It is desaturated and dimmed until hover.** Compose with contrast to spare;
  a low-contrast image reads as fog in the grid.

## File spec

Match the 59 assets already in `comfy_workflows/display/`:

- **`.webp`**, quality ~82. Budget **100–250 KB** (the largest shipped asset is
  246 KB).
- **896 × 1120** (4/5). `512 × 640` is enough for a 2× display and is the smaller
  file; prefer 896 only when the hero shows real texture.
- Name it after the flow, not the model: `flow-head-swap.webp`. A model-named
  file is how the current placeholders happened.

## What the image should show

A flow is a **transformation**, and its tile has to say which one at 220 px. The
placeholders fail exactly here: Head Swap wears `sdxl-real-05.webp`, and Extend
Video and Add Foley wear the *same* `ltx23_balanced_preview.webp`, so two flows
are one card.

Three directions, in order of how well they survive the crop:

1. **Outcome-forward + one mark** — the result, plus a single legible graphic
   token of what changed (a corner inset of the source, one accent stroke, one
   badge). Survives 220 px, informative at full width. **Default.**
2. **Pure outcome still** — a model preview by another name. Cheapest; says
   nothing about the transformation, and cannot distinguish two flows on one model.
3. **Before/after diptych** — most honest, worst at 220 px. Only for a flow whose
   change is a whole-frame silhouette shift.

Rules that hold for all three:

- **One subject, in the middle 60%.** The hero is uncropped but the tile is not
  the same shape as your instinct — keep type and marks out of the outer 10% on
  every edge.
- **Accent marks use the app tokens**, sampled from `styles/01_base.css`:
  `--accent-heat` `oklch(0.76 0.17 355)` (primary), `--accent-frost`
  `oklch(0.82 0.13 220)` (generative state). Never invent a colour.
- **No baked UI.** A screenshot of the app inside the tile ages the moment the UI
  moves, and nothing in the build will catch it.

## The pipeline

Three rungs. Stop at the first that gets the image.

### 1. Plate — Krea2 through the running app

The photographic content comes from a real generation, which lands as a real
gallery card (sidecar included) so the prompt stays recoverable. The endpoint is
`POST /connector` + `/generate`, body `{modelId, operation, positive,
injectionParams}`:

```
modelId:          krea2
operation:        t2i
injectionParams:  { "Width": 896, "Height": 1120 }
```

It returns `{"ok":true,"output":{"filePath":"C:/.../out.png", ...}}` — that path
is the plate. The full endpoint contract, the curl form, every error code and the
`injectionParams` rules are in the **`cubric-vision` skill**
(`.claude/skills/cubric-vision/SKILL.md` § Dispatching a generation). Read it
there rather than copying the call around.

Two things that will bite:

- **It uses whatever project the app has open** and never switches. `NO_PROJECT`
  means open one first.
- **`:3000` is usually Fabio's live app.** Generating into his session is a real
  side effect — ask, or run your own instance (`npm run app:isolated`) and point
  `CUBRIC_URL` at the port it prints.

For a flow that transforms an *existing* image (Head Swap), the honest plate is a
**real run of the flow itself** in the app — then the preview is the output, not
an impression of it. The connector route cannot do that leg (no media inputs yet,
`MEDIA_UNSUPPORTED`), so run it in the UI and take the file off disk.

### 2. Composite — `sharp`, already a dependency

`sharp ^0.34.5` is a direct dependency and installed. Crop, inset, encode, done —
no new package, no browser, no scaffold:

```js
// node this from the scratchpad; ponytail: inline until it survives 3 flows unchanged
import sharp from 'sharp';

const W = 896, H = 1120;
const inset = await sharp('source-head.png')
    .resize(240, 300, { fit: 'cover' }).toBuffer();

await sharp('plate.png')
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .composite([{ input: inset, left: W - 240 - 32, top: H - 300 - 32 }])
    .webp({ quality: 82 })
    .toFile('comfy_workflows/display/flow-head-swap.webp');
```

`position: 'attention'` crops toward the salient region rather than the centre,
which is what saves a portrait whose subject sits off-axis. Read
`~/.claude/memory/tools/sharp.md` before any mask or `joinChannel` work — it
carries three silent channel-count traps.

### 3. Escalate only when the design needs more

- **Real type layout, brand fonts, gradients** → write one HTML file and
  `playwright-cli screenshot --filename=…` it. Already in the toolchain.
- **A tile that MOVES** → HyperFrames (`C:/AI/Mpi/video-tool`, authoring contract
  at `MadPony-Identity/playbooks/hyperframes-authoring.md`). `hyperframes
  snapshot --at <t>` also emits stills, and `hyperframes remove-background` cuts
  a subject to a transparent PNG — genuinely useful for rung 2's inset. But a
  project scaffold plus a GSAP timeline for one still is ceremony `sharp` does
  not need, so do not reach for it to make a static image.
  **Note the tile cannot play a clip today**: `MpiTileSheet` supports
  `.mpi-tile--video`, but `MpiFlowLibrary.js:104` hardcodes `media: 'image'`.
  Motion previews are a wiring change, not an art change.

## Checklist

- [ ] Ratio is **4/5**, dimensions 896×1120 (or 512×640)
- [ ] `.webp`, 100–250 KB
- [ ] Named for the **flow**, not the model
- [ ] Nothing load-bearing in the outer 10%
- [ ] Eyeballed at **220 px wide** — the transformation still reads
- [ ] Eyeballed full-width in the open flow — no crop surprise
- [ ] Distinct from every other flow's preview (two flows on one model must not
      share an image)
- [ ] Accent marks use `--accent-heat` / `--accent-frost`, no invented colour
- [ ] `preview:` in `flowsRegistry.js` points at the new file, placeholder comment
      deleted

## Traps

| trap | why it bites |
|---|---|
| Composing for the hero, not the tile | The hero is uncropped and the tile is 4/5 `cover` — off-ratio art gets centre-cropped with no warning anywhere |
| Reusing a model preview | It is the current state of all three flows, and it makes two different flows one card |
| Forgetting the idle filter | Tiles render at `saturate(.92) brightness(.92)`; art that is exactly contrasty enough in isolation reads flat in the grid |
| Generating into `:3000` | That is normally the user's live session — a generation lands in *their* project |
| Reaching for HyperFrames for a still | Needs a project scaffold, `meta.json`, `hyperframes.json` and a GSAP timeline; `sharp` is already installed and does the job in 10 lines |
