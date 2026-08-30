# MPI-561 — The controls a generation actually used

Umbrella created by the consolidation sweep, 2026-08-14. Two `todo` cards, one question:
**what settings did this run really use, and can anything else recover them?** Today the
answer is written down wrong, and MPI-547 is explicitly blocked on that.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-556 | A generation's sidecar records the PROJECT's controls, not the controls the run actually used — so Reuse restores a lie |
| MPI-547 | Agent generations cannot set PromptBox parameters — add a named-parameter layer to `generation.submit` |

## Current State

**Phase 1 is DONE and closed (2026-08-30). MPI-556 is `done`, verified live.** A krea2 run
dispatched with raw `Input_Style_Selector` keys and forced to 1k, in a project seeded to 2k,
records the RUN in its sidecar and reuses as Soft Water Color / 0.65 / 1k — evidence in
`tasks/MPI-556/validation.md`.

**MPI-547 is unblocked.** Phase 2 can start: the named-parameter layer now inherits a
snapshot that describes what ran, so a phase-2 generation survives a Reuse round trip.
One thing to carry into it: a control that MAPS its value rather than passing it through
(`controlType`: id → index) is DROPPED from the snapshot rather than recorded wrong. If
phase 2 wants that one reused, it needs a named parameter of its own, not more snapshot
machinery.

Original framing, kept because it is why this umbrella exists: **MPI-547 is BLOCKED BY
MPI-556**, found 2026-08-13 during MPI-546's live verification and recorded on both cards.
That dependency is not a soft preference about ordering.

MPI-556 is proven live, both halves, on 2026-08-13:

- `t2i_007` (klein-4b) was generated through `POST /connector/generate` with raw injection
  keys `Input_Style_Selector.selector=7` (Vintage) and `.strength_model=0.65`. The image is
  visibly styled. Its sidecar records `controlState.model = {styleSelect: 0, stylization: 1}`
  and Reuse restored Style=None — that card cannot be reproduced from the app.
- `t2i_006` (krea2) ran correctly at 1k, but its sidecar records
  `controlState.shared.ratioSelector.qualityTier = "1k"` AND
  `controlState.model.qualityTier = "2k"`, because `_ms` (modelSettings) is cloned in
  wholesale and real projects carry a stale per-model `qualityTier` there. After reuse the
  QUALITY toggle read 2K against a 1K card.

## Why one card and not two

Because the second card cannot ship correctly without the first, and shipping it anyway
manufactures unreproducible history at scale.

`_snapshotControlState` (`js/services/generationService.js:424-460`) builds the sidecar from
the project's saved settings and reconciles exactly TWO things against the run's real
`injectionParams`: ratio and batch. Everything else is recorded as whatever the project
happened to hold. Raw `injectionParams` is the documented escape hatch and **always wins
over resolved values** — so any named-parameter layer built on top inherits the same gap.
MPI-547's whole point is an agent choosing settings that differ from the open project,
which is precisely the case the snapshot gets wrong.

The second half is a known trap, already documented: `js/data/projectModel.js` — `qualityTier`
is SHARED state and the `modelSettings` copy is leftover. `agentDispatch._plannedSize`
already refuses to read it. The snapshot does not, so the stale value is preserved into
every sidecar and handed to Reuse.

## Phase 1: Make the sidecar describe the run (MPI-556)

Fix `_snapshotControlState` so the recorded `controlState` reflects what was injected.

**The design call, and it is open.** The existing `ponytail:` comment above the function
names one upgrade path — snapshot from the controls' own `getValue()`, Flow-style, which
needs a `ratioSelector` compound-key remap. The alternative is reconciling per injected key:
smaller, but it keeps the hand-maintained list the comment was trying to avoid. Weigh both
before writing; do not extend the two-key reconcile to three and call it done.

Whichever wins, the stale `modelSettings.qualityTier` must stop reaching the sidecar.

## Phase 2: The named-parameter layer (MPI-547)

Only after phase 1. An agent is asked for a specific generation with specific settings on a
specific model, and can do it: ratio, resolution, quality tier, turbo, style, batch.

**No UI reflection required** — the PromptBox does not need to change to match, per Fabio
2026-08-12. Do not widen the scope into syncing the open project's controls.

## Verification

Phase 1: re-run the two proven cases. Generate through `POST /connector/generate` with raw
`Input_Style_Selector` keys, then Reuse — the restored Style and Stylization match the image.
Generate at 1k in a project carrying a stale per-model `qualityTier` — the sidecar records
1k in both places and the QUALITY toggle reads 1K after reuse.

Phase 2: an agent-submitted generation with explicitly named parameters produces the right
image AND survives a Reuse round trip with those same parameters. A phase-2 generation that
cannot be reused is a phase-1 regression, not a phase-2 feature gap.

## Parallel Batch

**None.** Strictly ordered, and both members own `js/services/generationService.js`.
MPI-556 additionally owns `js/utils/promptReuse.js` (from its `files.json`). Derive
ownership from each member's `files.json` at dispatch time, not from this list.

## Plan Drift

- **2026-08-30 — phase 1 took neither of the two designs this plan weighed.** "Snapshot from
  `getValue()`" and "reconcile per injected key" both assume the snapshot has to KNOW the
  mapping. It does not: every control already owns its injection map, so
  `reconcileControlsFromInjection` asks the control what its recorded value would have
  injected, and round-trips the run's injected value back through the same function to
  recover what actually ran. No hand-maintained list, no `ratioSelector` compound-key remap,
  and a PromptBox dispatch reconciles to a provable no-op. A control that MAPS its value
  rather than passing it through (`controlType`: id → index) cannot be inverted and is
  DROPPED — absent leaves Reuse on the current value, wrong fabricates history.
- **2026-08-30 — the `qualityTier` half was diagnosed backwards on the card.** The card says
  the SHARED copy is live and `modelSettings.qualityTier` is leftover. As of SCHEMA 4 /
  MPI-133 it is the other way round: the tier control mounts from the per-model bucket and
  only falls back to `shared.ratioSelector.qualityTier` for unmigrated projects, and
  `buildPromptReuseSettings` prefers the model bucket too — which is why the project's 2k
  won over the run's 1k. `js/data/projectModel.js:402` still documents the old shape and is
  the stale comment. Neither copy is leftover in practice, so the snapshot now writes BOTH
  from the size the run shipped at.
- **2026-08-30 — `_snapshotControlState` is now exported** from `js/services/generationService.js`,
  for `tests/control-snapshot-injection.test.cjs` only. It is what lets the two live-proven
  cases be checked end to end without a GPU.
