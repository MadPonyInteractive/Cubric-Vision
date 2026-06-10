# RunPod Remote Engine Investigation

Date: 2026-06-10

## Approved Direction

Use RunPod Secure Cloud only. Community Cloud is out of scope because it is unstable and limited for this feature.

Use a Cubric-owned hidden RunPod template. The desktop app uses the user's RunPod API key to create/start/stop Pods and attach a persistent network volume. The Pod runs ComfyUI plus a Cubric wrapper HTTP service. Cubric talks to the wrapper through RunPod HTTP proxy with an app-generated token.

## RunPod Findings

- Pod templates package image name, container disk, volume settings, exposed ports, environment variables, and startup commands.
- Templates can be private/custom. RunPod REST supports listing and creating templates.
- Pod creation supports `templateId`, `networkVolumeId`, `gpuTypeIds`, `allowedCudaVersions`, `ports`, `volumeMountPath`, and Secure/Community cloud selection.
- Pod lifecycle supports create, start/resume, stop, restart/reset, and delete through REST.
- Exposed HTTP services are reachable at `https://[POD_ID]-[INTERNAL_PORT].proxy.runpod.net`.
- Network volumes are persistent and portable storage that survives compute termination. For Pods, they are Secure Cloud-only, mount at `/workspace`, and must be attached during Pod deployment.
- Network volumes constrain data center/GPU availability. Moving data between volumes requires manual copy/S3/runpodctl/rsync; data does not sync automatically across data centers.
- RunPod GPU list includes consumer, datacenter, and workstation cards with different VRAM. Cubric should gate by VRAM and compatibility profile, not just availability.

Primary docs consulted:

- https://docs.runpod.io/pods/overview
- https://docs.runpod.io/pods/templates/overview
- https://docs.runpod.io/pods/templates/manage-templates
- https://docs.runpod.io/pods/templates/create-custom-template
- https://docs.runpod.io/pods/configuration/expose-ports
- https://docs.runpod.io/pods/configuration/use-ssh
- https://docs.runpod.io/storage/network-volumes
- https://docs.runpod.io/api-reference/pods/POST/pods
- https://docs.runpod.io/api-reference/pods/POST/pods/podId/start
- https://docs.runpod.io/api-reference/pods/POST/pods/podId/stop
- https://docs.runpod.io/api-reference/network-volumes/POST/networkvolumes
- https://docs.runpod.io/api-reference/templates/GET/templates
- https://docs.runpod.io/api-reference/templates/POST/templates
- https://docs.runpod.io/references/gpu-types

## OneTrainer Reference

OneTrainer has a real RunPod implementation in the public `Nerogar/OneTrainer` repo. A shallow clone was inspected under `C:\tmp\OneTrainer-runpod-investigation`.

Useful files:

- `modules/cloud/RunpodCloud.py`
- `modules/cloud/LinuxCloud.py`
- `modules/cloud/BaseCloud.py`
- `modules/cloud/BaseSSHFileSync.py`
- `modules/trainer/CloudTrainer.py`
- `modules/ui/CloudTab.py`
- `resources/docker/RunPod-NVIDIA-CLI.Dockerfile`

Pattern:

- Uses the RunPod Python SDK with user API key.
- Creates a Pod from a hardcoded template ID.
- Supports stop, terminate, and resume.
- Waits for usable public IP/port after resume because RunPod can report stale/incorrect runtime data briefly.
- Uses SSH/Fabric/SCP/SFTP for command execution, file sync, detached process control, callback polling, and TensorBoard tunnel.
- Builds a RunPod-specific Docker image from a RunPod PyTorch base image and symlinks `/workspace/OneTrainer` to preinstalled code.

Cubric should borrow:

- User-owned RunPod API key model.
- Template ID based Pod creation.
- Resume/start polling that does not trust the first runtime payload.
- Clear stop/delete lifecycle actions.
- Optional SSH only for diagnostics/repair.

Cubric should not copy:

- SSH/SCP as the normal generation transport.
- Training-specific config upload/download loops.
- Detached trainer control pipes/callback files.

## Design Implications

- HTTP wrapper is the correct v1 transport because Cubric generation is request/progress/result oriented and already has a controlled client-side Cue queue.
- Raw ComfyUI should not be the public API. The wrapper should enforce Cubric workflow bundle compatibility, auth, progress normalization, output collection, interrupt behavior, and manifest checks.
- The remote volume needs a manifest to prevent accidental reuse across incompatible template/PyTorch/CUDA/custom-node/workflow profiles.
- GPU selection should be gated by Secure Cloud availability, VRAM, allowed CUDA/template profile, and the existing volume manifest.
- Switching GPU families or template profiles should produce a repair/reinitialize decision, not a best-effort start.
