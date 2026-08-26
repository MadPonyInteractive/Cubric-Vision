# Voice library — the character + performance clip library the TTS/VC flows select from

## Current State

**Project mode:** `scalable-foundation`.

> **Session 17 note (2026-08-25) — READ THIS FIRST, it supersedes the session 16 note below.**
> The Parallel Batch is DONE (import pipeline + `MpiVoicePicker`, both verified independently
> of their worker reports) and **Phase 2's 12 clips are AUTHORED**. Nothing on this card is
> blocked and nothing is waiting on Fabio except two listening calls and the `register`
> wording in brief.md § 2.
>
> **The single next action is Fabio's ear, on two named asks** (control + axis both named,
> level-matched set at `scratchpad/phase2_clips_lvl/`): (1) do the six R1 clips read as their
> labels, and (2) do `perf_R1_neutral` (94.7 Hz) and `perf_R1_angry` (167.3 Hz) sound like the
> SAME PERSON. Ask 2 exists because of a new measurement: emotion-driven pitch lift is
> **register-asymmetric ~2:1** — R1 lifts +9.9/+11.6 st for angry/cheerful where R3 lifts only
> +4.8/+4.4 st from identical prompt grammar. If one R1 character ever sounds like two people
> across the emotion set, that asymmetry is the cause and R1 is where it shows first.
>
> After that: a CURATION pass before the full 228 import (the 10-voice sample is 6xR1/3xR2/1xR3
> with no R4/R5 and every voice `kind: "both"`, so the kind filter is inert), then Phase 3.
>
> **Do NOT "repair" the angry and cheerful clips** because they measure out of band. The pitch
> lift IS the emotion; `register` names the performer's baseline. The proof the persona prompt
> worked is that all eight low-arousal cells landed in band.

> **Session 16 note (2026-08-25).** Phase 0 RESOLVED on option 1, D1/D2 answered, Phase 1
> SHIPPED (737/737, eslint clean), and the overdue voice-changer guidance rewrite is done.
> Three of my own hypotheses died on the way and all three are recorded as wrong in
> `validation.md` rather than dropped -- VC-corrupts-phonemes, the pitch-direction rule, and
> voiced-density. **The one thing that now BLOCKS Phase 2 is an accent decision**: VC
> overwrites the target's accent with the source's, so whoever records the performance clips
> sets the accent of every `character` voice in the library. Next work is the Parallel Batch
> (import pipeline + `MpiVoicePicker`), which Phase 1 already unblocks. **The accent decision
> landed before the handoff closed: the clip grid is AUTHORED with VoiceDesign, not recorded,
> so Phase 2 is unblocked too.**

The approved design is `brief.md` in this folder and it is the source of truth. Do not
re-derive it, and do not re-run the listening tests — they are done and recorded in
`../MPI-607/validation.md` (2026-08-25 entries).

What is already true:

- **Flow A (`voice-changer`) ships and works** — `js/data/flowsRegistry.js` ~line 1186,
  operation `flowVoiceChanger`, graph `comfy_workflows/flow_voice_changer.json`, deps
  `chatterbox-vc-s3gen` + `chatterbox-vc-conds` + `ComfyUI_Fill-ChatterBox`. Its second
  media slot is already labelled **"Target voice"** and today takes an upload. The library
  adds a picker beside that slot; it does not replace the upload path.
- **Emotion needs performance clips.** Text cannot select emotion (measured: wrong emotion
  at exaggeration 1.0, no emotion at 0.5). Locked params: `cfg_weight` 0.3 always,
  exaggeration 0.5 for dictation and 1.2 for a VC source.
- **Pitch is what leaks, identity is not.** Two performers 0.47 apart drove one character to
  outputs 93 Hz apart and still read as one actor. This is why `register` / `median_f0` /
  `f0_p10_p90` are stored as data.
- **The QA gate is two numbers.** Cosine (`../MPI-607/research/speaker_similarity.py`) AND
  median-f0 delta (`librosa.pyin`). Cosine alone is disqualified — CAMPPlus is
  pitch-invariant by construction and scored 0.92 on a clip a listener placed 20 years off.

App-side facts checked 2026-08-25, so no one re-discovers them:

- **Deps are single files with a `sha256`.** There is no archive/extract dep type, so a
  228-file library cannot ship through the download manager without inventing one.
- **`comfy_workflows/display/` is the existing convention** for shipped media a registry
  points at (`flow-head-swap.webp` / `.mp4`), and `copyAppTree` in
  `scripts/build-portable.mjs` copies the app tree wholesale, so in-repo assets ship for
  free on all three platforms.
- ~~**No audio component exists yet**~~ — **WRONG, corrected 2026-08-25.** `MpiAudioRecorder`
  (Compound, MPI-573) already records the mic, encodes WAV and plays a review clip, and
  `MpiLevelMeter` (Primitive) already exists. Both belong to MPI-573/MPI-607 — the picker
  reuses their patterns and must not edit either. The picker itself is still new UI, built to
  `.claude/rules/components.md`.
- Chatterbox weight deps are `targetPath` and **must stay that way** (the pack computes
  `<ComfyUI>/models/chatterbox/` from its own `__file__`). Same class as RIFE, MPI-222.

### Decisions front-loaded (scalable-foundation) — ANSWERED by Fabio 2026-08-25

- **D1 — where the bundle lives. DECIDED: in-repo.** Fabio, 2026-08-25: *"that's a good
  place to place the voices, we can go with your recommendation."* Recommendation was **in-repo**, `voices/` beside
  `comfy_workflows/display/`, one `manifest.json` plus opus clips. ~60 voices x (sample +
  up to 2 auditions) at ~24 KB each is roughly **5 MB**; all 228 would be ~16 MB. The
  alternative is inventing an archive dep type for a few megabytes, which is a new download
  path, a new extract step and a new GC case for no measurable gain. User-supplied voices go
  to `userData`, never into the bundle — that split is durable and unaffected by D1.
- **D2 — how many voices ship. DECIDED: ~60 curated.** Fabio, 2026-08-25: *"60 voices is
  fine. If anything is missing later on, we can work on it"* — so the count is a starting
  point, not a cap, and the import pipeline must stay re-runnable to add more.
  Recommendation was **curating ~60** of the 228 CC0 kyutai voices for
  v1, chosen for register spread and clip quality, rather than shipping all 228 unaudited. A
  picker of 228 unlabelled voices is worse product than 60 good ones, and every voice costs
  audition-generation time in Phase 4.

**Both are answered. Phase 1 is unblocked.**

## Completed

- [x] **Phase 0 - RESOLVED ON OPTION 1** (2026-08-25). Offline formant-preserving shift passes
      both gates: no artefacts ride through VC, and emotion survives (+12, +19 and -12).
      Options 2 and 3 and the escape hatch are all unnecessary. Two hypotheses of mine died on
      the way and both are recorded as wrong in `validation.md` rather than quietly dropped.
- [x] **D1 and D2 answered** by Fabio - in-repo `voices/`, ~60 curated (a starting point, not
      a cap).
- [x] **Phase 1 - the voice record and its loader** (2026-08-25). `js/data/voiceLibrary.js` +
      `tests/voice-library.test.cjs`. 8/8 green, full suite 737/737, eslint clean.
- [x] **PARALLEL BATCH - both tasks landed** (2026-08-25, session 17). Import pipeline
      (`scripts/voice-library/ingest.py` + a 10-voice `voices/` bundle) and `MpiVoicePicker`
      (Compound + dev-gallery mount). Verified independently of the worker reports: lint
      clean, 737/737, 10/10 manifest contract checks, idempotence by SHA. **Each worker had
      one real defect its own report did not name** - a per-click component leak in the
      picker, and a 48 kHz Opus encode escalated as a size decision on a false premise. Both
      fixed at the root; detail in `validation.md`.
- [x] **PHASE 2 - 12/12 clips authored** (2026-08-25, session 17). `research/phase2_perf_clips.py`
      under the GPU lease. Verify half (a) passes: all eight low-arousal cells land inside
      their declared register band. Half (b) - six distinguishable emotions through VC - is
      Fabio's ear and is NOT done.

## Remaining Work

## Phase 0: Where R3–R5 emotional performances come from — BLOCKS all clip authoring

**A live voice changer is NOT the answer, and this is settled — do not re-propose it.**
Fabio, 2026-08-25: *"It's not good for emotion performances... there's no voice changer that
can do a good emotional performance because it just messes up the pitch. That's something
I've always struggled with."* This is consistent with everything measured on MPI-607:
emotion is carried largely by pitch movement, so a transform that mangles pitch destroys the
exact signal a performance clip exists to supply.

**Fabio's constraint, stated by him and load-bearing:** *"The only emotional performance I
can do is with my own voice."* So R1 (90–130 Hz) is authorable in-house and every register
above it needs a source. That source is this phase's whole job. Ranked by cost:

1. **Offline formant-preserving pitch shift of a natural take.** Fundamentally different from
   a live changer: it operates on an already-emotional recording rather than on the voice
   producing it, so the emotional contour is shifted intact instead of being fought in real
   time. Cheapest by far, and it is the only option that keeps authoring in-house.
2. **A permissively-licensed emotional speech corpus.** The existing research on this card
   covers corpora for IDENTITY (VCTK, GLOBE, kyutai) and does **not** cover emotional
   performance sets — that is a genuine research gap. Licences here are the trap: several of
   the well-known emotional datasets are non-commercial or research-only.
3. **Commissioned performers.** Real cost and real licensing; the fallback if 1 and 2 fail.

- [ ] Test option 1 first. Take one of Fabio's natural angry takes, pitch-shift it offline
      (+7 and +12 semitones, formant-preserving) into R3/R4, and use each as the performance
      clip driving TTS -> VC into a matched-register character.
      **Verify:** Fabio's ear on two questions, since they fail differently — (a) does the
      shifted clip still read as genuinely angry, and (b) does the shift leave chipmunk or
      formant artefacts that ride through the VC stage? Either failure sends this to option
      2. **Phase verify mode: `user-ux`.**
- [ ] Only if option 1 fails: research permissively-licensed emotional speech corpora, with
      the licence verdict per source stated up front. File it beside the existing
      `../MPI-607/research/voice-library-*.md` set.
      **Verify:** at least one corpus with a commercial-use licence covering redistribution
      of derived clips, or an explicit finding that none exists — which promotes option 3.

**The escape hatch, so this phase cannot deadlock the card: ship R1 only for v1.** Character
voices are limited to the low-male register Fabio can perform natively, and every other voice
ships as `narration` kind — which needs no performance clips at all, is already proven
excellent ("for my tutorials it will be excellent"), and is the larger use case anyway. R3–R5
character voices then become their own card. Take this route rather than blocking the library
on a performer-sourcing problem.

## Phase 1: The voice record and its loader

No forward dependency on any clip existing — this phase ships the schema and the reader,
validated against a hand-written fixture of three voices.

- [ ] Define the manifest schema and write `js/data/voiceLibrary.js`: load `voices/manifest.json`,
      expose `listVoices()` / `getVoice(id)` / `listPerformanceClips(register)`, filter by
      `kind`, and resolve clip paths. Fields per `brief.md` § 3. Document props in
      `js/components/types.js` if any component-facing type is introduced.
      **Verify:** `node --test` unit test over a 3-voice fixture manifest — every field
      round-trips, an unknown `register` is rejected rather than silently accepted, and
      `kind: 'both'` appears in both `narration` and `character` filters.

## Parallel Batch: Import pipeline and picker UI

Both depend only on the Phase 1 schema and touch disjoint trees. Run through
`mpi-execute-parallel`.

- [ ] **Import + measurement pipeline.** A node/python script that ingests the kyutai CC0
      voices, measures `median_f0` and `f0_p10_p90` per clip with `librosa.pyin`, assigns
      `register` from the R1–R5 table, transcodes to opus, and emits `manifest.json`. Must be
      re-runnable and idempotent. Ownership: `scripts/voice-library/**`, `voices/**`.
      Briefings: `dos_and_donts`. **Verify:** run it over 10 sample voices — the manifest
      validates against the Phase 1 loader, and the measured `median_f0` for the known clips
      matches the figures already recorded in `../MPI-607/validation.md` (`e0_neutral`
      225.2 Hz, `A3_REF` 125.7 Hz) within 2 Hz.
- [ ] **Voice picker component.** `MpiVoicePicker` via `ComponentFactory.create()` — voice
      list with filters (kind, register, gender, age, accent), audition playback, and the
      register-mismatch **warning** (never a block) when a user's own sample sits far in pitch
      from the available performance clips. Registers its CSS in `js/shell/preloadStyles.js`,
      documents props in `js/components/types.js`, BEM throughout, `on()`/`off()` only, and a
      `destroy()` that clears every listener and any audio element. Ownership:
      `js/components/Compounds/MpiVoicePicker/MpiVoicePicker.js`,
      `js/components/Compounds/MpiVoicePicker/MpiVoicePicker.css`,
      `js/shell/preloadStyles.js`, `js/components/types.js`. Briefings: `components`,
      `dos_and_donts`, `events`. **Verify:** mounts in the dev component gallery against the
      Phase 1 fixture, filters narrow the list, audition plays, the mismatch warning appears
      for a deliberately far pitch and the voice stays selectable. **Phase verify mode:
      `user-ux`.**

## Phase 2: Author the performance clips

Gated on Phase 0. R1 + R3 x six emotions = 12 clips, which proves the grid against one male
and one female character before R2/R4/R5 cost anything.

**SOURCE DECIDED 2026-08-25: authored offline with Qwen3-TTS VoiceDesign, NOT recorded by
Fabio.** The VoiceDesign clips out-perform his own takes on Angry, and he is not a native
English speaker — and since VC overwrites the target's accent with the source's, recording the
grid himself would stamp a non-native accent onto every `character` voice in the library.
VoiceDesign's uncontrollable American prior, a CLOSED-NEGATIVE finding on MPI-607, is what
supplies the consistent neutral house accent this needs. The Phase 0 shifter stays as a REPAIR
step for a take that lands off-register.

- [ ] Author 12 performance clips (`Flat · Neutral · Angry · Sad · Cheerful · Whisper` at
      R1 90–130 Hz and R3 190–260 Hz) with VoiceDesign. Measure each and store
      it in the manifest.
      **Verify:** each clip's measured `median_f0` sits inside its declared register band,
      and driving one R1 character through all six produces six distinguishable emotions —
      Fabio's ear, since the 2026-08-25 result proved a labelled emotion is not necessarily
      the delivered one. **Phase verify mode: `user-ux`.**

## Phase 3: Auditions generated through the shipping route

- [ ] Generate `audition_narration.opus` (direct TTS, exag 0.5 / cfg 0.3) and
      `audition_character.opus` (TTS(neutral perf clip, exag 1.2 / cfg 0.3) -> VC) for every
      shipped voice, batched on the bench under the GPU lease. A `kind: 'both'` voice gets
      both. **Verify:** every manifest entry's audition files exist and are non-empty; spot
      check by ear that a `character` audition does NOT sound like its raw sample (it must
      not — that mismatch is the whole reason auditions are generated) while a `narration`
      audition does. **Phase verify mode: `user-ux`.**

## Phase 4: Wire the library into the flows

- [ ] Add the picker to `voice-changer`'s "Target voice" slot beside the existing upload, and
      expose the emotion set for `character` voices only. `narration` voices show no emotion
      control. Follow `docs/playbooks/add-flow/` for any descriptor change; do NOT add
      `ComfyUI-MpiNodes` to `requiredDeps`.
      **Verify:** a full run in an isolated app instance (`npm run app:isolated`) — pick a
      library voice, run the flow, and a real gallery card lands. Then `npm test` green and
      the desktop suite green. **Phase verify mode: `user-ux`.**

## Plan Drift

- **2026-08-25 (session 17) -- the batch's picker ownership named paths this repo does not
  use.** The plan said `js/components/voicePicker.js` + `styles/components/voice-picker.css`.
  Components live at `js/components/<Tier>/<Name>/<Name>.{js,css}` (four tiers: Primitives,
  Compounds, Organisms, Blocks) and `styles/` holds only `01_base.css`, `markdown.css` and
  `shell/`. Corrected to `js/components/Compounds/MpiVoicePicker/MpiVoicePicker.{js,css}`.
  Compound is the right tier: the picker composes MpiDropdown / MpiInput / MpiButton rather
  than being a leaf control.
- **2026-08-25 (session 17) -- "no audio component exists yet" was already false when
  written.** `MpiAudioRecorder` (MPI-573) and `MpiLevelMeter` are both shipped. Corrected in
  `## Current State`.
- **2026-08-25 (session 17) -- the source clips are real audio, checked before dispatch.**
  `kyutai/tts-voices/voice-donations/` holds 10 s 24 kHz `.wav` files (`0a67.wav`, plus
  `_enhanced.wav` denoised twins) beside kyutai-specific `.safetensors` embeddings that are
  irrelevant to Chatterbox. Public repo, no HF token. **There is no ffmpeg on this machine**,
  but `G:/ComfyUi/python_embeded/python.exe` carries `soundfile` 0.14.0 / libsndfile 1.2.2
  with `OGG/OPUS` write and `librosa` 1.0.0, so the opus transcode needs no ffmpeg.
- **2026-08-25 -- the semitone figures in Phase 0 were wrong.** Phase 0 said "+7 and +12
  semitones ... into R3/R4". From Fabio's natural take (`recording_003.wav`, median 101.5 Hz)
  the arithmetic does not reach: +7 lands on **150.3 Hz (R2)** and +12 on **201.8 Hz (R3)**.
  R4 needs **+19** (305.9 Hz). Measured, not estimated -- `research/pitch_tools.py measure`.
  The test now runs +7 / +12 / +19 and pairs each with a character clip in the register it
  actually lands in, since performer pitch leaks hard and a mismatched pair would measure
  the mismatch instead of the shift.
- **2026-08-25 -- there is no angry take of Fabio's on disk, so Phase 0 splits in two.**
  The plan assumed "one of Fabio's natural angry takes" exists. The only natural recordings
  are `recording_003/004/005.wav` (101.5 / 182.9 / 127.9 Hz) and none is recorded as
  emotional; the two expressive ones (`high_pitch_exp_fabio` 230.5 Hz, `high_pittch_fabio`
  316.7 Hz) are PUSHED takes, which score 0.38-0.42 against his own natural voice and are
  ruled out by guidance rule 1. Question (b) -- do artefacts ride through VC -- needs no
  emotion and runs now against a +0 control. Question (a) -- does anger survive the shift --
  waits on one angry line recorded at his natural pitch.
- **2026-08-25 -- the shifter is Praat, not librosa.** `librosa.effects.pitch_shift` and
  `torchaudio.functional.pitch_shift` are resample-based: they drag the formants along and
  manufacture the exact chipmunk artefact this phase exists to rule out, so either one would
  have failed the test by construction rather than on the merits. `praat-parselmouth` was
  installed on the bench (`G:/ComfyUi/python_embeded`, 0.4.7) and its "Change gender" with
  `formant_shift_ratio 1.0` moves the pitch median while leaving the formants alone.

## Verification

**Verify mode:** `user-ux`

Almost every phase ends in a judgement only Fabio's ear can make, which is the standing
lesson of this whole line of work: the CAMPPlus cosine agreed with the pipeline at every
step while disagreeing with the listener. Phase 1 alone is `auto` (a unit test over a
fixture). Per-phase modes are marked inline above.

End to end: from a clean profile, a user picks a library character voice, records or uploads
a performance, chooses an emotion, runs the flow, and gets a gallery card whose voice is
consistent with the audition they auditioned — and picking a different emotion for the same
character still sounds like the same actor.

## Preservation Notes

- The 2026-08-25 findings in `../MPI-607/validation.md` are the evidence base for every
  decision here. At close-out, fold the durable ones into a subsystem doc — a
  `docs/voice-library.md` routed from `docs/README.md` — because they are codebase facts
  now, not session notes. **Do not create a gotchas dump file.**
- [x] **DONE 2026-08-25** - `docs/playbooks/add-flow/existing-flows/voice-changer.md` rule 3
  rewritten with the mechanism and the measured numbers, plus a new "what comes from you, and
  what comes from the target" table carrying the MPI-622 accent result. Open since 2026-08-24.
- The flow's own `description` in `flowsRegistry.js` promises Chatterbox "swaps the voice
  itself". Measured behaviour is a blend. That copy needs honest wording before this ships.
- Register the new component's CSS in `js/shell/preloadStyles.js` and its props in
  `js/components/types.js` — both are easy to forget and both are enforced.
