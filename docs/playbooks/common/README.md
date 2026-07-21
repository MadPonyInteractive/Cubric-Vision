# Playbook Common Reference — shared mechanics for add-model + add-app

> Cross-cutting steps that BOTH the [add-model](../add-model/README.md) and
> [add-app](../add-app/README.md) playbooks depend on. Skim this before either
> playbook. A step marked **[shared]** in a playbook has its canonical detail here;
> the playbook links to the relevant file and documents only its own deviations.
>
> **Playbook-specific overrides win.** Where a playbook contradicts a shared file
> (e.g. the all-lowercase filename law applies to models but NOT apps — apps route
> through a case-insensitive middleware), the playbook's inline note is authoritative.

## Files

| File | Covers | Overrides to watch |
|---|---|---|
| [hard-rules.md](hard-rules.md) | The two universal hard rules (never hand-edit a workflow JSON; a covered-but-asked question = playbook/reading failure) | none |
| [workflow-authoring-entry.md](workflow-authoring-entry.md) | raw→API sync via `sync-raw-workflows.mjs`; `validate-injection-rules.mjs` gate; `raw/` is user-owned; staged output | model: converter-staleness trap + `_template` routing (inline in add-model/01) |
| [op-registration.md](op-registration.md) | 4-file op wiring; two-mirror registry (`operationRegistry.js` + `operation_registry.json`); `appVersionIntroduced`; no-version-bump rule | app: `universal: true` mandatory + `operation_registry.json` NEVER regenerate (inline in add-app/01) |
| [inject-titles-guard.md](inject-titles-guard.md) | Injector silently skips unmatched `Input_*` titles; `tests/inject-params-titles.test.cjs` guard convention | none |
| [output-capture-titles.md](output-capture-titles.md) | `Output_*` capture naming law (MPI-252); base rule | app: prefix-match for multi-output (inline in add-app/02) |

## NOT re-homed here (link, don't duplicate)

- **Media path→string loader contract** — canonical at
  [../../workflow-authoring/media-inputs.md](../../workflow-authoring/media-inputs.md).
  Both playbooks link there; do not copy it into `common/`.
- **All-lowercase workflow-filename law (MPI-291)** — applies to MODELS only (the Pod
  FS is case-sensitive and `sync-raw-workflows` gates on it); apps route through a
  case-insensitive middleware so it does NOT apply there. Stays inline in
  [../add-model/01-workflow-split.md](../add-model/01-workflow-split.md).
