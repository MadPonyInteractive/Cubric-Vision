# [shared] Operation registration — the 4-file wiring

> A NEW operation type registers in the same core files for both models and apps.
> Reusing an existing op touches none of them.

Two-mirror registry (both, always):
- `js/core/operationRegistry.js` — the JS source of truth for the op; add
  `<op>: { latestVersion, appVersionIntroduced }`. NOT `js/data/operationRegistry.js`
  (doesn't exist).
- `operation_registry.json` — the parallel superset that carries the same op.
- `appVersionIntroduced` = current `APP_VERSION` on the new op.
- **Neither models nor apps are version-bumped** for the add itself — only the new op
  carries `appVersionIntroduced`. (Adding a model/op ≠ an app version bump.)

Op → workflow resolution:
- **Model** — via the `ModelDef.workflows` map in `models.js` + `resolveWorkflowFile()`.
- **App** — via `js/data/modelConstants/universal_workflows.js` (op → workflow
  filename), and the op MUST carry `universal: true` in `commandRegistry.js` + the
  registry mirrors.

Both paths end at `commandExecutor` `fetch('/comfy_workflows/${workflowFile}')`.

**Playbook overrides (divergences live inline in each playbook):**
- **Model** — `injectParams` / shared-graph op branching + `commandRegistry` component
  shape, and how `operation_registry.json` is maintained on the model side:
  [../add-model/04-ops-and-controls.md](../add-model/04-ops-and-controls.md).
- **App** — `universal: true` mandatory, `submitAppGeneration` run path,
  `promptRequired: false` on utility ops, and **`operation_registry.json` is a
  hand-maintained superset that must NEVER be regenerated from JS** (regeneration
  strips the `universal` flags app ops depend on):
  [../add-app/01-descriptor-and-ops.md](../add-app/01-descriptor-and-ops.md).
