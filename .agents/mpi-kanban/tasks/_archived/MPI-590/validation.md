# MPI-590 — validation

Commit `492f2a95`. Scoped by Fabio on dispatch: **Character Sheet only, Krea 2 vs Krea 2 NSFW
only.** Other models in other flows are a later card — the shape is generic (any-of set +
`modelParams`), but only one FlowDef declares one.

## What was proven, and how

| Claim | Evidence |
|---|---|
| An any-of set is satisfied by EITHER member | `tests/flow-model-choice.test.cjs`, real modules imported bare with `state.s_installedModelIds` staged |
| Every other flow gates exactly as before | Same file — every plain-string entry across `listFlows()` resolves to itself |
| The picker appears only with >1 installed member | Same file, plus live: with only `krea2` the drawer showed no dropdown |
| The pick reaches the injection params AND the LoRA rack | Same file; live click on "Krea 2 NSFW" flipped the required row, the resolved ids, `flowModelParams` (lustify + bypass 0) and `flowSettingsModel` |
| The picked weight can actually be INJECTED | Node 55 is titled `Input_Base_Model`; the test asserts the title exists in the graph, that `unet_name` is on the injector's spray list, that the `Title.widget` branch exists, and that both target widgets are widgets (not links) |
| The guard is load-bearing | **Mutation-checked**: node 55's title restored to `Load Diffusion Model` → 2 tests red, exit 1. File restored in `finally` |
| Nothing else regressed | 655/655 node, 24/24 desktop, eslint `--max-warnings=0` on every touched file, `release:check` |

Live probe ran on an isolated instance (`npm run app:isolated`, own port + profile), with
`s_installedModelIds` staged to hold both Krea 2 cards. The user's app was never touched.

## The residual — CLOSED by the user, 2026-08-20

Fabio installed `krea2-nsfw` on his own engine and ran it: the picker appeared with both
options, he ran several sheets on the NSFW arm and cancelled several mid-run. All good. That is
the end-to-end proof the local harness could not give — a graph that loaded the wrong
transformer would not have produced NSFW-bake output, and cancels exercised the queue path too.

**One finding, not a bug:** the NSFW bake is materially weaker at **anime / stylised** subjects.
Lustify is trained heavily on photoreal source. Fabio's call: "it is what it is." Recorded in
`docs/models/krea2/README.md` (Cards row) so the next person does not re-diagnose it as a
wiring fault — steer a stylised prompt to `krea2`.

## Also in this commit

MpiFlowLibrary's single MPI-588 warning (the drawer close `<button>`) is cleared, not bypassed —
the pre-commit hook blocks any commit touching the file otherwise, which is exactly the landmine
MPI-588 was carded for. It is now a ghost MpiButton mounted in setup, keeping its id and the
shared `.mpi-detail__close` class; two scoped CSS rules hold it at the Model Library twin's 28px
box and 13px glyph (measured live — the Primitive's icon-only rules win otherwise). MPI-588's
table should drop this file: **26 warnings across 11 files** (measured at close-out with `npx eslint js/ -f json`, not derived from the card table — that table still counts MpiProjectName, which MPI-589 cleared).

## Release note owed

User-visible now that Flows are un-gated (MPI-589). Copy for whichever version ships next:
*"Character Sheet now runs on either Krea 2 or Krea 2 NSFW — pick which one in the Flows panel
before you open it. If you only have one of them installed, it just uses that one."*
