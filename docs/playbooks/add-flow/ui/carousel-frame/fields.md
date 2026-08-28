# `fields` is the ONE control surface — placement is the only variable (MPI-531 / MPI-572)

> Part of the flow carousel frame — [README.md](README.md) is the hub. This file is the control
> vocabulary: the field types, and the id-routing law that decides where a value lands. A step's
> *placement* rules (the one-row cap) are in [steps.md](steps.md).

The run slide used to have exactly one source of controls: the flow's `uiComponent`, a JS
Organism. **A third party can never ship a bespoke JS Organism**, so every Flow authored that way
is a Flow that must be ported when community packages land. A flow declares `fields` instead —
the same `fields` a step declares:

```js
// on the FLOW → rendered stacked on the run slide
fields: [
  { id: 'positive', type: 'text', rows: 3, label: 'What happens next' },
  { id: 'Input_Duration', type: 'slider', label: 'Seconds to add', min: 1, max: 10, step: 1, default: 4 },
]

// on a STEP → rendered as that step's one row, between canvas and hint
steps: [
  { kind: 'preview', role: 'video1', title: '…', fields: [ { id: 'positive', type: 'text', rows: 3 } ] },
]
```

**Where you declare it is the only thing that changes.** One vocabulary, one renderer
(`_buildField`), one seeding path (`_seedField`), one payload law. On the run slide they are
stacked into the 236px control column; on a step they obey the one-row cap.

**Every type here mounts an app Primitive** (`js/utils/declaredFields.js`, MPI-582) —
`select`→MpiDropdown, `radio`→MpiRadioGroup, `button`→MpiButton, `toggle`→MpiButton (icon mode,
`toggleable`, icon optional — MPI-504), `number`/`text`→MpiInput, `slider`→MpiProgressBar.
`type` NAMES a component; it does not
replace one. So a consumer block sizes these into its layout and never restates their fill,
border, hover, focus or disabled treatment — anything chrome-like in a consumer stylesheet is a
bug. A control this vocabulary cannot express is a new Primitive plus a new `type`, never a bare
input. The five that were hand-rolled shipped Chromium's native widgets into every Flow until
MPI-582; `.claude/rules/components.md` § Every UI element is a component holds the law.

This was two surfaces until 2026-08-16 — a flow-level `controls` beside a step's `fields` —
and the split cost three bugs the day foley's prompts moved from one to the other: step fields
never reached the payload, defaults were never seeded, and Reuse read only `stepValues`.
**Do not reintroduce a second name for this concept** (MPI-572).

## Field types

`select` · `radio` · `button` · `toggle` · `number` · `slider` · `text` (MPI-531 added
`number`/`slider`/`text`; MPI-572 added `radio`).

- `number` / `slider` take `min` / `max` / `step`. **The bounds are ENFORCED**, not decorative —
  the value is clamped before it reaches the graph, and a typed number is written back clamped
  so the widget never shows one value while sending another. A slider always renders its live
  numeric readout: a slider without its number is a guess.
- `text` takes `placeholder` and `rows`; `rows > 1` renders a `textarea`. That is the prompt case.
- `radio` takes `options: [{ v, label, info?, note? }]` and an optional `columns`. It is the only
  field type that mounts a Primitive (`MpiRadioGroup`), and it earns that: a tier choice rendered
  as a `select` hides the alternatives behind a click, and comparing them is the entire point.
  - It emits the option's **original `v`**, never the DOM string — `Input_Tier` is an int in the
    graph, and `"1"` reaching `MpiAnySwitch` as text is a silent wrong-branch.
  - `info` is a status-bar **hover**; `note` is the **always-visible** line under the group. Both
    exist because a tier's cost has to be readable without hunting for it, while its gloss does not.
  - A seeded value naming an option this build no longer has falls back to `default`, **and writes
    the fallback back** — same law as the clamped number field: a control that shows one value
    while sending another is the worst outcome available.
- Anything else logs a warning and renders nothing. A silently-missing control is the failure
  mode this whole file exists to avoid.

## Where a value lands is decided by its id

| id | goes to | why |
|---|---|---|
| `positive`, `negative` | top-level run inputs | `submitFlowGeneration` reads them by those names |
| `Input_*` | `injectionParams` | the prefix names a GRAPH NODE — the app-wide injection naming law |
| anything else | top-level run input under its own id | the shape the run inputs have always had |
| a step's `param` | `injectionParams` under that name | the flow named the node; the kind gave it its shape |

Seeding follows the same split, so a reopened flow restores an `Input_*` field from the
persisted `injectionParams` rather than coming back at its default. It also falls back to the
payload ROOT for a step field, which is what keeps an OLD card reusable after a field moves
between the flow and a step.

**`uiComponent` is GONE (MPI-572).** The prop, the shell's `_flowComponents` map and the last
component (`MpiFlowHeadSwap`) were all deleted; no flow ships JS. If a control cannot be
expressed, **add the field type** — one branch in `_buildField`, available to every flow ever
written, including ones you will never see. Do not add a component back: it is the single thing
that would re-break the manifest test. Worked examples:
[../../existing-flows/ltx-extend.md](../../existing-flows/ltx-extend.md) (run slide),
[../../existing-flows/head-swap.md](../../existing-flows/head-swap.md) (`radio` + two `param` binds).

**One field emits ONE value into ONE param.** A control that means two or more graph values — a
resolution is width AND height — is expressed in the GRAPH, by one `MpiInt` selecting
`MpiAnySwitch` banks: [../switch-bank-fields.md](../switch-bank-fields.md).
