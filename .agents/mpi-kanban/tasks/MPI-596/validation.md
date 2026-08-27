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
