/**
 * MpiVolumeControl — a mute button with a vertical volume flyout (Compound).
 *
 * The flyout opens UPWARD on hover or keyboard focus of the whole control, in CSS
 * alone (`:hover, :has(:focus-visible)` on the root) — no JS, no timers, no portal. The
 * ROOT owns the hover rather than the button, so the pointer can travel from the
 * button into the slider without the flyout closing.
 *
 * It owns NO media element, on purpose (MPI-731). The video bar has a real `muted`
 * flag; the gallery treats volume 0 as the mute. Only the consumer knows what a
 * mute means, so this reports gestures and is told the resulting state back —
 * the same split that lets `MpiWaveform` be mounted by a card and a player.
 * Drag step and persistence differ per consumer and stay consumer-side.
 *
 * The WHEEL is not a consumer choice: it is always on, over the button and the
 * flyout alike, at the gallery's speed — WHEEL_STEP per tick whatever the drag
 * step (Fabio, 2026-09-12). A capture listener on the root takes it before the
 * slider's own wheel handler, which is why the slider mounts with `wheel: false`.
 *
 * ZERO READS AS MUTED, like the volume controls people know (Fabio, 2026-09-12):
 * the speaker shows its muted icon at level 0 as well as when muted, and clicking it
 * then brings back the level the lowering gesture started from — as `input`/`change`,
 * never `mute-toggle`, because a mute flag at zero changes nothing anyone can hear.
 *
 * The slider is `MpiProgressBar` 0–100, NOT `MpiFader`: every consumer binds it
 * straight to `HTMLMediaElement.volume`, which is linear and clamped to 1.0.
 * `MpiFader` is a dB mix gain with +12 dB of boost above a unity detent — its
 * top half would do nothing here. Do not "fix" this.
 *
 * Props:
 *   value:  number  — initial volume 0..100 (default 100)
 *   muted:  boolean — initial mute state (default false)
 *   step:   number  — slider drag step (default 1)
 *   info:  string  — mute button tooltip (default 'Mute/Unmute'); a consumer
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
import { qs, on } from '../../../utils/dom.js';

const WHEEL_STEP = 5;
// A pause longer than this between wheel ticks starts a new gesture (the restore snapshot).
const WHEEL_GESTURE_GAP_MS = 400;

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
        const initial = props.value !== undefined ? props.value : 100;
        let _muted = props.muted === true;
        // What a click on a speaker muted BY ZERO brings back: the level the control sat
        // at when the gesture that took it down began.
        // ponytail: pointer + wheel gestures only. Hotkeys arrive through setValue, which
        // cannot tell a drag's echo from a real change, so arrow-down-to-zero restores the
        // last GESTURE level; snapshot in setValue too if that ever matters.
        let _restore = initial > 0 ? initial : 100;
        let _wheelAt = -Infinity;

        const muteBtn = MpiButton.mount(qs('[data-mount="mute"]', el), {
            icon: 'volumeHigh', iconActive: 'volumeOff', size: 'sm',
            info: props.info || 'Mute/Unmute', active: _muted || initial === 0,
        });

        const slider = MpiProgressBar.mount(qs('[data-mount="slider"]', el), {
            orientation: 'vertical', min: 0, max: 100,
            step: props.step !== undefined ? props.step : 1,
            value: initial,
            suffix: '%', interactive: true, handle: true,
            wheel: false, variant: 'primary',
        });
        const input = qs('.mpi-progress__input', slider.el);

        const _value = () => parseFloat(input.value);
        const _paint = () => muteBtn.el.setActive(_muted || _value() === 0);
        const _snapshot = () => { if (_value() > 0) _restore = _value(); };
        const _emitValue = (value) => {
            emit('input',  { value });
            emit('change', { value });
        };

        // MpiButton flips its own `is-active` BEFORE it emits click, so _paint() here has
        // the last word. The consumer confirms or overrides it through setMuted().
        muteBtn.on('click', () => {
            if (_value() === 0) {
                // Muted by zero: bring the level back. A value, not a mute-toggle — the
                // consumer's volume handler unmutes, and a toggle on top would re-mute.
                _muted = false;
                slider.el.setValueQuiet(_restore);
                _paint();
                _emitValue(_restore);
                return;
            }
            _muted = !_muted;
            _paint();
            emit('mute-toggle', { muted: _muted });
        });

        slider.on('input',  ({ value }) => { _paint(); emit('input', { value }); });
        slider.on('change', ({ value }) => emit('change', { value }));

        // Capture, so the snapshot reads the level BEFORE the range jumps to the pointer.
        const offPointer = on(el, 'pointerdown', _snapshot, { capture: true });
        const offWheel = on(el, 'wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.timeStamp - _wheelAt > WHEEL_GESTURE_GAP_MS) _snapshot();
            _wheelAt = e.timeStamp;
            const cur = _value();
            const value = Math.max(0, Math.min(100, cur + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP)));
            if (value === cur) return;
            slider.el.setValueQuiet(value);
            _paint();
            _emitValue(value);
        }, { capture: true, passive: false });

        el.setValue = (v) => { slider.el.setValueQuiet(v); _paint(); };
        el.setMuted = (b) => { _muted = !!b; _paint(); };
        el.getValue = _value;

        el.destroy = () => {
            offPointer();
            offWheel();
            try { muteBtn.destroy(); } catch (_) { /* noop */ }
            try { slider.destroy(); } catch (_) { /* noop */ }
        };
    },
});
