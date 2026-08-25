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

## Sourcing (already researched — do not re-research)

- **Ship now:** the 228 CC0 voices in `kyutai/tts-voices` — real consent, public domain.
- **Quality/breadth upgrade:** VCTK + GLOBE, optionally HiFiTTS-2 for premium narration.
- **Long game:** synthetic voices authored OFFLINE with Qwen3-TTS VoiceDesign (Apache-2.0).
  This does **not** contradict "Qwen3-TTS is never shipped" — it is an authoring tool that
  never becomes an app dependency. The `vd_*` / `A3_REF` clips used throughout MPI-607 came
  from exactly that route.

Detail: `../MPI-607/research/voice-library-02-permissive-corpora.md`, `-03-legal-landscape.md`,
`-04-prior-art-and-synthetic.md`.

## Gate before authoring the clip grid

**Does voice-changer processing survive VC?** Identity does not leak, but artefacts might —
F3's rumble survived VC this morning. Fabio has a voice changer and offered to supply
performances, which is what makes R3-R5 authorable in-house. Record one angry line at his
natural pitch and one pitched up to child register, run both through VC into the same
character, and judge by ear whether the processing rides through. Answer this before
committing to 12-30 clips.

## Out of scope here

Flow A's UI (record button, voice selector, custom-voice item) and Flow B (Text to Speech)
stay on MPI-607.
