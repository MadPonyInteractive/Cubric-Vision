# App UI/UX — the portable layer

> **PORTABLE ONLY.** Everything here applies to EVERY app, present and future. App-specific
> detail lives in [../existing-apps/](../existing-apps/) — one file per app.
>
> **The promotion rule:** a UI decision made while building one app and found to generalize
> gets MOVED here, and the app's own file links to it. If a pattern stays buried in an app
> file, app #5 never finds it and reinvents it worse. Promote early.

Read this when you build any app's `uiComponent`, or when a design pass touches the App
overlay / App Library. The procedure for wiring an app is the numbered sections
([../README.md](../README.md)); this folder is the *look and behaviour* those sections assume.

## Patterns

| File | Covers | Origin |
|---|---|---|
| [box-gizmo.md](box-gizmo.md) | Ratio-locked box selector over an image; coord contract into the graph | Head Swap (MPI-299) |

## Baseline rules

- **The frame is `MpiBaseApp`.** An app's `uiComponent` supplies ONLY the controls that
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

- **Slot previews.** App input slots currently show a raw path string; want image thumb /
  `<video>` / `<audio>` player. Open item on MPI-259.
- **Result-pane polish.** Shape of the in-app result view (single, multi-output, latents).
- **Where per-app controls sit** relative to slots + Run — no convention locked yet.
