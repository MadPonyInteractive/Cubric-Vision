/**
 * flowLicences.js — the ONE answer to "which licences gate this flow, and how do
 * they render", shared by every surface that has to show them.
 *
 * Extracted from MpiFlowLibrary's closure (MPI-666 phase 2) the same way
 * declaredFields.js was extracted from MpiBaseFlow (MPI-580), and for the same
 * reason: a SECOND surface needs it, and two copies of a licence block drift into
 * one surface attributing its licensor and the other not. That is not a cosmetic
 * drift — `poweredBy` is licence-mandated attribution (MPI-452) and `report` is a
 * misuse-reporting channel MiniMax H3 §V.5 obliges us to keep reachable.
 *
 * Two consumers today:
 *   - MpiFlowLibrary  — the PRE-install drawer, reached from Landing.
 *   - MpiBaseFlow     — step 0 of the flow frame, the POST-install route. MPI-638's
 *                       `_pick` skips the drawer for an available flow inside a
 *                       project, so without this the licence is reachable from one
 *                       page only.
 *
 * BEM: the rows carry `mpi-detail__licence*`, MpiModelManager's block, deliberately —
 * this IS the Model Library's licence block, and preloadStyles.js loads that
 * stylesheet app-wide, so both consumers inherit the layout instead of forking it.
 * A consumer supplies its own wrapper class for spacing (see MpiBaseFlow's
 * `mpi-base-flow__licence`); nothing here writes a margin.
 */
import { flowModelIds, flowDepKey } from '../data/flowsRegistry.js';
import { getModelLicence } from '../data/modelConstants/licences.js';
import { ce, on } from './dom.js';
import { mountButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { openExternal } from './openExternal.js';

/**
 * Every download-queue key this flow installs under: one per required MODEL, plus
 * ONE for its own flow-only deps (MPI-304, keyed `flow:<id>` so it can never collide
 * with a model id).
 *
 * It lives in this module because THE QUEUE KEY IS THE LICENCE KEY — `getModelLicence`
 * answers for a model id and for a `flow:<id>` dep key alike (MPI-664 filed
 * `flow:minimax-music` in MODEL_LICENCES) — so a flow's own weights are covered by the
 * same lookup as its models with no special case. MpiFlowLibrary imports it for
 * install/cancel/progress too; that identity is exactly why one list serves both.
 *
 * @param {Object} flow a FlowDef
 * @returns {string[]}
 */
export function flowInstallKeys(flow) {
    // Resolved ids (MPI-590): an any-of slot contributes the member that is
    // installed — or the default to install — never both, so the aggregated bar
    // and Cancel-all keep counting one job per slot exactly as before.
    const keys = flowModelIds(flow);
    if ((flow.requiredDeps || []).length) keys.push(flowDepKey(flow.id));
    return keys;
}

/**
 * Every licence descriptor gating anything this flow installs, deduped.
 *
 * Deduped by DESCRIPTOR id, not by key: H3 ships as two ModelDefs under one
 * agreement, so a flow pulling both must not print the same block twice.
 *
 * @param {Object} flow a FlowDef
 * @returns {{ key: string, licence: Object }[]}
 */
export function flowLicences(flow) {
    const seen = new Set();
    const out = [];
    for (const key of flowInstallKeys(flow)) {
        const licence = getModelLicence(key);
        if (!licence || seen.has(licence.id)) continue;
        seen.add(licence.id);
        out.push({ key, licence });
    }
    return out;
}

/**
 * One `.mpi-detail__licence` row per descriptor gating this flow, ready to append.
 *
 * WHY EVERY LICENCE AND NOT A "one or more apply" NOTE: a note that names a licence
 * without linking it is the same dead end MPI-666 closes — "Read the licence" is the
 * affordance, not the word. N is 1 for every flow shipped today, so the common case
 * renders exactly like the model drawer; a second descriptor stacks a second block,
 * which is the only case the model drawer never has to handle.
 *
 * @param {Object} flow a FlowDef
 * @param {Function[]} unsubs the caller's teardown list — every link listener lands here
 * @returns {HTMLElement[]} empty when nothing gates the flow, so a caller can skip its label
 */
export function buildLicenceRows(flow, unsubs) {
    return flowLicences(flow).map(({ licence }) => {
        const row = ce('div', { className: 'mpi-detail__licence' });
        row.append(ce('div', { className: 'mpi-detail__licence-name', textContent: licence.name }));
        // Required attribution (MPI-452/664) rides with the licence it belongs to,
        // so a flow pulling two licensed weights attributes each to its own licensor.
        if (licence.poweredBy) {
            row.append(ce('div', { className: 'mpi-detail__licence-powered', textContent: licence.poweredBy }));
        }
        const links = ce('div', { className: 'mpi-detail__licence-links' });
        const linkTo = (text, url) => {
            const b = mountButton({ text, variant: 'ghost', size: 'sm', extraClasses: 'mpi-detail__licence-link' });
            unsubs.push(on(b, 'click', () => openExternal(url)));
            return b;
        };
        links.append(linkTo('Read the licence', licence.licenceUrl));
        // The link a BARRED user needs. Until MPI-666 it existed only inside the gate
        // dialog and in the Model Library drawer, so a Flow-only user who cancelled
        // the dialog had no standing route to it (MPI-591 puts territory-restricted
        // MiniMax H3 behind Extend Video, and Fabio's own machine is inside the bar).
        if (licence.territory) links.append(linkTo('Request authorization', licence.territory.authorizationUrl));
        if (licence.report) links.append(linkTo(licence.report.label, licence.report.url));
        row.append(links);
        return row;
    });
}
