---
name: mpi-bump-engine
description: Bump the ComfyUI engine that SHIPS TO USERS (dev_configs/node_lock.json comfyui.core.tag + system_dependencies.json), and smoke-test models by executing a minimal generation per op on a RunPod Pod. Use when the user says "bump ComfyUI", "bump the engine", "we bumped ComfyUI", "upgrade the engine", "test all the models", "smoke the models", "test the models on RunPod", or asks to verify models still run after a node bump or a new model. NOT /mpi-bump-local-comfy — that is the standalone G:\ComfyUi authoring bench only and never reaches a user. This skill ENFORCES the docs/playbooks/bump-engine/ playbook — it does not replace it.
user-invocable: true
---
# /mpi-bump-engine — bump the shipped engine, and prove models still run

> **Two jobs, one skill.** (a) Bump the engine users get. (b) Smoke-test models —
> which is also useful with **no** bump at all, after a node bump or a new model.
> If the user only wants (b), skip to § Smoke-only.
>
> **This is NOT `/mpi-bump-local-comfy`.** That skill upgrades the standalone authoring
> bench at `G:\ComfyUi` and syncs its `extra_model_paths.yaml`. It never touches
> `dev_configs/node_lock.json` and nothing it does reaches a user. Confusing the two is
> the mistake this skill's name exists to prevent.
>
> **Why this skill exists.** MPI-465 shipped a **completely dead LTX** to every user on
> 1.3.0 and 1.3.1 for six days. A ComfyUI bump changed a return type that a custom node
> called; the graph threw at sampling start. ComfyUI's own graph validation **passed it**.
> It was found by accident. A playbook nobody's flow consults is how that shipped.

## STEP 0 — MANDATORY, BEFORE ANY OTHER TOOL CALL

Read **`docs/playbooks/bump-engine/README.md`** in full — the hub only, not
`01-smoke-run.md` yet. It carries the gate ordering, the two-engines model, and the trap
table. Then state, in one line each:

1. **Which job** — a real engine bump, or smoke-only (no pin change)?
2. **The target tag**, and whether it has a Comfy-Org **portable release asset**. Upstream
   tags exist with no build (`v0.30.1`, `v0.30.2` were real tags with none), which caps the
   target. Check: `gh api repos/Comfy-Org/ComfyUI/releases/tags/v<ver>`.
3. **Both version files** and their current values — `dev_configs/node_lock.json`
   `comfyui.core.tag` AND `dev_configs/system_dependencies.json`. They have **desynced in
   production**; never trust one alone.

Do not edit anything before stating those three.

## The gate order — do not reorder

Full detail in the playbook README; this is the enforcement summary.

0. **Research the breaking surfaces first.** API changes between the tags, not features.
   One coherent pass, never one symptom at a time.
1. **Target has a portable release asset** (step 0 above).
2. **Date any suspected break against `node_lock.json`'s OWN history**, not
   `git tag --contains` — that is exactly what misled the MPI-465 diagnosis.
3. **Bump both files**, then grep both and confirm they agree.
4. **Re-check every pinned custom node** against the new core. MPI-465's failure was a node
   calling a changed core API; the node's own pin was innocent.
5. 🛑 **LOCAL gate** — install at the new pin, assert **every `class_type` used by
   `comfy_workflows/*.json` registers** in `/object_info`. Empirical, against a live
   engine — never a reading of release notes.
6. **Rebuild the Pod image** at the new lock (`build-pod-image`).
7. 🛑 **Assert the Pod reports the new version** — *before* smoking. Smoke an unrebuilt
   image and you validate the OLD engine, then stamp the bump safe. The runner does this
   itself and hard-fails; do not bypass it.
8. 🛑 **Smoke matrix** — § below.
9. **Evidence** — `npm run release:check` refuses a bumped engine without it.

## Smoke-only (no pin change)

Valid on its own: a node bump, a new model, or "test all the models". Same runner, narrower
selection — nothing above applies except the smoke itself.

```bash
node scripts/smoke-workflows.mjs --plan               # resolve + print, spends NOTHING
node scripts/smoke-workflows.mjs                      # every model
node scripts/smoke-workflows.mjs --models klein-4b,qwen-edit
```

**Always run `--plan` first and show the user the matrix and the volume size** before
anything is rented. It needs the app running (`:3000`) and a RunPod key in Settings.

What it does: resolves the smoke set from the registry → ensures a **320 GB volume in
EU-RO-1** → installs on a CPU Pod → verifies → rents the first available of
**L4 → RTX 3090 → RTX 4090** → executes a minimal generation for **every op** → reports →
asks whether to keep or delete the volume.

## Hard rules

- **It must EXECUTE, never just validate.** MPI-465 threw *after* the loaders ran. Any
  check that POSTs a graph and reads `node_errors` reports green on it. If you find
  yourself proposing a validation-only shortcut, you have re-created the bug.
- **A SKIP is never a PASS.** Silent truncation reading as full coverage is the defect this
  whole system exists to prevent. Report skips on the same line as the pass count.
- **Pod-green is NOT Windows-green.** The Pod is Linux off a baked image with its own
  python/torch/CUDA; users run the Windows portable. Gate 5 is the local half and is not
  optional. Say this in the evidence — never let a green matrix stand in for it.
- **Never hardcode the volume size or model list.** Both move weekly (LTX went bf16/fp8 →
  int8, Wan lost t2v, both within days). `--plan` prints the live numbers.
- **Do not edit `dev_configs/node_lock.json` to "fix" a smoke failure.** A failing op means
  the bump broke something; diagnose to the root (CLAUDE.md § THE ROOT-CAUSE RULE).
- An engine bump **is** an app version bump — 2nd digit, per `/mpi-release`. Run
  `/mpi-version-bump` after this, not instead of it.

## Scope note (MPI-467 / MPI-457)

This skill currently enforces the **guard** half: the playbook, the smoke run, the release
gate (MPI-467). **MPI-457 extends THIS skill** with the in-place `/engine/upgrade` mechanic
(`git fetch --tags` + checkout the pinned sha + pip only the changed core packages +
restamp `.mpi_engine_version`) and the empirical gate-5 automation. It must **not** create a
second bump skill — one skill, one playbook, by decision of the MPI-468 umbrella.
