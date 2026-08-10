# MPI-528 — The licensing surface

Umbrella created by the consolidation sweep, 2026-08-10. Two `todo` cards, one surface:
**third-party licence metadata turned into app behaviour, displayed in the Model Library.**

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-357 | Gated models: licence-verified install for non-commercial weights (Klein 9B first). **Half already shipped as MPI-451** — read the card's 2026-08-09 audit note before planning |
| MPI-358 | Attribution sweep: credit every shipped LoRA whose creator asks for it (`allowNoCredit: false`) |

## Current State

Not started as a pair. MPI-357's descriptor-driven per-model licence gate shipped under
MPI-451; only the remainder is open, and the card says which. MPI-358 is at `idea`.

## Why one card and not two

Both cards read licence metadata from an upstream (Hugging Face for 357, CivitAI's
by-hash lookup for 358), both must render the result in the Model Library, and both are
subject to the same environmental constraint: **CivitAI region-blocks the UK, so the hash
lookups need Fabio's VPN on** — ask, wait, run, then tell him so he can turn it off. And
the VPN skews the system clock by hours, which corrupts any timestamp written while it is
up (CLAUDE.md § "VPN + the skewed clock" carries the offset-derivation recipe).

Running these separately means paying that VPN round-trip twice and designing the same
"where does licence info live on a model tile" question twice.

Read `docs/model-library.md` before touching the display half.

## Phase 1: Harvest, once, with the VPN up

Do the whole metadata sweep in one VPN window: MPI-358's `allowNoCredit: false` hunt across
every LoRA dep we host (Klein styles + turbo + NSFW, Krea2 styles, Qwen-Edit Lightning,
LTX, SDXL), plus whatever MPI-357's remainder still needs from upstream. Method proven on
MPI-354, 2026-07-26: `GET /api/v1/model-versions/by-hash/<sha256>` → `modelId` → the model
endpoint for the permission flags.

Land the result as DATA in the repo, not as a live lookup — the app must never need the VPN.

Check for `REGION_BLOCKED` before concluding an API changed; the block reads as
intermittent (bare on 2026-07-26, VPN-needed on 2026-07-27).

## Phase 2: The two behaviours

Then split: MPI-357's gate (accept upstream → prove acceptance → unlock our R2 download)
and MPI-358's credit display. Different code, shared data from phase 1.

Worth carrying from memory `project_model_licences_can_be_territory_restricted`: ungated
weights are not an open licence, some bars cover **Outputs** and not just weights, and a
flow-down obligation is a product feature, not a footnote.

## Verification

Phase 1: the harvested table lists every hosted LoRA with a resolved flag, and the count
matches the dep files. Phase 2: install a gated model end to end without the VPN, and see
a credited LoRA's attribution in the Model Library.

## Parallel Batch

Not in phase 1 — it is one network sweep behind one VPN window, and concurrent agents
would each pay it. Phase 2's two halves are separable; derive ownership from each member's
`files.json` at that point.

## Plan Drift

(none yet)
