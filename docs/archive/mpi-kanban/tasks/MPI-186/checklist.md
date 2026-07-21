# MPI-186 — Checklist (research-settled: registry + shrink)

## Research (DONE 2026-07-04 — from docs, no Pods spent)
- [x] Cold-start mechanism researched (research/runpod-coldstart-docs.md) — per-host cache; ours cold-pulls GHCR
- [x] Dead levers confirmed: template registration, "Official" chasing, FlashBoot (Serverless-only)
- [x] Real levers confirmed: image size, Docker Hub>GHCR, Secure Cloud, host reuse
- [x] Serverless fit assessed (research/serverless-fit.md) — NOT a fit (breaks live preview + warm session)

## Phase 1 — magnitude measurements (only these need live numbers)
- [ ] 1a. Push one-off copy to Docker Hub; cold-pull GHCR vs Docker Hub on a fresh RunPod host → seconds (USER-run Pod)
- [ ] 1b. `docker history` current image → per-layer size table (agent/CI, no Pod)

## Phase 2 — shrink cut-list (read-only survey; edits land in MPI-189)
- [ ] Multi-stage feasibility: sage in -devel stage, ship -runtime base; measure size delta
- [ ] Confirm pip cache off everywhere; .pyc/__pycache__ strippable
- [ ] Ranked/sized cut-list + "do not touch" (torch, sage) in research/decision.md

## Phase 3 — WRITE THE DECISION (deliverable → feeds MPI-189)
- [ ] decision.md: cold-start cause (settled) + registry choice + 1a seconds
- [ ] decision.md: placement (Secure Cloud; Stop-not-Delete) note
- [ ] decision.md: ranked shrink cut-list (apply-in-189 / skip)
- [ ] decision.md: serverless explicitly OUT (link serverless-fit.md)
- [ ] Update MPI-189 card body with the decision summary
- [ ] validation.md records decision + evidence → card done
