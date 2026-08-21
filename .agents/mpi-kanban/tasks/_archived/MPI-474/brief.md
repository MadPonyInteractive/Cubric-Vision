# MPI-474 Brief — the prompt box cycles three fields

## Why

LTX 2.3 drives its negatives through `LTX2 NAG`, which patches **two separate
cross-attentions** from **two separate conditionings**:

- `nag_cond_video` ← `CLIP Text Encode (Negative Prompt)` ← `Input_Negative`
- `nag_cond_audio` ← `Negative Audio (NAG only)` ← `Input_Negative_Audio`

The graph half shipped on 2026-08-07 (raw `030c4aee`). `Input_Negative_Audio`
exists as a titled `MpiText` node with an empty widget, so injection will find
it — **but nothing in the app sends that key**, so the baked value stands.

Why the audio negative matters in practice: LTX volunteers background music
constantly. A video negative cannot suppress it; the audio one can. The baked
list used to be a *fidelity* negative (`underwater, echo, muffled, hiss,
crackle, tinny, hum, buzz`) which NAG steers **away** from — i.e. an instruction
to sound like a studio recording, which is exactly where music comes from. It
was cleared to `""` for that reason. Those descriptors are also things a user
might deliberately want, which is the second argument for making it user-driven
rather than baked.

## Shape (user's design, chosen over a controls-row text field)

ONE button on the prompt box cycles `positive → negative → negative audio →
positive`. Not a second text field — the box already *is* the text field, and a
control-row input would be the first of its kind and the wrong home.

The third stop is gated on `capabilities.audio` (LTX today). A model without it
cycles `positive ↔ negative` exactly as before.

## Touch points

- `MpiButton.js` — **DONE**: added `el.setIcon(name)`. The primitive was strictly
  boolean (`iconActive` is a CSS swap on `is-active`), so three states had no way
  to reach a third icon. Additive, mirrors `setLabel`; no consumer changes.
- `MpiPromptBox.js` — `isNegativeMode` boolean → `promptMode` tri-state; third
  draft slot in `_saveDraft`; `injectPrompts`; textarea `input` handler;
  `_refreshNegToggle` (cycle instead of toggle, gate the third stop); the
  `input` and `mode-change` emits; the enhance-prompt source field.
- `commandExecutor.js` `_buildParams` — add `Input_Negative_Audio`.
- `generationService.js` — payload typedef + pass-through.
- `MpiGalleryBlock.js` / `MpiGroupHistoryBlock.js` — payload config, frozen-prompt
  capture (4 sites), and the `injectPrompts` reuse calls.
- `js/components/types.js`, `docs/component-contracts.md` (PromptBox contract).

## Risk

Medium. Shared component. The quiet failure mode is the **reuse paths** —
gallery/history "use prompt" round-tripping only two of three fields.

## Verify

- Dispatched graph on the engine (`:48188`) carries typed audio-negative text in
  `Input_Negative_Audio`. Read it off `/history`, not off the run finishing.
- Reuse from a gallery card round-trips all three fields.
- A model without `capabilities.audio` still cycles two-way only.
- `npm test` green.

## Context

Split out of MPI-466, whose own scope (the three LTX i2v routes) is proved and
finished. Related: [[MPI-473]] removes the vestigial `Preview_Only` param found
in the same sweep.
