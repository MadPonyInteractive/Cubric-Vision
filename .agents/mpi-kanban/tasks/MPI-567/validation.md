# MPI-567 — validation

## The `paint` step kind (2026-08-22, session 6)

Static: `node --check` clean on all six touched JS files; `npx eslint js/components/Organisms/MpiStepPaint/ js/components/Organisms/MpiBaseFlow/` clean.

Live: driven in **my own isolated instance** (`npm run app:isolated`, `http://127.0.0.1:58669` —
never the user's port), through a temp module served off the app that mounted `MpiStepPaint`
standalone on a synthetic **1200×800** photo and dispatched real mouse events at the component's
own listeners. Measurement is the alpha bbox + the OPAQUE-PIXEL COUNT of the exported PNG, because
a bbox alone cannot tell a restored stroke from a differently-shaped one. Probe deleted afterwards
(`js/__probe_mpi567.js`), instance killed by the PID launched, `:58669` confirmed gone.

### Mount

| check | result |
|---|---|
| reported `size` | `1200 × 800` — the SOURCE's natural size |
| `paint` with nothing drawn | `null` |
| stage canvas / fit | `1198 × 329`, scale `0.39125`, offset `364.25, 8` |
| controls | 2 mode buttons + colour picker + `Undo` (disabled) + `Clear` |
| **bare form controls** | **0** (`input[type=range]`, `select`, `textarea`) |
| canvas cursor | `none` (the brush ring is the cursor) |

### Strokes, undo, clear — the Ctrl+Z contract

| step | opaque px | alpha bbox |
|---|---|---|
| stroke 1 (image px 300,300 → 750,340; brush 40) | **19529** | `278,279 490×81` |
| stroke 2 (300,600 → 600,610) | **32893** | `278,279 490×359` |
| **Undo** | **19529** | `278,279 490×81` — byte-exact restore of stroke 1 |
| **Clear** | **0** | — |
| **Undo after Clear** | **19529** | `278,279 490×81` |

The bbox matches the drawn geometry to within antialias (a 40px brush from (300,300) to (750,340)
predicts `280..770 × 280..360`). Each mutation reported exactly once: 1 report on mount, then
2 · 3 · 4 · 5 · 6.

### The file the graph would run on

`composePaintLayer(value)` → `paint.png`, `image/png`, **42392 bytes**, **1200 × 800**, **19529**
opaque px, same bbox. The LAYER ALONE at SOURCE resolution — not the composite, not the layer's
own working size.

### Reuse

A second, fresh mount seeded with the reported value restored **19529** px at the identical bbox,
plus `color` and `mode`. That is the Reuse path with no frame change.

### Empty

After a final Clear: `paint: null`, `composePaintLayer` → `null`, `Undo` still enabled (the Clear
itself is undoable).

### Wheel sizing + the eraser branch

| check | result |
|---|---|
| wheel up ×4 from 40 | `60` (5 per tick, matching `InputController`) |
| wheel down ×20 | `2` — clamped at MIN |
| wheel up ×200 | `400` — clamped at MAX |
| stroke at brush 40 | `25274` px |
| switch to eraser → stroke across it | `21297` px (3977 erased) |
| **Undo the erase** | **`25274`** — exact restore |

### Teardown

`el.destroy()` on both instances, hosts removed, nothing left in the DOM.

## NOT verified here

- **The flow itself does not exist yet** — no FlowDef, no op, no runtime graph. This validates the
  step KIND, not Scribble-to-object. The card's own Definition of Done (a live run + a reuse round
  trip, `docs/playbooks/add-flow/05-verify.md`) is still open.
- `mediaRole`'s append path was read and reasoned, not executed — it needs a flow declaring two
  media roles, which is the wiring step.
