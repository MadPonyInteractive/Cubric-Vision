# MPI-547 Brief

## In one line

An agent can dispatch a generation (MPI-546) but cannot choose its settings — add a
named-parameter layer so it can pick ratio, resolution, quality tier, turbo, style and
batch per generation.

## The test that closes this card

Fabio restarts the app, asks the agent for **a specific generation with specific
settings on a specific model**, and gets exactly that. The PromptBox does not need to
change to match.

## Start here

1. `plan.md` in this folder — locked decisions, the 22-control surface, phases.
2. `js/shell/agentDispatch.js` `_plannedSize()` — the worked example. It already
   resolves the project's saved ratio and injects `Width`/`Height`; this card
   generalises that seam to the rest of the controls.
3. `.agents/mpi-kanban/tasks/MPI-546/validation.md` — three bugs that all returned
   `ok: true`. Read before trusting any API-level check on this card.

## The one thing to not get wrong

Do not reimplement the ratio/tier resolution inside `agentDispatch`. It must be
extracted and shared with the PromptBox, or the two drift the first time a model's
ratio table changes. `krea2` 1k and 2k are completely different pixel sets, and
`qualityTier` lives in the SHARED bucket while a stale copy also sits in
`modelSettings[id]`.

## Needs a decision before building

Which of the 22 PromptBox controls are in v1. Recommendation in `plan.md`; ask Fabio
rather than silently doing all of them.
