# D — mpi-ci Pod Image (findings)

## Repo layout c:\AI\Mpi\mpi-ci\
- cubric-vision-pod/ = PRODUCT image (users connect). cubric-vision-builder/ = authoring box (no wrapper).
- Dockerfile: cubric-vision-pod/Dockerfile. Wrapper: cubric-vision-pod/wrapper/wrapper.py. start.sh, bootstrap.sh, publish-runtime.sh, node_lock.json (build copy).
- CI: .github/workflows/cubric-vision-pod-image.yml (workflow_dispatch only).

## Dockerfile bake (Dockerfile ~L147-205)
- COPY node_lock.json /opt/node_lock.json; python RUN block iterates lock['nodes'], skips `if not e.get('installOnEngine'): continue`.
- git clone repo + git checkout commit (GitHub, NOT R2). pip only if installRequirements. NO .mpi_node_commit marker.
- CHANGE: skip code-only (add `or not e.get('installRequirements')` to continue) + stamp .mpi_node_commit per baked node.

## Wrapper wrapper.py (0.2.32; memory said 0.2.31 — file default bumped, confirm before build)
- POST /wrapper/models/install L1953-2020 → custom_nodes → _run_node_install L1827-1909.
- _run_node_install: httpx stream GitHub archive zip → extract → rename <repo>-<branch>→filename → _install_node_requirements → _manifest_record_model → SSE needs_comfy_restart.
- R2 = just point `url` field at R2 (downloader host-agnostic). Marker stamp = NEW addition.
- _is_complete_on_disk L1117-1125 baked-node shortcut: returns installed if /opt/ComfyUI/custom_nodes/<filename> exists. When code-only nodes leave bake, shortcut stops firing → app detects absent → install request. INTENDED.

## Manifest wrapper.py L1237-1291
- MANIFEST_PATH=/workspace/cubric/manifest.json. _manifest_record_model upserts models[] by id.
- _stamp_manifest_provenance @ startup writes wrapper_version, comfyui_ref etc.
- ADD: baked_nodes {filename→commit} read from .mpi_node_commit at startup so app can compare vs node_lock → warn if stale. Plus volume node commit per models[] entry.

## R2 access
- Build weights: aria2c + https://models.cubric.studio/... URLs (dl() bash fn + sha256 verify).
- Runtime files (start.sh/wrapper): rclone config ~/.secrets/rclone-r2.conf remote cubric-r2, bucket cubric-pod-runtime, https://pod.cubric.studio/vision/. bootstrap curl -fsSL.
- Volume node zips (MPI-222): reuse wrapper httpx path, url→R2. No new download mech; only URL source changes.

## node_lock travel
- Canonical: Cubric-Vision/dev_configs/node_lock.json. Build copy: mpi-ci/cubric-vision-pod/node_lock.json. build-pod-image skill cp's canonical→mpi-ci copy, commit, CI context=./cubric-vision-pod.
- DRIFT LIVE: mpi-ci copy MpiNodes=780c7c3 (stale) vs canonical 2d409b5; mpi-ci copy MISSING RES4LYF. This IS the MPI-222 bug.

## Image build/publish
- workflow_dispatch: gh workflow run cubric-vision-pod-image.yml -f manifest_version -f comfyui_ref(TAG) -f wrapper_version -f push_latest.
- tags: docker.io/madponyinteractive/cubric-vision-pod:v<ver>-cu130 (Hub GPU), ghcr...-cpu.
- rebuild needed: Dockerfile/node_lock(baked)/bootstrap change. start.sh+wrapper.py = R2-fetched at boot, NO rebuild.

## start.sh gotchas
- L205-229: EVERY boot re-installs pip reqs for volume nodes (reuse point for volume-node freshness).
- L232-246: MpiNodes git pull hook on /opt/ComfyUI/custom_nodes/ComfyUI-MpiNodes — MUST REMOVE when MpiNodes→volume (dir won't exist).
- L173-203: baked-node quarantine (.mpi193.disabled) — self-adjusts (former baked nodes no longer in BAKED_CANON).

## FLAGS
1. MpiNodes git-pull hook start.sh L239 must be removed.
2. No R2 zip infra for nodes exists — must add (new source type or R2 url in lock + upload step).
3. mpi-ci node_lock STALE — resync before rebuild.
4. .mpi_node_commit write (Dockerfile) + read (wrapper startup) both new.
5. wrapper file says 0.2.32 not 0.2.31 — confirm before build-arg stamp.
