import { ComponentFactory } from '../../factory.js';
import { qs } from '/js/utils/dom.js';

/**
 * MpiLevelMeter — audio level meter Primitive (MPI-573).
 *
 * A dBFS meter with fixed colour zones: green below `warn`, amber up to
 * `danger`, rose above it. The zones are ONE css gradient painted twice — a dim
 * copy for the whole track and a lit copy clipped to the current level — so a
 * colour always sits at the same dB position regardless of the level. Anything
 * that recoloured a single fill per frame would move the boundary with the
 * signal, which is the one thing a meter must not do.
 *
 * 0 dBFS is the digital clip point, so `danger` defaults there: the rose band is
 * not "loud", it is "already distorting", and the headroom above it exists to
 * show HOW far past.
 *
 * Feed it from an AnalyserNode's FLOAT time-domain data. `getByteTimeDomainData`
 * clamps at ±1, so a boosted signal reads exactly 0.0 dB and the rose band can
 * never be reached — the meter would silently lie about the case it exists for.
 *
 * Props:
 * @param {'horizontal'|'vertical'} [orientation='horizontal'] - Bar direction
 * @param {number} [min=-70]  - dBFS at the empty end
 * @param {number} [max=12]   - dBFS at the full end
 * @param {number} [warn=-12] - dBFS where amber starts
 * @param {number} [danger=0] - dBFS where rose starts (the clip point)
 * @param {boolean} [showValue=true] - Show the numeric dB readout
 *
 * Instance methods (on instance.el):
 *   setDb(db)            — paint an absolute dBFS value
 *   setPeak(linear)      — paint a 0..n linear sample peak (converted to dBFS)
 *   reset()              — back to silence
 */
export const MpiLevelMeter = ComponentFactory.create({
    name: 'MpiLevelMeter',
    css: ['js/components/Primitives/MpiLevelMeter/MpiLevelMeter.css'],

    template: (props) => {
        const orientation = props.orientation === 'vertical' ? 'vertical' : 'horizontal';
        const min = props.min !== undefined ? props.min : -70;
        const max = props.max !== undefined ? props.max : 12;
        const warn = props.warn !== undefined ? props.warn : -12;
        const danger = props.danger !== undefined ? props.danger : 0;
        const showValue = props.showValue !== false;

        const pct = (db) => ((db - min) / (max - min)) * 100;
        // Hard stops, not a blend: a soft ramp makes "where does red start" a
        // matter of opinion, and the user is being asked to stay out of it.
        const angle = orientation === 'vertical' ? '0deg' : '90deg';
        const gradient = `linear-gradient(${angle},`
            + ` var(--accent-ok) 0 ${pct(warn).toFixed(2)}%,`
            + ` var(--accent-warn) ${pct(warn).toFixed(2)}% ${pct(danger).toFixed(2)}%,`
            + ` var(--accent-heat) ${pct(danger).toFixed(2)}% 100%)`;

        const empty = orientation === 'vertical' ? 'inset(100% 0 0 0)' : 'inset(0 100% 0 0)';
        const valueHtml = showValue
            ? '<span class="mpi-level-meter__value">-∞ dB</span>'
            : '';

        return `<div class="mpi-level-meter mpi-level-meter--${orientation}">
            <div class="mpi-level-meter__track">
                <div class="mpi-level-meter__zones" style="background: ${gradient}"></div>
                <div class="mpi-level-meter__zones mpi-level-meter__zones--lit"
                     style="background: ${gradient}; clip-path: ${empty}"></div>
            </div>
            ${valueHtml}
        </div>`;
    },

    setup: (el, props) => {
        const vertical = props.orientation === 'vertical';
        const min = props.min !== undefined ? props.min : -70;
        const max = props.max !== undefined ? props.max : 12;
        const lit = qs('.mpi-level-meter__zones--lit', el);
        const valueEl = qs('.mpi-level-meter__value', el);

        el.setDb = (db) => {
            const clamped = Math.max(min, Math.min(max, db));
            const hidden = (100 - ((clamped - min) / (max - min)) * 100).toFixed(2);
            lit.style.clipPath = vertical
                ? `inset(${hidden}% 0 0 0)`
                : `inset(0 ${hidden}% 0 0)`;
            if (valueEl) {
                valueEl.textContent = db <= min
                    ? '-∞ dB'
                    : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
            }
        };

        // -Infinity for a digital-silence buffer, which setDb floors at `min`.
        el.setPeak = (linear) => el.setDb(20 * Math.log10(Math.max(linear, 0) || 0));

        el.reset = () => el.setDb(-Infinity);
    },
});

/**
 * Drive a meter from an AnalyserNode until the returned stop function is called.
 *
 * Lives here rather than in each caller because the recorder and the Settings mic
 * test need the identical loop, and a meter that reads differently in the place
 * you set the gain than in the place you record is worse than no meter.
 *
 * PEAK, not RMS: the meter's job is to say "you are being heard" and "you are
 * clipping", and RMS under-reads both on speech.
 *
 * @param {AnalyserNode} analyser
 * @param {HTMLElement} meterEl - An MpiLevelMeter instance's `el`.
 * @returns {() => void} Stops the loop and returns the meter to silence.
 */
export function meterAnalyser(analyser, meterEl) {
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let live = true;
    const step = () => {
        if (!live) return;
        analyser.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i]);
            if (v > peak) peak = v;
        }
        meterEl.setPeak(peak);
        raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
        live = false;
        cancelAnimationFrame(raf);
        meterEl.reset();
    };
}
