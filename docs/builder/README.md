# Builder-Pod Playbook — Cooperative Model-Onboarding Sessions

> **What this is.** The operational brain for a *cooperative session* where a human
> + an agent add a new model/workflow to Cubric Vision using the **Cubric Vision
> Builder** RunPod image (or the local authoring rig). It exists so an agent
> resuming cold does NOT re-discover file locations, re-research RunPod quirks, or
> repeat mistakes already made. Read the file for the step you're on; don't read
> all of it.
>
> **Scope = the Pod/authoring loop only.** Spin → install → add weights → author
> + test the workflow → save settings/research → tear down. It STOPS at "verified
> dep list + tuned workflow JSON". Wiring those deps into the app (modelConstants,
> resolveModelDeps, SHA compute) is the app's job — see
> [app-handoff.md](app-handoff.md) for the boundary + pointers, not the procedure.

## The loop

| # | File | When |
|---|---|---|
| 0 | this file | orientation — read first |
| 1 | [01-environments.md](01-environments.md) | **WHERE everything is** — local rig, Pod, repos, file paths. The "stop re-searching" file. |
| 2 | [02-image-and-rebuild.md](02-image-and-rebuild.md) | what's BAKED vs runtime-installed; when a rebuild is needed; how to rebuild. |
| 3 | [03-spin-and-install.md](03-spin-and-install.md) | deploy a Builder Pod, run the install scripts, the restart/upload gotchas. |
| 4 | [04-add-models.md](04-add-models.md) | write `install_models_<wf>.sh`; aria2c; **R2 vs Jupyter upload** cost rule. |
| 5 | [05-author-and-test.md](05-author-and-test.md) | build/test the workflow in ComfyUI; node-naming law; save the template + settings. |
| 6 | [06-teardown.md](06-teardown.md) | what survives Stop vs Terminate; don't lose downloads; close the session. |
| R | [research/README.md](research/README.md) | **decisions + measured data already locked** — LTX tiers, LoRA strength law, etc. Read before re-testing anything. |
| A | [app-handoff.md](app-handoff.md) | the boundary to the app pipeline + where the app-side docs live. |

## Hard rules (apply every session)

- **Live Pod ops (create / deploy / Stop / Terminate) are USER-only.** The agent
  guides; the user clicks. The agent has **no usable SSH** to an ephemeral Pod
  (proxy SSH refuses non-PTY exec) — the user runs all Pod shell commands.
- **NEVER `pkill -f main.py`** on the Pod — it cascades and kills every Jupyter
  terminal. Restart ComfyUI via RunPod console **Restart Pod** only.
- **Tokens live in Pod ENV** (`$HF_TOKEN`, `$CIVITAI_TOKEN`), never in a file or
  a committed script. Agents write `$TOKEN`, never a value.
- **`mpi-ci` is a separate repo.** Edit/commit it with `git -C c:/AI/Mpi/mpi-ci …`.
  Never run git from Cubric-Vision against it. Push is user-authorized.
- **Verify sub-agent / web claims against live JSON or real URLs** before trusting
  (a prior session's HF mirror filenames did NOT match local — wrong-weight risk).
