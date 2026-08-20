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
| [carousel-frame.md](carousel-frame.md) | **THE flow frame** — step carousel, steps-as-data, results-not-real-until-Apply | Head Swap (MPI-299) |
| [box-gizmo.md](box-gizmo.md) | Ratio-locked box selector over an image; coord contract into the graph | Head Swap (MPI-299) |
| [prompt-enhance.md](prompt-enhance.md) | **The prompt pair** — a user prompt, an `action: 'enhance'` button, an editable enhanced prompt; the media-less `fields` step that hosts them | Character Sheet (MPI-504) |

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
- **Result-pane polish.** Shape of the in-app result view (single, multi-output, latents) —
  now specifically the carousel's last step, where Apply/Discard also live.

Answered by [carousel-frame.md](carousel-frame.md), kept here as pointers:

- **Where per-flow controls sit** → the last step's left pane, opposite the result.
- **Overall flow layout** → the carousel frame. Divider on first + last step only.
