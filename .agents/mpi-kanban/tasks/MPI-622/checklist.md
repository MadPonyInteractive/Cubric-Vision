# MPI-622 Checklist

## Phase 0 - where R3-R5 emotional performances come from (BLOCKS all clip authoring)

- [x] Formant-preserving shifter built and validated - `research/pitch_tools.py`, Praat
      "Change gender" (formant_shift_ratio 1.0) via praat-parselmouth. Measured against the
      figures already on MPI-607: `A3_REF` 125.7 Hz exact, `e0_neutral` 223.9 vs 225.2
      (inside the 2 Hz gate)
- [x] Shifts land on their target register, duration untouched (13.26s in all three):
      +7 -> 150.3 Hz R2, +12 -> 201.8 Hz R3, +19 -> 305.9 Hz R4
- [x] Question (b) ARTEFACTS **PASSED** 2026-08-25. No chipmunk or formant damage rides
      through VC at +7 or +12. Fabio cold, on the blind A/B/C: "the three samples do not
      have any issues like the one you mentioned". `research/phase0_shift_pipeline.py`
- [~] Question (a) EMOTION - UNBLOCKED. Fabio supplied recording_008/009/010 (136.3 / 166.8 / 274.1 Hz).
      `recording_010` is angry natively in R4, which BREAKS the phase premise - see validation.
      `research/phase0c_angry.py` running
- [ ] Only if (a) or (b) fails: research permissively-licensed emotional speech corpora
      (a real gap - the existing research covers IDENTITY corpora only)
- [ ] Escape hatch if both fail: ship R1 only for v1, every other voice as `narration`

## Surfaced here, belongs elsewhere

- [ ] **Flow A output loudness is not normalised** - 3.9 dB spread across three target
      voices and one output sitting on 0.0 dBFS peak. Flow A SHIPS TODAY. Not carded yet
- [ ] Candidate authoring rule: voiced DENSITY, not performed-vs-shifted. A 32.6%-voiced
      reference made the TTS stage run 18.56s for a 6s line. n=1, more evidence coming

## Decisions (ANSWERED 2026-08-25 - Phase 1 unblocked)

- [x] D1 DECIDED: in-repo. Was: bundle in-repo `voices/` (~5MB curated / ~16MB all 228) vs invent an archive dep type
- [x] D2 DECIDED: ~60 curated, not a cap. Was: curate ~60 of the 228 CC0 kyutai voices vs ship all 228

## Phase 1 - the voice record and its loader

- [ ] `js/data/voiceLibrary.js` + manifest schema, unit-tested over a 3-voice fixture

## Parallel batch

- [ ] Import + measurement pipeline (`scripts/voice-library/**`, `voices/**`)
- [ ] `MpiVoicePicker` component

## Phase 2-4

- [ ] Author 12 performance clips (R1 + R3 x six emotions)
- [ ] Generate auditions through the shipping route for every voice
- [ ] Wire the picker into the voice-changer flow's "Target voice" slot
