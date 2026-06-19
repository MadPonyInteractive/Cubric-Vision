Build + publish a RunPod image (product Pod or Builder). Use when the user says "build the pod image", "rebuild the pod image", "build the RunPod image", "publish the pod image", "cut a new pod image", "build the builder image", "rebuild the builder image", "build the Cubric Vision Builder image", "/build-pod-image", or asks to build/publish/push either RunPod Docker image.

You (the agent) ARE the executor — run the commands below directly. Drive the version/parity decisions, run the builds (local + CI in parallel), and walk the manual gates.

> **Two images, two flows.** Ask the user which unless they said:
> - **Product Pod** (`mpi-ci/cubric-vision-pod/`) — ComfyUI + Cubric wrapper. cu124+cpu via CI, **cu128 LOCAL ONLY**.
> - **Builder** (`mpi-ci/cubric-vision-builder/`) — standalone authoring box. cu128, **LOCAL ONLY, no CI**.

> **HARD RULES (do not break):**
> - **Live Pod ops are USER-only.** This command BUILDS images. Never autonomously create/delete/deploy a Pod. Image builds are fine once the user authorizes the run.
> - **NEVER read/grep any `.secrets/` or `runpod.env`.** Tokens go in Pod env, never in files.
> - **`cu128` is NOT CI-buildable** (overflows the GitHub runner disk, `No space left on device`). cu128 = local `docker build` on the D: Docker host only. The cu128 matrix row is commented out in the workflow.
> - All image/CI edits live in `c:\AI\Mpi\mpi-ci` (private repo). Use `git -C c:/AI/Mpi/mpi-ci ...` — never run git from Cubric-Vision against it.

## Reference

Read these first — they hold every gotcha this command operationalizes:
- `c:\AI\Mpi\mpi-ci\cubric-vision-pod\README.md`
- `c:\AI\Mpi\mpi-ci\cubric-vision-builder\README.md`
- memory `project_mpi_ci_pod_build_procedure.md`, `project_builder_image_flow.md`, `project_image_pin_restart.md`

In the commands below, substitute:
- `<ver>` — image tag version (e.g. `0.4.9` → `:v0.4.9-<profile>`)
- `<wver>` — wrapper version (`/health` string); bump ONLY if `wrapper/wrapper.py` changed
- `<ref>` — ComfyUI git ref, a **SHA** (kept in lockstep with the Builder image for parity)

---

## Flow A — Product Pod image

### 1. Decide versions (derive, don't guess)
- **`<ver>`:** ask the user, or infer from the "Pending for the NEXT image rebuild" block in the pod README.
- **`<wver>`:** bump only if the wrapper changed —
  `git -C c:/AI/Mpi/mpi-ci log -1 --stat -- cubric-vision-pod/wrapper/wrapper.py`
  `git -C c:/AI/Mpi/mpi-ci status --short cubric-vision-pod/wrapper/`
  unchanged since last build → keep the current wrapper version.
- **`<ref>` (DERIVE FROM LOCK — MPI-117, do not hand-type):** read it from the node version-lock, do not prompt the user for a SHA:
  `node -e "console.log(require('./dev_configs/node_lock.json').comfyui.core.tag)"` (currently `v0.19.3`).
  Custom-node + frontend pins also live in that lock — the Dockerfile resolves them itself from the copied `node_lock.json`, so there are no per-node build-args to pass. To bump core/frontend/a node, edit `dev_configs/node_lock.json` and rebuild; the build follows the lock. Confirm with the user only if the lock itself is being bumped. Must stay in lockstep with the Builder's `COMFYUI_REF`.

### 2. App-side version sync (BEFORE redeploy; needs an app restart to take effect)
`routes/remoteProxy.js` bakes `POD_IMAGE_VERSION` + `WRAPPER_VERSION` into the running Express child at boot — editing them needs an APP RESTART or the live app keeps sending the old tag. Update both to `<ver>`/`<wver>`, commit by explicit pathspec:
`git commit --only routes/remoteProxy.js -m "..."` (never `git add .` — shared tree).

### 3. Commit + push mpi-ci FIRST (CI gotcha)
`gh workflow run` builds the **pushed** ref, not the local tree. Stage only your files.

**3a. Sync the node lock into the build context (MPI-117).** The Dockerfile `COPY`s
`node_lock.json` from the `cubric-vision-pod/` build context; CI builds the pushed
mpi-ci tree, so the lock must be committed there, freshly copied from the canonical
Cubric-Vision lock every build:
```
cp c:/AI/Mpi/Cubric-Vision/dev_configs/node_lock.json c:/AI/Mpi/mpi-ci/cubric-vision-pod/node_lock.json
```
Then stage it alongside your other mpi-ci changes (it's the source of node/core/frontend pins).

**3b. Commit + push:**
```
git -C c:/AI/Mpi/mpi-ci add cubric-vision-pod/node_lock.json <other paths>
git -C c:/AI/Mpi/mpi-ci commit -m "..."
git -C c:/AI/Mpi/mpi-ci push
```
Verify `start.sh` committed as LF:
`git -C c:/AI/Mpi/mpi-ci show HEAD:cubric-vision-pod/start.sh | tr -cd '\r' | wc -c` → want `0`.

### 4. Build cu124+cpu (CI) and cu128 (local) IN PARALLEL
Independent legs — start both, converge only at the public gate (step 5). cu128 is the long pole (~16GB), so dispatch CI first (returns instantly) then start cu128 backgrounded.

**a. Dispatch CI (non-blocking, builds in the cloud):**
```
cd c:/AI/Mpi/mpi-ci && gh workflow run cubric-vision-pod-image.yml --ref main \
  -f manifest_version=<ver> -f wrapper_version=<wver> -f comfyui_ref=<ref> \
  -f push_latest=false
```
(single leg only: add `-f only_profile=cu124` or `=cpu`.)

**b. Start cu128 locally in the SAME response, backgrounded** (Bash tool `run_in_background: true`) so it builds while CI runs:
```
cd c:/AI/Mpi/mpi-ci/cubric-vision-pod
gh auth token | docker login ghcr.io -u "$(gh api user -q .login)" --password-stdin
docker build \
  --build-arg BASE_IMAGE=runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04 \
  --build-arg CUDA_PROFILE=cu128 \
  --build-arg CUBRIC_MANIFEST_VERSION=<ver> \
  --build-arg COMFYUI_REF=<ref> \
  --build-arg WRAPPER_VERSION=<wver> \
  -t ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cu128 -f Dockerfile .
docker run --rm --entrypoint python ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cu128 \
  -c "import torch;print('torch', torch.__version__, torch.version.cuda)"
docker push ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cu128
```
(swap `BASE_IMAGE=pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel` + `CUDA_PROFILE=cu124` to build a cu124 leg locally instead.)

**c. Converge:** watch CI (`cd c:/AI/Mpi/mpi-ci && gh run watch`) and the backgrounded cu128 run. Do NOT proceed until BOTH pushes succeed. Either fails → fix + re-run only that leg; the other is unaffected.

### 5. Manual gates (you CANNOT do these — tell the user)
- **Make the GHCR package PUBLIC** (first push of a new package only): GitHub → Packages → `cubric-vision-pod` → settings → visibility. RunPod can only pull public. Later pushes stay public.
- **`wsl --shutdown`** after the local build to free the Docker VM RAM.
- **Live verify = USER-only.** After the user redeploys a fresh Pod, confirm via the app-log image line + `/health` `wrapper_version`.
- Remove the "Pending for the NEXT rebuild" block in the pod README once tags are pushed + public + verified.

---

## Flow B — Builder image (cu128, LOCAL ONLY — no CI, no dispatch)

1. **`<ver>`:** new tag, e.g. `0.1.3`. Ask the user.
2. **Parity SHA:** the Builder Dockerfile pins `COMFYUI_REF` — must equal the product cu128 image's. Bump both together if changing.
3. **Build (local):**
```
cd c:/AI/Mpi/mpi-ci/cubric-vision-builder
gh auth token | docker login ghcr.io -u "$(gh api user -q .login)" --password-stdin
docker build -t ghcr.io/madponyinteractive/cubric-vision-builder:v<ver>-cu128 -f Dockerfile .
docker run --rm --entrypoint python ghcr.io/madponyinteractive/cubric-vision-builder:v<ver>-cu128 \
  -c "import torch;print('torch', torch.__version__, torch.version.cuda)"
docker push ghcr.io/madponyinteractive/cubric-vision-builder:v<ver>-cu128
```
4. **Manual gates (tell the user):**
   - Make the GHCR `cubric-vision-builder` package PUBLIC (first push only).
   - Bump the **Cubric Vision Builder** RunPod template (id `2brluktxb4`) image to the new tag — USER does this in the console.
   - `wsl --shutdown` to free VM RAM.

---

## After either flow
Offer to update the relevant kanban card and the "Pending for the NEXT rebuild" / "Current shipped tag" notes in the matching README (ask before editing — DOCUMENTATION DRIFT rule).
