# MPI-622 Checklist

## Phase 0 - where R3-R5 emotional performances come from (BLOCKS all clip authoring)

- [x] Formant-preserving shifter built and validated - `research/pitch_tools.py`, Praat
      "Change gender" (formant_shift_ratio 1.0) via praat-parselmouth. Measured against the
      figures already on MPI-607: `A3_REF` 125.7 Hz exact, `e0_neutral` 223.9 vs 225.2
      (inside the 2 Hz gate)
- [x] Shifts land on their target register, duration untouched (13.26s in all three):
      +7 -> 150.3 Hz R2, +12 -> 201.8 Hz R3, +19 -> 305.9 Hz R4
- [ ] Question (b) ARTEFACTS - does the shift leave chipmunk/formant damage that rides
      through the VC stage? `research/phase0_shift_pipeline.py`, +0 control vs +7 vs +12,
      registers matched. Fabio's ear
- [ ] Question (a) EMOTION - does a shifted clip still read as genuinely angry? BLOCKED:
      no angry take of Fabio's exists on disk. `recording_003/004/005` are the only natural
      ones and none is labelled emotional
- [ ] Only if (a) or (b) fails: research permissively-licensed emotional speech corpora
      (a real gap - the existing research covers IDENTITY corpora only)
- [ ] Escape hatch if both fail: ship R1 only for v1, every other voice as `narration`

## Decisions blocking Phase 1

- [ ] D1 - bundle in-repo `voices/` (~5MB curated / ~16MB all 228) vs invent an archive dep type
- [ ] D2 - curate ~60 of the 228 CC0 kyutai voices vs ship all 228

## Phase 1 - the voice record and its loader

- [ ] `js/data/voiceLibrary.js` + manifest schema, unit-tested over a 3-voice fixture

## Parallel batch

- [ ] Import + measurement pipeline (`scripts/voice-library/**`, `voices/**`)
- [ ] `MpiVoicePicker` component

## Phase 2-4

- [ ] Author 12 performance clips (R1 + R3 x six emotions)
- [ ] Generate auditions through the shipping route for every voice
- [ ] Wire the picker into the voice-changer flow's "Target voice" slot
