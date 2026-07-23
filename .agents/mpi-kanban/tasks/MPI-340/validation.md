# MPI-340 — validation

## Shipped

### Code
- `routes/remotePodLifecycle.js`
  - `POD_IMAGE_VERSION_DEV` + `POD_IMAGE_VERSION_CPU_DEV` consts; `podImageForCard()`
    branches on `_devMode`.
  - **Deviation from brief (deliberate):** the dev consts ship EQUAL to the stable pins
    (`v0.16.0`), not `v0.17.0-dev`. Verified on Docker Hub that no `v0.17.0-dev-cu130` tag
    exists — pointing dev at an unbuilt tag 404s the pull and the Pod exits at boot (the
    exact `v0.10.3-cpu` trap the brief warns about). The branch is in place; MPI-341 builds
    the first dev image and then moves the DEV consts. Comment in-file says so.
  - `_createPodInternal` sets `spec.env.CUBRIC_RUNTIME_CHANNEL = 'dev'` when `_devMode`,
    OUTSIDE the `if (noGpu)` branch so CPU download Pods get it too.
- `c:/AI/Mpi/mpi-ci/cubric-vision-pod/publish-runtime.sh`
  - `dev` | `promote` | `stable` modes (anything else = usage error, so a typo'd channel
    can't publish to a folder no Pod reads).
  - `promote` = sha256 drift guard vs the live `vision/dev/manifest.json` (names the
    drifted file, refuses) then **server-side** rclone copy `vision/dev/* -> vision/stable/*`.
  - `stable` prints a loud 3-line warning that it bypasses dev.
  - `CUBRIC_RUNTIME_HOST` env override so the guard is testable against a fixture.
- `c:/AI/Mpi/mpi-ci/cubric-vision-pod/promote-guard.test.sh` — new.

### Docs / rules / skills (all 9 targets from the brief)
`CLAUDE.md` Context Router row · `docs/runpod-remote-engine.md` §5 (channels) + §6 (dev
image pins) · `docs/builder/02-image-and-rebuild.md` · `.claude/commands/build-pod-image.md`
(publish block + the DEV-consts note) · `.claude/rules/comfy_engine.md` (bake-vs-volume
bullet) · `docs/runpod-troubleshooting.md` (the line-70 RULE + the `/wrapper/ls` line) ·
`mpi-ci/cubric-vision-pod/README.md` "Runtime externalize" (+ channel table) ·
`.claude/rules/dos_and_donts.md` (new section) · `.claude/skills/mpi-release/SKILL.md`
Preconditions (manifest drift check, never auto-promote).

`mpi-version-bump` deliberately untouched — app version and Pod runtime are separate
artifacts on separate cadences.

## Verified (ran it, saw the result)

- `node --check routes/remotePodLifecycle.js` → clean.
- Resolver self-check (evaluates the REAL `podImageForCard` source in a vm with `_devMode`
  forced both ways): released → `docker.io/...:v0.16.0-cu130` + `ghcr.io/...:v0.16.0-cpu`,
  dev → its own consts. The release-safety assertion holds by construction: a non-dev build
  never reads a DEV const.
- `bash -n publish-runtime.sh` → clean.
- `bash promote-guard.test.sh` → PASS (6 checks): missing dev manifest refuses; drifted
  manifest refuses and names all three files; matching working-tree shas pass the guard.
  No R2 writes (refusals exit before rclone; rclone stubbed).

## Follow-up pass (same session)

- `.claude/commands/build-pod-image.md` — the dev/release split is in the FLOW now, not
  just two asides: top blockquote, step 1 (asks dev-or-release first, defaults to dev),
  step 4a dispatch (`manifest_version=<ver>-dev`, both legs), and a dev variant of the
  done-definition. **Contradiction fixed:** the MPI-119 version guard allowed only
  `^X.Y.Z$` and would have rejected the `0.17.0-dev` the same file told you to pass.
- `docs/runpod-remote-engine.md` §6 CUDA-floor bullet corrected (the pre-existing MPI-189
  drift noted below) — single cu130, `nvidia/cuda:13.0.3-runtime`, torch 2.12.0+cu130,
  flat `allowedCudaVersions ['13.0']`, SDPA-only.
- User published the dev runtime channel (`./publish-runtime.sh dev`) — item 4 below DONE.

## NOT verified — needs the user (live Pod)

1. **Source run (`_devMode` true), GPU Pod:** RunPod console → Pod → Logs → Container shows
   `create container ...:v0.16.0-cu130` (will read `-dev` once MPI-341 builds one) and the
   Pod log shows
   `[cubric-bootstrap] fetching runtime from https://pod.cubric.studio/vision/dev (channel=dev)`.
2. Same for a **CPU download-mode Pod** (`-cpu` tag, same `channel=dev` line).
3. **Portable build (`_devMode` false):** still resolves `v0.16.0-cu130` and `channel=stable`.
   The release-safety assertion — do not skip.
4. **Seed the dev channel** before (1): `./publish-runtime.sh dev` from
   `c:/AI/Mpi/mpi-ci/cubric-vision-pod/`. Not run here (live R2 write). Without it a dev Pod
   404s the fetch and silently falls back to the BAKED runtime — it boots fine, so the only
   symptom is edits appearing to do nothing.
5. **`promote` end-to-end** against real R2 (guard verified against fixtures only; the
   remote-to-remote copy path has never run).

## Follow-up spotted → fixed above

`docs/runpod-remote-engine.md` §6 bullet 2 ("Image CUDA floors") described the
`-cu128`/`-cu124` two-profile split MPI-189 deleted. Pre-existing drift; corrected on the
user's go (`8349f7e2`).
