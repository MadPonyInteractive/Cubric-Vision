# MPI-641 validation

## What shipped

`.mpi-base-flow__model-name` — the static model name a slot renders when it has exactly ONE
installed candidate — now sits in a box: `--surface-2` fill, a 1px solid border, `--r-1`
radius, `10px 14px` padding, `--t-sm` type.

**The box is the DROPDOWN TRIGGER's, not `MpiInput`'s sunken field**, and that choice is the
whole point rather than taste. This exact slot renders an `MpiDropdown` the moment a second
candidate is installed, so matching the trigger means installing a model swaps the CONTROL
without moving the LAYOUT. `MpiInput`'s readonly field is a different family — `--surface-bar`,
`--r-2`, an inset shadow — and would have made the slot jump.

**What it deliberately does NOT copy is everything that promises interaction:** no chevron, no
hover, no focus ring, no pointer cursor, and a `--line-soft` border one step quieter than the
trigger's `--ink-3`. A box that reads as a dropdown and answers no click is the same lie as
bare text, pointing the other way.

One file, one rule: `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.css`. No JS change — the
span was already there.

## Evidence

**A new desktop test, `tests/desktop/flow-lora-button.spec.js` § "a one-candidate slot states
its model in a box".** It stubs only `krea2` installed, walks to the run slide, and asserts on
COMPUTED STYLE — a class check would pass with the rule deleted, and "it has a box" is the
whole request.

It compares against a **live** `.mpi-dropdown__trigger` on the same slide (the Style field)
rather than hardcoded values, and matches on six properties: background, border width, border
style, radius, padding-x, padding-y, font-size. Then the negative half: the border colour must
NOT match, the tag must be `SPAN`, the cursor must not be `pointer`.

**That comparison caught my own wrong assumption.** The first draft asserted
`borderRadius > 0` — "the trigger is rounded; so is this" — and went red. `--r-1` is `0px`:
*"sharp — Stage prefers angular over rounded"* (`styles/01_base.css:103`). I was asserting a
taste this app does not hold. Measuring the real trigger cannot make that mistake, and it now
follows the trigger if the trigger is ever restyled.

- `npm test` — 774 pass, 0 fail
- `npm run test:desktop` — 39 pass, 0 fail (up from 38: this test is new)

## NOT verified: there is no screenshot of it

I could not produce one, and the measurement above is what stands in for it.

`npm run app:isolated` — the normal route, and the one that produced the measured screenshot
for MPI-638 an hour earlier — exits 0 in silence right now. A live peer session has
**uncommitted edits in `main.js` and `scripts/launch-instance.mjs`**, so the launcher is a
moving target and not mine to debug or work around.

Three fallbacks were tried and all failed for one reason: the flow overlay mounts into
`.main-area`, which has **no size on the Landing page**, and `locator.screenshot` refuses a
zero-box element. That is the same zero-geometry that makes every interaction in these specs
go through an in-page `.click()` rather than Playwright's. Forcing a size on the host did not
recover it either.

So: the box is verified by measurement against the control it replaces, not by eye. Fabio's own
app is running on `:3000` and shows it directly.
