/**
 * MpiToolOptionsComposite — Organism: the Composite group (MPI-373).
 *
 * The last card of the MPI-424 taxonomy, and its cleanest example: ONE operation with
 * two front ends. The selected entry is image 1 and sits ON TOP; a slot holds image 2,
 * underneath. `paintComp` cuts the hole live with the brush; `maskComp` takes the same
 * hole from a pasted mask. Same layer, same preview, same server blend — the only
 * difference is where the cut comes from, which is why this is one component under two
 * modes rather than two components sharing a base.
 *
 * IT REPLACES THE MPI-362 MODAL. That flow selected two entries, required one of them
 * to already carry a mask, and asked Add or Subtract in prose — the blend was invisible
 * while the user decided it, so he ran it three or four times. Nothing about the server
 * side changed; what changed is that he can see it.
 *
 * SLOTS ARE FILLED BY PASTE, not by selection (user, 2026-08-01). Changing the
 * selection used to restart the whole operation. `Copy image` sits beside the existing
 * `Copy mask` in the history list's context menu, and a slot takes either.
 *
 * NO PROMPTBOX. Composite is the one group in the taxonomy that drops it: it ends at
 * its own Apply and needs the column for the slots (`docs/masking-tools.md`).
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 * @param {'maskComp'|'paintComp'} mode - which mount this is
 * @param {object} [clipboard] - app-local copy buffer accessors from MpiGroupHistoryBlock:
 *   { hasImage(), getImage(), hasMask(), getMask() }
 *
 * Requires on viewer.el:
 *   enterMode('composite'), exitMode(), setCompositeUnderlay(), setCompositeHole(),
 *   hasCompositeUnderlay(), hasCompositeHole(), getCompositeURL(), clearComposite()
 *
 * Emits:
 *   'composite-apply' { overlayUrl, maskDataUrl } — the Block runs the server blend
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }        from '../../Primitives/MpiButton/MpiButton.js';
import { MpiMediaSlot }     from '../../Compounds/MpiMediaSlot/MpiMediaSlot.js';
import { MpiMaskStrip }     from '../../Compounds/MpiMaskStrip/MpiMaskStrip.js';
import { qs }               from '../../../utils/dom.js';

/**
 * Per-front-end differences as a table, the same shape `MpiMaskStrip.DESTINATIONS` and
 * `MpiToolOptionsShapes.MOUNTS` use — a third front end should be a row, never another
 * branch through setup().
 */
const MOUNTS = {
    paintComp: {
        // The brush IS the cut here, so the strip arms it.
        brush: true,
        maskSlot: false,
        hint: 'Erase the top image to reveal the one underneath. Paint it back to undo the cut.',
    },
    maskComp: {
        // The cut arrives whole from the mask slot; a brush on top of it would be a
        // second, worse way to do the same thing.
        brush: false,
        maskSlot: true,
        hint: 'The mask slot supplies the cut: white takes the image underneath.',
    },
};

export const MpiToolOptionsComposite = ComponentFactory.create({
    name: 'MpiToolOptionsComposite',
    css: ['js/components/Organisms/MpiToolOptionsComposite/MpiToolOptionsComposite.css'],

    template: () => `
        <div class="mpi-tool-options-composite">
            <div class="mpi-tool-options-composite__hint" id="hint-slot"></div>
            <div class="mpi-tool-options-composite__slots">
                <div class="mpi-tool-options-composite__slot" id="image-slot"></div>
                <div class="mpi-tool-options-composite__slot" id="mask-slot"></div>
            </div>
            <div class="mpi-tool-options-composite__row" id="commit-slot"></div>
            <div id="strip-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;
        // An unknown mode would composite into the wrong front end while the rail said
        // otherwise, so it fails loudly — the same ruling MpiToolOptionsShapes made.
        const mount = MOUNTS[props.mode];
        if (!mount) throw new Error(`MpiToolOptionsComposite: unknown mode "${props.mode}"`);
        const clip = props.clipboard || {};
        const _children = [];

        viewer.el.enterMode?.('composite');
        qs('#hint-slot', el).textContent = mount.hint;

        // ── The image slot — what shows through the cut ──────────────────────

        const imageSlot = MpiMediaSlot.mount(qs('#image-slot', el), {
            label: 'Image underneath',
            empty: 'Copy an entry, then paste',
            canPaste: () => !!clip.hasImage?.(),
            readPaste: () => clip.getImage?.() || null,
        });
        imageSlot.on('change', async ({ url }) => {
            const ok = await viewer.el.setCompositeUnderlay?.(url || null);
            // A slot that shows a thumbnail the canvas could not load is the exact
            // silent failure the preview contract exists to prevent — empty it back.
            if (url && !ok) imageSlot.el.clear();
            _syncApply();
        });
        _children.push(imageSlot);

        // ── The mask slot — Mask Comp only ───────────────────────────────────

        const maskHost = qs('#mask-slot', el);
        let maskSlot = null;
        if (mount.maskSlot) {
            maskSlot = MpiMediaSlot.mount(maskHost, {
                label: 'Mask (the cut)',
                empty: 'Copy a mask, then paste',
                canPaste: () => !!clip.hasMask?.(),
                readPaste: () => {
                    const url = clip.getMask?.();
                    return url ? { url, name: 'mask' } : null;
                },
            });
            maskSlot.on('change', async ({ url }) => {
                if (url) await viewer.el.setCompositeHole?.(url);
                else viewer.el.clearComposite?.();
                _syncApply();
            });
            _children.push(maskSlot);
        } else {
            // REMOVED, not hidden: a class carrying `display` outranks `[hidden]`,
            // which is how inert rows have reached the screen here before (MPI-382).
            maskHost.remove();
        }

        // ── Apply ────────────────────────────────────────────────────────────
        // Runs the SAME full-res server route the retired modal used
        // (/project/composite-media). The result never round-trips as base64.

        const applyBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Apply', icon: 'check', size: 'sm', variant: 'primary',
            disabled: true,
            info: 'Blend the two images and append the result as a new entry',
        });
        qs('#commit-slot', el).appendChild(applyBtn.el);
        _children.push(applyBtn);

        /**
         * Apply needs BOTH halves: something underneath, and a cut to show it through.
         * Disabled rather than inert — a button that swallows its own click is the
         * silent-failure shape this codebase keeps paying for (MPI-375).
         */
        function _syncApply() {
            const ready = !!imageSlot.el.getValue() && !!viewer.el.hasCompositeHole?.();
            applyBtn.el.setDisabled?.(!ready);
        }

        applyBtn.on('click', () => {
            const overlay = imageSlot.el.getValue();
            const maskDataUrl = viewer.el.getCompositeURL?.();
            if (!overlay?.url || !maskDataUrl) return;
            emit('composite-apply', { overlayUrl: overlay.url, maskDataUrl });
        });

        // ── The shared strip ─────────────────────────────────────────────────
        // `dest: 'composite'` points the pair and Clear at the cut and drops the
        // opacity slider — a composite is a hard cut, so a display alpha would make
        // the preview disagree with the file Sharp writes.

        _children.push(MpiMaskStrip.mount(qs('#strip-slot', el), {
            viewer, brush: mount.brush, dest: 'composite',
        }));

        // The cut changes under the brush, not through this component, so Apply's gate
        // is re-read on the canvas' own signal — stroke end, Clear, and an undo step
        // that walked back into a cut. A single callback SLOT rather than a
        // subscription: this panel is rebuilt on every rail switch and the factory's
        // `instance.on()` returns no unsubscribe, so listening would leak one per mount.
        viewer.el.setOnCompositeChange?.(_syncApply);

        _syncApply();

        el.destroy = () => {
            viewer.el.setOnCompositeChange?.(null);
            // Belt and braces: mountOptions() already dropped the preview through the
            // shared seam before destroying us, and both calls are idempotent.
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
