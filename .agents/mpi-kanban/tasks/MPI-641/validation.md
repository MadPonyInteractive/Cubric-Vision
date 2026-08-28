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

## The visual check found a bug the tests had missed

The peer committed `main.js` + `scripts/launch-instance.mjs` shortly after the first attempt,
so `app:isolated` worked again and the screenshot became possible. It was worth going back
for.

**Measured live, one candidate installed: the box was 43px tall against the Style dropdown
trigger's 39.** Same padding, same font-size, same border — and 4px taller. The slot GREW the
moment a model was uninstalled, which is precisely what this card exists to stop, and the
six-property test passed the whole time.

Cause: the trigger is a `<button>`, and a button does not inherit the frame's 1.6
line-height. The span did — `20.8px` against the button's `normal`. Fixed with one
declaration; re-measured live after a reload (the first re-measure still read 43, because the
page had loaded the CSS before the edit — a stale-asset read that looks exactly like a failed
fix): **39 = 39**.

Screenshot taken and checked by eye: "Krea 2" sits in a box the same size and shape as the
Style dropdown above it, cogwheel flush to its right, row still 236px.

## The height assertion could NOT be pinned, and the vacuous one was removed

The obvious follow-up — assert equal height in the desktop spec — was written, and it
**passed against the 43px box**. This frame is a `main-area` MpiOverlay and the suite sits on
Landing, where that host has no size, so every element inside measures 0 and
`height === height` is `0 === 0`. Sizing the host by hand did not recover real geometry.

Rather than ship a false guarantee, the height assertion was deleted and replaced by the
INGREDIENT that decides it: `line-height` must equal the trigger's. That one is
mutation-checked — deleting `line-height: normal` from the CSS turns the spec red
(`Expected "normal", Received "20.8px"`), file restored byte-identical.

So the spec pins seven computed properties plus the negative half; the HEIGHT itself is
verified live and recorded here, not in CI. **A desktop spec cannot measure this overlay's
geometry today** — worth knowing before someone writes another one that appears to.

## Cleanup

Probe project deleted through the app's own `/delete-project` (id-matched); browser closed;
the instance killed by the PID resolved from its own port, never by a name pattern. `:3000`
re-checked 200 afterwards — the user's session was untouched throughout.
