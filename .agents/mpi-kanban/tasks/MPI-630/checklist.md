# MPI-630 Checklist

- [x] Verify the premise on the Pod path BEFORE touching anything (close as rejected if any pack pip install survives)
- [x] Remove `pipPins` from every entry in `js/data/modelConstants/nodesDeps.js`
- [x] Delete the `installRequirements:true => pipPins` invariant test and its cross-node conflict sibling (`tests/node-drift.test.cjs`)
- [x] Drop the pipPins assertions from `tests/controlnet-aux-torch-guard.test.cjs`
- [x] Fix the stale `pipPins` comment at `routes/downloadManager.js:2625`
- [x] `node scripts/compile-node-deps.mjs --check` still passes (curated set covers everything)
- [x] Full test run green
- [x] Docs swept (`docs/download-manager.md`, `docs/playbooks/add-model/02-dependencies-r2.md`)
