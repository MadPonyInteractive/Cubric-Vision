/**
 * MpiVolumeControl — a mute button with a vertical volume flyout (Compound).
 *
 * The flyout opens UPWARD on hover or keyboard focus of the whole control, in CSS
 * alone (`:hover, :focus-within` on the root) — no JS, no timers, no portal. The
 * ROOT owns the hover rather than the button, so the pointer can travel from the
 * button into the slider without the flyout closing.
 *
 * It owns NO media element, on purpose (MPI-731). The video bar has a real `muted`
 * flag; the gallery treats volume 0 as the mute. Only the consumer knows what a
 * mute means, so this reports gestures and is told the resulting state back —
 * the same split that lets `MpiWaveform` be mounted by a card and a player.
 * Step, wheel and persistence differ per consumer and stay consumer-side.
 *
 * The slider is `MpiProgressBar` 0–100, NOT `MpiFader`: every consumer binds it
 * straight to `HTMLMediaElement.volume`, which is linear and clamped to 1.0.
 * `MpiFader` is a dB mix gain with +12 dB of boost above a unity detent — its
 * top half would do nothing here. Do not "fix" this.
 *
 * Props:
 *   value:  number  — initial volume 0..100 (default 100)
 *   muted:  boolean — initial mute state (default false)
 *   step:   number  — slider step (default 1)
 *   wheel:  boolean — mouse wheel adjusts the slider (default false)
 *   info:   string  — mute button tooltip (default 'Mute/Unmute'); a consumer
 *                     that binds a hotkey names it here
 *
 * Instance API (on el):
 *   setValue(v)   — move the slider; never emits (the consumer is the truth)
 *   setMuted(b)   — show the muted state; never emits
 *   getValue()    — current slider value
 *   destroy()
 *
 * Emits (component-local):
 *   'input'       { value }  — while dragging
 *   'change'      { value }  — on release
 *   'mute-toggle' { muted }  — the state the user asked for
 */

import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { qs } from '../../../utils/dom.js';

export const MpiVolumeControl = ComponentFactory.create({
    name: 'MpiVolumeControl',
    css: ['js/components/Compounds/MpiVolumeControl/MpiVolumeControl.css'],

    template: () => `
        <div class="mpi-volume-control">
            <div data-mount="mute"></div>
            <div class="mpi-volume-control__flyout">
                <div class="mpi-volume-control__slider" data-mount="slider"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        let _muted = props.muted === true;

        const muteBtn = MpiButton.mount(qs('[data-mount="mute"]', el), {
            icon: 'volumeHigh', iconActive: 'volumeOff', size: 'sm',
            info: props.info || 'Mute/Unmute', active: _muted,
        });

        const slider = MpiProgressBar.mount(qs('[data-mount="slider"]', el), {
            orientation: 'vertical', min: 0, max: 100,
            step: props.step !== undefined ? props.step : 1,
            value: props.value !== undefined ? props.value : 100,
            suffix: '%', interactive: true, handle: true,
            wheel: props.wheel === true, variant: 'primary',
        });
        const input = qs('.mpi-progress__input', slider.el);

        // MpiButton flips its own `is-active` on click (it has `iconActive`); that is
        // the request. The consumer confirms or overrides it through setMuted().
        muteBtn.on('click', () => {
            _muted = !_muted;
            emit('mute-toggle', { muted: _muted });
        });

        slider.on('input',  ({ value }) => emit('input',  { value }));
        slider.on('change', ({ value }) => emit('change', { value }));

        el.setValue = (v) => slider.el.setValueQuiet(v);
        el.setMuted = (b) => { _muted = !!b; muteBtn.el.setActive(_muted); };
        el.getValue = () => parseFloat(input.value);

        el.destroy = () => {
            try { muteBtn.destroy(); } catch (_) { /* noop */ }
            try { slider.destroy(); } catch (_) { /* noop */ }
        };
    },
});
