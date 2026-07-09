# MPI-78 Validation

## State: scope grew to an IMAGE fix — verify BLOCKED on a cu124 rebuild (handed to MPI-103 image-owner)

## Live test 2+3 (2026-06-16) — disk-size control was a no-op; fix moved into the image

Connect + model install WORK on an ephemeral Pod, BUT the model lands on RunPod's default ~20GB
volume at /workspace, NOT the user's chosen container disk:
- Telemetry: **Disk usage 31MB/60GB (empty), Volume usage 7GB/20GB (the SDXL model).**
- Proven: RunPod auto-mounts a ~20GB default Pod volume at /workspace on EVERY Pod regardless of
  the create spec; omitting `volumeMountPath` app-side did nothing. start.sh hardcoded all model
  paths to /workspace → the user's container-disk size was always ignored, capped at ~20GB.

**Fix (now in the image — needs rebuild):** start.sh roots data on `/cubric-data` (container disk)
when `CUBRIC_EPHEMERAL=1`; app sends that env on ephemeral Pods. Handed to the MPI-103 image-owner
to rebuild **cu124** (no version bump — reuse v0.4.6; cu128/cpu not shipped yet). See message
86cb93af to MPI-103.

## Re-verify when cu124 is rebuilt: Disk usage climbs with the model, the 20GB default volume stays unused.

## ✅ VERIFIED (2026-06-16, Live test 4 — cu124 rebuilt with the start.sh fix)

L4 Any-region ephemeral Pod, model installed. Telemetry = exact pass condition:
- **Disk usage: 7 GB (12%) / 60 GB** — SDXL Realistic landed on the CONTAINER disk. ✅
- **Volume usage: 0 Bytes (0%) / 20 GB** — RunPod's default volume sits unused. ✅
- App REMOTE · ONLINE, model INSTALLED, session running.

The `CUBRIC_EPHEMERAL=1 → /cubric-data` image fix works end-to-end. The user's chosen
container-disk size is now where models go; the default volume is bypassed. MPI-78 complete:
no-volume "Any region" Pod creates, auto-places, sizes the disk, downloads models to ephemeral
container storage, Terminate ends spend. Commits owned by the MPI-103 image-owner (start.sh in
mpi-ci is theirs; remoteProxy.js/MpiSettings.js/shell.js/storage.js bundled in their pathspec
commit).

---

## (superseded) Earlier note — verify was thought to be app-side only

## Live test 1 (2026-06-16, Fabio drove the app + RunPod console)

**The MPI-78 feature works.** Settings → RunPod:
- Data Center dropdown showed **"Any region (no volume)"** as the lead option. ✅
- Picking it switched the panel to ephemeral mode: GPU dropdown listed the full
  Secure-Cloud catalogue (DC-unbound), the volume row became a **Container disk (GB)**
  input (set to 60), and the ephemeral warning rendered. ✅
- Connect enabled on GPU pick alone (A40), no volume required. ✅
- **Pod CREATED correctly** — RunPod console showed Pod `cubric-vision` `agwmquhuljseih`,
  **A40 x1, Disk column blank (no network volume), auto-placed, $0.01/hr.** This is exactly
  the no-volume "Any region" ephemeral Pod the card asked for. ✅

**Connect then FAILED — but NOT for an MPI-78 reason.** RunPod inbox:
```
We couldn't start your Pod agwmquhuljseih because there was a problem pulling the image.
Image name: ghcr.io/madponyinteractive/cubric-vision-pod:v0.4.6-cu124
Reason: IMAGE_NOT_FOUND: Error response from daemon: manifest unknown
```

**Root cause = the app points at `POD_IMAGE_VERSION = v0.4.6` (MPI-103's bump,
remoteProxy.js:68), but the v0.4.6 image is not built/pushed to GHCR yet** (`manifest
unknown`). The failure is at the image pull — downstream of everything MPI-78 touches.
MPI-78's create path is proven correct: it built a valid no-volume, auto-placed, sized-disk
spec; RunPod accepted it (201, Pod listed) and only failed when the host tried to pull a
non-existent image tag.

## Blocker

End-to-end verify (download a model to ephemeral disk → generate → terminate) needs an
image tag that actually exists on GHCR. The app is pinned to v0.4.6 (MPI-103). User decision
(2026-06-16): **WAIT for MPI-103's v0.4.6 image build** rather than temp-pin to v0.4.5. No
MPI-78 code change pending — re-run Test 1's Connect once v0.4.6-cu124 is public on GHCR.

## Remaining verify steps (run when v0.4.6 image is live)

1. Any-region Connect → Pod boots, wrapper ready, sage recompiles (non-fatal, ~5-15 min).
2. Install a small model → downloads to ephemeral `/workspace/mpi_models`, ComfyUI finds it.
3. Run one generation → completes.
4. Terminate → no Pod left running, no volume created, spend stops.
5. Regression: pick a real DC → volume badge + CPU option return, DC required, existing flow
   unchanged.
