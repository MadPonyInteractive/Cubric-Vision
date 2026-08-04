# MPI-431 — validation

Verify mode: **user-ux** for the app half; **mechanical** for the workflow half.

## Workflow half — VERIFIED 2026-08-03

Verified by re-running the audit against the **runtime** graphs rather than the raw
sources or the API templates, so the result proves the sync propagated end to end:

```
node .agents/mpi-kanban/tasks/MPI-431/audit-mask-destroyers.cjs
total nodes: 20   destroying: 0        (baseline: 18)
```

The audit BFSes from the `Input_Mask`-titled node in each graph and reports any
`InpaintCropImproved` / `MaskDetailerPipe` / `GrowMaskWithBlur` it reaches — so a node
that stops being fed by the user mask drops off the list on its own, and a node that is
only reached indirectly still counts.

`scripts/sync-raw-workflows.mjs` passed its own gate on the way through: *"All 6 file(s)
conform to the injection rules"*, then `orchestrate.py` baked 13 runtime files. Raw
sources committed `ae49f385`; the 19 generated files are staged, not committed — they
close with `/mpi-end` as one generated-workflow commit.

**Not covered by this check:** whether the visual RESULT is better. Nobody has yet run a
masked edit with a deliberate ring and looked at the output. The audit proves the graphs
stopped reshaping the mask, not that the sampler does something good with a ring.

## App half — BUILT + MECHANICALLY VERIFIED 2026-08-03, awaiting the user in the app

**Automated:**

- `node --test "tests/*.test.cjs"` → **323 pass / 0 fail** (was 318 — `mask-adjust.test.cjs`
  adds 5).
- `npm run lint` → 0 errors, 18 warnings; `npm run lint:components` → 0 errors, 3 warnings.
  Identical pre-existing set to MPI-382 (`heroStats.js`, `preloadStyles.js`,
  `MpiAppLibrary.js`, `MpiPromptBox.js`); none in a file this card touched.
- **Five negative controls, all FIRED** (script asserts the sabotage APPLIED before
  trusting the run, and asserts a byte-identical restore): drop `_recordUndo()` from
  `fillHoles`; drop its `subtractCtx.clearRect`; make it read `maskCanvas` unconditionally
  so the live preview is dropped; delete the bottom-border seed row from the flood; remove
  `fillMaskHoles` from `MpiCanvas._methods`.

**Run against REAL PIXELS, not source text** — the source-text tests cannot prove a flood
fill works. A temp module under `js/` served same-origin off the running :3000, importing
the real `MaskManager` in Chromium, 512² working size; deleted after the run.

| Check | Result |
|---|---|
| ring (disc r=150, hole r=60) → Fill | centre alpha **0 → 255**, hole closed |
| **outer edge must not move** | **149 → 149** |
| pixels gained vs πr² prediction | **11 305** vs 11 310 (the 5 is the antialiased rim) |
| undo entries | exactly **1** |
| solid mask (no holes) | returns `false`, **0** undo entries, 0 px changed |
| notch cut through to the border | correctly **not** a hole — returns `false`, centre stays 0 |
| Fill with a `grow: 10` preview up | bakes both: outer **158**, hole closed, **1** entry, preview torn down |
| subtract after Fill | **0 px** — cleared, so the erases cannot be punched twice |

### Round 2 — the visible seam (user, 2026-08-03)

> *"it has this little edge that you can see, a very thin edge. I get the same issue when I
> do a mask fill in the ComfyUI mask editor."*

**Real defect, not an artefact.** Punching a hole leaves alpha ramping 255→0 over a pixel or
two. The single-pass fill classified the ramp's inner half as MASK (`alpha >= 128`), so it was
neither flooded nor written — leaving a semi-transparent ring exactly at the old hole boundary,
plainly visible at the overlay's 70% opacity. That the ComfyUI mask editor does the same thing
confirms it is a property of threshold-then-fill, not of this implementation.

Ruled out first, by reading the code rather than guessing: `MpiCanvas` has no mask-contour
outline renderer — the only `setLineDash` users are the crop box, the grid and the brush ring —
so it could not have been an overlay artefact.

Fixed at the definition with a second flood: seed from the hole interiors, expand into any
neighbour that is neither `outside` nor already fully opaque. Re-measured on the same 512² ring:

| Check | Before fix | After fix |
|---|---|---|
| partial-alpha px inside the hole region | **437** (sampled `220,176,132,88,61,48` — the ramp) | **0** |
| centre alpha | 255 | 255 |
| outer edge | 149 | **149** |
| **partial-alpha px in the OUTER annulus** | 1098 | **1098** — antialiasing preserved |
| undo entries | 1 | 1 |

The `=== 255` wall in the rim flood is load-bearing twice over: solid mask stops the flood, so
it can never escape a hole and harden the mask's outer edge. Relaxing it to a threshold would
crisp the whole outline. Two more negative controls added and **both fired** (delete the rim
pass; drop the opaque wall). Suite **324 / 0**.

### USER-VERIFIED IN THE APP 2026-08-03

User ran Fill on a real mask in the Electron app after the rim fix: **"awesome!"**. The thin
edge is gone. The screenshot also confirms the open-shape case incidentally — a **U-shaped**
mask stroke stayed a U, because its opening reaches the border and is therefore correctly not
a hole. That is the `openC` probe case, seen for real.

**Not felt by the user, and NOT blocking the close:** Ctrl+Z through the live `UndoStack`
(the probe asserted the entry count against a stub recorder, and `fillHoles()` uses the same
`_recordUndo()` path as `applyAdjust()`, which the user did verify under MPI-382).

**Deliberately still open, not defects:**

- `mask_expand_pixels: 6` on all six `InpaintCropImproved` — left at 6 by the user's decision.
  Revisit only if an Adjust shrink reads as swallowed.
- `mask_expand_pixels: 6` — see above. Still the only genuinely open item.

## OUTPUT verified 2026-08-03 — this card's last gap is closed

Everything above proves the graphs stopped *reshaping* the mask (18 destroying nodes → 0,
checked against the runtime graphs) and that the app can close a hole on demand. It did
**not** prove the thing the whole card was for: that a mask with a hole now yields a
different, better edit than one without.

The user ran that comparison directly — **detailing against a mask WITH a hole and a mask
WITHOUT one, both behaved**. The hole survives to the sampler and is honoured. Do not
re-open this as an unknown; it was the standing "unasked question" in two consecutive
handoffs and it now has an answer.
