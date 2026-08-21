# Validation - MPI-521

- `grep -rn "\[\[" docs/ .claude/rules/ --include=*.md` (minus `docs/archive/` and the
  `latent_shapes` literal) returns **only the two deliberate examples in `docs/README.md`**,
  which is exactly what that section claims. Two real strays were healed to get there.
- Dangling-link sweep across the 89 surviving memory files: 0 broken `](file.md)` targets and
  0 broken `[[name]]` links (the single `[[memory]]` hit is prose about the pattern itself).
- Every migrated claim was checked against the code before it was written into a doc:
  `generateRandomSeed` at `js/services/comfyController.js:671` and its absence from
  `js/components/`; `_provisionUvEngine` at `routes/engine.js:319` behind the win32 gate at 76;
  `comfyui-krea2edit` pinned `223a9383` with core `v0.31.0` in `dev_configs/node_lock.json`;
  `@cubric/connector` as a `file:` dep in `package.json` with live use in `services/brokerBoot.js`
  and `services/connectorResponder.js`; `assertConnectorManifest` + `assertNoDanglingSymlinks` in
  `scripts/build-portable.mjs`.
- `MEMORY.md` compacted 20.9KB -> 17.1KB (under the index budget); `feedback-index.md` lost its
  7 rows for deleted files; `procedures-index.md` gained a 12-row was->now table for this pass.
- Docs-only change: no code touched, so no test run applies.
