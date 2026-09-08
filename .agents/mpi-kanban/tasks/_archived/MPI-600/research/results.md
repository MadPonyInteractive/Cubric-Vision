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

## VOID - Leg A pass 1 (node 52 zeroed the negative; S2 ran on the wf5 inpaint branch)

**Do not read a verdict from this table.** It is kept for the audit trail. Its S1/S3 rows at
cfg > 1 blew out against a zeroed negative, and every S2 row ran on `wf_type` 5 - the wrong
branch entirely. The current matrix is further down under **CURRENT MATRIX**.

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

---

## CURRENT MATRIX - wf_type 4, BOX mask, image-2 reference

**This is the only table to read for a verdict.** Everything above it is superseded; the two
sections below are kept only so the record stays auditable. Three corrections from Fabio landed
on S2 while the bench was running - branch, test shape, and mask - and each one voided what came
before it. `format.md` SS "Leg A pass 2" carries the full account.

S1 and S3 use **no mask**, so the mask correction did not touch them. `base` S1/S3 were run
before the box landed and sit in the superseded table below under `_v2_` outputs - those rows
are VALID, they are just filed under the tag they were run with.

- `negative` - `real` = node 52 forced `false` (the real CLIPTextEncode negative). `zeroed` = 52
  left `true` (ConditioningZeroOut), which is harmless only at cfg 1.0.
- `guard` - measured off the saved PNG. `green %` uses green DOMINANCE (`g - max(r,b) > 60`);
  `clip %` is channel-clipped pixels.
- `seam 0-32 signed` - `seam.py` rings `0-8 / 8-16 / 16-32`, S2 only.

**The guard column cannot see the failure that matters on this axis.** Every S2 row below reads
`green 0.00% / clip ~0.1%` - i.e. perfect - while the arms disagree completely on whether they
placed the man, duplicated the woman, or did nothing at all. Placement is scored by EYE off
`S2_contact_sheet.png`. No number in this table closes it.

| candidate | negative | scenario | seed | steps | cfg | out-res | wall | VRAM | guard | seam 0-32 signed | output |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base | real | S2 | 101 | 20 | 5.0 | 1024x1024 | 195.0s | 15227 MiB (15903 peak) | green 0.00% / clip 0.1% | -1.038 / -0.475 / -0.079 | S2_101_box_00001_.png |
| base | real | S2 | 202 | 20 | 5.0 | 1024x1024 | 190.9s | 15279 MiB (15943 peak) | green 0.00% / clip 0.2% | -6.816 / -2.495 / -0.091 | S2_202_box_00001_.png |
| base | real | S2 | 303 | 20 | 5.0 | 1024x1024 | 189.1s | 15196 MiB (15781 peak) | green 0.00% / clip 0.2% | -1.867 / -1.626 / -0.100 | S2_303_box_00001_.png |
| turbo-100 | zeroed | S1 | 101 | 8 | 1.0 | 1024x1024 | 32.7s | 15050 MiB (15654 peak) | green 0.00% / clip 1.4% | - | S1_101_box_00001_.png |
| turbo-100 | zeroed | S1 | 202 | 8 | 1.0 | 1024x1024 | 32.2s | 14603 MiB (15197 peak) | green 0.00% / clip 1.3% | - | S1_202_box_00001_.png |
| turbo-100 | zeroed | S1 | 303 | 8 | 1.0 | 1024x1024 | 32.2s | 14635 MiB (15229 peak) | green 0.00% / clip 1.9% | - | S1_303_box_00001_.png |
| turbo-100 | zeroed | S2 | 101 | 8 | 1.0 | 1024x1024 | 48.2s | 15178 MiB (15772 peak) | green 0.00% / clip 0.1% | +6.962 / +0.426 / -0.055 | S2_101_box_00001_.png |
| turbo-100 | zeroed | S2 | 202 | 8 | 1.0 | 1024x1024 | 48.2s | 14891 MiB (15485 peak) | green 0.00% / clip 0.1% | -10.953 / -4.653 / -0.123 | S2_202_box_00001_.png |
| turbo-100 | zeroed | S2 | 303 | 8 | 1.0 | 1024x1024 | 48.2s | 15051 MiB (15645 peak) | green 0.00% / clip 0.1% | -0.880 / -0.289 / -0.073 | S2_303_box_00001_.png |
| turbo-100 | zeroed | S3 | 101 | 8 | 1.0 | 1024x1024 | 32.2s | 14635 MiB (15230 peak) | green 0.00% / clip 0.3% | - | S3_101_box_00001_.png |
| turbo-100 | zeroed | S3 | 202 | 8 | 1.0 | 1024x1024 | 32.2s | 15180 MiB (15774 peak) | green 0.00% / clip 0.6% | - | S3_202_box_00001_.png |
| turbo-100 | zeroed | S3 | 303 | 8 | 1.0 | 1024x1024 | 32.2s | 14635 MiB (15229 peak) | green 0.00% / clip 0.4% | - | S3_303_box_00001_.png |
| turbo-070 | real | S1 | 101 | 10 | 1.5 | 1024x1024 | 64.4s | 14762 MiB (15356 peak) | green 0.00% / clip 1.1% | - | S1_101_box_00001_.png |
| turbo-070 | real | S1 | 202 | 10 | 1.5 | 1024x1024 | 62.7s | 14506 MiB (15101 peak) | green 0.00% / clip 0.9% | - | S1_202_box_00001_.png |
| turbo-070 | real | S1 | 303 | 10 | 1.5 | 1024x1024 | 62.8s | 15083 MiB (15677 peak) | green 0.00% / clip 1.7% | - | S1_303_box_00001_.png |
| turbo-070 | real | S2 | 101 | 10 | 1.5 | 1024x1024 | 102.5s | 14379 MiB (14990 peak) | green 0.00% / clip 0.1% | +4.804 / +0.140 / -0.068 | S2_101_box_00001_.png |
| turbo-070 | real | S2 | 202 | 10 | 1.5 | 1024x1024 | 102.5s | 13947 MiB (14558 peak) | green 0.00% / clip 0.1% | -11.751 / -4.610 / -0.127 | S2_202_box_00001_.png |
| turbo-070 | real | S2 | 303 | 10 | 1.5 | 1024x1024 | 102.4s | 13595 MiB (14206 peak) | green 0.00% / clip 0.1% | +0.678 / -0.210 / -0.078 | S2_303_box_00001_.png |
| turbo-070 | real | S3 | 101 | 10 | 1.5 | 1024x1024 | 62.7s | 14923 MiB (15551 peak) | green 0.00% / clip 0.2% | - | S3_101_box_00001_.png |
| turbo-070 | real | S3 | 202 | 10 | 1.5 | 1024x1024 | 62.8s | 14475 MiB (15103 peak) | green 0.00% / clip 0.5% | - | S3_202_box_00001_.png |
| turbo-070 | real | S3 | 303 | 10 | 1.5 | 1024x1024 | 62.8s | 14123 MiB (14751 peak) | green 0.00% / clip 0.1% | - | S3_303_box_00001_.png |
| turbo-035 | real | S1 | 101 | 8 | 3.5 | 1024x1024 | 52.3s | 14827 MiB (15455 peak) | green 0.00% / clip 2.0% | - | S1_101_box_00001_.png |
| turbo-035 | real | S1 | 202 | 8 | 3.5 | 1024x1024 | 52.2s | 14731 MiB (15359 peak) | green 0.00% / clip 2.0% | - | S1_202_box_00001_.png |
| turbo-035 | real | S1 | 303 | 8 | 3.5 | 1024x1024 | 54.4s | 14592 MiB (15231 peak) | green 0.00% / clip 2.0% | - | S1_303_box_00001_.png |
| turbo-035 | real | S2 | 101 | 8 | 3.5 | 1024x1024 | 84.6s | 14348 MiB (14977 peak) | green 0.00% / clip 0.1% | +1.035 / -0.369 / -0.076 | S2_101_box_00001_.png |
| turbo-035 | real | S2 | 202 | 8 | 3.5 | 1024x1024 | 84.4s | 14411 MiB (15040 peak) | green 0.00% / clip 0.1% | -8.901 / -4.373 / -0.121 | S2_202_box_00001_.png |
| turbo-035 | real | S2 | 303 | 8 | 3.5 | 1024x1024 | 84.7s | 14380 MiB (15009 peak) | green 0.00% / clip 0.2% | -4.063 / -2.113 / -0.110 | S2_303_box_00001_.png |
| turbo-035 | real | S3 | 101 | 8 | 3.5 | 1024x1024 | 52.5s | 14732 MiB (15361 peak) | green 0.00% / clip 0.1% | - | S3_101_box_00001_.png |
| turbo-035 | real | S3 | 202 | 8 | 3.5 | 1024x1024 | 52.4s | 14762 MiB (15392 peak) | green 0.00% / clip 0.4% | - | S3_202_box_00001_.png |
| turbo-035 | real | S3 | 303 | 8 | 3.5 | 1024x1024 | 52.4s | 14764 MiB (15393 peak) | green 0.00% / clip 0.1% | - | S3_303_box_00001_.png |
| distilled | zeroed | S1 | 101 | 4 | 1.0 | 1024x1024 | 22.5s | 14557 MiB (15186 peak) | green 0.00% / clip 1.1% | - | S1_101_box_00001_.png |
| distilled | zeroed | S1 | 202 | 4 | 1.0 | 1024x1024 | 20.2s | 15004 MiB (15631 peak) | green 0.00% / clip 0.5% | - | S1_202_box_00001_.png |
| distilled | zeroed | S1 | 303 | 4 | 1.0 | 1024x1024 | 20.1s | 15004 MiB (15631 peak) | green 0.00% / clip 1.5% | - | S1_303_box_00001_.png |
| distilled | zeroed | S2 | 101 | 4 | 1.0 | 1024x1024 | 30.5s | 14719 MiB (15388 peak) | green 0.00% / clip 0.1% | +6.880 / +1.557 / -0.046 | S2_101_box_00001_.png |
| distilled | zeroed | S2 | 202 | 4 | 1.0 | 1024x1024 | 28.2s | 15228 MiB (15855 peak) | green 0.00% / clip 0.1% | +0.871 / -0.387 / -0.079 | S2_202_box_00001_.png |
| distilled | zeroed | S2 | 303 | 4 | 1.0 | 1024x1024 | 28.3s | 15132 MiB (15721 peak) | green 0.00% / clip 0.1% | +2.582 / +1.127 / -0.059 | S2_303_box_00001_.png |
| distilled | zeroed | S3 | 101 | 4 | 1.0 | 1024x1024 | 20.3s | 15036 MiB (15625 peak) | green 0.00% / clip 0.2% | - | S3_101_box_00001_.png |
| distilled | zeroed | S3 | 202 | 4 | 1.0 | 1024x1024 | 20.3s | 15164 MiB (15753 peak) | green 0.00% / clip 0.3% | - | S3_202_box_00001_.png |
| distilled | zeroed | S3 | 303 | 4 | 1.0 | 1024x1024 | 20.2s | 15068 MiB (15657 peak) | green 0.00% / clip 0.1% | - | S3_303_box_00001_.png |
| kv | zeroed | S1 | 101 | 4 | 1.0 | 1024x1024 | 24.2s | 15100 MiB (15689 peak) | green 0.00% / clip 0.4% | - | S1_101_box_00001_.png |
| kv | zeroed | S1 | 202 | 4 | 1.0 | 1024x1024 | 20.2s | 14588 MiB (15177 peak) | green 0.00% / clip 0.2% | - | S1_202_box_00001_.png |
| kv | zeroed | S1 | 303 | 4 | 1.0 | 1024x1024 | 20.2s | 14939 MiB (15528 peak) | green 0.00% / clip 0.8% | - | S1_303_box_00001_.png |
| kv | zeroed | S2 | 101 | 4 | 1.0 | 1024x1024 | 28.1s | 14972 MiB (15561 peak) | green 0.00% / clip 0.1% | +2.842 / +1.578 / -0.044 | S2_101_box_00001_.png |
| kv | zeroed | S2 | 202 | 4 | 1.0 | 1024x1024 | 28.2s | 15204 MiB (15793 peak) | green 0.00% / clip 0.1% | -1.946 / -0.301 / -0.072 | S2_202_box_00001_.png |
| kv | zeroed | S2 | 303 | 4 | 1.0 | 1024x1024 | 28.1s | 15195 MiB (15784 peak) | green 0.00% / clip 0.2% | +10.069 / +1.633 / -0.052 | S2_303_box_00001_.png |
| kv | zeroed | S3 | 101 | 4 | 1.0 | 1024x1024 | 20.1s | 15035 MiB (15624 peak) | green 0.00% / clip 0.3% | - | S3_101_box_00001_.png |
| kv | zeroed | S3 | 202 | 4 | 1.0 | 1024x1024 | 20.3s | 15104 MiB (15693 peak) | green 0.00% / clip 0.2% | - | S3_202_box_00001_.png |
| kv | zeroed | S3 | 303 | 4 | 1.0 | 1024x1024 | 20.3s | 15036 MiB (15625 peak) | green 0.00% / clip 0.3% | - | S3_303_box_00001_.png |

### S2 placement, scored by eye (contact sheet)

| arm | seed 101 | seed 202 | seed 303 | man placed |
|---|---|---|---|---|
| base | duplicate woman | duplicate woman | duplicate woman | **0/3** |
| turbo-100 | no-op | **man** | **man** | **2/3** |
| turbo-070 | no-op | **man** | no-op | 1/3 |
| turbo-035 | duplicate woman | **man** | duplicate woman | 1/3 |
| distilled | **man** | no-op | **man** | **2/3** |
| kv | **man** + duplicate figure | **man** | duplicate woman | **2/3** |

"duplicate woman" = the arm ignored image 2 and copied the plate's own subject into the mask.
"no-op" = the masked region came back as plain road, nothing placed.

**A rectangular seam is present on essentially every row** - a pale patch of the reference's
plain grey studio background inside the mask, with the horizon stepping at the box edges. It is
a property of the scenario, not a discriminator between arms.

---

## SUPERSEDED - wf_type 4 + ELLIPSE mask (`_v2_`)

S2 rows here are superseded: the oval hid the seam the box exposes. **S1 and S3 rows are VALID**
- neither uses a mask - and `base` S1/S3 exist only here.

| candidate | negative | scenario | seed | steps | cfg | out-res | wall | VRAM | guard | seam 0-32 signed | output |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base | real | S1 | 101 | 20 | 5.0 | 1024x1024 | 118.9s | 15080 MiB (15826 peak) | green 0.00% / clip 1.6% | - | S1_101_v2_00001_.png |
| base | real | S1 | 202 | 20 | 5.0 | 1024x1024 | 114.7s | 14657 MiB (15417 peak) | green 0.00% / clip 1.7% | - | S1_202_v2_00001_.png |
| base | real | S1 | 303 | 20 | 5.0 | 1024x1024 | 114.8s | 15077 MiB (15860 peak) | green 0.00% / clip 3.1% | - | S1_303_v2_00001_.png |
| base | real | S2 | 101 | 20 | 5.0 | 1024x1024 | 193.2s | 14686 MiB (15373 peak) | green 0.00% / clip 0.1% | -4.518 / -1.684 / -0.042 | S2_101_v2_00001_.png |
| base | real | S2 | 202 | 20 | 5.0 | 1024x1024 | 195.0s | 14176 MiB (14827 peak) | green 0.00% / clip 0.2% | +1.714 / -1.361 / -0.048 | S2_202_v2_00001_.png |
| base | real | S2 | 303 | 20 | 5.0 | 1024x1024 | 195.0s | 15264 MiB (15937 peak) | green 0.00% / clip 0.2% | +4.691 / -0.322 / -0.041 | S2_303_v2_00001_.png |
| base | real | S3 | 101 | 20 | 5.0 | 1024x1024 | 116.6s | 15166 MiB (15900 peak) | green 0.00% / clip 0.0% | - | S3_101_v2_00001_.png |
| base | real | S3 | 202 | 20 | 5.0 | 1024x1024 | 116.8s | 15035 MiB (15724 peak) | green 0.00% / clip 0.0% | - | S3_202_v2_00001_.png |
| base | real | S3 | 303 | 20 | 5.0 | 1024x1024 | 114.8s | 15192 MiB (15884 peak) | green 0.00% / clip 0.0% | - | S3_303_v2_00001_.png |
| turbo-100 | zeroed | S1 | 101 | 8 | 1.0 | 1024x1024 | 34.2s | 14574 MiB (15237 peak) | green 0.00% / clip 1.4% | - | S1_101_v2_00001_.png |
| turbo-100 | zeroed | S1 | 202 | 8 | 1.0 | 1024x1024 | 32.2s | 14536 MiB (15207 peak) | green 0.00% / clip 1.3% | - | S1_202_v2_00001_.png |
| distilled | zeroed | S2 | 101 | 4 | 1.0 | 1024x1024 | 28.6s | 15046 MiB (15840 peak) | green 0.00% / clip 0.1% | +4.206 / +0.935 / -0.024 | S2_101_v2_00001_.png |

---

## VOID - wf_type 5 inpaint branch (`_p2_`, `S2R`)

Kept for the record only. `wf_type` 5 green-fills the mask and depends on node **259**, the
**flux2-klein-4b-outpaint LoRA at strength 1.1**, to regenerate that fill. That LoRA is 4B,
cannot apply to a 9B base, and was bypassed by the bench - so these runs are the branch minus
the component it is built around. The green that survived was the missing LoRA, not a weight
verdict, not a seed effect and not a step count. Never bench a 9B arm on branch 5.

| candidate | negative | scenario | seed | steps | cfg | out-res | wall | VRAM | guard | seam 0-32 signed | output |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base | real | S1 | 101 | 20 | 5.0 | 1024x1024 | 114.6s | 14522 MiB (15698 peak) | green 0.00% / clip 1.6% | - | S1_101_p2_00001_.png |
| base | real | S2R | 101 | 20 | 5.0 | 1024x1024 | 62.4s | 14628 MiB (15423 peak) | green 10.75% / clip 2.0% | -30.487 / -0.903 / +0.955 | S2R_101_p2_00001_.png |
| base | real | S2R | 202 | 20 | 5.0 | 1024x1024 | 62.3s | 14641 MiB (15799 peak) | green 8.50% / clip 0.2% | +5.242 / +3.669 / -3.439 | S2R_202_p2_00001_.png |
| base | real | S2R | 303 | 20 | 5.0 | 1024x1024 | 62.6s | 14259 MiB (15774 peak) | green 10.73% / clip 2.2% | -27.286 / -1.021 / -1.620 | S2R_303_p2_00001_.png |
| turbo-100 | zeroed | S2R | 101 | 8 | 1.0 | 1024x1024 | 28.1s | 15062 MiB (15786 peak) | green 0.00% / clip 0.2% | -16.955 / -4.752 / +0.304 | S2R_101_p2_00001_.png |
| turbo-100 | zeroed | S2R | 202 | 8 | 1.0 | 1024x1024 | 26.2s | 14894 MiB (15634 peak) | green 0.04% / clip 3.4% | -17.674 / -3.603 / -0.970 | S2R_202_p2_00001_.png |
| turbo-100 | zeroed | S2R | 303 | 8 | 1.0 | 1024x1024 | 26.3s | 14890 MiB (15676 peak) | green 10.77% / clip 3.4% | -37.671 / -5.153 / -1.096 | S2R_303_p2_00001_.png |
| turbo-070 | real | S2R | 101 | 10 | 1.5 | 1024x1024 | 40.5s | 14817 MiB (15589 peak) | green 5.85% / clip 2.4% | -13.619 / -8.981 / -3.812 | S2R_101_p2_00001_.png |
| turbo-070 | real | S2R | 202 | 10 | 1.5 | 1024x1024 | 40.2s | 15023 MiB (15852 peak) | green 5.85% / clip 1.8% | -8.830 / -4.120 / -2.409 | S2R_202_p2_00001_.png |
| turbo-070 | real | S2R | 303 | 10 | 1.5 | 1024x1024 | 40.9s | 14934 MiB (15768 peak) | green 10.86% / clip 3.4% | -39.137 / -6.568 / -1.871 | S2R_303_p2_00001_.png |
| turbo-035 | real | S2R | 101 | 8 | 3.5 | 1024x1024 | 34.7s | 14471 MiB (15266 peak) | green 4.72% / clip 1.8% | +0.053 / -0.644 / -1.294 | S2R_101_p2_00001_.png |
| turbo-035 | real | S2R | 202 | 8 | 3.5 | 1024x1024 | 34.6s | 14609 MiB (15376 peak) | green 6.59% / clip 1.5% | -3.085 / -3.469 / -5.302 | S2R_202_p2_00001_.png |
| turbo-035 | real | S2R | 303 | 8 | 3.5 | 1024x1024 | 36.2s | 14487 MiB (15269 peak) | green 10.81% / clip 3.2% | -33.637 / -4.929 / -2.343 | S2R_303_p2_00001_.png |
| distilled | zeroed | S2R | 101 | 4 | 1.0 | 1024x1024 | 22.2s | 14812 MiB (15687 peak) | green 0.00% / clip 0.2% | -9.882 / +1.731 / +3.910 | S2R_101_p2_00001_.png |
| distilled | zeroed | S2R | 202 | 4 | 1.0 | 1024x1024 | 20.2s | 15025 MiB (15842 peak) | green 0.34% / clip 0.5% | +4.554 / +3.441 / +3.395 | S2R_202_p2_00001_.png |
| distilled | zeroed | S2R | 303 | 4 | 1.0 | 1024x1024 | 20.4s | 14974 MiB (15783 peak) | green 10.71% / clip 0.4% | -34.919 / -1.398 / +2.007 | S2R_303_p2_00001_.png |
