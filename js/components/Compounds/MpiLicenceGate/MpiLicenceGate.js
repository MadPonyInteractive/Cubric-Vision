import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton, mountButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiCheckbox } from '../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { licenceAccessUrl, HF_TOKEN_URL } from '../../../data/modelConstants/licences.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';
import { openExternal } from '../../../utils/openExternal.js';
import { clientLogger } from '../../../services/clientLogger.js';

/**
 * MpiLicenceGate — Model Licence Acceptance Dialog (Compound, MPI-451)
 *
 * Shown before a licence-gated model downloads. A few model licences oblige US, as
 * the distributor, to bind the END USER to the licensor's restrictions and to notify
 * them those restrictions apply — MiniMax H3 §V.2 is the forcing case. This dialog is
 * that notice and that binding.
 *
 * Only models carrying a descriptor in `js/data/modelConstants/licences.js` ever see
 * it; every other install path is untouched.
 *
 * Three things gate the Accept button, in order:
 *   1. the restrictions pane has been scrolled to the end,
 *   2. every acknowledgement checkbox is ticked (they stay disabled until 1),
 *   3. — that's it. There is no timer and no "I have read" theatre.
 *
 * A descriptor carrying `verify` adds a FOURTH thing, and it is the only one that is
 * evidence rather than consent (MPI-357). Those licences are granted by the licensor to
 * a person, through an access request on the licensor's own model page — so the dialog
 * also asks for an access token and PROVES the grant against Hugging Face before it
 * resolves. Accept then means "checked, and it passed", not "ticked a box". The token is
 * used for that one request and never stored; see `routes/licences.js`.
 *
 * The scroll gate covers the RESTRICTIONS PANE only, not the whole agreement. The
 * pane is the text the licence actually obliges us to put in front of the user, and
 * it is short enough that requiring a scroll is honest; the full 17KB agreement is a
 * link out. Forcing a scroll through the whole thing only teaches people to fling the
 * scrollbar, which is worse evidence of consent, not better.
 *
 * Usage — prefer the promise helper over mounting by hand:
 *   const accepted = await showLicenceGate(licence);
 *
 * Props:
 * @param {import('../../../data/modelConstants/licences.js').LicenceDescriptor} licence
 *
 * Emits:
 * 'accept' {}  — every box ticked and Accept pressed
 * 'cancel' {}  — Cancel, Escape or backdrop
 */
export const MpiLicenceGate = ComponentFactory.create({
    name: 'MpiLicenceGate',
    css: ['js/components/Compounds/MpiLicenceGate/MpiLicenceGate.css'],

    template: () => `
        <div class="mpi-licence-gate" role="dialog" aria-modal="true">
            <div class="mpi-licence-gate__head">
                <div class="mpi-licence-gate__icon" id="icon-slot"></div>
                <div>
                    <div class="mpi-licence-gate__kicker" id="kicker-slot"></div>
                    <div class="mpi-licence-gate__title" id="title-slot"></div>
                </div>
            </div>
            <div class="mpi-licence-gate__summary" id="summary-slot"></div>
            <div class="mpi-licence-gate__territory" id="territory-slot"></div>
            <div class="mpi-licence-gate__scroller" id="scroller-slot" tabindex="0"></div>
            <div class="mpi-licence-gate__hint" id="hint-slot"></div>
            <div class="mpi-licence-gate__acks" id="acks-slot"></div>
            <div class="mpi-licence-gate__verify" id="verify-slot"></div>
            <div class="mpi-licence-gate__links" id="links-slot"></div>
            <div class="mpi-licence-gate__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const licence = props.licence;
        const _unsubs = [];

        // ── Modal shell. backdropClose stays OFF: a stray click outside a legal
        //    dialog should not read as "not now" when the user is mid-read. Escape
        //    still works (Overlays owns it) and lands on the same cancel path.
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(720px, 94vw)',
            backdropClose: false,
            // clientHeight/scrollHeight are 0 until the portal is in the DOM, so the
            // "licence too short to scroll" case can only resolve once it is shown.
            onShow: () => requestAnimationFrame(() => _refresh()),
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        // ── Head ─────────────────────────────────────────────────────────────
        qs('#icon-slot', el).innerHTML = renderIcon('warning', 'xl');
        qs('#kicker-slot', el).textContent = 'Licence required';
        qs('#title-slot', el).textContent = `${licence.modelName} — ${licence.name}`;
        qs('#summary-slot', el).textContent = licence.summary;

        // ── Territory banner — the remedy, never a disclaimer ────────────────
        // A territory-restricted licence routes the user to the licensor's own
        // authorization route. "It is your responsibility to check" is explicitly NOT
        // what ships here: it transfers blame without transferring rights, and it
        // reads as knowingly routing users into unlicensed use.
        const territorySlot = qs('#territory-slot', el);
        if (licence.territory) {
            const list = licence.territory.territories;
            const named = list.length > 1
                ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
                : list[0];
            territorySlot.append(
                ce('div', {
                    className: 'mpi-licence-gate__territory-text',
                    textContent: `${licence.modelName} is not licensed for use in ${named}. `
                               + licence.territory.body,
                }),
            );
            const requestBtn = MpiButton.mount(document.createElement('div'), {
                text: 'Request your authorization',
                variant: 'secondary',
                size: 'sm',
            });
            requestBtn.on('click', () => openExternal(licence.territory.authorizationUrl));
            territorySlot.appendChild(requestBtn.el);
        } else {
            territorySlot.style.display = 'none';
        }

        // ── The restrictions themselves, verbatim ────────────────────────────
        const scroller = qs('#scroller-slot', el);
        for (const section of licence.sections) {
            scroller.append(ce('h3', { className: 'mpi-licence-gate__heading', textContent: section.heading }));
            if (section.intro) {
                scroller.append(ce('p', { className: 'mpi-licence-gate__intro', textContent: section.intro }));
            }
            scroller.append(ce('ol', { className: 'mpi-licence-gate__list' },
                section.items.map(t => ce('li', { textContent: t }))));
        }

        // ── Acknowledgements — disabled until the pane has been read out ─────
        const acksSlot = qs('#acks-slot', el);
        const checkboxes = licence.acknowledgements.map((label, i) => {
            const cb = MpiCheckbox.mount(document.createElement('div'), {
                label,
                checked: false,
                disabled: true,
                name: `licence-ack-${i}`,
            });
            cb.on('change', () => _refresh());
            acksSlot.appendChild(cb.el);
            return cb;
        });

        // ── The proof step — `verify` descriptors only (MPI-357) ─────────────
        // Everything above this line is consent: the user telling us they accept. This
        // block is the only part that is EVIDENCE, and it exists because these licences
        // are granted somewhere we do not control — the licensor's own model page, to
        // the user's own account. A checkbox cannot stand in for that grant, so we ask
        // Hugging Face whether it happened.
        const verifySlot = qs('#verify-slot', el);
        const verify = licence.verify || null;
        let token = '';
        let tokenInput = null;
        let verifyMsg = null;

        if (verify) {
            verifySlot.append(ce('div', {
                className: 'mpi-licence-gate__verify-text',
                textContent: `${licence.modelName} is released behind an access request. Request it on `
                           + 'the model page under your own Hugging Face account, then paste a read '
                           + 'token here so we can confirm it was granted. The token is used once and '
                           + 'never stored.',
            }));

            const verifyLinks = ce('div', { className: 'mpi-licence-gate__verify-links' });
            verifyLinks.append(_link('Request access on Hugging Face', licenceAccessUrl(licence)));
            verifyLinks.append(_link('Create a read token', HF_TOKEN_URL));
            verifySlot.append(verifyLinks);

            tokenInput = MpiInput.mount(document.createElement('div'), {
                type: 'password',
                label: 'Hugging Face access token',
                placeholder: 'hf_…',
            });
            tokenInput.on('input', (e) => { token = (e.value || '').trim(); _refresh(); });
            verifySlot.appendChild(tokenInput.el);

            verifyMsg = ce('div', { className: 'mpi-licence-gate__verify-msg' });
            verifySlot.append(verifyMsg);
        } else {
            verifySlot.style.display = 'none';
        }

        // ── Links ────────────────────────────────────────────────────────────
        const linksSlot = qs('#links-slot', el);
        linksSlot.append(_link('Read the full licence', licence.licenceUrl));
        if (licence.report) linksSlot.append(_link(licence.report.label, licence.report.url));

        // ── Actions ──────────────────────────────────────────────────────────
        const actionsSlot = qs('#actions-slot', el);
        const cancelBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Cancel', variant: 'secondary', size: 'md',
        });
        cancelBtn.on('click', () => { emit('cancel', {}); el.hide(); });
        actionsSlot.appendChild(cancelBtn.el);

        const acceptBtn = MpiButton.mount(document.createElement('div'), {
            text: verify ? 'Verify and install' : 'Accept and install',
            variant: 'primary', size: 'md', disabled: true,
        });
        acceptBtn.on('click', async () => {
            if (!_allTicked()) return;   // belt: setDisabled already blocks the click
            // Ungated-by-proof licences settle here, exactly as they did before.
            if (!verify) { emit('accept', {}); el.hide(); return; }

            _setMsg('Checking with Hugging Face…', false);
            acceptBtn.el.setDisabled(true);
            const result = await _probe();
            if (result.ok) { emit('accept', {}); el.hide(); return; }

            // A failed probe must leave the dialog OPEN. Resolving false here would read
            // to the caller as "declined", and the user would be back on a tile with no
            // idea which of the two fixable things went wrong.
            _setMsg(_failureText(result), true);
            _refresh();
        });
        actionsSlot.appendChild(acceptBtn.el);

        // ── The scroll gate ──────────────────────────────────────────────────
        const hint = qs('#hint-slot', el);
        let readToEnd = false;

        // Two cases this has to separate, and they look identical in the numbers.
        //
        // Before the modal is portalled and laid out, scrollTop/clientHeight/scrollHeight
        // are ALL 0 — and `0 + 0 >= 0 - 4` is true, so a naive check silently declares the
        // licence read during setup and ships a gate that gates nothing. Caught in the
        // browser (checkboxes already enabled on a 1820px pane); it is invisible in source.
        // No layout means no verdict.
        //
        // Once laid out, a pane with no overflow can never fire 'scroll', so a licence
        // short enough to fit would deadlock the dialog forever. There, "nothing to
        // scroll" genuinely is "already read".
        const _atEnd = () => scroller.clientHeight > 0
            && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        const _allTicked = () => readToEnd
            && checkboxes.every(cb => cb.el.isChecked())
            && (!verify || token.length > 0);

        function _refresh() {
            if (!readToEnd && _atEnd()) {
                readToEnd = true;
                checkboxes.forEach(cb => cb.el.setDisabled(false));
                el.classList.add('mpi-licence-gate--read');
            }
            hint.textContent = readToEnd ? '' : 'Scroll to the end of the restrictions to continue';
            acceptBtn.el.setDisabled(!_allTicked());
        }

        _unsubs.push(on(scroller, 'scroll', _refresh, { passive: true }));
        _refresh();

        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _unsubs.length = 0;
        };

        function _link(text, url) {
            const a = mountButton({ text, variant: 'ghost', size: 'sm', extraClasses: 'mpi-licence-gate__link' });
            _unsubs.push(on(a, 'click', () => openExternal(url)));
            return a;
        }

        function _setMsg(text, isError) {
            if (!verifyMsg) return;
            verifyMsg.textContent = text;
            verifyMsg.classList.toggle('mpi-licence-gate__verify-msg--error', !!isError);
        }

        // The probe runs SERVER-SIDE. Not squeamishness: Hugging Face answers
        // `Access-Control-Allow-Origin: https://huggingface.co`, so a fetch straight from
        // here cannot read the status at all — and going through our own server keeps the
        // token out of the renderer's network pane and out of clientLogger.
        async function _probe() {
            try {
                const res = await fetch('/licences/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repoId: verify.repoId, probePath: verify.probePath, token }),
                });
                return await res.json();
            } catch (err) {
                clientLogger.warn('licence-gate', `verify request failed: ${err.message}`);
                return { ok: false, reason: 'offline' };
            }
        }

        // Two failures, two different fixes — and the user cannot tell them apart from a
        // status code. Say which one it is, and what to do about it.
        function _failureText(result) {
            switch (result.reason) {
                case 'not-granted':
                    // The last clause is not padding. Klein 9B's repo is `gated: "auto"`, so
                    // accepting is one button and the grant is instant — but a licensor may
                    // instead run a form (email, affiliation, intended use) and approve by
                    // hand. Without this, a user on one of those reads "try again" as "it
                    // should work now" and hammers a button that cannot pass for days.
                    return 'Hugging Face has not granted your account access to this model yet. '
                         + 'Open the model page, complete the access request, then try again. '
                         + 'Most are granted the moment you accept, but some licensors review '
                         + 'requests by hand — if yours does, come back once it is approved.';
                case 'bad-token':
                    return 'That token was rejected. Check you pasted a current token with read access.';
                case 'offline':
                    return 'Could not reach Hugging Face. Check your connection and try again.';
                default:
                    return result.message
                        || `Hugging Face answered ${result.status || 'nothing'}. Try again in a moment.`;
            }
        }
    },
});

/**
 * Show the gate and resolve true only if the user accepted.
 * A fresh instance per call — the dialog holds per-licence DOM and one-shot scroll state.
 * @param {import('../../../data/modelConstants/licences.js').LicenceDescriptor} licence
 * @returns {Promise<boolean>}
 */
export function showLicenceGate(licence) {
    return new Promise((resolve) => {
        const gate = MpiLicenceGate.mount(document.createElement('div'), { licence });
        let settled = false;
        // Escape / ui:close-all-popups tear the modal down without emitting either, so
        // watch the element leaving the document and settle as a decline. Without this
        // the install promise never resolves and the serial install chain wedges.
        const observer = new MutationObserver(() => {
            if (!document.body.contains(gate.el)) finish(false);
        });
        const finish = (accepted) => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            gate.destroy();
            // Resolve BEFORE logging. A throw between the dialog closing and this
            // resolve leaves the install promise pending forever and wedges the serial
            // install chain behind it — which is exactly what happened here, from a
            // `clientLogger.log` that does not exist (the API is info/warn/error).
            resolve(accepted);
            clientLogger.info('licence-gate', `${licence.id} ${accepted ? 'accepted' : 'declined'}`);
        };
        gate.on('accept', () => finish(true));
        gate.on('cancel', () => finish(false));
        gate.el.show();
        observer.observe(document.body, { childList: true, subtree: true });
    });
}
