# MPI-343 — Model upgrade evaluation queue

Promoted to an umbrella by the consolidation sweep, 2026-08-14. This card was already the
queue in prose — it absorbed MPI-339 on 2026-08-01 and MPI-518 declared itself a member on
2026-08-10 — but it carried no plan, so the membership was invisible to the board.

**Research only, LOW PRIORITY.** Nothing here is wiring work. Every entry answers the same
question — *is this newer or alternative weight actually worth shipping?* — by the same
method: read the source, check the licence flags, weigh size and quality against what we
already ship, then decide REPLACE vs ADD vs DROP on a measured delta, never on novelty.

**The member card stays on the board.** Nothing was closed, merged or deleted to make
this. Close it when its entry is answered, and say so in the card.

## Members

| Card | What it is |
|---|---|
| MPI-518 | The H3 `w4a8_mixed` DiTs — fl2va 12.54 GB / ref2va 11.77 GB vs 20.97 GB `int8_convrot` each. `blocked` |

Two more entries live on this card itself, not as separate cards (MPI-339 was absorbed
2026-08-01 for exactly this reason — one card keeps the shortlist in one place instead of
leaking a card per candidate weight):

| Entry | What it is |
|---|---|
| PiD 1.5 | ComfyUI v0.28.0 lists "Support PID 1.5 models" (#14894), a newer generation of the PixelDiT upscaler we ship as `nvidia-pid` |
| NSFW LTX 2.3 | CivitAI 10Eros LTX 2.3, plus an int8 conv-rot build and a DMD workflow; a possibly-better `sulp` variant is also linked |

## Current State

Nothing measured. All three entries are open questions.

MPI-518 is `blocked` on the 1.4 release and on GPU availability (a Cubric-Prompt agent has
the card). Fabio ran ONE generation with the fl2va build and did NOT see much speed
difference, so the win is unproven — that single data point is the reason to investigate,
not a result.

## Why one card and not four

Same question, same method, and they queue behind each other anyway. Splitting them means
re-deriving the evaluation method per candidate weight and losing the shortlist. MPI-518's
own card says this: *"a separate investigation would re-derive the same method."*

## The method (applies to every entry)

1. **Read the source and the licence flags first.** Territory-restricted licences exist and
   an ungated weight is not an open licence — the bar can cover Outputs, not just weights.
   CivitAI lookups need Fabio's VPN on (UK region block); ask, run, then tell him so he can
   turn it off. Do the CivitAI half BEFORE any R2 work — the VPN throttles uploads ~15x.
2. **Measure, do not eyeball.** n=1 is not a measurement. Same seed + same graph is
   `execution_cached`, and a model-side widget change costs a ~19 s re-patch — a first run
   after a change is not warm. Three known ways to get a confident wrong number.
3. **Decide REPLACE vs ADD explicitly.** Replacing means re-uploading to R2 and every
   existing user re-downloading. That is a product cost, not a detail.
4. **Never delete the dep entry** when something is retired — the orphan sweep reads `DEPS`,
   so deleting it strands the weight on existing users' disks forever. MPI-470 and MPI-466
   both kept theirs.

## Entry: MPI-518 — H3 w4a8_mixed

Kijai's builds are roughly HALF the size of what we ship. Answer: is there a real
speed/VRAM win at equal quality, and if so where does it land — the likely home is the Model
Library quality tier, not a replacement. Unblock needs the GPU back and 1.4 out.

## Entry: PiD 1.5

Answer before any wiring: what changed in 1.5 (quality / steps / speed / VRAM); whether the
four-checkpoint structure holds (a drop-in weight swap, or a workflow + `Input_Type` change);
whether it needs ComfyUI >= 0.28, i.e. gated behind MPI-342; and REPLACE vs ADD, at ~2.7 GB
per leg re-uploaded to R2.

Today's `nvidia-pid` is one model with four VAE-locked 1024→4096 4-step bf16 checkpoints at
2.72 GB each, selected at runtime via `Input_Type` — **compat is the VAE latent space, not
the model name** (MPI-182).

Two live cross-references that change the shape of this entry, both created after it was
written: `nvidia-pid` is being converted into four upscale-dropdown plugins under MPI-553,
and its `ModelDef` is scheduled for removal on 1.5 (MPI-515). Evaluate PiD 1.5 against that
destination, not against today's model picker. Separately, `nvidia-pid` is a `requiredModel`
of the sdxl-4k test flow that MPI-332 rips — **the flow's fate is not the model's**.

## Entry: NSFW LTX 2.3

Read the licence flags first; this is the entry most likely to fail on licensing rather than
on quality. Same measured-delta bar as the others.

## Verification

An entry is answered when it has a written REPLACE / ADD / DROP decision backed by a measured
delta (not one generation) and a licence check. A "no" is a complete answer and closes the
entry.

## Parallel Batch

Entries are independent and could run as a batch, but each one wants a GPU and none is
urgent — cost, not correctness, is the reason to run them one at a time. Derive ownership
from each member's `files.json` at dispatch time, not from this list.

## Plan Drift

(none yet)
