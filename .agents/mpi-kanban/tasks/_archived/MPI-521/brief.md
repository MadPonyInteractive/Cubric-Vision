# MPI-521 - Memory reorg: the oldest entries into docs/ and rules

Fabio, 2026-08-10: reorganise agent memory oldest-first, moving durable knowledge out of
private memory and into `docs/` / `.claude/rules/`, where the repo can see it and a sweep can
verify it. Memory keeps only who Fabio is, how I should work, in-flight state, cross-project
strategy, and how to drive the environment.

## What moved (12 memory files deleted)

Migrated, then deleted:

- **no seed UI, ever** -> `docs/PROJECT.md` invariant 14. Random seed per gen
  (`comfyController.generateRandomSeed()`), stored on the item for provenance, never surfaced;
  grep confirms seed appears only under `js/services/`, never in `js/components/`.
- **A/B a LoRA with strength, not bypass** -> `docs/builder/05-author-and-test.md`.
- **knob values are the user's, structure is the agent's** -> same doc, the cooperative loop.
- **a RunPod test never proves the local branch** -> `.claude/rules/comfy_engine.md` Engine
  Split, anchored on `routes/engine.js` `_provisionUvEngine` (line 319) and the win32 gate (76).
- **ComfyUI bump cadence** -> `docs/playbooks/bump-engine/README.md` (why a bump is structural,
  pin to the highest floor the model wave demands); the `PIP_CONSTRAINT` + `PIP_EXTRA_INDEX_URL`
  pair -> `docs/builder/02-image-and-rebuild.md`. The Krea2Edit-breaks-at-0.29 warning was spent:
  the pin is `223a9383` and core is `v0.31.0`.

Deleted as duplicates of an existing doc (verified line by line before deleting): seed
replication for cfg sweeps and sampler-verdicts-are-graph-scoped (both already in
`docs/models/krea2/samplers.md`), agent-can-upload-R2 (MadPony `capabilities/cloudflare-r2/`),
and four sibling-repo strategy files whose content lives in `Cubric-Studio/README.md`,
its `docs/agentic-orchestration-vision.md`, and `Cubric-Prompt/DIRECTION.md`.

## Drift the migration exposed

- `docs/releases/portable-distribution-contract.md` still said Vision was **manifest-only** and
  asserted `metadata.manifestOnly === true`. Vision has been a **live connector responder**
  since MPI-5 (`services/brokerBoot.js`, `services/connectorResponder.js`), the shipped manifest
  says `manifestOnly: false`, and the build asserts the `system.memory.release` capability. The
  section now states current truth, keeps the ownership boundary, and explains why
  `assertNoDanglingSymlinks` sweeps the whole staged tree (MPI-416).
- `docs/PROJECT.md` pointed at `js/utils/seed.js`, which does not exist.
- Two `[[...]]` backlinks survived the 2026-08-07 sweep (`docs/models/krea2/int8-quant.md`,
  `docs/models/h3/ref2va.md`), contradicting the invariant stated in `docs/README.md`. Healed.
- `docs/playbooks/bump-engine/README.md` cited a memory file by name; the point is inlined now.

## What deliberately stayed in memory

Process/behaviour lessons with no docs home (test the user's instinct first, measure thresholds,
behaviour-not-code, test-must-mirror-production-shape, read DevTools before theorising, label
eyeballed readings as estimates) and environment technique (`tool_*`), which `docs/README.md`
explicitly names as memory's job.
