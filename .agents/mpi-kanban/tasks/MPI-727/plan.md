# MPI-727 — Plan: a flow's result follows the user across steps

Read [brief.md](brief.md) first — it carries the user's words, the root cause, the spec table, and
(appended 2026-09-12) the **second half**: Reuse must load the card's result. This file is the
route through the code.

## Current State — 2026-09-12, BUILT, automated checks green, awaiting Fabio's eyes and ears

Both halves are in. `npm test` 933/933, `npx eslint` clean on the touched files,
`npm run lint:components` clean. **Nothing has been judged in the running app yet** — the card is
`verify: user-ux` and the success test is a sound, so it is Fabio's call.

### What was built

| | |
|---|---|
| `js/components/Compounds/MpiFlowResultDock/` | The floating window. Deliberately dumb: a corner and a box. `setContent(node)` / `setOpen(bool)` / `destroy()`, and it only ever DETACHES what it was handed. |
| `MpiBaseFlow.js` — `_sharedAudioEl` / `_dropSharedAudio` | THE ONE `<audio>` element, keyed by url, moved between the pane and the window. |
| `MpiBaseFlow.js` — `_dockNode` | Per-kind presentation: video muted + looping, image a thumbnail, audio the shared player. |
| `MpiBaseFlow.js` — `_syncDock` | The three-condition gate as one predicate. Called from `_renderSlide`, `_showResults`, `_forgetResult` and `_run`. |
| `flowService.js` — `openFlowFromReuse` | Seeds `s_flowResults[flowId]` with the reused card. The second half. |
| `tests/flow-result-dock.test.cjs` | 6 source-contract tests pinning the two silent failures. |

### The two decisions worth knowing before touching this again

**1. Only AUDIO is moved.** The brief's 🔴 says move the element, never re-create it — read as
narrowly as the spec allows, because it decides how much has to exist. The spec kills the sound and
loops the video in the window, so a fresh muted `<video>` is indistinguishable from the original;
an image thumbnail likewise. Audio is the one kind where a fresh element is *audibly* the bug. So
the run slide's heavy surfaces — `MpiVideoViewer` + its control bar, the compare canvas — were left
exactly where they are, and the window paints its own cheap preview instead. One shared element,
not four.

**2. Why moving works at all, and the invariant it leaves behind.** Removing a media element from
the document runs the pause steps *"once a stable state is reached"*, not synchronously. So the
same node re-appended inside one synchronous `_renderSlide` pass never stops. **Every `_syncDock()`
call site must stay inside that task** — behind a rAF, a promise or a timeout, the bug is back and
looks identical in every screenshot. `tests/flow-result-dock.test.cjs` pins the rAF case
specifically, because that rAF is on the very next line.

## Parking, still deliberate

- No close button, and the window is not draggable or dismissible. Fabio said top right; anything
  beyond that is a question for him. A window the user can dismiss and not get back is a new bug.
- Multi-result flows (a batch): the window shows item 0 and shares nothing, because
  `_paintPlainResults` gives all N their own players and there is no single one to share.

## Verification

**Verify mode:** `user-ux` — see [checklist.md](checklist.md) for the full list. The one that
matters: **press play, change step, the sound never breaks.** Then the second half: reuse a Song
card and the song is already there.

## Ownership

See [files.json](files.json). `MpiBaseFlow.js` was contended with MPI-664; that session finished in
it at `f98b38f2`, released its claim and said so in its handover message. Claim `3a1f7c2e` covers
this card's files now.
