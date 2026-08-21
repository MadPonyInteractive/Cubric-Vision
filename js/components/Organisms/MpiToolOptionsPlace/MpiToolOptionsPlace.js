/**
 * MpiToolOptionsPlace — Organism: the Place tool (MPI-454).
 *
 * THE THIRD COMPOSITE FRONT END, AND THE ONE THAT INVERTS THE STACK. `maskComp` and
 * `paintComp` put the selected entry ON TOP and the slot image underneath, and you cut a
 * hole through the top to reveal it — the right model when the two images share a frame.
 * It is the wrong model for placing a cut-out object. Here the slot image goes ON TOP, at
 * its own size, at a position the user drags, and its OWN ALPHA is the cut: no hole, no
 * mask, nothing to brush. Same group, same slot, same Apply-makes-one-entry contract.
 *
 * ITS OWN COMPONENT, NOT A THIRD ROW IN MpiToolOptionsComposite's `MOUNTS` TABLE. That
 * table is right for two front ends that differ only in where the cut comes from; Place
 * shares no control with them — no brush strip, no cut, no hole gate — so a row would have
 * been a row of `false`s guarding branches nothing else takes.
 *
 * NO CANCEL, matching the sibling: rail-switching away already discards the preview by
 * contract (`docs/masking-tools.md` § The preview contract).
 *
 * THREE GESTURES FILL THE SLOT, and they are three ORIGINS rather than three ways to do
 * one thing — which is the distinction `docs/composite.md` § "One slot" now draws:
 *   · drop a file on the History workspace  → outside the app
 *   · click the empty slot → `MpiMediaPicker` → project media, and the filesystem via its
 *     upload card (settled with the user 2026-08-16 as THE single entry point for a slot)
 *   · right-click → Paste → the `_compositeImage` buffer `Send to Composite` already seeds
 *
 * REMOVE BACKGROUND IS A TOGGLE, NOT A FORCED STEP ON INGEST (user, 2026-08-21). It is a
 * DISPATCH, so auto-running it would make every drop pay a queue round-trip — and the
 * cases that want the background (filling a monitor screen, swapping a painting on a wall,
 * a cut-out that arrived already cut out) would pay it for nothing with no way back.
 * Toggling it off restores the original pixels from memory, never a second dispatch.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 * @param {'placeComp'} mode - which mount this is (one, today; kept for the registry's shape)
 * @param {object} [clipboard] - `{ hasImage(), getImage() }` — the Send to Composite buffer
 * @param {object} [place] - MpiGroupHistoryBlock's Place accessors:
 *   `{ getImage(), setImage(v), removeBackground(url) }`. Accessors for the same reason
 *   `clipboard` is: the panel mounts once and a DROP changes the buffer under it.
 *
 * Requires on viewer.el:
 *   enterMode('composite'), exitMode(), setCompositeEnabled(), setShapeMode(),
 *   clearShape(), resetShape(), setPlaceImage(), hasPlaceImage(), applyPlace()
 *
 * Instance API (on el):
 *   el.setSlotImage(v) — fill the slot from outside. A drop while this tool is ALREADY
 *     open does not remount the panel (`_activate()` returns early on an unchanged mode),
 *     so without this the second drop of a session would land nowhere.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }        from '../../Primitives/MpiButton/MpiButton.js';
import { MpiCheckbox }      from '../../Primitives/MpiCheckbox/MpiCheckbox.js';
import { MpiMediaSlot }     from '../../Compounds/MpiMediaSlot/MpiMediaSlot.js';
import { MpiMediaPicker }   from '../../Compounds/MpiMediaPicker/MpiMediaPicker.js';
import { qs }               from '../../../utils/dom.js';

const HINT = 'Drag the image or its handles. Shift keeps its proportions, Alt over a handle rotates around it.';
const EMPTY = 'Click to choose, drop a file, or right-click to paste';
const NO_IMAGE = 'Choose an image to place, then drag it over this entry.';
const BAD_IMAGE = 'That image could not be loaded — the slot was emptied.';
const CUTTING = 'Removing the background…';
const CUT_FAILED = 'Background removal failed — the original image is still in the slot.';

export const MpiToolOptionsPlace = ComponentFactory.create({
    name: 'MpiToolOptionsPlace',
    css: ['js/components/Organisms/MpiToolOptionsPlace/MpiToolOptionsPlace.css'],

    template: () => `
        <div class="mpi-tool-options-place">
            <div class="mpi-tool-options-place__hint" id="hint-slot"></div>
            <div class="mpi-tool-options-place__slots">
                <div class="mpi-tool-options-place__slot" id="image-slot"></div>
            </div>
            <div class="mpi-tool-options-place__row" id="bg-slot"></div>
            <div class="mpi-tool-options-place__row" id="commit-slot"></div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const clip = props.clipboard || {};
        const place = props.place || {};
        const _children = [];
        let _picker = null;

        // Composite is a canvas MODE (it needs its own brush ownership), but Place has no
        // brush at all — so enter the mode and immediately disarm the cut brush, or a drag
        // that misses a handle would cut a hole and the ring would follow the cursor.
        // Asserted on mount rather than restored on destroy, which is the discipline
        // `MpiMaskStrip` already follows for the other two front ends.
        viewer.el.enterMode?.('composite');
        viewer.el.setCompositeEnabled?.(false);
        // Arming the gizmo is what routes the pointer to it. `'place'` is a third
        // destination on the SAME ShapeManager the two shape tools use, so the handles,
        // the shape-local hit testing, Shift's aspect lock and Alt-rotate are inherited
        // rather than reimplemented — and the two gizmos can never drift apart.
        viewer.el.setShapeMode?.('place');

        const hintEl = qs('#hint-slot', el);
        /** The image as the user supplied it. Kept so the toggle has something to go back to. */
        let _original = null;
        /** Its background-removed twin, cached so a second toggle-on costs no dispatch. */
        let _cutout = null;
        let _busy = false;
        let _badImage = false;
        let _cutFailed = false;

        /**
         * The hint line doubles as the error surface, same ruling as the sibling panel:
         * every way this tool can fail is otherwise silent — a slot renders its thumbnail
         * whether or not the canvas accepted the URL, and a failed background removal
         * leaves the original in place, which looks exactly like a toggle that did
         * nothing. Derived from flags rather than written by each caller, because the slot
         * load and the dispatch both resolve asynchronously and a `_say(msg)` API would let
         * whichever landed second erase the other one's reason.
         */
        function _say() {
            hintEl.textContent = _badImage ? BAD_IMAGE
                : _busy ? CUTTING
                : _cutFailed ? CUT_FAILED
                : _original ? HINT
                : NO_IMAGE;
        }

        // ── The slot — the image being stamped ───────────────────────────────

        const imageSlot = MpiMediaSlot.mount(qs('#image-slot', el), {
            label: 'Image to place',
            empty: EMPTY,
            canPaste: () => !!clip.hasImage?.(),
            readPaste: () => clip.getImage?.() || null,
            onEmptyClick: () => _openPicker(),
        });
        _children.push(imageSlot);

        /**
         * The picker is the slot's second origin: project media the user is not currently
         * looking at, plus the filesystem through its own upload card. It portals to
         * document.body and tears itself down on either outcome, so it never rides this
         * panel's lifecycle — but a rail switch mid-pick would still leave it orphaned,
         * which is what `destroy()` below covers.
         */
        function _openPicker() {
            _picker?.el?.destroy?.();
            _picker = MpiMediaPicker.mount(document.createElement('div'), {
                mediaType: 'image',
                onPick: ({ filePath }) => imageSlot.el.setValue({ url: filePath }),
                // The upload card. `place.importFile` runs the SAME uploadMediaFile a drop
                // does, so a file reaches the slot identically whichever surface brought it.
                onImport: (files) => { if (files?.[0]) place.importFile?.(files[0]); },
            });
            const close = () => { _picker?.el?.destroy?.(); _picker = null; };
            _picker.el.addEventListener('pick', close);
            _picker.el.addEventListener('import', close);
            _picker.el.addEventListener('cancel', close);
            _picker.el.show();
        }

        /**
         * Point the canvas at a value and refresh the gate.
         * @param {{url: string, name?: string}|null} value
         * @param {boolean} reseed re-open the gizmo at this image's proportions. FALSE for
         *   the background toggle: it swaps the pixels of the SAME object for a cut-out of
         *   identical dimensions, so re-centring there would throw the user's placement
         *   away as a side effect of a checkbox.
         */
        async function _show(value, reseed) {
            const ok = await viewer.el.setPlaceImage?.(value?.url || null, { reseed });
            if (value?.url) {
                _badImage = !ok;
                if (!ok) imageSlot.el.clear();
            }
            _say();
            _syncApply();
        }

        imageSlot.on('change', async ({ url, name }) => {
            _original = url ? { url, name: name || null } : null;
            // A NEW image is a new object, so its cut-out is not the one we cached and the
            // toggle starts over. Re-running BiRefNet under the user because a checkbox
            // happened to be left on is a dispatch they did not ask for (brief, Q5).
            _cutout = null;
            _cutFailed = false;
            bgToggle.el.setChecked(false);
            bgToggle.el.setDisabled(!url);
            await _show(_original, true);
        });

        // ── Remove Background ────────────────────────────────────────────────

        const bgToggle = MpiCheckbox.mount(document.createElement('div'), {
            label: 'Remove background',
            variant: 'switch',
            name: 'place-remove-bg',
            disabled: true,
        });
        qs('#bg-slot', el).appendChild(bgToggle.el);
        _children.push(bgToggle);

        bgToggle.on('change', async ({ checked }) => {
            if (!_original) return;
            _cutFailed = false;
            // OFF is free, and has to be: the original pixels are held right here, so
            // going back never costs a second dispatch (acceptance 7).
            if (!checked) { await _show(_original, false); return; }
            if (_cutout) { await _show(_cutout, false); return; }

            _setBusy(true);
            const cut = await place.removeBackground?.(_original.url);
            _setBusy(false);
            if (!cut?.url) {
                // Say so and put the switch back. A toggle that silently stays on over
                // unchanged pixels is the swallowed-click shape this codebase keeps paying
                // for — the user would go on to Apply believing the background was gone.
                _cutFailed = true;
                bgToggle.el.setChecked(false);
                _say();
                return;
            }
            _cutout = cut;
            await _show(_cutout, false);
        });

        function _setBusy(v) {
            _busy = v;
            bgToggle.el.setDisabled(v || !_original);
            _say();
            _syncApply();
        }

        // ── Apply + re-centre ────────────────────────────────────────────────

        const commitRow = qs('#commit-slot', el);

        const applyBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Apply', icon: 'check', size: 'sm', variant: 'primary',
            disabled: true,
            info: 'Stamp the placed image onto this entry as a new one',
        });
        commitRow.appendChild(applyBtn.el);
        _children.push(applyBtn);
        applyBtn.on('click', () => viewer.el.applyPlace?.());

        // Dragged off screen, the gizmo has no handle left to grab — the same dead end
        // MpiToolOptionsShapes buys its way out of with one button.
        const centreBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'crop', size: 'sm', variant: 'secondary', info: 'Re-centre the image',
        });
        centreBtn.on('click', () => viewer.el.resetShape?.());
        commitRow.appendChild(centreBtn.el);
        _children.push(centreBtn);

        /**
         * Apply needs an image in the slot that the canvas actually accepted, and no
         * dispatch in flight. DISABLED, never inert — a button that swallows its own click
         * is the silent failure MPI-375 paid for.
         */
        function _syncApply() {
            applyBtn.el.setDisabled?.(!(viewer.el.hasPlaceImage?.() && !_busy));
        }

        // A drop that arrives while this tool is already open reaches the slot here.
        el.setSlotImage = (v) => imageSlot.el.setValue(v);

        // Seed from whatever the drop that ARMED this tool left behind (or from an earlier
        // one in the same workspace visit). `takeImage` rather than a plain read would be
        // wrong — a rail switch away and back should show the same slot, not an empty one.
        const seeded = place.getImage?.();
        if (seeded) imageSlot.el.setValue(seeded);
        else { _say(); _syncApply(); }

        el.destroy = () => {
            _picker?.el?.destroy?.();
            _picker = null;
            // Belt and braces: mountOptions() already dropped the preview through the
            // shared seam before destroying us, and every call here is idempotent.
            viewer.el.setShapeMode?.(null);
            viewer.el.clearShape?.();
            viewer.el.exitMode?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
