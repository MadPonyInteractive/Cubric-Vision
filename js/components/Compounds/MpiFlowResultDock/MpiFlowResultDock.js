/**
 * MpiFlowResultDock — the floating result window a Flow carries off its last step (Compound).
 *
 * A Flow's result lives on the run slide, and the run slide is rebuilt on every
 * navigation — so stepping back to re-read an input took the result off screen and,
 * for an audio result, stopped the sound with it (MPI-727). This is where the result
 * goes instead: a small window in the stage's top-right corner, visible only while the
 * user is somewhere else in the flow.
 *
 * DELIBERATELY DUMB. It owns a corner and a box; it does not know what a result is,
 * decide when to appear, or build the media. `MpiBaseFlow` hands it a node and a
 * visibility — which is the whole reason an `<audio>` element can be MOVED in here
 * mid-playback rather than re-created (a new element with the same `src` restarts from
 * zero, which is the original bug wearing a different hat).
 *
 * `setContent(null)` empties the box WITHOUT destroying what was in it: the caller may
 * have already moved that node back onto the run slide, and tearing down a node the
 * caller still owns is how a live player becomes a dead reference.
 *
 * Props: none.
 *
 * Instance API (on el):
 *   setContent(node|null) — replace the media box's single child
 *   setOpen(bool)         — show/hide the window
 *   destroy()             — empty the box (the content belongs to the caller)
 */

import { ComponentFactory } from '../../factory.js';
import { qs } from '../../../utils/dom.js';

export const MpiFlowResultDock = ComponentFactory.create({
    name: 'MpiFlowResultDock',
    css: ['js/components/Compounds/MpiFlowResultDock/MpiFlowResultDock.css'],

    template: () => `
        <div class="mpi-flow-result-dock">
            <div class="mpi-flow-result-dock__media" id="dock-media"></div>
        </div>
    `,

    setup: (el) => {
        const mediaEl = qs('#dock-media', el);

        el.setContent = (node) => {
            // replaceChildren rather than an innerHTML wipe: what leaves this box is
            // usually the caller's shared audio element, already re-appended to the
            // run slide. Both merely detach, but only this one reads that way.
            if (node) mediaEl.replaceChildren(node);
            else mediaEl.replaceChildren();
        };

        // A class, never `hidden` — this component sets its own `display`, and a
        // component's own display beats the UA's `[hidden]` rule every time.
        el.setOpen = (open) => {
            el.classList.toggle('mpi-flow-result-dock--open', !!open);
        };

        el.destroy = () => { mediaEl.replaceChildren(); };
    },
});
