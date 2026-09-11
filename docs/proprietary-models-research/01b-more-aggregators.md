# More aggregators, ranked by whether their terms let us do this at all

Researched 2026-09-11 by live fetch. Companion to `01-aggregators.md`, which covers fal.ai,
Replicate, Runware and Modal. This file covers the rest: Eachlabs, Apiframe, Atlas Cloud,
PiAPI, AI/ML API, Segmind, WaveSpeedAI, Novita, Kie.ai, Together AI, OpenRouter, Higgsfield,
Baseten, RunComfy, DeepInfra and Fireworks.

**Sort them by contract first, not by price.** Two of these explicitly forbid what we want to
build, and several are silent, which is worse than it sounds. Three grant it in writing.

---

## 1. The resale-terms league table

| Platform | Verdict | The actual wording |
|---|---|---|
| **Eachlabs** | **Explicit YES, best found** | Resale ban carries a carve-out: "except inside a product of your own built on the Services". Separately grants a licence to "build and operate your own applications and serve your end users" |
| **Apiframe** | **Explicit YES** | "You may use our Services to integrate AI capabilities into your applications, products, and workflows"; "you own the outputs". Prohibits only "resell access to the API without authorization" |
| **PiAPI** | **Explicit YES** | Section 8 is written for this case: "If you make the Services available through your product, you are responsible for that product and its users" with governance duties attached |
| **Atlas Cloud** | Yes, with a warning | Grants the right to "allow End Users to access the Services through the Customer Solution", but "Client will not expose any of the Services APIs directly to any End Users" and "Using the Services to create a 'thin wrapper' for raw resale is strictly prohibited". Cubric Vision adds substantial value, so this reads fine |
| **Together AI** | Ambiguous | Section 4.3(d) bans "transfer, distribute, resell, lease, license, or assign the Services or otherwise offer the Services on a standalone basis". "Standalone basis" most naturally means reselling API access, not building an app, but get it in writing |
| **Novita** | Ambiguous | AUP bans selling or transferring the account. ToS bans exploiting site content commercially. Neither clearly addresses building a paid app. "Permitted commercial use" is referenced but never defined |
| **AI/ML API** | **Ambiguous by silence** | No resale clause at all, either way. A non-exclusive grant does not imply sublicensing rights as a contract default. Silence is not permission |
| **Kie.ai** | **Unknown** | The Terms of Use page returned 403 and could not be read. Cheapest prices found, contract unreadable |
| **WaveSpeedAI** | **Red flag** | Section 8.2 bans "rent, lease, lend, sell, sublicense, assign, distribute, publish, transfer, **or otherwise make available any Services to any person**". The most restrictive wording found short of an outright ban |
| **Segmind** | **HARD NO** | Section 2.3: "sell, resell, license, sublicense, distribute, rent, lease, or otherwise provide access to the Platform Services to any third party except to the extent explicitly authorized in writing by Segmind" |
| **OpenRouter** | **HARD NO, and no models anyway** | Section 7(4) bans access "for purposes of reselling API access to Models or otherwise developing a competing service". Its image/video catalogue is one video-editing model and four image models |

**Every one of these, including the permissive ones, passes the upstream model licence
through to us.** Together AI says it plainly: "In case of any conflict between this Agreement
and the model terms, the model terms govern." So Eachlabs' generous carve-out does not make
Kling's "limited to your own use" clause go away. See `02b-chinese-providers.md`.

---

## 2. Model coverage

| Model | Eachlabs | Apiframe | PiAPI | AI/ML API | Segmind | WaveSpeed | Novita | Kie.ai | Together |
|---|---|---|---|---|---|---|---|---|---|
| Kling | Yes, 62 models | Yes, 3.0 | Yes, 1.0 to 3.0 Omni | Yes, 1.0 to 3.0 | Yes | Yes, 1.6 to 3.0 | Yes, v3.0 | Yes | Yes, to 2.1 only |
| Seedance | Yes | Yes, 2.5 | Yes, 1.0/2.0/2.5 | Yes, 2.0/2.5 | Yes, 2.5 | Yes, 1.5 to 2.5 | **No** | Yes, 2.0 | Yes, to 2.5 |
| Hailuo / MiniMax | Yes | Yes, H3 | Yes | Yes, 2.3 and H3 | Yes, H3 Max | Yes | Yes, 2.3 | Yes | Yes, Hailuo 02 |
| Veo | Yes | Yes, 3.1 | Yes, 3/3.1 | Yes, 3/3.1 | **No** | Yes, 3.1 Fast | **No** | Yes, 3.1 | Veo 2.0 only |
| Nano Banana | Yes | Yes, 2 | UNVERIFIED | Yes, all tiers | UNVERIFIED | Yes, 2 and Pro | **No** | Yes | Yes |
| Runway | Yes | **Yes, Gen-4.5** | **No** | **No** | **Yes** | Conflicting | **No** | Yes, Aleph | **No** |
| Luma | Yes | **Yes** | Yes, Dream Machine | Yes, Ray 2 | Yes | Yes | **No** | UNVERIFIED | **No** |
| Topaz | **Yes** | No | No | No | No | No | No | Partial, upscale | No |
| Ideogram | Yes | Yes | No | No | Yes, 3.0 | Yes | No | Yes, v3 | Yes, 3.0/4.0 |
| Recraft | Yes | Yes | No | No | Yes, V3 | Yes | No | Partial | **No** |
| FLUX Pro / Kontext | Yes | Yes | Partial | Yes, Kontext Pro/Max | Yes | Yes | UNVERIFIED | Yes | Yes |

**Eachlabs claims the broadest coverage of the target list, and it is the only platform found
carrying Topaz.** Apiframe is second and is the only one besides Eachlabs and Segmind with
Runway. Novita is the thinnest: no Seedance, no Veo, no Nano Banana, no Runway, no Luma.

---

## 3. Prices worth knowing

**Eachlabs prices at pass-through with zero markup** and claims "you'll never pay more than
going direct". Revenue comes from storage ($0.023/GB-month after 5GB free) and enterprise
tiers. If true, it is strictly the cheapest way to reach these models, and the claim is worth
verifying against live model cards because it is strategically unusual.

**Kie.ai is the cheapest measured**, at roughly $0.005 per credit with claims of 30 to 86
percent below official APIs. Nano Banana 2 at 1K is ~$0.04 against WaveSpeed's $0.07, and GPT
Image 2 at ~$0.03 against a ~$0.22 direct comparison. Credits never expire. But the terms
could not be read, and media is deleted after 14 days.

**PiAPI markups vary wildly by model.** Kling 3.0 Standard at $0.10/s is ~33 percent over
direct. Seedance 2.0 at $0.08 to $0.10/s is **224 to 305 percent** over BytePlus's $0.0247/s.
But Luma Dream Machine at $0.20 to $0.40/video is 50 to 80 percent CHEAPER than Luma direct,
and Flux Kontext at $0.02/image is 50 to 75 percent cheaper. Check every model separately;
there is no single platform markup.

**Apiframe** runs $0.01/credit on subscription tiers from $39/month (4,000 credits, 5
concurrent) to $749/month (75,000 credits, 100 concurrent). Kling 3.0 at $0.16/s, Seedance
2.5 at $0.29/s, Hailuo from $0.01/s at 512p to $0.08/s at 1080p, Runway Gen-4 Turbo at
$0.05/s and Gen-4.5 at $0.12/s. **Failed jobs are refunded automatically.**

**Together AI** sells per video rather than per second: Kling 2.1 Standard $0.18, Pro $0.32,
Master $0.92; Seedance 2.5 $0.115, 2.0 $0.16, 1.0 Pro $0.57; Hailuo 02 $0.49; Veo 2.0 $2.50;
Sora 2 $0.80, Pro $2.40. Images: FLUX.2 pro $0.03, Kontext pro $0.04, Nano Banana Pro $0.134,
GPT Image 2 $0.053, Seedream 4.0 $0.03, Ideogram 3.0/4.0 $0.06.

**WaveSpeedAI**: Nano Banana 2 $0.07/image, Pro $0.14, Seedream 4.5 $0.04, Flux 2 Klein
$0.008, Kling 3.0 Standard $0.084/s, Seedance 2.0 Fast $0.10/s, Veo 3.1 Fast $0.15/s.

**Novita**: Kling v3.0 Pro $0.112/s no audio, $0.168/s with audio; Standard $0.084/s and
$0.126/s. Hailuo 2.3 Fast $0.19 for 6s at 768p. Qwen-Image $0.02/image.

**AI/ML API prices in "tokens" that are not text tokens** and never publishes the conversion
to seconds or images. Their model table shows Kling 3.0 Standard at $0.109 per 1M tokens
while their own blog quotes $0.22/s for a comparable model. Those two cannot both be true.
**Do not build a cost model on this platform without getting the conversion in writing.**

---

## 4. Rate limits and spend control

| Platform | Concurrency | Failure billing | Spend cap |
|---|---|---|---|
| Eachlabs | Balance under $10 caps at 10 concurrent (2 for metered); over $10 uncapped | 429 and 402 create no prediction and are not billed. Mid-execution failure UNVERIFIED | Balance floor acts as one |
| Apiframe | 5 to 500+ by plan; 500 req/min authenticated | **Credits auto-refunded on failure** | UNVERIFIED |
| PiAPI | 20+ concurrent, against official Kling's 5 | UNVERIFIED | None documented |
| Segmind | 60 RPM flexible, to 1,000 RPM at $599/mo | UNVERIFIED | None documented |
| WaveSpeed | Bronze 5/min and 2 concurrent; Silver 500/300 on any top-up; Gold 3,000/3,000 at $1,000; Ultra 5,000/10,000 at $5,000 | UNVERIFIED | None documented |
| Kie.ai | 20 requests per 10s, 100+ concurrent tasks | $0 per a review, UNVERIFIED officially | Prepaid wallet is the cap |
| Novita | UNVERIFIED | UNVERIFIED | None documented |
| Together AI | Dynamic, unpublished | UNVERIFIED; one review says failed calls are billed | None documented |
| AI/ML API | Unpublished | **"All sales are final", no refunds.** Implies failures are billed | None documented |

**AI/ML API's no-refund policy is the worst failure position found anywhere in this
research**, worse than Runway's safety-rejection carve-out, because it appears to cover
everything.

---

## 5. Hosting our own ComfyUI workflows

Most of these cannot. Three can.

| Platform | Our ComfyUI graph | Custom nodes | Notes |
|---|---|---|---|
| **Baseten** | **Yes** | **Yes, explicitly** | Truss packaging: `config.yaml` plus workflow JSON with Handlebars templates, `truss push --publish`. `build_commands` runs arbitrary shell at build time, so `git clone <any-node-repo> && pip install -e .` works. Confirmed with real examples |
| **RunComfy** | **Yes** | **Yes** | "Upload custom models and install any nodes", "One-click Serverless API from any workflow". Purpose-built for exactly this |
| DeepInfra | UNVERIFIED | UNVERIFIED | Cheapest dedicated GPUs found, but the custom-hosting product is LLM-shaped |
| Novita | Raw GPU VMs only | You install it yourself | $0.33/hr for a 4090. No managed ComfyUI |
| WaveSpeed | Client plugin only | N/A | Their ComfyUI integration routes YOUR ComfyUI's calls to their API. A separate enterprise serverless GPU product exists, details UNVERIFIED |
| Segmind | Pixelflow chains THEIR models | No | And the resale ban blocks it anyway |
| Eachlabs, Apiframe, PiAPI, AI/ML API, OpenRouter, Together, Kie.ai, Higgsfield | **No** | No | Pure resale gateways |

**Baseten GPU rates:** T4 $0.63/hr, L4 $0.85, A10G $1.21, A100 80GB $4.00, H100 MIG $3.75,
H100 80GB $6.50, B200 $9.98. Billed per minute, scale to zero, no idle charge. Cold start 30
to 90 seconds for large containers, mitigated by baking node installs into the image.

**RunComfy GPU rates** (pay-as-you-go / Pro at $19.99/mo): Medium T4 or A4000 $0.99 / $0.79;
Large A10G or A5000 $1.75 / $1.39; X-Large A6000 $2.50 / $1.99; A100 $4.99 / $3.99; H100
$7.49 / $5.99; H200 $9.59 / $7.66. Billed per minute of active GPU time, idle editing free.

**DeepInfra dedicated GPUs, the cheapest found:** A100 80GB $0.89/hr, H100 $2.20, H200 $2.69,
B200 $3.69, B300 $4.89. Roughly a third of Baseten's H100 rate. Worth a look if ComfyUI
support can be confirmed. Note Cubric Vision already holds a DeepInfra key for the prompt
enhancer, so the account relationship exists.

---

## 6. Platforms to drop, and why

- **OpenRouter.** Bans resale explicitly AND carries essentially none of the models. Two
  independent disqualifications.
- **Segmind.** Section 2.3 is an explicit written ban. Needs a negotiated agreement before it
  is even a candidate.
- **Higgsfield as a supplier.** It is a proprietary model platform with its own `dop-lite`
  ($0.027/s), `dop-preview` ($0.115/s) and `dop-turbo` ($0.083/s) models, not a broad
  aggregator. Its coverage of Kling, Runway and Luma is unconfirmed, its rate limits are
  undocumented and reportedly fail silently, its ToS pages 404, and API access needs a $15 to
  $99/month subscription with credits expiring after 90 days. Interesting as a competitor to
  study (see `05-competitor-economics.md`), not as a vendor.
- **Novita.** Too thin: no Seedance, Veo, Nano Banana, Runway or Luma.
- **Fireworks AI.** LLM platform. Image and video coverage too sparse.
- **AI/ML API**, unless the token conversion and the resale silence are both resolved in
  writing. The no-refund policy compounds both.

## 7. Shortlist

1. **Eachlabs** for the proprietary models. Best terms in writing, broadest coverage,
   pass-through pricing, no custom hosting.
2. **Apiframe** as the near-equal alternative. Explicit permission, Runway and Luma included,
   automatic refunds on failure, but a subscription floor of $39/month.
3. **fal.ai** (see `01-aggregators.md`) if the one-vendor story matters more than terms,
   since it is the only platform that does both halves.
4. **Baseten or RunComfy** for our own ComfyUI workflows, if we split by strength rather than
   forcing one vendor. Baseten's `build_commands` route is the closest fit to how Cubric
   Vision already pins its node pack.

The two-vendor split (Eachlabs or Apiframe for proprietary, Baseten or RunComfy for our own
graphs) is probably better than fal.ai's one-vendor story, because it buys the best terms on
the legal side and the best custom-node support on the hosting side, at the cost of one more
account.

## Open questions

- Does Eachlabs really price at zero markup? Verify against live model cards and ask how they
  make money on inference.
- Kie.ai's Terms of Use, which 403'd. Cheapest prices found, contract unread.
- AI/ML API's token-to-second conversion, and whether server errors are billed under "all
  sales are final".
- Written confirmation from Together AI that "standalone basis" does not cover a creative app.
- Whether Eachlabs or Apiframe will confirm in writing that a specific upstream model, Kling
  above all, permits end-user resale through them.
- Whether DeepInfra's dedicated GPUs can run an arbitrary ComfyUI container.
- RunComfy's commercial-use policy, unverified.
- Whether Apiframe's subscription-included credits roll over.

## Sources

All accessed 2026-09-11.

Eachlabs: eachlabs.ai/pricing, /terms-of-service, /ai-models, /kling, /explore,
/ai-video-models-for-developers; docs.eachlabs.ai/api/overview, /llms.txt.
Apiframe: apiframe.ai, /pricing, /terms-of-service, /blog/ai-video-api-pricing-2026,
/models/kling-3.0/pricing, /blog/seedance-2.0-api-providers.
Atlas Cloud: atlascloud.ai/models/media, /acceptable-use, /pricing.
PiAPI: piapi.ai, /pricing, /kling-api, /flux-api, /dream-machine-api, /sora-2,
/terms-and-conditions, and the Kling comparison and pricing blog posts.
AI/ML API: aimlapi.com/models, /terms-and-conditions, /app/sign-up;
help.aimlapi.com/article/55-terms-of-service; aimlapi.com video-model blog.
Segmind: segmind.com/pricing, /terms, /models, /pixelflow, /models/flux-pro/pricing;
blog.segmind.com/ideogram-3-0.
WaveSpeedAI: wavespeed.ai/pricing, /static/terms (dated 2026-08-06), /collections/kling,
/docs/account-levels, /docs/comfyui-integration, /docs/docs-faq, /landing/introduce.
Novita: novita.ai/pricing, /legal/acceptable-use-policy, /legal/terms-of-service;
usagepricing.com/blueprint/novita-ai.
Kie.ai: kie.ai, docs.kie.ai, kie.ai/terms-of-use (403); bitdoze.com, popularaitools.ai and
aisofting.com reviews.
Together AI: together.ai/pricing, /terms-of-service; docs.together.ai/docs/inference-models,
/billing, /rate-limits, /dedicated-models, /custom-models; cloudzero.com and eesel.ai reviews.
OpenRouter: openrouter.ai/models, /terms, /docs/api-reference/limits.
Higgsfield: cloud.higgsfield.ai; apidog.com/blog/higgsfield-api; pixazo.ai/models/higgsfield;
wireflow.ai Higgsfield alternatives.
Baseten: baseten.co/pricing, /blog/deploying-custom-comfyui-workflows-as-apis,
/blog/how-to-serve-your-comfyui-model-behind-an-api-endpoint; github.com/basetenlabs/truss;
costbench.com and guptadeepak.com reviews.
RunComfy: runcomfy.com/pricing; wireflow.ai/blog/best-comfyui-cloud-api-tools-in-2026.
DeepInfra: deepinfra.com/pricing. Fireworks: fireworks.ai/pricing.
Direct-price references: apiframe.ai/blog/ai-video-api-pricing-2026;
evolink.ai pricing guide; lumalabs.ai/api; recraft.ai/docs/api-reference/pricing;
platform.minimaxi.com/docs/guides/pricing-video.
