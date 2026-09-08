# MPI-619 — Klein 4B and 9B are two models, not two tiers

Fabio, 2026-08-25, after tracing MPI-614 back to its cause:

> *"The problem is that when we released Klein 4B, we didn't call it Klein 4B, and we should
> have. Now that we released Klein 9B, agents decided to just give it different tiers, and
> that's it. People know these models by their name, which is extremely confusing for a user
> who already heard about Klein 4B and Klein 9B."*

## What was wrong

Both cards carried `name: 'FLUX.2 Klein'`. Three surfaces papered over the collision with a
`sizeTier` letter — `L` for 4B, `B` for 9B — so the app read **"FLUX.2 Klein L"** and
**"FLUX.2 Klein B"**. Nobody outside this repo calls them that.

The 9B card's own comment argued the two *"ARE genuine SIZE TIERS of one model"*. True of the
architecture, false of the product: the public knows them as Klein 4B and Klein 9B, and —
the practical test — **their LoRAs do not interchange**. A 9B style LoRA on a 4B run has every
key rejected and the generation still finishes green (MPI-614). Calling them one model in two
speeds is what made that mis-pick reasonable.

## The fix

Two string literals in `js/data/modelConstants/models.js`:

```
klein-4b   name: 'FLUX.2 Klein'  ->  'FLUX.2 Klein 4B'
klein-9b   name: 'FLUX.2 Klein'  ->  'FLUX.2 Klein 9B'
```

Nothing else. `model.name` is display-only — models are keyed by `id` through
`getModelById`, and a repo-wide sweep found no name-based lookup — so the rename cannot
reach a resolver, a project file, or a graph.

**The tier letters then remove themselves.** Both disambiguators are gated on a name clash:

- `tierLetterFor` (prompt box, gallery grid) tests `other.name === model.name`
- `MpiFlowLibrary._label` computes `clashes` the same way

Distinct names => no clash => no letter. No branch had to be edited, and the mechanism stays
alive for the siblings that genuinely need it.

## Why only Klein

Three name groups collided. Only one was wrong:

| name | cards | verdict |
|---|---|---|
| **FLUX.2 Klein** | `klein-4b`, `klein-9b` | **two distinct models** — renamed |
| Boogu Image Edit | `boogu-edit-high`, `boogu-edit-balanced` | one model, two qualities — letter is right, left alone |
| LTX 2.3 | `ltx-23`, `ltx-23-balanced` | one model, two qualities — letter is right, left alone |

The distinction that decides it: **do the two share LoRAs?** Boogu and LTX siblings do. Klein's
do not, which is exactly why the shared name was dangerous rather than merely vague.

## Relationship to MPI-614

MPI-614 (a cross-tier LoRA binds nothing and the run reports success) has one recorded
occurrence, and this rename removes the condition that produced it: the user could not see
which tier was loaded. It does **not** make 614 redundant — a corrupt or foreign LoRA still
fails in total silence — but it demotes it from urgent to worth-doing. 614 was moved back to
`todo` when this card took over the session.

## Related

- **MPI-617** — the umbrella this sits under
- **MPI-614** — the silent-bind bug this prevents the common case of
- **MPI-567** — added the picker's tier letter, using Klein as its motivating example
- **MPI-598** — added the 9B card and the `modelFamily` key
