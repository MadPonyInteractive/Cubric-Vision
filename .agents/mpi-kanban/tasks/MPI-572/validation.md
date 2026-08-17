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

## Live run — CLOSED 2026-08-17 by sidecar read (no app, no `:3000`)

Fabio ran Head Swap on real Qwen weights. Output `flowHeadSwap_001.png` in project
`1.4 media`, sidecar `Media/.meta/03af1b18-b202-4ccd-bae7-66a23910d03c.json`,
created `2026-08-17T07:13:55Z`, `generationMs: 58003`.

The `/history` graph diff was NOT needed — the sidecar records the payload the app
actually emitted, which is the same evidence one step earlier and costs no generation.

```json
"injectionParams": {
  "Input_Tier": 2,
  "box1": { "x": 936,  "y": 301, "width": 716, "height": 716 },
  "box2": { "x": 1036, "y": 148, "width": 642, "height": 642 }
}
```

| Gate | Result |
|---|---|
| `box1` / `box2` present | yes |
| shaped `{x, y, width, height}` | yes — the `w`/`h` rename fired in `stepValueToParam` |
| `Input_Tier` a NUMBER | yes, `2` — NON-default (Quality is 1), so the `radio` field is proven live |
| coords absolute top-left SOURCE px | **yes — proven by pixel crop, not inference** |
| `stepValues` still stores `w`/`h` | yes — reuse path unchanged, no saved card stranded |

**Coord proof.** Both sources are 1792x1120. Extracted each box out of its own source
with sharp: `box1` lands square on the young man's head (image1, the target), `box2`
square on the older man's head (image2, the reference). A centre-anchored, normalised
or bottom-left convention could not put BOTH crops on a head by accident.

**Consumer agrees.** `headSwapInjector.js` takes `box1` → node 90 `Input_Box` →
`MpiBoxMask` on image1, `box2` → node 88 `Input_Box_2` → `MpiBoxCrop` on image2, and
`HEAD_SWAP_CONSUMES` lets `Input_Tier` survive to the generic title injector (node 95
`MpiInt`, baked 3, injected 2). Payload matches consumer key for key.

### The blended result is NOT this card

The swapped head IS the reference identity — replaced, not ignored — but carries the
target's face structure underneath. That is the Qwen edit leaking the source through a
correct hard-rect mask. App half exonerated: every value this card rewrote reached the
graph in the right shape, type and coordinate space.

Fabio owns the workflow revisit (`flow_head_swap.json` + `docs/models/qwen-edit/`) and
has more tests to run on it. **Deliberately NOT carded** at his instruction, 2026-08-17.

### Not done, and not this card's scope

The FIRST-stage template (`inputSchema.media` restating the op's `mediaInputs`) is
untouched. It was scoped out in the plan's `## Out of scope` and belongs with MPI-531,
whose `files.json` already claims `flowsRegistry.js`. Same for ltx-extend's second step.
