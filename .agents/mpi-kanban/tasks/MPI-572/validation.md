# MPI-572 Validation

## Automated — PASSED 2026-08-17

| Check | Result |
|---|---|
| `npm test` | **619/619 pass**, 0 fail (4 new in `tests/flow-step-param-binding.test.cjs`) |
| `npx eslint js/` | clean, no output |
| `grep -rn "uiComponent" js/` | only historic prose + `pluginsRegistry.js` (unrelated subsystem) |

## Live — isolated app, port 58953, PASSED 2026-08-17

Own profile + own port (`npm run app:isolated`); the user's `:3000` session was never touched.
Driven with `playwright-cli`, process tree killed after.

| Probe | Result |
|---|---|
| Live `getFlowById('head-swap')` | `fields[0] = {id:'Input_Tier', type:'radio', columns:3, default:1, options:[3]}`; steps carry `param:'box1'` / `'box2'`; `uiComponent` **ABSENT** |
| `flow:open` mounts | `.mpi-base-flow` present; ticker `01 Inputs · 02 Target head · 03 Reference head · 04 Generate` |
| Run slide render | 3 radio buttons `Quality/Turbo/Hyper`, `--mpi-radio-cols: 3`, Quality active, label `Speed`, note `baseline` |
| Note tracks selection | `Turbo → ~25% of time`, `Hyper → ~13% of time`, `Quality → baseline` — proves the option lookup matches and `paint()` gets the ORIGINAL numeric `v` |
| Browser console | 0 errors, 0 warnings |
| App log | no `[ERROR]`, no `MpiFlowHeadSwap` resolution failure after the import was removed |

## NOT verified here — needs Fabio's eyes + a GPU

The run payload end-to-end. Head Swap's empty-run guard needs media in a slot, so a
headless probe cannot reach `_collectInputs`'s output without a project, an image and a real
generation. The unit test pins the assembly (`param` → `injectionParams`, nulls omitted, the
`w/h` → `width/height` rename), but the byte-identical proof is the live diff:

1. `npm run app:isolated` → open Head Swap, drop two images, box both heads.
2. Pick a NON-default tier (Turbo or Hyper) — the default would pass even if the radio were dead.
3. Generate.
4. Diff the dispatched graph from Comfy `/history` against a pre-change run:
   `injectionParams.Input_Tier` must be the **number** 2 or 3 (not `"2"`), and
   `box1` / `box2` must be `{x, y, width, height}` in absolute top-left source pixels.

Reuse is the second live check: reopen a card made before this change and confirm the tier and
both boxes come back (the seed path reads `injectionParams.Input_Tier` and `stepValues`, both
unchanged in shape — `stepValues` deliberately still stores `w`/`h`).
