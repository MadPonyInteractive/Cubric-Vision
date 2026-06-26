Build + publish a RunPod image (product Pod or Builder). Use when the user says "build the pod image", "rebuild the pod image", "build the RunPod image", "publish the pod image", "cut a new pod image", "build the builder image", "rebuild the builder image", "build the Cubric Vision Builder image", "/build-pod-image", or asks to build/publish/push either RunPod Docker image.

You (the agent) ARE the executor — run the commands below directly. Drive the version/parity decisions, run the builds (local + CI in parallel), and walk the manual gates.

> **Two images, two flows.** Ask the user which unless they said:
> - **Product Pod** (`mpi-ci/cubric-vision-pod/`) — ComfyUI + Cubric wrapper. **cpu via CI; cu124 + cu128 LOCAL ONLY** (cu124 used to build on CI, but as of v0.10.0 the baked sage compile artifacts overflow the GitHub runner disk — see HARD RULES).
> - **Builder** (`mpi-ci/cubric-vision-builder/`) — standalone authoring box. cu128, **LOCAL ONLY, no CI**.

> **HARD RULES (do not break):**
> - **Live Pod ops are USER-only.** This command BUILDS images. Never autonomously create/delete/deploy a Pod. Image builds are fine once the user authorizes the run.
> - **NEVER read/grep any `.secrets/` or `runpod.env`.** Tokens go in Pod env, never in files.
> - **Neither GPU profile is CI-buildable — `cu128` AND `cu124` build LOCAL ONLY** (overflow the GitHub runner disk, `No space left on device`). cu128 never was; **cu124 stopped being CI-safe at v0.10.0** when the baked sage source-build (MPI-145) added CUDA-compile artifacts on top of the already-~32GB image → CI dies mid `Build and push` with no log (runner killed). Both = local `docker build` on the D: Docker host. Only **cpu** (tiny, ~900MB) builds on CI. The cu128 matrix row is commented out in the workflow; cu124 can still be dispatched but WILL fail — don't.
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

> **`<ver>`/`<wver>` ARE BARE NUMBERS — NO `v` PREFIX (MPI-119 guard).** The
> tag is `v<ver>`, so `<ver>` must be `0.4.9`, never `v0.4.9`. A `v`-prefixed
> input produces a malformed double-`v` tag (`vv0.4.9`) — the exact CI bug from
> the Insights report. Before building/dispatching, **strip any leading `v`** the
> user or a README hands you:
> ```
> ver=$(echo "$ver" | sed 's/^v//'); wver=$(echo "$wver" | sed 's/^v//')
> ```
> Reject if it still doesn't match `^[0-9]+\.[0-9]+\.[0-9]+$` (or your scheme).
> Same rule applies to the `manifest_version`/`wrapper_version` CI inputs in step 4.

---

## Flow A — Product Pod image

### 0. Pre-build disk reclaim (MANDATORY before any local GPU build)
Both GPU profiles build local now (~32-45GB each), and the WSL `ext4.vhdx` does NOT
shrink on its own → disk creeps up every build. **Before building, free the old tags.**
Rule: **keep the CURRENT SHIPPED tag (rollback) + the version you're about to build;
delete every OLDER Pod + Builder tag**, then prune build cache. NEVER delete the
shipped tag or the in-flight one.

```
docker system df                       # see reclaimable before
SHIPPED=v0.8.1   # <- the tag the app currently points at (routes/remoteProxy.js); keep it
BUILDING=v<ver>  # <- the one you're about to build; keep it
R=ghcr.io/madponyinteractive/cubric-vision-pod
B=ghcr.io/madponyinteractive/cubric-vision-builder
# Remove every Pod tag that is NOT $SHIPPED and NOT $BUILDING:
docker images "$R" --format '{{.Repository}}:{{.Tag}}' \
  | grep -vE ":($SHIPPED|$BUILDING)-" | xargs -r -n1 docker rmi 2>&1 | tail -20
# Builder: keep only the newest; drop the rest (ask the user which to keep if unsure):
docker images "$B" --format '{{.Tag}}'   # review, then: docker rmi $B:<old-tag> ...
docker image prune -f && docker builder prune -f
docker system df                       # confirm reclaimed
```
This frees space INSIDE the vhdx (Docker reuses it) — enough to build without
`No space left on device`. The vhdx FILE on disk only shrinks after a USER-gated
`wsl --shutdown` + compact (see Manual gates). Run that occasionally, not per-build.
If `docker rmi` says "image is being used by running container" → a Pod-smoke
container is still up; `docker ps` + `docker stop` it first.

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

### 4. Build cpu (CI) + cu124 AND cu128 (both LOCAL) IN PARALLEL
Independent legs — start all three, converge only at the public gate (step 5).
**cpu builds on CI; BOTH GPU profiles build local** (cu124 overflows CI since the
v0.10.0 sage bake — see HARD RULES). cpu dispatch returns instantly; start the two
GPU local builds backgrounded so they run while cpu CI runs.

⚠ **Local disk:** each GPU image is ~32-45GB and they share little. Building cu124
AND cu128 back-to-back can add ~80GB to the WSL `ext4.vhdx` and it does NOT shrink
on its own. Before a build, `docker system df`; if reclaimable is high, prune old
tags first (keep the current shipped + the one you're building). The vhdx FILE only
shrinks after `wsl --shutdown` + a compact (Optimize-VHD / diskpart) — a USER step.

**a. Dispatch cpu CI (non-blocking):**
```
cd c:/AI/Mpi/mpi-ci && gh workflow run cubric-vision-pod-image.yml --ref main \
  -f manifest_version=<ver> -f wrapper_version=<wver> -f comfyui_ref=<ref> \
  -f push_latest=false -f only_profile=cpu
```
(Do NOT dispatch cu124 on CI — it WILL die mid-build on disk. cpu only.)

**b. Build cu128 AND cu124 locally, backgrounded** (Bash `run_in_background: true`).
Login once, then one build per profile. cu128:
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
  -c "import torch;print('torch', torch.__version__, torch.version.cuda); import sageattention; print('sage OK')"
docker push ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cu128
```
cu124 — same, swap the base + profile (target tag `-cu124`):
```
  --build-arg BASE_IMAGE=pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel \
  --build-arg CUDA_PROFILE=cu124 \
  ... -t ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cu124 -f Dockerfile .
```
(Add `import sageattention; print('sage OK')` to the verify line — it confirms the
baked per-arch sage actually compiled for this profile.)

**c. Converge:** watch cpu CI (`cd c:/AI/Mpi/mpi-ci && gh run watch`) and the two
backgrounded GPU builds. Do NOT proceed until ALL THREE pushes succeed. Any fails →
fix + re-run only that leg; the others are unaffected.

### 5. Post-push verification (you CAN do 5a/5b once public — MPI-119)

**5a. Public pull-verify (after the package is public).** Confirm each pushed tag
is publicly pullable BEFORE calling the build done — catches "push said OK but the
manifest isn't really there / package still private":
```
docker manifest inspect ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cu124 >/dev/null && echo "cu124 OK"
docker manifest inspect ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cpu  >/dev/null && echo "cpu OK"
docker manifest inspect ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cu128 >/dev/null && echo "cu128 OK"
```
Any `manifest unknown` / `denied` → not done. Fix (re-push or fix visibility) and
re-check. (cu124 + cu128 build local — pull-verify them right after each local push.)

**5b. Boot smoke test (cpu).** The `import torch` build-verify proves CUDA links;
this proves the **wrapper actually serves**. The wrapper binds **`0.0.0.0:8889`**
(NOT 8000 — `EXPOSE 8889`), needs **`CUBRIC_TOKEN`** in env (fails closed without
it), and `/wrapper/stats` is **token-gated** — hit unauthenticated `/health` for the
smoke (it returns `wrapper_version`, the bump-proof), or pass the token header:
```
docker run -d --rm --name cv-smoke -p 8889:8889 -e CUBRIC_TOKEN=smoketest \
  ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cpu
# wait for boot (~15-30s), then:
for i in $(seq 1 12); do sleep 3; curl -fsS http://127.0.0.1:8889/health >/dev/null 2>&1 && break; done
curl -fsS http://127.0.0.1:8889/health   # expect {"ready":true,...,"wrapper_version":"<wver>",...}
docker stop cv-smoke
```
PASS = `/health` 200 with the right `wrapper_version`. (A 401 on `/wrapper/stats`
without the token is EXPECTED — it proves the route + auth, not a failure.) cpu =
cheapest boot, representative wrapper. GPU-only behavior still needs the user's live
Pod verify below.

### Manual gates (you CANNOT do these — tell the user)
- **Make the GHCR package PUBLIC** (first push of a new package only): GitHub → Packages → `cubric-vision-pod` → settings → visibility. RunPod can only pull public. Later pushes stay public. (Do 5a only AFTER this.)
- **`wsl --shutdown` + vhdx compact** to reclaim disk FILE space after pruning (Step 0
  frees space inside the vhdx; the file itself only shrinks here). Close VS Code first
  (it holds a WSL handle), then PowerShell (admin): `wsl --shutdown`, then
  `Optimize-VHD -Path "%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx" -Mode Full`
  (Hyper-V) or diskpart `compact vdisk`. Also frees the Docker VM RAM. USER-only —
  it kills the WSL session (and VS Code's terminal).
- **Live verify = USER-only.** After the user redeploys a fresh Pod, confirm via the app-log image line + `/health` `wrapper_version`.

### Build card "done" definition (MPI-119)
**Push success ≠ done.** A build card moves to `done` only when ALL hold:
1. All tags pushed (cpu via CI + local cu124 + local cu128).
2. Package public (manual gate).
3. **5a pull-verify passes** for every pushed tag.
4. **5b boot smoke passes** (cpu `/health` 200 with the right `wrapper_version`).
5. User's live Pod verify confirms the image line + `wrapper_version`.

Until 1–5, the card stays `doing`. Then remove the "Pending for the NEXT rebuild"
block in the pod README.

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
