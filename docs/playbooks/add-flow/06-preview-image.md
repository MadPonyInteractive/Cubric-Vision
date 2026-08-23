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

- **896 × 1120** (or 512 × 640). `.webp` q≈90, **≤ 250 KB** (the shipped pair are
  47 KB and 79 KB — quality first, the number is a ceiling not a target).
- Must read at **~220 px wide** — the grid is `repeat(auto-fill, minmax(220px, 1fr))`.
  Fine detail, thin type and two-panel diptychs die at that size.
- Tiles render **desaturated and dimmed** until hover. Compose with contrast to spare.
- Keep anything load-bearing out of the outer 10% on every edge.
- **One subject, one idea, read in a glance.** A still CAN carry the transformation
  when it is the right *instant* of it — Head Swap's tile is its hero's wipe frozen
  where the seam bisects the face — but it must never need a second look.
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
| The **content of the frame** | Real before → after, wiped with the seam visible | **Head Swap** (shipped) — one plate wipes to the other, only the head changes |
| The **length or motion** | Play the RESULT straight through under a progress rail, marked where the source ended, the rail running past the mark in `--accent-heat` | **Extend Video** (shipped) — the added seconds are the only thing wearing the accent |
| Something **not visible at all** | Animate the channel that changed, over an unchanged frame | **Add Foley** (shipped) — the picture plays untouched while the waveform draws itself in sync, impact by impact |
| **Nothing** — the flow CREATES rather than transforms | Build the LAYOUT a piece at a time, then swap the subject under it | **Character Sheet** (shipped) — the three views arrive one by one over the studio grey, then the character changes while the grid holds |

Three rules the shipped flows proved:

- **A wipe across the WHOLE frame is dead air when only the EDGES change.** Outpaint's
  two plates are identical between the black strips — same source pixels — so a full-frame
  `xfade wiperight` spent a third of its clip travelling a seam over content that never
  moved. Built, watched, thrown away. Reveal only the regions that actually changed: the
  shipped hero keeps the FILLED result on screen for the whole clip and slides two black
  boxes outward off frame, so the strips are the only thing that ever moves, and both sides
  animate at once instead of one-then-a-pause-then-the-other. Ask which pixels differ
  before picking the device, not after.

- **A before/after wipe needs plates from ONE run.** Head Swap's two plates are
  pixel-identical outside the head (check with an ffmpeg `blend=all_mode=difference`
  before building), so the scene holds rock-steady and the eye goes straight to
  what changed. Plates from two different generations make everything shimmer and
  the device collapses into noise.
- **Punch in until the change is legible at 446 px.** Head Swap full-frame left the
  head ~45 px and read as "nothing happened"; a head-and-shoulders crop made it
  obvious. Model output is often 1344 × 768 with no higher-res original, so expect
  a ~2× upscale — acceptable on a shallow-DOF plate, and far better than an
  unreadable hero. Check the crop as a still at 446 px BEFORE building the video.

- **A flow with no BEFORE gets no wipe at all.** Character Sheet takes a description
  and returns a sheet, so there is no earlier frame to reveal against — a two-panel
  device there is invented, not observed. What it does have is a LAYOUT (front body,
  back body, portrait), and the hero teaches it: each panel fades in on the studio
  grey in turn, then whole sheets crossfade so the grid holds while the character
  changes. Starting and ending on bare grey also makes the loop point invisible,
  which is the one thing a slideshow of stills otherwise gets wrong.
- **When the output looks identical to the input, a before/after is a lie** — two
  identical panels. Show the *added channel*: a waveform, a level meter, beat
  markers on the events that made the sound. Because the hero is muted, that is
  the only device that communicates anything at all. Real before/after material is
  the strongest input where it exists — just never force it onto an invisible change.
- **Accent marks use the app tokens** from `styles/01_base.css`: `--accent-heat`
  `oklch(0.76 0.17 355)` = **`0xFF7EB6`**, `--accent-frost` `oklch(0.82 0.13 220)` =
  **`0x48D7FE`**. Never invent a colour — and never eyeball the hex either. ffmpeg and
  `sharp` both want sRGB, so the token has to be converted, and `--accent-heat` is
  fractionally OUT of sRGB gamut (linear red 1.026), which is exactly where a hand
  conversion drifts. Get it from the browser that renders it: `playwright-cli eval` a
  1×1 canvas with `fillStyle` set to the `oklch()` string and read the pixel back —
  a computed style serialises as `oklch()`, so parsing it as "rgb" returns a plausible
  wrong number. Add Foley and Head Swap shipped with `0xFF5FA2`, an invented
  pink that is neither token. Fabio APPROVED both as they are on 2026-08-20 — leave them
  alone, this is not drift to repair. Every hero from Extend Video on uses `0xFF7EB6`.
- **Loop seamlessly**, keep any type large, and bake **no app UI** into the frame.

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
// ponytail: stays inline. Three flows in (MPI-581), the heroes' filtergraphs are all
// bespoke and only this webp encode repeats — nothing to extract. Do not re-litigate.
import sharp from 'sharp';
const W = 896, H = 1120;
await sharp('plate.png')
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toFile('comfy_workflows/display/flow-head-swap.webp');
```

`position: 'attention'` crops toward the salient region instead of the centre.
Read `~/.claude/memory/tools/sharp.md` before any mask or `joinChannel` work.

**Run it from the repo, not the scratchpad** — `sharp` resolves against the
script's own location, so a scratchpad script dies with `ERR_MODULE_NOT_FOUND`
for a package that is installed. `node -e '…'` from the repo root is the shortest
form that works.

Where the tile and hero share a subject, **derive one from the other** rather than
composing twice: the Head Swap tile is its hero's wipe frozen where the seam
bisects the face, and the Add Foley tile is the hero's band with the waveform
fully drawn. One asset, one language, half the work.

### 3. The hero loop — ffmpeg first

**ffmpeg alone built both shipped heroes.** A hero driven by *plates and data* — a
before/after wipe, a waveform, a playhead, a progress rail — needs no HTML, no
GSAP and no scaffold. There is **no ffmpeg on PATH here**; use `video-tool`'s
(`C:/AI/Mpi/video-tool/node_modules/ffmpeg-static/ffmpeg.exe`, `ffprobe-static`
beside it). There is no `bc` on this box either — precompute derived numbers.

**Before/after wipe** (Head Swap). `xfade` does the transition; the seam is a
separate overlay so it stays visible:

```bash
"$FF" -y -loop 1 -t 4 -r 24 -i before.png -loop 1 -t 4 -r 24 -i after.png \
  -f lavfi -t 5 -i "color=c=0xFF7EB6:s=3x720:r=24" -filter_complex "
[0:v]${CROP},format=yuv420p[a]; [1:v]${CROP},format=yuv420p[b];
[a][b]xfade=transition=wiperight:duration=3:offset=1[x];
[x][2:v]overlay=x='1280*(t-1)/3':y=0:eval=frame[out]" -map "[out]" -an …
```

**A channel drawing itself in sync** (Add Foley). `showwavespic` for the shape,
an opaque cover sliding right to reveal it, its leading edge carrying the playhead:

```bash
[0:a]volume=14dB,showwavespic=s=1280x64:colors=0xFF7EB6:scale=sqrt:filter=peak:draw=full[wave];
[band][cover]overlay=x='1280*t/5.042':y=0:eval=frame[drawn]
```

**A before/after on MOVING footage is not the still recipe.** Upscale Video's plates
are two clips, not two stills, and that changes both halves of the device:

```bash
[3:v]format=gray,geq=lum='if(lt(X,1280*(T-0.7)/2.2),255,0)'[mask];
[b]format=yuva420p[bs]; [bs][mask]alphamerge[bm]; [a][bm]overlay=0:0[v1]
```

- **`xfade` DESYNCS two moving clips.** Its output runs `len_a + len_b - duration`,
  which means B is played shifted by `offset` — so during the wipe the left half is
  at time `t` and the right half is at `t - offset`, and the subject appears twice in
  two positions. Fine for Head Swap's stills, wrong for video. Overlay B on A instead,
  both on the same `t`.
- **`crop`'s `w`/`h` are evaluated ONCE at config time** — only `x`/`y` are per-frame.
  A reveal built as a growing crop width renders the full frame from frame 1 and exits
  0, exactly like the `drawbox` trap below. A `geq` alpha mask + `alphamerge` is the
  shortest thing that does animate.
- **Prove the pair before building.** `psnr` of the source scaled 2x against the
  result: the shipped pair reads **y 26.3 dB** — the same shot re-rendered. A plain
  re-encode lands 30–42, a different clip under 15.
- **A 2x upscale is nearly invisible at 446 px full-frame.** Judge candidate crops as
  stills first (`sharp` two extracts, same box, stacked) — full-frame read as "nothing
  happened"; a crop at ~2x of the frame made the detail obvious.

Three things in the Add Foley recipe each cost a rebuild, and none of them error:

- **`drawbox` does NOT animate its `w`/`h` expressions** in this build. A reveal
  built that way renders the FULL waveform from frame 1 and looks like it worked.
  `overlay`'s `x` IS per-frame (`eval=frame`) — build reveals as a sliding cover.
- **The cover must be OPAQUE.** A translucent one still shows the un-played
  waveform through it, which kills the device entirely.
- **`showwavespic` renders flat without gain and a non-linear scale.** Foley sits
  around −42 dB mean, so a linear waveform is invisible. `volume=14dB` +
  `scale=sqrt:filter=peak:draw=full` is the proven recipe. And its background is
  transparent — a white waveform on it reads as a blank image.

**HyperFrames is for a hero made of TYPE and GRAPHICS**, not plates and data: real
brand fonts, a GSAP timeline, designed motion. Tool at `C:/AI/Mpi/video-tool`;
authoring contract in `MadPony-Identity/playbooks/hyperframes-authoring.md` — read
it first, and note its scaffold assumes 1080 × 1920, so a hero must set
`data-width`/`data-height` on `#root` **and** matching explicit CSS or the root
collapses silently. `hyperframes remove-background` cuts a subject to a
transparent PNG, useful for floating one over a plate whichever tool draws it.

## Checklist

- [ ] `preview`: 4/5, 896×1120 (or 512×640), `.webp` q≈90, ≤ 250 KB
- [ ] Rendered at **220 px** and checked there — the flow is identifiable at tile size
- [ ] Nothing load-bearing in the outer 10%
- [ ] Distinct from every other flow's still (two flows on one model must not share one)
- [ ] `video`: 8:5 or 16:9, 1280 wide, `.mp4` H.264, **≤ 2 MB**, 4–8 s, loops seamlessly
- [ ] Hero device matches what actually changes — invisible change → animate the channel, never a fake before/after
- [ ] Rendered at **446 px** and checked there — the change reads without a second look
- [ ] Accent marks use `--accent-heat` / `--accent-frost`
- [ ] Both fields set in `flowsRegistry.js`, placeholder comment deleted
- [ ] Both assets return **200 with the right byte count** from a running instance

## Traps

| trap | why it bites |
|---|---|
| Sizing the hero like a model preview | Model clips play on **hover** and run to 38 MB. A hero **autoplays** on open — over ~2 MB the first slide stalls |
| Composing the still for the hero | The hero is uncropped, the tile is 4/5 `cover` — off-ratio art gets centre-cropped with no warning anywhere |
| A before/after on an audio-only flow | Two identical panels. Animate the added channel instead |
| Expecting the hero to be heard | Autoplay demands `muted`. Audio must be drawn |
| Reusing a model preview | How Head Swap ended up wearing a lingerie portrait, and how Extend Video and Add Foley ended up as the same card |
| `drawbox` with an animated `w` | It does not animate in this ffmpeg build, renders the full graphic from frame 1, and exits 0 — the reveal looks built and is not. Use `overlay`'s `x` with `eval=frame` |
| `crop` with an animated `w` | Same failure, different filter: only `x`/`y` are per-frame, so the crop stays full width and the wipe never happens. `geq` alpha + `alphamerge` |
| `xfade` between two moving clips | It shifts B by `offset`, so the subject is at two different moments either side of the seam. Stills only |
| Centre-cropping a multi-panel product to 4/5 | The Character Sheet is 8:5 with three panels — a 4/5 crop throws two of them away and the tile becomes an ordinary portrait. Recompose from the panels, and give each cell the panel's OWN aspect or the figures float in mismatched grey |
| A colon in an ffmpeg filter option value | `stats_file=C:/…` is parsed as an option separator and dies as `Invalid argument` on an unrelated option. Read `psnr` off stderr instead |
| A translucent reveal cover | The un-played half shows straight through it. Opaque, in the band's own ground colour |
| Judging a hero from a contact sheet | Everything reads at 620 px. Render at **446 px** — the real hero width — before believing it |
| Running the `sharp` snippet from the scratchpad | `ERR_MODULE_NOT_FOUND` for an installed package; it resolves from the script's own location. Run from the repo root, or keep the script in the scratchpad and pass `NODE_PATH=<repo>/node_modules` |
| `sharp` `.composite()` then `.extract()` in one chain | Pipeline order is FIXED and `extract` runs FIRST, so the base shrinks out from under the overlay. It dies with `Image to composite must have same dimensions or smaller`, naming the OVERLAY while the base is at fault. Two pipelines, the first ending `.png().toBuffer()` |
| Saving an already-encoded webp buffer through `sharp` again | It re-encodes at the DEFAULT quality instead of copying bytes: a `quality: 90` tile written at 49,674 B came back 26,682 B, no error, no warning. Encode ONCE straight to the destination; the only symptom is a suspiciously small file |
| `sharp(f).extract({...}).stats()` | `.stats()` reads the INPUT file and ignores the chain, so six patches at six offsets return byte-identical means. Reads as "the region is flat"; it is "you measured the whole image six times". Use `.raw().toBuffer()` |
| Judging a strip width by eye on a contact sheet | Estimated ~12px twice for bands that measured 31px and 47px — a 2-4x error, in the direction that would have thrown away the better composition. Measure the run of dark pixels at the real 220px |
| Before/after plates from two different runs | Everything shimmers, not just the head, and the device collapses. Diff them first |
| Forgetting the idle filter | Tiles render at `saturate(.92) brightness(.92)`; art that is just contrasty enough in isolation reads flat in the grid |
| Generating into `:3000` | That is normally the user's live session |
| A GIF | An order of magnitude larger than the same clip as H.264, and it bands on the dark UI |
| Probing the hero without a project open ON the Gallery page | `MpiFlowLibrary` gates its Open button on `state.currentPage === PAGE_GALLERY`, and a bare `Events.emit('flow:open')` mounts `MpiBaseFlow` into an overlay that never becomes visible. The `<video>` still reports `paused:false`, `muted`, `loop` and a RISING `currentTime`, so the probe passes while nothing is on screen. Assert `getBoundingClientRect().width` too — a real hero measures ~446 px, a hidden one measures 0 |
| `document.querySelector('video')` to find the hero | It returns the FIRST video in the document, which is a gallery card's — an open project mounts several. It reads `paused:true`, `cssW:0` and a foreign resolution, which is the EXACT signature of the hidden-overlay trap above, so the probe reads as "the hero is broken" while the hero is playing fine two nodes away. Select it by src: `[...document.querySelectorAll('video')].find(v => /<slug>/.test(v.currentSrc))` (MPI-567, 9 videos in the DOM) |
| Assuming a portrait plate can fill an 8:5 hero | Model output is often portrait (896×1088), and an 8:5 band off a 896-wide plate is only 560 tall — so a 652 px subject does not fit at ANY vertical offset, and no amount of nudging the crop finds one that works. Do the arithmetic before cropping and decide what to LOSE: Draw It In's hero keeps the head and the gesture and drops the feet, and the 4/5 tile — which is portrait — carries the full figure and its contact shadow instead. Two assets, two jobs (MPI-567) |
| Hand-converting an `oklch()` token to hex | `--accent-heat` is fractionally out of sRGB gamut, so a hand conversion drifts and a computed style serialises back as `oklch()`. Read it off a 1x1 canvas instead — see the accent bullet above |
| Assuming the two clips you were handed really are source and extension | Cheap to prove, expensive to be wrong about: trim the result to the source frame count and run ffmpeg `psnr`. The same shot re-encoded lands ~30–42 dB; a different clip lands under 15. Every number in the device — the marker percentage above all — is a lie if this was never checked |
