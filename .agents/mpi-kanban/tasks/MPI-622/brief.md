# MPI-622 — Voice library

The character + performance voice library the TTS and Voice-Changer flows select from.
Carved out of MPI-607 on 2026-08-25, after a listening session that overturned two
assumptions the earlier design rested on. Read `../MPI-607/validation.md` from
`2026-08-25` onward before touching this — every decision below is downstream of it.

## What the measurements forced

1. **Chatterbox VC moves a voice roughly HALFWAY and stops.** Proven bias-free: a
   stranger's clip converted into the gravel character was described cold as "35, deep but
   not too deep" — sitting between the 25-year-old source and the 50+ target. Iterating the
   VC stage does not help (three passes were perceptually identical on the unbiased pair,
   and on Fabio's own voice pass 3 only hallucinated rumble).
2. **The CAMPPlus cosine is not a perceptual gate.** It scored that same clip **0.92** —
   "same speaker, confidently". CAMPPlus x-vectors are pitch- and prosody-invariant by
   construction, which is exactly the cue a listener judges on. Two *different* library
   voices of different genders score 0.75 to each other, so the band is compressed too.
3. **Emotion cannot come from the text.** A neutral reference speaking angry words at
   `cfg_weight 0.3` was either soulless (exaggeration 0.5) or carried the WRONG emotion
   (1.0 — angry text read as disappointed, sad text read as the angrier of the two). The
   "60 voices, emotion free at runtime" collapse is dead; emotion needs performance clips.
4. **Character consistency across performers HOLDS.** Two performance clips 0.47 apart drove
   the same character to outputs 93 Hz apart, and Fabio still heard one actor: the pitch
   spread reads as emotion, not as a second person. The shared-performance-clip collapse
   survives.
5. **Performer PITCH leaks hard; performer IDENTITY barely leaks.** That asymmetry is what
   makes the whole design work, and it is why pitch is stored as data rather than as a tag.

## The design (approved by Fabio, 2026-08-25)

### 1 — Two voice kinds, and a voice may be both

| kind | route | emotion | character match |
|---|---|---|---|
| `narration` | direct TTS, exaggeration 0.5 / cfg 0.3 | none, deliberately | exact |
| `character` | TTS(performance clip, exag 1.2 / cfg 0.3) -> VC(character clip) | full set | a consistent OTHER voice |

**Register is a property of the VOICE, never of the line.** A per-line neutral-bypasses-VC
dropdown was considered and rejected: it would switch actor mid-scene, since the direct
route lands on the character and the VC route does not. `kind: both` ships two auditions.

### 2 — Emotion is the performance-clip grid

Registers x emotions, shared across every character voice:

| register | range |
|---|---|
| R1 low male | 90-130 Hz |
| R2 high male / low female | 130-190 Hz |
| R3 high female | 190-260 Hz |
| R4 child | 260-340 Hz |
| R5 cartoon / critter | 340 Hz+ |

Emotions: `Flat · Neutral · Angry · Sad · Cheerful · Whisper`.

**Author R1 + R3 x 6 = 12 clips first** — that proves the pipeline against one male and one
female character. R2 interpolates; R4/R5 land when a cartoon voice needs them. A new emotion
later costs one clip per register, not 60 character variants.

**Flat is a clip, never a bypass.** `Flat` is the soulless read (robot, or a character
losing their demeanour mid-film); routing it through VC keeps the actor identical across the
transformation, which is the one beat where a bypass would be most damaging. True robot
voices are post-FX (vocoder / ring-mod / formant shift) on any voice — a later card, not a
job for the TTS model.

### 3 — The voice record

```
id · display_name · gender · age · accent · language · style · tags
kind: narration | character | both
register: R1..R5 · median_f0 · f0_p10_p90
sample.opus                                    # raw clip; also the VC target_voice
audition_narration.opus / audition_character.opus   # generated THROUGH the shipping route
licence · source_url · added_at
```

Base field set distilled from ElevenLabs + PlayHT in
`../MPI-607/research/voice-library-04-prior-art-and-synthetic.md` § 4. The `kind`,
`register`, `median_f0` and `f0_p10_p90` fields are additions forced by the measurements
above.

**Auditions must be generated through the shipping route**, not be the raw sample — a
character voice never sounds exactly like its own sample, so playing the sample at selection
time would promise a voice the product cannot deliver.

### 4 — Selection UI

The selector **warns** when the user's own uploaded sample sits far in pitch from the
available performance clips, and **never blocks**. Pitch distance is the one number that
predicts whether a pairing lands or sounds like a costume, and no user will guess it.

### 5 — QA gate: two numbers, never one

Cosine (`../MPI-607/research/speaker_similarity.py`) for timbre **AND** median-f0 delta
(`librosa.pyin`) for pitch. Cosine alone is disqualified — see finding 2.

## Sourcing (settled 2026-08-26 — do not re-research)

- **Shipping:** 60 voices authored in-house with Qwen3-TTS VoiceDesign — 12 categories x 5,
  every one approved by Fabio's ear. This was the "long game" below, promoted after the
  corpus route failed. VoiceDesign stays an OFFLINE authoring tool and never becomes an app
  dependency; that constraint held.
- **REJECTED IN FULL:** the 228 CC0 voices in `kyutai/tts-voices`. Fabio auditioned all 60
  curated: *"I think 99% of this voice library is garbage... none of it is usable."* Accents
  unintelligible, mic quality poor, R4/R5 one voice each. Removed from the bundle in
  `12174bc1`. **The curation could not have caught it** — `voiced_frac`/`snr_proxy` measure
  SIGNAL, not SPEECH, and the deciding attribute (accent) is the one field the design forbids
  inferring. Any future corpus inherits that same blind spot: a human must listen before it
  ships.
- **VCTK + GLOBE / HiFiTTS-2** were the quality/breadth upgrade path. Untested, and the
  breadth they were wanted for is now met in-house. Treat as a fallback, not a plan — and
  audition by ear first.
- **Licence:** `voices/LICENCE.md` (Cubric-Vision-Voice-Licence-1.0). The clips are
  proprietary and may not be extracted or redistributed as a voice pack; audio a user
  generates with them is theirs, commercial use included, no royalty, no territory limit.
  Upstream claims nothing — Qwen3-TTS VoiceDesign is Apache-2.0 over weights and code only.
  Four `elderly_male` clips derive from Fabio's own recording.

Detail: `../MPI-607/research/voice-library-02-permissive-corpora.md`, `-03-legal-landscape.md`,
`-04-prior-art-and-synthetic.md`.

## The clip-grid gate — ANSWERED, grid shipped

The question was **"does voice-changer processing survive VC?"** — identity does not leak,
but artefacts might, and F3's rumble had survived VC. It was a gate because 12–30 clips
should not be committed to on a guess.

**Answered yes, and the grid shipped:** 12 performance cells, R1 + R3 x 6 emotions, all
accepted in Phase 2 and still in `voices/performance/`. The later VC measurement says why
it works — **jitter ROSE through the transfer (3.30% -> 4.00–4.75%) while output pitch
tracked the TARGET, not the source.** Tremor and artefacts ride through; pitch does not.
That split is the useful half to remember: VC is the tool for carrying a *performance*, and
never the tool for moving a voice's *pitch*.

**Still open, additive, gates nothing:** there are no performance grids for R2, R4 or R5, so
child / cartoon / villain characters have no emotions yet. Voices in those registers ship
and work; they just fall back to no performance clip.

## Out of scope here

Flow A's UI (record button, voice selector, custom-voice item) and Flow B (Text to Speech)
stay on MPI-607.
