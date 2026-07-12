# MPI-186 — Validation

This is a DECISION card. "Done" = architecture decided + evidence recorded (NOT an image
shipped — that's MPI-189). CONCLUDED 2026-07-04, entirely from docs + local `docker history`,
zero Pods spent.

## Decision (research/decision.md is the full spec MPI-189 builds to)
1. **Cold-start cause** — per-host layer cache; our private image cold-pulls the registry on
   every fresh host (weights already on volume, so ~5min = the image pull). SETTLED from docs.
2. **Registry** — GHCR → **Docker Hub** (documented GHCR pull-stalls). App repoint of
   POD_IMAGE_BASE + CI push target. Docker Hub setup agent-side (free public repo, no user cost).
3. **Shrink** — MEASURED: cu128 50.2GB on-disk / ~18-20GB compressed pull. ~13GB uncompressed
   free-to-cut = nightly-torch (6.94GB, uninstalled-then-replaced) + CUDA -dev toolkit (~6GB,
   build-only via multi-stage sage). Target ~30% smaller pull. KEEP torch trio + sage.
4. **Placement** — already Secure Cloud; Stop-not-Delete already in app (bonus). No action.
5. **Serverless** — OUT (breaks live preview + warm session); future batch-export only.

## Evidence
- research/runpod-coldstart-docs.md — cold-start/caching mechanism, real vs dead levers (cited).
- research/serverless-fit.md — why serverless is out (cited).
- research/decision.md — the consolidated spec + measured shrink table.
- `docker history` output (in event log 2026-07-04T16:33) — layer sizes.

## Owed → RESOLVED
The one live measurement (GHCR-vs-DockerHub pull seconds) is **folded into MPI-189** (user
decision): the first cu130 Pod deploy is the real before/after, no throwaway push needed.

## Outcome
MPI-189 card body updated with the full decision + ungated. MPI-186 = DONE (decision made,
evidence recorded, next-card 189 startable from research/decision.md alone).

## Superseded
Original volume-relocation plan (aimdo `.so` spike, pip --target to volume) ABANDONED —
ComfyUI already boots from local /opt, not a volume stream. research/investigation.md kept as
reference evidence for why NOT to relocate.
