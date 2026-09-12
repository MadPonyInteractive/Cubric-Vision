# MPI-727 — Checklist

## Design settled 2026-09-12 (read before touching the code)

The brief's 🔴 says **move the element, never re-create it**. Read that as narrowly as the spec
allows, because it decides how much has to be built:

| Kind | In the floating window | Continuity needed? |
|---|---|---|
| Audio | the player | **YES** — this is Fabio's bug. ONE `<audio>`, moved between the pane and the window. |
| Video | muted, looping | No — the spec kills the sound and loops it, so a fresh muted `<video>` is indistinguishable. |
| Image | a thumbnail | No. |

So exactly one element is shared, and it is the audio one. The video player surface
(`MpiVideoViewer` + `MpiVideoControlBar`) and the compare canvas are **not** moved — they stay
run-slide-only and the window paints its own cheap preview.

**Why moving works at all:** removing a media element from the document runs the pause steps
*"once a stable state is reached"*, not synchronously. `_renderSlide` is one synchronous task, so
as long as the re-append happens inside it, the sound never breaks. Every `_syncDock()` call site
must therefore stay inside that same task — never behind a `requestAnimationFrame` or a promise.

## Build — half one, the floating window

- [x] `MpiFlowResultDock` Compound — JS + CSS, `setContent(node)` / `setOpen(bool)` / `destroy()`
- [x] Register the CSS in `js/shell/preloadStyles.js`
- [x] Document the props in `js/components/types.js`
- [x] Mount it into `.mpi-base-flow__stage` (top-right, dies with the flow)
- [x] `_sharedAudioEl(url)` — the one shared `<audio>`; `_paintPlainResults` appends it instead of
      creating one (single-result only; an N-output flow keeps fresh elements)
- [x] `_syncDock()` — the three-condition gate in ONE predicate
- [x] Called from the end of `_renderSlide()` and from `_showResults()` **before** its
      `if (!_resultMediaEl) return` (that early return IS the off-the-last-step case)
- [x] Also from `_forgetResult()` (file gone) and `_run()` (Generate is the only thing that
      replaces a result, so it is the only thing that empties the window)
- [x] `_teardownSlide()` does NOT drop `_audioEl` or the dock; `el.destroy()` drops both
- [ ] Ask Fabio about a close button before adding one (plan § Parking)

## Build — half two, Reuse loads the result

- [x] `openFlowFromReuse` seeds `state.s_flowResults[flowId] = { items: [item], … }`
- [x] `pending: false`, `status: ''` — the gallery note and a "Done…" line would be claims about a
      run this session never made
- [x] It writes `s_flowResults` and never `s_flowInputs` — the Reuse snapshot stays frozen at Run
- [x] A deleted file needs nothing extra: the existing mount-time HEAD probe falls back to the
      empty pane

## Verify

- [x] `npm test` — 933/933
- [x] `npx eslint` on the touched files + `npm run lint:components` — clean
- [x] A test pinning what breaks silently: `tests/flow-result-dock.test.cjs`, 6/6. The rAF case is
      pinned by name, because that rAF is on the very next line after the `_syncDock()` call.
- [ ] `js/data/flowsRegistry.js` was NOT touched, so the desktop flow specs are not mandatory —
      run them anyway before the push
- [ ] **In the app** (`npm run app:isolated`, never `:3000`): audio flow → play → change step →
      the sound keeps playing; back to the last step → still playing, still in the pane
- [ ] Video flow → the window loops it silently; image flow → a thumbnail
- [ ] Reuse a Song card → the flow opens with the song already in the window, lyrics restored;
      Generate replaces it and nothing else does
- [ ] Close the flow → the window goes with it
