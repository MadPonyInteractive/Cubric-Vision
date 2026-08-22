import { ComponentFactory } from '../../factory.js';
import { qs, on } from '/js/utils/dom.js';

/**
 * MpiFader — dB gain fader Primitive (MPI-604).
 *
 * The counterpart to MpiLevelMeter, and a DIFFERENT dB scale. A fader is
 * `0 dB = unity` — the neutral middle, where the signal passes through
 * untouched, cut to the left/below and boost to the right/above. A level meter
 * is `0 dBFS = full scale` — the ceiling. Reading one as the other is what
 * produced this component: it is why the meter's amber must start BELOW zero
 * and why this control's zero sits in the middle of its travel.
 *
 * The fill is anchored at unity, not at the bottom of the scale, so the bar
 * itself reads as "how much cut" or "how much boost". A fill running from the
 * minimum would make a fader sitting at unity look 83% "full", which means
 * nothing.
 *
 * The detent SNAPS to unity within `snap` dB — but only for pointer drags. A
 * keyboard step is an exact request for a value, so `keydown` turns the detent
 * off: with a 0.1 dB step inside a 1 dB tolerance, a snapping keyboard could
 * never leave unity at all.
 *
 * At the bottom of the scale the fader is OFF: `getGain()` returns exactly 0
 * and the readout shows `-∞ dB`. Without that there is no fader position that
 * actually mutes.
 *
 * Props:
 * @param {'horizontal'|'vertical'} [orientation='horizontal'] - Travel direction
 * @param {number} [min=-60]   - dB at the bottom of the travel (the off position)
 * @param {number} [max=12]    - dB at the top of the travel
 * @param {number} [step=0.1]  - Fader resolution in dB
 * @param {number} [value=0]   - Initial dB
 * @param {number} [unity=0]   - dB the detent snaps to, and the fill's anchor
 * @param {number} [snap=1]    - Snap tolerance in dB either side of unity; 0 disables
 * @param {boolean} [showValue=true] - Show the numeric dB readout
 *
 * Emits `input` (live, while dragging) and `change` (on release), both with
 * `{ db, gain }` — `gain` being the linear multiplier, so a consumer never has
 * to re-derive it.
 *
 * Instance methods (on instance.el):
 *   setDb(db)  — move the fader without emitting (mirrors MpiLevelMeter.setDb)
 *   getDb()    — current dB
 *   getGain()  — current linear multiplier: 0 at the bottom, else 10^(dB/20)
 */

/** Prop defaults resolved identically by template and setup. */
const resolve = (props) => ({
    vertical: props.orientation === 'vertical',
    min: props.min !== undefined ? props.min : -60,
    max: props.max !== undefined ? props.max : 12,
    step: props.step !== undefined ? props.step : 0.1,
    value: props.value !== undefined ? props.value : 0,
    unity: props.unity !== undefined ? props.unity : 0,
    snap: props.snap !== undefined ? props.snap : 1,
});

const format = (db, min) => (db <= min ? '-∞ dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`);

export const MpiFader = ComponentFactory.create({
    name: 'MpiFader',
    css: ['js/components/Primitives/MpiFader/MpiFader.css'],

    template: (props) => {
        const { vertical, min, max, step, value, unity } = resolve(props);
        const showValue = props.showValue !== false;

        const pct = (db) => ((db - min) / (max - min)) * 100;
        const orientation = vertical ? 'vertical' : 'horizontal';
        const valueHtml = showValue
            ? `<span class="mpi-fader__value">${format(value, min)}</span>`
            : '';

        // The unity tick is static: it marks a dB position, so it must not move
        // with the signal any more than the meter's colour boundaries do.
        return `<div class="mpi-fader mpi-fader--${orientation}"
             style="--mpi-fader-unity: ${pct(unity).toFixed(2)}%">
            <div class="mpi-fader__track">
                <div class="mpi-fader__tick"></div>
                <div class="mpi-fader__fill"></div>
                <div class="mpi-fader__handle"></div>
                <input
                    type="range"
                    class="mpi-fader__input"
                    min="${min}"
                    max="${max}"
                    step="${step}"
                    value="${value}"
                >
            </div>
            ${valueHtml}
        </div>`;
    },

    setup: (el, props, emit) => {
        const { min, max, unity, snap } = resolve(props);
        const input = qs('.mpi-fader__input', el);
        const valueEl = qs('.mpi-fader__value', el);

        const pct = (db) => ((db - min) / (max - min)) * 100;
        const gainOf = (db) => (db <= min ? 0 : Math.pow(10, db / 20));

        // Pointer drags feel the detent; a keyboard step does not. See the note
        // in the component doc — a snapping keyboard cannot leave unity.
        let detent = true;

        const paint = (db) => {
            const here = pct(db);
            const anchor = pct(unity);
            const lo = Math.min(here, anchor);
            el.style.setProperty('--mpi-fader-pos', `${here.toFixed(2)}%`);
            el.style.setProperty('--mpi-fader-lo', `${lo.toFixed(2)}%`);
            el.style.setProperty('--mpi-fader-len', `${Math.abs(here - anchor).toFixed(2)}%`);
            if (valueEl) valueEl.textContent = format(db, min);
        };

        const read = () => {
            const raw = parseFloat(input.value);
            const db = detent && snap > 0 && Math.abs(raw - unity) <= snap ? unity : raw;
            if (db !== raw) input.value = db; // the detent is a VALUE, not a paint trick
            return db;
        };

        paint(resolve(props).value);

        on(input, 'pointerdown', () => { detent = true; });
        on(input, 'keydown', () => { detent = false; });

        on(input, 'input', () => {
            const db = read();
            paint(db);
            emit('input', { db, gain: gainOf(db) });
        });

        on(input, 'change', () => {
            const db = read();
            emit('change', { db, gain: gainOf(db) });
        });

        el.setDb = (db) => {
            const clamped = Math.max(min, Math.min(max, db));
            input.value = clamped;
            paint(clamped);
        };

        el.getDb = () => parseFloat(input.value);
        el.getGain = () => gainOf(parseFloat(input.value));
    },
});
