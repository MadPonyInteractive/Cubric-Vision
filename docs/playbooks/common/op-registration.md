# [shared] Operation registration — the 4-file wiring

> A NEW operation type registers in the same core files for both models and flows.
> Reusing an existing op touches none of them.

Two-mirror registry (both, always):
- `js/core/operationRegistry.js` — the JS source of truth for the op; add
  `<op>: { latestVersion, appVersionIntroduced }`. NOT `js/data/operationRegistry.js`
  (doesn't exist).
- `operation_registry.json` — the parallel superset that carries the same op.
- `appVersionIntroduced` = current `APP_VERSION` on the new op.
- **Neither models nor flows are version-bumped** for the add itself — only the new op
  carries `appVersionIntroduced`. (Adding a model/op ≠ a flow version bump.)

⚠ **Edit `operation_registry.json` BY HAND here, then run `npm run release:check`.**
No script generates it — `/mpi-version-bump` step 4i is itself a manual edit, and that
skill only runs on a VERSION BUMP. Models and flows are never version-bumped, so a new
model/flow op reaches the JSON mirror *only* if you write the entry yourself. The
"never hand-edit / it is generated" wording elsewhere is about not *regenerating* the
file wholesale (that would strip the `universal` flags flow ops depend on) — it is not
permission to skip the entry. `release:check` fails on the drift and is the gate that
catches a forgotten mirror; it is not run automatically, so run it.

Cost of skipping: `js/core/operationRegistry.js` and `operation_registry.json` drift,
the Python pre-release suite never sees the op, and the next build fails
`release:check` — far from the session that caused it. (MPI-300 shipped this way:
`qwenEdit` landed in the JS registry and was missing from the JSON mirror.)

Op → workflow resolution:
- **Model** — via the `ModelDef.workflows` map in `models.js` + `resolveWorkflowFile()`.
- **Flow** — via `js/data/modelConstants/universal_workflows.js` (op → workflow
  filename), and the op MUST carry `universal: true` in `commandRegistry.js` + the
  registry mirrors.

Both paths end at `commandExecutor` `fetch('/comfy_workflows/${workflowFile}')`.

**Playbook overrides (divergences live inline in each playbook):**
- **Model** — `injectParams` / shared-graph op branching + `commandRegistry` component
  shape, and how `operation_registry.json` is maintained on the model side:
  [../add-model/04-ops-and-controls.md](../add-model/04-ops-and-controls.md).
- **Flow** — `universal: true` mandatory, `submitFlowGeneration` run path,
  `promptRequired: false` on utility ops, and **`operation_registry.json` is a
  hand-maintained superset that must NEVER be regenerated from JS** (regeneration
  strips the `universal` flags flow ops depend on):
  [../add-flow/01-descriptor-and-ops.md](../add-flow/01-descriptor-and-ops.md).
