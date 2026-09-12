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


---

## SECOND HALF, added 2026-09-12 after the card was started — Reuse must load the result

Handed over by the MPI-664 session as an `mpi-message`
(`.agents/mpi-kanban/state/messages/8b3c6f19-42ae-4d70-95c1-0e7f2a6d8b44.json`) because the claim
on this file was live. Folded in here; it is scope Fabio added, not a suggestion.

> *"The only way we could make it work is if, when we reuse a flow, it loads in the current result
> until the user presses Generate to replace that with a new result. That solves it."*

**The rule.** Reusing a gallery card opens the flow with **that card's result already in the
result pane** — not a placeholder, not a thumbnail: the current result, behaving like one, which
means it also rides in the floating window above. **Only Generate replaces it.** Nothing else
clears it.

**What it replaces.** He first asked for the Song flow's lyrics to be copied onto the gallery card
as notes, so he could read them while the song played — then rejected his own idea in favour of
this one, because the lyrics are *already* in the flow, in the Lyrics box he wrote them in. Reuse a
card and the result plays in the floating window while he reads and edits the words that produced
it. No duplicate copy, and it works for every flow rather than just Song. That card-notes item is
superseded on MPI-664 and points here.

**So the two halves are ONE feature** — the result has to EXIST when the flow opens, and has to
FOLLOW the user across steps. Judge them together.

🔴 **The trap this half brings:** a loaded-in result is something to LOOK AT, never an input. It
must not write into the snapshot Reuse restores — `docs/playbooks/add-flow/03-storage-and-reuse.md`
§ *"Snapshot at Run, never at completion"*; the sidecar's `flowInputs` stays frozen at Run
deliberately. And the 🔴 above gets likelier, not less: a result loaded on Reuse and then
re-created into the floating window is the same broken playback wearing a third hat.

### Verification for this half

Reuse a Song card from the gallery: the flow opens on step 1 with the song in the floating window
and the lyrics restored in the Lyrics box. Press play, edit the lyrics, walk the steps — it keeps
playing. Press Generate and it is replaced; nothing else replaces it.
