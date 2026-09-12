# MPI-740 — MpiFader's wheel: too slow, and it cannot leave zero

Raised by Fabio 2026-09-12, while evaluating `MpiFader` as the volume control for MPI-731's
audio player. Not a blocker for that card — MPI-731 uses a vertical `MpiProgressBar`, so this
is the mix fader's own defect.

## What he saw

1. The fader **crawls** under the mouse wheel.
2. Once it is **snapped to zero it never leaves** — the wheel does nothing at all. His words:
   "It never leaves zero with the mouse wheel. Which is not okay."

## Root cause, both halves, read off the source

`MpiFader` (`js/components/Primitives/MpiFader/MpiFader.js`, ~150 lines) declares **no wheel
policy at all** — no handler, and no suppression either. So what moves it is the browser's
own wheel handling of `<input type="range">`, which steps by exactly `step`.

- **Slow:** the default `step` is **0.1 dB** across a `min: -60 → max: 12` travel — 72 dB. One
  wheel tick is **0.14% of the control**. Nothing is broken; the granularity is simply a
  precision-drag granularity being used as a wheel granularity.
- **Stuck at zero:** `detent` is set `false` only on `keydown`
  (`on(input, 'keydown', () => { detent = false; })`). A wheel-driven change arrives as a
  plain `input` event with `detent` still `true`, so `read()` applies the detent:
  `Math.abs(raw - unity) <= snap` with `snap = 1` dB swallows any single 0.1 dB tick and
  returns `unity`. The value is then written back to the input — "the detent is a VALUE, not
  a paint trick" — so the fader is pinned at 0 dB **for as long as the wheel is the input
  device**. Ten ticks do not escape a 1 dB tolerance at 0.1 dB each.

**The component already documents this trap for the other device** and fixed it there: *"A
keyboard step is an exact request for a value, so `keydown` turns the detent off: with a 0.1
dB step inside a 1 dB tolerance, a snapping keyboard could never leave unity at all."* The
wheel is the same kind of input and was missed.

## The fix (both twins, one pass)

- **An explicit wheel policy**, mirroring `MpiProgressBar` — which either handles the wheel
  (`wheel: true`) or actively `preventDefault()`s it, and never leaves the browser's default
  in play. Add a `wheel` prop plus a **dB `wheelStep`** (own default, NOT `step` — that is
  the whole bug; something on the order of 1 dB), `preventDefault`, `deltaY < 0` → up.
- **`detent = false` on wheel**, exactly as `keydown` gets it. State the rule in the
  docstring once, covering both: *pointer drags feel the detent; discrete value requests —
  keyboard, wheel — do not.*
- Adding a listener means the component finally owes an **`el.destroy()`**: it calls `on()`
  from `dom.js` four times today and stores none of the returned unsubscribes, which the
  teardown rule requires. Fix it here rather than adding a fifth leak.

## Verify

`MpiFader` is mounted in exactly ONE place — `js/pages/components.js:375-379`, five variants
including a `snap: 0` control case — and **nothing in the app uses it yet**
(`grep -rn "MpiFader" js/` outside its own folder returns only that page, `types.js` and
`preloadStyles.js`). So the check is that demo page in a real Electron window: from 0 dB, one
wheel tick must leave zero and the readout must show it; the `snap: 0` variant must behave
identically; and a pointer drag must still feel the detent. `js/pages/components.js` is
claimed by **MPI-739** as of 2026-09-12 17:05Z — coordinate before touching it, or verify
against a locally mounted copy.
