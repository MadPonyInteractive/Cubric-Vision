# Voice library — the character + performance clip library the TTS/VC flows select from

## Current State

**Project mode:** `scalable-foundation`.

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
- **No audio component exists yet** — `js/components/` has nothing for playback, recording,
  or waveforms. The picker is new UI, built to `.claude/rules/components.md`.
- Chatterbox weight deps are `targetPath` and **must stay that way** (the pack computes
  `<ComfyUI>/models/chatterbox/` from its own `__file__`). Same class as RIFE, MPI-222.

### Decisions front-loaded (scalable-foundation) — resolve BEFORE Phase 1

- **D1 — where the bundle lives.** Recommend **in-repo**, `voices/` beside
  `comfy_workflows/display/`, one `manifest.json` plus opus clips. ~60 voices x (sample +
  up to 2 auditions) at ~24 KB each is roughly **5 MB**; all 228 would be ~16 MB. The
  alternative is inventing an archive dep type for a few megabytes, which is a new download
  path, a new extract step and a new GC case for no measurable gain. User-supplied voices go
  to `userData`, never into the bundle — that split is durable and unaffected by D1.
- **D2 — how many voices ship.** Recommend **curating ~60** of the 228 CC0 kyutai voices for
  v1, chosen for register spread and clip quality, rather than shipping all 228 unaudited. A
  picker of 228 unlabelled voices is worse product than 60 good ones, and every voice costs
  audition-generation time in Phase 4.

Both are recorded as recommendations, not as done deals. Phase 1 does not start until they
are answered.

## Completed

- [ ] Nothing yet.

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
      `js/components/voicePicker.js`, `styles/components/voice-picker.css`,
      `js/shell/preloadStyles.js`, `js/components/types.js`. Briefings: `components`,
      `dos_and_donts`, `events`. **Verify:** mounts in the dev component gallery against the
      Phase 1 fixture, filters narrow the list, audition plays, the mismatch warning appears
      for a deliberately far pitch and the voice stays selectable. **Phase verify mode:
      `user-ux`.**

## Phase 2: Author the performance clips

Gated on Phase 0. R1 + R3 x six emotions = 12 clips, which proves the grid against one male
and one female character before R2/R4/R5 cost anything.

- [ ] Author 12 performance clips (`Flat · Neutral · Angry · Sad · Cheerful · Whisper` at
      R1 90–130 Hz and R3 190–260 Hz), source per Phase 0's verdict. Measure each and store
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

- None yet.

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
- `docs/playbooks/add-flow/existing-flows/voice-changer.md` guidance rule 3 still says
  "meet the target's pitch". Rewrite it: VC moves everything part of the way, so a large
  pitch gap yields the target's timbre at a pitch that voice never uses. Flagged since
  2026-08-24 and still not done.
- The flow's own `description` in `flowsRegistry.js` promises Chatterbox "swaps the voice
  itself". Measured behaviour is a blend. That copy needs honest wording before this ships.
- Register the new component's CSS in `js/shell/preloadStyles.js` and its props in
  `js/components/types.js` — both are easy to forget and both are enforced.
