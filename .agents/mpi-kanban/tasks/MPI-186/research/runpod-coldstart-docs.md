# MPI-186 — RunPod cold-start / image-caching research (docs, 2026-07-04)

Researched from RunPod docs + blog + staff Discord answers BEFORE any live probe, to learn
the mechanism cheaply. This settles most of the original "decision spike" from docs alone.

## Why RunPod's Official image (`runpod/comfyui:cuda13.0`) boots near-instant

**Popularity-driven PER-HOST Docker layer cache — NOT a fleet pre-seed, NOT an "Official"
privilege.** RunPod caches pulled image layers on each host's local disk (standard Docker).
Images used by many people are already on nearly every host, so they start in seconds with no
pull. RunPod's own images are massively popular → present on most hosts. Our private image has
been seen by ~one host ever → every fresh host cold-pulls it from GHCR.
- Source: RunPod staff/community, AnswerOverflow — "images used more often have a higher
  chance of being cached… if you're using your own image, very low chance of being cached
  because different machines even within the same datacenter."
- The "Official / Verified / Community" tiers are **curation labels**, not caching tiers.
  COMMUNITY-FOLKLORE (staff), no official doc describes a pre-seed program.

## DEAD levers (confirmed — do NOT spend Pods testing these)

| Lever | Why dead | Source |
|---|---|---|
| Register a RunPod **template** | Pure saved deploy config (image ref + env + ports + disk). Zero effect on image pull. Docs: "first deployment may take a few minutes as RunPod downloads your image" — even with a registered template. | OFFICIAL-DOCS (create-custom-template) |
| Chase **"Official" status** | Not a programmatic caching tier; not obtainable for a private image. Official images look pre-cached only because they're popular. | COMMUNITY (staff) |
| **FlashBoot** | **Serverless-ONLY, explicit.** Does NOT exist for GPU Pods. Caches a running RAM/VRAM worker snapshot, not our case. | OFFICIAL-DOCS (FlashBoot blog) |
| RunPod-internal registry | Announced, NOT shipped yet. Can't use today. | OFFICIAL-DOCS (blog) |

## REAL levers (documented / staff-confirmed)

| Lever | Effect | Confidence |
|---|---|---|
| **Image size ↓** | Smaller image = faster cold pull on every fresh host. | REAL (docs + community) |
| **Docker Hub over GHCR** | GHCR has documented pull-speed / Fastly-stall issues on RunPod hosts; Docker Hub is the tested/default path. Community: GHCR "~2 min" typical, stalls on some uplinks. | REAL (community, strong) |
| **Secure Cloud over Community Cloud** | Host NIC 200–400 Gbps (Secure) vs 10–100 Gbps (Community) → faster cold pull. | REAL — but **already ours** (user-confirmed 2026-07-04: we run on Secure Cloud). No action. |
| **Host reuse (Stop, not Delete)** | On-Demand may reschedule on a recently-used host with layers already cached. Probabilistic. | REAL — **already in app** (user: rarely lands same host, sometimes does; kept as bonus). Do not over-invest. |
| **Weights on Network Volume, not baked** | Don't bake big weights into the image. | REAL (docs) — **we ALREADY do this** (weights on volume, code baked). |

## What this means for our ~5 min cold-start

We already keep weights on the volume (aligned with RunPod's own guidance). So the ~5 min is
the **image PULL itself** — a big baked image (torch + sage + ComfyUI deps) on **GHCR**,
possibly on **Community Cloud** hosts. The two highest-signal, docs-backed fixes:
1. **GHCR → Docker Hub** (registry pull path).
2. **Shrink** the baked image (multi-stage `-runtime` base for sage is the likely big cut).
Plus check we prefer **Secure Cloud** placement, and that reconnect uses **Stop** not Delete.

## The ONLY things still worth a live measurement (magnitude, not mechanism)

Docs give direction but not numbers for OUR image:
- **GHCR vs Docker Hub cold-pull seconds** for our exact image on a RunPod host.
- **`docker history`** per-layer sizes → the shrink cut-list + measured before/after.
Everything else is decided from docs above.

## Sources
- FlashBoot (Serverless-only): https://www.runpod.io/blog/introducing-flashboot-serverless-cold-start
- What's new in Serverless (registry announce, RAM/VRAM paging): https://www.runpod.io/blog/whats-new-in-runpod-serverless-faster-cold-starts-batch-inference-and-no-docker-deploys
- Build a custom Pod template (first deploy downloads image): https://docs.runpod.io/pods/templates/create-custom-template
- Network volumes (throughput, weights-on-volume guidance): https://docs.runpod.io/storage/network-volumes
- Manage Pods (Stop vs Delete, host reuse): https://docs.runpod.io/pods/manage-pods
- Docker image cache (staff): https://www.answeroverflow.com/m/1213081606819024917
- DockerHub caching rules (staff): https://www.answeroverflow.com/m/1256663565520080979
- Throttled registry download: https://www.answeroverflow.com/m/1319757071448543346
- GHCR pull issues: https://www.answeroverflow.com/m/1478777078148108328
