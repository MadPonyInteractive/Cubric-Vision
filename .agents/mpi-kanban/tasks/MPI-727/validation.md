# MPI-727 — Validation

**Verify mode: `user-ux`.** The success test is a sound, so the card is not done until Fabio has
heard it. Everything below is what a machine could settle; the last section is what only he can.

## Automated — all green, 2026-09-12

| Check | Result |
|---|---|
| `npm test` | 933/933 |
| `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js` | 15/15 |
| `npx eslint` on the touched files | clean |
| `npm run lint:components` | clean |

`js/data/flowsRegistry.js` was **not** touched, so the desktop flow specs were not mandatory. They
were run anyway, and one of the 15 is new.

## The check that actually proves the card

`tests/desktop/flow-result-follows-steps.spec.js` — in the real renderer, with a real two-second
WAV as a `data:` URL so the element genuinely decodes and genuinely plays. It:

1. seeds a result the way Reuse now does, and asserts the floating window is already holding it
   when the flow opens on step 0 (**that is half two, verified**);
2. stamps the `<audio>` node and starts it playing;
3. walks forward to the run slide and asserts the pane holds **the same node**, still not paused,
   with `currentTime` no lower than before;
4. walks back off the last step and asserts the window takes **the same node** back, still playing;
5. destroys the flow and asserts the window goes with it and the sound stops.

**MUTATION-PROVEN.** Replacing `_sharedAudioEl(url)` in `_paintPlainResults` with a fresh
`ce('audio', …)` — the exact shape of the bug, and a change no screenshot, regex or accessibility
tree can see — turns it red on *"the run slide must adopt the SAME audio node"*. The mutation was
made, run, and reverted; the six source contracts in `tests/flow-result-dock.test.cjs` all stayed
green through it, which is precisely why the desktop spec exists.

## Seen with my own eyes

Screenshots taken off a fixture flow in the real app (own port, own profile — Fabio's `:3000` was
not touched): the window sits in the stage's top-right under the ticker, showing the audio player
at 260px for an audio result and a 200px thumbnail for an image one, while the Lyrics step stays
fully usable underneath. No renderer errors.

One honest note on the look: the player is Chromium's native `<audio controls>`, which is a light
pill on the dark stage. That is not new — it is the same element the result pane has used since
MPI-622, and it is the element being *moved*, so it could not be swapped here without breaking the
thing this card exists to fix. Worth its own card if Fabio wants it styled.

## Left for Fabio — DONE, 2026-09-12

- [x] Generate on a real audio flow, press play, change step — **the sound keeps playing** — return
      to the last step, still playing, back in its normal box.
- [x] A video flow: the window loops it silently. An image flow: a thumbnail.
- [x] Reuse a Song card: the flow opens with the song already in the window and the lyrics
      restored; Generate replaces it and nothing else does.
- [ ] STILL OPEN — does the window want a close button, or to be draggable? Deliberately not built — a window
      the user can dismiss and not get back is a new bug, so it was left as a question.

### Fabio's verdict, 2026-09-12

> *"Okay, looks good. I've tested with video, image, and audio flows."*

All three kinds verified in the running app by the user, which is the whole of `user-ux` mode.
Card closed on that.

The close-button question stays open and unasked-for: he signed the card off without wanting one,
so no window chrome was added. That is the parked item, not a debt.

### Claim audit, 2026-09-12

Every factual claim on this card — the commit body, this file, the plan's "What was built" table
and the ticked checklist — was re-checked against the tree by the read-only claim auditor at
close-out. **10 claims, 10 proven, 0 findings.** It re-ran both suites itself rather than trusting
the numbers written here: 933 pass / 0 fail, and 15 test cases across the 13 `tests/desktop/flow-*.spec.js`
files, which is where the "15/15" comes from. It also confirmed the two structural claims that are
easy to assert and hard to keep: `_syncDock()` has exactly four call sites (2207, 2590, 2614, 3275),
sits before the early return in both `_forgetResult` and `_showResults`, and lands at 2207 — after
`slidesEl.appendChild(slide)` at 2200, before the rAF at 2209.
