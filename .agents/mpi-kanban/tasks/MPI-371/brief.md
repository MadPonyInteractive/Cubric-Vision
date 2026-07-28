# MPI-371 Brief — the mask tool family

Spun out of the MPI-361 session on 2026-07-28, straight from the user's direction
after Phase A was verified.

## Why now

`MpiToolOptionsMask` is one panel holding every masking method behind a
`Detect / Points` source radio, with the brush strip inline at the bottom. Two more
methods are already carded — Shapes (MPI-368) and Text (MPI-361 Phase B) — and both
would either bloat that panel further or copy-paste the strip. The user called it:
each method should be its own tool, and the strip should be one component.

## The family

| Tool | Source | Status |
|---|---|---|
| **Points** | `SAMDetectorCombined(detection_hint='mask-points')` on the shipped `sam_vit_b` weight | shipped — MPI-361 Phase A |
| **Detect** | `UltralyticsDetectorProvider` — Face / Hair / Hand / Person | shipped, predates MPI-361 |
| **Shapes** | rectangle / triangle / ellipse gizmo, Add or Subtract | **MPI-368** |
| **Text** | `SAM3_Detect` + `CLIPTextEncode` — type what to mask, press Detect | **MPI-361 Phase B** (1.75GB weight, licence shippable) |

This card is the SPLIT and the SHARED STRIP. The tools themselves stay on their own
cards — do not fold MPI-368 or Phase B into this one.

## The shared strip

Paint / erase toggle · invert mask · clear mask · opacity slider. Extract it from
`MpiToolOptionsMask`, do not rewrite it. What must survive the move, verbatim:

- `viewer.el.setMaskBrushMode` / `setMaskInverted` / `isMaskInverted` / `clearMask` /
  `setMaskOpacity` — the whole viewer contract it drives today.
- `Hotkeys.bind('mask.brush.toolbar')` and `'mask.eraser.toolbar'` — registry ids,
  never a raw keydown listener.
- `Events.emit('settings:tool:update', …)` for `opacity` and `inverted`, restored on
  mount through `getToolSettings`.
- The invert button's `is-active` + `--on` modifier styling.

## Traps to carry across the split

1. **`destroy()` must call `viewer.el.setMaskPointsMode(false)`.** Points mode owns
   the right mouse button and suppresses the image context menu — whoever owns the
   lifecycle after the split has to keep restoring it, or right-click stays broken
   after the user leaves the tool.
2. **Switching tools must not clear the mask.** `manualCanvas` + `subtractCanvas` are
   the user's work; only the auto layer is disposable. Today the panel is one
   component so the question never came up — after the split, every mount/unmount is
   a chance to wipe it.
3. **Registration is mandatory per component:** `.css` into
   `js/shell/preloadStyles.js`, props into `js/components/types.js`.
4. `MpiAutoMaskThumbs.setPicks()` deliberately does NOT emit `'change'` — points mode
   relies on that to restore pick 0 after `setImages()` clears the selection without
   re-triggering the run. Do not "fix" it while moving code around.

## Answered by the user — 2026-07-28

- **Rail shape:** **one icon per tool**, all inside the existing MASK group. No
  switcher — they sit together, so it does not read as clutter. Revisit only if the
  family outgrows the rail.
- **Settings:** they persist.
- **The strip is not identical everywhere.** Brush + eraser must be **optional** — a
  prop or variant on the shared component. The **Points tool hides them**: there the
  user only places points. Invert, clear and opacity stay on every tool.

### Design check that falls out of the third answer

`Add` bakes the detected region into `manualCanvas`, and the brush is how a user
cleans that up by hand. With no brush on the Points tool, cleanup means switching to a
tool that has one. Confirm that is the intent before building it — the user has been
told, and their call stands either way.

## Read before coding

`.claude/rules/components.md` (§ Observer Lifecycle & Teardown Contract),
`docs/component-contracts.md`, `.claude/rules/dos_and_donts.md`.
