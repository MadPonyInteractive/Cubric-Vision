# Phase 0b listening test — answer key (do NOT show before he has judged)

`C:/Users/Fabio/Desktop/MPI622_perf_vs_shift/`. Same character (`lib_f_midage_narration`,
218.8 Hz), same text, same seed for all four — the performance clip is the only variable.
**All four level-matched to −16.0 dB rms_active**, so loudness cannot decide it this time.

| played as | run | performance clip | its f0 | TTS out | VC out | TTS duration |
|---|---|---|---|---|---|---|
| **pair1_X** | R3 **shifted** | `rec003_plus12` (+12 st) | 201.8 | 275.7 | 270.2 | 6.16 s |
| **pair1_Y** | R3 **performed** | `high_pitch_exp_fabio` | 230.5 | 299.8 | 261.7 | **18.56 s** |
| **pair2_X** | R4 **performed** | `high_pittch_fabio` | 316.7 | 408.3 | 305.0 | 6.60 s |
| **pair2_Y** | R4 **shifted** | `rec003_plus19` (+19 st) | 305.9 | 346.3 | 297.2 | 7.96 s |

Shifted is X in pair 1 and **Y** in pair 2 — deliberately swapped so a listener who guesses
the pattern from pair 1 gets pair 2 wrong.

Do not read an R3 run against an R4 run: no R4 character clip exists, so both R4 runs use
the R3 character and carry the same mismatch. It cancels *within* the pair only.

## The one number that already stands out

**pair1_Y's TTS stage ran 18.56 s for a line the other three deliver in 6.2–8.0 s** — three
times as long, at 18.6% voiced. The performed R3 clip destabilised the TTS stage; the shifted
R3 clip is the cleanest of the four at 75.1% voiced.

That is n=1 and the R4 performed clip did not do it (6.60 s, 69.4% voiced), so it is not
"performed clips break TTS". The candidate explanation is `high_pitch_exp_fabio`'s own 32.6%
voiced fraction — a reference that is mostly not-speech gives the TTS stage little to lock
onto. If that holds, the rule for authoring is about **voiced density**, not about performed
versus shifted, and it applies to both.
