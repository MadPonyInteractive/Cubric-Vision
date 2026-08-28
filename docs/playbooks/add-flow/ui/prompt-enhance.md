# The prompt pair — a user prompt, an Enhance action, an enhanced prompt

> **PORTABLE.** Any flow whose prompt is worth rewriting by an LLM can declare this. Designed
> for Character Sheet (MPI-504), where the enhanced phrase is the *product* — a character is a
> PAIR of image plus a phrase reused word for word — but nothing here is character-specific.
>
> **Status: frame capability BUILT** (MPI-504, 2026-08-20). The enhancer OP it calls is a
> separate registration; a flow declaring an unregistered `op` warns and no-ops rather than
> failing inside the queue.

## The problem it solves

An enhancer buried inside the graph is an **invisible intermediate**: regenerated on every
dispatch, never shown, never stored. That costs three things at once.

- **Reproducibility** — the phrase moves underneath a held image seed, so the "same" run is not.
- **Repair** — a recipe defect the user can see in the output is unfixable while the text is
  hidden, and *more recipe wording* is not the answer (MPI-504 proved that twice).
- **The descriptor** — an asset registry wants the phrase itself, not just the picture it made.

Promoting the enhancer to two visible fields fixes all three, and costs one declaration.

## The shape

Two `text` fields and one `button`, declared as a group:

```js
{
    id: 'positive', type: 'text', rows: 3, label: 'Your character',
    placeholder: 'Who they are, wardrobe, age, hair, eyes, marks…',
},
{
    id: 'enhance', type: 'button', label: 'Enhance', icon: 'enhance',
    action: 'enhance', op: 'flowCharacterEnhance',
    from: 'positive', to: 'Input_Character',
},
{
    id: 'Input_Character', type: 'text', rows: 10, label: 'The character phrase',
},
```

Declared on a **`fields` step** they become the refine surface: small box → big button → large
editable box. Declared on the **flow** (the run slide) the same pair becomes the condensed
generate surface — and you simply *omit the `to` field there*, because the point of the run
slide is to generate, not to read. **One value either way**: a `fields` step has no role, so
its values live in the flow-level store, and the enhanced text written on the run slide is the
text the step shows when the user walks back to it.

## The rules the declaration enforces

The three behaviours come off the ONE `action` declaration, so they cannot disagree:

| Rule | Where it lives |
|---|---|
| **Enhance is the only writer of `to`** (besides the user typing in it). Generate never enhances. | `_runEnhance` is the only caller that writes `to` |
| **Editing `from` CLEARS `to`.** The enhanced text was written for the old wording. | `_setFlowField` — visible immediately where `to` is shown |
| **The button reports which of those is true.** Heat = the current prompt is not enhanced. | `_paintEnhance` — the only readable signal on a surface that hides `to` |
| **No Enhance pressed → the RAW prompt runs.** There is no silent enhancement. | `_collectInputs` fills an empty `to` from `from` |

**NOT-ENHANCED is the LOUD state, deliberately.** It is the actionable one, so it takes the heat
fill — the same pink as Generate. Enhanced goes quiet on the secondary surface. A first-open flow
therefore starts loud, which is correct: the button is the call to action, not a warning.

**Both states are `MpiButton`'s own variants**, toggled by `_paintEnhance` — `mpi-btn--primary`
against `mpi-btn--secondary`, never both, since `--secondary` is declared after `--primary` and
would win. There is no bespoke state class and no consumer-block button CSS; a `button` field is
a mounted Primitive (`js/utils/declaredFields.js`), so restyling it from a block is how the two
surfaces drift apart again.

> **Do not reach for icon mode to get the icon.** `MpiButton` defaults icon mode to `primary` and
> then maps every variant except `danger`/`ghost` down to `secondary`, so ~20 buttons across the
> app pass `variant: 'primary'` with an icon today and render grey. Widening that mapping repaints
> all of them. The `button` field uses TEXT mode with the icon in `children`, which gets the heat
> fill, the hover-on-background and an icon to the LEFT of the label with the primitive untouched.

## What is deliberately NOT stored

**No seed.** The enhancer seed is real and load-bearing *inside* the run — a fixed seed returns
the same phrase on every press, and the loop this UI exists for is Enhance → Generate → Enhance
— so the frame drives a fresh one per press. It is never a user field and never persisted:
the **enhanced text itself** is what the sidecar keeps, and Reuse injects that verbatim without
re-enhancing. Storing the seed as well was proposed and rejected (MPI-504); it would add a
second, weaker route to a phrase the app already has word for word.

Both prompts persist for free — `positive` is a top-level run input, `Input_*` an injection
param, and `flowInputs` snapshots the whole payload at Run
([../03-storage-and-reuse.md](../03-storage-and-reuse.md)). No new storage path exists for this.

## The `fields` step

A media-less step whose declared fields ARE the work, stacked where the canvas would be. It is
**frame-native** — no component, no registry entry, no `role` (`FRAME_KINDS` in
`MpiBaseFlow/stepKinds.js`).

It exists because a prompt-only flow has **no media at all**, so every gizmo kind's
`{ media, value, onChange }` contract is unsatisfiable: the frame would render *"Add the image
for this step on the first step"* on a flow with no first-step slots to add it to.

**The one-row cap does not apply to it, and that is not a loophole.** The cap
([carousel-frame/steps.md](carousel-frame/steps.md) § A step may declare FIELDS) exists because that row is
a *modifier on a canvas* — a gizmo wanting two rows is a gizmo that should split. Here there is
no canvas to modify; the fields are the step's whole content, exactly as they are the run
slide's whole control column. What still holds is the reason behind the cap: **if a `fields`
step grows past a few related controls, it is a settings form wearing a carousel**, and it
should split into two steps.

## When NOT to reach for this

- **A prompt the user just types.** One `text` field. The pair earns its place only when
  something rewrites the text and the user must see what it wrote.
- **Enhancing in place.** `MpiPromptBox._runEnhance()` overwrites the prompt with the result and
  calls the Cubric Prompt CONNECTOR (`shell/connectorOps.js`). That is a different system with a
  different owner — do not wire a flow into it, and do not "unify" the two.
- **`enhancePrompt: false` in `js/data/promptControlDefaults.js`** is a third unrelated thing: a
  per-model boolean control. Three concepts named "enhance"; keep them apart.
