# MPI-582 Plan — every UI element is a component

## Goal

`buildField()` in `js/utils/declaredFields.js` mounts an app Primitive for every
declared field type, both consumers inherit it in one edit, the app has ONE
slider, and the documentation stops saying a Flow needs no component.

## Current State

**2026-08-20 02:40Z — ALL FOUR PHASES SHIPPED AND SELF-VERIFIED. Waiting on Fabio's eyes.**

Every declared field type mounts an app Primitive, both consumer stylesheets are
stripped of the chrome they were restating, the app has ONE slider, and the docs
that said a Flow needs no component now say the opposite.

What a fresh session needs to know:

- **The peer arrived first on three types.** `button`, `slider` and `text` were
  already wired by the live MPI-504 session before this card started. This session
  added `select` -> MpiDropdown, `toggle` -> MpiCheckbox, `number` -> MpiInput.
- **The peer's `text` branch had silently unhooked its own layout.** It mounted
  MpiInput into a bare div with an inline `width: 100%` and dropped the
  `field-text` class, so THREE rules stopped matching anything: the row's `:has()`
  column, the 120px step-row height and the `--work` step's type scale. The class
  is back and the height rules now reach the textarea through `.mpi-input__field`.
- **`toggle` gets a `<div>` wrapper, every other type keeps `<label>`.**
  MpiCheckbox renders its OWN label, and nested labels double-fire the activation —
  the box would tick and untick on one click. This is the only type where the
  wrapper tag matters.
- **The mask sliders keep their value in a `vals` object, not on the DOM.**
  MpiProgressBar owns its input and exposes no getter, and `_reset` must move the
  thumb WITHOUT firing a preview, which is what `setValueQuiet` is for. Reading
  `.value` back off the primitive would work but couples to its internals.
- **Two orphans were swept** because this card created them: `on` from
  `js/utils/dom.js` is no longer imported in declaredFields.js, MaskAdjust or
  MaskStrip, and MaskAdjust's `_offs` / MaskStrip's `_offOpacity` teardown
  collectors lost their only producer.
- **B/W still disables the strip's opacity slider** by reaching for
  `.mpi-progress__input` — MpiProgressBar has no disabled setter. The CSS already
  made the row inert; this is the keyboard half.

**The one thing NOT done, deliberately:** `.claude/rules/components.md` carries the
law (new top section + a Sub-Agent Briefing bullet + rule 0), but the Critical
Rules Snapshot in `CLAUDE.md` was left alone. That file is modified in the working
tree by another session and Fabio's go covered components.md by name. Adding one
clause to its "Components:" bullet is the obvious follow-up.

**2026-08-20 — FABIO VERIFIED IT: "okay, it looks good".** The user-ux gate is
passed. The four phases above are closed; the only reason this card is still in
`doing` is the follow-up he asked for in the same breath.

**THE NEW WORK — Extend Video is missing its middle step.** Fabio, verbatim:
*"since we're doing UI adjustments as well, let's make sure that we fix extend
video. Extend video is wrong because it only has the first and the last step, and
it should have a second step in between. The second step in between should look
exactly like the foley flow."*

Everything needed is in `js/data/flowsRegistry.js`, which this card already owns:

- `ltx-extend` declares `steps: []` and puts `positive` / `negative` /
  `Input_Duration` at FLOW level, so the carousel is supply -> run.
- `ltx-foley` is the twin and already has the right shape — ONE middle step:
  `{ kind: 'preview', role: 'video1', tickerLabel: 'Describe', title: '...',
  fields: [positive(rows 3), negative(rows 2)] }`, giving supply -> describe -> run.
- **Extend's own comment argues FOR having no middle step** ("nothing here is
  marked on the clip itself"), and foley's comment is the rebuttal: "Nothing is
  MARKED on the clip, but the user still has to see it: step 0 loads media at
  thumbnail size, so a `preview` step is the first point at which they can judge
  the take". Extend's comment has to be rewritten, not just its `steps` array —
  leaving it would send the next agent straight back to `steps: []`.
- **Open question for the next session:** where `Input_Duration` goes. Foley has
  no third field so it is no guide. Declaring the SAME field on a step AND on the
  flow shares one value (MPI-504's enhance pattern), so both surfaces are possible
  — ask Fabio rather than guessing, since "exactly like the foley flow" speaks to
  the two prompt boxes, not to the duration slider.

**2026-08-20 — THE MIDDLE STEP IS IN.** `ltx-extend` now declares one `preview`
step on role `video1` (tickerLabel `Describe`, title "Describe what happens next")
carrying `positive` (rows 3) and `negative` (rows 2) verbatim, so the carousel is
supply → describe → run. The old comment that argued FOR `steps: []` is gone,
replaced by foley's rebuttal plus the reason the move is safe: `_collectInputs`
folds `stepValues[role].fields` into the same `declared` / `injectionParams` bins
as a flow-level field, so this is a PLACEMENT change and not a payload one. Proved
by import (`getFlowById('ltx-extend').steps`), 630/630 tests, ESLint clean;
`preview` is a registered kind in `stepKinds.js`, so `isFrameKind` will not drop it.

**One known cosmetic cost, not fixed:** a previously-saved `s_flowInputs.ltx-extend`
holds `positive`/`negative` at flow level, and seeding for a step field reads
`seeded.stepValues.video1.fields.*` — so an old snapshot re-opens with empty prompt
boxes. Dev-gated flow, one re-type, not worth a migration.

**DECIDED 2026-08-20 (Fabio):** `Input_Duration` stays on the LAST stage, beside
Generate — "only at the last stage so that the second stage equals the Foley flow".
So the describe step carries the two prompt boxes and nothing else, exactly like
`ltx-foley`. That is what shipped; no further edit was needed. Do not move the
duration slider onto the step in a later pass.

**Next action:** Fabio's eyes on the carousel (Flow Library → Extend Video: three
dots, clip at full size on the middle slide with the two prompt boxes, Seconds to
add on the run slide).


## Phases

### Phase 1: the three remaining bare inputs

`select` -> `MpiDropdown`, `toggle` -> `MpiCheckbox`, `number` -> `MpiInput`
(type number, which owns its own clamp, wheel and decimals).

Two laws the existing branches already keep and these must keep too:
- emit the option's ORIGINAL `v`, never the DOM string — a graph param like
  `Input_Tier` is an int and "1" reaching MpiAnySwitch as text is a silent
  wrong-branch.
- write a clamped or fallen-back value back through `onChange` — a control that
  shows one value while sending another is the worst outcome available.

Every mounted Primitive pushes `() => inst?.el?.destroy?.()` onto `unsubs`.

**Verify:** `node --test tests/declared-fields.test.cjs` — the module is imported
in BARE NODE by that test, so a Primitive whose import chain needs a DOM breaks it.
MpiDropdown pulls `js/events.js`; that is the one unproven import.

### Phase 2: the CSS both consumers carry

Delete `accent-color: var(--accent-frost)` from `MpiBaseFlow.css` and
`MpiToolOptionsUpscale.css` — not rewrite it. Fabio on that colour (recorded in
MPI-504's plan): "a colour that is only used in 3% of the app... it actually
should be a colour that shouldn't be used anywhere."

Rework the selectors written against bare-input DOM (`__field-select`,
`__field-toggle`, `__field-input`, `__field-text`, `__field-range`, and the
`:focus-visible` list) onto the primitives' DOM, in BOTH the row and `--stacked`
layouts. Delete the dead raw-button block in `MpiToolOptionsUpscale.css` that
MPI-504's plan already flagged as fighting the primitive.

**Verify:** app — History upscale panel plus every Flow step row and run slide.

### Phase 3: one slider in the app

Sweep the longhand range implementations in `MpiToolOptionsMaskAdjust.css` and
`MpiMaskStrip.css` onto `MpiProgressBar`, whose own header already claims to be
the single source of truth for sliders. Four independent implementations of one
control become one.

**Verify:** app — mask Adjust grow/shrink/edge-band, and the mask strip.

### Phase 4: the words — the actual root cause

Commit 55461326 is titled "declared controls, so a Flow needs no JS component".
That framing is what let bare inputs in. Fix it in:
- `docs/playbooks/add-flow/01-descriptor-and-ops.md` and the `ui/` pages
- the `FlowStepField` typedef in `js/data/flowsRegistry.js`
- the header of `js/utils/declaredFields.js`
- `.claude/rules/components.md` — state the law so the router hands it to every
  agent. Fabio gave explicit go.

The law, in his words: every single UI element in the app is a COMPONENT; if
nothing exists that covers the use, a NEW COMPONENT IS CREATED. Flows are no
exception — a Flow is more flexible in that it can carry all sorts of different
components, but they are all components.

**Verify:** re-read — a fresh agent reading only these must not conclude a
declared field replaces a component.

## Verification

**Verify mode:** user-ux

Fabio caught this defect on sight in the History workspace. The automated half is
`node --test tests/declared-fields.test.cjs` plus `npm test`; the visual half is
his, on the upscale panel and the three Flows.

## Remaining Work

- Fabio's visual pass (validation.md § Fabio's eyes). Nothing else in this card.
- Follow-up, not owed by this card: the `CLAUDE.md` Critical Rules Snapshot clause,
  and the raw group-card checkbox at `MpiGalleryGrid.css:446` (same law, not a
  declared field).


## Completed

- **Phase 1** — `select` -> MpiDropdown, `toggle` -> MpiCheckbox, `number` ->
  MpiInput. With the peer's three, all seven types now mount a Primitive.
- **Phase 2** — both `accent-color` blocks DELETED, both `:focus-visible` blocks
  deleted, the chrome the two consumer blocks were restating removed, the
  bare-input selectors retargeted onto primitive DOM, and the dead raw-button block
  in MpiToolOptionsUpscale.css removed.
- **Phase 3** — MpiToolOptionsMaskAdjust (3 sliders) and MpiMaskStrip (opacity)
  converted to MpiProgressBar; both longhand range blocks deleted. No bare
  `type="range"` is left anywhere in `js/` or `styles/`.
- **Phase 4** — `declaredFields.js` header, the `FlowStepField` typedef + the
  FlowDef `fields` property, `docs/playbooks/add-flow/{README,01-descriptor-and-ops}.md`
  and `ui/carousel-frame.md`, and `.claude/rules/components.md` (new
  § Every UI element is a component + briefing bullet + rule 0).


## Plan Drift

- 2026-08-20 — card item 3 (revise every Flow) removed before starting: Fabio
  inspected all three Flows and confirmed they already use components.
- 2026-08-20 — card item 1 arrived three-sevenths done. A peer MPI-504 session
  wired `slider`, `text` and `button` to Primitives while this card was being
  briefed. Scope narrowed to `select`, `toggle`, `number`.
