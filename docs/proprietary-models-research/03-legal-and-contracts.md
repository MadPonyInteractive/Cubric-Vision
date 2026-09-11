# Legal and Commercial Layer: Reselling Closed Proprietary Models

Handoff doc. Read cold. Covers the proposal to add Kling, Seedance, Hailuo, Nano Banana, Veo, Sora and Runway
as paid credit-based options inside Cubric Vision, sold to end users, on top of the existing free local and
bring-your-own-RunPod paths.

**This is not legal advice.** I am an AI research agent, not a solicitor or accountant, and nothing here should
be treated as a substitute for one. Every claim below is dated and sourced from a live fetch or search performed
on 2026-09-11. Where I could not verify something directly (paywalled terms, a page that would not render, a
provider that never answered), it is marked **UNVERIFIED** with what would confirm it. Anywhere marked
**NEEDS A SOLICITOR** is a genuine legal judgment call, not a research gap.

---

## 1. Resale is the core question

Three models, as framed by the assignment:

- **(a) BYO key**: the end user pastes their own provider API key into Cubric Vision. They pay the provider
  directly. We take nothing and are not a party to that contract.
- **(b) Proxy/reseller**: we hold the key, bill the user in credits, keep a margin.
- **(c) Formal partner/reseller agreement**: a signed contract with the provider.

### The pattern that actually shows up in the terms

Every provider whose primary contract I could read draws the same line, worded differently: you may **build an
application and charge your own end users for access to it**, but you may **not resell the raw API account,
key, or credentials themselves**. That is model (b) done as "wrap it in your product," not model (b) done as
"hand out sub-accounts." This is also exactly the architecture that Higgsfield, Freepik, Leonardo.ai, Krea,
OpenArt and fal.ai already run in production, aggregating Kling, Veo, Seedance and others behind one credit
system (WaveSpeed AI blog, "Best Free AI Video Generator Online in 2026", accessed 2026-09-11,
https://wavespeed.ai/blog/posts/best-free-ai-video-generator-online-wavespeed-2026/; multiple corroborating
comparison blogs). That existing market is the strongest practical evidence that model (b) is tolerated at
scale, even though no provider calls it "reselling" in their own marketing.

#### OpenAI

Fetched directly: `cdn.openai.com/osa/openai-services-agreement.pdf` ("OpenAI Services Agreement ONLINE
v.010126", accessed 2026-09-11). This is the clearest primary-source permission of any provider surveyed.

- Section 2.2: "OpenAI grants Customer a non-exclusive right to access and use the Services during the Term.
  This includes the right to use OpenAI's API to integrate the Services into Customer Applications **and to
  make Customer Applications available to End Users**."
- Section 3.1: "Customer **may not resell or lease access to its Account or any End User Account**."
- Section 3.3(g): Customer will not "buy, sell, or transfer **API keys** from, to, or with a third party."
- Section 4.1: "Customer... owns all Output. OpenAI hereby assigns to Customer all OpenAI's right, title, and
  interest, if any, in and to Output."
- Section 4.3: "Customer is **solely responsible for all use of the Outputs**."
- Section 13.2: Customer indemnifies OpenAI for claims arising from "(a) use of the Services in violation of
  this Agreement; (b) Customer Applications... or (c) Customer Content." In other words, if an end user of
  Cubric Vision generates something illegal through our OpenAI key, the contractual liability runs from OpenAI
  to us, not the other way round.
- Section 16.11 (Trade Controls) and 16.12 (Geographical Limitations): customer is solely responsible for
  sanctions/export-control compliance and may not offer access outside OpenAI's "Supported Countries and
  Territories."

Net: charging end users for an app built on the API is explicitly permitted. Reselling the account/key is
explicitly forbidden. This is the model to design around.

#### Runway

Fetched directly: `runway.com/terms-of-use` (accessed 2026-09-11).

- "If you have purchased access to the APIs, you may use the APIs to access the Services, integrate the
  functionality of such Services into your own applications, products, and services ('Your Applications'), and
  **make that functionality available to end users** as part of Your Application, provided that Your
  Applications made available to end users must **prominently display 'Powered by Runway' and link to
  runway.com** on applicable user interfaces."
- Section 1.3: "you shall not license, sell, rent, lease, transfer, assign, reproduce, distribute, host, or
  similarly exploit any Services **except as permitted through the APIs**."
- Section 2.5: end users of Your Application "must be bound by an enforceable end user agreement... that
  contains terms no less protective of Company than those set forth in this Agreement... You will ensure that
  end users comply."
- General terms elsewhere: "Runway reserves the right to limit or prohibit orders that appear to be placed by
  dealers, resellers, or distributors" (from search snippet of runwayml.com/terms-of-use, same clause family).

Net: same shape as OpenAI (build-and-charge is fine), with one concrete product requirement Cubric Vision would
have to satisfy: a visible "Powered by Runway" credit if Runway is added, and our own EULA with end users that
is at least as protective of Runway as Runway's own terms are of us.

#### Google (Gemini API / Veo / Nano Banana)

Fetched directly: `ai.google.dev/gemini-api/terms` (accessed 2026-09-11), plus search-derived detail on Veo.

- No explicit resale prohibition surfaced in the fetched Additional Terms of Service. A prior confirmed
  discussion thread exists ("Confirming resale/reseller policy scope for the Gemini API",
  https://discuss.ai.google.dev/t/confirming-resale-reseller-policy-scope-for-the-gemini-api/181039) which
  I did not fully read; treat the absence of a found prohibition as **UNVERIFIED, not confirmed permission**.
- Critical operational clause: **"Google doesn't use your prompts... or responses to improve our products"**
  only applies once you are on the **Paid Service** tier. On the free/unpaid tier: "Google uses the content you
  submit to the Services and any generated responses to provide, improve, and develop Google products and
  services." A credit-selling product must always route traffic through a billed Cloud project, never a free
  API key, or every user's prompts and generated images become Google training data by default.
- "You may only access the Services (or make API Clients available to users) within an available region."
- Veo output: "Content you generate with Veo 3 is owned by you (the creator), subject to Google's terms," and
  "customers may elect to use Veo 3.1 for production or commercial purposes, or disclose generated output to
  third-parties" (search-derived, from a Google Cloud blog on generative AI indemnification; **UNVERIFIED
  against primary Vertex AI terms text**, recommend a direct read of
  `cloud.google.com/terms/service-terms` before committing).
- Google has publicly committed to IP indemnification for unmodified Vertex AI generative output against
  third-party infringement claims (Google Cloud blog, "Protecting customers with generative AI indemnification",
  accessed via search 2026-09-11). This is unusually favourable versus the Chinese providers below, all of whom
  push that risk onto the integrator.

#### Kling (Kuaishou / LOHAS GAMES PTE LTD)

Fetched and read in full as a PDF: "KLING AI Terms of API Paid Service", released 2024-09-29, contracting entity
LOHAS GAMES PTE LTD, source `d7umqicpi7263.cloudfront.net/eula/rOOlPm0Q-PwhpSN7vSdy7rsUH_1CdcGH5vLMtbLpEgE`
(accessed 2026-09-11). This is the one provider where the language genuinely pulls in two directions, and I
would flag it to a solicitor before relying on it.

Against resale:
- Clause 8.2.2: users must not, "[s]ave as expressly permitted under these Terms, use any one or more API
  Services and rights **for profit** or illegal gain, **sell, transfer, license or transfer** any one or more
  API Services or paid rights you enjoy in various ways, or **lend the service or paid rights to others for
  use**."
- Clause 10.3: "each API Service and the corresponding paid rights and interests are **limited to your own use
  through your registered User Account**. Without the written consent of us, each User is prohibited from
  granting, borrowing, renting, transferring, selling or otherwise licensing the use of the User Account and
  the API Services... to others in any form."
- Clause 3.3: the license granted is "non-exclusive, non-transferable" and states materials/software/data
  provided "belong to we, and you has no right to disseminate, transfer, license, or provide these resources to
  others for use."

For an integrator model:
- Clause 1.4 defines **"Client Application"** as "the website, client, application, platform, mini-program and
  mobile or non-mobile smart terminal device that uses this Service and is legally operated by you" - a term
  that only makes sense if building a downstream product for end users is contemplated.
- Clause 6.4: **"You use of the AI-generated content for commercial purposes is not restricted."**
- Clause 5.1: explicitly contemplates the Client Application having its own "natural person end users" and
  requires you to explain in your own privacy policy that your app uses Kling's products.
- Clause 11.7: "If you breaches the contract and **sublicenses this Service to any third party**, you shall
  also bear any losses incurred by the third party... and we shall not make any compensation to any other third
  party." This reads as a consequence-of-breach clause, which implies sublicensing is possible but breaches the
  contract and shifts all risk to you, rather than voiding the whole relationship outright.

My read: Kling's terms were clearly drafted with a B2C SaaS-on-top-of-API model in mind (hence "Client
Application" and the privacy-policy pass-through obligation), but the resale/sublicense language in 8.2.2 and
10.3 is broad enough that a literal reading could catch a credit-reselling storefront. This is genuinely
ambiguous on the paper alone. **NEEDS A SOLICITOR**, and separately, I would email
kling@kuaishou.com (the contact address given in the terms) to get it in writing before building a Kling
credit tier, since 4.2(iv) lets Kling keep all prepaid fees as "liquidated damages" if they terminate you for a
violation.

#### ByteDance / BytePlus ModelArk (Seedance, Seedream)

- Confirmed via direct fetch of the rendered page `docs.byteplus.com/en/docs/ModelArk/2353368` ("BytePlus
  Platform Customer Code of Conduct"), accessed 2026-09-11: **"Upon verification and confirmation that a
  customer has engaged in unauthorized resale of APIs, BytePlus shall have the right to immediately ban the
  relevant accounts... and require the customer to pay liquidated damages equal to 20% of the Minimum
  Commitment Amount specified in the Service Agreements."** Plus: "If the aforementioned liquidated damages are
  insufficient to cover BytePlus' actual losses... the Platform Customer shall separately provide full
  compensation for the shortfall."
- The word "unauthorized" is load-bearing and not defined on the page I could render. BytePlus separately
  publishes an "Integrate with third-party tools" doc (`docs.byteplus.com/en/docs/ModelArk/2160841`), which
  strongly implies building integrations is an intended, authorized use case; I could not render its body text
  live to quote it. **UNVERIFIED**, recommend reading that page directly plus the main ModelArk Terms of
  Service before launch.
- Output ownership (from search-derived synthesis of BytePlus's own docs, cross-checked against the Code of
  Conduct page structure): "Generated output is customer data... BytePlus does not claim ownership of the
  Output." Customers must "legally own intellectual property rights to Custom Assets and Authorized Assets, or
  have obtained full authorization from relevant right holders."
- Territory flag found in a search snippet only, **not independently confirmed by direct fetch**: "Any use,
  including without limitation, the transmission, modification, fine-tuning, distribution, licensing,
  sublicensing, sale, resale, operation, or any form of use of **Restricted Models are strictly prohibited
  within the entire territory of the EU or on the EU market**." If accurate, this would matter a lot for a
  UK-based app with EU users, since it could mean specific BytePlus models cannot be offered to EU-resident end
  users at all. **UNVERIFIED, high priority to confirm** against
  `docs.byteplus.com/en/docs/ModelArk/Specific_Terms_for_the_BytePlus_Video_Generation_Model_Services` directly
  before committing to Seedance.

#### MiniMax (Hailuo)

MiniMax's terms are split across four separate product-specific documents (Platform/API, Agent, Audio, Hailuo
Video), fanned out from a master page at `www.minimax.io/terms-of-service-v2.html`, which I fetched directly
and confirmed the structure of (accessed 2026-09-11): "In the event of a conflict between these Terms and the
applicable product terms for a particular Service, the applicable product terms will control." I was not able
to render the body text of the linked product-specific documents
(`platform.minimax.io/protocol/terms-of-service`, `hailuoai.video/doc/terms-of-service.html`) live; both
attempts returned empty content. Search-result synthesis (not independently verified) suggests a standard
"prohibited without a written agreement" resale clause exists, in the same family as the others:
"MiniMax's terms prohibit users from reselling, sublicensing, or providing the Services to third parties
without a written agreement." **UNVERIFIED**, treat as directionally likely but confirm by reading the actual
Platform Terms before relying on it.

Separately, and this is a genuinely useful finding: MiniMax's **H3 open-weight Community License** carries
territory restrictions (excludes the EU, UK, South Korea and the US from self-hosted deployment) and a
revenue gate (written authorization required above $20M/year in commercial revenue), per a detailed third-party
legal-blog breakdown with section citations (atlascloud.ai, "MiniMax H3 Commercial Use License: 4 Countries,
$20M, and Who Pays", accessed 2026-09-11). Critically, that same source states **this license only governs
self-hosted weights, not hosted API access**: "If you're a proxy reselling another app's API generations, the
Community License never reached you. Your provider's terms govern your users." Cubric Vision would be using the
hosted API, not self-hosting H3 weights, so the UK-exclusion in the open-weight license should not apply, but I
have not independently confirmed this against MiniMax's own Platform Terms of Service. **UNVERIFIED, worth a
direct written confirmation from MiniMax before launch given the UK is named as an excluded territory in the
adjacent document.**

### BYO key (model a): what it actually requires

No provider surveyed has an explicit clause permitting or forbidding a user pasting **their own** key into a
third-party desktop client that talks directly to the provider's API, with the key never touching our servers.
OpenAI's prohibition is on "buy, sell, or transfer API keys... with a third party," which targets handing out
someone else's key, not a user typing in their own. This is also how a large existing ecosystem already
operates (OpenWebUI, SillyTavern, most ComfyUI custom nodes, and per the OpenAI developer community itself:
"BYOK is a common pattern being used by many developers... OpenAI has not provided explicit legal guidance,"
community.openai.com/t/urgent-clarifications-needed-on-byok-bring-your-own-key-and-oauth-for-openai-api/330449,
accessed 2026-09-11).

Legally, the BYO key model requires little of us specifically because we are not a party to the user's
contract with the provider: no indemnification obligation flows to us, no liquidated-damages exposure, no
resale question. The two things that matter:
1. Architecture: the cleanest version calls the provider API client-side, from the user's machine, with the key
   never relayed through a MadPony-operated server. If the key is relayed through our infrastructure even
   without a markup, we become a processor of whatever passes through it (see section 4) and arguably a party
   handling the credential, which is a materially different risk profile even at zero margin.
2. We still cannot avoid all responsibility: most providers' Prohibited Use Policies bind "you and your End
   Users" regardless of who pays, so we would still want baseline in-app moderation and a clear AUP (section
   5), even on a BYO-key tier where we never see the money.

---

## 2. Partner, reseller and "build with us" programmes

| Provider | Programme found | Entry requirements (as published) |
|---|---|---|
| OpenAI | OpenAI Partner Network, three tiers (Select, Advanced, Elite) | Demonstrated ability to build/deploy/secure AI solutions, certification and training, evidence of "real business impact" through prior AI projects. No published minimum spend or entity-type gate found. Apply via openai.com/business/partners/. **UNVERIFIED** exact revenue/spend thresholds, not published. |
| Google Cloud (Vertex AI) | Partner Advantage (general Google Cloud programme, not gen-AI-specific) | To list on Google Cloud Marketplace: must be a member in good standing of Partner Advantage; basic Partner status needs at least two individuals holding a Google Cloud Professional Certification. Category-specific "Generative AI" expertise designations exist within the same programme. No published minimum revenue commitment found. |
| Runway | Three separate tracks: Enterprise API (paid, self-serve-adjacent), Runway Builders Program (Seed-to-Series-C startups get complimentary API credits and higher rate limits), Creative Partners Program (individual creators, application form, no company required) | Builders Program targets funded startups specifically, not solo/pre-seed developers; no published minimum spend found for Enterprise API beyond "purchase access." |
| Kling (Kuaishou) | No public partner/reseller programme located. | **UNVERIFIED.** Only the self-serve API Paid Service terms and a consumer Customer Support channel were found. Worth asking Kuaishou directly whether a formal reseller track exists, since the resale ambiguity in section 1 is exactly the kind of thing a written partner agreement would resolve. |
| MiniMax | "Creative Partners Program" under the Hailuo consumer brand: early feature access, credits, collaboration opportunities for creators. This is an influencer/creator programme, not a commercial API reseller track. | No enterprise/reseller-specific programme located; MiniMax does list an enterprise API tier and a general "contact us" channel (platform.minimax.io/docs/faq/contact-us). **UNVERIFIED** whether a formal partner agreement path exists beyond that. |
| ByteDance / BytePlus | No dedicated partner programme page found, but the ModelArk docs reference a "ModelArk Referral Campaign" page and an "Integrate with third-party tools" doc, both suggesting BytePlus expects and supports third-party integrators as a matter of course. | **UNVERIFIED** formal entry requirements; BytePlus's self-serve ModelArk platform (API keys, pay-as-you-go pricing) appears to be the primary route, with the Minimum Commitment Amount referenced in the Code of Conduct implying larger customers negotiate committed-spend contracts directly. |

General pattern: none of these programmes are gated behind "you must be a Ltd company" as a stated rule; the
gates that do exist are about certification, technical review and (for startup-specific tracks like Runway
Builders) funding stage. A UK sole trader could plausibly self-serve into every one of these except a
negotiated enterprise/committed-spend agreement, where a counterparty will usually want to contract with a
registered legal entity as a practical matter even if not a stated legal requirement. **NEEDS A SOLICITOR** to
confirm whether any of these providers' standard commercial paper (as opposed to the self-serve click-through
terms already quoted in section 1) requires a specific entity type; I did not have access to any actual signed
partner agreement to check.

---

## 3. Chinese providers: what a UK entity actually has to do

### ICP filing

Not required for us. ICP (Internet Content Provider) filing is a mainland-China requirement that attaches to
infrastructure **hosted inside mainland China**. A UK entity calling a Chinese provider's API from UK/EU-hosted
infrastructure, or from a user's own desktop machine, does not itself need an ICP filing. This only becomes
relevant if we ever hosted a website or service on servers physically located in mainland China (Alibaba
Cloud, "Website filing requirements for overseas enterprises in China", accessed 2026-09-11,
https://www.alibabacloud.com/help/en/icp-filing/basic-icp-service/product-overview/icp-filing-application-for-enterprises-outside-the-chinese-mainland).
Not applicable to Cubric Vision's current architecture.

### The friction is real, and it is exactly why aggregators exist

Kling ships through two separate surfaces: a consumer product and a developer API that runs through Kuaishou's
own cloud platform. A comparison-blog source (eggstriker.com, "The AI Video Model Pricing Comparison (August
2026)", accessed via search 2026-09-11, treat as **directional/secondary, not verified against Kuaishou's own
onboarding docs**) describes the direct developer-API path as having "Chinese-cloud billing, partial
Chinese-only console, RMB payment, machine-translated docs, mainland-China CDN." Whether or not every detail of
that is current, it matches the general shape of the problem: contracting directly with a mainland Chinese
cloud platform as a foreign entity typically means a China-side billing relationship, and potentially RMB
settlement, even when the contracting entity on paper is offshore (Kling's own Terms of API Paid Service name
LOHAS GAMES PTE LTD, a Singapore entity, as the counterparty, which is itself evidence they have structured for
international customers).

This is precisely the gap that **Western aggregators (fal.ai, Replicate, PiAPI) and BytePlus fill**: each runs
its own commercial relationship with the underlying Chinese lab and re-exposes the model through a
Western-billing, English-language, non-mainland-hosted API. BytePlus specifically is ByteDance's international
arm: it publishes its terms in English, structures its Terms of API Paid Service around standard Western SaaS
contract language (Minimum Commitment Amount, liquidated damages, Customer Code of Conduct), and its docs
explicitly cover "International Availability for BytePlus Model Service" as a distinct topic
(`docs.byteplus.com/en/docs/ModelArk/availability`, found in search results, not independently fetched). That
existence is strong circumstantial evidence that BytePlus exists specifically to solve the "how does a
non-Chinese entity contract with ByteDance's models" problem, in the same way Alibaba Cloud International or
Volcengine's own international arm do for their respective parents. **UNVERIFIED** in the sense that I did not
find an explicit ByteDance statement saying "BytePlus exists to route around mainland contracting friction," but
the product structure speaks for itself.

Practical conclusion for Q1 and Q3 together: **the pragmatic path into Kling, Seedance and MiniMax for a solo UK
developer is very likely through an aggregator or BytePlus's own international product, not a direct contract
with the mainland entity.** This sidesteps the RMB billing and mainland-console friction, at the cost of an
extra margin layer and a dependency on the aggregator's own uptime and pricing.

### Payment rails, data transfer, and export/sanctions

- **Payment rails**: BytePlus, as the international arm, bills in standard international currencies (implied by
  its Western-style Terms of API Paid Service structure; not independently confirmed with a live pricing-page
  fetch). Direct Kuaishou/Kling developer platform billing is reported as RMB-based (see friction note above,
  **UNVERIFIED, secondary source**).
- **Data transfer**: see section 4, GDPR. This is the single biggest practical obstacle, not payments.
- **Sanctions/export control**: I found **no evidence of any US BIS Entity List or OFAC SDN designation against
  ByteDance, Kuaishou, or MiniMax** as of 2026-09-11. What I did find is a live, unresolved regulatory
  development worth tracking: per Reuters reporting (via explainx.ai summary, "China's AI Export Restrictions
  (July 2026)", accessed 2026-09-11), **China's own Ministry of Commerce held meetings in July 2026 with
  Alibaba, ByteDance and Z.ai** about a proposed tiered outbound-control regime for their AI models: basic
  open-source tools would need a filing, advanced open-source models a security review, and frontier models
  could be restricted to domestic-only release. As reported, this is a proposal under discussion, not enacted
  law, and the article explicitly notes "No comment from Ministry of Commerce, NDRC, Alibaba, ByteDance, or
  Z.ai." Kuaishou (Kling) and MiniMax are **not named** in that specific reporting. This is exactly the kind of
  fast-moving regulatory risk that could change API availability or terms with little notice; I would treat any
  Chinese-model dependency as needing a contingency plan (i.e., do not build the credit economics so tightly
  around one Chinese provider that losing API access on short notice breaks the product).
- Every Western provider's own contract (OpenAI section 16.11, quoted above) pushes sanctions-compliance
  responsibility onto the integrator as standard boilerplate; treat that as the norm regardless of which
  provider, and build a basic "check the user isn't in an embargoed jurisdiction" habit into onboarding
  regardless of which models are offered.

---

## 4. UK/EU regulatory obligations landing on us as the integrator

### EU AI Act, Article 50 (transparency/deepfake labelling)

- Applies from **2 August 2026** (already in force as of today, 2026-09-11). Source: artificialintelligenceact.eu,
  "The EU AI Act's Transparency Rules: A Practical Guide to Article 50," and hard2bit.com, "AI Act Article 50:
  AI transparency from 2 August 2026," both accessed 2026-09-11.
- Requires disclosure that "an image, audio, video or text is a deepfake or otherwise AI-generated." The
  European Commission published final guidelines on Article 50 on 20 July 2026 and confirmed a Code of Practice
  on Transparency of AI-Generated Content as adequate compliance evidence.
- Penalty tier: non-compliance sits in Article 99(4)(g), **up to EUR 15 million or 3% of total worldwide annual
  turnover, whichever is higher**.
- Practical read for Cubric Vision: since the app generates images/video that could be shared or published by
  end users, this points toward embedding machine-readable provenance (e.g. C2PA metadata, which several
  providers already attach, per the Sora system card's mention of "embedded metadata for provenance") into every
  generation, regardless of which underlying model produced it, and toward a visible in-app disclosure. **NEEDS
  A SOLICITOR** to confirm whether Cubric Vision itself is a "provider" or "deployer" under the Act's
  definitions (this affects which specific duties attach to us versus to the model vendor), since that
  classification question was outside what I could resolve from public guidance alone.

### UK Online Safety Act

- The OSA's duties (illegal content removal, CSAM as "priority illegal content") attach to services that meet
  the statutory definition of a **"user-to-user service"**: one where content generated or uploaded by a user
  "may be encountered by another user, or other users, of the service" (Bird & Bird, "Does the UK Online Safety
  Act regulate AI?," and Pinsent Masons, "Online Safety Act duties cover gen-AI and chatbots, Ofcom confirms,"
  both accessed 2026-09-11).
- Ofcom's own published position: a generative AI tool only becomes a regulated user-to-user service **if it
  lets users share the generated content with other users of the same service**. A tool that generates content
  for the user's own private use, with no in-app sharing/community surface, sits outside that specific
  definition on the current guidance.
- Cubric Vision today is a local desktop tool with no user-to-user sharing surface, so OSA's platform duties
  most likely do not attach in their current form. This changes the moment any social/sharing/gallery-to-others
  feature is added. Regardless of OSA applicability, AI-generated CSAM is **priority illegal content under UK
  law independent of platform status**, and separately the UK government has moved to criminalise "the
  possession, creation, and distribution of AI tools designed to generate CSAM" specifically (CyberPeace, "UK to
  Criminalise AI-Generated Sexual Abuse Images Soon," accessed 2026-09-11). That is a criminal-law exposure to
  us as the tool operator, independent of OSA's civil/regulatory duties, and is the strongest single argument
  for baseline input/output moderation regardless of what any specific provider's contract requires (see section
  5). **NEEDS A SOLICITOR** to confirm current scope now that this legislation may have moved since these
  articles were written; the underlying bill's exact status as of 2026-09-11 was not confirmed with a primary
  Parliament source in this pass.

### GDPR: prompts and images crossing to a third country

This is the most concrete, immediate compliance item of the whole brief.

- No adequacy decision exists for China. Two recent enforcement data points establish the risk is not
  theoretical: the **TikTok EUR 530 million fine** (transfer-specific) and the **Yango EUR 100 million** decision
  (coordinated multi-DPA action), both cited as finding that "the destination's domestic surveillance and
  government-access laws create a structural barrier that technical security measures alone cannot overcome"
  (secureprivacy.ai, "International Data Transfer Risk Index 2026," accessed 2026-09-11).
- Standard Contractual Clauses alone are **not sufficient** for China-bound transfers on current DPA practice;
  supplementary technical/contractual/organisational measures are expected, and even then a "problematic
  finding is likely" per the same source.
- Role: "The organization deploying an AI tool is almost always the data controller... The AI vendor is
  typically a processor" (gdprregister.eu, "AI Providers Under GDPR: Controller or Processor?," accessed
  2026-09-11). For Cubric Vision this means **we are the controller** for our users' prompts and uploaded
  images, and Kling/BytePlus/MiniMax are processors (or, if their own terms assert independent control over the
  data, potentially independent controllers, which is worse for us since it removes our ability to contractually
  bind their handling). Practically:
  - We need a Data Processing Agreement (or SCCs) in place with each provider we route personal data through.
  - Our own privacy policy must disclose the third-country transfer and, for a China-domiciled processor,
    realistically disclose that the transfer carries elevated regulatory risk under current EU/UK guidance.
  - A face photo used for an "img2img"/likeness-style generation is very plausibly biometric/special-category
    data under GDPR Article 9, which raises the bar further (DPIA likely required, Article 35) and was flagged
    in the assignment context ("masked edit with a reference image" already shipped per recent commits) as
    something to be concrete about.
  - Routing sensitive transfers through BytePlus's international (non-mainland) infrastructure, if genuinely
    hosted outside mainland China, would reduce but not eliminate this risk versus a direct mainland Kuaishou
    endpoint; I could not independently confirm BytePlus's actual data-hosting location(s) live, and this is
    exactly the kind of fact that should be confirmed in writing from BytePlus before relying on it.
- What a solo UK developer must actually do, concretely, before launch: (1) a public privacy policy naming each
  third-country processor and the transfer mechanism relied on, (2) an executed DPA/SCC with each provider
  (most self-serve API platforms publish a clickable DPA; check each one exists before assuming it does), (3) a
  Record of Processing Activities, even a simple one, (4) a DPIA for any feature that processes uploaded faces
  or likenesses, (5) a UK GDPR registration with the ICO (the standard data-controller registration fee, not
  specific to this project) if not already done. **NEEDS A SOLICITOR** for the DPIA and for a considered view
  on whether China-bound transfers are advisable at all given the TikTok/Yango enforcement pattern, versus
  steering the product toward Western-hosted models for any feature that touches uploaded personal photos.

---

## 5. Content liability: who is on the hook

Every provider's contract, read together, tells a consistent story: **the integrator (us) carries the
contractual risk for what end users generate**, and the provider disclaims liability for third parties who
access the service "through" us.

- **OpenAI** (13.2): Customer indemnifies OpenAI for claims arising from Customer Applications and Customer
  Content. Customer is "solely responsible for all use of the Outputs" (4.3).
- **Kling** (8.4): "If you violate the above requirements, you shall be solely responsible for resolving any
  related disputes and bear full and sole liability for all losses and risks." (11.6): "claims for damages made
  against you by a third party who indirectly uses our services through you" are excluded from any compensation
  Kling might otherwise owe.
- **BytePlus**: liquidated damages plus "full compensation for the shortfall" for unauthorized resale, and
  customers must warrant they hold rights to any assets/likenesses used.
- **Runway** (2.5): end users of Your Application must be bound by "an enforceable end user agreement... no less
  protective of Company than those set forth in this Agreement," making us contractually responsible for
  flowing Runway's restrictions down to our own users.

So contractually: if a Cubric Vision user generates illegal content through our proxied Kling/OpenAI/Runway key,
the provider's position is that **we** indemnify **them**, not the reverse. Separately, and more seriously, UK
criminal law (CSAM specifically) attaches to whoever creates/possesses the material, which in a proxy model
could arguably include the operator whose infrastructure processed and stored the generation, not just the
end user who typed the prompt. That is exactly the gap that makes moderation a practical necessity rather than
a nice-to-have.

**What moderation is typically expected of an integrator, per the providers' own docs:**
- OpenAI's Sora API: "moderation isn't optional. Every API call... runs automatic compliance checks," including
  input and output checks; this is provider-side, but the integrator is still contractually responsible for
  Input legality regardless of the provider's own filters (glbgpt.com summary of Sora system card behaviour,
  accessed 2026-09-11, cross-checked against openai.com/index/launching-sora-responsibly/ framing).
- Google: "You are responsible for determining the necessary and appropriate safety settings and factuality
  tools for your use case" (Gemini API terms, fetched directly).
- BytePlus publishes a dedicated "Content Pre-filter" doc as part of ModelArk (menu item confirmed live on the
  Code of Conduct page, `menu_Content_Pre-filter`), implying pre-filtering is an expected, supported part of
  integration, not optional.
- Kling (8.2, 8.3): explicitly prohibits use "against or suspected of endangering minors" and requires the
  integrator to ensure Content "compliant with all applicable laws" before it is uploaded, input, or published.

Recommendation, not sourced from any single provider but a synthesis of the above: implement our own
input-prompt and output-image moderation layer (a classifier pass, not just relying on each provider's own
filter, since filters and their strictness vary by provider and by tier), keep enough logs to respond to a
takedown or law-enforcement request, publish a clear Acceptable Use Policy naming what is prohibited, and build
a simple in-app reporting path. This is standard practice across the aggregators cited in section 1
(Higgsfield/Freepik/Leonardo/etc. all publish their own content policies on top of whatever each underlying
model already restricts).

---

## 6. Consumer-side commercial terms: can our users sell what they make

| Provider | Commercial use of output | Territory/tier caveats found |
|---|---|---|
| OpenAI | Customer owns Output, commercial use permitted; Output "may not be unique," i.e. no exclusivity guarantee. | None found beyond Supported Countries and Territories list. |
| Google (Gemini/Veo) | Output owned by the creator; commercial use permitted for most business applications subject to the Acceptable Use Policy (no real people without consent, no explicit content, no deceptive content). | **Free tier data is used to improve Google's products; paid tier is not.** A credit-selling product must always run on the paid/billed tier for every generation, or user prompts and images become training data by default. |
| Kling (API, paid) | "You use of the AI-generated content for commercial purposes is not restricted" (6.4). Risk of third-party IP infringement in the output is expressly the user/integrator's problem, not Kling's (6.4, 6.6). | A secondary source claims Kling's free consumer tier restricts output to personal, non-commercial use and requires a watermark, versus paid tiers which allow commercial use (WaveSpeed AI blog, accessed via search 2026-09-11). **UNVERIFIED against Kling's main consumer Terms of Service** (only the API Paid Service terms were read in full); since Cubric Vision would use the paid API tier this distinction likely does not bind us, but confirm before assuming. |
| BytePlus (Seedance) | Output is customer data; BytePlus does not claim IP ownership; no attribution requirement found. | A search snippet, **not independently confirmed by direct fetch**, indicates certain "Restricted Models" cannot be used, resold, or operated "within the entire territory of the EU or on the EU market." High-priority item to confirm directly before offering any Seedance-family model to EU-resident end users. |
| MiniMax (Hailuo, hosted API) | Not independently confirmed from primary terms; the H3 self-hosted Community License's territory exclusions (EU, UK, South Korea, US) and $20M revenue gate reportedly do not apply to hosted API use, per third-party legal-blog analysis. | **UNVERIFIED**, confirm directly with MiniMax given the UK is a named excluded territory in the adjacent self-hosted license. |
| Runway | Commercial use permitted through the API. | Mandatory "Powered by Runway" attribution and link on any end-user-facing surface, a concrete UI requirement rather than fine print. |

General shape: every provider surveyed permits end-user commercial use of API-generated output at the paid
tier, with the recurring caveats being (1) free-tier usage often carries different, more restrictive terms and
sometimes trains the model on your users' content, and (2) the user/integrator, not the provider, bears the
risk of a generated output accidentally infringing a third party's existing IP (a face, a franchise character,
a copyrighted style). None of the providers surveyed indemnify the integrator against that specific risk except
Google's IP-indemnification commitment for unmodified Vertex AI output, which is a meaningfully different
posture from the rest.

---

## 7. Payments and tax

### VAT

- **Selling to EU consumers, from the UK**: post-Brexit, the UK is a third country for EU VAT purposes. There
  is **no registration threshold** for a non-EU-established business selling digital services to EU consumers;
  VAT is due from the very first sale, at the consumer's local rate. The practical mechanism is the **EU
  Non-Union OSS (One Stop Shop)** scheme: register in one EU member state, charge the correct local rate per
  sale, file one consolidated quarterly return covering all 27 states (multiple 2026 guides converge on this,
  e.g. dodopayments.com "EU VAT for SaaS in 2026" and fluentcart.com "Digital Goods VAT OSS Guidance," both
  accessed 2026-09-11).
- **Selling to UK consumers**: this is domestic UK VAT, a completely separate system from the EU OSS
  registration (no crossover). Standard UK VAT rules and registration-threshold rules apply to us as a
  UK-established seller. **UNVERIFIED**: I did not confirm the current 2026 UK VAT registration threshold
  figure from a primary gov.uk source in this pass; check gov.uk directly before relying on any figure quoted in
  a secondary blog.
- **US sales tax**: no federal harmonisation. Each state runs its own economic-nexus regime for digital goods,
  and thresholds/definitions vary considerably by state. This is generally regarded as the most operationally
  annoying tax surface for a small seller to handle manually.

### Merchant of Record vs payment processor

- **Stripe** (payment service provider): lower headline fees (2.9% + $0.30 typical), but **we remain the legal
  seller**, responsible for our own VAT/sales-tax registration, collection and filing in every jurisdiction we
  sell into.
- **Paddle** (and comparable merchant-of-record products, e.g. Lemon Squeezy, Creem): higher fees (Paddle
  around 5% + $0.50; some newer entrants lower), but **they become the legal seller of record**, and take on
  global VAT/GST/sales-tax collection, remittance and compliance on our behalf. We never register for tax
  abroad and never file a foreign return (multiple 2026 comparison sources, e.g. fungies.io "Paddle vs Stripe
  vs Merchant of Record in 2026," accessed 2026-09-11).
- For a solo UK developer selling a consumer credit product worldwide, the general market consensus across the
  sources checked is that a Merchant of Record is the pragmatic choice specifically **because** the alternative
  is manually tracking and filing VAT/OSS in the EU and economic-nexus sales tax across dozens of US states,
  which is a materially larger ongoing burden for one person than the extra 2 percentage points of fees. This
  is a commercial judgment, not a legal requirement; a solicitor/accountant should confirm it against actual
  projected volumes, since at higher volumes Stripe-plus-a-tax-automation-tool (e.g. Stripe Tax) can end up
  cheaper in aggregate.

### Breakage / unredeemed credits

- Under the equivalent-of-ASC-606/IFRS-15 revenue recognition framework, unredeemed prepaid credits ("breakage")
  can only be recognised as revenue once redemption becomes remote, or via a reliably estimated proportional
  method updated each reporting period; until then, unredeemed credits sit on the balance sheet as a
  **liability**, not revenue (RevenueHub, "Unexercised Rights (Breakage) in ASC 606," and PwC Viewpoint 7.4,
  both accessed 2026-09-11).
- Many US states have unclaimed-property (escheatment) rules that can require turning over long-dormant
  balances to the state after a multi-year dormancy period; this body of law historically targets gift cards
  specifically. **UNVERIFIED** whether a generic in-app AI-generation credit would be captured under any given
  state's definition of a "gift card" or "stored value" for escheatment purposes; flag as a question for an
  accountant if credit balances are allowed to sit unused indefinitely, and consider an explicit,
  clearly-disclosed expiry policy in the Terms of Service (subject to whatever fairness limits UK/EU consumer
  law places on unreasonably short expiry of paid-for credit).

---

## 8. A realistic minimum legal setup

- **Ltd vs sole trader**: nothing found in any provider's terms, or in UK company law generally, makes
  incorporating a **hard legal precondition** for self-serve API access or for selling consumer digital credits
  online. A UK sole trader can register for VAT (including the EU Non-Union OSS) and trade. That said, section 5
  above establishes real, contractually-assigned liability exposure (indemnification obligations running from
  integrator to provider, plus independent UK criminal-law exposure around illegal generated content) sitting
  on whoever operates this product. A sole trader carries that exposure with **unlimited personal liability**; a
  Ltd company caps it at the company's assets (subject to the usual piercing-the-veil exceptions, e.g. for
  actual knowledge of illegal conduct). Given the specific liability pattern found in section 5, **this is
  exactly the kind of decision that needs a solicitor and/or accountant**, not a generic "should I incorporate"
  answer; the relevant new fact this research surfaces is that the provider contracts themselves push risk onto
  the integrator more explicitly than a typical SaaS reseller relationship would.
- Where a **Ltd is more clearly warranted**, not strictly required but practically expected: negotiated
  enterprise/committed-spend agreements (BytePlus's "Minimum Commitment Amount" language implies a negotiated
  contract at scale), and possibly a formal partner-programme application (OpenAI Partner Network, Google
  Partner Advantage) where counterparties commonly expect to contract with a registered business entity, even
  without a stated rule to that effect in the public programme pages found.
- **Terms of Service / Acceptable Use Policy**: needs to (1) flow down each provider's own restrictions to our
  end users (Runway explicitly requires this contractually; good practice regardless), (2) state clearly what
  generations are prohibited (illegal content, CSAM, real-person likeness without consent, IP-infringing
  prompts), (3) disclose that outputs may not be unique/exclusive and that the user is responsible for
  evaluating rights in their own uploaded inputs, matching what OpenAI/Kling/BytePlus already require of us as
  integrator.
- **Privacy Policy**: must name every third-country processor (see section 4), describe the AI-generation data
  flow specifically (prompt text, and any uploaded reference images/faces), and cover whichever provider(s) are
  actually live at any given time, since this list will change as models are added or removed.
- **Refund policy**: interacts directly with the breakage/liability discussion above; most self-serve provider
  terms describe their own fees to us as non-refundable (Kling 2.7, OpenAI 6.1), which argues for mirroring a
  similarly clear non-refundable-once-consumed credit policy to our own users, subject to UK/EU consumer
  protection law on unfair terms and statutory cooling-off rights for digital content, which a Merchant of
  Record (section 7) will typically help implement correctly out of the box since consumer-facing checkout
  compliance is part of what they sell.
- **Precedent**: Higgsfield, Freepik, Leonardo.ai, Krea, OpenArt and fal.ai are all live, operating exactly this
  model today (credit-based consumer access to Kling, Veo, Seedance, Runway and others, aggregated behind one
  paywall), which is the strongest available evidence that this business model, built as "wrap the API in your
  own product," is viable in practice even where the underlying providers' literal contract language is
  ambiguous or restrictive on paper (most clearly Kling, section 1). None of these were confirmed to be
  operating under a formal reseller agreement rather than the same self-serve terms discussed in section 1;
  that itself is informative about how the market has actually resolved the ambiguity in practice.

---

## Open questions

1. Kling's resale language (8.2.2, 10.3) versus its "Client Application" concept (1.4, 6.4) is genuinely
   ambiguous on the page. Get it in writing from kling@kuaishou.com before building a Kling-backed credit tier.
2. BytePlus's alleged EU-market restriction on "Restricted Models" was found only in a search snippet, not
   independently fetched from the primary Specific Terms document. Confirm directly before offering any
   Seedance/Seedream model to EU-resident users.
3. MiniMax's actual Platform/Enterprise API Terms of Service (platform.minimax.io/protocol/terms-of-service)
   could not be rendered live in this pass. Confirm the resale clause and any UK/EU territory language directly,
   given the adjacent H3 self-hosted license explicitly excludes the UK.
4. Whether Cubric Vision would be classified as a "provider" or "deployer" under the EU AI Act, which changes
   which Article 50 duties attach directly to us versus to the underlying model vendor. NEEDS A SOLICITOR.
5. Current exact status of the UK legislation criminalising AI-CSAM-generation tools; the sources found describe
   it as in motion but I did not confirm current enactment status against a primary Parliament/legislation.gov.uk
   source.
6. Current UK VAT registration threshold figure for 2026, confirm against gov.uk directly rather than any
   secondary blog cited above.
7. Whether BytePlus's international infrastructure is genuinely hosted outside mainland China (materially
   affects the GDPR risk analysis in section 4); not independently confirmed.
8. Whether OpenAI's, Google's, or Runway's formal negotiated (non-click-through) partner/reseller agreements
   impose an entity-type requirement; I only had access to the public self-serve terms, not any actual signed
   partner paper.
9. Whether China's proposed outbound AI-model export-control regime (reported July 2026, Alibaba/ByteDance/Z.ai
   only, Kuaishou/MiniMax not named) has progressed since that reporting, and whether it would eventually cover
   Kling or MiniMax.

## Sources

- OpenAI Services Agreement (ONLINE v.010126), fetched directly, https://cdn.openai.com/osa/openai-services-agreement.pdf, accessed 2026-09-11
- OpenAI Partner Network, https://openai.com/business/partners/ and https://openai.com/index/introducing-openai-partner-network/, accessed 2026-09-11
- Runway Terms of Use, fetched directly, https://runway.com/terms-of-use, accessed 2026-09-11
- Runway Builders Program / Creative Partners Program, https://runway.com/product/builders, https://runwayml.com/creative-partners-program, accessed 2026-09-11
- Google Gemini API Additional Terms of Service, fetched directly, https://ai.google.dev/gemini-api/terms, accessed 2026-09-11
- Google Cloud, "Protecting customers with generative AI indemnification," https://cloud.google.com/blog/products/ai-machine-learning/protecting-customers-with-generative-ai-indemnification, accessed 2026-09-11
- Google Cloud Partner Advantage / Partner Home, https://partners.cloud.google.com/, https://cloud.google.com/partners, accessed 2026-09-11
- KLING AI Terms of API Paid Service (LOHAS GAMES PTE LTD, released 2024-09-29), fetched directly as PDF, https://d7umqicpi7263.cloudfront.net/eula/rOOlPm0Q-PwhpSN7vSdy7rsUH_1CdcGH5vLMtbLpEgE, accessed 2026-09-11
- BytePlus ModelArk, "BytePlus Platform Customer Code of Conduct and Default...", fetched directly, https://docs.byteplus.com/en/docs/ModelArk/2353368, accessed 2026-09-11
- BytePlus ModelArk, "Specific Terms for the BytePlus Video Generation Model Services" (search-derived only, not fetched), https://docs.byteplus.com/en/docs/ModelArk/Specific_Terms_for_the_BytePlus_Video_Generation_Model_Services, accessed 2026-09-11
- BytePlus ModelArk, "Integrate with third-party tools," https://docs.byteplus.com/en/docs/ModelArk/2160841, accessed 2026-09-11
- MiniMax Terms of Service (master page), fetched directly, https://www.minimax.io/terms-of-service-v2.html, accessed 2026-09-11
- MiniMax Platform (API) Terms of Service (not renderable live), https://platform.minimax.io/protocol/terms-of-service, accessed 2026-09-11
- Atlas Cloud, "MiniMax H3 Commercial Use License: 4 Countries, $20M, and Who Pays," fetched directly, https://www.atlascloud.ai/blog/tips/minimax-h3-commercial-use-license, accessed 2026-09-11
- WaveSpeed AI blog, "Best Free AI Video Generator Online in 2026," https://wavespeed.ai/blog/posts/best-free-ai-video-generator-online-wavespeed-2026/, accessed 2026-09-11
- OpenAI Developer Community, "Urgent Clarifications Needed on BYOK (Bring Your Own Key) and OAuth for OpenAI API," https://community.openai.com/t/urgent-clarifications-needed-on-byok-bring-your-own-key-and-oauth-for-openai-api/330449, accessed 2026-09-11
- Alibaba Cloud, "Website filing requirements for overseas enterprises in China," https://www.alibabacloud.com/help/en/icp-filing/basic-icp-service/product-overview/icp-filing-application-for-enterprises-outside-the-chinese-mainland, accessed 2026-09-11
- explainx.ai, "China AI Export Restrictions: Reuters Report Explained," fetched directly, https://www.explainx.ai/blog/china-overseas-ai-model-restrictions-reuters-july-2026, accessed 2026-09-11
- artificialintelligenceact.eu, "The EU AI Act's Transparency Rules: A Practical Guide to Article 50," https://artificialintelligenceact.eu/transparency-rules-article-50/, accessed 2026-09-11
- hard2bit.com, "AI Act Article 50: AI transparency from 2 August 2026," https://hard2bit.com/en/blog/ai-act-article-50-ai-transparency-chatbots-deepfakes/, accessed 2026-09-11
- Bird & Bird, "Does the UK Online Safety Act regulate AI?," https://www.twobirds.com/en/insights/2024/uk/does-the-uk-online-safety-act-regulate-ai, accessed 2026-09-11
- Pinsent Masons, "Online Safety Act duties cover gen-AI and chatbots, Ofcom confirms," https://www.pinsentmasons.com/out-law/news/online-safety-act-duties-cover-gen-ai-and-chatbots, accessed 2026-09-11
- CyberPeace, "UK to Criminalise AI-Generated Sexual Abuse Images Soon," https://cyberpeace.org/resources/blogs/uk-to-criminalise-ai-generated-sexual-abuse-images-soon, accessed 2026-09-11
- secureprivacy.ai, "International Data Transfer Risk Index 2026," https://secureprivacy.ai/blog/international-data-transfer-risk-index-2026, accessed 2026-09-11
- gdprregister.eu, "AI Providers Under GDPR: Controller or Processor?," https://www.gdprregister.eu/articles/ai-provider-controller-processor-gdpr/, accessed 2026-09-11
- fungies.io, "Paddle vs Stripe vs Merchant of Record in 2026," https://fungies.io/paddle-vs-stripe-vs-merchant-of-record-2026/, accessed 2026-09-11
- dodopayments.com, "EU VAT for SaaS in 2026: Thresholds, OSS, and Common Mistakes," https://dodopayments.com/blogs/eu-vat-saas-guide-2026, accessed 2026-09-11
- RevenueHub, "Unexercised Rights (Breakage) in ASC 606," https://www.revenuehub.org/article/unexercised-rights, accessed 2026-09-11
- PwC Viewpoint, "7.4 Unexercised rights (breakage)," https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/revenue_from_contrac/revenue_from_contrac_US/chapter_7_options_to_US/74unexercised_rights_US.html, accessed 2026-09-11
