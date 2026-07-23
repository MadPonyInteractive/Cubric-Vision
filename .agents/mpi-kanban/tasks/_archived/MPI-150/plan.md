# Cubric Vision — RunPod-branch backlog umbrella plan

Created 2026-06-26 (trimmed + conflict-analyzed 2026-06-26). Groups the in-scope To Do cards into
**3 dependency-ordered clusters**, each run as a focused session, chained with `mpi-handoff`.
Related cards are grouped so fixes to the same files land in the same session instead of colliding
on the shared tree.

**Out of scope (removed per user 2026-06-26):** MPI-71 (Vast.ai), MPI-69 (high-VRAM variants),
MPI-126 (Wan sigma drift), MPI-137 (R2 reorg). Cards remain on the board; just not part of this
umbrella.

**Branch discipline:** RunPod-branch / mpi-ci only — NO master merge, NO GitHub release, NO git tag
(MPI-131 rule) until the public master release lands.

**Execution model:** one cluster per session, cards in listed order, `mpi-handoff` at each boundary.
Do NOT spray separate agents at cards that share a file (see the conflict matrix) — same file = same
session, sequential.

---

## ⚠️ Conflict & blocker matrix (read before parallelizing anything)

File-level write contention — the cards that would COLLIDE if done in separate concurrent sessions:

| File | Cards that write it | Rule |
|---|---|---|
| `routes/downloadManager.js` | **MPI-149** (A), **MPI-140** (B), **MPI-136** (B) | Sequential. 149 first (active, Cluster A), THEN 140+136 together. Never two at once. |
| `cubric-vision-pod/wrapper/wrapper.py` (mpi-ci) | **MPI-140** (B), **MPI-136** (B), **MPI-145** (A), **MPI-146** (A) | A's wrapper edits (sage/VRAM) land in Build B; B's wrapper edits (stall/progress) come AFTER. Don't interleave. |
| `js/data/modelConstants/dependencies.js` | **MPI-129** (B, R2 URLs) only | A no longer writes this file (Krea2/Boogu deferred 2026-06-26). No A/B contention here now. |
| `routes/remoteProxy.js` | **MPI-135** (B, read), **MPI-139/145/146** (A, version bumps) | A bumps POD_IMAGE_VERSION; 135 only reads. Low risk but A first. |

**Hard blockers (must finish before the dependent starts):**
- **MPI-149 → blocks the whole v0.26 floor (MPI-139).** kornia pin must re-fire on upgrade or LTX
  breaks for users. Fix in Cluster A before any Build A ship.
- **MPI-129 (HF→R2) → upstream of the download cluster.** 140/136 progress+stall work should sit on
  the final R2 transport, not the HF one being torn out. Do 129 first within Cluster B.
- **Cluster A `downloadManager.js`/`wrapper.py` edits → block Cluster B's edits to the same files.**
  Finish + commit Cluster A before starting B, or B rebases onto a moving target.

**Net ordering consequence:** **A fully ships before B starts** (they share downloadManager.js +
wrapper.py + dependencies.js + remoteProxy.js — too much overlap to parallelize). C is independent
(workflow JSON + status-bar) and could run anytime, even parallel to B if a separate agent owns
ONLY C's files.

---

## Cluster A — Pod v0.9.0/v0.10.0 batch  ★ ACTIVE (MPI-139 in `doing`)

Owner plan: `.agents/mpi-kanban/tasks/MPI-139/plan.md`. Floor-first, two image builds.
**v0.26 floor verified locally 2026-06-26:** i2v ✅ + audio-input ✅ both gen clean on RTX 4060 Ti.

| Order | Card | What | Gate |
|---|---|---|---|
| A1 | **MPI-139** | v0.26.0 floor (core+frontend bump) — local upgrade done, floor verified | LTX gen works ✅ |
| A2 | **MPI-149** | kornia pipPins-drop on engine-upgrade path (folded in, blocker) | `pip pins installed: kornia==0.8.2` fires on upgrade |
| A4 | **MPI-145** | bake sage per-arch (+ triton — missing, sage needs it) | `--use-sage-attention`, faster sampling |
| A5 | **MPI-146** | per-card VRAM (lowvram<=24GB / normalvram>=32GB) on v0.26 mem mgr | 5090 normalvram faster, 4090 lowvram no-OOM |
| A6 | **MPI-148** | Builder image v0.26 bump (deferred — low, when convenient) | Builder nodes load on 0.26 |

Builds: A1+A2 → **Build A (v0.9.0)** = bare v0.26 floor (stability gate, no perf). A4+A5 →
**Build B (v0.10.0)**. A6 standalone.

**REMOVED 2026-06-26 (user):** A3 (Krea2 + Boogu-Image model defs) — no concrete model facts yet,
still need live testing; only noted because v0.26 adds core support. → future model-onboarding card.

---

## Cluster B — Remote download / transport stack

All touch the model-download path; **129 first** (transport), then progress/stall correctness on
top. Shares `downloadManager.js` + `wrapper.py` with Cluster A → **starts only after A commits.**

| Order | Card | What | Note |
|---|---|---|---|
| B1 | **MPI-129** | Migrate model weights HF → Cloudflare R2 (kills HF/Xet sawtooth throttle) | upstream; HIGH; touches dependencies.js |
| B2 | **MPI-140** | Progress bar LIES — snaps ~85% in <1s (aria2 preallocation, report completedLength) | HIGH; downloadManager.js + wrapper.py |
| B3 | **MPI-136** | Remote download stall watchdog — wrapper read-timeout/resume + app silent-SSE-stall | HIGH; SAME files as 140 → do together |
| B4 | **MPI-135** | Investigate DC-steering for scarce GPUs + volume-connect %/phase lag | low; read-only (shell.js/remoteProxy/MpiSettings) |

B2+B3 = same subsystem AND same files (downloadManager.js + wrapper.py) → one unit, sequential.

---

## Cluster C — LTX authoring polish (independent)

Workflow JSON + status-bar. No file overlap with A or B → safely parallelizable if a separate agent
owns ONLY these files.

| Order | Card | What | Note |
|---|---|---|---|
| C1 | **MPI-128** | LTX-2.3 next-release: dual-latent stage-2 staging, multi-stage preview, deferred caps | follow-up to MPI-127; touches stage-preview wiring |
| C2 | **MPI-147** | LTX status-bar progress (jumps 50→100, hangs at both samplers) | UX; shares staging concept with 128 |

C2 ties to C1 (both about LTX stage progress/preview) → same session.

---

## Suggested session order

1. **Finish Cluster A** (active) — ship v0.9.0 floor + v0.10.0 perf. ← here.
2. **Cluster B** — download stack (HIGH pain: progress-bar lie + stalls). AFTER A commits (file overlap).
3. **Cluster C** — LTX staging/progress. Independent; can run parallel to B with a dedicated agent.

Hand off (`mpi-handoff`) at each → boundary.

---

## ★ CLOSED 2026-06-28 — umbrella retired

Cluster A (MPI-139/145/146/149/152) = **DONE + closed**. Cluster C (MPI-128/147) = **DONE + closed**.
Cluster B = only **MPI-140** (progress-bar lie, transport-agnostic) and **MPI-136** (stall watchdog,
mooted by R2) remain — both stand alone, no umbrella needed. **MPI-129** (HF→R2, the keystone) is
in `doing`, staged for a dedicated session with a current STATUS block.

This umbrella was created when the board was overloaded; the board is now manageable, so the
tracker is retired. The remaining cards (129/140/136 + 158/135/126) are addressed individually.
Archived — recoverable if a coordination map is ever needed again.
