# MPI-531 — Plan (item 1 slice only)

Picked up 2026-08-14 to **unblock MPI-552** (foley / extend / lipsync). Scope is
deliberately ONE slice of the card:

- **IN:** item 1 — extend `FlowStepField` with `slider` / `number` / `text`.
- **IN (scope extension, see below):** `FlowDef.controls` — declared fields on the
  RUN slide.
- **OUT:** item 2 (`steps[].image`), item 3 (author every 1.5 Flow declaratively —
  that is MPI-552's own work), item 4 (port `MpiFlowHeadSwap`).
- **OUT:** MPI-532 entirely. The 1.6 package format is not being designed here.

The card stays in `doing` only for this slice; the remaining items stay open on it.

## Why the scope grew by one key

Item 1 as carded is not sufficient and the card did not know it. `fields` render on
MIDDLE steps only — `_buildStepSlide` → `_buildFieldsRow`. The LAST step's controls
come from exactly one place:

```js
if (props.uiComponent) {
    _perFlow = props.uiComponent.mount(contentSlot, { initialInputs: seeded });
}
```

`MpiBaseFlow.js:732`. So a Flow that needs a prompt, a seed or a width TODAY must
ship a JS component — which is the debt this card exists to stop. Adding field types
without a run-slide surface would leave MPI-552 exactly as blocked as it is now.

`controls: FlowStepField[]` is the smallest fix: same field vocabulary, same
renderer, values merged into the run inputs under the field's own `id`. That is
already the contract the ripped `MpiFlowImageRegen` implemented by hand —
`el.getInputs = () => ({ positive: promptEl.value.trim() })` — so this is the
declarative form of a shape the app already ships, not a new one.

`uiComponent` is untouched and still mounts. Head Swap keeps working unchanged.

## Steps

1. Extract the per-field renderer out of `_buildFieldsRow` so ONE builder serves both
   the step row and the run controls — the frame renders both, which is the reason
   the doc gives for the frame owning fields at all (consistency for free).
2. Add `number`, `slider`, `text` to that builder. `text` takes an optional `rows`;
   `rows > 1` renders a `textarea` (the prompt case — `MpiFlowImageRegen` used
   `rows="3"`).
3. Add `FlowDef.controls`, rendered stacked into the run slide's `contentSlot`,
   seeded from `state.s_flowInputs[flow.id]`, merged top-level in `_collectInputs()`.
   `uiComponent`'s `getInputs()` merges AFTER, so a flow declaring both keeps the
   component authoritative.
4. Typedefs in `js/data/flowsRegistry.js` (`FlowStepField` + `FlowDef.controls`).
5. CSS for the new types + the stacked modifier.
6. Update `docs/playbooks/add-flow/ui/carousel-frame.md` — it currently documents the
   3-type row and says the last step's controls are the flow's component.

## Verification

- `node --check` on every edited `.js`; `npm test` stays green.
- **The real proof is MPI-536 (foley) authored with NO `uiComponent`** and running in
  my own app instance (`npm run app:isolated`, never `:3000`). Field types with no
  Flow using them is not evidence. That run closes this slice.

## Current State (2026-08-14, handoff)

Item 1 slice **SHIPPED and verified** — `55461326` (frame + typedef + playbook docs) and
`621174e6` (the first Flow using it). Evidence in `validation.md`; checklist fully ticked.
591/591 suite green, eslint clean, both commits pushed.

Items 2 (`steps[].image`), 3 (author every 1.5 Flow declaratively) and 4 (port
`MpiFlowHeadSwap`) are **untouched and still open**. The card is a 1.5 release blocker until
they land. MPI-532 was deliberately not started.

### 2026-08-15 — the declarative shape is PROVEN, and Fabio's live run named what the frame still lacks

MPI-536 (foley) shipped and Fabio ran it end to end in his own app: *"spot-on with what I
asked for"*. That is item 1's verification clause satisfied for real — a Flow with no
`uiComponent`, generating correctly. **The function is done; the frame around it is not.**

Five gaps he named on that run, all frame-level, none belonging to MPI-536:

1. **No in-app media picker.** The only way to fill a media slot is importing from an
   external source — the pop-up library was never built. This is the biggest one: a Flow
   cannot use what is already in the project.
2. **The result pane is TEXT.** "Your result appears here." then, on completion, still no
   player. It has to be a playable video.
3. **The run slide's controls are tiny and in the wrong place.** His layout: move the prompt
   boxes into step 2 with a **big preview of the video being worked on**, prompts *below*
   it. Today they are a narrow column with the result pane empty beside them.
4. **Dead air between Generate and the first latent.** The status bar moves, the slide does
   not. Needs a spinner or the scanline the instant Generate is pressed.
5. **Reference audio is not exposed anywhere in a Flow**, though the model has it (see the
   bench-session note below).

### The latent-preview bug — the SOURCE OF TRUTH exists and the consumers diverge from it

Fabio, same run: minimised-app preview shows **one still frame** for a video generation,
while the Flow result pane **replays the whole clip fast on every sampler step** and then
freezes on a still. He is right that this is the thing he asked for and it is not working.

`docs/preview-bus.md` already defines the contract, and it is not vague: the
`VHS_latentpreview` marker fires **once per sampler run** and is recorded on the GENERATION
(`activeGenerations.resetPreview` / `getPreviewClip`), never latched on whoever is mounted;
`rate` and `length` are load-bearing (playback runs at `rate`, the ring is sized by
`length`); `MpiGalleryBlock` re-hands it to the card with **every** frame so a missed marker
self-heals (MPI-535). So the bus is fine. **What is missing is one shared consumer** —
gallery card, Flow result pane, History, and the minimised mini-window each need the same
accumulate-ring + `rate` playback, and today only the gallery card implements it. Two
different wrong behaviours from two different re-implementations is the signature.

That is a real card to write next session, and it is NOT this one — this card is the Flow
frame; that one is the preview consumer.

### Reference audio — a BENCH session, not app work

Fabio asked whether reference audio was dropped. It was not: MPI-536 deliberately shipped
foley-only because **voice mode has never been executed**, and its brief forbids shipping
the two modes as composable toggles. The graph carries the whole branch (`Input_Audio#106`,
`Input_Use_Input_Audio#108`, `Input_Use_Reference_Audio#122`, `Audio_Influence#110`) and the
shipped `ltx-23-balanced` description already advertises "reference-voice and direct-audio
modes". Standing research: `docs/models/ltx/audio-input.md`. So the next step is a bench run
to prove voice mode, then decide mode-picker vs second Flow — not an app edit.

## Plan Drift

**The scope grew by one key, and it had to.** Item 1 alone unblocks nothing: `fields` render
on middle steps only, and the run slide's controls came solely from `props.uiComponent`. So
`FlowDef.controls` shipped with it — declared run-slide controls, `Input_*` ids routed into
`injectionParams`. The card body still describes item 1 as just the field types; that is now
understated, not wrong.

`number` is implemented but has **no live consumer yet**. Its first will be extend's
width/height (MPI-520), which needs a bench re-export.

### 2026-08-15 (session 2) — the punch list, re-scoped against the code

Read the frame before building. Two of Fabio's four items are NARROWER than the handoff
recorded them, and one new item arrived:

- **Item 2 (result pane).** `_showResults` ALREADY builds `<video controls muted loop>` for
  `type === 'video'` (`MpiBaseFlow.js:1110`). What Fabio saw is `_resultEmptyEl` — the empty
  state, hidden by `_syncResultEmpty()` only when `_resultMediaEl` has a child. So the bug is
  upstream: either `onComplete` fired with no items, or the item was not tagged `video`.
  DIAGNOSE on a live run; do not build a second player over a working one.
- **Item 2b (NEW, Fabio 2026-08-15).** The result video is hardcoded `muted: true`. On foley —
  a Flow whose whole output IS the audio — the result plays silent until the user finds a tiny
  speaker button. `muted` normally guards autoplay policy, but there is NO `autoplay` anywhere
  in `js/components/`, so it guards nothing here. Safe to drop; confirm on the live run.
  Note the frame hand-rolls a raw `<video>` while `MpiVideoViewer` exists — possibly the same
  root as item 2.
- **Item 4 (dead air).** The scanline WORKS; it is simply never armed at run start.
  `_setScanline(true)` is called only from `_paintResult` (`:1082`), i.e. on the first latent.
  `_run` must arm it.
- **Item 1 (media picker).** Confirmed net-new — no picker component exists in the repo.
  Scope settled with Fabio: CURRENT PROJECT ONLY, filtered to the slot's media type.

Dispatch evaluated and SKIPPED: of 15 ready cards, MPI-560 is this card's own umbrella parent
and MPI-552 / MPI-529 touch the same Flow surface this card is mid-edit on. Not disjoint.

### 2026-08-15 (session 2, end) — frame work part-shipped; the session turned into an audio BENCH

**Frame (MPI-531 proper) — 3 of 4 punch-list items done and verified in the app:**
media picker (new `MpiMediaPicker`), instant scanline on Generate, unmuted result video.
Item 3 (step-2 relayout) is **deliberately STOPPED** — see below. `MpiStepPreview` is written
and registered but has NO consumer yet.

**Why item 3 stopped (user's call, and he is right):** reference audio would add a SECOND
media slot (audio) to foley's `inputSchema`. Building the step-0 thumbnail + big-preview
middle step against today's one-slot input set means rebuilding it when the slot lands.
UI waits on the bench.

**Open, NOT dismissed:** the user reported the isolated instance "not working" after this
session's edits. Frame checks were DOM-level and passed; no full generation ran through it.
`_setRunning` (now also drives scanline + empty-state) and the new `MpiMediaPicker` import
are both in scope. Detail + the three candidates are in `validation.md`.

### The bench session — LTX foley audio branch

Bench file: `G:\ComfyUi\ComfyUI\user\default\workflows\flow_ltx_foley_AUDIO_bench.json`
(53-node shipped graph + user's edits; `comfy_workflows/` is untouched, git-clean).

**FINDING 1 — foley generates SPEECH from the prompt alone.** Both audio booleans false,
`Input_Audio` empty, and the clip came back speaking the requested line in the requested
voice. Proven from `/history`, not by ear. Written up in `docs/models/ltx/audio-input.md`.

**FINDING 2 — three separate audio problems, wrongly conflated all session:**

| symptom | real cause | evidence |
|---|---|---|
| "underwater" | **wind rumble, seed-dependent** | sub-200 Hz == full-mix level on bad seeds (-30.9 vs -30.8); good seed drops it 30 dB |
| loud / clipping | **prompt + seed**, not gain structure | -18.9/-0.5 vs -16.5/0.0 across prompt variants |
| phasing | **HF-weighted L/R divergence on near-mono audio** | MID -36.4 / SIDE -66.5; SIDE slopes -91→-62 dB with frequency |

The seed lottery is WIDE: 35 dB swing in top-band content between seeds on one graph.
`docs/models/ltx/audio-input.md` already says "seed is a LOTTERY — seed-hunt always".

**FINDING 3 — the normalising-sampler detour was a WRONG CALL. Reverted.** Two nodes tried:
- `LTX2AudioLatentNormalizingSampling` (KJNodes) — a MODEL patch whose wrapper assumes
  standard LTX2 joint AV sampling. Foley freezes video / masks audio, so its recombine threw
  `mat1 and mat2 shapes cannot be multiplied (548736x1 and 128x3)`. Wrong layer entirely.
- `LTXVNormalizingSampler` (LTXVideo, the node the USER named) — correct layer, drops into
  `#39`. At the default `1,1,0.25,1,1,0.25,1,1` it **destroyed the audio** (user: "phasing
  filter on top"), measuring -39.4 dB with the top octave gone.

`#39` is back to `SamplerCustomAdvanced`, verified from `/history` on three runs. **Do not
re-propose a normaliser for the loudness** — the loudness was ~2 dB of prompt/seed variance,
not a structural gain problem, and I mis-attributed a -80.8 dB top-end reading to the node
when a no-node run on the same seed showed the identical figure.

**Measurement method worth reusing:** ffmpeg `volumedetect` at
`./node_modules/ffmpeg-static/ffmpeg.exe`, plus band splits (`lowpass=200` rumble /
`lowpass=4000` / `highpass=8000`) and a mid-side pan for correlation. The rumble-vs-top-band
ratio predicted the user's ear verdict on every run — seeds can be screened numerically
instead of listened to one by one. `ebur128` is useless under ~10s (reports the -70 floor).

### 2026-08-15 (session 3) — the audio bench answered a DIFFERENT question than it set out to

Went in to settle the phasing. Came out with the stereo/prompt contract instead, and with
the phasing still open. Full writeups: `docs/models/ltx/prompt-contract.md` (the prompt
rules) and `docs/models/ltx/audio-input.md` (the disproven theories + graph corrections).

**Settled — the prompt controls the stereo field, the video does not.** Three runs on the
lizard clip (`ref2v_ms_063.mp4`, subject crosses right → left), foley mode:
`00025` empty prompt → mono (48.6 dB MID/SIDE gap); `00026` + `00027`, two seeds, both
with directional language → real pans (14.7 / 18.1 dB gaps, `R-L` tracing right at the
head and left at the tail). Also proven: **the model sees the video** — `00025` generated
coherent audio at −21.1 dB from an EMPTY prompt against a −52.7 dB source. It just
defaults to centre.

Second, independent axis: **sound-first phrasing drives quality**. `00027` rewrote the
same directional cue as a sound description rather than a shot description and gained
12 dB of presence plus, per the user's ear, an actual breath instead of a generic noise.

**Phasing — still UNKNOWN, two theories dead.** Mine (HF-weighted L/R divergence) was
disproven by construction: a 44 dB MID/SIDE gap means the content was already mono, and
the user confirmed by ear and in Fairlight that the A/B was identical. The user's (fold a
truly stereo run and the phasing appears) was disproven by ear on `00026`'s mono fold.
Remaining suspects, untested and ranked in `audio-input.md`: the audio VAE decode,
`Foley_Lora` strength, and `#13 Input_Negative` — which begins with the token `phased`,
live at cfg 3, and is nearly free to test.

**Bench traps found the hard way** (all three now in `audio-input.md`): `#126
Input_Positive` is an ORPHAN and `#12` is the live one; `Audio_Influence` is INVERTED
(0.9 → mask ≈ 0.1); outputs go to `D:\WORK\Images\Outputs`, NOT `ComfyUI/output/`,
and the `AnimateDiff_*` temp files are a second save of the same run.

**`#108=true` direct audio STILL NOT RUN.** Staged once, then dropped for the stereo
question, and the bench is now on the lizard clip in foley mode. Re-staging notes: it
needs a video whose frame 0 shows a face, and `Boss.mp3` is MONO content (57 dB gap) so
it proves nothing about stereo — its value is the lipsync path only.

### 2026-08-15 (session 3, cont.) — the phasing thread is CLOSED

Ran a 5-run sweep (one variable each, seed held) against the live bench via
`scripts/workflow-to-api.mjs` + `POST /prompt`. Outputs `00031`–`00035`, copies in the
session scratchpad under `sweep/`.

**Result: "the phasing" was TWO different things**, now split in
`docs/models/ltx/audio-input.md`:
- **A — real phasing**: affects EVERY sound in a clip, **seed-driven**. Seed-hunt; the
  rumble-vs-top-band ratio screens it numerically.
- **B — bad reconstruction**: one sound CLASS (breath; the lizard), present on good seeds
  too. **Not a signal defect — it is the model's training coverage.** No graph-level fix.

User's call after listening to the sweep: *"it's not phasing. It's just a bad reproduction of
a breath."* Two sessions of gain/band/stereo measurement were chasing a mechanism that, for B,
does not exist.

**Eliminated conclusively this sweep** (do not re-run): `slope_len` 1 vs 8 vs 16 →
**bit-identical SHA256** (the foley audio mask is a uniform constant, so there are no edges to
ramp — inert by construction); `Foley_Lora` 1.0 → 0.7 (*"E and A are very similar"*); the
`phased` negative token (changed the render but not the artifact — though it DID produce a
proximity effect, voice closer, worth knowing for negative tuning).

**Also corrected:** last session's "stereo placement is prompt-driven" was too strong.
`00028`/`00030`/`00031` — three static close-ups with explicit direction words, including an
off-frame speaker "from the right" — all came back mono. Stereo appears only when the subject
MOVES on screen. `prompt-contract.md` rewritten accordingly.

### Next session, in order

1. **Lizard clip with NO directional language** — the one run that separates motion from
   prompt. If it still pans, direction words contribute nothing and the rule is purely
   "stereo follows on-screen movement".
2. **`#108=true` direct audio** — the carded blocker, still never executed. Needs a video whose
   frame 0 shows a face. `Boss.mp3` is MONO content, so it proves the lipsync path only.
3. Reference/voice-ID (`#122=true`) is **likely a dead end at 8 steps** — `audio-input.md`
   records it as DROPPED for v1 on distilled (identity needs ~30 steps). Unchanged from the
   last two sessions: do not burn runs on it before the two above.

**Audio-quality expectations are now set, and they are a MODEL property, not a graph bug:**
breath and other thinly-covered sound classes reproduce badly, and no widget fixes that. Seed
variance handles the rest. Design the Flow's copy around that.
