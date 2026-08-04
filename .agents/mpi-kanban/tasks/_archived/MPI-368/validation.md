# MPI-368 — validation

**Verify mode:** user-ux. Everything below is the gate BEFORE asking the user to
look; it does not replace their pass.

## Automated — PASSED 2026-08-04

- **Suite:** `node --test "tests/*.test.cjs"` → **363 pass / 0 fail** (343 before
  this card; +15 `tests/shape-gizmo.test.cjs`, +4 registry guards, +1
  preview-contract guard).
- **Lint:** `npm run lint` and `npm run lint:components` → **0 errors**, 18
  pre-existing warnings, unchanged in count and none in the new files.

### Unit — the gizmo maths (`tests/shape-gizmo.test.cjs`)

Seeding and disarming · a 90° rotation moving the handles (and the UNROTATED
position correctly missing) · the hit radius staying constant on screen · corners
winning a zoomed-out tie · body being the LOCAL box, not the bbox · a handle drag
following the shape's own axis · the opposite edge anchored · the min-size floor
pushing back the moved edge · ALT-rotate leaving the pivot handle exactly where it
was while the centre orbits it · ALT-on-body rotating about the centre · `buildPath`
scaling per destination and carrying the rotation · triangle points · null for
nothing-to-rasterise · `clear()` reporting truthfully · a new image dropping the
shape.

### Real pixels — Chromium, 22 assertions, ALL PASSED

Temp module under `js/`, served off the running :3000, imported via `playwright-cli`,
**deleted after**. 2048² source, so the two destinations sit at different scales
(mask `_scale` 0.75, paint 1.0) and a path built for one would be visibly wrong in
the other.

- A **45°-rotated ellipse** fills along its rotated major axis and leaves the
  unrotated axis empty — the card's own rotation criterion, in pixels.
- **Add → Subtract** of the same shape returns the mask to **0 px at the `>= 128`
  cut** (see the caveat below).
- Each commit books **exactly one** undo entry; a **zero-area** shape books none and
  returns `false`; **Ctrl+Z** after a commit restores the layer.
- **Fill** lays down the picked colour (`#3366cc` read back byte-exact) at the paint
  layer's own scale; **Erase** punches it out; neither touches a mask pixel.

### Negative controls — 9, ALL BIT, all restored byte-identical

`_toLocal` rotation direction · the drag delta not un-rotated · the rotate pivot not
orbiting the centre · `buildPath` ignoring the layer scale · `paintShapes` moved into
`_MASK_TOOLS` · `commitShape` recording before its no-op guard · `commitShape` off
the `_methods` allowlist · the shape surviving the discard seam · and against the
PROBE itself, dropping `rot` from the ellipse path (2 assertions went red).

One sabotage did **not** bite and was not a coverage hole: flipping
`Math.cos(-rot)` → `Math.cos(rot)`. Cosine is even, so it was a mathematical no-op.
Re-run against the `sin` term, it bit.

## The finding this card did NOT fix

`MaskManager.getURL()` exports **any non-zero alpha as solid white**, while
`fillHoles()` cuts at `>= 128`. Antialiasing means `destination-out` can never fully
remove what an antialiased fill put down, so an erase leaves a sub-threshold rim that
the export then promotes to full mask.

Measured, both at 2048²:

| Round trip | non-zero alpha | at `>= 128` |
|---|---|---|
| Shape Add → Subtract | 1973 px | **0** |
| **Shipped mask brush**, paint → erase over one path | 1605 px | **0** |

The brush number is the point: this predates MPI-368 and belongs to the export
threshold, not to the gizmo. Left alone deliberately —`getURL()` is on the path of
every masked generation, and the root-cause rule says brief before changing a shipped
shared primitive. Recorded in `docs/masking-shapes.md` and on `MPI-424/brief.md`.

## Round 1 — USER-VERIFIED 2026-08-04

"Everything seems to be working fine." Follow-up ask: **Shift resizes without
deforming**. Shipped and covered below; needs its own look.

### Shift (added round 2) — automated PASSED

Suite **370/0**, lint 0 errors. Five new unit tests: a corner keeping the CURRENT
2:1 (not snapping to 1:1) with its anchor fixed · a right-edge drag pulling the other
axis with it and staying vertically centred · a **top/bottom** handle driving from
height and re-centring the width · the min-size floor moving both axes together · a
plain drag still deforming · a rotated shape locking in its OWN frame · 40 chained
`drag()` calls holding the ratio exactly.

**Five sabotages, four bit.** Two of the greens were REAL coverage holes, not no-op
sabotages — nothing exercised the `u[0] === 0` branch (top/bottom handles) and
nothing called `drag()` more than once — and both are now covered. The remaining
green is genuinely undetectable: reading the ratio live instead of from the drag-start
snapshot returns the same number, because the lock is idempotent. The code keeps the
snapshot (it is what makes the gesture independent of mousemove count) and the comment
that claimed drift was corrected to say so.

## Round 2 — USER-VERIFIED 2026-08-04 (Shift)

"Okay, cool, it works." Two follow-ups, both shipped:

- **7.5° rotation snap.** There was no snap before — rotation was free. Four new
  tests: the result always lands on the grid, an ODD stop (7.5° itself) is reachable
  so the grid is not secretly 15°, an off-grid start is pulled back onto the grid,
  and the pivot handle stays anchored through a snapped rotation. **Five sabotages,
  all bit** after two greens exposed real holes (every test started at `rot = 0`;
  15° multiples are also 7.5° multiples).
- **New `shapes_stroke` icon.** Three shapes at 24px with a 2px stroke read as a
  blob. Now square + circle, verified RENDERED at 24px and 96px beside `brush`,
  `mask_adjust_stroke` and `search` in Chromium.

Suite **374/0**, lint 0 errors.

## User pass — PENDING (rotation snap + icon)

1. Open an image, **Mask → Shapes**. Drag the shape and each handle; check the
   outline tracks the cursor at 3 zoom levels and after a pan.
2. Hold **Alt** over a handle and drag — the shape should swing around that handle
   while it stays under the cursor. Alt over the middle spins about the centre.
3. Switch kind (rectangle / triangle / ellipse); press **Add**, then move the shape
   and press **Add** again — both stamps should be in the mask, the gizmo still live.
4. **Subtract** over a stamp; drag off the gizmo and confirm it PANS (never paints).
5. **Paint → Shapes**: pick a colour in the Paint tool first, then Fill and Erase.
6. Switch rail tool and come back — the gizmo must be **gone**, and the committed
   pixels must still be there.
7. Ctrl+Z after each commit.
