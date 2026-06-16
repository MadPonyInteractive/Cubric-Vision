# MPI-78 Brief

Replicate RunPod console **flow #2** in-app: Secure Cloud + **no network volume** +
region **"Any region"**. The user picks the **container-disk size (GB)**, models download
to ephemeral container disk, and **Terminate** ends all spend.

**Target persona:** a mostly-local user who only needs a remote GPU occasionally (e.g. a
weekly video the local machine can't do). Flow: connect → download → long session →
finish → terminate the Pod → **no spend until next time** (no idle volume bill between
sessions). This is the opposite trade-off to the current default (volume + DC = models
persist, daily user), and to MPI-88 CPU download-mode (cheap persistent downloads).

**No image rebuild (verified 2026-06-16).** `mpi-ci/cubric-vision-pod/start.sh` treats
`/workspace` as a plain mount point — `mkdir -p` creates the model/cache/custom_node dirs
unconditionally and ComfyUI loads them via the same `extra_model_paths.yaml`. With no
volume, `/workspace` is just container-local disk; same code path. sage recompiles per
fresh Pod (non-fatal SDPA fallback, ~5-15 min one-time/session). The GPU cu124/cu128
images run unchanged → **do NOT couple this card to any image-rebuild batch.**

**Backend is already 90% there:** `_createPodInternal` only sets `networkVolumeId` when a
volume is given (`routes/remoteProxy.js:444`); `containerDiskInGb` is a free spec field
(`:422`); `gpuTypes(apiKey, undefined)` already returns the DC-unbound "Any region" list
(`routes/runpodRemote.js:122-129`). Blockers are the `datacenter_required` route guard
(`:564`) + the frontend volume-required Connect guard (`MpiSettings.js:552, 632-633`) +
the missing disk-size input.

**Decisions (locked with user):** Auto-place (omit `dataCenterIds` when no volume); disk
default **100 GB**, user-chosen; **no model-blocking gate** (user knows what they install,
RunPod reject + clamp is the only ceiling). Still Secure Cloud.

Plan: `plan.md`. (Created 2026-06-14; investigated + planned 2026-06-16.)
