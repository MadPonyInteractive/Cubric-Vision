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

### For Fabio to judge in the app (after the flow is wired)

1. Auto: drag / scale / Shift-scale / Alt-rotate the object over the scene — does the placement
   read as a hint rather than a paste?
2. Remove Background on a source BiRefNet handles well, and one it whiffs — then Erase/Restore.
3. Toggle it off and back on after brushing: the erasures must still be there.
4. Switch Auto → Manual → Auto: the box squares and unsquares about its own centre.
5. **The open call:** Erase/Restore are disabled in Manual, because Manual shows no object. Is
   that right, or should Manual get a surface for the object?
