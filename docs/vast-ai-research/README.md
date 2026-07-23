# Vast.ai as a second remote-engine provider — research (PARKED)

> **STATUS: PARKED IN BACKLOG — do not act without a fresh go-ahead.** Backlog card:
> **MPI-344**. Investigated 2026-07-23 (four parallel research agents + primary-source
> verification). This folder is the curated, durable version; the raw session evidence
> lives in `.agents/mpi-kanban/tasks/MPI-344/research/01-viability.md`.
>
> **We are NOT integrating Vast.ai now.** This exists so the card is cheap to pick up in a
> few weeks. Read this README first; the two topic files are only for when work actually starts.

## Folder map
- **README.md** (this file) — the decision: what motivated it, the verdict, the two red flags, the myth-check, what to do first.
- [api-parity.md](api-parity.md) — Vast REST API + RunPod→Vast capability parity (the external facts).
- [integration-map.md](integration-map.md) — what changes in OUR code + effort (the internal facts).

## What motivated the look
A Discord conversation claiming **"Vast.ai only starts charging when you start inference,
unlike RunPod"**. That, plus reports of users gravitating from RunPod to Vast, is why we
re-opened this.

### Myth-check on that claim (IMPORTANT — it's mostly a misunderstanding)
**Vast bills per-second the whole time the instance is RUNNING (GPU rented), not "only during
inference."** Same billing shape as RunPod. The "charge only when work runs" behavior is
Vast's **serverless / autoscaler** product (scale-to-zero workergroups), a different product
that does not fit our streaming/binary-preview generation model. So the specific claim that
drew us back does not hold for the instance model we'd actually use. Two nuances that ARE
true and may be what the Discord user meant:
- Vast's **image-pull (`loading`) phase is not billed**; RunPod bills from pod start.
- Vast has **no idle network-volume storage tax**; RunPod added one (see below).

## Verdict: viable, but **ephemeral-only** — and that is likely a no-go for our users
- **Vast has NO network volumes.** Verified against the primary doc
  ([docs.vast.ai storage/types](https://docs.vast.ai/documentation/instances/storage/types)):
  both storage types are host-local — *"Local only: Tied to the physical machine where
  created"*, *"Cannot migrate between different physical machines."* The "coming soon"
  network-volume announcement from May 2025 is **absent from the storage docs entirely** as
  of 2026-07-23. Not shipped.
- So our whole volume design (`runpod-remote-engine.md` §5 — one DC-locked volume holds the
  model library, portable across every card) **has no Vast equivalent.** Vast can only be an
  **ephemeral** provider: spin up → download this job's weights → generate → tear down.
- We already ship that shape: the **MPI-78 "Any region (no volume)"** ephemeral Pod
  (`MpiRunpodSettings.js:1021`). That is what makes Vast *possible at all* — no redesign.

## The two RED FLAGS (user's call, 2026-07-23 — these are why it stays parked)
1. **Ephemeral kills the multi-model user.** A user who keeps 5-10 models would re-download
   ALL of them every session (no persistent library). For our product that is a dealbreaker,
   not an inconvenience.
2. **Bandwidth billed per byte, host-set rate, unpublished.** RunPod egress is free; Vast
   charges up AND down. Ephemeral means re-downloading 10-40GB of weights per session (the LTX
   transformer alone is 41GB). This can silently eat the entire GPU-hour saving and surface on
   the invoice. **This is the single most important unknown to settle before any code.**

## What was FEARED but turned out FINE
- **CUDA driver floor — SOLVED.** Vast offer search has `driver_version` and `cuda_max_good`
  as first-class filter fields — a direct (arguably better) equivalent to our
  `allowedCudaVersions` (MPI-188). Placement roulette is not a problem.
- **API parity — clean.** Bearer auth, 5 REST endpoints cover the full lifecycle, richer
  placement filters than RunPod, scoped API keys RunPod lacks. Details in [api-parity.md](api-parity.md).
- **~40% of our remote layer needs zero changes.** The whole `/wrapper/*` contract travels.

## Still-open risks if it's ever un-parked
- **Endpoint discovery** — no `proxy.runpod.net` equivalent (see [api-parity.md](api-parity.md) § Networking).
- **Host reads container env on unverified hosts** — don't inject a full API key; use a Vast
  parameter-restricted key. See [integration-map.md](integration-map.md).
- **Host-pinned resume that loses data**, no SLA, per-host perf variance.

## The migration premise — UNCONFIRMED
No Reddit/HN/Discord thread documenting an exodus was found; RunPod reported $120M ARR / 500k
devs ([TechCrunch 2026-01-16](https://techcrunch.com/2026/01/16/ai-cloud-startup-Runpod-hits-120m-in-arr-and-it-started-with-a-reddit-post)).
One concrete push factor that hits our exact design: **RunPod doubled idle network-volume
pricing to ~$0.20/GB/mo in Feb 2026** (source quality was weak — SEO review sites — confirm on
RunPod's own pricing page before treating as fact). **The user's direct Discord read outweighs
this web-only search.**

## What to do FIRST when un-parked (before ANY refactor)
A few-hour, <$5 live probe on ONE instance — the answers gate everything downstream:
1. **Bandwidth cost** — download 20GB, read the invoice line. (Red flag #2. Highest value.)
2. **Endpoint discovery** — can the app read the tunnel URL from the instance-log endpoint, or
   does direct `static_ip` + `direct_port_count>=1` + a pinned self-signed cert work end-to-end?
3. **Does our cu130 image boot** on a `driver_version`-filtered host? One create, watch it up.

Do NOT start the 3 prerequisite refactors (see [integration-map.md](integration-map.md)) before
the probe — bandwidth alone can make ephemeral-only Vast pointless, and then nothing else matters.
