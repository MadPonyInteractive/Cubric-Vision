# Aggregators: one key, many proprietary models, and maybe our own weights too

Researched 2026-09-11 by live fetch. Covers fal.ai, Replicate, Runware and Modal.

**The headline finding: fal.ai is the only vendor found that can carry BOTH the proprietary
models AND host Cubric Vision's own ComfyUI workflows with custom nodes, on one bill.**
Replicate can do both with a narrower model catalogue. Runware has strong proprietary video
but cannot host our graphs. Modal hosts our graphs but sells no proprietary models.

---

## 1. Can one vendor do both? The answer to the user's second question

| Platform | Proprietary model catalogue | Hosts our own ComfyUI graph | Custom nodes |
|---|---|---|---|
| **fal.ai** | ~985 endpoints, the broadest found | **Yes, native serverless ComfyUI** (`fal deploy`) | Yes for fal's own node pack; arbitrary third-party nodes UNVERIFIED |
| **Replicate** | ~200 models | **Yes, via `fofr/any-comfyui-workflow` or a Cog push** | Popular nodes pre-installed (IPAdapter Plus, AnimateDiff, VideoHelperSuite, Advanced ControlNet); others need a GitHub issue or a fork of `replicate/cog-comfyui` |
| **Runware** | Video-heavy, 15+ video models | **No.** Their ComfyUI integration is a node pack you install into YOUR OWN ComfyUI; inference calls out to Runware. There is no hosted-graph endpoint | N/A |
| **Modal** | None. Compute only, bring your own weights | **Yes, and this is the cleanest for arbitrary graphs** | **Yes, explicitly**: a `snapshot.json` (ComfyUI Manager snapshot format) pins custom node repos by GitHub commit hash |

Modal's pattern is worth knowing even if fal wins: three files, `prompt.json` (the exported
workflow with a `SaveImageWebSocket` node at the end), `snapshot.json` (custom nodes plus
commit hashes), and a `workflow.py` Modal entrypoint. `modal deploy workflow.py` ships it.
That is close to how Cubric Vision already thinks about a graph plus a pinned node lock, so
it would be the fallback if fal cannot take our node pack.

**Modal cold starts are billed.** "A 20-second load on an H100 costs about $0.022 every time
a container starts from zero." fal and Replicate bill for output, not container uptime. For
a bursty desktop app with idle gaps, that difference matters more than the hourly rate.

---

## 2. Proprietary model coverage, side by side

| Model | fal.ai | Replicate | Runware |
|---|---|---|---|
| Kling 3.0 | Yes, $0.09/s | Yes, $0.14/s (version unclear) | Yes, $0.672/clip (~$0.084/s) |
| Kling 2.5 Turbo Pro | Yes, $0.07/s | UNVERIFIED | Kling 2.0 Master $0.924/clip |
| ByteDance Seedance 2.5 | Listed, price UNVERIFIED | Yes, price UNVERIFIED | 1.0/2.0 only; 2.0 Fast $0.485/clip, 1.0 Pro Fast $0.160/clip |
| MiniMax Hailuo / H3 | H3 and H3 Max listed, price UNVERIFIED | UNVERIFIED | Hailuo 2.3 $0.320/clip (~$0.040/s) |
| Google Veo | Veo 3, $0.40/s | Veo 3.1 Lite, $0.05/s | Veo 3.1 $1.60/clip, Fast $0.60/clip |
| Google Nano Banana | Yes, $0.0398/image | Yes (`google/nano-banana-2`) | No |
| OpenAI GPT Image 2 | Listed, price UNVERIFIED | Yes (`openai/gpt-image-2`) | UNVERIFIED |
| FLUX | Kontext Pro $0.04/image | FLUX 3, FLUX 2-Max, 1.1 Pro $0.04, Dev $0.025, Schnell $0.003 | FLUX family, $0.0006 to $0.24/image |
| Runway Gen-4.5 | **Absent** | **Absent** | Yes, $0.605/clip |
| Luma Ray / Photon | **Absent** | **Absent** | **Absent** |
| Topaz | **Absent** | **Absent** | **Absent** |
| Ideogram | Listed in nav | Yes, $0.003/gen via Pruna | UNVERIFIED |
| Wan | 2.5 at $0.05/s | Wan 3.0, 2.1 480p $0.09/s | Wan 2.7 $0.708/clip |
| Seedream | V4 $0.03/image | UNVERIFIED | UNVERIFIED |
| LTX | UNVERIFIED | LTX 2.5 Fast | LTX-2 $0.150/clip, LTX-2.5 Pro $0.720/clip |
| Krea | Krea 2 Turbo | Krea 2 Medium | UNVERIFIED |

Three absences are structural, not oversights: **Luma is on no aggregator checked** (buy
direct), **Runway is only on Runware**, and **Topaz appears to be direct-only**. Sora's API
dies 2026-09-24 regardless.

Runware publishes per CLIP, not per second, and does not state clip length on the comparison
page. The per-second figures above assume 8-second clips and should not be used for costing
without confirming duration.

## 3. Aggregator markup is smaller than expected, sometimes negative

Where a direct comparison was possible, aggregators are at parity or modestly CHEAPER than
buying direct. This is the opposite of the usual reseller assumption, and it kills the idea
that going direct to each provider saves meaningful money.

| Model | Aggregator price | Direct price | Difference |
|---|---|---|---|
| Kling 2.1 Standard i2v | fal $0.056/s | ~$0.084/s | fal ~33% cheaper |
| Kling 2.5 Turbo Pro | fal $0.07/s | ~$0.084 to $0.168/s | fal 17 to 58% cheaper |
| Kling 3.0 | fal $0.09/s | ~$0.10/s | ~10% cheaper |
| Kling 2.0 Master | Runware ~$0.092/s | ~$0.10/s | ~8% cheaper |
| Kling VIDEO 3.0 Pro | Runware ~$0.084/s | ~$0.10/s | ~16% cheaper |
| Seedance 1.0 Pro Fast | Runware ~$0.020/s | ~$0.034/s | Runware ~41% cheaper |
| Hailuo 2.3 Fast | Runware ~$0.040/s | MiniMax $0.047/s (768P, 8s) | Runware ~15% cheaper |

Runware markets "13 to 72% savings vs market rate" and "up to 90% lower cost". The measured
numbers support the lower end of that claim, not the headline.

Direct reference prices used above: Kling 3.0 ~$0.10/s; Runway Gen-4.5 $0.12/s; Luma Ray 2
~$0.19 to $0.21/s at 1080p and ~$0.12/s for Ray 2 Flash; MiniMax H3 $0.08/s at 768P and
$0.13/s at 2K; Seedance 2.0 ~$0.034 to $0.14/s depending on tier.

**A caution on H3:** MiniMax's own direct price for the current-generation H3 ($0.08 to
$0.13/s) is notably HIGHER than what aggregators charge for the previous Hailuo generation.
Current-gen pricing may simply not have landed in aggregator catalogues yet. Do not assume
today's aggregator rate holds when the newest model arrives.

## 4. Resale terms: every aggregator permits exactly the thing we want

All three carry the same shape. Building an app that your end users pay you for is permitted.
Reselling raw API access is not.

**fal.ai** (terms last updated 2026-03-03):

> "Clients may access and use the Company Platform through an API with the Client Solution
> and allow End Users to access and use the Company Platform through the Client Solution."

Prohibited: "resell, transfer, assign, or sublicense Customer's rights under these Terms to
any third party"; "Client will not expose any of the Services APIs directly to any End
Users"; and using the service "on a timesharing, service bureau, or similar arrangement, to
run an outsourcing business."

Practical reading for Cubric Vision: calls must go through our own backend. **Handing a fal
key to a user, or letting the desktop app call fal directly with our key, breaches the "will
not expose any of the Services APIs directly to any End Users" clause.** That single sentence
is what makes a proxy mandatory rather than merely prudent on this route.

**Replicate:**

Prohibited: "rent, lease, lend, sell, sublicense, assign, distribute, publish, transfer, or
otherwise make available any Services to any person"

Explicitly permitted: "grant to you all right, title and interest, if any, in and to Output,
including your use of Output for commercial purposes such as sale or publication"

The critical caveat, and it applies to every aggregator: "you agree to fully comply with
Third-Party Terms applicable to your use of the Services, including all Additional Terms and
licenses associated with the Models." **The aggregator's permission does not override the
upstream model's licence.** Kling outputs remain subject to Kuaishou's terms whether reached
through fal, Replicate or direct. No aggregator indemnifies against that.

**Runware:**

Prohibited: "you may not: (i) resell or provide the Services on a standalone basis (e.g. as a
competing API/service) without Runware's written permission"

Permitted: "If you integrate our Services into applications, platforms, or services that are
made available to end users ('Customer Solutions')..." and "As between you and Runware, you
own your Outputs".

Runware explicitly puts age verification, content filtering and local-law compliance on the
app developer. Their statement that partner models "generally allow commercial use" is their
characterisation, not a binding guarantee.

**Nothing in any of the three requires a registered company.** A UK sole trader signs up the
same as anyone else.

## 5. Signup, limits and spend control

| | fal.ai | Replicate | Runware | Modal |
|---|---|---|---|---|
| Signup | Self-serve, no KYC, ~$20 free credit, no card to start | Self-serve, card required | Self-serve, $2 free credit | Self-serve |
| Company entity needed | No | No | No | No |
| Billing | **Prepaid credits only** | **Prepaid OR postpaid, you choose** | **Prepaid credits** | **Postpaid consumption** |
| Concurrency | Starts at 2, auto-scales to 40 as credits are bought; over 40 needs enterprise | Configurable, specifics UNVERIFIED; multi-GPU over 8x H100 needs a committed-spend contract | No hard limit, dynamic queue; 2 to 4 concurrent recommended | N/A |
| Queue on overflow | Unbounded queue, no drops, up to 10 auto-retries on 503/504 | HTTP 429 until the rolling window resets | 429 queue exceeded, 503 constraint, 504 max wait | N/A |
| Failed generation billed | No on HTTP 500+. **May be charged on HTTP 422 if the GPU already ran** | No for public models. Private model failures ARE charged for instance time. Cancelled official-model runs may still be charged | No, "only charged for successful API requests" | **Yes, billed per container-second including cold start** |
| Moderation rejection billed | UNVERIFIED | UNVERIFIED | UNVERIFIED | N/A |
| Spend cap | None as a feature, but prepaid balance IS a hard ceiling | **Postpaid mode has no ceiling. This is the runaway-bill risk** | None as a feature, prepaid balance is the ceiling | Environment-level budgets on Team and Enterprise |

**For a credit product the prepaid model is the answer.** A prepaid balance is a hard cap on
a runaway loop with no extra engineering. Replicate's postpaid mode is the one arrangement
here that can produce a five-figure surprise, so if Replicate is used, choose prepaid.

## 6. Custom hosting economics

**fal.ai serverless GPU** (hourly rate, billed per second of active runner, no idle charge):

| GPU | Discounted | List |
|---|---|---|
| B300 | $4.49/hr | $8.50/hr |
| H100 | $1.89/hr | $3.99/hr |
| RTX PRO 6000 | $1.10/hr | $2.99/hr |

Cold start as low as 0.41s for cached images. Scale-to-zero via `min_concurrency=0`.
Migration paths documented from Replicate, Modal and RunPod.

**Modal GPU, per second:**

| GPU | $/sec | ~$/hr |
|---|---|---|
| T4 | $0.000164 | $0.59 |
| A10 | $0.000306 | $1.10 |
| L40S | $0.000542 | $1.95 |
| A100 40GB | $0.000583 | $2.10 |
| A100 80GB | $0.000694 | $2.50 |
| RTX PRO 6000 | $0.000842 | $3.03 |
| H100 SXM5 | $0.001097 | $3.95 |
| H200 SXM | $0.001261 | $4.54 |
| B200 | $0.001736 | $6.25 |
| B300 | $0.001972 | $7.10 |

Modal Starter gives $30/month of free compute with no carryover; Team is $250/month plus
usage. The crossover worth remembering: past roughly 12 hours of daily GPU-busy time, a
rented pod beats serverless. Cubric Vision's own RunPod path already covers the heavy-user
case, so serverless is the right shape for the occasional cloud generation.

**Replicate hardware, time-based:** $0.000025/sec for a small CPU up to $0.0112/sec for 8x
H100. Cold start times are not documented.

## 7. What this means for Cubric Vision

1. **One vendor can cover both halves, and it is fal.ai.** Broadest proprietary catalogue
   plus native serverless ComfyUI. Replicate is the credible second with a smaller catalogue
   and a Docker-image rebuild on every workflow change, which is real friction against how
   often Cubric Vision's graphs move.
2. **Confirm fal takes our node pack before committing.** fal ships its own ComfyUI nodes;
   whether arbitrary third-party custom nodes are supported is UNVERIFIED and it is the
   single question that decides the one-vendor story. Modal's `snapshot.json` pattern is the
   proven fallback for arbitrary nodes.
3. **fal's "will not expose any of the Services APIs directly to any End Users" clause means
   BYO-key is NOT available on fal.** If the user is to paste a key, it has to be a key from
   a provider whose terms allow it. Direct providers are the BYO route; aggregators are the
   proxy route.
4. **Going direct does not save money.** Aggregators price at or below direct. The reason to
   go direct is a model no aggregator carries (Luma, Topaz, Runway outside Runware) or terms
   that only the proprietor can grant.
5. **Prepaid billing everywhere.** It is the cheapest possible spend cap.

## Open questions

- Does fal.ai support arbitrary third-party ComfyUI custom nodes, or only its own pack? This
  is the decisive question for the one-vendor plan.
- fal.ai prices for Seedance 2.5 and MiniMax H3 were not visible on the pricing page.
- Whether a safety-rejected generation is billed on fal, Replicate or Runware. All three
  document failure billing but none address moderation rejection.
- Runware clip lengths, so the per-clip prices can be converted to per-second honestly.
- Whether Replicate's `any-comfyui-workflow` route can carry Cubric Vision's node pack
  without a fork of `replicate/cog-comfyui`.
- Whether any aggregator will state in writing that a specific upstream model (Kling,
  Seedance) permits end-user resale, rather than passing the question through.

## Sources

All accessed 2026-09-11.

fal.ai: fal.ai/pricing, /legal/api-services, /legal/terms-of-service, /docs/model-apis/faq,
/docs/model-endpoints/queue, /docs/documentation/model-apis/pricing, /serverless,
/models/fal-ai/kling-video/v2.1/standard/image-to-video.
Replicate: replicate.com/pricing, /terms, /docs/topics/billing,
/docs/topics/billing/prepaid-credit, /docs/guides/push-a-model, /docs/guides/comfyui,
/explore.
Runware: runware.ai/pricing, /terms, /video-generation-api, /collections/best-video-models,
/docs/platform/rate-limits, /docs/platform/comfyui, /docs/platform/pricing;
github.com/Runware/ComfyUI-Runware.
Modal: modal.com/pricing, /docs/guide/custom-container, /docs/guide/gpu;
beam.cloud/blog/modal-pricing-explained; gpuhosted.com/en/modal-serverless-guide/;
ajoellee.com/blog/comfyui-with-modal/; deepwiki.com ComfyDeploy Modal compute layer.
Direct-price references: platform.minimax.io/docs/guides/pricing-paygo;
eesel.ai/blog/kling-ai-pricing; eesel.ai/blog/luma-ai-pricing;
apiframe.ai/blog/ai-video-api-pricing-2026;
crazyrouter.com Seedance 2.0 API pricing; teamday.ai 2026 provider comparison;
costbench.com fal free plan and Modal GPU cloud; drdroid.io and tickerr.ai on Replicate
concurrency; aiidelist.com/ide/fal-ai; spheron.network fal alternatives.
