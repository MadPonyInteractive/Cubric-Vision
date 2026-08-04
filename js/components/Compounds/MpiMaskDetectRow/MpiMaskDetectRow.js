/**
 * MpiMaskDetectRow — Compound: the run / commit row shared by every
 * detection-based mask tool (MPI-371).
 *
 * Thumbs strip · Detect button · Add / Subtract. Mounted by Detect and Points
 * today, and by Text (MPI-361 Phase B) when it lands — the three differ only in
 * what they feed the graph, never in how a result is reviewed and committed.
 *
 * A detect run is a generation, so the whole row is blocked while Cue has real
 * jobs. Add / Subtract bake the detected region into the paint layers app-side
 * (MaskManager.bakeAutoPicksInto) — that is why they compose with the brush and
 * preserve undo.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Requires on viewer.el:
 *   getAutoMaskThumbsEl?(), runAutoMaskDetect(), cancelAutoMaskDetect(),
 *   bakeAutoPicks('manual'|'subtract')
 *
 * The thumbs node is OWNED BY THE VIEWER — re-parented here, never destroyed.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs }        from '../../../utils/dom.js';
import { Events }    from '../../../events.js';
import { state }     from '../../../state.js';

const QUEUE_DISABLED_REASON = 'Auto detection is unavailable while Cue has running or queued jobs';

export const MpiMaskDetectRow = ComponentFactory.create({
    name: 'MpiMaskDetectRow',
    css: ['js/components/Compounds/MpiMaskDetectRow/MpiMaskDetectRow.css'],

    template: () => `
        <div class="mpi-mask-detect-row">
            <div class="mpi-mask-detect-row__note" id="queue-note" hidden>
                Auto detection unavailable while Cue is active
            </div>
            <div class="mpi-mask-detect-row__gated" id="gated">
                <div class="mpi-mask-detect-row__thumbs" id="thumbs-slot"></div>
                <div class="mpi-mask-detect-row__row"    id="detect-slot"></div>
                <div class="mpi-mask-detect-row__row"    id="commit-slot"></div>
            </div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const _children = [];
        const gated     = qs('#gated', el);
        const queueNote = qs('#queue-note', el);
        let _blocked = false;
        let _running = false;

        const thumbsEl = viewer.el.getAutoMaskThumbsEl?.();
        if (thumbsEl) qs('#thumbs-slot', el).appendChild(thumbsEl);

        const detectBtn = MpiButton.mount(qs('#detect-slot', el), {
            icon: 'search', label: 'Detect', size: 'sm', variant: 'primary',
            info: 'Run detection',
        });
        detectBtn.on('click', () => {
            if (_blocked) return;
            viewer.el.runAutoMaskDetect?.();
        });
        _children.push(detectBtn);

        // MPI-421: a detect is a ComfyUI run that used to be completely invisible —
        // the button did not change, so a slow pass read as a hang, and the exec's
        // cancel() had nothing wired to it. Two buttons swapping is cheaper than
        // teaching MpiButton to restyle itself for one caller.
        const stopBtn = MpiButton.mount(qs('#detect-slot', el), {
            icon: 'stop', label: 'Stop', size: 'sm', variant: 'danger',
            info: 'Stop the detection',
        });
        stopBtn.el.hidden = true;
        stopBtn.on('click', () => viewer.el.cancelAutoMaskDetect?.());
        _children.push(stopBtn);

        const _offRunning = Events.on('automask:running', ({ running }) => {
            _running = !!running;
            detectBtn.el.hidden = _running;
            stopBtn.el.hidden   = !_running;
            _syncGate();
        });

        // Add / Subtract — a run renders green (MpiCanvas._recolorMaskLayer) and
        // waits to be committed. A points run returns ONE region, so this is also
        // how multi-part selections are built: Add the first part, place new dots,
        // Add again.
        const commitRow = qs('#commit-slot', el);
        const addBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'plus', label: 'Add', size: 'sm', variant: 'secondary',
            info: 'Add the detected area to the mask',
        });
        const subBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'minus', label: 'Subtract', size: 'sm', variant: 'secondary',
            info: 'Cut the detected area out of the mask',
        });
        commitRow.appendChild(addBtn.el);
        commitRow.appendChild(subBtn.el);
        addBtn.on('click', () => viewer.el.bakeAutoPicks?.('manual'));
        subBtn.on('click', () => viewer.el.bakeAutoPicks?.('subtract'));
        _children.push(addBtn, subBtn);

        // ponytail: the gate covers this row only. Before the split it wrapped the
        // whole panel, so a busy Cue also froze the model radios / Scope slider —
        // neither of which runs anything. Blocking the Detect button is the part
        // that matters.
        function _syncGate() {
            _blocked = (state.generationQueueCount || 0) > 0;
            // MPI-421: a Cue started DURING a detect must not make the Stop button
            // inert — that is the one control the user needs while a run is in
            // flight, and the gate exists to stop new runs, not to trap live ones.
            const freeze = _blocked && !_running;
            gated.classList.toggle('mpi-mask-detect-row__gated--disabled', freeze);
            gated.setAttribute('aria-disabled', freeze ? 'true' : 'false');
            if (freeze) gated.setAttribute('inert', '');
            else gated.removeAttribute('inert');
            queueNote.hidden = !_blocked;
            detectBtn.el.setDisabled?.(_blocked);
            detectBtn.el.setAttribute('data-info', _blocked ? QUEUE_DISABLED_REASON : 'Run detection');
        }

        const _offQueueGate = Events.onState('generationQueueCount', _syncGate);
        _syncGate();

        el.destroy = () => {
            _offQueueGate();
            _offRunning();
            // Detach the viewer-owned thumbs node rather than letting it be wiped
            // with our subtree — the viewer still owns the instance.
            if (thumbsEl?.parentNode) thumbsEl.parentNode.removeChild(thumbsEl);
            _children.forEach(c => c.destroy?.());
        };
    },
});
