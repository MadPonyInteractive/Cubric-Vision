# MPI-694 — Validation: Stable Audio 3 (Sound & Music)

**Verify mode:** `user-ux` — Fabio judges the audio and the flow tiles. Written 2026-09-10 at
close-out; this card shipped without a validation record and close-out resolves a card against
one, so the evidence already scattered across `plan.md` and `brief.md` is gathered here.

## The verdict that closes it — Fabio, 2026-09-10

🟢 **"694 can be closed."** And, on which of the two flows he actually ran: **"exactly. What ran
was the sound and music. That one is done."** He also cleared the licence gate himself in a
separate test.

That is the `user-ux` verification this card needed, given by the only person who could give it.
🔴 **It belongs to THIS card and not to MPI-664** — a handoff credited the same run to the Song
flow, which had not been run at all. Do not let that recombine.

## What the user judged

- **All four modes bench-approved** before the flow was built: SFX, one-shots, instruments and
  instrumental music (`../MPI-664/research/stable-audio-3-bench.md` carries every bench fact).
- **The live Sound & Music run in his own app**, 2026-09-10 — the arm reached the GPU, produced
  audio, and he called it done.
- **The licence gate**, cleared in his own test. It is keyed on the flow's `flowDepKey` in
  `js/data/modelConstants/licences.js`, and 🔴 **a lookup miss there is SILENT** — the gate
  simply never appears — so a human seeing it fire is the only real check of that wiring.
- **Both flow tiles** (`8c4754d1`, `a9efcfa2`): purpose-built `preview` + `video`, no gradient
  fallback. Sound & Music's pair are a TIME RULER — a row's width IS its length — off four new
  runs, one per category, with the durations MEASURED off the files: **10.031 / 10.031 / 4.087 /
  2.043 s** for 10 / 10 / 4 / 2 asked. The exact-length claim is verified, not assumed.

## Automated checks — re-run 2026-09-10, all green

- `node --test tests/inject-params-titles.test.cjs` — **23/23**. Every `Input_*` node in the
  graph has a declared field behind it.
- `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js` —
  **13/13** (1.4 min, own port 62730, a dev app on `:3000` left alone). 🔴 Mandatory after any
  `flowsRegistry.js` edit: `npm test` does not cover `tests/desktop/`, so a collision lands as a
  red master on somebody else's card (`mpi-message` `dc6b2779` — it cost four hours on
  2026-09-02).
- `npm test` — **917/917**. (It read 925 earlier the same day; a peer landed MPI-677 step 2 mid-session, deleting `tests/connector-responder.test.cjs` (7 tests) and one test from `windows-hide-spawn` — 8, exactly the gap. Nothing regressed; the suite shrank under us.)
- `npm run lint:components` — clean.

## 🔴 TWO RELEASE OBLIGATIONS OUTLIVE THIS CARD

Both always blocked a RELEASE rather than a build, so closing the card is consistent — but a
closed card is where an obligation goes to be forgotten, so they are stated here as well as in
the `STABLE_AUDIO_3` comment block in `js/data/modelConstants/licences.js`, which survives:

1. **Registration with Stability** — §III, required for any Commercial Purpose, with **NO
   revenue floor**. There is no threshold to fall under.
2. **The Gemma §3.1 EULA clause** — §3.2's restrictions have to appear as an enforceable
   provision in our own terms, not only in an in-app dialog.

The other three from `brief.md` § GATE 1 (a `Notice` file with both verbatim strings, both
licence copies bundled, "Powered by Stability AI" displayed) are release-gate items on the same
footing. End users are covered by us (§III, integrated end user product); neither licence
restricts by territory and neither bars outputs.

## Open, and none of it is a build item on this card

- 🟡 `Instrument` on Medium vs `small_sfx` — one switch arm, untested.
- 🟡 A direct A/B against MiniMax on one instrumental brief.
- 🟡 Does the reprompter beat a hand-written prompt? Every clip judged good so far was made with
  it **off**, which is the evidence behind shipping this flow without one.
- 🟡 An agent-dispatched flow gets no caption (`agentDispatch.js:_submitFlow` vs
  `MpiBaseFlow._run`) — worth its own card, and it is not specific to this flow.
- ✅ The doc item is DONE and its description was wrong: `existing-flows/song.md` and
  `existing-flows/sound-and-music.md` were WRITTEN (`921e2f7b`), 200 lines each. There was never
  a `minimax-music.md` to rename.
- ✅ Preview graphics for both flows — `8c4754d1`.
- 🟡 The two flow TITLES were never formally picked (Fabio offered several and chose none). Flow
  A ships as `Music Maker`. Cosmetic, and a rename is one property.

## The art's source audio is EPHEMERAL

Sound & Music's tile and hero were rendered from four clips in a throwaway scratchpad project
(`…/998b35a5-…/scratchpad/mpi694-art/MPI-694 Flow Art/Media/flowSoundMusic_00{1..4}.flac`, with
prompts and settings in `sam-runs.json` beside them). **If that art ever has to be rebuilt, the
audio must be re-made or moved somewhere durable first** — the previous set died with a deleted
project and nothing survived on disk.
