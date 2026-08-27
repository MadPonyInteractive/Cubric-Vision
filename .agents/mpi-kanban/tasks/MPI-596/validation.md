# MPI-596 — validation

## Stage-2 step kind (`place` / `MpiStepPlace`) — 2026-08-27

**Verify mode:** `user-ux`. The mechanical half below is green; whether the gizmo FEELS right —
and whether the brush being Auto-only is acceptable — is Fabio's call.

### Automated

| Check | Result |
|---|---|
| `node --check` on all 6 touched files | PASS |
| `npm run lint:components` (`--max-warnings=0`) | PASS, clean |
| `npx eslint` on MpiStepPlace / MpiBaseFlow / ShapeManager | PASS, no output |
| `npm test` | **747/747 pass, 0 fail** |
| Browser console during the probes | **0 errors** (3 warnings, all from the probe's own `getImageData`) |

### Live probe — own `app:isolated` instance, never `:3000`

Instance on `127.0.0.1:60791` with its own profile; killed by PID tree afterwards and
`curl :3000` re-checked at `200`, so Fabio's session was never touched.

**The composite law** — `alpha = (bgMask OR manual) AND NOT subtract`, on a 4×4 with a red RGB,
a half-cut bgMask, one restore square and one erase square:

| Pixel | State | Result |
|---|---|---|
| erased, inside bgMask | bg 1, subtract 1 | `[0,0,0,0]` — gone |
| untouched, inside bgMask | bg 1 | `[255,0,0,255]` — **original red**, not the bgMask's colour |
| restored, outside bgMask | bg 0, manual 1 | `[255,0,0,255]` — Restore reveals REAL pixels |
| untouched, outside bgMask | bg 0 | `[0,0,0,0]` — cut |
| same call with `bgMask = null` | toggle OFF | erasure survives; the rest goes opaque, so **the brush works with the toggle off** |

**The two-layer claim, under real pointer events** — component mounted, seeded with a cut-out so
the toggle round-trips off its cache with no dispatch:

| Step | Erased px in `userMask.subtract` |
|---|---|
| stroke A | 1600 |
| toggle OFF → ON, then stroke B | 3192 — **A intact** |
| Undo ×1 | **1600 exactly** — undo is per-gesture |
| Undo ×2 | 0, and the button disables |

**The dispatch adapter**, `stepValueToMedia('place', …)`:

- `auto` → `placed.png`, **512×512 (the SCENE frame)**, 7145 bytes. Transparent outside the box,
  transparent at the erased corner, green at the kept corner, transparent below the bgMask cut.
- `manual` → `object.png`, **256×256 (the object's OWN frame)** — brief law 4, a reference must
  not be embedded at ~200px of a 1024 frame.
- `manual` with `removeBg: false` → the erasure survives, the cut region goes opaque.
- `stepValueToParam('place', …)` → `{x:172, y:72, width:256, height:256}` for a gizmo at
  `cx 300, cy 200, half 128` — absolute top-left source px, the unit `Mpi Box` consumes.

### What is NOT verified here

- **The Remove Background DISPATCH itself.** The probe seeds a cut-out and exercises the cached
  toggle path; the `enqueueGeneration` leg needs BiRefNet installed and a running engine, so it
  lands in the flow's live run (`05-verify.md`).
- **Anything downstream of the step** — no FlowDef exists yet, so the kind has never been mounted
  by the carousel in anger.

> **SUPERSEDED IN SHAPE, NOT IN SUBSTANCE (2026-08-27).** Fabio split the cleanup into its own
> stage, so this kind becomes two (plan.md § Plan Drift). Every measurement above still holds —
> they are against `composeObjectAlpha` and the reported value, both of which survive the split —
> so re-run these probes against the pair rather than re-deriving them. Item 5 below is ANSWERED:
> the brush gets its own stage and therefore serves both modes.
>
> **The re-run happened. See § The split below — every figure reproduced.**

## The split into `cutout` + `place` — 2026-08-27

**Verify mode:** still `user-ux`, and that gate is still OPEN — no FlowDef declares either kind
yet, so Fabio has still not seen any of this in the app.

### Automated

| Check | Result |
|---|---|
| `node --check` on all 6 touched files | PASS |
| `npm run lint:components` (`--max-warnings=0`) | PASS, clean |
| `npm test` | **747/747 pass, 0 fail** |
| Browser console during the probes | **0 errors, 0 app warnings** (2 warnings, both from the probe file's own `getImageData`) |

### Live probe — own `app:isolated` instance on `127.0.0.1:54197`

Killed afterwards by verified PID lineage (port owner → parent chain → the `electron.exe .` root
whose parent was my own `launch-instance.mjs`), never by a name/CommandLine pattern. `:54197` gone
and `curl :3000` re-checked at **200**, so Fabio's session was never touched.

**Everything the pre-split build measured, reproduced against the split pair:**

| Claim | Pre-split | After the split |
|---|---|---|
| composite law, all six cells | see table above | **identical, pixel-exact** |
| stroke A → toggle OFF→ON → stroke B | 1600 → 1600 → 3192 | 2074 → **2074** → 4148 |
| Undo ×1 (per-gesture) | back to 1600 | back to **2074 exactly** |
| Undo ×2, button disables | 0, disabled | **0, disabled** |
| Auto stamp is the SCENE frame | 512×512 | **512×512** `placed.png` |
| `stepValueToParam('place', …)` | `{172, 72, 256, 256}` | **`{172, 72, 256, 256}`** |

(The stroke pixel counts differ from the earlier run only because this probe drags a different
distance; what is being asserted is that B leaves A intact and one Undo returns exactly A.)

**New behaviour the split introduces, each measured:**

| Claim | Evidence |
|---|---|
| An untouched `cutout` derives **nothing** | mounted, never touched → `stepValueToMedia('cutout', …)` is **null**, so `image2` reaches the run as supplied |
| …and reports nothing on mount | `onChange` never fired; `getValue()` gives `userMask: {manual: null, subtract: null}` |
| A brushed `cutout` derives the object at its OWN frame | `object.png`, **256×256** — brief law 4 |
| **Reset returns it to skipping** | after Reset, the adapter is **null** again |
| `place` in **Manual derives nothing** | `stepValueToMedia('place', {mode:'manual'}, …)` → **null**; the clean object is already `image2` |
| `cutout` carries no `STEP_PARAMS` | `stepValueToParam('cutout', …)` → null |
| **The `sourceValue` seam works end to end** | stage 2 erases one quadrant of a 256×256 object → stage 3's canvas keeps **ratio 0.750** of its object pixels (63148 → 47361). Stage 3 SEES what stage 2 did. |
| The Remove Background switch is really wired | the probe asserted `switchFound: true` on the mounted `.mpi-step-cutout__bg` before clicking it, so the "toggle preserved the erasure" row above is a real toggle and not a silent no-op |

### What is NOT verified here

- **The Remove Background DISPATCH itself** — unchanged from the note above: the probe seeds a
  cut-out and exercises the cached toggle path; the `enqueueGeneration` leg needs BiRefNet and a
  running engine, so it lands in the flow's live run (`05-verify.md`).
- **Anything downstream** — no FlowDef exists yet, so neither kind has been mounted by the
  carousel in anger, and `_deriveRunMedia`'s new `sourceRole` resolution has been exercised
  through `stepValueToMedia` directly rather than through a real Run.
- **`npm run test:desktop`** — deferred to the flow-wiring step, where there is something for a
  desktop spec to actually drive.

### For Fabio to judge in the app (after the flow is wired)

**Stage 2 — the `cutout` step (the object alone):**

1. Remove Background on a source BiRefNet handles well, and one it whiffs — then Erase/Restore.
2. Toggle it off and back on after brushing: the erasures must still be there.
3. Is the checkerboard the right way to show what has been cut away? It is there because the
   canvas is CLEARED where alpha is 0, so a white object on a flat ground would be
   indistinguishable from a removed background.
4. **Press Next without touching anything** — the object must reach the run exactly as supplied.
   Measured true; worth feeling once, because it is the whole reason the stage is skippable.

**Stage 3 — the `place` step (the scene):**

5. Auto: drag / scale / Shift-scale / Alt-rotate the object over the scene — does the placement
   read as a hint rather than a paste?
6. Switch Auto → Manual → Auto: the box squares and unsquares about its own centre.
7. **Go BACK to stage 2, erase more, come forward again** — stage 3 must show the newer cut.
   This is the `sourceValue` seam; measured at ratio 0.750, but it is a feel thing too.

> **Item 5 of the pre-split list is ANSWERED and needs no call from you.** It asked whether
> Erase/Restore being disabled in Manual was right. The split removes the question: the brush has
> its own stage and serves both modes, and the disabled state is gone along with the third tool.

## User-UX gate — Fabio, 2026-08-27 (in the app, after the wiring landed)

**Both routes run.** Fabio drove the flow end to end in the app and reported "I've tested the
two different routes, and they both worked" — so Auto and Manual both dispatch, both reach the
graph with the right wiring, and `Input_Mode` is arriving. This is the first time any of this
card's work has been seen through the app rather than on the bench.

**Stage 2 (`cutout`) confirmed by hand:** remove background, delete pixels, bring pixels back,
and the undo system. All four are the behaviours `validation.md` measured on a mounted
component earlier in the card; this is the human confirmation of the same surface.

### Two findings from that session, both actioned

1. **ALT-rotate was undiscoverable.** The gesture is ALT + drag a HANDLE (`MpiStepPlace`
   mousedown needs a `shape.hitTest` hit, so a bare ALT-drag on the canvas does nothing), and
   it is AUTO-ONLY — Manual's box is a region and swinging it would say the model reads it at
   an angle. Nothing in the UI named it. The place step's hint now does, along with Shift to
   keep proportions, and it says why Manual has neither. An undiscoverable gesture is the same
   failure as an inert control: the user never finds it, and the flow looks like it cannot do
   the thing it can.

2. **The prompt field shows in Auto, and `prompts.md` had specified Manual-only.** That was a
   deliberate deviation when the FlowDef was written, and it is NOT inert: node 18
   concatenates `Input_Positive` onto whichever instruction the switch picked, so the words
   reach the model in both modes. What was wrong was the COPY — the placeholder led with a
   pose example, and a pose only buys anything in Manual (in Auto the stamp already pins the
   viewpoint, so asking for another fights it). Placeholder now leads with scene lighting,
   which is the half that works in both modes and the one thing a baked prompt can never name;
   the pose example is kept and marked Manual.

   **Still open for Fabio:** whether to hide the field in Auto outright, matching
   `prompts.md`. Not free — the field row is built by the frame at slide render while the
   mode radio lives inside `MpiStepPlace` and changes without re-rendering that row, so
   mode-conditional visibility needs a new seam between gizmo and frame. Recommendation is to
   keep it: it is live rather than inert, and lighting is genuinely useful in Auto.

### Hint readability + the escaping bug behind it (Fabio, 2026-08-27, on screen)

Fabio's screenshot: the place step's guidance rendered as one centred monospace wall with
no breaks, and it explained Manual's redraw trade-off while he was sitting in **Auto**,
where none of it applies. The same screenshot showed the prompt placeholder rendering as
just `e.g.` — which turned out to be a separate, older bug.

**1. `MpiInput` did not escape its markup (root cause, shared primitive).**
`placeholder="${props.placeholder || ''}"` interpolated raw into an HTML attribute, so a
double quote CLOSED the attribute and everything after it vanished — no error, no warning.
The Object Stamp placeholder contains a quoted example, hence `e.g.` and nothing else.
`value="${displayValue}"` had the identical hole, so **any user typing a quote into any
text input broke their own field**, and the textarea's body needed it too (element content,
so `<` matters). All three now go through one `esc()`. Fixed in the primitive rather than
by removing the quotes from the copy — the symptom fix would have left the bug for the next
caller. `MpiTreePicker` already had its own `escapeHtml`; no other primitive interpolates
a placeholder.

**2. `hint` is now structured, and mode-aware.** It was a single `<p>` fed by
`textContent`, so a step with more than a sentence to say had no way to break it up. It
now accepts three shapes, the first two unchanged for every existing flow:

| shape | renders |
|---|---|
| string | one paragraph, exactly as before |
| array | one paragraph per entry |
| object | `{ base, <variant> }` — `base` always, plus the entry matching the gizmo's reported `mode` |

The object form needed a seam that did not exist: the Auto/Manual radio lives **inside**
`MpiStepPlace`, not in the frame's declared fields, so the frame never knew the mode
changed. The gizmo's `onChange` now repaints the hint block in place — guarded on an actual
mode CHANGE, because that callback fires on every drag frame, and a full `_renderSlide`
would tear down the live canvas mid-gesture.

CSS: a flex column of paragraphs, **left-aligned** (centred prose gives the eye no
consistent edge to return to past two lines), 68ch, with the first line carrying `--ink-2`
so the block has somewhere to start.

**3. The copy was split per mode.** Auto gets the ALT-rotate and Shift gestures plus what
Auto is for; Manual gets why it has no rotation, what the redraw buys, and what it costs.
Both share two `base` lines. Regression test asserts Auto never carries Manual's redraw
language and Manual never mentions ALT — the two halves of exactly what was on screen.

**Verified:** 751/751 unit (3 new), 29/29 desktop, lint clean.

### The slide could not be scrolled to its top, and the hints were still too long

Second screenshot round from Fabio, and both complaints were right.

**1. The copy was wrong, not just long.** Two specific errors, both mine:

- Manual said *"drag the object where it should sit"* — **there is no object in Manual.**
  The gizmo draws the object only in Auto (`MpiStepPlace._draw`: `if (_mode === 'auto' && comp.placeImage)`);
  Manual shows a bare region box. The line described a gesture the user cannot perform.
- Auto said to *"include room on the ground for its shadow"* — **self-defeating in Auto**,
  because Auto's box IS the object and growing it just makes the object bigger. The
  shadow margin was never the user's job: the graph grows the write-back ~30% off the
  box side automatically (law 8, node `225`).

Rewritten to two short lines per mode, no shared `base` — the modes share almost nothing
on screen. Manual's wording is Fabio's own. The mode radio already carries a tooltip
explaining what each mode does, so the hint no longer repeats it.

**2. The slide could not be scrolled to its top — a real CSS trap.**
`.mpi-base-flow__slide` was `align-items: center` **and** `overflow-y: auto`. Once the
content is taller than the stage, centring pushes the overflow ABOVE the scroll origin,
where `scrollTop: 0` already sits — so the top is unreachable and only the bottom half
scrolls. Measured in the real renderer at a 420px stage: content 788px, `maxScroll` 406,
and the work block's top edge at **-406px** relative to the viewport with no way to bring
it down. That is why Fabio lost the step title and the top of the image.

Fixed with `align-items: safe center`, which falls back to flex-start exactly when
overflow would occur. Regression spec: `tests/desktop/flow-slide-scroll-reaches-top.spec.js`.

**THE MUTATION TEST EARNED ITS KEEP, and the first two runs were false greens.** The spec
passed with the fix removed, twice, because the first attempt shipped TWO fixes —
`safe center` plus `margin: auto` on the work block — and **each independently defeats the
trap, so each masked the other.** An auto margin OVERRIDES `align-items` on a flex item
and resolves to 0 under overflow, which is flex-start by another name. Only removing both
went red. `margin: auto` was then deleted so the one remaining fix is load-bearing and a
future mutation cannot be hidden; a comment in the stylesheet says why not to re-add it.

Sweep: one other stylesheet pairs `align-items: center` with a vertical scroll
(`MpiGroupHistoryBlock__left`) but it is `flex-direction: column`, so centring is the
CROSS axis and the scroll axis is governed by `justify-content` — not the same trap, left
alone.

**Verified:** 751/751 unit, 30/30 desktop (one new), lint clean, and the new spec proven
to fail without the fix.
