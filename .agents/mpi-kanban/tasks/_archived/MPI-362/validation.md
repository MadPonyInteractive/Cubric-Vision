# MPI-362 — validation

## Proven

**Composite math + polarity** — `node --test tests/mask-composite.test.cjs`, 2/2 pass.
Red base + blue overlay + right-half-white mask: the unmasked half stays red, the masked half
becomes blue, and swapping base/overlay (which is exactly what Subtract does) inverts the
result. Feather test: the seam pixel blends both sources while pixels 45px away stay pure, so
the blur cannot bleed across the frame.

**The route, live** — router mounted alone on :3999 from a repo-root harness (the
`tool_test_new_route_without_restart` pattern), real project folder in TEMP:

```
status 200 {"success":true,"itemId":"1111...","filename":"composite_001.png",
            "pixelDimensions":{"w":64,"h":64},"thumbPath":"/project-file?path=...thumb.jpg"}
left [255,0,0] right [0,0,255]      # base outside the mask, overlay inside
sidecar exists true
```

Sequenced filename, `.meta/<uuid>.json` sidecar and the gallery thumb all land. Harness deleted
after the run; `routes/projects.js` requires cleanly.

**Lint** — eslint clean on all five touched/added frontend files.

## The Sharp trap this cost

`removeAlpha()` before `joinChannel()` makes libvips **silently drop the joined channel** —
sharp 0.34.5 / libvips 8.17.3 returns a 3-channel image with no alpha, so the composite pastes
the overlay over the WHOLE frame and the mask does nothing. First run of the test failed exactly
that way (every pixel blue). `flatten({ background: '#000000' })` guarantees the same 3 channels
and joins correctly. Verified by probing channel counts directly:

```
removeAlpha + joinChannel  -> channels 3   (join dropped)
joinChannel (no removeAlpha)-> channels 4  px [0,0,255,0]  (alpha honoured)
```

## Hole fill (follow-up, same session)

**USER-VERIFIED the base feature live** after restarting the app (the 404s were the old server
process — the route is main-process, Ctrl+R cannot pick it up).

Then: a painted OUTLINE only composited the outline. Every other mask consumer in the app fills
it — `MaskDetailerPipe` runs `contour_fill: true` in all seven detailer graphs, and
`InpaintCropImproved` carries `mask_fill_holes: true` — so the composite now does too:
`fillMaskHoles()` floods the background inwards from the borders and promotes any dark pixel the
flood never reaches. Runs BEFORE the feather, so the blur softens the real edge and not both
sides of the stroke. `fillHoles: false` in the request body opts out.

Route re-verified with a hollow 40×40 square outline:

```
ring interior (50,50) [0,0,255]   # filled → overlay
outside       (5,5)   [255,0,0]   # base
ring edge     (30,50) [69,0,185]  # feathered blend
```

`tests/mask-composite.test.cjs` now 3/3 (polarity, outline fill + opt-out, feather).

**Trap the fill refactor exposed:** moving the blur out of the mask's own sharp pipeline broke
it — `sharp(rawBuffer, { raw: { channels: 1 } })` reads one channel but writes back **three**
(sRGB), so `joinChannel` got a 3x-sized alpha plane and the overlay covered the whole frame.
`.toColourspace('b-w')` is needed on the way OUT as well as in. Caught by the feather test.

## NOT yet verified — needs one user click-through

The UI path (context-menu gate → dialog → new history entry) is code-verified only. The running
app on :3000 predates the route, so:

1. **Restart the app** (backend route + service are main-process — Ctrl+R will not pick them up).
2. Open an image group with ≥2 entries, paint a mask on one, ctrl-select the two, right-click →
   **Mask composite**.
3. Check both directions and that Escape/Cancel leave no backdrop behind.
