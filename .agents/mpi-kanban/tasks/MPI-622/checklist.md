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
- [x] Question (a) EMOTION **PASSED** 2026-08-25. Fabio on D-H: "they all have a hint of
      anger" - across +12, +19 and -12 shifts. Intensity is capped by the source performance,
      not by the transform. `research/phase0c_angry.py`
- [x] **PHASE 0 RESOLVES ON OPTION 1.** Options 2 (licensed emotional corpora) and 3
      (commissioned performers) not needed; escape hatch not needed
- [x] ~~Only if (a) or (b) fails: emotional speech corpora research~~ - NOT NEEDED
- [x] ~~Escape hatch: ship R1 only for v1~~ - NOT NEEDED

## Open, raised by the Phase 0c listen

- [ ] **Rhotic defect: "twain" for "train"** in F. Isolation staged at
      `Desktop/MPI622_the_R_thing/` - character clip vs TTS stage vs VC stage. Also: is it
      in all five of D-H, or only F?
- [ ] **`brief.md` § 2 assumes register and emotion are independent. They are not** - anger
      moved Fabio +5 to +17 semitones off his natural pitch. Proposal: register means where
      the CHARACTER sits and the clip is shifted to meet it, which makes the shifter
      load-bearing rather than a fallback. Needs Fabio's call
- [ ] **Emotion set proposal**: `Menacing` / `Manic` over `Angry` for a character library -
      he can deliver those ("I am not an angry person"). Needs Fabio's call
- [ ] One angry take with the **noise filter OFF** - the only missing piece for a clean
      performed-vs-shifted verdict

## Surfaced here, belongs elsewhere

- [ ] **Flow A output loudness is not normalised** - 3.9 dB spread across three target
      voices and one output sitting on 0.0 dBFS peak. Flow A SHIPS TODAY. Not carded yet
- [ ] **UNEXPLAINED**: one TTS run took 18.56s for a 6s line (`high_pitch_exp_fabio`,
      32.6% voiced). The voiced-density theory is DEAD - `recording_008` at 32.3% ran clean
      at 6.16s. Cause unknown; do not write an authoring rule on it

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
