# 06 — Teardown & close the session

> Live Pod ops are USER-only. The agent reminds; the user clicks.

## Before you tear down — did you save everything?

- [ ] **Workflow JSON** saved locally (`G:/ComfyUi/ComfyUI/user/default/workflows/`).
- [ ] **Concluded findings** graduated to [research/](research/) (the Pod dies, the
      research must not).
- [ ] **Verified dep list** captured for the app handoff — see
      [app-handoff.md](app-handoff.md).
- [ ] Any new/edited `install_models_<wf>.sh` committed to mpi-ci (user-authorized push).

## What survives which action

| Action | Container disk (models if ephemeral) | Volume |
|---|---|---|
| **Restart Pod** | survives | survives |
| **Stop** | **WIPED** | survives |
| **Terminate** | gone | survives (manual volume-delete only) |

- **Ephemeral Pod (no volume):** **Stop = you lose the ~68GB download.** Only Stop
  when you accept re-downloading, or you've moved the weights to a volume / R2.
- **Volume Pod:** Stop freely — weights persist, re-attach later for zero
  re-download.
- Either way: **Terminate** when fully done to stop billing (a Stopped Pod still
  bills for its disk).

## Cost reminders

- The Pod bills the whole time it runs — including slow Jupyter uploads (see
  [04-add-models.md](04-add-models.md): use R2 for re-used files).
- An idle Pod left running after the session = pure burn. Tear down or Stop.
