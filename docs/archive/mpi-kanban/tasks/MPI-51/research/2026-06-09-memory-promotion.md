# Memory Promotion Classification

Date: 2026-06-09

Source index:
`C:\Users\Fabio\.claude\projects\C--AI-Mpi-Cubric-Vision\memory\MEMORY.md`

Rule: promote stable, broadly useful facts into committed docs. Do not dump raw
private memory into the repo.

## Promoted into committed docs

| Memory | Public home | Notes |
| --- | --- | --- |
| `project_product_scope.md` | `README.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/feature-request.yml` | Vision documented as image/video only; audio, LLM, and prompt-intelligence work belongs elsewhere. |
| `project_repo_distribution_gating.md` | `README.md`, `SECURITY.md` | Promoted source-visible portable artifact reality and distribution/timing gate framing. Omitted private launch-channel specifics that are not needed for contributors. |
| `project_private_ci_artifact_gate.md` | `README.md`, `.github/workflows/build-portable.yml`, `.github/PULL_REQUEST_TEMPLATE.md` | Public source workflow remains a dispatcher; default ref changed to `master`; no artifact upload added. |
| `project_backend_logger_arity.md` | `CONTRIBUTING.md` | Added backend logging footgun for contributors. |
| `project_import_depth_gotcha.md` | `CONTRIBUTING.md` | Added relative ESM import-depth warning and failure mode. |
| `project_additive_models_yaml.md` | `CONTRIBUTING.md` | Added concise model-path contract; detailed implementation remains in existing docs. |

## Already substantially documented

| Memory group | Existing committed home |
| --- | --- |
| Comfy models path source, extra folders, additive YAML, cache dedupe | `docs/comfy.md`, `.claude/rules/comfy_engine.md`, backend route code |
| Portable build, per-OS CI, tar exec/symlink, launcher split, platform disclosure | `docs/releases/portable-distribution-contract.md`, `.github/workflows/build-portable.yml` |
| Project data and history guardrails | `docs/project-integrity.md`, `docs/data.md` |
| Cue queue, reuse prompt, video trim, canvas/gallery component gotchas | `.claude/rules/component-*.md`, `docs/comfy.md`, task-specific code comments where present |

## Private, session-specific, or not for public contributor docs

| Memory group | Reason |
| --- | --- |
| Website subdomain strategy, Mad Pony identity folder, external project registry | Public-repo contributors do not need these to build or contribute to Vision. |
| Hub scalable foundation, connector ownership split, Cubric Studio agent vision | Future cross-app architecture; not part of current Vision contributor surface. |
| Linux desktop setup todo, macOS build prep, install-models-folder bug | Issue/task-specific or future validation notes; keep in memory/task tracking until productized. |
| Engine bootstrap retry, NDH resumable downloads, update-bundle bug notes | Useful for agents touching those systems, but too implementation-specific for root onboarding. Existing docs cover the stable contract. |

## Obsolete

No existing memory entry was removed or modified. Obsolescence was not asserted
for any private memory because removal requires explicit maintainer review under
the memory rules.

## Rule-file decision

No `.claude/rules/` edit is needed for MPI-51. The promoted facts are
contributor-facing and belong in `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
GitHub templates, and existing release docs. Rule files remain unchanged.
