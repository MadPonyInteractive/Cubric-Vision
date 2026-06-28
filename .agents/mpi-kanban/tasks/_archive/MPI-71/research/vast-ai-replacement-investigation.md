# Vast.ai RunPod Replacement Investigation Seed

Created: 2026-06-12
Actor: Codex

## Why This Card Exists

RunPod is currently painful for MPI-64 because available GPUs are often low availability or unavailable. MPI-64 needs a reliable user-facing remote engine path for Cubric Vision, not just a manual GPU rental workaround.

The current RunPod architecture uses a custom Docker image, wrapper service, token auth, persistent volume, app-managed lifecycle, and ComfyUI-shaped HTTP/WS proxying. A different provider can use a different implementation approach if it preserves those product requirements.

## Current Conclusion

Vast.ai is the leading fallback candidate to investigate next.

TensorDock is technically interesting but not currently reassuring enough to prioritize as the main replacement. Public reviews from late 2025 through June 2026 repeatedly mention failed VM provisioning, inaccessible VMs, GPU/driver failures, billing while unusable, and weak support. That is too close to the failure modes Cubric is trying to avoid.

Vast.ai has stronger public review volume and a better current trust signal. It is still a marketplace, so host variability remains a serious risk. The likely product answer is not "use any Vast host"; it is "build strict host filtering and a known-good profile around Vast."

## MPI-64 Compatibility Requirements To Test

- App-created lifecycle: create, start/stop/destroy instance through API.
- Custom runtime: run Cubric's GHCR Docker image or bootstrap it via cloud-init/startup command.
- Persistent data: attach or emulate persistent model storage across instance restarts/recreates.
- Public wrapper access: expose HTTP and WebSocket traffic reliably for Cubric wrapper/ComfyUI events.
- Token security: keep wrapper token and provider API key out of renderer storage/logs.
- GPU/driver compatibility: filter hosts by CUDA/driver capability before deploy, avoiding the current RunPod CUDA-floor failure class.
- Availability: identify GPU classes with medium/high real availability for image/video workloads.
- Billing guardrails: one active instance invariant, stop/delete behavior, and clear storage/runtime billing semantics.

## TensorDock Findings

Positive platform fit on paper:

- Core Compute VMs support network storage and dedicated/static IP style access.
- Docker is preinstalled on templates.
- Cloud-init can automate startup.
- Core Compute docs say stopped VMs can redeploy on any same-location server with the requested GPU available, which directly addresses host-pinning pain.
- Docs show ports can be opened and Linux VMs have broad port access by default.

Negative public signal:

- Trustpilot showed 1.6/5 from 25 reviews at investigation time.
- 24 reviews were in the prior 12 months and 96% were one-star.
- Recent complaints included failed VM starts, inaccessible machines, GPU/driver failures, support non-response, billing while unusable, and one ComfyUI/CUDA/PyTorch-related failure report.

Decision from this pass: TensorDock should be treated as a small paid pilot only, not the primary replacement candidate.

## Vast.ai Findings

Positive signal:

- Trustpilot showed 4.2/5 from 232 reviews at investigation time.
- 87 reviews were in the prior 12 months.
- Recent positive reviews specifically mention cheap GPUs being available and support responsiveness.
- Vast.ai positions itself as a global GPU marketplace with broad GPU availability and live platform rates.

Risks:

- Marketplace host variability is real.
- Some negative reviews mention instances losing GPU access, restarts, billing disputes, and poor support outcomes.
- Cubric would need provider-side filtering rather than naive deployment to any cheap host.

Likely implementation shape:

```text
Vast.ai instance + persistent/storage strategy + startup script/Docker pull
  -> run ghcr.io/madponyinteractive/cubric-vision-pod
  -> expose Cubric wrapper HTTP/WS port
  -> app-managed lifecycle adapter
```

This is a provider-adapter path, not a drop-in RunPod template migration.

## Source Links

- TensorDock homepage: https://www.tensordock.com/
- TensorDock Core Compute docs: https://docs.tensordock.com/virtual-machines/introduction-to-core-compute-vms
- TensorDock ports docs: https://docs.tensordock.com/virtual-machines/opening-ports-on-core-compute-vms
- TensorDock cloud-init docs: https://docs.tensordock.com/virtual-machines/cloud-init
- TensorDock Docker/Stable Diffusion docs: https://docs.tensordock.com/virtual-machines/running-stable-diffusion-in-docker
- TensorDock Trustpilot: https://www.trustpilot.com/review/tensordock.com
- Vast.ai pricing/platform page: https://vast.ai/pricing
- Vast.ai Trustpilot: https://www.trustpilot.com/review/vast.ai
- RunPod Trustpilot availability complaints reference: https://www.trustpilot.com/review/runpod.io

## Recommended Next Investigation

1. Inspect Vast.ai official docs/API for instance create/destroy, Docker image support, environment variables, port mapping, persistent volume/storage behavior, and host metadata.
2. Build a compatibility matrix against MPI-64 current architecture.
3. Define a minimal paid smoke test:
   - select one medium/high availability GPU class;
   - launch with Cubric wrapper image or startup script;
   - verify `nvidia-smi`, CUDA floor, wrapper `/health`, WSS preview path, model volume behavior, stop/delete billing behavior;
   - record failures and required adapter changes.
4. Decide whether MPI-64 should become "remote provider adapter" with RunPod and Vast backends, or whether Vast should replace RunPod as the primary path.
