/**
 * MpiMaskStrip — Compound: the shared bottom strip of every mask tool (MPI-371).
 *
 * Paint / erase toggle · invert · B/W view · clear · opacity. Every tool in the
 * mask family mounts this at the bottom of its stack, so the strip is changed in
 * ONE place. The paint + erase pair is OPTIONAL: tools where a brush makes no
 * sense (Points, Detect) mount it with `brush: false`. The B / E hotkeys are
 * bound only when the pair is shown, and that same prop DISARMS canvas painting
 * for the tool (MPI-381) — otherwise a drag would paint on a tool that offers no
 * brush, which is exactly the incoherence the split removed.
 *
 * Settings live under the `mask` tool key — shared by the whole family, so
 * opacity, invert and the B/W view survive a swap between mask tools.
 *
 * MPI-375: the strip drives a DESTINATION. `dest: 'mask'` (default) is everything
 * above; `dest: 'paint'` points the same controls at the RGBA paint layer and drops
 * the two mask-only display toggles; `dest: 'composite'` (MPI-373) points them at the
 * composite cut and also drops the opacity slider. See `DESTINATIONS` — a new
 * destination is a new row there, never a new branch in `setup()`.
 *
 * Props:
 * @param {object}  viewer            - MpiCanvasViewer instance
 * @param {boolean} [brush=true]      - show the paint / erase pair, bind B / E, arm painting
 * @param {'mask'|'paint'|'composite'} [dest='mask'] - which layer the controls drive
 *
 * Requires on viewer.el, per destination:
 *   mask      — setMaskBrushMode('brush'|'eraser'), setMaskInverted(), isMaskInverted(),
 *               setMaskBwView(), isMaskBwView(), setMaskPaintEnabled(),
 *               clearMask(), setMaskOpacity()
 *   paint     — setPaintBrushMode('brush'|'eraser'), setPaintEnabled(),
 *               clearPaint(), setPaintOpacity()
 *   composite — setCompositeBrushMode('brush'|'eraser'), setCompositeEnabled(),
 *               clearComposite()  (no opacity — the cut is hard)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }       from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup }   from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs, on }          from '../../../utils/dom.js';
import { Hotkeys }         from '../../../managers/hotkeyManager.js';
import { Events }          from '../../../events.js';
import { state }           from '../../../state.js';
import { getToolSettings } from '../../../data/projectModel.js';

const DEFAULTS = { opacity: 0.7, inverted: false, bwView: false };

/**
 * The strip drives one DESTINATION (MPI-375). Mask and paint share the brush pair,
 * the opacity slider and the settings persistence; they differ only in which viewer
 * methods those controls call and whether the mask-only display toggles exist.
 *
 * A name table rather than `if (isPaint)` scattered through setup(): the strip must
 * not grow a branch per destination, or MPI-368's shape mounts turn it into a
 * switch statement. Adding a destination is adding a row here.
 *
 * `invert` and `bwView` are display toggles for a BINARY mask — "show the mask
 * inverted", "show it opaque in black and white". Neither has a meaning for real
 * colour, so paint declares `maskDisplayToggles: false` and they are not rendered.
 * Hiding them with `[hidden]` would not be enough anyway: a class carrying `display`
 * outranks the UA sheet's `[hidden] { display: none }`, which is exactly how three
 * inert slider rows once reached the screen (MPI-382).
 */
const DESTINATIONS = {
    mask: {
        settingsKey: 'mask',
        setEnabled: 'setMaskPaintEnabled',
        setBrushMode: 'setMaskBrushMode',
        setOpacity: 'setMaskOpacity',
        clear: 'clearMask',
        paintInfo: 'Paint mask (B)',
        eraseInfo: 'Erase mask (E)',
        clearInfo: 'Clear mask',
        radioName: 'mask-brush-mode',
        maskDisplayToggles: true,
    },
    paint: {
        settingsKey: 'paint',
        setEnabled: 'setPaintEnabled',
        setBrushMode: 'setPaintBrushMode',
        setOpacity: 'setPaintOpacity',
        clear: 'clearPaint',
        paintInfo: 'Paint colour (B)',
        eraseInfo: 'Erase paint (E)',
        clearInfo: 'Clear paint',
        radioName: 'paint-brush-mode',
        maskDisplayToggles: false,
    },
    /**
     * MPI-373. The pair means the OPPOSITE of what it means everywhere else — the
     * eraser cuts the top image away to reveal the slot image, the brush paints it
     * back — so only the labels change; `CompositeManager.paint()` owns the
     * inversion and this table stays a table.
     *
     * NO OPACITY SLIDER. The other two destinations have a display alpha that means
     * something (how strongly to tint an annotation, how strongly to flatten a
     * layer). A composite is a hard cut: the reveal shows the result, and a slider
     * ghosting it would make the preview disagree with the file Sharp writes.
     */
    composite: {
        settingsKey: 'composite',
        setEnabled: 'setCompositeEnabled',
        setBrushMode: 'setCompositeBrushMode',
        setOpacity: null,
        clear: 'clearComposite',
        paintInfo: 'Restore the top image (B)',
        eraseInfo: 'Reveal the image underneath (E)',
        clearInfo: 'Reset the cut',
        radioName: 'composite-brush-mode',
        maskDisplayToggles: false,
        opacitySlider: false,
        // Revealing is the reason the tool exists, so it opens on the eraser. The
        // radio has to be told, or it would show Paint while the canvas cuts.
        defaultBrush: 'eraser',
    },
};

export const MpiMaskStrip = ComponentFactory.create({
    name: 'MpiMaskStrip',
    css: ['js/components/Compounds/MpiMaskStrip/MpiMaskStrip.css'],

    template: () => `
        <div class="mpi-mask-strip">
            <div class="mpi-mask-strip__divider"></div>
            <div class="mpi-mask-strip__row" id="strip-row"></div>
            <div class="mpi-mask-strip__slider-row">
                <div class="mpi-mask-strip__slider-label">
                    <span>Opacity</span>
                    <span id="opacity-val"></span>
                </div>
                <div class="mpi-mask-strip__slider">
                    <input type="range" id="opacity-input" min="0" max="100" step="1" />
                </div>
            </div>
        </div>
    `,

    setup: (el, props) => {
        const { viewer } = props;
        const showBrush = props.brush !== false;
        const dest = DESTINATIONS[props.dest] || DESTINATIONS.mask;
        const _children = [];
        const _unbinds  = [];

        const settings = { ...DEFAULTS, ...getToolSettings(state.currentProject || {}, dest.settingsKey, DEFAULTS) };
        const row = qs('#strip-row', el);

        // Whether this tool paints at all is the same question as whether it
        // shows the pair (MPI-381) — declare it once, here, so a brushless tool
        // cannot paint by dragging on the canvas.
        viewer.el[dest.setEnabled]?.(showBrush);

        // ── Paint / erase — optional pair ────────────────────────────────────

        if (showBrush) {
            const startBrush = dest.defaultBrush || 'brush';
            const brushRadio = MpiRadioGroup.mount(document.createElement('div'), {
                options: [
                    { label: 'Paint', value: 'brush',  icon: 'brush',  info: dest.paintInfo },
                    { label: 'Erase', value: 'eraser', icon: 'eraser', info: dest.eraseInfo },
                ],
                value: startBrush,
                name: dest.radioName,
                iconOnly: true,
            });
            // Push it down too — the radio only reports CHANGES, so a destination
            // whose manager defaults the other way would disagree until first click.
            viewer.el[dest.setBrushMode]?.(startBrush);
            brushRadio.on('select', ({ value }) => viewer.el[dest.setBrushMode]?.(value));
            row.appendChild(brushRadio.el);
            _children.push(brushRadio);

            _unbinds.push(Hotkeys.bind('mask.brush.toolbar',  () => brushRadio.el.setValue('brush')));
            _unbinds.push(Hotkeys.bind('mask.eraser.toolbar', () => brushRadio.el.setValue('eraser')));
        }

        // ── Invert / B-W (mask only) + clear — on every tool ─────────────────

        const invertBtn = dest.maskDisplayToggles ? MpiButton.mount(document.createElement('div'), {
            icon: 'invert', size: 'sm', variant: 'secondary', info: 'Invert mask display',
        }) : null;
        const bwBtn = dest.maskDisplayToggles ? MpiButton.mount(document.createElement('div'), {
            icon: 'mask_bw', size: 'sm', variant: 'secondary',
            info: 'Show the mask in black and white — find and erase stray specks',
        }) : null;
        const clearBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'trash', size: 'sm', variant: 'secondary', info: dest.clearInfo,
        });
        if (invertBtn) {
            invertBtn.el.classList.add('mpi-mask-strip__invert');
            row.appendChild(invertBtn.el);
        }
        if (bwBtn) row.appendChild(bwBtn.el);
        row.appendChild(clearBtn.el);

        const _applyInvert = (v) => {
            if (!invertBtn) return;
            viewer.el.setMaskInverted?.(v);
            invertBtn.el.classList.toggle('is-active', v);
            invertBtn.el.classList.toggle('mpi-mask-strip__invert--on', v);
        };
        _applyInvert(!!settings.inverted);

        invertBtn?.on('click', () => {
            const next = !viewer.el.isMaskInverted?.();
            _applyInvert(next);
            Events.emit('settings:tool:update', { toolKey: dest.settingsKey, key: 'inverted', value: next });
        });
        clearBtn.on('click', () => viewer.el[dest.clear]?.());
        _children.push(invertBtn, bwBtn, clearBtn);

        // ── Opacity ──────────────────────────────────────────────────────────
        // A destination may declare it has no display alpha (composite, MPI-373).
        // The row is REMOVED, never `[hidden]`: a class carrying `display` outranks
        // the UA sheet, which is how three inert slider rows reached the screen in
        // MPI-382. Removing it also means nothing below can wire a dead input.

        // ONE teardown for both shapes of the strip, declared before the early exit
        // below so a later unbind cannot be added to only one of them.
        /** @type {(() => void)|null} */
        let _offOpacity = null;
        el.destroy = () => {
            _unbinds.forEach(fn => fn?.());
            _offOpacity?.();
            // filter(Boolean): the mask-only toggles are null on the paint and
            // composite destinations, and `null.destroy?.()` throws — the optional
            // chain is on `destroy`, not on the child.
            _children.filter(Boolean).forEach(c => c.destroy?.());
        };

        if (dest.opacitySlider === false) {
            qs('.mpi-mask-strip__slider-row', el)?.remove();
            return;
        }

        const opacityInput = qs('#opacity-input', el);
        const opacityVal   = qs('#opacity-val', el);
        const initialOpacity = typeof settings.opacity === 'number' ? settings.opacity : DEFAULTS.opacity;
        const _applyOpacity = (pct) => {
            viewer.el[dest.setOpacity]?.(Math.max(0, Math.min(1, pct / 100)));
            opacityVal.textContent = `${Math.round(pct)}%`;
        };
        opacityInput.value = String(Math.round(initialOpacity * 100));
        _applyOpacity(Number(opacityInput.value));
        _offOpacity = on(opacityInput, 'input', () => {
            const pct = Number(opacityInput.value);
            _applyOpacity(pct);
            Events.emit('settings:tool:update', { toolKey: dest.settingsKey, key: 'opacity', value: pct / 100 });
        });

        // ── Black-and-white mask view (MPI-381) ──────────────────────────────
        // Wired here, after the slider exists: B/W draws the mask opaque, so the
        // opacity slider has nothing to say and goes inert rather than silently
        // doing nothing.

        const _applyBw = (v) => {
            if (!bwBtn) return;
            viewer.el.setMaskBwView?.(v);
            bwBtn.el.classList.toggle('is-active', v);
            bwBtn.el.classList.toggle('mpi-mask-strip__bw--on', v);
            opacityInput.disabled = v;
            el.classList.toggle('mpi-mask-strip--bw', v);
        };
        _applyBw(!!settings.bwView);

        bwBtn?.on('click', () => {
            const next = !viewer.el.isMaskBwView?.();
            _applyBw(next);
            Events.emit('settings:tool:update', { toolKey: dest.settingsKey, key: 'bwView', value: next });
        });

        // Lifecycle: `el.destroy` is declared above the opacity block, so both the
        // full strip and the slider-less one tear down through the same function.
    },
});
