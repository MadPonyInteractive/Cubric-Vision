# Proprietary models in Cubric Vision: research, 2026-09-11

Temporary research folder. Question asked: can Cubric Vision offer closed proprietary models
(Seedance, MiniMax, Kling, Nano Banana, Veo and the rest) the way Higgsfield and similar sites
do, what would it cost, do we need our own server, and do we need contracts with the
proprietors. Second question: if we end up with a server endpoint, could our own models live
there too.

**Status: research complete, no decision taken, nothing built.** Every price and contract
clause here was read live on 2026-09-11 and carries a source. Anything that could not be
confirmed is marked UNVERIFIED rather than guessed.

---

## The files

| File | What is in it |
|---|---|
| [00-cubric-vision-integration-points.md](00-cubric-vision-integration-points.md) | **The internal half.** What in this codebase would have to change, and the fact that bring-your-own-key is already a shipped pattern here, twice |
| [01-aggregators.md](01-aggregators.md) | fal.ai, Replicate, Runware, Modal. Includes the one-vendor-for-both question |
| [01b-more-aggregators.md](01b-more-aggregators.md) | The other twelve, ranked by whether their terms permit this at all |
| [02-direct-provider-apis.md](02-direct-provider-apis.md) | Google, OpenAI, Runway, Luma, Black Forest Labs, ElevenLabs: prices, terms, watermarks |
| [02b-chinese-providers.md](02b-chinese-providers.md) | **Kling, MiniMax, ByteDance.** The models actually asked for, and the worst legal picture |
| [03-legal-and-contracts.md](03-legal-and-contracts.md) | Resale clauses, partner programmes, UK/EU obligations, VAT, content liability |
| [04-architecture-and-billing.md](04-architecture-and-billing.md) | What to build and run, what it costs per month, effort in developer-days |
| [05-competitor-economics.md](05-competitor-economics.md) | **How Higgsfield actually does it**, plus margin arithmetic across nine competitors |

---

## The seven findings that matter

**1. Yes, it is possible, and the app is closer to it than expected.** Bring-your-own-key is
already shipped in Cubric Vision twice: the RunPod key and the DeepInfra key for the prompt
enhancer, both encrypted in `main/secretsStore.js` via Electron safeStorage, fetched over the
fork bridge, scrubbed from logs by `routes/secretRedaction.js`. A third provider key is not
new architecture.

**2. Higgsfield owns no GPUs and trained no headline model.** It rents compute from GMI Cloud,
negotiated channel deals with the labs (ByteDance uses it as a distribution channel for
Seedance), names every third-party model openly in its UI, and raised $400M at a $5.4B
valuation in August 2026 on $700M annualised revenue, about 70 percent of it from advertising
agencies. It is a distribution business with a thin bought-in inference layer.

**3. Reselling is generally permitted, in one specific shape.** Every readable contract draws
the same line: wrap it in your own product and charge your users, fine. Resell the API access
or the key itself, forbidden. OpenAI, Runway, Replicate, fal.ai, Eachlabs, Apiframe, PiAPI and
Atlas Cloud all say versions of this. Segmind and OpenRouter explicitly forbid it. ElevenLabs
requires signing its OEM Terms first, and only a Business Entity may.

**4. The three models actually named are the three with the worst terms.** Kling's API terms
say paid rights are "limited to your own use" and forbid licensing them to others "in any
form" without written consent. BytePlus grants a "non-sublicensable" licence and charges 20
percent liquidated damages for unauthorised API resale. MiniMax's developer ToS could not be
read at all (it only renders signed in). None of the three is safe to ship without a lawyer
and, for Kling, a written answer from Kuaishou.

**5. Aggregators are cheaper than going direct, not more expensive.** fal is 10 to 33 percent
under Kling direct; Runware is 8 to 41 percent under on several models. The reason to go
direct is a model no aggregator carries (Luma, Topaz) or terms only the proprietor can grant.
But no aggregator's permission overrides the upstream model licence, and they all say so.

**6. One vendor can serve both proprietary models and our own ComfyUI graphs: fal.ai.** It has
the broadest catalogue and native serverless ComfyUI (`fal deploy`). The open question is
whether it accepts arbitrary third-party custom nodes or only its own pack, which is the
single fact that decides the one-vendor plan. Baseten and RunComfy both definitely take
arbitrary custom nodes (Baseten via `build_commands` and a snapshot pinned by commit hash,
which is close to how this repo already pins its node lock), so a two-vendor split is the
safer answer.

**7. The margins are not where you would think.** At its top tier Higgsfield sells Kling 5s at
$0.23 against a $0.28 to $0.42 wholesale, and Nano Banana Pro at $0.066 against Google's
$0.134. It sells the headline models at a loss. The realistic market margin is 50 to 85
percent gross (Freepik 60, Hedra 65, Pollo 83), and a large part of the real margin is
breakage: every platform except Kie.ai expires subscription credits monthly.

---

## Three options, ranked lazy-first

### Option A: bring your own key. No server, no billing, no company, no contracts.

The user pastes their own Kling or fal key into Cubric Vision exactly as they already paste a
RunPod key. They pay the provider directly. We take nothing and hold nothing.

- **Our cost to run: zero.** No proxy, no accounts, no payment processor, no VAT, no
  chargebacks, no support for other people's spend.
- **Internal work:** a secrets field, a cloud executor, a progress adapter, a ModelDef
  discriminator and five install-gate branches. See file 00.
- **Legal exposure: near zero.** The user holds the contract with the provider, not us.
- **Revenue: none.**
- **Catch:** fal.ai's terms forbid exposing its API directly to end users, so BYO-key works
  with direct providers, not with fal. And it only suits users willing to hold an API key,
  which is a narrow slice of the audience.

This is the option that changes nothing about what Cubric Vision is. It is free, accountless
and local-first today, and it stays that way.

### Option B: credits, our key, a thin proxy. The Higgsfield shape, scaled down.

- **Architecture:** a stateless Cloudflare Worker plus D1 holding the key, debiting credits
  and forwarding to one aggregator; provider webhook back to the Worker; the desktop app polls
  the Worker, never the provider. An API key cannot live in an Electron app, so the proxy is
  mandatory, not optional.
- **Payments:** Paddle or Lemon Squeezy as merchant of record, so a UK solo developer never
  registers for VAT in 27 EU states plus the US sales-tax states.
- **Running cost: roughly $5 to $25/month at 100 to 1,000 users, $50 to $150/month at 10,000.**
  That excludes the model calls themselves, which the credits pay for.
- **Build effort: about 15 to 23 developer-days for a single-model MVP**, then 1 to 2 days per
  additional model.
- **Legal work required first:** written consent from Kuaishou for Kling, a solicitor on the
  BytePlus terms, the MiniMax developer ToS exported and read, ElevenLabs OEM Terms signed if
  audio is included, and a terms of service, acceptable use policy, refund policy and privacy
  policy of our own.
- **Margin:** plan on 50 to 85 percent gross before payment fees, failed generations, refunds
  and support load.

This is the option that changes what Cubric Vision is. Free, accountless and local stops being
the whole story.

### Option C: both, with the free paths untouched.

Local and BYO-RunPod stay exactly as they are and stay free. Cloud models arrive as a clearly
marked paid tier. This is what the user proposed and it is the right shape, but note that it
costs the same as Option B, because the proxy, the payments, the ledger and the legal work are
all still required. The free tier does not reduce the work; it only protects the product.

---

## What I would do next, cheapest first

Four of these cost almost nothing and remove most of the uncertainty:

1. **Open a BytePlus account from a UK address.** Ten minutes. Their own availability page
   lists the UK, a developer source says it does not. Settles it.
2. **Email Kuaishou developer support** asking for written consent for a third-party desktop
   app where end users submit prompts through our key. Their answer decides whether Kling is
   available at all, and it is the model most often asked for.
3. **Ask fal.ai whether arbitrary third-party ComfyUI custom nodes are supported.** One
   question, and it decides one-vendor versus two-vendor.
4. **Sign in to platform.minimax.io and export the developer ToS.** It only renders signed in,
   and it is currently the most important unread document in this research.

Then, if the answers are good: prototype Option A behind the dev gate with one provider, since
it is the largest share of the internal work and none of the legal or billing work. If it
feels right in the app, Option B is mostly business plumbing on top of an executor that
already exists.

---

## Health warning on this research

- **Every price moves monthly.** Confirm at checkout before anything enters a financial model.
  Several competitor pricing pages are client-rendered and returned only marketing shells, so
  those figures come from dated third-party reviews and are labelled as such.
- **Several key contracts could not be read.** Kling's API paid-service protocol, MiniMax's
  developer ToS, the BytePlus video-model specific terms and Kie.ai's terms of use are all
  either JavaScript-rendered or 403. The most important legal documents in this decision are
  the ones we have not seen in full.
- **OpenAI's Sora API shuts down 2026-09-24**, thirteen days after this research. It is in the
  tables for completeness only. `gpt-image-1` retires 2026-10-23; target `gpt-image-2`.
- **One gap was not filled:** real cost data from a small studio that has actually run a
  credit-based generation product (payment fees, failed generations, abuse, support load,
  breakage). The session's web-search budget ran out before that could be answered, and it is
  the single most valuable missing input. It needs a fresh session to chase.
- **A note on file 04:** it calls the cloud path a new "producer". File 00 argues it is really
  a new executor behind the existing `enqueueGeneration` producer, not a fourth producer. Same
  build either way; the distinction matters when reading the generation-lifecycle doc.
