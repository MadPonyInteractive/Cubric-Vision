# Branch B research 3/4 — voice cloning legal & regulatory landscape

Dispatched 2026-08-23. **Not legal advice** — a risk map to frame a conversation with a
qualified UK/US IP lawyer before the design is finalised.

Centrepiece question: **does shipping a curated voice library change our exposure versus
bring-your-own-clip?** Answer: **yes, materially, and against us.**

---

## The finding that decides the design

| | Bring-your-own-clip | Curated library of REAL voices |
|---|---|---|
| Primary liable party | The **user** who supplies the clip | **Us** — we sourced, held and distributed the profile |
| ELVIS Act (TN) | Defensible: tool is general-purpose | Applies directly if any voice is a "readily identifiable" person |
| NO FAKES Act (if enacted) | Liability targets whoever "creates" the replica | We "created/distributed" it. **Safe harbour is for hosting platforms, not curators** |
| GDPR / UK GDPR | If cloning is local-only, the **user** is controller | **We are the controller** of biometric data; need Art. 9(2)(a) explicit, scope-specific consent per voice |
| CA AB 2602 | n/a | Each performer's replica contract must meet informed-consent standard |

**The Lovo parallel is the whole point.** In *Lehrman v. Lovo* (S.D.N.Y., 10 Jul 2025)
copyright claims were dismissed but NY right-of-publicity and contract-fraud claims
**survived**. What made Lovo liable was not enabling cloning — it was *collecting,
holding and commercially offering voice profiles*. A curated library is exactly that
posture. One voice actor with under-scoped consent and we are the defendant.

> A general recording contract does NOT cover "commercial TTS cloning inside a
> third-party desktop app". Consent must be scope-specific, documented, and litigation-ready.

### Which is why the SYNTHETIC library is the convergent answer

Both this agent and research file 4 land in the same place from opposite directions.
A library containing **no real person** has:

- no right-of-publicity subject (ELVIS Act needs an "identifiable individual")
- no biometric data, so no GDPR Art. 9 consent chain and no DPIA burden
- no NO FAKES exposure, no consent documentation to defend in discovery
- no takedown surface

Independent corroboration from this agent: **Kokoro v1.0** (Apache-2.0, 54 voices) is
identified as commercially safe precisely because "voices appear to be synthesized/
designed rather than cloned from real persons — **this is the critical safety property**".
And ElevenLabs' own library is voice-design voices (no real person) **plus** owner-verified
clones — never third-party curation.

**If we ship a library of real voices at all, the only defensible model is
owner-verified** (the voice subject themselves confirms), not curated acquisition.
That likely still holds for the CC0 Unmute donations in research file 4 — donors
explicitly gave voices for TTS — but the documentation burden is ours and is discoverable.

---

## Vision-specific implication neither agent could see: **the RunPod Pod**

The agent's advice is "architect cloning as local-only; if clips touch developer servers,
a DPIA is mandatory and explicit consent of the voice subject is required."

**Vision has a remote engine.** A user's reference clip sent to a RunPod Pod for remote
generation is biometric data leaving the machine and touching infrastructure reached
through our app, with our runtime on it. Whether that makes us controller, processor or
neither is genuinely unclear and is a question for a lawyer, not for us.

**Design consequence to consider now:** voice cloning may need to be a **local-engine-only**
capability, or the remote path needs an explicit consent gate and a DPIA. This does not
arise for image/video work and is new surface for the app. **UNRESOLVED — flag before
any Flow ships.**

---

## EU AI Act Article 50 — in force since 2 August 2026 (three weeks ago)

This is a live compliance obligation, not a future one.

- **We are the "provider"** — the entity placing the AI system on the market. Free vs paid
  download does not change it; desktop distribution does not change it.
- **Provider duty:** synthetic audio outputs must be marked in a **machine-readable**
  format detectable as AI-generated, "as far as technically feasible".
- **Our users become "deployers"** when they publish the output, and owe an *audience-facing*
  disclosure — machine-readable marking alone does not satisfy their half.
- **Penalty:** EUR 15M or 3% of worldwide turnover.

**Perth watermarking covers the provider duty in shape.** Whether it meets the
tamper-resistance/standardisation bar is **UNVERIFIED** — the EU has published no list of
approved schemes and the Code of Practice is expected late 2026. Fabio's watermarking
instinct turns out to be a legal requirement, not just a principle.

Draft Commission implementation guidelines published 8 May 2026.

## Other regimes, briefly

- **US:** ELVIS Act live since 1 Jul 2024 — civil **and criminal** (Class A misdemeanor)
  for distributing a tool whose "**primary purpose or function**" is producing a
  particular identifiable person's voice. This is a **marketing** trap as much as a
  technical one: never describe the feature as celebrity/individual cloning.
  CA AB 2602 (live 1 Jan 2025), AB 1836 (live 1 Jan 2026, min $10k statutory).
  NY §§50-51 amended Dec 2025 (S.8391) to drop the deception requirement.
  NO FAKES Act passed Senate Judiciary unanimously 18 Jun 2026, awaiting floor vote.
  20+ states have election-deepfake audio disclosure laws.
  FCC robocall ruling (Feb 2024) covers phone calls, not creative software.
- **UK (our jurisdiction):** materially weaker. **No right of publicity.** Passing off
  needs goodwill + misrepresentation + damage — viable for a famous voice actor, not an
  ordinary person. CDPA performers' rights attach to *recordings*, and cloning outputs
  are not copies of any recording, so coverage is contested. **UK GDPR is the live hook**
  — ICO forced HMRC to delete ~5-7M voice IDs for lack of explicit consent and no DPIA.
  Data (Use and Access) Act 2025 s.138 (in force 6 Feb 2026) covers intimate images only.
  UK is **not** implementing the EU AI Act; no UK synthetic-audio labelling duty exists.
- **Japan:** METI's April 2026 civil liability handbook goes furthest — a vendor marketing
  a product built around reproducing a named individual's voice may itself violate
  publicity rights regardless of user action. No US/EU equivalent yet, but it signals
  direction.

## Watermarking: obligation, not shield

Satisfies part of Art. 50, demonstrates responsible design, aids our own ToS enforcement.
Does **not** cure a right-of-publicity violation — it proves provenance, not authorisation.
It also slightly *helps a plaintiff* establish the production chain. Treat as hygiene.

## What comparable products do

| Product | Consent model |
|---|---|
| ElevenLabs | Voice-design (synthetic) + owner-verified PVC via voice captcha. Cannot share someone else's voice. Pre-made voices from paid actor partnerships, terms not public |
| Resemble AI | Strongest — Resemblyzer speaker-ID confirms uploader IS the subject before training. Perth watermark on all output |
| Descript Overdub | User reads a consent statement aloud; it is simultaneously the consent record and the training input. Own-voice-only by policy |
| PlayHT / Fish Audio | Self-certification only. Fish Audio's 2M+ unmoderated uploads is the highest-risk model in the space |

Open-source shipping licences: **Kokoro v1.0** Apache-2.0 (54 synthetic voices — safe),
**Piper / Bark / StyleTTS 2** MIT (StyleTTS 2 voice provenance UNVERIFIED),
**Coqui XTTS v2** CPML non-commercial and Coqui is dead, so no licence obtainable — do
not ship.

## Practical requirements if we ship ANY cloning feature

1. ToS prohibiting upload of third-party voices without consent.
2. Never market or describe it as cloning specific/celebrity individuals (ELVIS Act).
3. A complaint/takedown channel.
4. Watermark every output (now required for EU users).
5. Keep cloning local-only where possible — **and resolve the Pod question above**.
6. Privacy documentation stating where reference audio goes.

## Sources

ELVIS Act: https://www.hklaw.com/en/insights/publications/2024/04/first-of-its-kind-ai-law-addresses-deep-fakes-and-voice-clones ·
CA AB 1836/2602: https://www.manatt.com/insights/newsletters/client-alert/california-enacts-a-host-of-new-ai-and-digital-rep ·
NO FAKES S.4591: https://www.congress.gov/bill/119th-congress/senate-bill/4591 ·
Lehrman v. Lovo: https://www.skadden.com/insights/publications/2025/07/new-york-court-tackles-the-legality-of-ai-voice-cloning ·
EU AI Act Art. 50: https://artificialintelligenceact.eu/transparency-rules-article-50/ ·
provider vs deployer: https://www.regulatoryai.eu/provider-or-deployer/ ·
UK gap: https://www.resultsense.com/news/2026-06-26-ai-voice-cloning-uk-law-gap/ ·
UK GDPR voice: https://fiund.com/rights/gdpr-and-voice-data ·
Japan METI: https://www.techtimes.com/articles/323616/20260808/japan-rules-ai-voice-cloning-requires-consent-developers-face-civil-liability.htm ·
Kokoro: https://localaimaster.com/blog/kokoro-tts-local-setup ·
XTTS CPML: https://localaimaster.com/blog/xtts-coqui-commercial-license
