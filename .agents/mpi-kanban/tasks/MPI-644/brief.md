# MPI-644 — Gate flow step advance on missing inputs, and make the toast generic

> Split out of MPI-607 (Fabio, 2026-08-28). That card fixed the *dispatch* half and
> stopped there deliberately — this is the follow-up, and it is deliberately NOT part
> of MPI-607's scope.

## What Fabio asked for, in his words

> *"From now on, if a user lands on the first stage of a flow and he tries to go to
> stage 2, he should immediately get a toast saying that he needs to add inputs."*

And on the copy:

> *"The toast shouldn't be specific. It should tell the user something like, 'You need
> to add inputs to this flow.'"*

## The two changes

1. **Warn at the STEP BOUNDARY, not only at Generate.** Leaving stage 1 with a media
   slot the flow needs and nothing in it should raise the toast and refuse the advance.
2. **One generic message.** Something in the shape of *"You need to add inputs to this
   flow."* — not the per-media-type copy that exists today.

## What already exists — read this before designing anything

**The refusal already works at dispatch. Do not rebuild it.** As of `b39ebe06`:

- `_findMissingMediaSlot` + `_warnMissingMediaSlot` in `js/services/generationService.js`
  are the guard. They run at **enqueue** (`enqueueGeneration`) and again at **dispatch**
  (`startGeneration`).
- Flows reach them: `MpiBaseFlow._run` → `submitFlowGeneration` (`js/services/flowService.js`)
  → `enqueueGeneration`.
- Truth for "does this flow need media in that slot" is `mediaInputs[].required` in
  `js/data/commandRegistry.js`. **An ABSENT `required` already means required**;
  `required: false` is always a deliberate opt-out.
- `tests/flow-required-media.test.cjs` freezes the law: a slot whose graph blocks when
  empty must not declare `required: false`. Keep it passing.

So this card is about **WHEN the user is told**, not about learning what is missing.

## Traps, all measured this session — each one cost time to find

- 🔴 **`_findMissingMediaSlot` is per media TYPE, not per role** (MPI-466). One attached
  image satisfies EVERY image slot. That is deliberate — head-swap's end-frame-only run
  is legal — so a step gate must not tighten it into a per-role check without Fabio's
  call. Ask before making it stricter.
- 🔴 **A step can DERIVE the media that satisfies a slot, and it does so at RUN time,
  after the step the user is leaving.** Scribble's slot is literally *"Drawing
  (optional)"*: with a blank canvas and no upload, `MpiBaseFlow._deriveRunMedia` fills
  `image1` from the `paint` step before enqueue. **Verified live** — blank canvas + a
  drawn stroke + a prompt raises no warning and reaches `Generating…`.
  **A naive "slot empty → block the advance" check BREAKS that flow**, because at the
  moment the user leaves stage 1 the drawing does not exist yet. Any gate must account
  for a later step that fills the role: `flow.steps[].into` names it.
  Affected: `scribble` (paint→image1), `scribble-object` (paint+box→image1),
  `object-stamp` (cutout→image2, place→image1), `head-swap` (box→image1/image2).
- **There is already a second, different empty-run guard** at the top of `MpiBaseFlow._run`:
  `_mediaGroups.length > 0 && mediaItems.length === 0 && !hasPrompt` → *"<Flow> needs at
  least one input before it can run."* It fires BEFORE derivation, so a promptless
  Scribble is refused there, not by the required-slot guard. **Two guards now say
  overlapping things** — decide whether the step gate is a third, or whether this one is
  what should move to the boundary. Do not add a fourth without reading both.
- **`upto` is the ONLY media mode there is.** There is no "required slot" mode, so a slot
  cannot render as required — which is why the failure is invisible in the UI. If a
  visual affordance is wanted, that is new machinery and its own decision.
- **`requiresImages` in commandRegistry is NOT read on the flow path at all** (only
  MpiPromptBox / MpiGroupHistoryBlock). Do not reach for it.
- **DramaBox is the counter-example that must stay working.** Its loader carries
  `block_if_empty: false` and its voice slot is legitimately `required: false` — the
  prompt-only arm builds a speaker from the words. A gate that demands inputs from every
  flow kills its whole pitch. `tests/flow-required-media.test.cjs` has a case pinning it.

## Copy

Today's message is built in `_warnMissingMediaSlot` and names the media type
(*"Add an audio file before generating — this operation needs one."*). Fabio wants the
flow-side message generic. **Note that toast is shared with the non-flow PromptBox
path**, where naming the type is arguably right — so check both surfaces before
rewriting it in place rather than adding a flow-specific message.

## Done when

- Leaving stage 1 of a flow that needs inputs, with none supplied and none derivable by
  a later step, raises a generic toast and does not advance.
- Scribble still runs from a blank canvas with a drawing (the regression test above).
- DramaBox still runs prompt-only.
- `tests/flow-required-media.test.cjs` still green; a new test covers the step gate.

## Ownership

Owns `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` and whatever it adds under
`tests/`. Touching `js/services/generationService.js` or `js/data/commandRegistry.js`
means touching MPI-607's shipped fix — coordinate rather than overwrite.
