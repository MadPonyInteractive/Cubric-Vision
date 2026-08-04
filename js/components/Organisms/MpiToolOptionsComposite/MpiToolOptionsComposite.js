/**
 * MpiToolOptionsComposite — Organism: the Composite group (MPI-373).
 *
 * The last card of the MPI-424 taxonomy, and its cleanest example: ONE operation with
 * two front ends. The selected entry is image 1 and sits ON TOP; a slot holds image 2,
 * underneath. `paintComp` cuts the hole live with the brush; `maskComp` takes the same
 * hole from the mask already on the selected entry. Same layer, same preview, same
 * server blend — the only difference is where the cut comes from, which is why this is
 * one component under two modes rather than two components sharing a base.
 *
 * IT REPLACES THE MPI-362 MODAL. That flow selected two entries, required one of them
 * to already carry a mask, and asked Add or Subtract in prose — the blend was invisible
 * while the user decided it, so he ran it three or four times. Nothing about the server
 * side changed; what changed is that he can see it.
 *
 * ONE SLOT, AND IT IS NOT FILLED BY SELECTION (user, 2026-08-04). Right-click the
 * canvas on the entry you want underneath → `Send to Composite`; it lands here on the
 * next mount. Changing the selection used to restart the whole operation, which is why
 * the slot is a buffer and not "the other selected entry".
 *
 * THERE IS NO MASK SLOT. `maskComp` reads the mask already on the selected entry: the
 * user has the whole mask toolkit — brush, detect, points, text, shapes, adjust —
 * pointed at that exact layer, so a second place to paste a mask was a worse way to
 * produce the same pixels.
 *
 * NO PROMPTBOX. Composite is the one group in the taxonomy that drops it: it ends at
 * its own Apply and needs the column for the slot (`docs/masking-tools.md`).
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 * @param {'maskComp'|'paintComp'} mode - which mount this is
 * @param {object} [clipboard] - app-local copy buffer accessors from MpiGroupHistoryBlock:
 *   { hasImage(), getImage() }
 *
 * Requires on viewer.el:
 *   enterMode('composite'), exitMode(), setCompositeUnderlay(), setCompositeHoleFromMask(),
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
        // Nothing to read on mount: the cut starts empty and the brush makes it.
        useEntryMask: false,
        hint: 'Erase the top image to reveal the one underneath. Paint it back to undo the cut.',
    },
    maskComp: {
        // The cut arrives whole from the entry's own mask; a brush on top of it would
        // be a second, worse way to do the same thing.
        brush: false,
        useEntryMask: true,
        hint: 'This entry’s mask is the cut: the masked area takes the image underneath.',
    },
};

/** Shown instead of the hint when the mount cannot do its job — see `_say()`. */
const NO_MASK = 'This entry has no mask. Paint or detect one with the Mask tools first.';
const BAD_IMAGE = 'That image could not be loaded — the slot was emptied.';

export const MpiToolOptionsComposite = ComponentFactory.create({
    name: 'MpiToolOptionsComposite',
    css: ['js/components/Organisms/MpiToolOptionsComposite/MpiToolOptionsComposite.css'],

    template: () => `
        <div class="mpi-tool-options-composite">
            <div class="mpi-tool-options-composite__hint" id="hint-slot"></div>
            <div class="mpi-tool-options-composite__slots">
                <div class="mpi-tool-options-composite__slot" id="image-slot"></div>
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

        const hintEl = qs('#hint-slot', el);
        let _badImage = false;
        let _noMask = false;
        /**
         * The hint line doubles as the error surface. Every way this panel can fail is
         * silent otherwise — a slot renders its own thumbnail whether or not the canvas
         * accepted the URL, and an entry with no mask just leaves Apply greyed with no
         * reason given. That silence is what cost a whole test round on 2026-08-04.
         *
         * Derived from flags rather than written by each caller: the slot seed and the
         * entry-mask read both resolve asynchronously, so a `_say(msg)` API would let
         * whichever landed second erase the other one's reason.
         */
        function _say() {
            hintEl.textContent = _badImage ? BAD_IMAGE : _noMask ? NO_MASK : mount.hint;
        }
        _say();

        // ── The image slot — what shows through the cut ──────────────────────

        const imageSlot = MpiMediaSlot.mount(qs('#image-slot', el), {
            label: 'Image underneath',
            empty: 'Right-click an image → Send to Composite',
            canPaste: () => !!clip.hasImage?.(),
            readPaste: () => clip.getImage?.() || null,
        });
        imageSlot.on('change', async ({ url }) => {
            const ok = await viewer.el.setCompositeUnderlay?.(url || null);
            // A slot that shows a thumbnail the canvas could not load is the exact
            // silent failure the preview contract exists to prevent — empty it back,
            // and SAY SO, or an emptied slot reads as a click that did nothing.
            // Guarded on `url` so the rollback's own `change` (url: null) does not
            // immediately clear the reason it was just given.
            if (url) {
                _badImage = !ok;
                if (!ok) imageSlot.el.clear();
            }
            _say();
            _syncApply();
        });
        _children.push(imageSlot);

        // The panel mounts once per rail switch, so `Send to Composite` (which happens
        // on a different entry, before this tool is open) lands here rather than
        // needing a second paste gesture. Right-click → Paste still works for a
        // re-fill after Clear slot.
        const seeded = clip.getImage?.();
        if (seeded) imageSlot.el.setValue(seeded);

        // ── Mask Comp: the cut is the entry's OWN mask ───────────────────────
        // Read once. There is no brush and no mask tool inside this mount, so the
        // mask cannot change while the panel is up — a subscription would be a
        // listener leak (the factory's `instance.on()` hands back no unsubscribe)
        // paid for an event that cannot fire.

        if (mount.useEntryMask) {
            Promise.resolve(viewer.el.setCompositeHoleFromMask?.()).then((ok) => {
                // A blank mask exports as a blank PNG rather than null, so the hole
                // itself is the real answer — `ok` alone would call an unpainted mask
                // a success and leave Apply greyed with no reason on screen.
                _noMask = !ok || !viewer.el.hasCompositeHole?.();
                _say();
                _syncApply();
            });
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
