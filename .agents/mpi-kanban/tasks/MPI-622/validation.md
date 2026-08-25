# MPI-622 Validation

Evidence base for this card starts at `../MPI-607/validation.md` from `2026-08-25` onward.
Everything below is new.

---

### 2026-08-25 — Phase 0: the offline shifter works, and it exposed that TTS ignores the clip's register

**Option 1 of Phase 0 is built and half-measured.** A live voice changer is settled as not
the answer (it fights pitch while the voice is being produced). An offline shift is a
different mechanism — it operates on an already-emotional recording, so the contour moves
intact — and that is what this tested.

#### The shifter

`research/pitch_tools.py`, `praat-parselmouth` 0.4.7 installed on the bench
(`G:/ComfyUi/python_embeded`). Praat **"Change gender"** with `formant_shift_ratio 1.0`
moves the pitch median and leaves the formants where they are.

**`librosa.effects.pitch_shift` and `torchaudio.functional.pitch_shift` were both rejected
and neither was a close call** — they are resample-based, so they drag the formants along
and manufacture the exact chipmunk artefact this phase exists to rule out. Either one would
have failed the test by construction rather than on the merits.

Validated against figures already recorded on MPI-607, so the tool is not grading its own
homework: `A3_REF` **125.7 Hz** (exact match) and `e0_neutral` **223.9** vs the recorded
225.2 — inside the card's own 2 Hz gate.

| shift | median f0 | register | duration |
|---|---|---|---|
| `recording_003.wav` (source) | 101.5 | R1 | 13.26 s |
| +7 st | 150.3 | R2 | 13.26 s |
| +12 st | 201.8 | R3 | 13.26 s |
| +19 st | 305.9 | R4 | 13.26 s |

Duration untouched to the centisecond, and every shift lands inside its target band.

#### 🔴 The plan's semitone figures were wrong

Phase 0 said "+7 and +12 ... into R3/R4". From a 101.5 Hz source the arithmetic does not
reach: **+7 lands on R2 and +12 on R3. R4 needs +19.** Recorded in `plan.md` § Plan Drift.

#### 🔴 There is no angry take of Fabio's on disk — Phase 0 splits in two

The plan assumed "one of Fabio's natural angry takes" exists. It does not. The only natural
recordings are `recording_003/004/005.wav` (101.5 / 182.9 / 127.9 Hz), none recorded as
emotional. The two expressive ones are **pushed** takes — `high_pitch_exp_fabio` 230.5 Hz
and `high_pittch_fabio` 316.7 Hz — and a pushed take scores 0.38–0.42 against his own
natural voice (MPI-607, 2026-08-25), so guidance rule 1 rules them out as sources.

So the phase's two questions are now answered separately:

- **(b) do artefacts ride through VC?** Needs no emotion. Run below, awaiting his ear.
- **(a) does anger survive the shift?** Blocked on one angry line at his natural pitch.

#### The (b) run

`research/phase0_shift_pipeline.py`, bench :8188 under the GPU lease. Three runs, each
TTS(text, `audio_prompt`=shifted clip, exag 1.2, cfg 0.3) -> VC(matched-register character),
both stages saved. **A +0 control is included and is load-bearing** — without it there is no
way to tell a shift artefact from one the pipeline always makes.

15–18 s each, `execution_cached` empty on the TTS and VC nodes in all three.

Staged blind at `C:/Users/Fabio/Desktop/MPI622_pitch/` as A/B/C with the raw shifts in
`open_me_last/`. Key: `research/phase0_answer_key.md`.

#### 🔴 A performance clip's register is NOT the output's register

Measured on all three runs, and it was not predicted by anything on either card:
**Chatterbox TTS at exaggeration 1.2 lands 74–85 Hz above its reference clip.**

| reference | its f0 | TTS out | rise |
|---|---|---|---|
| `recording_003` | 101.5 | 186.1 | +84.6 Hz |
| `rec003_plus7` | 150.3 | 226.5 | +76.2 Hz |
| `rec003_plus12` | 201.8 | 275.7 | +73.9 Hz |

The rise is roughly constant in Hz, not in semitones, which means it compresses as the
reference climbs (+9.2 st at R1, down to +5.4 st at R3). Consequence for `brief.md` § 2:
the R1–R5 grid describes **where the clip sits, not where the line comes out**, so a
"matched register" pairing has to be chosen against the TTS output, not against the clip.

#### The VC stage closes the pitch gap by wildly different amounts

| run | perf clip | TTS -> char gap | VC closed | % | VC out vs char |
|---|---|---|---|---|---|
| B control | +0 | 6.8 st | 4.6 st | 68% | +2.2 st |
| C | +7 | 8.5 st | 6.5 st | 77% | +2.0 st |
| A | +12 | 4.0 st | 0.35 st | **9%** | **+3.7 st** |

Cosine to the intended character: **0.93 / 0.81 / 0.84** — all above the 0.80 gate, all
"same speaker, confidently". Run A scores 0.84 while sitting 3.7 semitones above the voice
it is supposed to be. **That is the disqualified-cosine problem again, and this time the
pitch half of the gate is what caught it** — the first live demonstration that the two-number
gate from `brief.md` § 5 earns its keep.

**Status: awaiting Fabio's ear on (b), and one angry take for (a).**
