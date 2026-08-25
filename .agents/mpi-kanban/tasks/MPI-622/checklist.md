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

- [x] **Rhotic defect RESOLVED - THERE IS NO DEFECT.** Fabio on the no-VC control: "number
      one does have an R in train". The R is present in all of them, just heavily
      coarticulated by the accent - "when you repeat the train word several times, you can
      identify an R in there". Character voice is fine, Flow A is fine. My "VC corrupts
      phonemes" call was WRONG and is retracted in validation.md
- [x] What IS real: **VC attenuates consonant articulation** slightly (no-VC has a clearer R
      than through-VC). One line of guidance, not a card
- [x] **Missing post-vocalic R's are NOT a defect** - that is non-rhoticity, correct for the
      prompted accent. Only the stop-cluster "twain" is in question
- [ ] 🔴 **Library requirement: sample/audition text must be PHONETICALLY COMPREHENSIVE.**
      The library set shares one text that never says a stop+/r/ onset, so a voice cannot
      demonstrate its own articulation. A pangram-style line, not a pretty one
- [x] 🟢 **ANSWERS AN OPEN MPI-607 GATE**: accent SURVIVES VC, comes from the SOURCE, and
      **OVERWRITES the target's**. Proven against a target whose own accent was measured
      directly: the character is neutral modern American on the no-VC route and 1930s New York
      through VC, as is a completely different character from the same source. Flow B gate
      opens. MPI-607 checklist item ticked
- [x] ✅ **ACCENT DECIDED 2026-08-25 - PHASE 2 IS UNBLOCKED.** The clip grid is AUTHORED with
      Qwen3-TTS VoiceDesign offline, NOT recorded by Fabio. His reasons, both sufficient alone:
      the VoiceDesign clips out-perform his own takes ("especially for Angry"), and he is not a
      native English speaker, so recording the grid would stamp a non-native accent onto every
      `character` voice in the library. No recording sessions, no performer sourcing, no
      licensing exposure - and it is the same offline authoring route the character clips
      already came from, so it does not touch "Qwen3-TTS is never shipped"
- [x] 🟢 **The American prior INVERTS from a defeat into the enabler.** MPI-607 closed
      accent-via-VoiceDesign as NEGATIVE - "American prior, not controllable" - which lost the
      argument when the goal was CHOOSING an accent. The goal here is the opposite: one
      consistent house accent across the whole grid, which an uncontrollable prior delivers
      free. Measured on the direct route: neutral modern American. Still NEGATIVE for accent
      selection, an asset for accent consistency
- [x] **The shifter demotes to a REPAIR step, not obsolete** - validated to ±19 st with no
      artefacts and emotion intact, so a VoiceDesign take that lands off-register gets moved
      rather than re-rolled. It is no longer the SOURCE of any register
- [ ] Emotion labels still need judging BY EAR per clip - VoiceDesign's delivered emotion is
      approximate (MPI-607: "B is not really sad, it's a sad-angry kind of thing"; this
      session: a labelled-angry clip read as "upset"). Phase 2 verify mode is already
      `user-ux` for exactly this. Do not trust the prompt's label
- [x] Identity does NOT leak but ACCENT does - different channels. Timbre comes from the
      target, articulation and prosody from the source. Not in tension with MPI-607's
      "character consistency holds across performers"
- [ ] 🔴 **`accent` cannot be taken from the generation prompt or corpus metadata.** Asked
      for "refined British", got Al Capone - VoiceDesign's American prior again (MPI-607
      CLOSED NEGATIVE). Needs a human labelling pass, or ship the field EMPTY. A wrong accent
      label is worse than a missing one
- [ ] `accent` is MEANINGLESS for `kind: character` - it describes the direct route only.
      Hide it in the picker for character voices, or label it as what it is. Measured, no
      longer an inference
- [x] ~~Emotion set proposals (`Sarcastic`/`Dry`, `Menacing`/`Manic`)~~ **WITHDRAWN** - Fabio:
      they collapse into the low-affect cells the set already has, and there are too many
      emotions to cover. The six stand. Emotion MIXING (manic = happy+angry) is a real gap the
      model cannot serve - but a performance CLIP carries a mixed emotion natively, which no
      slider set can, so adding `Manic` later is one clip per register and needs nothing new
- [ ] **`brief.md` § 2 refinement** - emotion labels are DELIVERIES the user selects, not the
      performer's state (Fabio's sarcasm point), so `register` should name the PERFORMER'S
      BASELINE rather than the clip's measured f0. The (b) half of this proposal is withdrawn
      above. Needs Fabio's call
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

- [x] **DONE 2026-08-25.** `js/data/voiceLibrary.js` - `createVoiceLibrary(manifest)` (pure,
      so a test needs no fetch stub) + `loadVoiceLibrary(url)`. Exports `REGISTERS`,
      `EMOTIONS`, `VOICE_KINDS`; instance gives `listVoices(filter)` / `getVoice(id)` /
      `listPerformanceClips(register, emotion)` / `pitchDistance(a, b)`. No imports at all,
      so it crosses no absolute-browser-path boundary and loads headlessly
- [x] `register` documented as the PERFORMER'S BASELINE, and a clip's own f0 is deliberately
      NOT validated against the band - an (R1, Angry) clip sits above R1 and that is correct
- [x] `accent` is nullable on purpose, with the reason in the module header. A test asserts
      null is not coerced away
- [x] **Verified: `node --test` 8/8 green, full suite 737/737, eslint clean.**
      `tests/voice-library.test.cjs`

## Parallel batch

- [ ] Import + measurement pipeline (`scripts/voice-library/**`, `voices/**`)
- [ ] `MpiVoicePicker` component

## Phase 2-4

- [ ] Author 12 performance clips (R1 + R3 x six emotions)
- [ ] Generate auditions through the shipping route for every voice
- [ ] Wire the picker into the voice-changer flow's "Target voice" slot
