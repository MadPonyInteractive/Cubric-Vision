# MPI-342 Plan

Full context in brief.md. Research settled 2026-07-23 (see validation.md).

## Phases

### Phase 1: Pin edits
Four sites, one pass:
- dev_configs/node_lock.json - comfyui.core.tag v0.28.0 + commit 700821e1364eaab0e8f21c538a2131719fec57bf; frontend comfyui-frontend-package 1.45.21, comfyui-workflow-templates 0.11.9
- dev_configs/system_dependencies.json - engine.version 0.28.0 (LOCAL engine)
- mpi-ci/cubric-vision-pod/node_lock.json - fresh copy of the canonical lock
- mpi-ci/cubric-vision-builder/Dockerfile - COMFYUI_REF -> v0.28.0 (MPI-183 retarget)

**Verify:** git diff shows the 4 sites; the two node_lock.json copies are byte-identical; no 0.27.0 left outside docs/history and workflow template "ver" fields.

### Phase 2: CI dev image build
/build-pod-image dev dispatch at manifest_version 0.17.0-dev, BOTH legs (GPU + CPU), comfyui_ref = the TAG v0.28.0. Bundles MPI-341 (already committed at mpi-ci 41a5517).

**Verify:** both legs green; MPI-341 smoke layer passes.

### Phase 3: MPI-341 verification (all four, build-gated)
1. Smoke layer passes on the clean dev build.
2. Unpin kornia==0.8.2, rebuild, build MUST fail at the smoke layer on the LTXVideo import; restore the pin.
3. pip list in the final image shows +cu130 for all three torch packages; /opt/constraints.txt holds the three ==...+cu130 lines.
4. One LTX gen on the dev Pod.

### Phase 4: MPI-340 build-gated leg
Move POD_IMAGE_VERSION_DEV and POD_IMAGE_VERSION_CPU_DEV in routes/remotePodLifecycle.js to the real 0.17.0-dev tags, restart, create a Pod from a source run, confirm the pulled image is the -dev tag and a released run still resolves v0.16.0.

### Phase 5: Workflow sweep on the dev Pod
Every workflow still loads on 0.28: LTX 2.3, Krea2 t2i + edit + masked edit (no seam, MPI-282 acceptance), Qwen-Edit, Head Swap. Local engine on 0.28 too.

## Verification

**Verify mode:** user-ux (phases 2-5 need a live dev Pod and the user's eyes; phase 1 is auto)
