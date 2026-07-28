/**
 * MpiMaskStrip — Compound: the shared bottom strip of every mask tool (MPI-371).
 *
 * Paint / erase toggle · invert · clear · opacity. Every tool in the mask family
 * mounts this at the bottom of its stack, so the strip is changed in ONE place.
 * The paint + erase pair is OPTIONAL: tools where a brush makes no sense (Points)
 * mount it with `brush: false` and get invert / clear / opacity alone. The B / E
 * hotkeys are bound only when the pair is shown.
 *
 * Settings live under the `mask` tool key — shared by the whole family, so
 * opacity and invert survive a swap between mask tools.
 *
 * Props:
 * @param {object}  viewer          - MpiCanvasViewer instance
 * @param {boolean} [brush=true]    - show the paint / erase pair and bind B / E
 *
 * Requires on viewer.el:
 *   setMaskBrushMode('brush'|'eraser'), setMaskInverted(), isMaskInverted(),
 *   clearMask(), setMaskOpacity()
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton }       from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup }   from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs, on }          from '../../../utils/dom.js';
import { Hotkeys }         from '../../../managers/hotkeyManager.js';
import { Events }          from '../../../events.js';
import { state }           from '../../../state.js';
import { getToolSettings } from '../../../data/projectModel.js';

const DEFAULTS = { opacity: 0.7, inverted: false };

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
        const _children = [];
        const _unbinds  = [];

        const settings = { ...DEFAULTS, ...getToolSettings(state.currentProject || {}, 'mask', DEFAULTS) };
        const row = qs('#strip-row', el);

        // ── Paint / erase — optional pair ────────────────────────────────────

        if (showBrush) {
            const brushRadio = MpiRadioGroup.mount(document.createElement('div'), {
                options: [
                    { label: 'Paint', value: 'brush',  icon: 'brush',  info: 'Paint mask (B)' },
                    { label: 'Erase', value: 'eraser', icon: 'eraser', info: 'Erase mask (E)' },
                ],
                value: 'brush',
                name: 'mask-brush-mode',
                iconOnly: true,
            });
            brushRadio.on('select', ({ value }) => viewer.el.setMaskBrushMode?.(value));
            row.appendChild(brushRadio.el);
            _children.push(brushRadio);

            _unbinds.push(Hotkeys.bind('mask.brush.toolbar',  () => brushRadio.el.setValue('brush')));
            _unbinds.push(Hotkeys.bind('mask.eraser.toolbar', () => brushRadio.el.setValue('eraser')));
        }

        // ── Invert / clear — on every tool ───────────────────────────────────

        const invertBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'invert', size: 'sm', variant: 'secondary', info: 'Invert mask display',
        });
        const clearBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'trash', size: 'sm', variant: 'secondary', info: 'Clear mask',
        });
        invertBtn.el.classList.add('mpi-mask-strip__invert');
        row.appendChild(invertBtn.el);
        row.appendChild(clearBtn.el);

        const _applyInvert = (v) => {
            viewer.el.setMaskInverted?.(v);
            invertBtn.el.classList.toggle('is-active', v);
            invertBtn.el.classList.toggle('mpi-mask-strip__invert--on', v);
        };
        _applyInvert(!!settings.inverted);

        invertBtn.on('click', () => {
            const next = !viewer.el.isMaskInverted?.();
            _applyInvert(next);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'inverted', value: next });
        });
        clearBtn.on('click', () => viewer.el.clearMask?.());
        _children.push(invertBtn, clearBtn);

        // ── Opacity ──────────────────────────────────────────────────────────

        const opacityInput = qs('#opacity-input', el);
        const opacityVal   = qs('#opacity-val', el);
        const initialOpacity = typeof settings.opacity === 'number' ? settings.opacity : DEFAULTS.opacity;
        const _applyOpacity = (pct) => {
            viewer.el.setMaskOpacity?.(Math.max(0, Math.min(1, pct / 100)));
            opacityVal.textContent = `${Math.round(pct)}%`;
        };
        opacityInput.value = String(Math.round(initialOpacity * 100));
        _applyOpacity(Number(opacityInput.value));
        const _offOpacity = on(opacityInput, 'input', () => {
            const pct = Number(opacityInput.value);
            _applyOpacity(pct);
            Events.emit('settings:tool:update', { toolKey: 'mask', key: 'opacity', value: pct / 100 });
        });

        // ── Lifecycle ────────────────────────────────────────────────────────

        el.destroy = () => {
            _unbinds.forEach(fn => fn?.());
            _offOpacity();
            _children.forEach(c => c.destroy?.());
        };
    },
});
