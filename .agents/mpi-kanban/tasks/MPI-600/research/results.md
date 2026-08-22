# MPI-600 — every scored run, one row each

Row format is the one locked at the end of `scenarios.md`. Appended by `research/sweep.py`;
never hand-edit a row, add a note under the table instead.

**Every run frees the bench first** (`POST /free`), so the VRAM column is a real attributable
number and the wall-clock column includes a constant RAM→VRAM model load for every arm alike.
Compare wall clock *between rows here*, never against Leg 0's warm numbers in `format.md`.

- `VRAM` = attributable (peak − freshly-sampled floor), with the raw peak in brackets against a
  16380 MiB card.
- `seam 0-32 signed` = the three `seam.py` ring numbers `0-8 / 8-16 / 16-32`, S2 only.
  **Leg 0 baseline to beat: `-3.135 / -1.658 / +1.280`.**

---

## Leg A — base vs base+turbo LoRA, swept by strength

| candidate | format | scenario | seed | steps | cfg | out-res | wall | VRAM | seam 0-32 signed | output |
|---|---|---|---|---|---|---|---|---|---|---|
| base | int8+convrot | S1 | 101 | 20 | 5.0 | 1024x1024 | 82.4s | 14709 MiB (15688 peak) | - | S1_101_00001_.png |
| base | int8+convrot | S1 | 202 | 20 | 5.0 | 1024x1024 | 81.0s | 14817 MiB (15606 peak) | - | S1_202_00001_.png |
| base | int8+convrot | S1 | 303 | 20 | 5.0 | 1024x1024 | 82.5s | 14896 MiB (15710 peak) | - | S1_303_00001_.png |
| base | int8+convrot | S2 | 101 | 20 | 5.0 | 1024x1024 | 16.1s | 14937 MiB (15723 peak) | -27.541 / -13.517 / -2.420 | S2_101_00001_.png |
| base | int8+convrot | S2 | 202 | 20 | 5.0 | 1024x1024 | 16.1s | 14831 MiB (15622 peak) | -5.476 / -4.704 / -3.709 | S2_202_00001_.png |
| base | int8+convrot | S2 | 303 | 20 | 5.0 | 1024x1024 | 16.1s | 14857 MiB (15619 peak) | -23.812 / -9.503 / -3.435 | S2_303_00001_.png |
| base | int8+convrot | S3 | 101 | 20 | 5.0 | 1024x1024 | 80.8s | 14831 MiB (15590 peak) | - | S3_101_00001_.png |
| base | int8+convrot | S3 | 202 | 20 | 5.0 | 1024x1024 | 82.5s | 14649 MiB (15433 peak) | - | S3_202_00001_.png |
| base | int8+convrot | S3 | 303 | 20 | 5.0 | 1024x1024 | 82.5s | 14866 MiB (15661 peak) | - | S3_303_00001_.png |
| turbo-100 | int8+convrot | S1 | 101 | 8 | 1.0 | 1024x1024 | 32.2s | 14443 MiB (15234 peak) | - | S1_101_00001_.png |
| turbo-100 | int8+convrot | S1 | 202 | 8 | 1.0 | 1024x1024 | 34.4s | 14939 MiB (15779 peak) | - | S1_202_00001_.png |
| turbo-100 | int8+convrot | S1 | 303 | 8 | 1.0 | 1024x1024 | 32.4s | 14622 MiB (15471 peak) | - | S1_303_00001_.png |
| turbo-100 | int8+convrot | S2 | 101 | 8 | 1.0 | 1024x1024 | 16.2s | 14932 MiB (15795 peak) | -18.905 / -3.409 / +1.304 | S2_101_00002_.png |
| turbo-100 | int8+convrot | S2 | 202 | 8 | 1.0 | 1024x1024 | 18.1s | 14985 MiB (15794 peak) | -16.333 / -2.365 / -1.242 | S2_202_00001_.png |
| turbo-100 | int8+convrot | S2 | 303 | 8 | 1.0 | 1024x1024 | 18.1s | 14747 MiB (15580 peak) | -30.767 / -3.894 / -1.580 | S2_303_00001_.png |
| turbo-100 | int8+convrot | S3 | 101 | 8 | 1.0 | 1024x1024 | 32.3s | 14832 MiB (15678 peak) | - | S3_101_00001_.png |
| turbo-100 | int8+convrot | S3 | 202 | 8 | 1.0 | 1024x1024 | 32.2s | 14476 MiB (15316 peak) | - | S3_202_00001_.png |
| turbo-100 | int8+convrot | S3 | 303 | 8 | 1.0 | 1024x1024 | 32.4s | 15022 MiB (15842 peak) | - | S3_303_00001_.png |
| turbo-070 | int8+convrot | S1 | 101 | 10 | 1.5 | 1024x1024 | 48.2s | 14923 MiB (15678 peak) | - | S1_101_00001_.png |
| turbo-070 | int8+convrot | S1 | 202 | 10 | 1.5 | 1024x1024 | 48.3s | 14408 MiB (15204 peak) | - | S1_202_00001_.png |
| turbo-070 | int8+convrot | S1 | 303 | 10 | 1.5 | 1024x1024 | 48.3s | 14710 MiB (15516 peak) | - | S1_303_00001_.png |
| turbo-070 | int8+convrot | S2 | 101 | 10 | 1.5 | 1024x1024 | 18.1s | 14568 MiB (15360 peak) | -14.729 / -9.634 / -3.695 | S2_101_00001_.png |
| turbo-070 | int8+convrot | S2 | 202 | 10 | 1.5 | 1024x1024 | 16.6s | 14656 MiB (15452 peak) | -11.698 / -5.920 / -4.259 | S2_202_00001_.png |
| turbo-070 | int8+convrot | S2 | 303 | 10 | 1.5 | 1024x1024 | 20.2s | 14628 MiB (15461 peak) | -23.962 / -3.441 / -2.189 | S2_303_00001_.png |
| turbo-070 | int8+convrot | S3 | 101 | 10 | 1.5 | 1024x1024 | 48.3s | 14793 MiB (15643 peak) | - | S3_101_00001_.png |
| turbo-070 | int8+convrot | S3 | 202 | 10 | 1.5 | 1024x1024 | 48.3s | 14590 MiB (15435 peak) | - | S3_202_00001_.png |
| turbo-070 | int8+convrot | S3 | 303 | 10 | 1.5 | 1024x1024 | 48.3s | 14262 MiB (15189 peak) | - | S3_303_00001_.png |
| turbo-035 | int8+convrot | S1 | 101 | 8 | 3.5 | 1024x1024 | 40.2s | 14642 MiB (15603 peak) | - | S1_101_00001_.png |
| turbo-035 | int8+convrot | S1 | 202 | 8 | 3.5 | 1024x1024 | 40.2s | 14661 MiB (15211 peak) | - | S1_202_00001_.png |
| turbo-035 | int8+convrot | S1 | 303 | 8 | 3.5 | 1024x1024 | 40.3s | 14881 MiB (15626 peak) | - | S1_303_00001_.png |
| turbo-035 | int8+convrot | S2 | 101 | 8 | 3.5 | 1024x1024 | 16.5s | 14942 MiB (15662 peak) | -13.405 / -8.432 / -3.396 | S2_101_00001_.png |
| turbo-035 | int8+convrot | S2 | 202 | 8 | 3.5 | 1024x1024 | 18.1s | 14772 MiB (15483 peak) | -5.664 / -5.305 / -4.241 | S2_202_00001_.png |
| turbo-035 | int8+convrot | S2 | 303 | 8 | 3.5 | 1024x1024 | 18.1s | 14801 MiB (15502 peak) | -20.592 / -5.680 / -3.086 | S2_303_00001_.png |
| turbo-035 | int8+convrot | S3 | 101 | 8 | 3.5 | 1024x1024 | 40.2s | 14970 MiB (15666 peak) | - | S3_101_00001_.png |
| turbo-035 | int8+convrot | S3 | 202 | 8 | 3.5 | 1024x1024 | 42.5s | 14931 MiB (15655 peak) | - | S3_202_00001_.png |

### Validity of the rows above — READ BEFORE USING THEM

The 36 rows above are a COMPLETE Leg A matrix, but **only the 9 `turbo-100` rows are valid as
quality measurements.** Two structural faults were found by LOOKING AT THE OUTPUTS, after the
numbers had already been recorded. Both are settings faults in how the arms were driven, not
model verdicts.

**FAULT 1 — the negative conditioning was ZEROED on every arm, so any arm with cfg > 1 is cooked.**
Node **52 `Input_is_Turbo`** was left `true` for all four arms. It drives `MpiIfElse` **57 / 212 /
222**, which swap the negative between `ConditioningZeroOut` (true) and the real `CLIPTextEncode`
(false). At cfg 1.0 that is harmless — no CFG is applied. At cfg > 1 it amplifies against a zero
negative and the image blows out: neon grass, cyan sky, posterised edges, crushed contrast.

| arm | cfg | node 52 should be | rows valid? |
|---|---|---|---|
| `base` | 5.0 | **false** | **NO — re-run** |
| `turbo-070` | 1.5 | **false** | **NO — re-run** |
| `turbo-035` | 3.5 | **false** | **NO — re-run** |
| `turbo-100` | 1.0 | either (cfg 1 ignores it) | **YES** |

Node 52 also feeds 417/418/437/439, but those only reach `MaskDetailerPipe` and
`UltimateSDUpscale` — neither is on branches 1, 4 or 5, so the negative swap is the whole effect.
203/204 also take `a` from 52 and are literals now, so they do not care.

**FAULT 2 — S2 never ran at the arm's steps/cfg, and every Leg A S2 output is a FAILED edit.**
The `wf_type` 5 branch samples through **252**, whose sigmas come from **267 (`steps: 2`
HARDCODED)** and whose guider is **254 (`cfg: 1` HARDCODED)**. Nodes 203/204 reach only the t2i
(28/31/32) and edit (185/173/170) branches. So S2 ran at **2 steps / cfg 1 on every arm** — which
is why base S2 took 16 s while base S1 took 82 s.

At 2 steps neither base nor base+turbo regenerates the green fill this branch paints into the
masked region, so **the green survives into the saved image**: `base` leaves a smeared green
ghost, `turbo-100` leaves solid saturated green with no man generated at all. Distilled managed
this fine in Leg 0 (a man casting a correct shadow) because it is a 4-step model and copes with 2.

**Therefore the `seam 0-32 signed` column above is measuring the edge of a green blob, not a
seam.** It is a "did the branch fill the mask at all" signal, nothing more. Do not read those
numbers as seam integrity, and do not compare them to the Leg 0 baseline.

**The colouring question is re-confirmed on Leg A anyway** — `base` S2 seed 101 against the plate:
outside-mask mean signed **-0.742/255**, ring 64-128 px max delta **5**, **ring 128+ px max delta
0 — byte-identical**. All change sits inside the ≤64 px feather. The model does not shift the
plate's colouring, even when the edit itself fails.

### What a re-run must set

- `--set 52.boolean=false` on every arm whose cfg > 1 (`base`, `turbo-070`, `turbo-035`).
- For S2 to be a real test of an arm, `--set 267.steps=<steps> --set 254.cfg=<cfg>` — already
  wired as `sweep.py --s2-regime`, which also renames the outputs `S2R_*`. **Not yet run.**
- Keep the 9 `turbo-100` rows; they need no re-run.

`turbo-100` S1 and S3 were inspected by eye and are clean: correct edit, identity/pose/scene held,
natural colour, shadow correctly re-cast for the new pose.
