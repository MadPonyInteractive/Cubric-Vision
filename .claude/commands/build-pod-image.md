Build + publish a RunPod image (product Pod or Builder). Use when the user says "build the pod image", "rebuild the pod image", "build the RunPod image", "publish the pod image", "cut a new pod image", "build the builder image", "rebuild the builder image", "build the Cubric Vision Builder image", "/build-pod-image", or asks to build/publish/push either RunPod Docker image.

You (the agent) ARE the executor — run the commands below directly. Drive the version/parity decisions, run the builds (local + CI in parallel), and walk the manual gates.

> **Two images, two flows.** Ask the user which unless they said:
> - **Product Pod** (`mpi-ci/cubric-vision-pod/`) — ComfyUI + Cubric wrapper. As of MPI-189
>   this is **ONE cu130 GPU image** (`-cu130`, → **Docker Hub**) + the slim **cpu** image
>   (→ GHCR, via CI). The old cu124/cu128 two-profile split is GONE.
> - **Builder** (`mpi-ci/cubric-vision-builder/`) — standalone authoring box. cu130, **LOCAL ONLY, no CI**.

> **HARD RULES (do not break):**
> - **Live Pod ops are USER-only.** This command BUILDS images. Never autonomously create/delete/deploy a Pod. Image builds are fine once the user authorizes the run.
> - **NEVER read/grep any `.secrets/` or `runpod.env`.** Tokens go in Pod env, never in files.
> - **TWO REGISTRIES (MPI-189/186):** the `-cu130` GPU image pushes to **Docker Hub**
>   (`docker.io/madponyinteractive/cubric-vision-pod`); the `-cpu` image stays on **GHCR**.
>   Docker Hub creds = GitHub repo secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (for CI)
>   or the user's own token (for a local push). Make the **Docker Hub repo public** (cu130)
>   and the **GHCR package public** (cpu) after first push — RunPod requires public pull.
> - **cu130 CI-buildability = TRY CI FIRST, fall back to local ONLY on a real disk overflow.**
>   The cu130 torch stack is large; the old cu128 build overflowed the runner (`No space left
>   on device`). CI has a "Free up runner disk" step reclaiming ~25-30GB — dispatch cu130 on CI
>   and watch it. Fall back to LOCAL **only** for a genuine `No space left on device`, NOT for a
>   fixable input error. (MPI-189: the first cu130 CI leg failed on a bad `comfyui_ref` = a
>   commit SHA, which `git clone --branch` rejects — fix = pass the TAG + re-dispatch CI, not
>   go local.) **cpu** (tiny) always builds on CI. (Historical: cu124/cu128 were LOCAL-ONLY;
>   that split is gone.)
> - All image/CI edits live in `c:\AI\Mpi\mpi-ci` (private repo). Use `git -C c:/AI/Mpi/mpi-ci ...` — never run git from Cubric-Vision against it.

## Reference

Read these first — they hold every gotcha this command operationalizes:
- `c:\AI\Mpi\mpi-ci\cubric-vision-pod\README.md`
- `c:\AI\Mpi\mpi-ci\cubric-vision-builder\README.md`
- memory `project_mpi_ci_pod_build_procedure.md`, `project_builder_image_flow.md`, `project_image_pin_restart.md`

In the commands below, substitute:
- `<ver>` — image tag version (e.g. `0.4.9` → `:v0.4.9-<profile>`)
- `<wver>` — wrapper version (`/health` string); bump ONLY if `wrapper/wrapper.py` changed
- `<ref>` — ComfyUI git ref, the **TAG** (e.g. `v0.27.0`, kept in lockstep with the Builder image for parity). **MUST be a tag, NOT a commit SHA** — the Dockerfile clones via `git clone --branch ${COMFYUI_REF}`, which rejects a bare SHA (`exit 128`). This was the MPI-189 first-CI-build failure.

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
SHIPPED=$(node -e "console.log(require('./routes/remotePodLifecycle.js.POD_IMAGE_VERSION')||'')" 2>/dev/null || grep -oE "POD_IMAGE_VERSION\s*=\s*'v[0-9.]+'" routes/remotePodLifecycle.js | grep -oE "v[0-9.]+")  # <- the tag the app currently points at; read it live so this never drifts (e.g. v0.14.0). keep it
BUILDING=v<ver>  # <- the one you're about to build; keep it
R=docker.io/madponyinteractive/cubric-vision-pod   # GPU image is on Docker Hub now (MPI-189)
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
- **`<ref>` (DERIVE FROM LOCK — MPI-117, do not hand-type):** read the **TAG** from the node version-lock (the Dockerfile's `git clone --branch` needs a tag, NOT the SHA):
  `node -e "console.log(require('./dev_configs/node_lock.json').comfyui.core.tag)"` (currently `v0.27.0`). Pass THIS tag as `comfyui_ref`, never the lock's `.commit` SHA.
  Custom-node + frontend pins also live in that lock — the Dockerfile resolves them itself from the copied `node_lock.json`, so there are no per-node build-args to pass. To bump core/frontend/a node, edit `dev_configs/node_lock.json` and rebuild; the build follows the lock. Confirm with the user only if the lock itself is being bumped. Must stay in lockstep with the Builder's `COMFYUI_REF`.

### 2. App-side version sync (BEFORE redeploy; needs an app restart to take effect)
`routes/remotePodLifecycle.js` bakes `POD_IMAGE_VERSION` + `WRAPPER_VERSION` into the running Express child at boot — editing them needs an APP RESTART or the live app keeps sending the old tag. Update to `<ver>`/`<wver>`, commit by explicit pathspec:
`git commit --only routes/remotePodLifecycle.js -m "..."` (never `git add .` — shared tree).
Note: `POD_IMAGE_VERSION` is the GPU (cu130) tag; `POD_IMAGE_VERSION_CPU` is the separate cpu tag (bump only when the cpu image is rebuilt). `POD_IMAGE_BASE`=Docker Hub, `POD_IMAGE_BASE_CPU`=GHCR.
**MPI-340 — a DEV build bumps the DEV consts, not these.** Built at a `-dev` `manifest_version` (e.g. `0.17.0-dev` → `v0.17.0-dev-cu130` + `v0.17.0-dev-cpu`)? Then update `POD_IMAGE_VERSION_DEV` / `POD_IMAGE_VERSION_CPU_DEV` — only a `BUILD_HASH === 'dev'` run resolves them, so released users stay on the frozen stable pins. Move the stable pair only for a real-version rebuild you intend to ship.

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

> **MPI-156 — most start.sh/wrapper.py edits DON'T need a rebuild.** `bootstrap.sh`
> (the image `CMD`) fetches `start.sh` + `wrapper.py` from R2 (`cubric-pod-runtime`,
> `https://pod.cubric.studio/vision/<channel>/`) at boot, with the baked copies as fallback.
> So after committing a shell/wrapper edit, PUBLISH instead of rebuilding:
> `bash cubric-vision-pod/publish-runtime.sh dev` (rclone push + public-URL verify),
> then on a running Pod `POST /wrapper/restart-comfy` (or recreate the Pod). Once proven,
> `bash cubric-vision-pod/publish-runtime.sh promote` copies the tested dev objects to
> `stable`, which is what released users boot (MPI-340 — never publish straight to
> `stable` for day-to-day work). A full image rebuild is needed ONLY for
> torch/sage/node/base changes — or the one-time rebuild that ships `bootstrap.sh`
> itself. Keep the published `stable` copy in sync with the committed files (promote
> after the commit so the baked fallback and the R2 copy match).

### 4. Build cu130 (GPU, Docker Hub) + cpu (GHCR) — CI FIRST, MPI-189
ONE GPU image now (`-cu130`) + cpu. Two independent legs; converge at the public gate
(step 5). **Try BOTH on CI first.** Only build cu130 locally if CI fails for a REAL
reason — the runner running out of disk on the large cu130 image (`No space left on
device`). Do NOT drop to local for a fixable input error.

> **MPI-189 first-build lesson (2026-07-04):** the cu130 CI leg failed ONCE, but the cause
> was a **bad input, not a CI limit** — `comfyui_ref` was passed as a commit SHA, and the
> Dockerfile's `git clone --branch ${COMFYUI_REF}` rejects a bare SHA (`exit 128`). The fix
> is to pass the TAG (step 1 `<ref>`), then **retry on CI** — NOT to give up on CI. CI can
> build cu130 (the "Free up runner disk" step reclaims ~25-30GB; the cpu leg proved the
> Docker Hub push path works). Reserve local build for a genuine disk overflow.

**a. Dispatch CI (both legs — non-blocking):**
```
cd c:/AI/Mpi/mpi-ci && gh workflow run cubric-vision-pod-image.yml --ref main \
  -f manifest_version=<ver> -f wrapper_version=<wver> -f comfyui_ref=<ref-TAG> \
  -f push_latest=false
```
(Blank `only_profile` = both cu130 + cpu rows. cu130 → Docker Hub, cpu → GHCR. `<ref-TAG>`
= the lock's `comfyui.core.tag`, e.g. `v0.27.0` — **NEVER the commit SHA**, or the clone
`exit 128`s.) Watch: `gh run watch`. On failure, READ the actual error before falling
back: a clone/input error → fix the input + re-dispatch CI; ONLY `No space left on device`
→ build cu130 locally (4b).

**b. Build cu130 LOCALLY (only on a real CI disk overflow), backgrounded**
(`run_in_background: true`). Build needs NO login; only the PUSH does. `COMFYUI_REF` MUST
be the TAG (`--branch` rejects a SHA):
```
cd c:/AI/Mpi/mpi-ci/cubric-vision-pod
docker build \
  --build-arg BASE_IMAGE=nvidia/cuda:13.0.3-runtime-ubuntu24.04 \
  --build-arg CUDA_PROFILE=cu130 \
  --build-arg CUBRIC_MANIFEST_VERSION=<ver> \
  --build-arg COMFYUI_REF=<ref-TAG> \
  --build-arg WRAPPER_VERSION=<wver> \
  -t docker.io/madponyinteractive/cubric-vision-pod:v<ver>-cu130 -f Dockerfile .
# verify the load-bearing cu130 build (the Dockerfile also asserts +cu130 at build):
docker run --rm --entrypoint python docker.io/madponyinteractive/cubric-vision-pod:v<ver>-cu130 \
  -c "import torch;print('torch', torch.__version__, torch.version.cuda); assert '+cu130' in torch.__version__, 'NOT cu130!'"
docker push docker.io/madponyinteractive/cubric-vision-pod:v<ver>-cu130
```
> **Docker Hub login for the local PUSH:** the agent shell CANNOT `docker login` (no TTY;
> `--password-stdin` needs the token, which lives only in the GitHub secret, not on the
> box). Docker Desktop's `credsStore: desktop` may already hold Docker Hub creds if the
> user signed in via the GUI — try the push directly; if it 401s, ask the user to run
> `docker login docker.io -u madponyinteractive` (paste the access token) in THEIR terminal
> once, then re-push. Do the build (no auth) while that's sorted — don't block on login.

NO sage on cu130 (MPI-189 — SDPA fallback). Do NOT add an `import sageattention` check
to the verify line; nothing is baked, so it would (correctly) fail. The `+cu130` assert
IS the load-bearing check — a wrong-CUDA wheel is the ~10x-regression trap.

**c. Converge:** watch the CI run (`cd c:/AI/Mpi/mpi-ci && gh run watch`) and, if used, the
backgrounded local cu130 build. Do NOT proceed until BOTH pushes succeed (cu130 → Docker
Hub, cpu → GHCR). Any fail → fix + re-run only that leg.

### 5. Post-push verification (you CAN do 5a/5b once public — MPI-119)

**5a. Public pull-verify (after the images are public).** Confirm each pushed tag
is publicly pullable BEFORE calling the build done — catches "push said OK but the
manifest isn't really there / repo still private":
```
docker manifest inspect docker.io/madponyinteractive/cubric-vision-pod:v<ver>-cu130 >/dev/null && echo "cu130 OK"
docker manifest inspect ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cpu     >/dev/null && echo "cpu OK"
```
Any `manifest unknown` / `denied` → not done. Fix (re-push or fix visibility) and
re-check. (cu130 → Docker Hub, cpu → GHCR — two different registries.)

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
- **Make the Docker Hub repo PUBLIC** (cu130, first push only): hub.docker.com → Repositories → `cubric-vision-pod` → Settings → make public. AND **make the GHCR package PUBLIC** (cpu, first push only): GitHub → Packages → `cubric-vision-pod` → settings → visibility. RunPod can only pull public. Later pushes stay public. (Do 5a only AFTER both.)
- **Docker Hub CI secrets** (one-time): if the CI cu130 leg fails at "Log in to Docker Hub", the user must add repo secrets `DOCKERHUB_USERNAME` (=`madponyinteractive`) + `DOCKERHUB_TOKEN` (a Docker Hub Read&Write access token) in the mpi-ci repo → Settings → Secrets and variables → Actions.
- **`wsl --shutdown` + vhdx compact** to reclaim disk FILE space after pruning (Step 0
  frees space inside the vhdx; the file itself only shrinks here). Close VS Code first
  (it holds a WSL handle), then PowerShell (admin): `wsl --shutdown`, then
  `Optimize-VHD -Path "%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx" -Mode Full`
  (Hyper-V) or diskpart `compact vdisk`. Also frees the Docker VM RAM. USER-only —
  it kills the WSL session (and VS Code's terminal).
- **Live verify = USER-only.** After the user redeploys a fresh Pod, confirm via the app-log image line + `/health` `wrapper_version`.

### Build card "done" definition (MPI-119)
**Push success ≠ done.** A build card moves to `done` only when ALL hold:
1. Both tags pushed (cu130 → Docker Hub + cpu → GHCR).
2. Both public (manual gate — Docker Hub repo + GHCR package).
3. **5a pull-verify passes** for both pushed tags.
4. **5b boot smoke passes** (cpu `/health` 200 with the right `wrapper_version`).
5. User's live Pod verify confirms the image line + `wrapper_version` (ideally on a 4090 AND a 5090 — one cu130 tag now serves both).

Until 1–5, the card stays `doing`. Then remove the "Pending for the NEXT rebuild"
block in the pod README.

---

## Flow B — Builder image (cu130, LOCAL ONLY — no CI, no dispatch)

1. **`<ver>`:** new tag, e.g. `0.1.3`. Ask the user.
2. **Parity SHA:** the Builder Dockerfile pins `COMFYUI_REF` — must equal the product cu130 image's. Bump both together if changing. (Both are cu130 now — MPI-189; the old "Builder cu130 vs product cu128" divergence is gone.)
3. **Build (local):** Builder stays on GHCR (only the product GPU image moved to Docker Hub).
```
cd c:/AI/Mpi/mpi-ci/cubric-vision-builder
gh auth token | docker login ghcr.io -u "$(gh api user -q .login)" --password-stdin
docker build -t ghcr.io/madponyinteractive/cubric-vision-builder:v<ver>-cu130 -f Dockerfile .
docker run --rm --entrypoint python ghcr.io/madponyinteractive/cubric-vision-builder:v<ver>-cu130 \
  -c "import torch;print('torch', torch.__version__, torch.version.cuda)"
docker push ghcr.io/madponyinteractive/cubric-vision-builder:v<ver>-cu130
```
4. **Manual gates (tell the user):**
   - Make the GHCR `cubric-vision-builder` package PUBLIC (first push only).
   - Bump the **Cubric Vision Builder** RunPod template (id `2brluktxb4`) image to the new tag — USER does this in the console.
   - `wsl --shutdown` to free VM RAM.

---

## After either flow
Offer to update the relevant kanban card and the "Pending for the NEXT rebuild" / "Current shipped tag" notes in the matching README (ask before editing — DOCUMENTATION DRIFT rule).
