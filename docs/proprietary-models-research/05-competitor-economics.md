# How Higgsfield and the rest actually do it, and what the margin really is

Researched 2026-09-11 by live fetch. This answers the question directly asked: how do sites
that offer many proprietary models work, and how much do they mark up.

**The headline is not what you would expect. At their top subscription tiers, several of
these platforms sell headline video models at or below wholesale.** The margin is not a
markup on the expensive models. It comes from cheap models, unused credits, and the
subscription itself.

---

## 1. Higgsfield: the direct answer to "how do they do it"

This is the best-documented of the lot, and the answer is unambiguous.

| Fact | Detail |
|---|---|
| Owns its own GPU fleet | **No** |
| Compute | Migrated to **GMI Cloud**, reported 45 percent cost reduction |
| Other compute partners | AMD and TensorWave for international scaling |
| Model sourcing | **Channel-partner deals.** ByteDance uses Higgsfield as a distribution channel and Higgsfield has "special partnership access" to Seedance |
| Models carried | Kling 3.0, Seedance 2.0/2.5, MiniMax Hailuo 02, Veo 3.1 and 3 Fast, Sora 2 (base/Pro/Pro Max), WAN 2.6, Nano Banana Pro, Flux 2, Flux Kontext, GPT Image, Seedream, plus its own Soul 2.0, Soul ID, Cinema Studio and Speak 2.0 |
| Names third-party models openly | **Yes**, in the UI and in the credit-cost table. No rebranding |
| Funding | Series A $50M at $1B (Sep 2025), extension $80M at $1.3B (Jan 2026), **Series B $400M at $5.4B (Aug 2026)**, DST Global lead |
| Revenue | **$700M annualised as of July 2026**, up from $200M at end-2025 |
| Revenue mix | ~70 percent from advertising agencies on workflow and enterprise products. Subscriptions start at $9/mo, enterprise at $200K+/year |
| CEO on strategy | Alex Mashrabov: "No single lab can win every scenario, tying yourself to any one of them is a mistake" |

So: **Higgsfield is an aggregator that rents compute and negotiates channel deals with the
labs.** It builds no foundation video model of its own for the headline tier, owns no GPUs,
and raised $400M largely to scale that aggregation globally. The $700M revenue comes mostly
from agencies, not from consumer credit top-ups.

That is the model to copy or not copy. It is not a technical moat. It is a distribution and
partnership business with a thin inference layer bought wholesale.

### Higgsfield pricing

| Plan | Monthly | Annual/mo | Credits/mo | $/credit |
|---|---|---|---|---|
| Free | $0 | | trial only | |
| Basic | ~$9 | ~$9 | 120 | ~$0.075 |
| Starter | $15 to $19 | ~$15 | 200 to 270 | ~$0.070 to $0.075 |
| Plus | $49 to $59 | $39 to $47 | 1,000 to 1,200 | ~$0.041 to $0.049 |
| Ultra | $129 | $99 | 3,000 | ~$0.033 to $0.043 |
| Business | ~$71/seat | ~$62/seat | 1,500/seat pooled | |

Credits expire at cycle end, no rollover. Top-ups ~$5 per 100 credits, 90-day expiry. Free
tier excludes commercial use and watermarks output.

| Model | Spec | Credits | $ at Ultra ($0.033) | $ at Plus ($0.049) |
|---|---|---|---|---|
| Kling 3.0 | 720p 5s | 7 to 8 | $0.23 to $0.26 | $0.34 to $0.39 |
| Kling 3.0 | 1080p 5s | 8 to 10 | $0.26 to $0.33 | $0.39 to $0.49 |
| Kling 3.0 | 4K 5s | 30 | $0.99 | $1.47 |
| Seedance 2.0 Fast | 720p 5s | 17 | $0.56 | $0.83 |
| Seedance 2.0 | 720p 5s | 22 to 25 | $0.73 to $0.83 | $1.08 to $1.23 |
| Seedance 2.0 | 1080p 5s | 45 | $1.49 | $2.21 |
| Seedance 2.5 | 720p 8s | 52 | $1.72 | $2.55 |
| Veo 3.1 Fast | 720p 8s | 22 | $0.73 | $1.08 |
| Veo 3 with audio | 720p 8s | 58 | $1.91 | $2.84 |
| Sora 2 base | 720p 4s | ~10 | $0.33 | $0.49 |
| Sora 2 Pro | 720p 4s | 30 to 50 | $0.99 to $1.65 | $1.47 to $2.45 |
| Nano Banana Pro | image | 2 | $0.066 | $0.098 |
| GPT Image | image | 1 | $0.033 | $0.049 |
| Flux Kontext | image | 1.5 | $0.050 | $0.074 |
| Speak 2.0 lipsync | 720p 5s | 14 | $0.46 | $0.69 |

---

## 2. The margin arithmetic, shown in full

Wholesale references used below, all from this research folder:

- Kling 3.0 720p, 5s: **$0.28** via fal at $0.056/s, **$0.35** via Kie, **$0.42** direct
- Seedance 2.0 Fast 720p, 5s: **$0.60** at BytePlus $0.12/s
- Veo 3.1 Fast 720p, 8s: **$0.80** at Google $0.10/s
- Veo 3.1 Standard 720p, 8s: **$3.20** at Google $0.40/s
- Nano Banana Pro, 1K image: **$0.134** direct Google
- Nano Banana 2, 1K image: **$0.067** direct Google, **$0.04** via Kie

### Pair 1: Higgsfield, Kling 3.0 720p 5s, Ultra tier

Retail $0.23 to $0.26. Wholesale $0.28 to $0.42.
**Gross margin: negative, between -8 percent and -83 percent.**

### Pair 2: Higgsfield, Kling 3.0 720p 5s, Plus tier

Retail $0.34 to $0.39. Wholesale $0.28 (best case, fal).
Margin = (0.36 - 0.28) / 0.36 = **+22 percent.** Against the $0.42 direct price it is
negative again.

### Pair 3: Higgsfield, Nano Banana Pro image, Ultra tier

Retail $0.066. Wholesale $0.134.
**Margin: -103 percent.** They sell it for roughly half what Google charges.

### Pair 4: Pollo AI, Kling 3.0, Pro tier

Retail ~80 credits at $0.026 = **$2.08**. Wholesale $0.35.
Margin = (2.08 - 0.35) / 2.08 = **+83 percent, a 5.9x markup.**

### Pair 5: Freepik/Magnific, Kling 3.0 720p 3s, Premium+ annual

Retail 780 credits at $0.000675 = **$0.527**. Wholesale 3s at $0.07/s = $0.21.
Margin = (0.527 - 0.21) / 0.527 = **+60 percent, a 2.5x markup.**

### Pair 6: Hedra, Veo 3 720p 5s, Professional tier

Retail 55 credits/s x 5 = 275 credits at $0.00521 = **$1.44**. Wholesale at Veo 3.1 Fast
$0.10/s x 5 = $0.50.
Margin = (1.44 - 0.50) / 1.44 = **+65 percent.** Against Veo 3.1 Standard at $0.40/s = $2.00,
it is negative.

### Pair 7: Hedra, its OWN Character-3, 720p 5s, Creator tier

Retail 6 credits/s x 5 = 30 credits at $0.00556 = **$0.17**. Wholesale is their own compute,
not a licence fee.
This is the tell. **Their house model costs 6 credits/second against Sora 2 Pro at 70 and Veo
3 at 55, a 9 to 12x premium on the licensed models.** The house model is where the margin is.

### What the arithmetic actually shows

**The spread across platforms for the same model is enormous: Kling 3.0 at 5 seconds costs
$0.23 on Higgsfield Ultra and $2.08 on Pollo Pro. That is a 9x difference for an identical
generation.**

Higgsfield's top tier is loss-leading on headline models. That is affordable when you have
raised $400M and 70 percent of revenue comes from agencies. It is not a pricing strategy a
self-funded product can copy.

Where the money actually is, in order:

1. **Breakage.** Higgsfield, Pollo, OpenArt, Krea, Hedra and Adobe all expire subscription
   credits monthly with no rollover. Every unused credit is pure margin. Leonardo caps its
   Token Bank at 3x the monthly allocation and forfeits the whole bank on cancellation.
2. **Cheap models subsidising expensive ones.** A user on a fixed credit budget who generates
   images at $0.03 against a $0.05 retail price funds the one Veo clip sold below cost.
3. **House models.** Hedra's Character-3, Higgsfield's Soul, Pollo 2.5, LTX-2.
4. **The subscription floor itself.** A $9 to $15 entry plan collects revenue from users who
   generate almost nothing.
5. **Agencies and enterprise**, which is where Higgsfield's actual $700M lives.

---

## 3. The full competitor table

| | Higgsfield | Pollo AI | Kie.ai | Freepik/Magnific | Krea | Leonardo | OpenArt | LTX Studio | Hedra |
|---|---|---|---|---|---|---|---|---|---|
| Model brands shown openly | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Has own model | Soul, Cinema, Speak | Pollo 2.5 | No | Mystic | Krea 2 | No | No | LTX-2 | Character-3 |
| Cheapest paid tier | ~$9 to $15 | ~$10 to $15 | none, $5 top-up | $14.50 annual | $9 | $12 | $14 | $15 | $15 |
| Best $/credit | $0.033 | $0.018 | $0.005 | $0.00063 | $0.00114 | varies | $0.00165 | $0.00114 | $0.00521 |
| Credit rollover | No, packs 90d | No, packs never expire | **Never expire** | Annual pool | No, packs 90d | Bank capped 3x, lost on cancel | Add-ons roll indefinitely | UNVERIFIED | No, packs carry |
| Free tier | trial only | 20/mo + earn more | 80 to 5,000 at signup | ~20 images/day | 100/day | 150/day, public | 40 one-time | 800 one-time | ~100 one-time |
| Commercial gate | paid tiers | paid tiers | UNVERIFIED | Premium | Basic $9 | paid | Plus $34 | Standard $35 | all paid |
| Developer API | higher tiers | same wallet | core product | yes, credit prepay | Pro+, opaque | separate pool | enterprise only | enterprise, UNVERIFIED | api.hedra.com |

Krea's per-model compute-unit table is not published; the reviewer notes it is "not always
obvious how much a task will cost until you run it". Leonardo prices by GPU load with no
per-model table at all, quoting only that one 8-second Veo 3 clip is worth 300+ basic image
generations. LTX Studio bills "computing seconds" and publishes no per-model rate. **Three of
the nine deliberately hide per-model cost.** That is a product choice worth noting: it makes
comparison impossible and lets them reprice silently.

---

## 4. Adobe and Canva: the two ends of the disclosure spectrum

**Adobe Firefly names everything.** Its partner-model picker openly lists Kling 2.5 Turbo,
3.0 and 3.0 Omni, Luma Ray2, Ray3, Ray3.14, Runway Gen-4.5 and Aleph, Sora 2, Veo 2, Veo 3,
3.1 and 3.1 Fast, Pika 2.2, Moonvalley Marey, Topaz Astra, plus FLUX.1 Kontext, FLUX.1.1,
FLUX.2 pro, Gemini 2.5 Flash Image / Nano Banana 2, GPT Image, Ideogram 3.0 and ElevenLabs
Multilingual v2. As of 2026-09-09, five of these run natively inside Premiere Pro.

**That is the strongest possible evidence that Kuaishou, Google, OpenAI, Runway, ByteDance
and BFL all permit named resale at consumer scale.** If Adobe can list "Kling 3.0" in a
dropdown, the model providers are not hiding behind white-label requirements.

**And Adobe's real differentiator is not the roster, it is indemnity.** Adobe indemnifies
only NATIVE Firefly outputs. Partner-model outputs carry **zero Adobe indemnification**. So
even the largest incumbent, reselling the same models, offers its customers nothing on the
partner tier. That is exactly the position Cubric Vision would be in, which is oddly
reassuring: nobody in this market indemnifies third-party model output.

Adobe pricing for reference: Firefly Premium $4.99/mo for 100 credits, i.e. **$0.05/credit**;
video generation costs 50 to 100+ credits per second, so **$2.50 to $5.00 per second of
video** at that tier. Creative Cloud All Apps at $54.99 to $59.99 includes 250 credits.
Partner models draw from the same pool with no published per-model differential. Credits
reset monthly with no rollover.

**Canva is the opposite.** Veo 3 powers its Pro video generation but there is no model
picker and the UI never confirms which model ran. Leonardo, which Canva bought for $370M in
2024, is rebranded as "Dream Lab". Pro is $18/mo ($12 annual) for 20 Ultra AI uses, so about
**$0.90 per clip**. Free tier is 5 lifetime clips. Adobe proves open naming is permitted, so
Canva's opacity is a product decision, not a licensing constraint.

---

## 5. MiniMax resells its competitors inside its own product

Worth its own note. **Hailuo AI, MiniMax's own consumer product, sells Veo 3.1, Sora 2 and
GPT Image 1.5 to its users at Standard tier and above**, alongside its own H3 and Hailuo 2.x.

A frontier lab reselling Google's and OpenAI's models inside its own consumer app is about as
strong a signal as exists that these licences are broadly available. It also says the CEO of
Higgsfield is right: nobody thinks one lab wins every scenario.

Hailuo's consumer pricing is unreliable across sources (Standard quoted at $7.99, $10.50 and
$14.99 by three reviewers between July and September 2026, with one flagging that the pricing
cards do not state a currency). Per-credit works out around $0.008 either way. Credit costs:
Hailuo 2.0 at 512p 6s is 12 credits (~$0.096), Hailuo 2.3 Standard 768p 6s is 25 to 35, 1080p
is ~50 to 80, Veo 3.1 ~50 to 80, Sora 2 ~30 to 60.

---

## 6. What this means for Cubric Vision

1. **Do not compete on headline-model price.** Higgsfield sells Kling below wholesale at its
   top tier on the back of a $400M raise and agency revenue. That fight is unwinnable and not
   worth entering.
2. **The realistic markup band is 50 to 85 percent gross** (Freepik 60 percent, Hedra 65
   percent, Pollo 83 percent), before payment fees, failed generations and support. Pollo's
   6x markup shows the ceiling the market will bear when the buyer is not comparing.
3. **Expiring credits are standard and are a material part of the margin.** Every platform
   except Kie.ai expires subscription credits monthly. If Cubric Vision's credits never
   expired, it would be giving away the industry's main margin source. That is a deliberate
   product decision either way, not an oversight.
4. **Naming the models openly is normal.** Every single platform studied does it. There is no
   need to hide "Kling" behind a house brand, and hiding it (Canva) is the outlier.
5. **Nobody indemnifies partner-model output, including Adobe.** So the absence of indemnity
   is not a competitive disadvantage, just a term to state plainly to users.
6. **A house model or a genuinely differentiated surface is where the margin lives.** Hedra
   charges 6 credits/second for its own model against 55 to 70 for licensed ones. Cubric
   Vision's equivalent asset is the local and BYO-RunPod path, which costs nothing per
   generation. That is a stronger version of the same idea: the free local tier is the house
   model, and cloud models are the premium convenience tier.

## Open questions

- Higgsfield's actual wholesale rates under its ByteDance channel deal. Not public, and it is
  what makes its Ultra pricing possible.
- Whether Higgsfield Basic at $9/mo still exists or was folded into Starter. Their live
  pricing page is client-rendered and returned only a marketing shell.
- Pollo's per-model credit costs at stated resolution and duration; the numbers found do not
  state either.
- Krea, Leonardo and LTX Studio per-model rates, all deliberately unpublished. A Pro trial
  and one test generation each would settle it.
- Whether any of these platforms' ToS permits their customers to resell onward. None of the
  fetched sources addressed it.
- Real cost data from a small studio that has run a credit product: payment fees, failed
  generations, abuse, support load, breakage. **Not found.** The search budget was exhausted
  before this could be answered and it is the single most valuable missing input.

## Sources

All accessed 2026-09-11. Live pricing pages for Higgsfield, Pollo and Kie.ai were
client-rendered or returned 403, so those figures come from dated third-party reviews and
should be confirmed at checkout before use in a financial model.

Higgsfield: techcrunch.com Series B (2026-08-17); prnewswire.com Series B release;
sacra.com/c/higgsfield; finance.biggo.com on the Chinese-model channel analysis;
aiforesight360.com, aifunnelinsider.com, imagine.art, creatify.ai, layer3labs.io.
Pollo: aireviewlab.io, vijaytalksai.com, toolstacker.io, flowith.io.
Kie.ai: bitdoze.com (review and video guide), aiinsightsnews.net, popularaitools.ai.
Freepik/Magnific: photutorial.com, eesel.ai, magnific.com/pricing, aiagentsquare.com,
checkthat.ai, usagepricing.com.
Krea: reviewner.com, costbench.com (two entries), saastruecost.com, piclumen.com, aisotools.com.
Leonardo: eesel.ai, fluxnote.io, checkthat.ai.
OpenArt: openart.ai/models, /blog/best-ai-generators, /enterprise; checkthat.ai, promptsrush.com.
LTX Studio: dupple.com, toolfi.ai, vijaytalksai.com, therundown.ai.
Hedra: usagepricing.com, max-productive.ai, fluxnote.io, magichour.ai, coldiq.com,
influencerbuilder.ai.
Adobe: adobe.com/products/firefly/partner-models.html; news.adobe.com (April 2026 Creative
Agent); blog.adobe.com (2026-03-19); feisworld.com; xainflow.com; news.creeta.com on partner
indemnity; techsifted.com and sudomock.com on pricing; techtimes.com (2026-09-09, 403).
Canva: amrytt.com, morphed.app, fluxnote.io, allable.ai.
Dreamina and Hailuo: dreamina.capcut.com/pricing (shell only), scopeful.org, flowith.io,
thetoolsverse.com, atlascloud.ai, aiarty.com, kingy.ai, costbench.com.
