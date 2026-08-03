# MPI-382 — validation

Verify mode: **user-ux**.

## Step 1 — the preview contract: VERIFIED 2026-08-02

**Automated, before asking:**

- `node --test "tests/*.test.cjs"` → **310 pass / 0 fail** (was 305 — `preview-contract.test.cjs`
  adds 5).
- `npm run lint` → 0 errors, 18 warnings; `npm run lint:components` → 0 errors, 3 warnings. All
  warnings pre-existing (`heroStats.js`, `preloadStyles.js`, `MpiAppLibrary.js`, `MpiPromptBox.js`)
  and none in a file this card touched.
- **Negative-controlled** by sabotaging the real source and confirming the guard bites, then
  restoring: removing the `mountOptions` call failed test 1; removing the thumb-strip clear failed
  test 3; making the discard branch touch `manualCanvas` failed test 4. The first sabotage attempt
  silently MISSED (a literal `\n` replace against a CRLF file, and a second one hit an earlier
  `_autoMaskPicks.clear()` in `_resetAutoPickStateWithToast` instead of the discard branch) — a
  negative control that quietly does nothing reads exactly like a passing test, so both were
  re-run precisely.

**User, in the running app:** no flicker on a preview-less tool switch; the undo system still
behaves; brush strokes survive a switch while the green preview does not. User's words: "no
flickers, undo system works as well".

## Step 2 — the Adjust tool: USER-VERIFIED 2026-08-03, one UX round applied

**User, in the running app:** *"it works freaking awesome"*. Three things came back with it,
all applied the same day:

1. **The Edge button became a Grow / Edge RADIO that gates the sliders.** Not a preference — a
   real defect underneath: `.mpi-tool-options-mask-adjust__slider-row { display: flex }`
   **outranks the UA sheet's `[hidden] { display: none }`**, so all three sliders were on screen
   and the first thing the user did was drag Outward while the mode was Grow and watch nothing
   happen. Fixed at the root (`[hidden]` rule scoped to the block) *and* at the design level: a
   mode radio means the panel can only ever show the live row.
2. **Adjust moved BELOW Detect in the rail** — it operates on a mask that already exists, so it
   reads in the order the work happens.
3. **The graph refills the mask** — raised by the user, now **MPI-431** (`planned`, decision
   recorded the same day, on the MPI-424 umbrella). Not a defect in this card.
4. **Inward's slider track is mirrored** — zero at the right, growing leftward, so the pair
   reads outward-right / inward-left about the mask edge. A negative `min`/`max`, not a CSS
   flip, which would have left the keyboard arrows running backwards. Verified in the browser:
   the handle starts at `max` (0), dragging to `-12` sends `inward: 12` and labels `12 px`, and
   Reset returns it to the right-hand end. **Not yet felt by the user** — that is the one thing
   between this card and `done`.

Re-verified in a real browser after the change (component mounted against a stub viewer): only
`grow-row` visible on mount; picking Edge shows exactly `out-row` + `in-row`; picking Grow puts
it back; an Outward drag reaches `previewMaskAdjust` and labels `7 px`; `destroy()` is clean and
calls `endMaskAdjust`. Suite still **318 / 0**, lint still 0 errors.

## The automated gate, run before that pass

**Automated, before asking:**

- `node --test "tests/*.test.cjs"` → **318 pass / 0 fail** (was 310 — `mask-adjust.test.cjs`
  adds 3, `preview-contract.test.cjs` a 4th on the shared seam).
- `npm run lint` → 0 errors, 18 warnings; `npm run lint:components` → 0 errors, 3 warnings.
  Identical set to step 1, all pre-existing, none in a touched file.
- **Five negative controls, all fired** (script asserts the sabotage APPLIED before trusting the
  run, and asserts the restore): drop `_recordUndo()` from `applyAdjust`; drop its
  `subtractCtx.clearRect`; feed `previewAdjust` its own output back in; delete the Adjust branch
  from `discardPreview`; remove `maskAdjust` from `_MASK_TOOLS`. Each failed the intended test,
  each file byte-identical afterwards.

**Mechanism measured, not assumed** — Chromium, 1536×1536, a drawn 300px circle:

| r | dilate lands | erode lands |
|---|---|---|
| 1 · 2 · 3 · 5 · 8 · 12 | exactly +r | exactly −r |
| 20 | +19 | −21 |
| 50 | +47 | −54 |

The drift at large r is curvature on a 300px circle, not the threshold — the textbook Φ(∓1)
levels are the measured ones. Cost: **8.7 ms** per pass, **17.2 ms** for an edge band ⇒ live at
the working size, so acceptance 2's fallback-to-apply-on-release was never triggered and the SVG
`feComponentTransfer` was not needed.

**Run against REAL PIXELS, not source text** — `npm run server` + playwright, importing the real
`MaskManager` in the browser and measuring a drawn 100px disc (a temp module under `js/` served
same-origin, deleted after; port 3000 released):

| Check | Result |
|---|---|
| the whole `MpiGroupHistoryBlock` module graph imports | OK — the new organism + its CSS load |
| grow 10 / shrink 10 | radius 100 → 109 / 89 (the ±1 is curvature on a 100px disc) |
| **no compounding** — 3 → 0 → 3 → 0 → 3 vs straight to 3 | **identical, 33278 px** |
| zero is identity | preview torn down, mask still radius 100 — untouched by construction |
| edge band 6/6 | centre hollow, outer radius 106 |
| Apply | **exactly 1 undo entry**, manual radius 111, **subtract cleared** (64 px of erase gone) |
| Apply re-snapshots | pristine rebuilt, preview down, sliders free to move again |
| shrink to empty | mask 0 px, nothing thrown |
| `endAdjust()` | all three buffers freed |

That covers plan checks 2, 3, 5 and most of 6 mechanically. **Still needs the user in the app:**
check 1 (does the DRAG feel live — 8.7 ms says yes, but only a hand knows), check 4 (a mask built
by brush / points / text / auto), check 6's Ctrl+Z through the real UndoStack, and check 7 (the
discard rule felt on a rail switch). Plus the panel itself: slider feel, the Edge swap, whether
±50 px is the right range. The card stays in `doing`.
