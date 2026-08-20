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
 *
 * EVERY FIELD TYPE MOUNTS AN APP PRIMITIVE (MPI-582). A declaration NAMES a
 * component; it has never replaced one:
 *   select -> MpiDropdown · radio -> MpiRadioGroup · button -> MpiButton ·
 *   toggle -> MpiCheckbox · number, text -> MpiInput · slider -> MpiProgressBar
 *
 * This file used to hand-roll five of those seven as raw DOM, and the framing that
 * allowed it was written down: commit 55461326, "declared controls, so a Flow needs
 * no JS component". A Flow needs no BESPOKE component — it never needed no
 * component. The cost was visible on screen: a declared slider rendered Chromium's
 * native range widget with an `accent-color` tint in every Flow and in the History
 * upscale panel, and the app carried FOUR independent drawings of one slider.
 *
 * So: a consumer block SIZES these into its layout and never restates their fill,
 * border, hover, focus or disabled treatment — anything in a consumer stylesheet
 * that looks like chrome is a bug. A control this vocabulary cannot express is a new
 * Primitive plus a new type in here, never a bare input.
 * `.claude/rules/components.md` § Every UI element is a component.
 */

import { ce, qs } from './dom.js';
import { MpiRadioGroup } from '../components/Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../components/Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiInput } from '../components/Primitives/MpiInput/MpiInput.js';
import { MpiDropdown } from '../components/Primitives/MpiDropdown/MpiDropdown.js';
import { MpiCheckbox } from '../components/Primitives/MpiCheckbox/MpiCheckbox.js';
import { renderIcon } from './icons.js';
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

    // A `<label>` for every type but `toggle`: the other controls own a real focusable
    // field, so the wrapper forwards a click on the caption into it. `MpiCheckbox`
    // renders its OWN `<label>`, and nested labels double-fire the activation — the
    // box would tick and untick on one click. That type gets a plain div.
    const wrap = ce(f.type === 'toggle' ? 'div' : 'label', { className: cls('field') });
    if (f.label && f.type !== 'button') {
        const lbl = ce('span', { className: cls('field-label') });
        lbl.textContent = f.label;
        wrap.appendChild(lbl);
    }

    if (f.type === 'select') {
        // MpiDropdown, not a raw `<select>`: the native control paints itself from the
        // OS, so it was the one widget on a Flow step that could not be themed at all.
        // The Primitive also portals its list to `document.body`, which the raw select
        // did not need but the flow frame does — a step row clips its overflow.
        const opts_ = f.options || [];
        const find = v => opts_.find(o => String(o.v) === String(v));
        // Same fallback law as `radio`: a seeded value comes off a PERSISTED card and
        // may name an option this build no longer has. Fall back rather than render a
        // trigger showing the placeholder while quietly sending the stale value.
        const sel = find(cur) ? cur : (f.default ?? opts_[0]?.v);
        if (sel !== cur) onChange(sel);
        const host = ce('div', { className: cls('field-select') });
        const inst = MpiDropdown.mount(host, {
            options: opts_.map(o => ({
                label: o.label ?? String(o.v), value: String(o.v), info: o.info,
            })),
            value: String(sel ?? ''),
        });
        inst.on('change', ({ value }) => {
            const o = find(value);
            if (!o) return;
            // Emit the option's ORIGINAL `v`, never the DOM string — a graph param like
            // Input_Tier is an int, and "1" reaching MpiAnySwitch as text is a silent
            // wrong-branch. Identical to the `radio` branch, and for the same reason.
            onChange(o.v);
        });
        unsubs.push(() => inst?.el?.destroy?.());
        wrap.appendChild(host);
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
        // The second mounted Primitive here, and for the same reason as `radio`: a
        // declared ACTION is a real button, so it takes the app's variant, hover
        // fill, press and disabled treatment rather than each consumer block
        // restating them on a bare `<button>` and drifting.
        //
        // TEXT mode deliberately, not icon mode: `MpiButton` maps every icon-mode
        // variant except danger/ghost down to `secondary`, so `primary` + an icon
        // renders grey — and widening that mapping would repaint ~20 icon buttons
        // across the app. The icon rides in `children` so it sits LEFT of the
        // label, where the rest of the app puts it.
        const host = ce('div');
        const icon = f.icon ? renderIcon(f.icon, 'sm') : '';
        const inst = MpiButton.mount(host, {
            variant: 'primary',
            size: 'sm',
            extraClasses: cls('field-button'),
        }, `${icon}<span class="mpi-btn__text">${f.label || f.id}</span>`);
        inst.on('click', () => onChange(true));
        unsubs.push(() => inst?.el?.destroy?.());
        wrap.appendChild(host);
    } else if (f.type === 'toggle') {
        // MpiCheckbox, not a raw `<input type=checkbox>`: the bare box was drawn by
        // Chromium and tinted with `accent-color`, which is why it matched nothing
        // else on screen. The Primitive is the same box the rest of the app ticks.
        const host = ce('div', { className: cls('field-toggle') });
        const inst = MpiCheckbox.mount(host, {
            checked: Boolean(cur),
            name: `${namespace}-${f.id}`,
        });
        inst.on('change', ({ checked }) => onChange(checked));
        unsubs.push(() => inst?.el?.destroy?.());
        wrap.appendChild(host);
    } else if (f.type === 'number') {
        // MpiInput in number mode. It renders `type=text` + `inputmode=decimal` on
        // purpose so it owns parsing, clamping and stepping rather than inheriting
        // the browser's `type=number` quirks (NaN out of range, float dust off
        // `step`), and it adds wheel-to-adjust for free.
        const host = ce('div', { className: cls('field-input') });
        const value = fieldNumber(cur ?? f.default ?? f.min ?? 0, f);
        // `decimals` only matters below a whole step — without it a step of 0.1 walks
        // into 0.30000000000000004 in the box. Read the precision off the declaration
        // rather than guessing one.
        const dp = f.step != null && Number(f.step) < 1
            ? (String(f.step).split('.')[1] || '').length
            : undefined;
        const inst = MpiInput.mount(host, {
            type: 'number',
            // `sm` is the primitive's own narrow numeric treatment — a 6ch centred
            // field. That is what the hand-rolled `width: 5.5em` was reaching for.
            size: 'sm',
            value,
            ...(f.min != null ? { min: Number(f.min) } : {}),
            ...(f.max != null ? { max: Number(f.max) } : {}),
            ...(f.step != null ? { step: Number(f.step) } : {}),
            ...(dp !== undefined ? { decimals: dp } : {}),
        });
        inst.on('change', ({ value: v }) => {
            // `fieldNumber` stays the authority even though MpiInput clamps too: it is
            // the one place that also falls back to the declared default on a value
            // that is not a number at all. A field that silently sends a different
            // number than it shows is worse than a rejected run.
            onChange(fieldNumber(v, f));
        });
        unsubs.push(() => inst?.el?.destroy?.());
        wrap.appendChild(host);
    } else if (f.type === 'slider') {
        // MpiProgressBar IS the app's slider — its own header says so: "Absorbs all
        // MpiSlider capabilities — this is the single source of truth for sliders."
        // This branch used to build a bare `<input type="range">`, which renders
        // Chromium's NATIVE widget: wrong rail, wrong thumb, a colour that matched
        // nothing else on screen, and the same control drawn four different ways
        // across the app. Every UI element is a component; where none fits, a new
        // one gets made. The host keeps `field-range` so each block's existing
        // flex sizing still applies (MPI-582).
        const value = fieldNumber(cur ?? f.min ?? 0, f);
        const host = ce('div', { className: cls('field-range') });
        const inst = MpiProgressBar.mount(host, {
            min: f.min ?? 0,
            max: f.max ?? 100,
            step: f.step ?? 1,
            value,
            interactive: true,
            wheel: true,
            handle: true,
            info: `${f.label || f.id}: {value}`,
        });
        // A slider with no readout is a guess. The number IS the control. It shows
        // the DECLARED value, never the mapped one — `mapTo` is hidden by design.
        const out = ce('span', { className: cls('field-value') });
        out.textContent = String(value);
        inst.on('input', ({ value: v }) => {
            out.textContent = String(v);
            onChange(v);
        });
        unsubs.push(() => inst?.el?.destroy?.());
        // Slider + readout share one line in BOTH layouts — the stacked column would
        // otherwise drop the number onto its own row.
        const bar = ce('div', { className: cls('field-slider') });
        bar.appendChild(host);
        bar.appendChild(out);
        wrap.appendChild(bar);
    } else if (f.type === 'text') {
        // MpiInput is the app's text box — the same Primitive MpiPromptBox, the
        // notes editor and the error dialog all mount, so a declared prompt looks
        // like every other prompt instead of like a raw browser field. `rows` is
        // set on the textarea after mount (MpiPromptBox reaches in the same way);
        // MpiInput owns the rest of the chrome.
        const multi = Number(f.rows) > 1;
        // The host keeps `field-text` so each consumer block's existing layout still
        // finds it — the row's `:has()` column, its 120px height and the `--work`
        // step's type scale all key off this class, and an inline width instead of
        // the class silently unhooks all three.
        const host = ce('div', { className: cls('field-text') });
        const inst = MpiInput.mount(host, {
            type: multi ? 'textarea' : 'text',
            placeholder: f.placeholder || '',
            value: cur != null ? String(cur) : '',
        });
        if (multi) {
            const ta = qs('textarea', inst.el);
            if (ta) ta.rows = Number(f.rows);
        }
        inst.on('input', ({ value }) => onChange(value));
        unsubs.push(() => inst?.el?.destroy?.());
        wrap.appendChild(host);
    } else {
        clientLogger.warn('declaredFields', `unknown field type "${f.type}" — skipping`);
        return null;
    }
    return wrap;
}
