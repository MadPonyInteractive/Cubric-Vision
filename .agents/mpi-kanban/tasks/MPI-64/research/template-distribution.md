# Template Distribution — MPI-64 Design Record

**Status:** Decision reached. HIGH-RISK UNKNOWN RESOLVED (see §1). Ready to proceed to Phase 2 template creation.

---

## Decision Summary

| Question | Decision |
|---|---|
| Template creation path (a/b/c) | **(a) Cubric-owned PUBLIC template** (`isPublic: true`). Any user's API key can deploy a Pod from a public template by its ID. |
| Image registry | **GHCR** (`ghcr.io/madponyinteractive/cubric-vision-pod`) — no anonymous pull rate-limit; free for public images. |
| Build/publish pipeline | **Private `mpi-ci` GitHub repo** workflow, consistent with existing portable-build CI split. |
| Image tagging | `v{VOLUME_MANIFEST_VERSION}` (e.g. `v1.0.0`) plus a rolling `:latest` alias for the current stable. |

---

## §1 — Critical Constraint Resolution: Template Cross-Account Deployability

### The Question

A user's RunPod API key can only deploy templates that are **visible to their account**. The constraint was:

> Can a Cubric-owned private/"hidden" template be deployed by other users' API keys?  
> Or must the app programmatically create a template in the user's own account?  
> Or must we use a public community template?

### Answer: Option (a) — Public Template, Cubric-Owned

**Evidence gathered (2026-06-11):**

1. **`GET /templates` docs** (`https://docs.runpod.io/api-reference/templates/GET/templates`):
   - The `isPublic` boolean means "a template is public and can be used by any RunPod user."
   - The default response returns only the caller's own templates; passing `includePublicTemplates=true` also returns all public templates.
   - This establishes that `isPublic: true` grants any-user access, not just the owner.

2. **`POST /templates` docs** (`https://docs.runpod.io/api-reference/templates/POST/templates`):
   - Accepts an `isPublic` boolean. When `true`: "the template is visible to other Runpod users." The response returns a unique `id` that other users can reference.

3. **Manage-templates docs** (`https://docs.runpod.io/pods/templates/manage-templates`):
   - "Public templates are available to **all RunPod users** in the Explore section of the console, while private templates are only accessible to you or your team members."

4. **Verified real-world precedent — ValyrianTech ComfyUI+Flux template** (`https://github.com/ValyrianTech/ComfyUI_with_Flux`):
   - The README links `https://runpod.io/console/deploy?template=rzg5z3pls5` — this is a single hardcoded template ID owned by the template author, used directly by all deploying users. No per-user template creation.
   - A second template (`aomdggbx0y`) follows the same pattern.

5. **Official RunPod ComfyUI templates** (`https://docs.runpod.io/tutorials/pods/comfyui`):
   - RunPod's own docs reference fixed template IDs `cw3nka7d08` (standard) and `2lv7ev3wfp` (Blackwell) for community-wide deployment via console. Same pattern — any user deploys from the owner's template ID.

6. **OneTrainer cross-check:** OneTrainer's hardcoded `template_id` in `RunpodCloud.py` follows the identical pattern: a single ID deployed by all users, consistent with it being a public template.

### Residual Ambiguity (documented, not blocking)

RunPod's docs do **not** explicitly state whether a private/hidden template's ID can be used in a `POST /pods` API call by a non-owner. The manage-templates page says private templates are "only accessible to you or your team members" but does not specify whether the API enforces this at pod-creation time or only at the console UI level.

**Risk assessment:** LOW. The evidence from real-world public-template deployments (ValyrianTech, official RunPod ComfyUI, OneTrainer) all converge on the public-template-ID pattern. There is no documented path for distributing a private template ID to arbitrary users. Attempting to build on private cross-account access would be unsupported behavior with no doc backing and possible silent breakage on a RunPod policy change.

**Decision:** Use `isPublic: true`. Do not rely on private cross-account template access.

---

## §2 — Template Ownership and Lifecycle

### Who Creates the Template

A single Cubric-owned RunPod account creates and maintains the template. The template ID is hardcoded into the Cubric Vision app (same as ValyrianTech / OneTrainer pattern). Users never call `POST /templates` — they only call `POST /pods` with the published Cubric template ID and their own API key.

### Template Fields

```json
{
  "name": "cubric-vision-pod-v{VOLUME_MANIFEST_VERSION}",
  "imageName": "ghcr.io/madponyinteractive/cubric-vision-pod:v{VOLUME_MANIFEST_VERSION}",
  "isPublic": true,
  "isServerless": false,
  "containerDiskInGb": 20,
  "volumeMountPath": "/workspace",
  "ports": "8765/http",
  "env": [
    { "key": "CUBRIC_WRAPPER_PORT", "value": "8765" }
  ],
  "readme": "Cubric Vision remote engine pod. Requires a Cubric Vision network volume attached at /workspace."
}
```

Notes:
- Port `8765` is the Cubric wrapper service. Raw ComfyUI (`8188`) is **not** exposed publicly — the wrapper proxies to it internally.
- `containerDiskInGb: 20` covers the wrapper + ComfyUI install + scratch space. Models live on the network volume.
- `CUBRIC_WRAPPER_PORT` env var lets the startup script be port-agnostic for future template variants.
- No `volumeInGb` set at template level — the network volume is attached at Pod creation time by the app via `networkVolumeId`, not baked into the template.

### Template Versioning

A new template is published per `VOLUME_MANIFEST_VERSION` bump. The app hardcodes the template ID for the current supported manifest version. Multiple template versions can coexist as public templates (old ones remain deployable for users on older volume manifests until deprecated).

Template IDs are stored in `js/core/appStage.js` or a dedicated `js/core/remoteEngine.js` constants file — decided at implementation time, not here.

---

## §3 — Docker Image Registry

### Decision: GHCR (`ghcr.io`)

**Registry:** `ghcr.io/madponyinteractive/cubric-vision-pod`

**Rationale vs Docker Hub:**

| Criterion | GHCR | Docker Hub (free tier) |
|---|---|---|
| Anonymous pull rate limit | None for public images | 100–200 pulls/6 h per IP (anonymous) |
| Authenticated pull rate limit | None for public images | 200 pulls/6 h (free) |
| Cost for public images | Free | Free |
| CI auth in `mpi-ci` | `GITHUB_TOKEN` automatic | Separate Docker Hub credentials secret |
| Namespace control | Under `madponyinteractive` org — consistent with existing repos | Separate Docker Hub account to maintain |
| RunPod compatibility | Confirmed: RunPod pulls from GHCR without special auth for public images | Confirmed: widely used |

Docker Hub's anonymous rate limit is a real operational risk: RunPod data centers pull images from their own egress IP pools. Many concurrent Pod starts from shared datacenter IPs could hit the anonymous pull cap, causing Pod boot failures for users. GHCR eliminates this risk entirely for public images.

**Image name pattern:**
- `ghcr.io/madponyinteractive/cubric-vision-pod:v1.0.0` — pinned release
- `ghcr.io/madponyinteractive/cubric-vision-pod:latest` — rolling alias to current stable

RunPod's template `imageName` field will reference the pinned tag (`v{VOLUME_MANIFEST_VERSION}`), not `:latest`, so a template update (new manifest version) requires a new template record. This is intentional — it makes the image↔manifest↔template binding explicit and avoids silent drift.

---

## §4 — Image Tagging Scheme

Tags are tied to `VOLUME_MANIFEST_VERSION` (semver, defined in `research/volume-manifest-schema.md`).

| Tag | Meaning |
|---|---|
| `v1.0.0` | Exact image for volume manifest version 1.0.0 |
| `v1.0.0-rc.1` | Release candidate for testing before template publish |
| `latest` | Points to the most recent stable release tag |
| `sha-{COMMIT_SHA_SHORT}` | Dev/CI builds for PR testing (not published to template) |

**Template ↔ image ↔ manifest binding:**

```
RunPod template ID  ──────►  imageName: ghcr.io/.../pod:v{M}
                                           │
                            VOLUME_MANIFEST_VERSION = M
                                           │
                            /workspace/cubric/manifest.json
                              { "templateVersion": "M", ... }
```

The volume manifest check at Pod boot compares the running image's `CUBRIC_MANIFEST_VERSION` env var against `/workspace/cubric/manifest.json`. Mismatch → wrapper returns a `503 MANIFEST_MISMATCH` to the app before accepting any generation request.

---

## §5 — Build and Publish Pipeline

### Repository

Builds run in the private `MadPonyInteractive/mpi-ci` GitHub repo — consistent with the existing portable-build CI split (see `c:\AI\Mpi\Cubric-Vision\.claude\memory\project_ci_split_mpi_ci.md`).

Keeping the Dockerfile in `mpi-ci` avoids exposing the exact wrapper implementation in the public Cubric-Vision repo and keeps CI secrets (GHCR push token, RunPod template-management API key) isolated.

### Workflow Sketch

```
mpi-ci / .github/workflows/build-pod-image.yml

Trigger:
  - workflow_dispatch (manual, with version input)
  - push to main matching tags v*.*.*-pod

Steps:
  1. Checkout mpi-ci
  2. Set IMAGE_TAG from tag or workflow_dispatch input
  3. docker buildx build
       --platform linux/amd64
       --build-arg CUBRIC_MANIFEST_VERSION=$IMAGE_TAG
       -t ghcr.io/madponyinteractive/cubric-vision-pod:$IMAGE_TAG
       -t ghcr.io/madponyinteractive/cubric-vision-pod:latest
       .
  4. docker push (both tags)
  5. (Optional) call RunPod REST API to create/update the public template
     referencing the new imageName — or do this manually for v1.
```

The `CUBRIC_MANIFEST_VERSION` build arg is baked into the image as an env var so the wrapper can self-report its version at runtime and the volume manifest check has a stable source.

### Dockerfile Base

Extend a RunPod PyTorch base image (same pattern as OneTrainer's `RunPod-NVIDIA-CLI.Dockerfile`):

```dockerfile
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ARG CUBRIC_MANIFEST_VERSION
ENV CUBRIC_MANIFEST_VERSION=${CUBRIC_MANIFEST_VERSION}
ENV CUBRIC_WRAPPER_PORT=8765

# Install ComfyUI + custom node bundle into /opt/comfyui (not /workspace — volume is runtime data only)
# Install Cubric wrapper service
# Set startup entrypoint

EXPOSE 8765
```

Models, custom nodes that need per-volume state, and runtime caches go to `/workspace` (the network volume). The ComfyUI install itself lives in the container image under `/opt/comfyui` to keep the volume lean and the image deterministic.

---

## §6 — Verification Checklist

- [ ] Cubric RunPod account creates the template with `isPublic: true` and records the returned template ID.
- [ ] A second RunPod account (user simulation) can deploy a Pod using that template ID via `POST /pods` with only its own API key — no template creation step.
- [ ] Pod boot reaches wrapper ready state and the manifest version env var matches the tag used at build time.
- [ ] `GET /templates?includePublicTemplates=true` from the second account includes the Cubric template.
- [ ] Docker pull of `ghcr.io/madponyinteractive/cubric-vision-pod:v{M}` succeeds without authentication (anonymous pull from public GHCR image).
- [ ] Template update (new manifest version) publishes a new template record with a new ID; old template remains live for backward compatibility until deprecated.
- [ ] Image tag `v{M}` is immutable after publish (no silent re-tag of a pinned release).

---

## Citations

- RunPod `GET /templates` reference: https://docs.runpod.io/api-reference/templates/GET/templates
- RunPod `POST /templates` reference: https://docs.runpod.io/api-reference/templates/POST/templates
- RunPod manage-templates: https://docs.runpod.io/pods/templates/manage-templates
- RunPod templates overview: https://docs.runpod.io/pods/templates/overview
- RunPod `POST /pods` reference: https://docs.runpod.io/api-reference/pods/POST/pods
- RunPod ComfyUI tutorial (template IDs `cw3nka7d08`, `2lv7ev3wfp`): https://docs.runpod.io/tutorials/pods/comfyui
- ValyrianTech ComfyUI+Flux (public template `rzg5z3pls5`): https://github.com/ValyrianTech/ComfyUI_with_Flux
- GHCR rate limit (none for public images): https://github.com/orgs/community/discussions/49671
- GHCR vs Docker Hub comparison: https://blog.devops.dev/docker-hub-or-ghcr-or-ecr-lazy-mans-guide-4da1d943d26e
