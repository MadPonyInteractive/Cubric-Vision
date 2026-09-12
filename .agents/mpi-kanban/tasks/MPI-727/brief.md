# MPI-727 — Brief: a flow's result follows the user across steps

**Cut 2026-09-12 from Fabio's Song run.** Written for a session that has none of that context.
Nothing here needs re-deriving; the root cause is named below.

## What the user hit

He generated a song, pressed play on the last step, then stepped back to read his lyrics while it
played. **The song stopped.** When he returned to the last step, **the player was gone.**

> *"That can't happen."* — and he flagged it as not Song-specific: *"this is affecting probably
> all the flows … it's been a bit of an issue for other workflows as well."*

## Root cause — found, do not re-investigate

The run slide is **rebuilt on every navigation**. `MpiBaseFlow.js` says so itself:

> *"Seeded at SETUP, not at render: a run with untouched fields must still send their defaults,
> and the run slide is rebuilt on every navigation."*

The result pane's elements are closure-held — `_resultMediaEl`, `_resultEmptyEl`, `_resultFrameEl`,
`_resultPaneEl`, `_resultMode`, `_resultSingle`, and a `ViewManager` in `_resultView`
(`MpiBaseFlow.js:477-519`). Leaving the last step takes the `<audio>`/`<video>` element out of the
DOM, which is what stops playback — a media element cannot survive being detached and re-created.
Coming back re-renders the pane from a reset view, so the result is not there either.

🔴 **The trap for whoever builds this:** the obvious implementation renders a NEW media element
inside the floating window. That restarts audio from zero (or plays nothing), which is the same
bug wearing a different hat. **The playing element has to be MOVED, not re-created** — and moving
an `<audio>`/`<video>` node in the DOM with `appendChild` preserves playback, where re-assigning
`src` does not. Whatever the structure, the success test is: *press play, change step, the sound
never breaks.*

## The behaviour Fabio specified (his words, 2026-09-12)

> *"If a workflow has a current result and the user is not on the last step, I want a floating
> window with the result on the top right. When the user goes to the last step, that floating
> window goes away, and the result shows up in its normal box."*

| | Off the last step, in the floating window | On the last step |
|---|---|---|
| **Video** | plays in a **loop**, **no sound** | the normal result box |
| **Image** | a **thumbnail** | the normal result box |
| **Audio** | **the audio player** | the normal result box |

Three conditions gate the floating window, all of them: a result EXISTS, the flow is OPEN, and the
user is NOT on the last step. Any one false → no floating window.

## Scope

- **Frame-level, not Song-level.** It lands in `MpiBaseFlow` (and whatever component the floating
  window turns out to be), so it must work for every flow with a result — image, video and audio
  flows alike. Do not special-case Song.
- **Not in scope:** the result pane's own layout on the last step, and the gallery. This card moves
  an existing result around; it does not redesign it.

## Conventions this will run into

- **Every UI element is a component.** No bare `<div>` floating window — `ComponentFactory.create()`,
  BEM (`.mpi-block__element--modifier`), colours from CSS vars in `styles/01_base.css`, icons from
  `js/utils/icons.js`, DOM and listeners through `js/utils/dom.js` (`qs`/`on`/`off`). No hex, no raw
  `document.querySelector`, no raw `addEventListener`, no `console.log` (`clientLogger.js`).
- **Teardown is mandatory.** Any `setup` that adds a listener or an Observer defines `el.destroy()`,
  and navigation calls `instance.destroy()` before clearing a mounted Block — never `innerHTML = ''`.
  A floating window that outlives its flow is the failure mode to watch for: closing the flow must
  take the window with it.
- **`MpiPopup` / `MpiSlideOver` may already do part of this** — check before building a new
  floating primitive. `docs/component-contracts.md` carries the traps for both, including
  *"MpiPopup reuse — `mount()` wipes the anchor + `transition: all` animates restyles"*.
- **Read `.claude/rules/README.md` and `docs/README.md` first** — they route everything. Do not
  guess at architecture.

## Verification

**Verify mode:** `user-ux` — Fabio judges this one; it is a thing you look at and a sound you hear.

Automated, all required before any push:

- `npm test`
- `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js` —
  **mandatory** if `js/data/flowsRegistry.js` is touched; a collision here has cost a red master
  and four blocked hours before.
- `npx eslint` on the touched files, and `npm run lint:components`.

Then, in the app: generate on an audio flow, press play, change step, **the sound keeps playing**,
return to the last step, the player is still there and still playing. Repeat for a video flow (it
should loop, silently, in the window) and an image flow (a thumbnail).

🔴 **Never take Fabio's app on `:3000`.** Spin your own: `npm run app:isolated` (own profile AND
port, or it dies at ~2.3s with exit 0 and no window — see `docs/testing.md`).
