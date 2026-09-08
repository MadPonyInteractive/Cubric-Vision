# MPI-604 Validation

Verify mode: `user-ux` — the detent is a tactile control, so automated checks
gate it but Fabio's eyes close it.

## Automated gates (2026-08-22)

| Check | Result |
|---|---|
| `npx eslint` on `MpiFader/`, `components.js`, `types.js`, `preloadStyles.js` | clean, exit 0 |
| `npm test` | **680 pass, 0 fail** |
| Dev gallery card renders | 4 faders + 3 meters mounted, `#preview-fader` present |

## Live probe

Own `app:isolated` instance on **:50896** with its own profile — the user's app
on :3000 was left alone and answered 200 throughout and after teardown. Driven
with `playwright-cli` real mouse (`mousemove`/`mousedown`/`mouseup`) and real
key presses, not synthetic events.

Unity sits at 83.33% of travel (`min -60`, `max +12`), so 1 dB = 3.67px
horizontally and 2.36px vertically.

| # | Action | Expected | Measured |
|---|---|---|---|
| A | drag horizontal to +0.6 dB (inside the 1 dB tolerance) | exactly `0` | `db 0`, `gain 1.0000`, readout `0.0 dB` |
| B | drag horizontal to +3.1 dB (outside it) | ~3.1, not snapped | `db 3.1`, `gain 1.4289` (= 10^(3.1/20)) |
| C | ArrowRight once from unity | `0.1` — keyboard ESCAPES the detent | `db 0.1`, `gain 1.0116` |
| C2 | two more ArrowRight | `0.3` | `db 0.3` |
| D | `snap: 0` fader dragged to +0.6 dB | ~0.6, no detent | `db 0.6`, `gain 1.0715` |
| E | End | max, `gain 3.9811` | `db 12`, `gain 3.9811` |
| F | Home | floor, readout `-∞`, `gain` exactly `0` | `db -60`, `-∞ dB`, `gain 0` |
| G | click bottom of vertical | min at the bottom | `db -60`, cap on `trackBot` to 0.0px |
| H | click top of vertical | max at the top | `db 12`, cap on `trackTop` to 0.0px |
| I | vertical quarter-up (y=390) | `-42`, cap under the pointer | `db -42.4`, cap `389.9` vs pointer `390` |
| J | vertical click ~-0.5 dB below unity | exactly `0` | `db 0`, cap at `289.8` = the tick |
| K | horizontal quarter (x=709) | `-42`, cap under the pointer | `db -41.9`, cap `708.9` vs pointer `709` |

Geometry, read off `getBoundingClientRect()` rather than eyeballed:

| State | Horizontal | Vertical |
|---|---|---|
| at unity: tick centre == cap centre == zero-length fill | all `862.7` | all `289.8` |
| at -42 dB: fill spans cap → tick | `708.5 → 862.7` | `289.8 → 389` |

So the cap parks exactly on the unity tick, and the fill's length is the amount
of cut or boost.

### Two real defects the probe caught (both fixed here)

1. **The drawn cap did not sit where the pointer set the value.** A native range
   reserves half a thumb at each end, so its 0-100% spans (track − thumb). With
   the inherited 24px thumb, clicking 12px into the horizontal track read
   `-60 dB` — the cap, the tick and the value were up to 12px apart, and at
   unity the cap missed the very mark it is meant to park on. Fixed by zeroing
   the thumb.
2. **Zeroing only the width fixed only the horizontal.** Under
   `writing-mode: vertical-lr` the travel axis is the thumb's HEIGHT, so the
   vertical fader still read `-45 dB` where `-42` was expected with the cap 7px
   off the pointer. Both axes are now zero, and both zeros are load-bearing.

Neither was visible without measuring — both render plausibly.

## Found, NOT fixed here — sliders are keyboard-dead app-wide

`ArrowLeft/Right/Up/Down`, `Home` and `End` never reach a focused
`<input type="range">` anywhere in the app. `hotkeyManager.js` binds a window
capture listener; `isTextEntryElement()` (line 45) returns false for
`type="range"`, so `isTyping` is false, the `allowWhileTyping: false` gate does
not block, and the manager calls `preventDefault()` + `stopPropagation()`.
`video.frame.back/forward` (registry ~424/433), `compare.frame.back/forward`
(~534/543) and the `home`/`end` entries (~478/487) all claim keys a native range
needs.

Proven, not inferred: with a window capture spy armed, `ArrowRight` reached the
window with the range as `target` but never reached the element, while an
unbound `a` did. Detaching `Hotkeys._cleanupDown/_cleanupUp` made every keyboard
assertion above (C, C2, E, F) pass immediately.

**Pre-existing and app-wide** — `MpiProgressBar` uses the same native range and
has the same hole; MPI-604 did not introduce it. The fix belongs in the shared
`hotkeyManager` gate (a focused native control should own its own keys), which
touches every hotkey in the app, so per THE ROOT-CAUSE RULE it is briefed rather
than quietly patched. Wants its own card.

`MpiProgressBar` also carries defect 1 above: a 24px thumb
(`MpiProgressBar.css:73-80`) with its handle positioned at a bare `left: percent%`
from the JS, not the CSS (`MpiProgressBar.js:44` in the template, `:78` on the
update path). Not swept — shared primitive, every consumer.

## Outstanding

Fabio's eyes, in the app: the cap parks on the unity tick, the snap feels like a
detent rather than a stuck slider, and the fader reads correctly beside a level
meter. Dev radial menu → Components → the MpiFader card, which carries both
orientations, a no-readout variant and a `snap: 0` control to feel against.
