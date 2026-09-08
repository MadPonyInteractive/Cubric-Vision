# Phase 0d answer key — the rhotic sweep (do NOT show before he has judged)

`C:/Users/Fabio/Desktop/MPI622_R_sweep/`, files `1`–`5`. **No TTS stage anywhere in this
test** — every arm feeds `FL_ChatterboxVC` the byte-identical TTS output from Phase 0c's F
run, pitch-shifted to a different distance from the same character
(`lib_f_midage_narration`, 218.8 Hz). Nothing else differs, so anything heard is the VC stage
responding to source-vs-target pitch.

Level-matched: rms_active −16.0 to −17.0 dB, peaks −1.0 to −1.6. All 6.16 s.

| played as | arm | source f0 | vs character | VC out |
|---|---|---|---|---|
| **1** | `plus4` | 267.8 | +3.5 st | 270.2 |
| **2** | `plus0` | **206.5** | **−1.0 st** | 242.8 | ← **the known-broken reference, unshifted** |
| **3** | `plus7` | 314.9 | +6.3 st | 278.9 |
| **4** | `minus4` | 173.7 | **−4.0 st** | 226.5 | ← furthest below the target |
| **5** | `plus2` | 242.8 | +1.8 st | 248.5 |

**The one question:** which of these say **"twain"** instead of **"train"**?

## How to read the result

| outcome | conclusion |
|---|---|
| **2 and 4 break, 1/3/5 clean** | Hypothesis holds. VC damages consonants when it must RAISE pitch to reach the target. Guidance rule 3 gains a mechanism and an asymmetry: **under the target is worse than over it.** Becomes a pairing rule the library can enforce automatically, since both pitches are known numbers. |
| **only 2 breaks** | Not about direction. Something specific to that one unshifted clip — and the shifter would then be *repairing* it, which is its own finding. |
| **everything except 2 is clean** | Same as above: the shift itself is the fix, not the pitch relationship. Different investigation. |
| **all five break** | The defect is in the character voice's interaction with VC generally, and `lib_f_midage_narration` is unshippable. Cheapest outcome to act on — drop the voice. |
| **none break** | The defect needs the TTS stage present to appear, which points at something in the TTS output that this test destroyed by re-encoding. Re-run with the TTS stage in the graph. |

## Standing note

`plus0` (file **2**) is deliberately the unshifted original. If it does not reproduce the
defect here, the whole sweep is void — the TTS→VC graph produced it and this TTS-free graph
does not, which is itself the finding. **Check 2 first.**
