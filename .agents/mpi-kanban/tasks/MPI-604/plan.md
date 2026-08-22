# MpiFader — a dB gain control with a unity (0 dB) snapping detent

## Context

Split out of MPI-573 (the mic recorder card) on 2026-08-22. MPI-573 shipped
`MpiLevelMeter`, and reviewing it surfaced that its counterpart does not exist.

**Fader and meter are different dB scales, and conflating them is what produced
this card.** A fader is `0 dB = unity` — the neutral middle, the point where the
signal is passed through untouched. A level meter is `0 dBFS = full scale` — the
ceiling every normal signal sits below. Fabio asked whether the meter's green
should run to 0 with amber only above it; that is fader thinking, and on a meter
it would mean no warning until the signal is *already* clipping. The meter's
zones stay as built (green < -12, amber -12…0, rose ≥ 0). What the exchange
really showed is that the fader is missing.

It is needed by the planned **vocals + foley mixing Flow** — two faders beside
two meters — but it is a Primitive with no Flow dependency, so it ships and
closes on its own.

## Decisions taken up front

- **Not a change to `MpiProgressBar`.** It is a shared primitive used across the
  whole app; adding snap there means a full consumer sweep, and it still would
  not own the dB/unity semantics. A fader is its own control.
- **Not `MpiMixerStrip` yet.** The channel-strip Compound should be shaped by
  the mixing Flow's real requirements, not guessed now.
- **Prop shape mirrors `MpiLevelMeter`** (`orientation`, `min`, `max`,
  `showValue`) so a future strip mounts fader and meter the same way.
- **Linear-in-dB travel**, same axis as the meter, so a strip aligns. Real
  consoles use a non-linear taper; that is a refinement the Flow can ask for.
- **Snap is a value rule, not a paint trick** — clamped in the input handler, so
  keyboard and wheel get the detent for free.

## Scope

### Phase 1 — the Primitive

`js/components/Primitives/MpiFader/MpiFader.js` + `.css`, via
`ComponentFactory.create()`.

- Props: `orientation` (`horizontal`|`vertical`), `min` (-60), `max` (+12),
  `step` (0.1), `value` (0), `unity` (0), `snap` (1), `showValue` (true),
  `label`.
- Owns a native `<input type=range>` (a Primitive may; a consumer may not).
  Vertical via `writing-mode: vertical-lr` — Chromium 136 on Electron 41, not
  the deprecated `appearance: slider-vertical`.
- Detent: `Math.abs(v - unity) <= snap ? unity : v`, applied on `input`.
- A unity tick mark on the track so the detent is visible before it is felt.
- Readout in dB with a fixed width + `tabular-nums`, matching the meter's fix
  for the column twitching on every sample.
- Instance methods on `el`: `setDb`, `getDb`, `setDbQuiet`, and `getGain()`
  returning the linear multiplier `10^(dB/20)` — every consumer needs it and
  none should re-derive it.
- Emits `input` and `change` with `{ db, gain }`.

**Verify:** eslint clean; mounts in the dev gallery in both orientations.

### Phase 2 — registration

- `js/shell/preloadStyles.js` — one appended CSS path.
- `js/components/types.js` — one appended `MpiFaderProps` typedef.

Both files carry stale claims from MPI-567 / MPI-599; check for drift before
appending.

**Verify:** the component's CSS loads without a per-consumer import.

### Phase 3 — dev component gallery card

`templates/tpl-components.html` (Primitives section) + `js/pages/components.js`,
matching the `MpiLevelMeter` card directly above it. Both orientations plus a
no-readout variant, and a live readout of the snapped value so the detent is
demonstrable without a Flow.

**Verify:** card renders through the dev radial menu → Components.

### Phase 4 — verification

Drive the dev gallery from an isolated app instance and prove the detent.

## Out of scope

- `MpiMixerStrip` / the channel strip — shaped by the Flow, later.
- The vocals + foley mixing Flow itself — its own `/mpi-add-flow` card.
- Any change to `MpiProgressBar` or `MpiLevelMeter`.
- A non-linear fader taper.

## Verification

**Verify mode:** user-ux

Automated, before handing over:

- `npx eslint` on the new component — clean.
- `npm test` — no regression.
- Real-pixel probe via `playwright-cli` against **my own** `app:isolated`
  instance (own port + profile; never :3000): drag/set the fader to a value
  inside the snap tolerance and assert `getDb()` is exactly `0`, then just
  outside it and assert it is not, in both orientations.

Then Fabio's eyes, because the detent is a tactile control:

- The unity tick is where the thumb parks.
- The snap feels like a detent, not like a stuck slider.
- The fader reads correctly beside a level meter.

## Current State

(2026-08-22) **All four phases built and measured. Waiting on Fabio's eyes only**
— verify mode is `user-ux`. Evidence table in `validation.md`; do not re-derive
it. `npm test` 680 ✓, eslint clean, every detent/geometry assertion measured off
`getBoundingClientRect()` on a real mouse drag.

Shipped as planned, with these deviations:

- **The `label` prop was dropped.** A consumer can put a label beside it, and
  `MpiLevelMeter` has none either — keeping the two prop shapes identical is
  worth more than the convenience.
- **No wheel support.** `MpiProgressBar` has it opt-in; the mixing Flow can ask
  if it wants it. Not guessed now.
- **The thumb is zero on BOTH axes, and both zeros are load-bearing.** This was
  not in the plan and is the one real discovery — see `validation.md` § "Two
  real defects the probe caught". A native range reserves half a thumb at each
  end, so the drawn cap sat up to 12px from the value the pointer set, and at
  unity the cap missed the tick it is supposed to park on. The travel axis is
  the thumb's width when horizontal but its HEIGHT under `writing-mode:
  vertical-lr`, so fixing one orientation silently left the other wrong. Both
  render plausibly; only measuring catches either.

**Found, not fixed:** every key a native range uses — arrows, Home, End — is
swallowed app-wide by `hotkeyManager`'s window capture listener, because
`isTextEntryElement()` does not count `type="range"`. Sliders are keyboard-dead
everywhere in Vision today, `MpiProgressBar` included; MPI-604 did not introduce
it. The fix is in a shared shell service and touches every hotkey, so it is
briefed rather than patched, and wants its own card. Detail and proof in
`validation.md`.

**Next action:** Fabio looks at the fader in the dev component gallery. After
that the card closes; `MpiMixerStrip` and the mixing Flow stay deliberately
unstarted.
