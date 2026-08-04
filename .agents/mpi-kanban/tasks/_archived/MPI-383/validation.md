# MPI-383 validation

Status 2026-07-28: code complete, **server half proven, canvas half unproven**.

## Proven

- `tests/crop-extend.test.cjs` — 10/10 pass. Covers `planExtendedCrop` (no-pad, left/top overhang,
  right/bottom overhang, rects entirely outside the image), `parseFill` (hex, object, garbage →
  black, never throws), and every snap mode (free edge-ownership, body flush/centre,
  ratio-locked scale snap driven by the horizontal AND the vertical bound).
- Sharp end-to-end, real files: a 784x980 source cropped at x=-100 w=1000 wrote 1000x980 with the
  fill colour outside and untouched source pixels inside; a RESOLUTION crop wrote exactly
  1920x1080. **The two-pass is load-bearing** — the first attempt chained
  `.extend().extract()` and Sharp threw `extract_area: bad extract area`, because extend is
  applied AFTER extraction whatever the call order. Recorded in docs/crop.md.
- `POST /project/crop-media` over HTTP against a live server: both an extended crop and a
  resampled RESOLUTION crop returned success with the right `pixelDimensions`, and the written
  files carry the fill colour in the corner and source pixels in the middle.
- `npx eslint` clean on every touched frontend file.
- Full `node --test tests/*.test.cjs`: 229 pass / 9 fail. The 9 are in
  optional-media-placeholder, permodel-key-allowlist, resolve-model-deps and
  runpod-remote-hardening — none of those specs reference any file this card touched.

## Round 1 live test (user, 2026-07-29) — 3 bugs, all fixed, NOT re-tested

RATIO and FREE confirmed working live, including cropping past the edge and the fill colour.

1. **Output Resolution showed in RATIO/FREE.** `el.hidden = true` did nothing: the component CSS
   sets `display: flex` on `__section`, and an author `display` beats the UA's `[hidden]` rule.
   Fixed with explicit `__section[hidden]` / `__divisible[hidden]` rules in the CSS.
2. **No Apply button (and no Divisible-by) when the tool opened in RESOLUTION.** `setCropSize` was
   never added to MpiCanvas's `_methods` **allowlist**, so `el.setCropSize` was `undefined`,
   `canvas.setCropSize()` threw, and `MpiToolOptionsCrop.setup` aborted at `_pushShape()` —
   everything mounted after that line was missing. Same shape as the `_createDepJob` whitelist
   trap. Fixed by adding it to the list; a source-text test now asserts every `canvas.setCropX()`
   the viewer calls is on the list.
3. **Box stopped matching the typed size after RATIO/FREE → RESOLUTION.** The viewer only
   remembered `_activeCropRatio`, and re-entering crop mode re-fits the largest CENTRED box for
   that ratio — which shrinks a 1920×1080 target back inside the image. Added `_activeCropSize`,
   set by `setCropSize`, cleared by `setCropRatio`, and honoured by `_enterMode('crop')`.

## Round 2 live test (user, 2026-07-29) — ALL PASS, card verified

Every on-screen item below was confirmed by the user in the running app:

1. Dragging a handle past the image edge, in each of the three resolution types. ✅
2. Snapping feel at 8 screen px — accepted as-is, `SNAP_PX` not retuned. ✅
3. Union-fit zoom-out on a box bigger than the image; stays put during the drag, settles on
   release (the anti-chase rule holds). ✅
4. Dashed source-bounds outline legible against a busy image. ✅
5. Apply end to end: new history entry, thumbnail, fill colour where the box hung off. ✅
6. Fill colour persists per project across a tool swap and an app restart. ✅
7. Video crop unchanged (RESOLUTION + fill hidden for `kind: 'video'`). ✅
8. The three round-1 fixes: Output Resolution hidden in RATIO/FREE, Apply present when the tool
   opens in RESOLUTION, and the box re-seeding at the typed pixel size after a family
   round-trip. ✅

### The false alarm that cost round 2 — check mtime vs. process StartTime FIRST

Round 2 opened with "the box does not follow the typed W/H, and Apply is still missing" — which
read exactly like the round-1 fixes having failed. They had not. **The Electron renderer was
running pre-fix code.** The app booted at 23:51:19; `MpiCanvas.js` (the allowlist fix),
`MpiCanvasViewer.js` and `MpiToolOptionsCrop.css` were written at 00:17–00:19, ~26 minutes
later. A renderer only re-fetches ES modules on reload, so the running page never saw them.

The DevTools console proved it outright, and the proof is reusable:

```
TypeError: canvas.setCropSize is not a function
  at el.setCropSize (MpiCanvasViewer.js:1101:20)   <- on disk this call is at line 1110
```

**A stack-trace line number that does not match the file on disk means a stale build, not a
bug.** Cheapest confirmation, before reading any code: compare `ls -l` mtimes of the fixed files
against `Get-Process <pid> | Select StartTime`. Backend files (`routes/projects.js` 23:11,
`services/imageCrop.js` 23:12) predated the boot, so only a renderer reload (Ctrl+R) was needed —
not a restart.

## Follow-up left open (deliberate)

Port the extension to `js/utils/cropTool.js` so video and Apps get it. NOT a flag flip: that tool
is normalized 0–1 (out-of-bounds = negative / >1, and the scrim draw clamps to content bounds),
and video crop is `-vf crop=w:h:x:y` in `routes/videoCrop.js`, which cannot pad — it would need a
`pad=W:H:x:y:color,crop=...` chain, the ffmpeg twin of the Sharp two-pass. User's call
2026-07-29: revisit only if it is actually needed.

For contrast, Resize DOES cover video already because it is a ComfyUI op (`resize.json` /
`resize_video.json`, node `ImageResizeKJv2` with a native `pad` mode; ComfyUI treats a video as
an image batch). Crop deliberately stays local — instant, no GPU, works while Cue is busy, which
Resize cannot (it is disabled while Cue has jobs). That property is what made hand-building the
pad the right trade.
