# Direct provider APIs: wholesale prices, terms, blockers

Researched 2026-09-11 by live fetch. Every price below is a published rate read on that date.
Anything marked UNVERIFIED could not be confirmed from an official page.

Chinese providers (Kling, MiniMax, ByteDance Seedance) are in
`02b-chinese-providers.md`. This file covers Google, OpenAI, Runway, Luma, Black Forest Labs
and ElevenLabs.

---

## The headline table

Cheapest published wholesale rate per provider, for the shape Cubric Vision would use.

| Provider | Model | Unit | Price | Self-serve for a UK solo vendor |
|---|---|---|---|---|
| Google | Veo 3.1 Lite 720p | per second | $0.05 | Yes, card only |
| Google | Veo 3.1 Fast 720p | per second | $0.10 | Yes |
| Google | Veo 3.1 Standard 720p/1080p | per second | $0.40 | Yes |
| Google | Nano Banana 2 Lite, 1K image | per image | ~$0.034 | Yes |
| Google | Nano Banana 2 (`gemini-3.1-flash-image`) 1K | per image | $0.067 | Yes |
| Google | Nano Banana Pro (`gemini-3-pro-image`) 1K | per image | $0.134 | Yes |
| OpenAI | gpt-image-2, 1024x1024 medium | per image | $0.053 | Yes |
| OpenAI | gpt-image-1-mini, 1024x1024 medium | per image | $0.011 | Yes |
| Runway | Gen-4 Turbo | per second | $0.05 | Yes, $10 minimum top-up |
| Runway | Gen-4.5 | per second | $0.12 | Yes |
| Luma | Ray3.2 720p, 5s clip | per clip | $0.30 | Yes, $5k/mo cap on Build tier |
| Luma | Uni-1.1 image, 2K | per image | $0.0404 | Yes |
| Black Forest Labs | FLUX.2 Pro text-to-image, 1MP | per image | $0.030 | Yes |
| Black Forest Labs | FLUX 3 video HD | per second | $0.17 | Yes |
| ElevenLabs | TTS on Pro plan, Flash model | per minute | ~$0.0825 | Yes, but see OEM terms |

**Dead on arrival: OpenAI Sora.** The Videos API and all `sora-2*` model ids are sunset on
**2026-09-24**, thirteen days after this research. No successor announced. Do not plan an
integration around it.

**Retiring: `gpt-image-1`** on 2026-10-23. Target `gpt-image-2`.

---

## Google (Gemini API and Vertex AI / GEAP)

### Models and ids

| Brand name | Model id | Status |
|---|---|---|
| Nano Banana (original) | `gemini-2.5-flash-image` | Legacy. One third-party source cites shutdown 2026-10-02, UNVERIFIED from official docs |
| Nano Banana 2 | `gemini-3.1-flash-image` | Current recommended |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | Current, cheapest |
| Nano Banana Pro | `gemini-3-pro-image` | Current, highest quality |
| Veo 3.1 Standard / Fast / Lite | `veo-3.1-generate-preview`, `-fast-`, `-lite-` | Current |

### Image pricing (Gemini API, ai.google.dev)

| Model | Input $/1M tok | Image output $/1M tok | Per image |
|---|---|---|---|
| `gemini-2.5-flash-image` | $0.30 | $30 | $0.039 at 1024x1024 (1,290 tokens) |
| `gemini-3.1-flash-image` | $0.50 | $60 | $0.045 at 512px, $0.067 at 1K, $0.101 at 2K, $0.151 at 4K |
| `gemini-3.1-flash-lite-image` | $0.25 | $30 | ~$0.034 at 1K |
| `gemini-3-pro-image` | $2.00 | $120 | $0.134 at 1K/2K, $0.24 at 4K |

Batch API: 50 percent off every row, asynchronous. No volume threshold.

### Video pricing (Veo 3.1, Gemini API). Audio included.

| Tier | 720p | 1080p | 4K |
|---|---|---|---|
| Standard | $0.40/s | $0.40/s | $0.60/s |
| Fast | $0.10/s | $0.12/s | $0.30/s |
| Lite | $0.05/s | $0.08/s | not supported |

An 8-second Standard 1080p clip costs $3.20. An 8-second Fast 720p clip costs $0.80.

**No free tier for image or video.** Billing required from the first request.

### Vertex AI / GEAP pricing conflict, UNRESOLVED

Third-party sources report Veo 3.1 Standard at **$0.75/s on Vertex AI** against $0.40/s on the
Gemini API. The official GEAP pricing page truncated on fetch and could not be read. This
matters: the IP indemnity below is Vertex-only, so the cheap rate and the legal protection may
not be available together. **Verify before costing anything.**

### Signup

Gemini API: Google account plus a credit card. No company, no VAT number, no business
verification. Spend caps by tier: Tier 1 $250/mo, Tier 2 $2,000/mo (after $100 spent and 3
days), Tier 3 $20,000 to $100,000+ (after $1,000 spent and 30 days). Tiers unlock on spend.

Vertex AI: GCP billing account plus card, $300 credit for 90 days on new accounts. Also
self-serve at small volume.

### Resale terms

The only explicit resale prohibition in the Gemini API Additional Terms (last updated
2026-04-28) is scoped entirely to Grounded Results:

> "you will not, and will not allow your end user or any third party to, cache, frame,
> syndicate, **resell**, analyze, train on, or otherwise learn from **Grounded Results**"

That is the Google Search grounding feature. It does not appear in the sections covering
image or video generation. Nothing prohibits charging your users for generations.

The terms do say use "is for developers building with Google AI models for professional or
business purposes, not for consumer use." Community and forum reading is that this means
developers own the integration rather than handing API keys to consumers, and that a
consumer-facing paid app is fine. **Google has published no affirmative "resale is permitted"
statement.** Absence of a prohibition is not a grant. Get written confirmation before launch.

### Watermarking

- **Visible watermark:** API outputs carry none, for either image or video. The visible Veo
  logo applies to the consumer apps (Flow, the Gemini app), not to API callers. Since
  2026-08-14 there is also a user-facing toggle in the consumer products.
- **Invisible SynthID plus C2PA metadata:** always embedded, on every tier, cannot be
  disabled by anyone. Survives ordinary transcoding.
- **No "powered by Google" attribution requirement** found in the API terms.

### Output ownership and indemnity

Google disclaims ownership: "Google won't claim ownership over that content."

IP indemnity is the decisive split. The two-part generative AI indemnity (training data plus
generated output) names the **Gemini Enterprise Agent Platform API (formerly Vertex AI API)**.
The developer-tier Gemini API at ai.google.dev is **not** on the indemnified services list.
For a commercial product this is the argument for building on Vertex/GEAP rather than the
cheaper developer key.

### Moderation obligations

Comply with the Generative AI Prohibited Use Policy. Google's own filters are the floor and
cannot be disabled. No second moderation layer is mandated, but you are responsible for the
use cases you enable.

**Hard age clause, quoted from the Additional Terms:** if your app is "directed towards or
likely to be accessed by individuals under the age of 18" you must not use the Services. An
age gate is an obligation, not an option, if under-18 users are plausible.

### Billing on failure

- **Veo: "You will only be charged if your video is successfully generated."** Safety
  rejections and technical failures are not billed. This is the most favourable failure
  policy found across every provider researched.
- **Images:** murkier. A documented issue shows `gemini-2.5-flash-image` logging safety
  blocks as success with 1 output token, so a minimal charge lands. The same source reports
  `gemini-3.1-flash-image` does not do this. UNVERIFIED from Google.

---

## OpenAI

### Sora video: DEAD

API shuts down **2026-09-24**. Pricing is recorded here only for completeness: `sora-2` at
$0.10/s 720p, `sora-2-pro` $0.30/s 720p, $0.50/s at 1792x1024, $0.70/s at 1080p; batch is 50
percent off. All Sora output carried a **visible moving-cloud logo watermark with no
documented way to disable it**, which would have been a blocker anyway.

### Image API (per image, output cost only, excludes input tokens)

**1024x1024**

| Model | Low | Medium | High |
|---|---|---|---|
| gpt-image-2 (flagship) | $0.006 | $0.053 | $0.211 |
| gpt-image-1.5 | $0.009 | $0.034 | $0.133 |
| gpt-image-1 (retires 2026-10-23) | $0.011 | $0.042 | $0.167 |
| gpt-image-1-mini | $0.005 | $0.011 | $0.036 |

**1024x1536 / 1536x1024**

| Model | Low | Medium | High |
|---|---|---|---|
| gpt-image-2 | $0.005 | $0.041 | $0.165 |
| gpt-image-1.5 | $0.013 | $0.050 | $0.200 |
| gpt-image-1 | $0.016 | $0.063 | $0.250 |
| gpt-image-1-mini | $0.006 | $0.015 | $0.052 |

Note the inversion: for gpt-image-2, non-square at Medium/High is cheaper than square despite
more pixels. Do not extrapolate cost by pixel count.

Input tokens are billed too (gpt-image-2: $5.00/1M input, $8.00/1M cached, $30.00/1M output).
A prompt plus reference images adds a small but real cost on top. Batch is 50 percent off.

### Signup, resale, watermarks

Self-serve, card only, $5 free credit, no company entity found to be required. Rate-limit
tiers rise automatically with spend: Tier 1 is 5 images/minute and 100,000 TPM, Tier 5 is 250
IPM and 8,000,000 TPM.

Resale: you own outputs and may charge your users. The prohibition is on the API access
itself. Quoted via secondary legal analysis (the Services Agreement page returned 403):
"Customers cannot buy, sell, or transfer API keys from, to, or with a third party."
**UNVERIFIED at the verbatim-clause level; read the Services Agreement directly.**

Watermarking on images since May 2026: **C2PA manifest plus an invisible SynthID watermark**,
no visible overlay. Materially better than Sora was. UNVERIFIED whether API customers can opt
out of SynthID.

Copyright Shield covers ChatGPT Enterprise and API customers and explicitly extends to DALL-E
image API usage. Whether it names gpt-image-2 after the renames is UNVERIFIED but strongly
implied. Sora video coverage was never confirmed.

Moderation is enforced at the API level rather than delegated: real people including public
figures are refused, copyrighted characters and music are refused, input images with human
faces are rejected. UNVERIFIED whether moderated image generations are billed.

---

## Runway

| Model | API name | Credits/s | $/s | 5s clip | 10s clip |
|---|---|---|---|---|---|
| Gen-4 Turbo | `gen4_turbo` | 5 | $0.05 | $0.25 | $0.50 |
| Gen-4.5 | `gen4.5` | 12 | $0.12 | $0.60 | $1.20 |
| Seedance 2.5 (up to 30s) | unlisted | UNVERIFIED | UNVERIFIED | | |

1 credit = $0.01. Developer credits at dev.runwayml.com are separate from app subscription
credits, $10 minimum top-up, and they do not expire. Also API-accessible: `gen4_image`,
`gen4_image_turbo`, `aleph2` (video-to-video), `act_two` (performance capture), pricing
UNVERIFIED.

Fully self-serve, no waitlist, no sales call, no company entity documented.

### Resale, quoted from runway.com/terms-of-use

> "you shall not license, sell, rent, lease, transfer, assign, reproduce, distribute, host,
> or similarly exploit any Services except as permitted through the APIs" (1.3(a))

> "you may use the APIs to access the Services, integrate the functionality of such Services
> into your own applications"

Charging your own users is permitted. Reselling API access is not. Section 2.5 requires that
your app "must bind end users to an enforceable end user agreement ... that contains terms no
less protective of Company than those set forth in this Agreement." So shipping this means
shipping an EULA.

### Two material constraints

1. **Mandatory "Powered by Runway" attribution with a link to runway.com on every applicable
   user interface.** Hard requirement, not optional. True white-label is not available on
   standard API terms. Budget UI space for it.
2. **A safety-rejected input still costs you.** From the task-failures docs: "Unlike other
   failures, credits are **not refunded** for `SAFETY.INPUT.*` failures." Server and internal
   errors are refunded. `SAFETY.OUTPUT.*` billing is ambiguous in the docs.

Runway trains on your inputs and outputs by default. Only Enterprise carries a non-training
clause. If Cubric Vision ships Runway below Enterprise, users must be told their content
trains Runway's models. No IP indemnity documented. No visible watermark on API output;
whether C2PA or an invisible mark is embedded is UNVERIFIED.

---

## Luma AI

No credits system, direct USD per generation.

**Ray3.2 video**

| Task | Duration | 540p | 720p | 1080p |
|---|---|---|---|---|
| Text/Image to Video | 5s | $0.15 | $0.30 | $1.20 |
| Text/Image to Video | 10s | $0.45 | $0.90 | $3.60 |
| Video to Video | 5s | $0.72 | $1.44 | $2.16 |
| Video to Video | 10s | $1.08 | $2.16 | $4.32 |
| Reframe | per s | $0.06 | $0.12 | $0.36 |

HDR is 2x SDR pricing; HDR plus EXR is 3x.

**Uni-1.1 image at 2048px**

| Task | Uni-1.1 | Uni-1.1 Max |
|---|---|---|
| Text to image | $0.0404 | $0.1000 |
| Image edit | $0.0434 | $0.1030 |
| 1 image reference | $0.0434 | $0.1030 |
| 2 image references | $0.0464 | $0.1060 |
| 8 image references | $0.0644 | $0.1240 |

Build tier is self-serve with a **$5,000/month spend cap**. Scale tier needs sales contact.

Rate limits on Build: Ray video 10 concurrent / 20 requests per minute; Photon image 40
concurrent / 80 RPM.

### Resale, quoted from the API Terms

Prohibited:

> "white-label, rebrand, resell, sublicense, or otherwise make the Services, APIs, or Output
> available to third parties as a standalone product"

> "provide any product or service to third parties on a service bureau, rental or managed
> services basis"

Allowed: "use the APIs to connect the Services with Customer's own applications and services."

Reading for Cubric Vision: Luma as one engine among several inside a larger app is an
embedded integration, not a standalone Luma product, so it appears permitted. A thin wrapper
whose only value is the Luma API would be the prohibited case. **This reading should be
confirmed with Luma before shipping.**

### Why Luma has the best output terms found

- **"Images and Videos created using the API have no watermarks of any sorts."** Quoted from
  the Luma FAQ. No C2PA either, currently. They reserve the right to add provenance metadata
  later with no commitment to prior notice.
- No mandatory attribution on the Build tier.
- **"Luma commits not to use API inputs or outputs to train, fine-tune, or otherwise develop
  Luma's artificial intelligence or machine learning models."** Stronger than Runway, which
  needs Enterprise for this.
- **"If the generation fails, we fully refund the amount to your credit balance."**
  Categorical, no carve-out for safety rejections.

### The catch: moderation is pushed onto you

Unlike Runway and OpenAI, Luma makes moderation an integrator obligation. From the API Terms,
customers must "implement and maintain reasonable content moderation policies, technical
controls, and abuse prevention measures" and maintain "a commercially reasonable process for
receiving, reviewing, and responding to complaints."

So Luma is cheap and clean on output rights but requires shipping a documented moderation
policy and a complaints process. No IP indemnity documented.

---

## Black Forest Labs (FLUX)

1 credit = $0.01, unified across API and Playground.

**FLUX 3 video, per second of output**

| Mode | HD | FHD |
|---|---|---|
| Text/Image to Video (full) | $0.17/s | $0.29/s |
| Video Continuation (full) | $0.43/s | $0.54/s |
| Text/Image to Video (draft) | ~$0.06/s | ~$0.12/s |
| Video Continuation (draft) | ~$0.14/s | ~$0.18/s |

Video Upscale Precise $0.07 per megapixel-second, Creative $0.10; Video Edit $0.03 per second.

**FLUX.2 images, floor price at 1 MP, scales with megapixels**

| Model | Text-to-image from | Image editing from |
|---|---|---|
| FLUX.2 Klein 4B | $0.014 | $0.014 |
| FLUX.2 Klein 9B | $0.015 | $0.015 |
| FLUX.2 Pro | $0.030 | $0.045 |
| FLUX.2 Flex | $0.050 | $0.050 |
| FLUX.2 Max | $0.070 | $0.070 |

Fine-tuned endpoints bill at the base model rate. Batch multiplies by image count.

**FLUX.1 flat pricing:** 1.1 [pro] $0.04, 1.1 [pro] Ultra $0.06, 1.1 [pro] Raw $0.06,
Kontext [pro] $0.04, Kontext [max] $0.08, Fill [pro] $0.05.

Self-serve at dashboard.bfl.ai, Stripe, no entity requirement. EU residents get an EU
Developer Terms variant. Standard export-control boilerplate applies.

### Terms: building an app is fine, two clauses need a lawyer

Permitted: a "Developer Application" where your end users reach FLUX through your product,
and you charge them.

Prohibited: re-exposing the API. You "may not allow access to the FLUX API ... from any source
other than the Developer Application" and cannot "host ... an API endpoint to any FLUX AI
Models that allows third parties to integrate."

**The compete clause is the risk.** You cannot "Use the FLUX Services, FLUX AI Models, or
Output to develop any product, service, or technology that competes with us or any of our
products or services." BFL is an API company rather than a desktop app vendor, and Cubric
Vision's local-first shape probably differentiates it, but the wording is broad enough to
warrant legal review before a paid tier ships.

Pass-down obligation: end users must be bound to terms "no less protective of us than those
set forth in these Terms." Developer is "solely responsible for all activities that occur on
the Developer Application."

### Content Credentials are mandatory and tamper-prohibited

You may not "Remove, disable, alter, obscure, any Content Credentials or represent to End
Users or third parties that (i) Outputs are free of content provenance metadata or (ii) any
Task or Output was human-generated." C2PA metadata is embedded and signed; BFL may change its
form without notice. No visible watermark on Pro API images, no "powered by" requirement.

You own outputs. But BFL keeps a "fully paid, royalty-free, perpetual, irrevocable ...
right and license to use, sub-license, distribute, reproduce, modify, adapt" inputs and
outputs to improve its products, which means training on your users' generations.

**No IP indemnity clause found in either the Developer Terms or the API Service Terms.**

Moderation: you must "implement reasonable content screening mechanisms" for inputs. No
specific filter mandated, no explicit age gate imposed. Rate limits and billing-on-failure
are both UNVERIFIED.

---

## ElevenLabs

| Plan | $/mo | Credits/mo | ~TTS minutes | Pro voice clone slots | Commercial |
|---|---|---|---|---|---|
| Free | $0 | 10,000 | ~10 | No | No |
| Starter | $6 | 30,000 | ~30 | No | Yes |
| Creator | $22 ($11 first month) | 121,000 | ~121 | 1 | Yes |
| Pro | $99 | 600,000 | ~600 | 5 | Yes, 44.1 kHz PCM via API |
| Scale | $299 | 1,800,000 | ~1,800 | 3 | Yes, 3 seats |
| Business | $990 | 6,000,000 | ~6,000 | 10 | Yes, 10 seats |
| Enterprise | custom | custom | custom | custom | SLA/DPA/HIPAA/SSO |

Credit conversion: standard models bill 1 credit per character; Flash and Turbo bill 0.5.
Roughly 1,000 characters is a minute of audio, so on Pro that is **$0.165/min standard or
$0.0825/min on Flash**. Conversational agents burn about 1,000 credits per minute.

Annual billing saves about 17 percent. Unused credits roll over up to 2 months on Creator and
above. Overage rate UNVERIFIED.

### This one needs a signed agreement, and that is the finding

Standard Terms prohibit resale: you cannot "sell[], resell[], rent[], lease[], loan[],
assign[], license[], or sub-license[] our Services" without authorization. The Music API
Terms add that you cannot "resell, repackage, redistribute, sublicense, or otherwise make API
access available to any third party unless you are an Authorized Reseller."

**The OEM Terms are the route that works.** They explicitly permit embedding ElevenLabs in
your own product and, decisively:

> "Customer will independently establish the subscription price of the Bundled Service for
> its End Users."

Conditions: only **Business Entities** may do this, not Free or Starter users. End users must
be bound by agreements at least as restrictive as ElevenLabs' own. You may not pass the right
downstream to another reseller, and may not present yourself as an ElevenLabs agent.

Compounding this, Prohibited Use Policy section 9(i) requires "prior written authorization"
before "developing or using any applications or software that interact with our Services"
through APIs. The practical reading is that entering the OEM Terms is that authorization.

**Action item: a standard ElevenLabs API subscription is not sufficient to charge users for
ElevenLabs-backed generations. Contact ElevenLabs and enter OEM Terms first.** This is the
clearest contract requirement found anywhere in this research. Note the Business Entity
condition also bears on the company-formation question.

No "powered by ElevenLabs" branding required, no audible watermark on paid plans. You retain
rights to output; commercial rights persist perpetually for content made while on a paid
plan, even after cancelling. ElevenLabs takes a "perpetual and irrevocable" licence to use
content. No IP indemnity found.

Moderation duties that land on Cubric Vision specifically:

- **Voice cloning consent gate.** Cloning another person's voice without consent is
  prohibited. A developer-built UI must replicate the attestation checkbox ElevenLabs' own UI
  uses ("confirm that you have the right and consent to clone the voice"). Every generation
  is traceable to your API key, so this is your exposure.
- **Age gate.** Must not serve under-13s at all, nor 13 to 17 without parental consent.

---

## Cross-provider decision table

| Factor | Google | OpenAI image | Runway | Luma | BFL | ElevenLabs |
|---|---|---|---|---|---|---|
| Self-serve for UK solo | Yes | Yes | Yes | Yes | Yes | Yes, but OEM needs an entity |
| Charge own users | Not prohibited, no affirmative grant | Permitted | Permitted | Permitted if embedded | Permitted as Developer App | Only under OEM Terms |
| Visible watermark | No | No | No | No | No | N/A |
| Invisible provenance | SynthID + C2PA, mandatory | SynthID + C2PA | UNVERIFIED | None today | C2PA, tamper-prohibited | None |
| Mandatory branding | No | No | **"Powered by Runway" required** | No | No | No |
| Trains on your content | UNVERIFIED | UNVERIFIED | Yes below Enterprise | **No, committed** | Yes | Yes |
| Failed generation billed | Veo: no. Images: unclear | UNVERIFIED | SAFETY.INPUT not refunded | **All failures refunded** | UNVERIFIED | UNVERIFIED |
| Moderation burden | Platform | Platform | Platform | **On you** | Screening on you | **On you, incl. voice consent** |
| IP indemnity | Vertex/GEAP only | Likely via Copyright Shield | None | None | None | None |

## Open questions

- Vertex/GEAP Veo price: $0.40/s or $0.75/s. Unresolved and it decides whether the indemnity
  is affordable.
- Whether Google will give written confirmation that consumer resale is permitted.
- Whether gpt-image-2 is inside Copyright Shield by name.
- Whether Runway will negotiate away the "Powered by Runway" requirement, and at what tier.
- Whether Luma's "standalone product" prohibition really excludes an embedded engine in a
  multi-engine app. Get it in writing.
- Whether BFL's compete clause reaches a desktop generation app.
- Which ElevenLabs plan tier qualifies as a "Business Entity" for OEM Terms.
- Billing on moderated rejections for OpenAI images, BFL and ElevenLabs.

## Sources

All accessed 2026-09-11.

Google: ai.google.dev/gemini-api/docs/pricing, /docs/models, /terms;
cloud.google.com/terms/generative-ai-indemnified-services; policies.google.com/terms/generative-ai/use-policy;
techcrunch.com (watermark toggle, 2026-08-14).
OpenAI: developers.openai.com/api/docs/pricing, /docs/models/gpt-image-1,
/docs/guides/video-generation; openai.com/policies/services-agreement (403, unread);
terms.law; community.openai.com; lexology.com and proskauer.com on Copyright Shield;
krasa.ai and petapixel.com on SynthID/C2PA; unifically.com/blogs/sora-api;
aifreeapi.com (dated 2026-09-06).
Runway: runway.com/terms-of-use; docs.dev.runwayml.com and /errors/task-failures/;
help.runwayml.com; apiframe.ai; terms.law/ai-output-rights/runway/.
Luma: lumalabs.ai/api/pricing, /legal/api-terms-of-use, /api/terms, /legal/terms-of-service;
docs.lumalabs.ai/docs/faq and /docs/rate-limits; eesel.ai.
Black Forest Labs: docs.bfl.ml/quick_start/pricing and /get_started;
bfl.ai/legal/developer-terms-of-service, /legal/flux-api-service-terms, /legal/usage-policy,
/licensing.
ElevenLabs: elevenlabs.io/pricing, /terms, /oem-terms, /use-policy, /music-api-terms,
/docs/product/voices/voice-lab/instant-voice-cloning; bigvu.tv (credit conversion).
