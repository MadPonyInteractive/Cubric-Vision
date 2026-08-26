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

## Parallel batch — BOTH LANDED 2026-08-25, verified independently

- [x] **Import + measurement pipeline** — `scripts/voice-library/ingest.py`. Fetches
      `voice-donations/` ONLY (the CC0 subdir; `expresso/` and `ears/` are CC BY-NC and the
      path is hard-coded, not configurable), measures with `librosa.pyin`, assigns register,
      transcodes to Ogg Opus, emits `voices/manifest.json`. Re-runnable and idempotent —
      identical SHA across a second run
- [x] Calibrated against an INDEPENDENT tool's figures, not its own: `e0_neutral` 223.9 vs
      225.2 (1.3 Hz), `A3_REF` 125.7 vs 125.7 (0.0 Hz). Both inside the 2 Hz gate
- [x] 10/10 manifest contract checks against the shipped Phase 1 loader, incl. `accent` null
      on every voice and every `median_f0` inside its own band
- [x] 🔴 **Opus was 48 kHz and is now 24 kHz** — 772 KB -> 464 KB for ten voices. Opus takes
      only 8/12/16/24/48 kHz and the `_enhanced` sources are 32 kHz, so a resample is
      unavoidable, but 48 was the wrong target: 24 kHz is the plain clips' own rate and the
      TTS/VC stack's rate. **At the decided ~60 voices the bundle is 2.5 MB — inside D1's
      5 MB estimate, so there is NO size decision to make.** The escalation rested on
      "soundfile exposes no bitrate knob", which is false (`compression_level` and
      `bitrate_mode` both exist; left alone deliberately — 1.0 collapses to 6.5 kbps)
- [x] **`MpiVoicePicker` component** — Compound at
      `js/components/Compounds/MpiVoicePicker/`, composing MpiDropdown / MpiButton /
      MpiRadioGroup. Filters, audition playback (never the raw sample), and the
      pitch-distance warning that never blocks. Registered in `preloadStyles.js`, props in
      `types.js`, mounted twice in the dev gallery
- [x] 🔴 **Leak fixed at the root**: `_renderDetail()` was wiping its previously-mounted
      MpiRadioGroup and MpiButton with `innerHTML =` without calling their `destroy()`, so
      every voice click retained a dead instance and its detached DOM. The panel now owns a
      separate `_detailUnsubs`, flushed before the early returns and again in `destroy()`
- [x] Verified by me, not on report: `lint:components` exit 0, full suite **737/737**
- [x] **CURATION PASS DONE 2026-08-26.** All 227 usable voices measured first, gates set from
      the observed tails (`voiced_frac >= 0.35`, `snr_proxy >= 6.0 dB`), 60 selected for
      register spread. `voices/curated.txt` carries every selection AND every rejection with
      its reason
- [x] **FULL IMPORT RUN** — 60 voices shipped (R1 26 / R2 15 / R3 17 / R4 1 / R5 1), 3.05 MB,
      byte-identical on a second run. The 8 opus orphaned by curation were pruned
- [x] 🔴 **THE CORPUS CANNOT SPAN R1-R5.** Measured: R1 131 · R2 62 · R3 17 · **R4 1** ·
      **R5 1** · below-90 Hz 15. R4 is `Aon` (263.2 Hz) and R5 is `Glenn` (365.9 Hz), full stop.
      R3/R4/R5 taken WHOLE; R1/R2 quota'd down so the bundle corrects the bias instead of
      reproducing it. A sourcing gap, not a selection one
- [x] 🔴 **`peak_dbfs` and `duration_s` discriminate NOTHING in this corpus** — it is already
      peak-normalised (max -1.0 dBFS, ZERO clipping) and only 4 clips fall under 10 s, shortest
      7.08 s. Both measured, neither gated. `span_st` is a rank penalty only: gating on it would
      have dropped two of the seventeen R3 voices, and this card already logged a 21.4 st span
      on audio a listener passed
- [x] 🔴 **A gate at snr >= 8 dB would have ZEROED R4** (`Aon` scores 7.7). Scarce registers set
      the ceiling on how strict any quality gate can be
- [x] 🔴 **Root-fixed: the import would have DELETED the 12 Phase 2 clips.** `run()` hardcoded
      `performanceClips: []`, so the next import of any kind wiped the grid and left a
      well-formed manifest behind — silent, no error. Contract check 9 now fails if it regresses
- [x] 🔴 **Root-fixed my own bug: the f0 "quartile" was a stride.** `by_f0[i::4]` samples the
      whole range — the opposite of spreading — and made `curated.txt` claim a rationale the code
      never applied. First selection skewed high (22 of 26 R1 picks above 110 Hz). Now contiguous,
      and the note carries each quartile's real Hz bounds
- [x] **`kind: "both"` is CORRECT, not a defect.** A human clip genuinely serves both the direct
      and the VC route, so the filter is inert because the corpus is uniform. Nothing invented
      from measurements — same rule that keeps `accent` null
- [x] `scripts/voice-library/check_manifest.mjs` — 12 checks against the REAL loader, calibrated
      on the old 10-voice manifest before anything changed. NOT wired into `npm test`; run it
      after any import
- [ ] 🔴 **DECISION: 15 voices sit below R1's 90 Hz floor** (60.7-89.4 Hz, incl. `7020` at a
      healthy 0.692 voiced / 13.6 dB). `brief.md` § 2 has no band for them so they were EXCLUDED
      rather than silently filed under R1. Extend R1's floor, add an R0, or leave them out?
- [ ] 🔴 **DECISION: R4 and R5 ship with one voice each.** Child/cartoon character voices do not
      exist in this corpus. Nothing is blocked (the grid is R1+R3 only), but the picker will show
      a register with a single entry
- [ ] `boom` is the one voice of 228 that does not measure — downloads fine, `pyin` finds zero
      voiced frames. Genuinely unusable, not a pipeline fault
- [ ] Picker not wired into any Flow — MPI-607/MPI-621 territory, live peer holds those files

## Phase 2-4

- [x] **12/12 clips GENERATED 2026-08-25** - `research/phase2_perf_clips.py`, Qwen3-TTS
      VoiceDesign under the GPU lease, no failures. One shared phonetically-comprehensive
      text so emotion is the only axis (VC takes articulation from the SOURCE, so every
      character voice inherits these consonants)
- [x] Verify half (a) DONE: every low-arousal cell lands inside its declared band on both
      registers - 8/8. R1 flat/neutral/sad/whisper 94.7-104.5 Hz in R1 90-130; R3 the same
      four 211.4-226.5 Hz in R3 190-260. The persona prompt held
- [x] 🔴 **DO NOT "repair" `angry` and `cheerful`** - they measure R2 (167.3/185.1) and R4
      (278.1/272.5), and that is CORRECT. `register` names the performer's baseline, and the
      pitch lift IS the emotion. Shifting them back down would destroy it. The Phase 0
      shifter repairs a wrong BASELINE, never emotion-driven lift
- [x] 🟢 **ASYMMETRY RESOLVED - IDENTITY HOLDS. Fabio, 2026-08-26: "yeah, it's the same guy."**
      The lift is register-ASYMMETRIC ~2:1 (R1 +9.9/+11.6 st for angry/cheerful, R3 only
      +4.8/+4.4 st from identical prompt grammar), and R1's internal spread of 72.6 Hz
      (94.7 -> 167.3) sits near the 93 Hz precedent. It costs nothing perceptually: one actor
      across the emotion grid, judged on an EXACTLY level-matched pair. The asymmetry is a
      property to record, not a defect to fix
- [x] 🔴 **`pitch_tools.py norm` WIDENED the gap it exists to close** - raw 1.5 dB -> 2.0 dB
      after norm. It targets `rms_active` but clamps at a -1.0 dBFS peak ceiling, so a
      high-crest clip (angry, crest 19.7 dB) hits the ceiling before its RMS reaches target
      and the loudest-peaking clip ends up the quietest-bodied. It produced a false "angry
      sounds like it's down the street" on the first listen. **Fix: match `rms_active`
      exactly at a target low enough that nothing needs limiting (-20 dBFS worked; peaks
      landed -2.3 to -5.6). Never use a peak ceiling when the axis judged is not loudness.**
      `research/proximity_probe.py`
- [x] The "different room" hypothesis is DEAD, measured not assumed: angry vs neutral is
      +0.1 dB HF/LF and +117 Hz centroid. A distant source loses highs; this one loses none
- [x] Level-matched before any listening: 7.4 dB raw spread -> 2.9 dB. Residual is the
      -1.0 dBFS peak ceiling, and it falls the safe way (angry is now the QUIETEST cell)
- [ ] ⚪ Anomaly logged, NOT explained, do not write a rule on it: `perf_R3_sad` p10 = 72.3 Hz
      against a p90 of 248.5. Creak, or a `pyin` octave error. Resolve by ear
- [x] ✅ **ALL 12 CELLS ACCEPTED BY EAR 2026-08-26.** Ask 1 gave 5/6 first pass (angry, sad,
      cheerful, whisper, neutral). Flat failed, was re-rolled, and both registers now pass:
      *"the new flat sounds like the person is in shock, which is actually what flat is
      supposed to be... soulless, in shock, or just empty or not paying attention. It's good."*
      R1 seed 3600 (2.5 st span), R3 seed 3300 (4.2 st)
- [x] 🟢 **Fabio's words are the picker's Flat description** - *"soulless, in shock, or just
      empty, not paying attention."* Clearer than brief.md, and it came from the one person who
      had to ASK what the emotion meant. Every emotion needs a one-line description in
      `MpiVoicePicker`; if he had to ask, a user reading a dropdown has no chance
- [x] 🔴 **The span gate must be RELATIVE to the register's neutral, never absolute.** My
      3.5 st gate came from R1's neutral (5.8 st) and wrongly failed R3, whose neutral is
      naturally 8.9 st. Relative, the two winners match: 43% and 47% of their own neutral
- [x] R1 flat sits BELOW its band (83.4 Hz vs a 90 Hz floor) and is deliberately NOT shifted -
      span and pitch are anti-correlated, so a genuinely flat read sits low. Same rule that
      forbids shifting angry back down
- [x] **12 clips shipped** to `voices/performance/` (489 KB, 24 kHz) and written into
      `manifest.performanceClips`. Loader-verified: all twelve accepted, both register grids
      return their six emotions, unknown register still throws. Each clip carries its **seed** -
      real provenance, since flat ranged 2.5-8.5 st across eight identical-wording generations
- [ ] ⚪ Two measurement artefacts, audio is FINE, do not chase as bugs: `perf_R3_sad` reports a
      21.4 st span off the p10=72.3 Hz outlier, and whisper spans are meaningless in both
      directions (R1 11.5, R3 3.3) because there is too little voiced tone for `pyin`
- [ ] Verify half (b) NOT DONE: drive one R1 character through all six and confirm six
      distinguishable emotions THROUGH VC. Needs the Chatterbox route. Verify mode `user-ux`
- [ ] Generate auditions through the shipping route for every voice
- [ ] Wire the picker into the voice-changer flow's "Target voice" slot

## Source change — kyutai REJECTED, VoiceDesign adopted (2026-08-26, session 18)

- [x] 🔴 **ALL 60 CURATED KYUTAI VOICES REJECTED BY EAR.** Fabio: *"none of it is usable."*
      Unintelligible accents, poor mic quality, a cartoon that is a bad actor impersonating
      one, and R4/R5 at one voice each. He had bounced off this corpus independently before
- [x] 🔴 **WHY THE GATES COULD NOT CATCH IT** — `voiced_frac`/`snr_proxy` measure SIGNAL, not
      SPEECH. The attribute that decided usability was `accent`, the ONE field the design
      forbids inferring, so it could not enter the ranking even in principle. Same lesson this
      card already recorded about the CAMPPlus cosine, repeated one layer up
- [x] 🟢 **STANDING CORRECTION: perceptual product needs a perceptual gate BEFORE volume.**
      One voice per category to the ear, then the other four. Fabio's suggestion, not mine
- [x] **Source = Qwen3-TTS VoiceDesign**, a promotion of brief.md § Sourcing's own "long game".
      The uncontrollable American prior (NEGATIVE for choosing an accent) is exactly the one
      consistent intelligible house accent needed. ACCENT IS NEVER PROMPTED
- [x] **TAXONOMY APPROVED: 12 categories x 5 = 60.** Category 12 renamed `villain_menacing`
      from `creature_monster` on Fabio's ear; it is the only MIXED-GENDER category
- [x] 🔴 **Robot AND creature/monster are POST-FX, not TTS** — neither needs a library slot,
      both apply to any deep voice. brief.md already settles the robot half
- [x] **Library v1 generated** — 12/12, one per category, level-matched to -20 dBFS
- [x] **Age/pitch matrix generated** — 24/24, 4 categories x 3 wordings x 2 seeds, v1 kept as
      the CONTROL so any improvement is attributable
- [x] 🟢 **PITCH RESPONDS TO WORDING.** Child: between-wording spread 139.4 Hz vs largest
      within-wording 44.3. 509.8 Hz -> `child__v2_lower__s0` at **326.8 Hz** (in R4), and
      `<300 Hz` energy back from 0.0% to 16.6%
- [x] 🔴 **AGE DOES NOT RESPOND TO WORDING.** Jitter 2.29-4.42% across every wording including
      ones naming tremor, creak, breathiness and weak breath support. On elderly_male the
      within-wording spread (65.0 Hz) equals the between-wording spread (74.0) = seed variance.
      **Do NOT over-read this** - jitter is a proxy, and trusting a metric over the ear is the
      exact mistake that produced the rejected corpus. Fabio's ear decides
- [x] 🔴 **The child's harshness is f0, NOT an EQ boost.** Fabio's ear localised the band
      correctly (67.5% of energy in 300 Hz-1.5 kHz) but the cause is a 509.8 Hz fundamental,
      an octave above a real eight-year-old, leaving **0.0% of energy below 300 Hz** (vs 48.3%
      for standard_female). It measured HIGHER than the cartoon critter
- [x] 🔴 **My silence measurement was WRONG, Fabio's ear was right.** `trim(top_db=35)` reported
      1.11s/0.29s on elderly_male_1 where the real dead air is ~4s head and ~3.5s tail - a
      single transient anchored the trim. Fixed with a SUSTAINED-energy trim (5 consecutive
      frames); **must move into the shipping pipeline**
- [x] 🔴 **7 of 12 v1 voices missed their target register**, and `mature_female` (172.1) vs
      `standard_female` (174.1) are **2 Hz apart** - two categories nothing but delivery
      separates
- [ ] 🟡 **SEVEN CATEGORIES STILL UNJUDGED**: `deep_male`, `standard_male`, `young_male`,
      `narrator_trailer`, `standard_female`, `young_female`, `cartoon_critter`. Cartoon is the
      risk cell - Fabio rejected the corpus one as a bad actor impersonating a cartoon
- [ ] 🟡 **Matrix unjudged** - does v2/v3 SOUND older than the v1 control?
- [ ] 🔴 **The 60 rejected kyutai voices are still in `voices/` and MUST NOT SHIP.** Left
      deliberately: deleting now leaves the app with an empty library and no replacement, and
      removal is one command once the VoiceDesign library lands.
      `manifest.performanceClips` (the 12 accepted emotion clips) is untouched, guarded by
      contract check 9
- [ ] Only APPROVED categories get their remaining four. Use `library_personas.py --only
      <slugs> --start 1` so seeds cannot collide with the accepted take
