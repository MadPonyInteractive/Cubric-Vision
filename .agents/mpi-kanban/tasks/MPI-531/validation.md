# MPI-531 — Validation (item 1 slice)

Scope validated: item 1 (`FlowStepField` gains `number` / `slider` / `text`) **plus the
scope extension** it turned out to need — `FlowDef.controls`, declared controls on the run
slide. Items 2–4 are NOT validated here; they are untouched.

## Why the scope had to grow

`fields` render on MIDDLE steps only. The run slide's controls came from exactly one place,
`props.uiComponent` (`MpiBaseFlow.js`), so field types alone would have left MPI-552 as
blocked as before: any Flow needing a prompt still had to ship a JS component. `controls`
closes that with the same vocabulary and the same renderer.

## Evidence

| Check | Result |
|---|---|
| `npm test` | **591/591 pass** (590 before + the new MPI-520 title guard) |
| `npx eslint js/ --max-warnings=0` | clean |
| `node --check` on every edited `.js` | clean |
| Head Swap's `uiComponent` path | untouched — `_flowComponents[flow.uiComponent] \|\| null` unchanged, component still mounts and still wins on merge |

**Live, in an isolated app instance** (own port + own profile; the user's `:3000` untouched),
driving the first Flow authored with NO `uiComponent` (`ltx-extend`, MPI-520):

1. Run slide renders all three declared controls — two `textarea`s (`text`, `rows > 1`) and a
   `range` with its live readout (`slider`).
2. Values reach the run payload, split by id as designed:

   ```json
   { "positive": "the camera pushes in as she turns to leave",
     "negative": "letterbox, black bars, …",
     "injectionParams": { "Input_Duration": 7 } }
   ```

   Read from `state.s_flowInputs` after `_run` persisted it and `submitFlowGeneration`'s
   availability guard aborted — so the payload is proven with NOTHING queued (engine queue
   confirmed empty afterwards). No GPU spent.
3. Reopening the flow restores all three, including the slider — which seeds from
   `injectionParams`, not the top level. That branch exists because `_collectInputs` puts it
   there; without it the control would silently come back at its default after a reopen.

`number` is implemented and typechecked but has **no live consumer yet** — the first will be
extend's width/height once the graph is re-exported (MPI-520 § The width/height decision).

## Not validated

- Items 2 (`steps[].image`), 3 (author every 1.5 Flow declaratively), 4 (port
  `MpiFlowHeadSwap`). The card stays open for those.
- MPI-532 (the 1.6 package format) — deliberately untouched, per the user's steer that
  community integration lands in a later version.
