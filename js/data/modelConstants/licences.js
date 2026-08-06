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
 * @property {string} licenceUrl  - The full agreement. Opened in the system browser.
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
 * @property {{label: string, url: string}} report - Misuse-reporting route (§V.5).
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
    licenceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE',
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

/** @type {Record<string, LicenceDescriptor>} */
export const MODEL_LICENCES = {
    'minimax-h3':        MINIMAX_H3,   // first/last-frame to video+audio
    'minimax-h3-ref2va': MINIMAX_H3,   // reference to video+audio — different weights, same agreement
};

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
    return !!r && Number(r.version) >= licence.version;
}

/**
 * Record acceptance. Survives a restart; scoped to the app's user-data partition.
 * `modelId` is kept on the receipt as provenance — which install prompted it — but the
 * receipt is filed under the licence, so it covers every model that agreement governs.
 * @param {string} modelId
 * @param {string} [at] - ISO timestamp; defaults to now.
 */
export function recordLicenceAcceptance(modelId, at) {
    const licence = getModelLicence(modelId);
    if (!licence) return;
    const all = Storage.getLicenceReceipts();
    all[licence.id] = { version: licence.version, at: at || new Date().toISOString(), acceptedVia: modelId };
    Storage.setLicenceReceipts(all);
}
