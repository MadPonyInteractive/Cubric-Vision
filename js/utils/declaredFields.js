/**
 * declaredFields.js — the ONE renderer for the declared-field vocabulary
 * (`FlowStepField` in js/data/flowsRegistry.js).
 *
 * Extracted from MpiBaseFlow (MPI-580) so a second surface can speak the same
 * dialect without a second implementation. MPI-572 already collapsed two control
 * surfaces inside the flow frame into one for exactly this reason — step fields
 * never reached the payload and defaults were never seeded — so a copy here would
 * be that bug reintroduced one surface further out.
 *
 * Two consumers today: MpiBaseFlow (Flow steps + run slide) and
 * MpiToolOptionsUpscale (a plugin entry's controls). A third is already known:
 * the same capabilities are being duplicated as Flows for beginners, so a control
 * declared once must render identically in both places.
 *
 * BEM stays with the consumer: `block` prefixes every class, so MpiBaseFlow keeps
 * `mpi-base-flow__field*` and its CSS untouched, and a new consumer styles its own
 * block. Nothing moves into a shared stylesheet.
 */

import { ce, on } from './dom.js';
import { MpiRadioGroup } from '../components/Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { clientLogger } from '../services/clientLogger.js';

/**
 * A declared field's numeric value, coerced and held inside its declared bounds.
 * A `min`/`max` that only decorates the widget is a lie the graph pays for — a
 * typed-in seed or width outside the model's range fails the generation, not the
 * input.
 *
 * @param {string|number} raw
 * @param {Object} f  the field declaration
 * @returns {number}
 */
export function fieldNumber(raw, f) {
    let n = Number(raw);
    if (!Number.isFinite(n)) n = Number(f.default) || 0;
    if (f.min != null) n = Math.max(Number(f.min), n);
    if (f.max != null) n = Math.min(Number(f.max), n);
    return n;
}

/**
 * Map a field's UI value onto the range the GRAPH wants, when the declaration
 * hides one (`mapTo: [lo, hi]`).
 *
 * The widget shows and stores the declared `min..max` (typically 0–1) — that is
 * what persists and what a restored control seeds from, so no inverse mapping is
 * ever needed. The hidden range is applied HERE, at payload time, once.
 *
 * The mechanism owns the primitive; the declaration owns the numbers. A denoise
 * slider reading 0–1 over sigmas 0.50–0.85 is the plugin's business, not this
 * file's.
 *
 * @param {Object} f  the field declaration
 * @param {*} v       the UI value
 * @returns {*}       the graph value, or `v` untouched when no mapping is declared
 */
export function mapDeclaredValue(f, v) {
    if (!Array.isArray(f?.mapTo) || f.mapTo.length !== 2) return v;
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    const [lo, hi] = f.mapTo.map(Number);
    const min = Number(f.min ?? 0);
    const max = Number(f.max ?? 1);
    const t = max === min ? 0 : Math.min(1, Math.max(0, (n - min) / (max - min)));
    return lo + t * (hi - lo);
}

/**
 * The app-wide injection naming law: a declared id prefixed `Input_` names a GRAPH
 * NODE, so it is an injection param rather than a run input. Everything else
 * (`positive`, `negative`) reaches the op by its own id. One predicate, so the two
 * surfaces cannot disagree about where a value lands.
 *
 * @param {string} id
 * @returns {boolean}
 */
export const isInjectionParam = (id) => /^input_/i.test(String(id));

/**
 * Split one surface's declared values into `{inputs, injectionParams}`, applying
 * any hidden `mapTo` range on the way through.
 *
 * @param {Object[]} fields  the declarations (for `mapTo` and nothing else)
 * @param {Object} values    UI values keyed by field id
 * @returns {{inputs: Object, injectionParams: Object}}
 */
export function splitDeclaredValues(fields = [], values = {}) {
    const decls = new Map((fields || []).filter(f => f?.id).map(f => [f.id, f]));
    const inputs = {};
    const injectionParams = {};
    Object.entries(values || {}).forEach(([k, v]) => {
        const mapped = mapDeclaredValue(decls.get(k) || {}, v);
        if (isInjectionParam(k)) injectionParams[k] = mapped; else inputs[k] = mapped;
    });
    return { inputs, injectionParams };
}

/**
 * Render ONE declared field.
 *
 * @param {Object} f      a FlowStepField
 * @param {*} cur         the field's current value, default already applied
 * @param {Function} onChange (val) => void
 * @param {Array<Function>} unsubs  teardown sink — the caller MUST run these
 * @param {Object} [opts]
 * @param {string} [opts.block='mpi-base-flow']  BEM block for every class emitted
 * @param {string} [opts.namespace='field']      radio-group `name` prefix; must be
 *                                               unique per surface or two mounted
 *                                               groups share a selection
 * @returns {HTMLElement|null} null for an unknown type
 */
export function buildField(f, cur, onChange, unsubs, opts = {}) {
    const block = opts.block || 'mpi-base-flow';
    const namespace = opts.namespace || 'field';
    const cls = (el) => `${block}__${el}`;

    const wrap = ce('label', { className: cls('field') });
    if (f.label && f.type !== 'button') {
        const lbl = ce('span', { className: cls('field-label') });
        lbl.textContent = f.label;
        wrap.appendChild(lbl);
    }

    if (f.type === 'select') {
        const sel = ce('select', { className: cls('field-select') });
        (f.options || []).forEach((o) => {
            const opt = ce('option', { value: String(o.v) });
            opt.textContent = o.label ?? String(o.v);
            sel.appendChild(opt);
        });
        if (cur != null) sel.value = String(cur);
        unsubs.push(on(sel, 'change', () => onChange(sel.value)));
        wrap.appendChild(sel);
    } else if (f.type === 'radio') {
        // The only mounted Primitive among the field types, so it is the only one
        // needing a host and a destroy. Worth it: a tier choice read as a <select>
        // hides the alternatives behind a click, and the whole point of a tier is
        // that you compare them (MPI-572).
        const opts_ = f.options || [];
        const find = v => opts_.find(o => String(o.v) === String(v));
        // A seeded value comes off a PERSISTED card, so it may name an option this
        // build no longer has. Fall back rather than render a group with nothing
        // selected while quietly sending the stale value.
        const sel = find(cur) ? cur : f.default;
        // Write the fallback back, same law as the clamped number field: a control
        // that shows one value while sending another is the worst outcome available.
        if (sel !== cur) onChange(sel);
        const host = ce('div');
        const inst = MpiRadioGroup.mount(host, {
            options: opts_.map(o => ({
                label: o.label ?? String(o.v), value: String(o.v), info: o.info,
            })),
            value: String(sel ?? ''),
            name: `${namespace}-${f.id}`,
            size: 'sm',
            ...(Number.isFinite(f.columns) ? { columns: f.columns } : {}),
        });
        // `note` is the ALWAYS-VISIBLE half of an option's copy; `info` is a
        // status-bar hover that vanishes with the pointer. A tier's cost has to be
        // legible without hunting for it.
        const note = ce('span', { className: cls('field-note') });
        const paint = (v) => { note.textContent = find(v)?.note || ''; };
        paint(sel);
        inst.on('select', ({ value }) => {
            const o = find(value);
            if (!o) return;
            paint(o.v);
            // Emit the option's ORIGINAL `v`, never the DOM string: a graph param
            // like Input_Tier is an int, and "1" reaching MpiAnySwitch as text is a
            // silent wrong-branch.
            onChange(o.v);
        });
        unsubs.push(() => inst?.el?.destroy?.());
        const col = ce('div', { className: cls('field-radio') });
        col.appendChild(host);
        if (opts_.some(o => o.note)) col.appendChild(note);
        wrap.appendChild(col);
    } else if (f.type === 'button') {
        const btn = ce('button', { className: cls('field-button'), type: 'button' });
        btn.textContent = f.label || f.id;
        unsubs.push(on(btn, 'click', () => onChange(true)));
        wrap.appendChild(btn);
    } else if (f.type === 'toggle') {
        const box = ce('input', { type: 'checkbox', className: cls('field-toggle') });
        box.checked = Boolean(cur);
        unsubs.push(on(box, 'change', () => onChange(box.checked)));
        wrap.appendChild(box);
    } else if (f.type === 'number') {
        const inp = ce('input', { type: 'number', className: cls('field-input') });
        if (f.min != null) inp.min = String(f.min);
        if (f.max != null) inp.max = String(f.max);
        if (f.step != null) inp.step = String(f.step);
        if (cur != null) inp.value = String(cur);
        unsubs.push(on(inp, 'change', () => {
            const n = fieldNumber(inp.value, f);
            // Write the clamped value back: a field that silently sends a different
            // number than it shows is worse than a rejected run.
            inp.value = String(n);
            onChange(n);
        }));
        wrap.appendChild(inp);
    } else if (f.type === 'slider') {
        const rng = ce('input', { type: 'range', className: cls('field-range') });
        rng.min = String(f.min ?? 0);
        rng.max = String(f.max ?? 100);
        if (f.step != null) rng.step = String(f.step);
        rng.value = String(fieldNumber(cur ?? f.min ?? 0, f));
        // A slider with no readout is a guess. The number IS the control. It shows
        // the DECLARED value, never the mapped one — `mapTo` is hidden by design.
        const out = ce('span', { className: cls('field-value') });
        out.textContent = rng.value;
        unsubs.push(on(rng, 'input', () => {
            out.textContent = rng.value;
            onChange(Number(rng.value));
        }));
        // Range + readout share one line in BOTH layouts — the stacked column would
        // otherwise drop the number onto its own row.
        const bar = ce('div', { className: cls('field-slider') });
        bar.appendChild(rng);
        bar.appendChild(out);
        wrap.appendChild(bar);
    } else if (f.type === 'text') {
        const multi = Number(f.rows) > 1;
        const inp = ce(multi ? 'textarea' : 'input', { className: cls('field-text') });
        if (multi) inp.rows = Number(f.rows); else inp.type = 'text';
        if (f.placeholder) inp.placeholder = f.placeholder;
        inp.value = cur != null ? String(cur) : '';
        unsubs.push(on(inp, 'input', () => onChange(inp.value)));
        wrap.appendChild(inp);
    } else {
        clientLogger.warn('declaredFields', `unknown field type "${f.type}" — skipping`);
        return null;
    }
    return wrap;
}
