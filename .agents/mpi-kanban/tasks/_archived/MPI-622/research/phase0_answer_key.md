# Phase 0 listening test — answer key (do NOT show before he has judged)

`C:/Users/Fabio/Desktop/MPI622_pitch/` — the three VC-stage outputs, shuffled. Same text,
same seed, so only the voice differs. He is told nothing about which was shifted; the raw
shifted clips sit in `open_me_last/` so the folder itself does not give it away.

| played as | run | performance clip | its median f0 | character | char f0 | VC out f0 | cosine to char |
|---|---|---|---|---|---|---|---|
| **A** | `shift_R3_plus12` | `rec003_plus12.wav` (**+12 st**) | 201.8 Hz | `lib_f_midage_narration` | 218.8 | 270.2 | 0.84 |
| **B** | `ctrl_R1_plus0` | `recording_003.wav` (**unshifted**) | 101.5 Hz | `A3_REF_senior_male_gravel` | 125.7 | 142.7 | 0.93 |
| **C** | `shift_R2_plus7` | `rec003_plus7.wav` (**+7 st**) | 150.3 Hz | `vd_midage_female_uk_narration` | 138.6 | 155.6 | 0.81 |

**B is the control.** If B is clean and A/C are not, the shift is at fault. If all three
carry the same texture, it is the pipeline, not the shift.

Note the character voices differ in gender, so a listener who reasons about it can guess B
is the unshifted one. That is unavoidable — matched registers were the point — and it does
not touch the artefact judgement, which is about texture, not identity.

## What the numbers already say, before any listening

**Chatterbox TTS at exaggeration 1.2 lands ~75–85 Hz ABOVE its reference clip**, every time:

| reference | its f0 | TTS out | rise |
|---|---|---|---|
| `recording_003` | 101.5 | 186.1 | +84.6 Hz |
| `rec003_plus7` | 150.3 | 226.5 | +76.2 Hz |
| `rec003_plus12` | 201.8 | 275.7 | +73.9 Hz |

So **a performance clip's register is not the output's register** — the TTS stage adds most
of an octave at the VC-source setting. That matters for the R1–R5 grid in `brief.md`: the
clip's declared register predicts where the clip sits, not where the line comes out.

The VC stage then pulls it back toward the character, but by wildly different amounts:

| run | TTS -> char gap | VC closed | % |
|---|---|---|---|
| B (control) | 6.8 st | 4.6 st | 68% |
| C (+7) | 8.5 st | 6.5 st | 77% |
| A (+12) | 4.0 st | 0.35 st | **9%** |

A ends up **3.7 semitones above** its character while scoring 0.84 to it — another instance
of the disqualified-cosine problem, now with the pitch half of the gate catching what the
cosine missed.
