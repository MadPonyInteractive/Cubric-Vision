# MPI-186 — Plan (research-settled: registry + shrink; NOT a discovery spike)

> **RE-SCOPED 2026-07-04, then RESEARCH-SETTLED same day.** MPI-187 inverted the original
> premise; the RunPod template screenshot + two docs research passes (research/) then answered
> the mechanism from docs — so this is no longer a "discovery spike." The cause of the slow
> cold-start is known; the fix is two known-real levers + two magnitude measurements.
> Deliverable = `research/decision.md` that MPI-189 builds to. NOT shipped image code.
>
> **All live Pod ops (create/deploy/Stop/Terminate/shell) are USER-only.**

---

## What research settled (docs — do NOT re-test these)

See `research/runpod-coldstart-docs.md` and `research/serverless-fit.md` for full citations.

**Why our Pod cold-starts slow (~5min) while RunPod's Official image is instant:**
- RunPod caches image layers **per-host** (standard Docker). Popular images (RunPod's own) are
  already on nearly every host → instant. Our private low-traffic GHCR image cold-pulls from
  GHCR on every fresh host. "Official" is a popularity effect + UI label, **not** an obtainable
  caching tier.
- We already keep weights on the volume (RunPod's own guidance) → the ~5min is the **image
  PULL itself**: a big baked image (torch + sage + ComfyUI deps) on **GHCR**, possibly on
  **Community Cloud** hosts.

**DEAD levers — settled, do NOT spend Pods on:**
- Register a RunPod template (pure deploy-config, zero pull effect).
- Chase "Official" status (not obtainable, not a real tier).
- FlashBoot (Serverless-ONLY; doesn't exist for GPU Pods).

**REAL levers (the TWO we act on — user-confirmed 2026-07-04):**
- **Docker Hub over GHCR** — GHCR has documented pull-stall issues on RunPod hosts. THE move.
- **Image size ↓** — smaller = faster cold pull on every fresh host. THE move.

**Already-true / already-done (user-confirmed — NOT levers to build):**
- **Secure Cloud** — we're already on it (Community's cheap rates would be obvious). The
  200-400 Gbps NIC is already ours; no action.
- **Stop-not-Delete** — already an app option; it rarely lands the same host but sometimes
  does, so it stays as a bonus. Do NOT over-invest — the same-host reschedule is probabilistic
  and mostly misses. (Cross-ref: reconnect-deletes-warm-Pod known issue — separate bug.)

**Serverless: NOT a fit** (research/serverless-fit.md). It breaks live-preview streaming +
warm session (our core UX); FlashBoot's 250ms is warm-only and Serverless-only. cu130 fixes
the SAME pain (session open time) without losing interactivity. Serverless is only ever a
FUTURE additive "batch export" feature — out of scope here. Do not pursue in this card.

## What this card is NOT
- ✗ NOT moving ComfyUI/deps to the volume (boot is already local).
- ✗ NOT template registration / Official-chasing / FlashBoot / Serverless.
- ✗ NOT the cu124/cu128 split (MPI-189 collapses it).
- ✗ NOT a rebuild — produces the DESIGN; 189 executes on cu130.

---

## Phase 1 — TWO magnitude measurements (docs give direction, not OUR numbers; USER-run)

Only two things still need a live number, because docs don't have OUR image's figures:

**1a. Registry: GHCR vs Docker Hub cold-pull.** Push a one-off copy of the current image to
Docker Hub. On a fresh RunPod host, cold-deploy from GHCR vs from Docker Hub; record pull
seconds each. Docs say Docker Hub is more reliable — this measures how big the win is for US.

**1b. Image size breakdown.** `docker history` / `docker inspect` the current image → per-layer
sizes. This is a READ, can be done locally/CI (no Pod) — identifies the biggest cuts.

**Verify:** `research/decision.md` has GHCR-vs-Hub seconds + a per-layer size table.

---

## Phase 2 — SHRINK cut-list (read-only survey → applied in MPI-189)

From the 1b size table, produce a ranked, sized cut-list (edits land in the cu130 rebuild):
- **Biggest lever:** sage needs nvcc at BUILD, not RUN → multi-stage build: compile sage in a
  `-devel` stage, ship on a `-runtime` base. Measure the devel→runtime base delta.
- pip cache off everywhere (`PIP_NO_CACHE_DIR=1` set L350 — verify honored); strip
  `.pyc`/`__pycache__`; carry the cu128 uninstall-then-install torch discipline to cu130.
- **Do NOT touch (arch-bound weight):** torch trio + sage binary.

**Verify:** ranked/sized cut-list + explicit "do not touch" list in `research/decision.md`.

---

## Phase 3 — WRITE THE DECISION (deliverable) → hand to MPI-189

`research/decision.md`, the spec MPI-189 builds to:
1. **Cold-start cause** (per-host cache; our image cold-pulls GHCR) — settled from docs.
2. **Registry:** GHCR → Docker Hub? with the 1a seconds. Note the app-side change
   (remotePodLifecycle.js `POD_IMAGE_BASE` L93 points at GHCR → repoint if we move).
3. **Placement:** already Secure Cloud (no action); Stop-not-Delete already in app (bonus,
   rarely lands same host — do not over-invest). Note both as settled, not work items.
4. **Shrink:** ranked cut-list, each "apply in 189" / "skip".
5. **Serverless:** explicitly OUT (link serverless-fit.md) so it's not re-litigated.
6. **Sequence:** 189 builds the single cu130 image THIS way, once.

**Verify:** MPI-189 startable from `decision.md` alone. Update the MPI-189 card body + this
card's `validation.md`; then done (decision made + evidence recorded, not image shipped).

---

## Reference (kept)
- `research/runpod-coldstart-docs.md` — cold-start/caching mechanism, real vs dead levers.
- `research/serverless-fit.md` — why serverless is out (+ the future batch-export note).
- `research/investigation.md` — original aimdo/kitchen `.so` analysis; now evidence for why we
  do NOT relocate to the volume.

## Verification
**Verify mode:** user-ux — the two live measurements (registry pull, cold-vs-warm) are Pod ops
the USER runs. 1b (docker history) and the cut-list are agent-doable read work. The agent
drafts commands + decision.md; the user runs the Pods and pastes numbers.
