import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton, mountButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiCheckbox } from '../../Primitives/MpiCheckbox/MpiCheckbox.js';
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
            text: 'Accept and install', variant: 'primary', size: 'md', disabled: true,
        });
        acceptBtn.on('click', () => {
            if (!_allTicked()) return;   // belt: setDisabled already blocks the click
            emit('accept', {});
            el.hide();
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
        const _allTicked = () => readToEnd && checkboxes.every(cb => cb.el.isChecked());

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
