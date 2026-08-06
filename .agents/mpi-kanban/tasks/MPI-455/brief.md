# MPI-455 Brief

## Why this exists

Found 2026-08-06 while giving MiniMax H3 an end-frame-only branch (MPI-449). The question
"does LTX already do this and we missed it?" was checked against source, and the answer is:
**the model does, the workflow does not.**

## The mechanism (verified from the shipped workflow, not docs)

`comfy_workflows/ltx_i2v.json` conditions images with **`LTXVAddGuide`**, which takes a
**`frame_idx`**:

| node | title | frame_idx |
|---|---|---|
| 321 | FLF AddGuide First (S1) | `0` |
| 322 | FLF AddGuide Last (S1) | `-1` |
| 323 | FLF AddGuide First (S2) | `0` |
| 324 | FLF AddGuide Last (S2) | `-1` |

`frame_idx` is an ARBITRARY index. LTX is therefore MORE capable here than H3, which has two
fixed optional slots (`first_frame` / `last_frame`): LTX can condition on a middle frame, or
on several frames at once. End-frame-only is just the Last guide without the First one — the
same node at the same index, one branch removed.

## Why it is unreachable today

Gating is two EXPLICIT user booleans, `Input_Text_to_video` (314) and `Input_Use_End_Image`
(313), and the FLF path always includes the First guide:

| Text_to_video | Use_End_Image | result |
|---|---|---|
| true | — | t2v |
| false | false | i2v (start frame) |
| false | true | FLF (start AND end) |

No row reaches end-only. Both `Input_Start_Frame` (474) and `Input_End_Frame` (473) are
`MpiLoadImageFromPath` with `block_if_empty: true`, so a missing start frame on the FLF path
is an ExecutionBlocker, not a graceful fallback.

## Do it the H3 way

H3 (MPI-449, shipped in the bench `h3_i2v.json` on 2026-08-06) derives its mode from WHICH
images are present rather than from toggles — `has_img1` / `has_img2` feed a chain of lazy
`MpiIfElse` switches, so t2v / i2v / first+last / last-only are all reachable and no illegal
combination exists. LTX should adopt that shape rather than gain a third boolean. The
switches must stay LAZY (`MpiIfElse` already is) so unselected branches never execute — with
LTX that matters doubly, since each branch drags its own guide chain.

## UI

One button, shared with H3, NOT reimplemented: when the prompt box holds exactly ONE image
chip, the button chooses start-frame or end-frame. Two chips = first+last, no button. Zero
chips = t2v, no button.

**Trap:** the routing reads which SLOT the image occupies. A single end-frame image must
arrive as img2 with img1 empty. If it lands in img1 carrying an "is end frame" flag, the
graph routes it to i2v and silently uses it as a start frame.

## Scope note

`ltx_i2v.json` has fp8 / mxfp8 / stage2 siblings (6 files). Whatever changes here must sweep
all of them — a one-file fix on a multi-variant workflow family is a false done. Related:
MPI-449 found the `_stage2` twins may be collapsible now that lazy gates work, which would
shrink this sweep. Check that before editing six files by hand.

## The honest risk

Structurally valid is NOT proof it works. Guide strength is 0.7 and video models are trained
predominantly on first-frame conditioning, so end-only may look bad. Run one and judge before
building UI for it. Closing this card `rejected` with the finding written down is a perfectly
good outcome.
