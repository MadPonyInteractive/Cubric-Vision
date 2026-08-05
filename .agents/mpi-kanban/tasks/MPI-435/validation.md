# MPI-435 — validation

Status: **BUILT, awaiting the user's in-app pass.**

## Automated

- `npm test` — **438/438**, including 8 new in `tests/brush-presets.test.cjs`. `brushDab.js`
  never touches `document`, so a recording stand-in for the 2D context makes the whole dab
  testable in node with no canvas.
- `npx eslint` on all seven touched JS files — **0 errors**.

## Real-Chromium pixel probe

The recorder proves the INPUTS; a real 2D context was needed for what Chromium itself decides.
Served the repo off a throwaway static server and imported the real module into a Chromium page
(`playwright-cli`), then measured pixels:

| Claim | Measured |
|---|---|
| Two independent `stampDab` calls are byte-identical (the mask twin invariant) | `geometryIdentical: true` over a full 300×300 buffer, scattered preset, fractional centre |
| A scattered dab stays inside `dabExtent()` | furthest ink **55.15px**, extent **65.32px** |
| `aspect` + `angle` really produce a rotated ellipse | Calligraphy at r=50 → **88 × 54** bbox; predicted 87 × 52 |
| Soft falloff keeps its hue | `rgba(255,0,0,1)` → `[252,0,0,101] [255,0,0,67] [255,0,0,33]`; `#e0446b` → `[222,66,106] [221,65,107] [224,62,100]` |
| `flow` converges both ways | 8 spray passes → alpha **247**; 8 erase passes → **8** |

## 🔴 The probe found a real bug, and it is fixed

The first run read `[250,0,0,101] → [167,0,0,67] → [77,0,0,33]` on a soft RED dab: **the colour
darkened toward the rim.** Chromium interpolates canvas gradient stops **non-premultiplied**, so
the CSS keyword `transparent` — which is `rgba(0, 0, 0, 0)` — drags the ramp through BLACK. Every
soft paint stroke would have carried a dark halo, and nothing would have failed.

Fixed by fading to the dab colour's OWN zero-alpha form (`fadeOut()`, which normalises whatever
CSS form the caller used by round-tripping it through `ctx.fillStyle`). Re-measured above: hue
flat, only alpha ramps. A regression test pins the stops.

This is why the probe was worth running — the source-text and recorder tests both passed with
the bug in place.

## Not a bug, but worth knowing

`flow` below 1 means an eraser needs several passes to reach zero, and a single isolated low-flow
dab on the MASK lands under the ≥128 alpha cut `alphaStencil()` reads shapes at. Both are what
`flow` means; a real stroke's 75% dab overlap clears the second one immediately. Recorded in
`docs/masking-tools.md` § The brush preset pack.

## Left for the user

The in-app pass: pick each of the ten in the Brush tool and in Paint, confirm they read as ten
distinct brushes, that the picker survives a tool swap (it persists under the destination's tool
key), and that Ctrl+Z after a scattered stroke leaves nothing behind.
