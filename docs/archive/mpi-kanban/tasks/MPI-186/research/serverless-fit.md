# MPI-186 — RunPod Serverless fit assessment (docs, 2026-07-04)

User asked (screenshots of console.runpod.io/serverless): could Serverless — 250ms spin-up
(FlashBoot), scale-to-zero, pay-per-second, ready-to-use Hub endpoints — replace our GPU Pods
and fix the ~5min cold-start? Researched from docs BEFORE any live test.

## VERDICT: NO — not a replacement for our interactive engine. Three hard blockers.

Our engine = **live interactive ComfyUI session**: app opens a session, streams latent PREVIEW
frames many times/sec over websocket, user tweaks knobs + re-runs against a WARM resident
model, weights persist on a network volume. Serverless breaks all three:

1. **No live preview streaming.** Serverless streaming = client-polled `GET /stream`
   (rate-limited), built for LLM token streaming — NOT a push websocket for sub-100ms frames.
   There is no path to expose ComfyUI's live preview websocket through the serverless proxy.
   → live previews GONE. [OFFICIAL-DOCS: handler-generator, send-requests]

2. **No warm persistent session.** Stateless job-dispatch; every `/run` is independent. Default
   idle timeout = **5s** → any user think-gap scales the worker to zero → model reloads next
   request. Keep it hot only via min-workers≥1 = **continuous billing (= a Pod)** but still no
   previews. Worst of both. [OFFICIAL-DOCS: endpoint-configurations]

3. **FlashBoot ≠ hot snapshot.** It pages VRAM→RAM/NVMe on spin-down + back on revive; 250ms
   applies ONLY to an already-warm worker ("more popular endpoint = more FlashBoot helps"). A
   single bursty user = usually cold → cold scale-up still pulls the big image + loads the
   model. FlashBoot is Serverless-only and doesn't solve OUR cold path.
   [OFFICIAL-DOCS: FlashBoot blog, test-response-times]

## What ports cleanly
- **Network volumes** work on serverless identically (`/runpod-volume`, up to 4TB self-serve,
  same datacenter-lock, concurrent-write caution). The one clean win. [OFFICIAL-DOCS]

## The Hub `runpod-workers/worker-comfyui` (709★, screenshot)
FIRE-AND-FORGET BATCH: input = workflow JSON (+ base64 images) → output = final images
(base64 / S3 URL). `/run` (async+poll) or `/runsync`. **No websocket, no streaming, no live
preview, no session.** A headless generation API, a different product shape from ours.
[OFFICIAL-DOCS: github runpod-workers/worker-comfyui, tutorials/serverless/comfyui]

## Cost (single interactive user with think-gaps)
- Scale-to-zero saves idle GPU billing BUT pays a cold-start penalty every burst.
- min-workers=1 to stay warm = continuous billing like a Pod, at serverless rates, still no
  previews. RunPod's "80% savings" is for many-concurrent-user NLP endpoints, not our case.
- **Pod (stop when done) remains the better cost + only option with live preview.** [OFFICIAL-DOCS]

## Why cu130 (MPI-187) is still the right path — not serverless
cu130 attacks the SAME pain (session open time, ~5min → target ~30-60s) WITHOUT losing live
previews / warm model / interactivity. Serverless fixes idle-billing (not our problem) by
sacrificing everything interactive. **cu130 Pod path stays correct.**

## Where serverless MIGHT be useful later (NOT this card)
An ADDITIVE, non-interactive "batch export" feature — e.g. "generate N variations headless" —
is a genuine serverless fit (job in, final images out; the Hub worker-comfyui already does
exactly this). That's a FUTURE PRODUCT card, not a cold-start fix. Backlog it if wanted; do
not fold into MPI-186 or the cu130 line.

## Sources
- Serverless overview: https://docs.runpod.io/serverless/overview
- Generator handler / streaming: https://docs.runpod.io/serverless/workers/handlers/handler-generator
- Send requests (/stream, /run, /runsync): https://docs.runpod.io/serverless/endpoints/send-requests
- Endpoint config (5s idle timeout, min workers): https://docs.runpod.io/serverless/endpoints/endpoint-configurations
- FlashBoot / paging: https://www.runpod.io/blog/whats-new-in-runpod-serverless-faster-cold-starts-batch-inference-and-no-docker-deploys
- Test response times (cold-start phases, 7min cap): https://docs.runpod.io/serverless/workers/development/test-response-times
- Network volumes on serverless: https://docs.runpod.io/storage/network-volumes
- worker-comfyui (batch API): https://github.com/runpod-workers/worker-comfyui
- Deploy ComfyUI serverless tutorial: https://docs.runpod.io/tutorials/serverless/comfyui
