# Flow UI/UX — the portable layer

> **PORTABLE ONLY.** Everything here applies to EVERY flow, present and future. Flow-specific
> detail lives in [../existing-flows/](../existing-flows/) — one file per flow.
>
> **The promotion rule:** a UI decision made while building one flow and found to generalize
> gets MOVED here, and the flow's own file links to it. If a pattern stays buried in a flow
> file, flow #5 never finds it and reinvents it worse. Promote early.

Read this when you build any flow's controls or steps, or when a design pass touches the Flow
overlay / Flow Library. The procedure for wiring a flow is the numbered sections
([../README.md](../README.md)); this folder is the *look and behaviour* those sections assume.

## Patterns

| File | Covers | Origin |
|---|---|---|
| [carousel-frame/](carousel-frame/README.md) | **THE flow frame** — step carousel, steps-as-data, results save themselves (split into README/steps/fields/run-path/composition) | Head Swap (MPI-299) |
| [box-gizmo.md](box-gizmo.md) | Ratio-locked box selector over an image; coord contract into the graph | Head Swap (MPI-299) |
| [crop-gizmo.md](crop-gizmo.md) | **The FRAME the picture sits in** — the History crop tool's own `CropManager` in a step, contain-not-inscribe ratios, and a kind that returns a FILE instead of a param | Outpaint (MPI-594) |
| [paint-gizmo.md](paint-gizmo.md) | **The user DRAWS** — the History paint tool's own `PaintManager` + `brushDab.js` in a step, the undo contract, and a kind returning the LAYER ALONE into its own media slot (`mediaRole`) | Scribble-to-object (MPI-567) |
| [prompt-enhance.md](prompt-enhance.md) | **The prompt pair** — a user prompt, an `action: 'enhance'` button, an editable enhanced prompt; the media-less `fields` step that hosts them | Character Sheet (MPI-504) |
| [switch-bank-fields.md](switch-bank-fields.md) | **One field, N graph values** — an `MpiInt` selecting `MpiAnySwitch` banks, for a preset (resolution, duration) one field cannot otherwise reach | Character Sheet (MPI-504) |
| [result-pane.md](result-pane.md) | **What the run slide shows once a run finishes** — the declared `result.compare` before/after, the real video player every single-video result gets, and the session snapshot that survives close -> reopen | Head Swap / LTX Upscale (MPI-585/587) |
| [lora-rack.md](lora-rack.md) | **The user's own LoRAs in a flow** — `loras: true` on a model SLOT gives that phase a rack and a cogwheel that reuses the app's Model Settings panel, plus the injection chain that makes them actually run. One rack per phase, one cogwheel, beside that slot's model dropdown on the run slide | Character Sheet (MPI-504 -> MPI-608/610 -> MPI-638) |

## Baseline rules

- **The frame is `MpiBaseFlow`.** A flow's declared `fields` supply ONLY the controls that
  differ. Never re-implement the frame, the media slots, Run, or the result pane —
  [../04-overlay-and-shell.md](../04-overlay-and-shell.md).
- **Don't ask the user for precision you throw away.** If the graph reduces the input to N
  numbers, collect N numbers. Painting a mask that becomes a bounding box is a lie in the
  UI — see [box-gizmo.md](box-gizmo.md) § Why not a painted mask.
- **Prefer an existing interaction over a new one.** The crop tool, the History mask
  surface, the Model-Library slide-over are already learned by the user; reuse beats novel.
- Standing UI law (BEM, `ComponentFactory.create()`, `qs`/`on` from `js/utils/dom.js`, CSS
  vars, `js/utils/icons.js`) is in `.claude/rules/dos_and_donts.md` + `components.md` — it
  is NOT restated here.

## Open / to brainstorm

Not yet decided — captured so the next session doesn't start cold:

- **Slot previews.** Flow input slots currently show a raw path string; want image thumb /
  `<video>` / `<audio>` player. Open item on MPI-259 — and a hard requirement for the
  carousel's step 0 (dropped media REPLACES the slot's placeholder content) and for any box
  step (you cannot box what you cannot see).
- ~~**Result-pane polish.**~~ ANSWERED — [result-pane.md](result-pane.md). (Apply/Discard are
  gone too: hold-until-Apply shipped as MPI-306 Phase 3 and was removed after the UX pass.)

Answered by [carousel-frame/](carousel-frame/README.md), kept here as pointers:

- **Where per-flow controls sit** → the last step's left pane, opposite the result.
- **Overall flow layout** → the carousel frame. Divider on first + last step only.
