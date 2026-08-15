# MPI-531 — Plan (item 1 slice only)

Picked up 2026-08-14 to **unblock MPI-552** (foley / extend / lipsync). Scope is
deliberately ONE slice of the card:

- **IN:** item 1 — extend `FlowStepField` with `slider` / `number` / `text`.
- **IN (scope extension, see below):** `FlowDef.controls` — declared fields on the
  RUN slide.
- **OUT:** item 2 (`steps[].image`), item 3 (author every 1.5 Flow declaratively —
  that is MPI-552's own work), item 4 (port `MpiFlowHeadSwap`).
- **OUT:** MPI-532 entirely. The 1.6 package format is not being designed here.

The card stays in `doing` only for this slice; the remaining items stay open on it.

## Why the scope grew by one key

Item 1 as carded is not sufficient and the card did not know it. `fields` render on
MIDDLE steps only — `_buildStepSlide` → `_buildFieldsRow`. The LAST step's controls
come from exactly one place:

```js
if (props.uiComponent) {
    _perFlow = props.uiComponent.mount(contentSlot, { initialInputs: seeded });
}
```

`MpiBaseFlow.js:732`. So a Flow that needs a prompt, a seed or a width TODAY must
ship a JS component — which is the debt this card exists to stop. Adding field types
without a run-slide surface would leave MPI-552 exactly as blocked as it is now.

`controls: FlowStepField[]` is the smallest fix: same field vocabulary, same
renderer, values merged into the run inputs under the field's own `id`. That is
already the contract the ripped `MpiFlowImageRegen` implemented by hand —
`el.getInputs = () => ({ positive: promptEl.value.trim() })` — so this is the
declarative form of a shape the app already ships, not a new one.

`uiComponent` is untouched and still mounts. Head Swap keeps working unchanged.

## Steps

1. Extract the per-field renderer out of `_buildFieldsRow` so ONE builder serves both
   the step row and the run controls — the frame renders both, which is the reason
   the doc gives for the frame owning fields at all (consistency for free).
2. Add `number`, `slider`, `text` to that builder. `text` takes an optional `rows`;
   `rows > 1` renders a `textarea` (the prompt case — `MpiFlowImageRegen` used
   `rows="3"`).
3. Add `FlowDef.controls`, rendered stacked into the run slide's `contentSlot`,
   seeded from `state.s_flowInputs[flow.id]`, merged top-level in `_collectInputs()`.
   `uiComponent`'s `getInputs()` merges AFTER, so a flow declaring both keeps the
   component authoritative.
4. Typedefs in `js/data/flowsRegistry.js` (`FlowStepField` + `FlowDef.controls`).
5. CSS for the new types + the stacked modifier.
6. Update `docs/playbooks/add-flow/ui/carousel-frame.md` — it currently documents the
   3-type row and says the last step's controls are the flow's component.

## Verification

- `node --check` on every edited `.js`; `npm test` stays green.
- **The real proof is MPI-536 (foley) authored with NO `uiComponent`** and running in
  my own app instance (`npm run app:isolated`, never `:3000`). Field types with no
  Flow using them is not evidence. That run closes this slice.

## Current State (2026-08-14, handoff)

Item 1 slice **SHIPPED and verified** — `55461326` (frame + typedef + playbook docs) and
`621174e6` (the first Flow using it). Evidence in `validation.md`; checklist fully ticked.
591/591 suite green, eslint clean, both commits pushed.

Items 2 (`steps[].image`), 3 (author every 1.5 Flow declaratively) and 4 (port
`MpiFlowHeadSwap`) are **untouched and still open**. The card is a 1.5 release blocker until
they land. MPI-532 was deliberately not started.

### 2026-08-15 — the declarative shape is PROVEN, and Fabio's live run named what the frame still lacks

MPI-536 (foley) shipped and Fabio ran it end to end in his own app: *"spot-on with what I
asked for"*. That is item 1's verification clause satisfied for real — a Flow with no
`uiComponent`, generating correctly. **The function is done; the frame around it is not.**

Five gaps he named on that run, all frame-level, none belonging to MPI-536:

1. **No in-app media picker.** The only way to fill a media slot is importing from an
   external source — the pop-up library was never built. This is the biggest one: a Flow
   cannot use what is already in the project.
2. **The result pane is TEXT.** "Your result appears here." then, on completion, still no
   player. It has to be a playable video.
3. **The run slide's controls are tiny and in the wrong place.** His layout: move the prompt
   boxes into step 2 with a **big preview of the video being worked on**, prompts *below*
   it. Today they are a narrow column with the result pane empty beside them.
4. **Dead air between Generate and the first latent.** The status bar moves, the slide does
   not. Needs a spinner or the scanline the instant Generate is pressed.
5. **Reference audio is not exposed anywhere in a Flow**, though the model has it (see the
   bench-session note below).

### The latent-preview bug — the SOURCE OF TRUTH exists and the consumers diverge from it

Fabio, same run: minimised-app preview shows **one still frame** for a video generation,
while the Flow result pane **replays the whole clip fast on every sampler step** and then
freezes on a still. He is right that this is the thing he asked for and it is not working.

`docs/preview-bus.md` already defines the contract, and it is not vague: the
`VHS_latentpreview` marker fires **once per sampler run** and is recorded on the GENERATION
(`activeGenerations.resetPreview` / `getPreviewClip`), never latched on whoever is mounted;
`rate` and `length` are load-bearing (playback runs at `rate`, the ring is sized by
`length`); `MpiGalleryBlock` re-hands it to the card with **every** frame so a missed marker
self-heals (MPI-535). So the bus is fine. **What is missing is one shared consumer** —
gallery card, Flow result pane, History, and the minimised mini-window each need the same
accumulate-ring + `rate` playback, and today only the gallery card implements it. Two
different wrong behaviours from two different re-implementations is the signature.

That is a real card to write next session, and it is NOT this one — this card is the Flow
frame; that one is the preview consumer.

### Reference audio — a BENCH session, not app work

Fabio asked whether reference audio was dropped. It was not: MPI-536 deliberately shipped
foley-only because **voice mode has never been executed**, and its brief forbids shipping
the two modes as composable toggles. The graph carries the whole branch (`Input_Audio#106`,
`Input_Use_Input_Audio#108`, `Input_Use_Reference_Audio#122`, `Audio_Influence#110`) and the
shipped `ltx-23-balanced` description already advertises "reference-voice and direct-audio
modes". Standing research: `docs/models/ltx/audio-input.md`. So the next step is a bench run
to prove voice mode, then decide mode-picker vs second Flow — not an app edit.

## Plan Drift

**The scope grew by one key, and it had to.** Item 1 alone unblocks nothing: `fields` render
on middle steps only, and the run slide's controls came solely from `props.uiComponent`. So
`FlowDef.controls` shipped with it — declared run-slide controls, `Input_*` ids routed into
`injectionParams`. The card body still describes item 1 as just the field types; that is now
understated, not wrong.

`number` is implemented but has **no live consumer yet**. Its first will be extend's
width/height (MPI-520), which needs a bench re-export.
