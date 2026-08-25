# Phase 0c listening test — answer key (do NOT show before he has judged)

`C:/Users/Fabio/Desktop/MPI622_angry/`. Five clips, D–H. Same character
(`lib_f_midage_narration`, 218.8 Hz), same neutral text, same seed — the performance clip is
the only variable. Level-matched: rms_active spans **−16.0 to −16.8 dB**, peaks −1.0 to −2.3,
so loudness cannot decide it (the 0.8 dB spread is under the threshold of noticing).

| played as | run | performance clip | its f0 | chain | TTS out | VC out |
|---|---|---|---|---|---|---|
| **D** | `angry_R5_shift19` | `rec008_plus19` (**+19**) | 399.0 | denoised | 383.2 | 295.5 |
| **E** | `angry_R4_performed` | `recording_010` (**+0**) | 274.1 | **raw** | 290.4 | 271.0 |
| **F** | `angry_R2_plus0` | `recording_008` (**+0**) | 136.3 | denoised | 206.5 | 245.6 |
| **G** | `angry_R2_shiftdown12` | `rec010_minus12` (**−12**) | 141.9 | **raw** | 229.2 | 282.1 |
| **H** | `angry_R4_shift12` | `rec008_plus12` (**+12**) | 277.3 | denoised | 365.9 | 301.5 |

The two unshifted controls are **E and F**. Shifted are D (+19), G (−12), H (+12).

**Read within a chain, never across it.** 8 and 9 went through his AI noise-cancellation
filter; 10 did not. So:

- denoised chain, compare **F (control) → H (+12) → D (+19)**
- raw chain, compare **E (control) → G (−12)**

Question (a) is answered by whether the shifted members of each chain still read as angry
next to their own control. A performed-vs-shifted verdict is NOT available from this set —
it needs an angry take at his natural pitch recorded with the filter OFF.

## What the numbers say before any listening

**Every run came out clean this time** — 6.0–7.8 s, 59.9–69.9% voiced. No repeat of Phase 0b's
18.56 s blowup.

**That weakens the voiced-density theory rather than supporting it.** `recording_008` is
32.3% voiced, all but identical to `high_pitch_exp_fabio`'s 32.6% which caused the blowup, and
008 produced a clean 6.16 s. So low voiced fraction is **not** what broke that run, and
whatever did is still unexplained. Do not write a "voiced density" authoring rule on this
evidence.

The TTS +74–85 Hz rise holds again in the raw chain (274.1 → 290.4 is only +16, the smallest
seen; 136.3 → 206.5 is +70), so the rise is not a constant after all — it shrinks as the
reference climbs, and at R4 it nearly vanishes. Worth refining before the grid is authored.
