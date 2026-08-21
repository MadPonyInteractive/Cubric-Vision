# MPI-491 — HuggingFace deps crawl at 1.66 MB/s on a Pod

> Reconstructed 2026-08-08 by the MPI-467 session. The card carried
> `attention: required` while linking a `brief.md` that was never written, which fails
> board validation for the whole board. Content below is drawn ONLY from this card's own
> `task.json` description, its `attention.reason`, and `validation.md` — nothing new is
> asserted here. The owning session had closed; correct anything it would say differently.

## Problem

`https://huggingface.co/<repo>/resolve/...` 302s to `us.aws.cdn.hf.co/xet-bridge-us`, a
compatibility shim for clients that speak plain HTTP. From RunPod EU-RO-1 that shim is
capped at ~1.7 MB/s as a **per-IP total**, not per-connection: aria2 with 16 connections
measured 1.66 MB/s and single-stream httpx 1.74 on the same dep, while an R2 control on the
same Pod in the same minute ran 297 MB/s. Only the six `huggingface.co` deps are affected;
101 R2 and 14 github deps are unchanged.

H3 cannot be moved to R2 — the MiniMax CLA's trigger covers redistribution, so H3 is
HF-primary permanently by design.

## Outcome

`_download_hf` (Xet-native, via `huggingface_hub`) ahead of `_download_httpx`, with aria2
still owning R2 and github. Measured ~320x: the 24.55GB H3 clip in ~75s, peak 541 MB/s, and
the whole ~46GB H3 set in about 2.5 minutes against a projected 10 hours. Shipped as wrapper
**0.2.43 on the dev channel**; `huggingface_hub` installs from `start-cpu.sh` because that
file is floated while `bootstrap.sh` is baked.

Full measurement record — including the first hypothesis, which was **wrong** (request-count
limiting predicted single-stream would win; it lost) — is in [validation.md](validation.md).

## The one open leg

The GPU-image path is **inferred, not measured**: that image already bakes
`huggingface-hub` and `hf-xet` via `python_deps.txt`, so `_download_hf` should engage with no
pip step. Owned by MPI-467, measured on `controlnet-union-flux` (3.99GB, the only HF dep left
uninstalled), sampled every 15s — a single long interval reads ~2x optimistic.

## Promote is NOT a separate gate

`mpi-release/SKILL.md:53` already diffs the dev and stable manifests and stops on a mismatch,
never auto-promoting. The shas WILL differ (dev 0.2.43, stable 0.2.40), so that stop fires on
this release. **The answer is PROMOTE.** Declining ships H3 at 1.66 MB/s — nobody reports that
as a bug, it just looks like a big model. Do the GPU-image measurement first.
