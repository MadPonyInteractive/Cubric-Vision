# MPI-119 Deliverable A — Bump / Rebuild Trigger Inventory

Single source of truth for: which change-types require an **app version bump**,
a **RunPod image rebuild**, or **both**. The Stop reminder hook (Deliverable B)
path-watches the `Trigger path / pattern` column; the skills (`mpi-version-bump`,
`build-pod-image`) own the actual execution.

Derived from: `mpi-version-bump` Change Impact Matrix, `.claude/rules/versioning.md`,
`docs/versioning.md`, `build-pod-image` command, and memory
(`project_node_version_lock`, `project_builder_install_scripts`,
`project_mpi_ci_pod_build_procedure`, `feedback_comfy_node_naming_law`).

Legend: ✅ required · ⚠️ conditional (see note) · — not triggered.

| Trigger path / pattern | Bump? | Rebuild? | Version field / image |
|---|---|---|---|
| `js/core/appVersion.js` (`APP_VERSION`) | ✅ (is the bump) | — | APP_VERSION |
| `js/core/appVersion.js` (`SCHEMA_VERSION`) | ✅ major | — | SCHEMA_VERSION + `js/migrations/projectMigrations.js` |
| `package.json` / `package-lock.json` `version` | ✅ (mirror) | — | must equal APP_VERSION |
| `js/core/operationRegistry.js` | ✅ minor (new op) / major (incompatible) | — | operation registry |
| `js/data/commandRegistry.js` | ✅ minor (new op UI) | — | operation registry |
| `operation_registry.json` | ✅ (JSON mirror) | — | operation registry |
| `js/data/modelConstants/models.js` | ✅ minor (new model/op) | ⚠️ if model adds a node/weight not baked | model mappings (+ image if new weight) |
| `js/data/modelConstants/universal_workflows.js` | ✅ minor (new universal op) | ⚠️ if it introduces a new node | model mappings (+ image) |
| `js/data/modelConstants/dependencies.js` | ✅ patch+ | ⚠️ if dep ships in the image | model deps (+ image) |
| `comfy_workflows/*.json` | ⚠️ patch if filename/graph changed | ⚠️ **rebuild if a NEW custom node is introduced** | release notes (+ Pod image) |
| `js/components/Organisms/MpiPromptBox/**` (prompt-box tools) | ✅ patch/minor (add/change tool) | — | release notes |
| `dev_configs/system_dependencies.json` (`engine.version`) | ✅ minor (engine bump) | ⚠️ if portable engine pin changes | COMFY_VERSION (+ image if Pod tracks it) |
| `dev_configs/node_lock.json` (`comfyui.core` / `frontend` / `nodes`) | ✅ minor (node-set change) | ✅ **rebuild** — Pod + Builder both consume the lock | node lock (Pod image **and** Builder image) |
| `mpi-ci/cubric-vision-builder/install_nodes.sh` | — | ✅ **rebuild Builder** | Builder image |
| `mpi-ci/cubric-vision-builder/install_models_*.sh` | — | ✅ **rebuild Builder** | Builder image |
| `mpi-ci/cubric-vision-builder/Dockerfile` | — | ✅ **rebuild Builder** | Builder image |
| `mpi-ci/cubric-vision-pod/Dockerfile` | — | ✅ **rebuild Pod** | Pod image |
| `mpi-ci/cubric-vision-pod/wrapper/wrapper.py` | — | ✅ **rebuild Pod** (bump `<wver>`) | Pod image / wrapper version |
| `mpi-ci/cubric-vision-pod/start.sh` | — | ✅ **rebuild Pod** | Pod image |
| `scripts/build-portable.mjs` / launcher / updater templates | ✅ patch (unless artifact compat breaks) | — | portable build |

## Notes / conditionals

- **`comfy_workflows/*.json` new node = rebuild.** A graph referencing a custom
  node not already baked into the Pod image needs the node added to the
  Builder/Pod install scripts + a rebuild. Editing params of an existing baked
  node = patch bump only, no rebuild. (See `feedback_comfy_node_naming_law` —
  new nodes must be `Input_*/Output_*`.)
- **`node_lock.json` is the lockstep pin.** Bumping core/frontend/a node there
  needs BOTH images rebuilt (Pod `COPY`s it; Builder `COMFYUI_REF` must match).
  This is the highest-leverage rebuild trigger and the easiest to forget — it
  looks like a config edit, not an image change.
- **`models.js` / `universal_workflows.js`:** bump is always; rebuild only if the
  new model/op pulls a weight or node that isn't already in the image. On-demand
  LoRA/upscale auto-upload (`project_mpi82_model_autoupload`) means many model
  adds need NO rebuild — local is truth, auto-uploaded at gen time.

## Deliverable C — hook vs skill division

| | Hook (Stop reminder) | Skills |
|---|---|---|
| **When** | Fires whether or not anyone remembers (session end) | Only when invoked |
| **Can it act?** | No — advisory text only, exit 0 | Yes — does the bump / build |
| **Owns** | *Forgetting* — flags touched trigger paths with no version change | *Doing* — `mpi-version-bump` bumps; `build-pod-image` rebuilds |

**Division:** hook reminds → skills execute. They are complementary.
`build-pod-image` already nudges "rebuild needed" loudly during its flow, so the
hook's main value is the **bump** side and the **rebuild-trigger paths that run
no skill** (node_lock, builder scripts, Dockerfiles, new-node workflow JSONs).
The hook never blocks — human/skill keeps the real judgment call.
