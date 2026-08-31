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
- `slider` also takes `format: 'duration'` (MPI-664), which renders its readout as time —
  `45` → "45 seconds", `62` → "1 minute 2 seconds", `180` → "3 minutes". A length slider showing
  a bare `90` tells a user nothing about how long their result is. A formatted slider **opts out
  of the progress bar's `info` hover**: that bar substitutes `{value}` and cannot format, so it
  would hover "Length: 90" over a readout saying "1 minute 30 seconds" — one control contradicting
  itself. Seconds → frames stays the **graph's** job (`MpiMath`), never the app's.
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

## Fields that constrain each other (MPI-663, MPI-664)

Three DECLARATIVE clauses, evaluated in `js/utils/declaredFields.js` and painted by the frame in
one pass (`_paintFieldConstraints`). Declarative on purpose: a predicate in a FlowDef is a thing
only a first-party flow can ship.

| clause | on | means |
|---|---|---|
| `group: '<name>', minActive: N` | every member | a member that is ON and would take the group below N is **locked**. Members that are OFF stay live — turning one on can never break a floor |
| `enabledWhen: { group: '<name>', atLeast: N }` | a field OUTSIDE the group | disabled while fewer than N members are on |
| `hiddenWhen: { field: '<id>', is: <value> }` | any field | **removed from the slide** while that field holds exactly that value |

The first two are `disabledFieldIds`, the third is `hiddenFieldIds`.

Stems declares both disabling clauses: its four stem toggles are `{ group: 'stems', minActive: 1 }`,
and its `combine` toggle is `{ enabledWhen: { group: 'stems', atLeast: 2 } }`.

### Hiding vs disabling

**Reach for `hiddenWhen` when the field has nothing to say at all**, and disabling when it has
something to say that is currently forbidden. MiniMax Music's Instrumental toggle hides the lyrics
box and both voice controls: with no vocals there is nothing for them to mean, and a greyed lyrics
box still reads as a box the user failed to fill in.

Hiding is also the **wider reach**. Disabling lands on the primitive's own `setDisabled`, so it
works for a `toggle` and a `select` and nothing else — a declared `text` box cannot be greyed at
all today. Hiding is on the field WRAPPER, so it works for every field type.

`hiddenWhen` compares with **exact equality**, not truthiness: an untouched field is `undefined`,
not `false`, so a rule keyed `is: false` does not fire before the user touches the control.

The painter walks the flow's own fields **and every step's** together, because a rule is declared
where its control is and the two halves must be evaluated as one set.

⚠️ The frame ships the `[hidden]` CSS override for its own fields. `.mpi-base-flow__field` sets
`display`, which beats the UA stylesheet's `[hidden]` rule — so the attribute alone hides nothing.
Any other surface mounting `buildField` under a different BEM block needs its own override.

**The floor is not cosmetic.** A flow whose every branch gates off runs, reports SUCCESS and
lands no card at all — no error, no toast, nothing logged ([../../02-media-io.md](../../02-media-io.md)
§ Self-gating is not the same as HANDLED). Locking the last toggle is what keeps a user out of
that state, so any flow whose toggles gate graph branches wants a floor.

🔴 **A disabled OR hidden field KEEPS ITS VALUE.** Greying or hiding a control is not the same as
deciding for the user, and the value must come back when the constraint clears. So whatever
consumes it re-checks the real condition instead of trusting the flag — Stems only combines when
more than one file actually landed, never on the toggle alone. The same law bites harder on
hiding: an instrumental run whose GRAPH trusted the flag would inject lyrics that are merely
invisible, so the graph re-checks the condition itself.

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
