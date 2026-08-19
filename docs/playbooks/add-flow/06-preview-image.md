# 06 — The flow's preview media

A flow ships **two** assets, and they do different jobs:

| Field | Asset | Where | Job |
|---|---|---|---|
| `preview` | 4/5 **still** `.webp` | Flow Library tile, slide-over thumb, hero poster + fallback | Say what the flow **is**, instantly, at ~220 px |
| `video` | wide (8:5 or 16:9) **autoplaying loop** `.mp4` | Hero on the flow's first slide only | Show what the flow **does** |

`video` is optional. Omit it and the hero shows the still — which is the state of
every flow until its loop is made.

## Where each one is drawn

| Placement | Code | Treatment |
|---|---|---|
| Flow Library tile | `MpiTileSheet.css:56` | `aspect-ratio: 4/5`, `object-fit: cover`, idle `filter: saturate(.92) brightness(.92)`, hover `scale(1.04)` |
| Slide-over detail thumb | `MpiModelManager.css:300` | `aspect-ratio: 4/5`, `object-fit: cover` |
| Hero, first slide | `MpiBaseFlow.js` `_buildInputsSlide` | `<video>` autoplay/muted/loop/playsInline, poster = `preview`, `width:100%; height:auto` — natural aspect, no crop |

**A flow's `video` does NOT make it a video tile.** A `ModelDef` with `video` gets
a 16:9 hover-play tile; a flow keeps its 4/5 still, because `MpiFlowLibrary.js:104`
passes `media: 'image'`. That divergence is deliberate — the tile's job is the
instant read, and a grid of autoplaying clips is noise.

## `preview` — the 4/5 still

- **896 × 1120** (or 512 × 640). `.webp` q≈82, **100–250 KB**.
- Must read at **~220 px wide** — the grid is `repeat(auto-fill, minmax(220px, 1fr))`.
  Fine detail, thin type and two-panel diptychs die at that size.
- Tiles render **desaturated and dimmed** until hover. Compose with contrast to spare.
- Keep anything load-bearing out of the outer 10% on every edge.
- **A simple, immediate statement of the flow.** One subject, one idea. This is not
  where the transformation gets explained — that is the hero's job.
- Name it for the flow, not the model: `flow-head-swap.webp`.

## `video` — the hero loop

- **8:5 (1280 × 800)** or **16:9 (1280 × 720)**. The hero column is
  `max-width: 460px` (`MpiBaseFlow.css:238`), so 1280 wide covers a 2× display
  with room to spare. Do not ship 4K.
- **`.mp4`, H.264, ≤ 2 MB, 4–8 s, seamless loop.** The budget is hard because the
  hero **autoplays** — it downloads the moment the flow opens, unlike the model
  tiles that only play on hover. For scale: `minimax_h3_preview.mp4` is 0.8 MB and
  fine; `ltx23_high_preview.mp4` is 38 MB and would be unusable here.
- **Not a GIF.** The codebase already settled this — see the `ponytail:` note at
  `MpiOpHelpDialog.js:32`, *"media is treated as a GIF that compresses better"*. A
  GIF of the same clip is an order of magnitude larger and its 256-colour palette
  bands badly on the dark UI.
- **It is silent.** Autoplay requires `muted`, so the viewer never hears a hero.
  Anything audible has to be shown, not played.
- Name it beside the still: `flow-head-swap.mp4` next to `flow-head-swap.webp`.

## What the hero should show

A flow is a **transformation**. The hero has 6 seconds and no sound to name which
one. Pick the device by what actually changes:

| The flow changes… | Device | Example |
|---|---|---|
| The **content of the frame** | Real before → after, wiped or dissolved, with the seam visible | **Head Swap** — the two source images, then the result |
| The **length or motion** | Play the original, mark where it ended, let the extension run past the mark | **Extend Video** — a progress rail that keeps going |
| Something **not visible at all** | Animate the channel that changed, over an unchanged frame | **Add Foley** — the frame plays untouched while a waveform draws itself in sync, impact by impact |

**The rule behind the third row:** when the output looks identical to the input,
a before/after is a lie — two identical panels. Show the *added channel* instead.
For audio that means a waveform, a level meter, or beat markers landing on the
events that made the sound. It is the only honest device, and because the hero is
muted it is also the only one that communicates anything at all.

Real before/after material is the strongest input where it exists, so use it —
just do not force it onto a flow whose change is invisible.

Rules for all three:

- **Accent marks use the app tokens** from `styles/01_base.css`: `--accent-heat`
  `oklch(0.76 0.17 355)`, `--accent-frost` `oklch(0.82 0.13 220)`. Never invent a colour.
- **Loop seamlessly** — first and last frame must match, or the restart reads as a glitch.
- **No baked UI.** A screenshot of the app inside the hero ages the moment the UI moves.
- **Legible at 460 px.** Any type in the loop is small type.

## Making them

### 1. Plates — real output, not an impression of it

The honest plate for a flow is **a real run of that flow** in the app; take the
files off disk. For a purely generated plate (a background, a subject), the
`cubric-vision` skill's connector route dispatches Krea2 and lands a real gallery
card with its sidecar — see `.claude/skills/cubric-vision/SKILL.md` § Dispatching
a generation for the call, the error codes and the `injectionParams` rules
(`Width` / `Height`). It cannot supply media inputs yet, so the transform leg is
always a UI run.

**`:3000` is normally Fabio's live app** — generating there lands in his project.
Ask, or run `npm run app:isolated` and use the port it prints.

### 2. The still — `sharp`

`sharp ^0.34.5` is already a direct dependency. Crop, inset, encode:

```js
// ponytail: inline until it survives 3 flows unchanged, then promote to scripts/
import sharp from 'sharp';
const W = 896, H = 1120;
await sharp('plate.png')
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toFile('comfy_workflows/display/flow-head-swap.webp');
```

`position: 'attention'` crops toward the salient region instead of the centre.
Read `~/.claude/memory/tools/sharp.md` before any mask or `joinChannel` work.

### 3. The hero loop — HyperFrames

**This is what HyperFrames is for**, and where it beats every lighter option: an
HTML composition with a real GSAP timeline, brand fonts, and an MP4 out. Tool at
`C:/AI/Mpi/video-tool`; the authoring contract — root element, `data-duration`,
`class="clip"`, the timeline registration, and the gotchas that cost time — is
`MadPony-Identity/playbooks/hyperframes-authoring.md`. **Read it before authoring**,
and note two deltas for a hero:

- Its scaffold assumes **1080 × 1920** (9:16 shorts). A hero is **1280 × 800** or
  **1280 × 720** — set `data-width` / `data-height` on `#root` and the matching
  explicit `width` / `height` in CSS, or the root collapses silently.
- Render **silent** (include no `<audio>` element), which is what we want anyway.

`hyperframes remove-background` cuts a subject to a transparent PNG — useful for
floating a head or a subject over a graphic plate in the before/after device.

Then transcode to the budget and verify the loop:

```bash
ffmpeg -i renders/hero.mp4 -c:v libx264 -crf 26 -preset slow -an \
       -vf scale=1280:-2 -movflags +faststart comfy_workflows/display/flow-head-swap.mp4
```

There is **no ffmpeg on PATH here** — use the one in `video-tool`
(`node_modules/ffmpeg-static/ffmpeg.exe`).

Simpler heroes that are just a cut between two stills do not need HyperFrames;
ffmpeg alone will do it. Escalate only when the loop wants real animated graphics.

## Checklist

- [ ] `preview`: 4/5, 896×1120 (or 512×640), `.webp`, 100–250 KB
- [ ] Reads at **220 px** — the flow is identifiable at tile size
- [ ] Nothing load-bearing in the outer 10%
- [ ] Distinct from every other flow's still (two flows on one model must not share one)
- [ ] `video`: 8:5 or 16:9, 1280 wide, `.mp4` H.264, **≤ 2 MB**, 4–8 s, loops seamlessly
- [ ] Hero device matches what actually changes — invisible change → animate the channel, never a fake before/after
- [ ] Hero verified **muted** (it always is) and legible at 460 px
- [ ] Accent marks use `--accent-heat` / `--accent-frost`
- [ ] Both fields set in `flowsRegistry.js`, placeholder comment deleted

## Traps

| trap | why it bites |
|---|---|
| Sizing the hero like a model preview | Model clips play on **hover** and run to 38 MB. A hero **autoplays** on open — over ~2 MB the first slide stalls |
| Composing the still for the hero | The hero is uncropped, the tile is 4/5 `cover` — off-ratio art gets centre-cropped with no warning anywhere |
| A before/after on an audio-only flow | Two identical panels. Animate the added channel instead |
| Expecting the hero to be heard | Autoplay demands `muted`. Audio must be drawn |
| Reusing a model preview | It is the current state of all three flows, and it makes two of them one card |
| Forgetting the idle filter | Tiles render at `saturate(.92) brightness(.92)`; art that is just contrasty enough in isolation reads flat in the grid |
| Generating into `:3000` | That is normally the user's live session |
| A GIF | An order of magnitude larger than the same clip as H.264, and it bands on the dark UI |
