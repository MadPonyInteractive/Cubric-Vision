// ── Model Licence Descriptors (MPI-451) ───────────────────────────────────────
/**
 * js/data/modelConstants/licences.js — per-model licence gates.
 *
 * Most model weights we ship are permissive (Apache-2.0, MIT) and need no consent
 * step. A few are not: their licence obliges US, as the distributor, to bind the
 * END USER to the licensor's restrictions before they receive the weights, and to
 * notify them those restrictions apply. MiniMax H3 is the forcing case; Flux is the
 * next known consumer.
 *
 * A model listed here is GATED: `downloadService.start()` shows MpiLicenceGate and
 * refuses to install until the user accepts. A model NOT listed here is untouched —
 * the guard is a map lookup that misses, and the install path stays synchronous.
 *
 * WHY THIS IS NOT A FIELD ON THE ModelDef. Two reasons, both practical: `models.js`
 * is already the largest data file in the app and 20 clauses of legal text per model
 * would swamp it, and a licence is versioned independently of the model wiring — a
 * licensor revising their AUP bumps `version` here and re-prompts every user without
 * touching a ModelDef. Adding a second gated model is still DATA ONLY: one entry in
 * MODEL_LICENCES keyed by the model id, no code.
 *
 * Several models can share ONE descriptor object — H3 ships as two ModelDefs (fl2va and
 * ref2va, different transformer weights) under a single agreement. Acceptance is filed
 * under the LICENCE id, so accepting once covers every model that agreement governs.
 *
 * @typedef {Object} LicenceDescriptor
 * @property {string} id          - Stable id. THE ACCEPTANCE KEY — models sharing a
 *                                  descriptor share one receipt. Never reuse an id
 *                                  across genuinely different agreements.
 * @property {number} version     - Bump to invalidate every prior acceptance and re-prompt.
 * @property {string} name        - Licence display name.
 * @property {string} modelName   - What the user believes they are installing.
 * @property {string} summary     - One line above the fold: why this dialog exists.
 * @property {string} licenceUrl  - The full agreement. Opened in the system browser. A
 *                                  ROOT-RELATIVE path points at a copy BUNDLED under
 *                                  `licences/<id>/`, which `openExternal` resolves against
 *                                  the app origin. Prefer that whenever the licence obliges
 *                                  us to PROVIDE a copy rather than merely name one: a link
 *                                  to the licensor's server is not a copy, and it dies when
 *                                  they move the file or the user is offline.
 * @property {string} [poweredBy] - Attribution the licence requires on the surface where the
 *                                  model is presented (H3 §III.3.a / §IV.2). Rendered in the
 *                                  Model Library detail drawer, next to the licence name —
 *                                  the model is what is "powered by" the licensor, not the
 *                                  app as a whole. Absent = no attribution obligation.
 * @property {{territories: string[], authorizationUrl: string, body: string}} [territory]
 *   Present only when the licence is territory-restricted. The gate then routes the
 *   user to the licensor's OWN authorization route. It must never disclaim the problem
 *   onto them ("it is your responsibility to check") — that transfers blame without
 *   transferring rights and reads as knowingly routing users into unlicensed use.
 * @property {Array<{heading: string, intro?: string, items: string[]}>} sections
 *   The restrictions themselves, VERBATIM from the licence. This is the text the user
 *   must scroll before they can accept, so keep it to what the licence actually
 *   obliges us to show — not the whole agreement, which is `licenceUrl`.
 * @property {string[]} acknowledgements - Checkbox labels. ALL are required.
 * @property {{label: string, url: string}} [report] - Misuse-reporting route, when the
 *   licence obliges us to keep one (H3 §V.5). Absent = no such obligation.
 * @property {{repoId: string, probePath: string}} [verify]
 *   Present only when the licensor gates the weights behind an access request of their
 *   own — a form on the model page, granted to a Hugging Face ACCOUNT. Ticking our
 *   checkboxes then proves nothing on its own: the licence relationship is user-to-
 *   licensor, established over there, and we are only a distributor passing on a copy.
 *   So the gate additionally asks for an HF access token and PROVES the grant before
 *   the download unlocks — see `POST /licences/verify` in `routes/licences.js`.
 *
 *   `probePath` MUST name a file the gate actually covers. Measured against the live
 *   API 2026-08-21 on `black-forest-labs/FLUX.2-klein-9B`, unauthenticated:
 *
 *     GET /api/models/<repoId>            → 200   public metadata, `gated: "auto"`
 *     resolve/main/LICENSE.md             → 200   18,158 bytes
 *     resolve/main/README.md              → 200
 *     resolve/main/model_index.json       → 401   X-Error-Code: GatedRepo
 *     resolve/main/<weights>.safetensors  → 401   X-Error-Code: GatedRepo
 *
 *   Hugging Face serves the licence and the card unauthenticated ON PURPOSE — you must
 *   be able to read terms before accepting them — so a probe aimed at the repo, its
 *   metadata or its LICENSE would return 200 for a user who accepted nothing, and the
 *   gate would be decorative. Everything else in a gated repo is behind the grant.
 *
 *   Prefer a small NON-LFS file (a config JSON) over a weight: same gate, but an
 *   authorised HEAD answers 200 directly instead of a 302 into the CDN.
 */

import { Storage } from '../../core/storage.js';

/** Where suspected misuse gets reported. Shared by every gated model. */
const CUBRIC_DISCORD = { label: 'Report misuse on our Discord', url: 'https://discord.gg/WX7tDFSVmY' };

// MiniMax H3 — MiniMax H3 Community License Agreement, dated 2 August 2026.
// Section V.2 is why this gate exists at all: we must bind each user to terms at least
// as protective as Section V and Exhibit A BEFORE giving them access, and tell them the
// restrictions apply. Section V.5 is why `report` exists.
//
// Hoisted to a const because H3 ships as TWO ModelDefs — fl2va and ref2va are separate
// cards with separate transformer weights, covered by the SAME agreement. Both keys
// below point at this one object, so a `version` bump re-prompts for both at once and
// there is only ever one text to keep correct.
/** @type {LicenceDescriptor} */
const MINIMAX_H3 = {
    id: 'minimax-h3-cla-2026-08-02',
    version: 1,
    name: 'MiniMax H3 Community License Agreement',
    modelName: 'MiniMax H3',
    summary: 'MiniMax H3 is not open-weight. Its licence requires us to show you these '
           + 'restrictions and record your acceptance before the model can be downloaded.',
    // BUNDLED, not linked (MPI-452). §III.1 obliges us to "provide a copy of this Agreement
    // to all such Third Parties who receive the MiniMax H3 Works OR USE YOUR PRODUCTS OR
    // SERVICES RELATED THERETO" — that second clause reaches every Vision user who runs H3,
    // not only someone we hand weights to, and pointing at huggingface.co is naming a copy,
    // not providing one. `licences/minimax-h3/LICENSE.txt` is byte-identical to what
    // MiniMaxAI/MiniMax-H3 serves (17,604 bytes, fetched 2026-08-06) and ships in the
    // portable, so it also survives being offline or the publisher moving the file.
    // `licences/minimax-h3/NOTICE.txt` sits beside it carrying the §III.4 string verbatim.
    licenceUrl: '/licences/minimax-h3/LICENSE.txt',
    poweredBy: 'Powered by MiniMax H3',
    territory: {
        territories: ['the European Union', 'the United Kingdom', 'the Republic of Korea', 'the United States of America'],
        authorizationUrl: 'https://vrfi1sk8a0.feishu.cn/share/base/form/shrcnD9XM1zYI9VFJxTEbt0d19g',
        body: 'The licence grants rights worldwide EXCEPT in those territories, and MiniMax '
            + 'invites anyone there to request their own authorization. It is free and MiniMax '
            + 'answered ours the same day. Request yours before installing.',
    },
    sections: [
        {
            heading: 'Section V — Use Restrictions',
            items: [
                'Your use of the MiniMax H3 Works must comply with applicable laws and regulations (including trade-compliance laws and regulations) and must comply with the Acceptable Use Policy for the MiniMax H3 Works, which is incorporated into this Agreement by reference.',
                'Before providing access to the MiniMax H3 Works or any product, service, or Hosted Service incorporating them, you must bind each recipient or user to enforceable terms at least as protective as the use restrictions in this Section V and Exhibit A, and you must notify each recipient or user that those restrictions apply.',
                'You may not use the MiniMax H3 Works or any of their Outputs or results to improve any other artificial intelligence model (other than MiniMax H3 or its Model Derivatives).',
                'You may not use, reproduce, modify, distribute, or display the MiniMax H3 Works or any of their Outputs or results outside the Applicable Territory. Any such use outside the Applicable Territory is not authorized by this Agreement.',
                'If you provide or make available to any Third Party a product, service, or Hosted Service that permits the generation of Outputs using MiniMax H3 or any Model Derivative, you must implement, maintain, test, and periodically review reasonable and proportionate safeguards designed to prevent and mitigate access, uses, and Outputs that violate this Section V or Exhibit A, and must not knowingly disable, materially weaken, or permit the circumvention of those safeguards. You must maintain a reasonably accessible mechanism for reporting suspected violations, and must promptly investigate and act on good-faith reports.',
            ],
        },
        {
            heading: 'Exhibit A — Acceptable Use Policy',
            intro: 'You agree not to use MiniMax H3, any Model Derivatives, or any Output in any of the following ways:',
            items: [
                'Use outside the Applicable Territory;',
                'Use in any manner that violates any applicable national, federal, state, local, or international law, regulation, or other legal requirement, or that infringes, misappropriates, or otherwise violates any Third Party’s intellectual-property or other proprietary rights, including through unauthorized reproduction, distribution, public display, public performance, or creation of derivative works;',
                'Use in any manner that may harm yourself or others;',
                'Use to repurpose or distribute the Outputs of MiniMax H3 or any Model Derivatives in order to harm yourself or others;',
                'Use to circumvent or bypass any safety guardrails or safeguards we have implemented;',
                'Use in any manner that exploits or harms, or intends to exploit or harm, minors;',
                'Use to generate or disseminate verifiably false information and/or content for the purpose of harming others or influencing elections;',
                'Use to manufacture or facilitate false online engagement, including fake reviews and other means of false online engagement;',
                'Use to intentionally defame, disparage, or otherwise harass others;',
                'Use to generate and/or disseminate malware (including ransomware) or any other content intended to damage electronic systems;',
                'Use to generate or disseminate personally identifiable information for the purpose of harming others;',
                'Use to generate or disseminate information (including images, code, posts, or articles) in or to any public environment (including via bot tweets or similar means) without clearly and prominently disclosing that such information and/or content is machine-generated;',
                'Use to impersonate another person without that person’s consent, authorization, or lawful right to do so;',
                'Use to make high-risk automated decisions in critical domains that affect individual safety, rights, or well-being (such as law enforcement, immigration, healthcare or medical services, critical-infrastructure management, product-safety components, essential services, credit, employment, housing, education, social scoring, or insurance);',
                'Use in any manner that violates or disregards the social, ethical, or moral standards of other countries or regions;',
                'Use to carry out, assist, threaten, incite, plan, advocate for, or encourage violent extremism or terrorism;',
                'Use for any purpose intended to discriminate against, or harm, individuals or groups based on protected characteristics or categories, online or offline social behavior, or known or predicted personality traits;',
                'Use to intentionally exploit the vulnerabilities of specific populations based on age, social, physical, or psychological characteristics, so as to materially distort the behavior of a member of that group in a manner that causes, or is likely to cause, physical or psychological harm to that person or to others;',
                'Use for military purposes;',
                'Use to engage in any unauthorized or unlicensed professional activity, including but not limited to financial, legal, medical or healthcare, or other professional practice.',
            ],
        },
    ],
    acknowledgements: [
        'I am outside the excluded territories, or I hold my own authorization from MiniMax.',
        'I accept the Use Restrictions and the Acceptable Use Policy above, and understand they apply to me and to anything I generate with this model.',
    ],
    report: CUBRIC_DISCORD,
};

// FLUX.2 Klein 9B — FLUX Non-Commercial License v2.1 (MPI-357).
//
// The first descriptor carrying `verify`, and the reason that block exists. Black Forest
// Labs gate the weights behind an access request on their own model page, granted to a
// Hugging Face ACCOUNT. That grant IS the licence relationship — user to BFL, direct,
// per §3.a — and it happens somewhere we do not control. A checkbox here cannot stand in
// for it, so the gate asks for a token and proves it.
//
// Two readings of this licence are commonly wrong and both are settled against the real
// text (read 2026-07-26, re-fetched 2026-08-21, bundled below at 18,158 bytes):
//   - OUTPUTS ARE COMMERCIALLY USABLE. §2.d: "You may use Output for any purpose
//     (including for commercial purposes)". The non-commercial bar is on USING the
//     MODEL, not on selling what you make with it.
//   - REDISTRIBUTION IS PERMITTED. §3 lets us ship the weights on conditions: pass on a
//     copy of the licence, display the Attribution Notice. That is what `licences/
//     flux2-klein-9b/` is. We are a distributor under §3, never a sublicensor — which is
//     why the user still has to take the grant from BFL themselves.
/** @type {LicenceDescriptor} */
const FLUX2_KLEIN_9B = {
    id: 'flux-non-commercial-v2.1',
    version: 1,
    name: 'FLUX Non-Commercial License v2.1',
    modelName: 'FLUX.2 Klein 9B',
    summary: 'FLUX.2 Klein 9B is not open-weight. Black Forest Labs license it for '
           + 'non-commercial use only, and only to people who have requested access under '
           + 'their own Hugging Face account. This step shows you the terms and then proves '
           + 'that access before the download starts.',
    // BUNDLED, not linked. §3.a obliges us to "make available a copy of this License to
    // third-party recipients". A link to huggingface.co names a copy; it does not provide
    // one, and it dies when the file moves or the user is offline. Byte-identical to what
    // the repo serves (18,158 bytes, fetched 2026-08-21). NOTICE.txt beside it carries the
    // §3.b Attribution Notice verbatim.
    licenceUrl: '/licences/flux2-klein-9b/LICENSE.txt',
    // §3.b — the Attribution Notice must be displayed "prominently ... alongside the
    // Distribution". The Model Library detail drawer is where the model is presented.
    poweredBy: 'Licensed by Black Forest Labs Inc. under the FLUX Non-Commercial License',
    verify: {
        repoId: 'black-forest-labs/FLUX.2-klein-9B',
        // Gated exactly like the weights, and not an LFS pointer — so an authorised HEAD
        // is a plain 200 rather than a 302 into the CDN. NEVER LICENSE.md or README.md:
        // both answer 200 with no token at all. See the typedef for the measurements.
        probePath: 'model_index.json',
    },
    sections: [
        {
            heading: 'Section 2 — What you may and may not do',
            items: [
                '“Non-Commercial Purpose” means any of the following uses, but only so far as you do not receive any direct or indirect payment arising from the use of the FLUX Model, Derivatives, or Content Filters: (i) personal use for research, experimentation, and testing for the benefit of public knowledge, personal study, private entertainment, hobby projects, or otherwise not directly or indirectly connected to any commercial activities, business operations, or employment responsibilities; (ii) use by commercial or for-profit entities for testing, evaluation, or non-commercial research and development in a non-production environment; and (iii) use by any charitable organization for charitable purposes, or for testing or evaluation. For clarity, use (a) for revenue-generating activity, (b) in direct interactions with or that has impact on end users, or (c) to train, fine tune, or distill other models for commercial use, in each case, is not a Non-Commercial Purpose.',
                'You may only access, use, Distribute, or create Derivatives of the FLUX Model or Derivatives for Non-Commercial Purposes. If you want to use a FLUX Model or a Derivative for any purpose that is not expressly authorized under this License, such as for a commercial activity, you must request a license from Company, which Company may grant to you in Company’s sole discretion and which additional use may be subject to a fee, royalty or other revenue share.',
                'We claim no ownership rights in and to the Outputs. You are solely responsible for the Outputs you generate and their subsequent uses in accordance with this License. You may use Output for any purpose (including for commercial purposes), except as expressly prohibited herein. You may not use the Output to train, fine-tune, or distill a model that is competitive with a FLUX Model.',
                'You may access, use, Distribute, or create Output of the FLUX Model or Derivatives if you: (i) (A) implement and maintain content filtering measures for your use of the FLUX Model or Derivatives to prevent the creation, display, transmission, generation, or dissemination of unlawful or infringing content, or (B) ensure Output undergoes review for unlawful or infringing content before public or non-public distribution, display, transmission or dissemination; and (ii) ensure Output includes disclosure (or other indication) that the Output was generated or modified using artificial intelligence technologies to the extent required under applicable law.',
                'You must make available a copy of this License to third-party recipients of the FLUX Model and/or Derivatives you Distribute, and specify that any rights to use the FLUX Model and/or Derivatives shall be directly granted by Company to said third-party recipients pursuant to this License.',
            ],
        },
        {
            heading: 'Section 4 — Restrictions',
            intro: 'You will not, and will not permit, assist or cause any third party to:',
            items: [
                'use, modify, copy, reproduce, create Derivatives of, or Distribute the FLUX Model (or any Derivative thereof, or any data produced by the FLUX Model), in whole or in part, (i) for any commercial or production purposes, (ii) military purposes, (iii) purposes of surveillance, including any research or development relating to surveillance, (iv) biometric processing, (v) in any manner that infringes, misappropriates, or otherwise violates (or is likely to infringe, misappropriate, or otherwise violate) any third party’s legal rights, including rights of publicity or “digital replica” rights, (vi) in any unlawful, fraudulent, defamatory, or abusive activity, (vii) to generate unlawful content, including child sexual abuse material, or non-consensual intimate images; or (viii) in any manner that violates any applicable law and any privacy or security laws, rules, regulations, directives, or governmental requirements;',
                'alter or remove copyright and other proprietary notices which appear on or in any portion of the FLUX Model;',
                'utilize any equipment, device, software, or other means to circumvent or remove any security or protection used by Company in connection with the FLUX Model, or to circumvent or remove any usage restrictions, or to enable functionality disabled by FLUX Model;',
                'offer or impose any terms on the FLUX Model that alter, restrict, or are inconsistent with the terms of this License;',
                'violate any applicable U.S. and non-U.S. export control and trade sanctions laws (“Export Laws”) in connection with your use or Distribution of any FLUX Model;',
                'directly or indirectly Distribute, export, or otherwise transfer FLUX Model (i) to any individual, entity, or country prohibited by Export Laws; (ii) to anyone on U.S. or non-U.S. government restricted parties lists; (iii) for any purpose prohibited by Export Laws, including nuclear, chemical or biological weapons, or missile technology applications; (iv) use or download FLUX Model if you or they are (a) located in a comprehensively sanctioned jurisdiction, (b) currently listed on any U.S. or non-U.S. restricted parties list, or (c) for any purpose prohibited by Export Laws; and (v) will not disguise your location through IP proxying or other methods.',
            ],
        },
    ],
    acknowledgements: [
        'I will use FLUX.2 Klein 9B only for Non-Commercial Purposes as defined above. I understand the Outputs I generate with it are mine to use commercially; the model itself is not.',
        'I accept the Restrictions in Section 4, and I understand my licence is granted directly by Black Forest Labs — Cubric only distributes the weights under Section 3.',
    ],
};

// MiniMax-Music3 — MiniMax-Music3 Community License, Copyright (c) 2026 MiniMax (MPI-664).
//
// THE FIRST DESCRIPTOR THAT GATES A FLOW RATHER THAN A MODEL, and it needed no code to do
// it: `downloadService.start()` takes whatever key the caller installs under, and the Flow
// Library installs a flow's own deps under `flowDepKey(id)` = `flow:<id>` (MPI-304). So the
// map key below is `flow:minimax-music`, the lookup hits, and the gate fires before the
// 13.3GB moves. Music 3 has no ModelDef on purpose — it is a FLOW WITH DEPS, the Voice
// Changer shape — so there was never a model id to key this on.
//
// DO NOT READ THIS AS H3's AGREEMENT. Same licensor, different instrument, and the two
// differences that matter both cut in the user's favour:
//   - NO TERRITORY BAR. There is no Applicable Territory clause at all, so no `territory`
//     block and no authorization detour for EU/UK/KR/US users. H3's is the outlier.
//   - REDISTRIBUTION IS GRANTED OUTRIGHT, so the weights could live on R2. They are
//     HF-primary today only because the upload has not been done (see assetDeps.js).
//
// WHY GATE IT AT ALL, given there is no §V.2-style "bind each recipient" clause. Clause 4
// puts a standing obligation on US, as the party shipping a product that generates outputs:
// implement, maintain, test and periodically review safeguards against violating uses, and
// do not permit their circumvention. Exhibit A is the list of what counts as violating. A
// consent step that shows a user that list before they can generate is the cheapest
// proportionate organizational safeguard available, and `report` is the route by which a
// violation reaches us — which is the "test and periodically review" half.
//
// §1 is why the licence is BUNDLED rather than linked: the copyright notice and this
// permission notice must be included in all copies. `licences/minimax-music3/LICENSE.txt`
// is byte-identical to what MiniMaxAI/MiniMax-Music3 serves (7,373 bytes, fetched
// 2026-08-31); NOTICE.txt sits beside it carrying the §1 notice and the §3.1 obligation.
//
// §3.1 ATTRIBUTION IS DISCHARGED ON THE ABOUT PAGE, NOT BY `poweredBy`. Settled 2026-08-31.
//
// `poweredBy` renders in MpiModelManager's model detail drawer, keyed by model id — and
// this flow has no model card, deliberately. That is not merely a gap to route around: for
// a model reached only through a Flow it is the WRONG surface, because a user can install
// and run this entire flow from the Flow Library and never open the Model Library at all.
// An attribution only that user never sees is not "prominent" in any reading.
//
// What discharges §3.1 is the `credit` block on all three deps in assetDeps.js. MpiAbout
// derives its Credits list straight from DEPS, so the name "MiniMax-Music3" renders there
// with no wiring, on a page that is reachable however the weights arrived. Its own comment
// already treats that list as legal surface: "a missed credit is a licence breach, not a
// cosmetic bug." Deleting a `credit` block off these deps therefore breaks the licence,
// not the layout.
//
// `poweredBy` is KEPT rather than dropped: it is the exact string §3.1 asks for, it costs
// one line, and it lights up for free the day anything renders licence attribution for a
// flow. It is a record, not dead data — but it is not what is discharging the obligation.
/** @type {LicenceDescriptor} */
const MINIMAX_MUSIC3 = {
    id: 'minimax-music3-community-2026-08-06',
    version: 1,
    name: 'MiniMax-Music3 Community License',
    modelName: 'MiniMax Music 3',
    summary: 'MiniMax-Music3 is free to use, including commercially, and carries no '
           + 'territory restriction. Its licence does set out how the model may not be '
           + 'used, and asks products built on it to say so. This step shows you those '
           + 'terms before the download starts.',
    licenceUrl: '/licences/minimax-music3/LICENSE.txt',
    // §3.1 — "You shall prominently display “MiniMax-Music3” on the user interface of
    // commercial product or service that uses the Software." The exact name is carried
    // verbatim inside this string; do not paraphrase it away.
    poweredBy: 'Powered by MiniMax-Music3',
    sections: [
        {
            heading: 'Section 2 — Compliance',
            items: [
                'Your use of the Software must comply with applicable laws and regulations (including trade-compliance laws and regulations) and must comply with the Acceptable Use Policy in Exhibit A. Especially, you must not violate any third party’s intellectual-property or other rights while using the Software.',
            ],
        },
        {
            heading: 'Section 3 — Commercial Terms',
            items: [
                'You shall prominently display “MiniMax-Music3” on the user interface of commercial product or service that uses the Software.',
                'You shall obtain a separate, prior written authorization from MiniMax by contacting api@minimax.io with the subject line “MiniMax-Music3 licensing - authorization request”, if the aggregate yearly revenue generated from such products and services provided by you and/or any of your affiliates exceeds 20 million US dollars (or equivalent in other currencies).',
            ],
        },
        {
            heading: 'Section 4 — Safeguards',
            items: [
                'If you provide or make available to any third party a product, service, or hosted service that permits the generation of outputs using the Software, you must, before making that product or service available and throughout its operation, implement, maintain, test, and periodically review reasonable and proportionate technical and organizational safeguards designed to prevent and mitigate access, uses, and outputs that violate this License, including uses or outputs that infringe, misappropriate, or otherwise violate any third party’s intellectual-property or other rights. You must not knowingly disable, materially weaken, or permit the circumvention of those safeguards. You are responsible for implementing and enforcing these requirements with respect to your products, services, systems, users, and downstream recipients.',
            ],
        },
        {
            heading: 'Exhibit A — Acceptable Use Policy',
            intro: 'You agree not to use the Software and in any of the following ways:',
            items: [
                'Use in any manner that violates any applicable national, federal, state, local, or international law, regulation, or other legal requirement, or that infringes, misappropriates, or otherwise violates any third party’s intellectual-property or other proprietary rights, including without limitation, through unauthorized reproduction, distribution, public display, public performance, or creation of derivative works;',
                'Use in any manner that may harm yourself or others;',
                'Use to generate, repurpose or distribute any content to harm yourself or others;',
                'Use to circumvent or bypass any safety guardrails or safeguards we have implemented;',
                'Use in any manner that exploits or harms, or intends to exploit or harm, minors;',
                'Use to generate or disseminate verifiably false information and/or content for the purpose of harming others or influencing elections;',
                'Use to manufacture or facilitate false online engagement, including fake reviews and other means of false online engagement;',
                'Use to intentionally defame, disparage, or otherwise harass others;',
                'Use to generate and/or disseminate malware (including ransomware) or any other content intended to damage electronic systems;',
                'Use to generate or disseminate personally identifiable information for the purpose of harming others;',
                'Use to generate or disseminate information (including images, code, posts, or articles) in or to any public environment (including via bot tweets or similar means) without clearly and prominently disclosing that such information and/or content is machine-generated;',
                'Use to impersonate another person without that person’s consent, authorization, or lawful right to do so;',
                'Use to make high-risk automated decisions in critical domains that affect individual safety, rights, or well-being (such as law enforcement, immigration, healthcare or medical services, critical-infrastructure management, product-safety components, essential services, credit, employment, housing, education, social scoring, or insurance);',
                'Use in any manner that violates or disregards the social, ethical, or moral standards of other countries or regions;',
                'Use to carry out, assist, threaten, incite, plan, advocate for, or encourage violent extremism or terrorism;',
                'Use for any purpose intended to discriminate against, or harm, individuals or groups based on protected characteristics or categories, online or offline social behavior, or known or predicted personality traits;',
                'Use to intentionally exploit the vulnerabilities of specific populations based on age, social, physical, or psychological characteristics, so as to materially distort the behavior of a member of that group in a manner that causes, or is likely to cause, physical or psychological harm to that person or to others;',
                'Use for military purposes; and',
                'Use to engage in any unauthorized or unlicensed professional activity, including but not limited to financial, legal, medical or healthcare, or other professional practice.',
            ],
        },
    ],
    acknowledgements: [
        'I accept the Acceptable Use Policy above, and understand it applies to me and to any music I generate with this model.',
        'I understand the music I generate is mine to use commercially, and that a commercial product built on this model must display the name “MiniMax-Music3”.',
    ],
    report: CUBRIC_DISCORD,
};

/** @type {Record<string, LicenceDescriptor>} */
export const MODEL_LICENCES = {
    'minimax-h3':        MINIMAX_H3,   // first/last-frame to video+audio
    'minimax-h3-ref2va': MINIMAX_H3,   // reference to video+audio — different weights, same agreement
    // No ModelDef yet — MPI-357 ships the GATE, not the model (`klein-9b` is the id the
    // 9B entry will take beside the existing `klein-4b`). Until it lands the lookup
    // simply misses, exactly as it does for every ungated model.
    'klein-9b':          FLUX2_KLEIN_9B,
    // NOT a model id — a FLOW dep-queue key, `flowDepKey('minimax-music')` (MPI-664). The
    // FlowDef has not landed yet, so like `klein-9b` above the lookup simply misses until
    // it does. When it lands its `id` must be `minimax-music` or this gate never fires and
    // 13.3GB of licensed weights install with nothing shown.
    'flow:minimax-music': MINIMAX_MUSIC3,
};

/** Where a user requests access to a `verify` licence — the licensor's own model page. */
export function licenceAccessUrl(licence) {
    return licence?.verify ? `https://huggingface.co/${licence.verify.repoId}` : null;
}

/** Where a user mints the read token the probe needs. */
export const HF_TOKEN_URL = 'https://huggingface.co/settings/tokens';

/**
 * The licence descriptor gating this id, or null when the model is ungated.
 * @param {string} modelId
 * @returns {LicenceDescriptor|null}
 */
export function getModelLicence(modelId) {
    return MODEL_LICENCES[modelId] || null;
}

/**
 * Has the user already accepted this version of the agreement covering this model?
 *
 * Receipts are keyed by LICENCE id, not by model id. The binding a licence asks for is
 * to the PERSON — "bind each recipient or user to enforceable terms" — so once someone
 * has accepted the H3 agreement, showing them the identical 25 clauses again because
 * they went on to install the ref2va variant is friction that buys no consent. Two
 * models under two DIFFERENT licences still get two dialogs; they have different ids.
 *
 * A `version` bump invalidates every prior receipt, which is how a revised AUP reaches
 * users who installed under the old one.
 *
 * @param {string} modelId
 * @returns {boolean}
 */
export function hasAcceptedLicence(modelId) {
    const licence = getModelLicence(modelId);
    if (!licence) return true;   // ungated — nothing to accept
    const r = Storage.getLicenceReceipts()[licence.id];
    if (!r || Number(r.version) < licence.version) return false;
    // A `verify` licence is accepted only once the PROBE passed. Without this line a
    // receipt written by the consent half alone would satisfy the gate, and the proof
    // step would be decoration — including any receipt filed before `verify` was added.
    return licence.verify ? r.verified === true : true;
}

/**
 * Record acceptance. Survives a restart; scoped to the app's user-data partition.
 * `modelId` is kept on the receipt as provenance — which install prompted it — but the
 * receipt is filed under the licence, so it covers every model that agreement governs.
 *
 * THE TOKEN IS NEVER PART OF THIS. A `verify` licence writes `verified: true` and the
 * timestamp it happened, and nothing else: the HF token is used for one HEAD request and
 * dropped. No safeStorage, no IPC, no credential at rest, nothing to leak into a log or a
 * portable build. On a later 403 at download time the gate simply asks again.
 *
 * @param {string} modelId
 * @param {{at?: string, verified?: boolean}} [opts]
 *        `at` — ISO timestamp, defaults to now. `verified` — the probe passed.
 */
export function recordLicenceAcceptance(modelId, opts = {}) {
    const licence = getModelLicence(modelId);
    if (!licence) return;
    const all = Storage.getLicenceReceipts();
    all[licence.id] = {
        version: licence.version,
        at: opts.at || new Date().toISOString(),
        acceptedVia: modelId,
        ...(opts.verified ? { verified: true } : {}),
    };
    Storage.setLicenceReceipts(all);
}
