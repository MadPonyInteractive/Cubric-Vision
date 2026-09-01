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
 *   toggle -> MpiButton (icon mode, toggleable) · number, text -> MpiInput ·
 *   slider -> MpiProgressBar
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
import { renderIcon } from './icons.js';
import { clientLogger } from '../services/clientLogger.js';

/**
 * Types whose control already shows the label on its own face, so the wrapper must
 * not print it a second time above.
 */
const LABEL_IN_CONTROL = new Set(['button', 'toggle']);

/**
 * The `toggle` icon when a declaration names none. Icon MODE is not optional here —
 * it is the only MpiButton mode that carries `toggleable`, the `is-active` treatment
 * and a label beside an icon — so a toggle with no icon still renders in it, with a
 * tick standing in. Declaring `icon` is how a toggle says what it turns on.
 */
const TOGGLE_FALLBACK_ICON = 'check';

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
 * It is also where a numeric field's `min`/`max` are finally ENFORCED, mapped or
 * not. The widget clamps what the user DRAGS, and that is not the same thing: an
 * untouched field arrives here straight from a persisted card or a Reuse, having
 * never met the control. So when a declared floor MOVES — drama-box's `Input_Duration`
 * went 1 → 4 with MPI-645 — an old value below it would otherwise SHOW as the new
 * floor (the slider clamps at render) and SEND the old number, which is the one
 * failure worse than a rejected run. Both payload paths pass through here, so the
 * flow frame and the upscale tool-options twin get it from one place.
 *
 * @param {Object} f  the field declaration
 * @param {*} v       the UI value
 * @returns {*}       the graph value, clamped for a numeric field, or `v` untouched
 */
export function mapDeclaredValue(f, v) {
    // A `voices` roster is the ONE field type whose UI value is not its graph value:
    // it holds rows so Reuse can rebuild the control, while the graph wants a single
    // string. Serialising HERE rather than inside the widget keeps the one-field-one-
    // param law intact AND puts the agent connector (`resolveFlowFieldValues`) on the
    // same path as the widget — the duplication this module exists to prevent.
    if (f?.type === 'voices') return serialiseVoices(v);
    if (f?.type === 'number' || f?.type === 'slider') v = fieldNumber(v, f);
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
 * A voice roster's rows → the one string the graph reads (MPI-664).
 *
 * One line per named voice, `Name (Type)`, which is MiniMax's own convention in the
 * reference captions (`Singer A (Male)`). A row whose type is the catch-all emits the
 * bare name: writing "Ana (Any)" into a caption states a vocal quality the user did
 * not choose, and the model reads it as one.
 *
 * An option's `v` IS the caption word here, not an index. This roster feeds PROSE —
 * the caption's `Vocal Details` — not an `MpiAnySwitch` bank, so there is no int to
 * map to and a lookup table would only be a second place to drift.
 *
 * Unnamed rows are dropped rather than emitted blank: a half-added row must not
 * become an anonymous voice in the caption.
 *
 * @param {Array<{name: string, type: string}>} rows
 * @returns {string}
 */
export function serialiseVoices(rows) {
    if (!Array.isArray(rows)) return '';
    return rows
        .map(r => ({
            name: String(r?.name ?? '').trim(),
            type: String(r?.type ?? '').trim(),
        }))
        .filter(r => r.name)
        .map(r => (r.type && r.type.toLowerCase() !== 'any' ? `${r.name} (${r.type})` : r.name))
        .join('\n');
}

/**
 * The name a newly added roster row gets: the first unused `Singer A`, `Singer B`, …
 *
 * Auto-naming is not cosmetic. The lyrics box references a voice by name, so two rows
 * sharing one makes the reference ambiguous — and a row added blank would be dropped
 * by `serialiseVoices` without ever saying why.
 *
 * ponytail: uniqueness is enforced on ADD only, never on a rename. Policing every
 * keystroke would fight the user mid-word; the upgrade path is to validate at the
 * point the marker is inserted, which is where tier 3's picker lands.
 *
 * @param {Array<{name: string}>} rows
 * @returns {string}
 */
export function nextVoiceName(rows = []) {
    const taken = new Set((rows || []).map(r => String(r?.name ?? '').trim().toLowerCase()));
    for (let i = 0; i < 26; i += 1) {
        const name = `Singer ${String.fromCharCode(65 + i)}`;
        if (!taken.has(name.toLowerCase())) return name;
    }
    return `Singer ${(rows || []).length + 1}`;
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
 * Render a declared numeric value the way its `format` asks for (MPI-664).
 *
 * A slider that means SECONDS reads as a bare integer today — "90" tells a user
 * nothing about whether their song is long. `format: 'duration'` spells it, and it
 * is declared on the field rather than hard-coded per flow so any flow measuring
 * time gets it by saying so.
 *
 * Minutes and seconds only: this renders a media length, and the app caps nothing
 * near an hour. A longer one would read "125 minutes" rather than lie.
 *
 * @param {Object} f  the field declaration
 * @param {*} v       the current value
 * @returns {string}  display text
 */
export function formatDeclaredValue(f, v) {
    if (f?.format !== 'duration') return String(v);
    const total = Math.max(0, Math.round(Number(v) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const part = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
    if (!mins) return part(secs, 'second');
    if (!secs) return part(mins, 'minute');
    return `${part(mins, 'minute')} ${part(secs, 'second')}`;
}

/**
 * Which declared fields must render DISABLED right now, given the current values.
 *
 * MPI-663 — Stems is the first flow whose toggles CONSTRAIN EACH OTHER: at least one
 * stem must stay selected (a run with none selected blocks every branch, succeeds, and
 * lands nothing — the silent-nothing trap 02-media-io.md § Self-gating is not the same
 * as HANDLED), and "combine into one file" means nothing until two are. Both are said
 * declaratively so a third-party Flow can express them too — a predicate in a FlowDef
 * would be a thing only a first-party flow can ship.
 *
 * Two clauses, one shared `group`:
 *   `{ group: 'stems', minActive: 1 }`      — on each member. A member that is ON and is
 *                                             the LAST one on is disabled: turning it off
 *                                             would break the floor. The others stay live,
 *                                             because turning one ON never can.
 *   `{ enabledWhen: { group: 'stems', atLeast: 2 } }`
 *                                           — on a field OUTSIDE the group. Disabled while
 *                                             fewer than N members are on.
 *
 * A disabled field keeps its VALUE — greying a control is not the same as deciding for
 * the user, and the value comes back the moment the constraint clears. Anything acting on
 * one must therefore re-check the condition rather than trust the flag (generationService
 * only combines when more than one file actually landed).
 *
 * @param {Object[]} fields  the declarations
 * @param {Object} values    current values keyed by field id
 * @returns {Set<string>}    ids to render disabled
 */
export function disabledFieldIds(fields = [], values = {}) {
    const decls = (fields || []).filter(f => f?.id);
    const activeIn = (group) => decls
        .filter(f => f.group === group && values[f.id] === true)
        .map(f => f.id);

    const out = new Set();
    decls.forEach((f) => {
        if (f.group && Number.isFinite(f.minActive)) {
            const on = activeIn(f.group);
            if (values[f.id] === true && on.length <= f.minActive) out.add(f.id);
        }
        const rule = f.enabledWhen;
        if (rule?.group && Number.isFinite(rule.atLeast)) {
            if (activeIn(rule.group).length < rule.atLeast) out.add(f.id);
        }
    });
    return out;
}

/**
 * Which declared fields must render HIDDEN right now, given the current values.
 *
 * MPI-664 — MiniMax Music's Instrumental toggle takes the lyrics and both voice
 * controls off screen entirely rather than greying them: with no vocals there is
 * nothing for them to say, and a greyed lyrics box still reads as a box the user
 * failed to fill in.
 *
 * Hiding rather than disabling is also the CHEAPER reach. Disabling lands on the
 * primitive's own `setDisabled`, so it works for a `toggle` and a `select` and for
 * nothing else — a declared `text` box cannot be greyed at all today. Hiding is on
 * the wrapper the painter already holds, so it works for every field type.
 *
 * Three clauses, deliberately narrow:
 *   `{ hiddenWhen: { field: 'Input_Instrumental', is: true } }`
 *   `{ hiddenWhen: { model: 'minimax-h3-ref2va' } }`
 *   `{ hiddenWhen: { modelNot: 'minimax-h3-ref2va' } }`
 *
 * MPI-591 adds the two MODEL clauses. A Flow's declared fields are shared across
 * every candidate its Model slot offers, and the injector skips a title a graph does
 * not carry IN SILENCE — so a field meant for one arm renders dead on the others.
 * That was cosmetic while it was only Extend Video's `negative` box; it stopped being
 * cosmetic when the same flow gained a Turbo toggle, because a toggle the user flips
 * with no effect reads as a broken app rather than an inapplicable one.
 *
 * DECLARATIVE, never a predicate function — the MPI-663 rule. A function in a
 * FlowDef is something only a first-party flow can ship, and FlowDefs are data so a
 * third party can express the same constraint.
 *
 * A hidden field keeps its VALUE, exactly as a disabled one does: toggle it back and
 * the lyrics come back as typed. So ANYTHING ACTING ON ONE MUST RE-CHECK THE
 * CONDITION rather than trust the flag — an instrumental run whose graph trusted the
 * flag would inject lyrics that are merely invisible.
 *
 * @param {Object[]} fields  the declarations
 * @param {Object} values    current values keyed by field id
 * @param {string[]} modelIds  the ids the Model slots are currently resolved to
 * @returns {Set<string>}    ids to render hidden
 */
export function hiddenFieldIds(fields = [], values = {}, modelIds = []) {
    const picked = modelIds || [];
    const out = new Set();
    (fields || []).forEach((f) => {
        const rule = f?.hiddenWhen;
        if (!f?.id || !rule) return;
        if (rule.field) { if (values[rule.field] === rule.is) out.add(f.id); return; }
        if (rule.model) { if (picked.includes(rule.model)) out.add(f.id); return; }
        if (rule.modelNot && !picked.includes(rule.modelNot)) out.add(f.id);
    });
    return out;
}

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
 * Every declared field a FlowDef owns, flow-level and step-level together.
 *
 * A field declared on a STEP reaches the op exactly as a flow-level one does
 * (flowsRegistry § FlowStepField), so a reader that walked only `flow.fields`
 * would drop half of a stepped flow's controls and run it on baked defaults.
 * `button` is excluded: it is an ACTION, and a click must never arrive as a value.
 *
 * @param {Object} flow  a FlowDef
 * @returns {Object[]}
 */
export function flowDeclaredFields(flow) {
    return [...(flow?.fields || []), ...(flow?.steps || []).flatMap(s => s?.fields || [])]
        .filter(f => f?.id && f.type !== 'button');
}

/**
 * Resolve a caller's field values against a FlowDef into the payload the op takes
 * — declared defaults first, the caller's values over them, `derived` last.
 *
 * DERIVED IS COMPUTED AFTER THE OVERRIDES, which is the whole point of it: Text to
 * Speech's `Input_Is_Multilingual` follows the language the caller actually picked,
 * so the one state the pair could disagree in (English audio from a non-English
 * pick) stays unreachable off the agent path exactly as it is in the UI (MPI-607).
 *
 * Built for the agent connector (MPI-658), which has no widgets to collect from and
 * so would otherwise re-implement this dialect a third time — the duplication
 * MPI-580 extracted this module to stop.
 *
 * An undeclared id is REPORTED, never silently dropped: a typo'd field on a paid
 * generation must come back as an error, not as a run on the default.
 *
 * @param {Object} flow    a FlowDef
 * @param {Object} values  caller values keyed by declared field id
 * @returns {{inputs: Object, injectionParams: Object, unknown: string[]}}
 */
export function resolveFlowFieldValues(flow, values = {}) {
    const decls = flowDeclaredFields(flow);
    const declared = new Set(decls.map(f => f.id));
    const unknown = Object.keys(values || {}).filter(k => !declared.has(k));

    const resolved = {};
    decls.forEach((f) => { if (f.default !== undefined) resolved[f.id] = f.default; });
    Object.entries(values || {}).forEach(([k, v]) => { if (declared.has(k)) resolved[k] = v; });
    (flow?.derived || []).forEach((d) => {
        if (!d?.id || !d.from) return;
        resolved[d.id] = String(resolved[d.from]) === String(d.equals) ? d.then : d.else;
    });

    return { ...splitDeclaredValues(decls, resolved), unknown };
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
    // field, so the wrapper forwards a click on the caption into it. A `toggle` is a
    // `<button>`, and a label wrapping a button re-fires the click — the toggle would
    // flip and flip back on one press. That type gets a plain div.
    const wrap = ce(f.type === 'toggle' ? 'div' : 'label', { className: cls('field') });
    // `button` and `toggle` CARRY their own caption — the button's face IS the label.
    // A caption above it would say the same word twice (Fabio, MPI-504).
    if (f.label && !LABEL_IN_CONTROL.has(f.type)) {
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
        // ponytail: `disabled` is honoured on `select` only, because that is the one
        // type that has ever needed it (MPI-620's canvas size, inert once the user
        // uploads a drawing). Every Primitive this vocabulary mounts already takes a
        // `disabled` prop, so widening it is a one-line-per-branch job the day a second
        // type asks — not speculative work today.
        const inst = MpiDropdown.mount(host, {
            options: opts_.map(o => ({
                label: o.label ?? String(o.v), value: String(o.v), info: o.info,
            })),
            value: String(sel ?? ''),
            disabled: !!f.disabled,
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
        // A toggleable MpiButton in ICON MODE, carrying its own icon and name —
        // Fabio's call, MPI-504: "MPI buttons for the toggles instead, so that you
        // don't need labels on the top like you have now." It replaces the type
        // rather than joining it, so there is one on/off vocabulary and not two.
        //
        // Icon mode is the mode that HAS this: `toggleable`, the `is-active`
        // treatment, and a label beside an icon. Text mode has none of them — its
        // click handler ignores `toggleable` and every `is-active` rule in
        // MpiButton.css is scoped to `.mpi-ibtn` — so an icon-less declaration falls
        // back to a tick rather than dropping out of icon mode, where it would flip
        // a class that paints nothing.
        //
        // `toggle`, not `click`: the primitive owns the flip and reports the state it
        // landed on, so this never re-derives it from the class list.
        const host = ce('div', { className: cls('field-toggle') });
        const inst = MpiButton.mount(host, {
            icon: f.icon || TOGGLE_FALLBACK_ICON,
            label: f.label || f.id,
            size: 'sm',
            toggleable: true,
            active: Boolean(cur),
            info: f.info || '',
            extraClasses: cls('field-toggle-btn'),
        });
        inst.on('toggle', ({ active }) => onChange(active));
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
            // A FORMATTED slider opts out of the info bar (`info: ''`). The bar
            // substitutes `{value}` and cannot format, so it would hover "Length: 90"
            // over a readout already saying "1 minute 30 seconds" — one control
            // contradicting itself. The readout below carries the formatted value and
            // is always visible, so nothing is lost (MPI-664).
            info: f.format ? '' : `${f.label || f.id}: {value}`,
        });
        // A slider with no readout is a guess. The number IS the control. It shows
        // the DECLARED value, never the mapped one — `mapTo` is hidden by design.
        const out = ce('span', { className: cls('field-value') });
        out.textContent = formatDeclaredValue(f, value);
        inst.on('input', ({ value: v }) => {
            out.textContent = formatDeclaredValue(f, v);
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
    } else if (f.type === 'voices') {
        // The voice ROSTER (MPI-664) — a cast list of any length, each row a name and
        // a voice type. A single dropdown cannot say "male verse, female bridge, choir
        // on the last chorus", and the bench test proved MiniMax honours exactly that
        // when the caption states it per section.
        //
        // It composes THREE Primitives (MpiInput · MpiDropdown · MpiButton) rather than
        // introducing a fourth: nothing here is a new visual idea, only a new
        // arrangement of existing ones, so a new Primitive would be a second drawing of
        // controls the app already owns.
        const opts_ = f.options || [];
        // The rows are COPIED, never aliased: `cur` is the persisted value off a card,
        // and mutating it in place would edit the payload behind the flow's back.
        const rows = (Array.isArray(cur) && cur.length ? cur : (f.default || []))
            .map(r => ({ ...r }));
        const list = ce('div', { className: cls('field-voices') });

        // Every row mounts Primitives, so a rebuild MUST destroy the previous set or
        // the instances leak for as long as the flow stays open.
        let rowUnsubs = [];
        const dropRows = () => { rowUnsubs.forEach(fn => fn()); rowUnsubs = []; };
        unsubs.push(dropRows);

        // ponytail: a full re-render per add/remove. A roster is a handful of rows, so
        // diffing buys nothing — revisit only if a flow ever declares a long one.
        //
        // Repainting is deliberately NOT wired to the name box: rebuilding the row
        // under a typing user would drop focus on every keystroke. A name or type edit
        // mutates its row in place and reports; only add and remove change the SHAPE.
        const paint = () => {
            dropRows();
            list.textContent = '';

            rows.forEach((row, i) => {
                const line = ce('div', { className: cls('field-voice-row') });

                const nameHost = ce('div', { className: cls('field-voice-name') });
                const nameInst = MpiInput.mount(nameHost, {
                    type: 'text',
                    size: 'sm',
                    placeholder: f.namePlaceholder || 'Name',
                    value: String(row.name ?? ''),
                });
                nameInst.on('input', ({ value }) => { row.name = value; onChange(rows); });
                rowUnsubs.push(() => nameInst?.el?.destroy?.());

                const typeHost = ce('div', { className: cls('field-voice-type') });
                const typeInst = MpiDropdown.mount(typeHost, {
                    options: opts_.map(o => ({
                        label: o.label ?? String(o.v), value: String(o.v), info: o.info,
                    })),
                    value: String(row.type ?? opts_[0]?.v ?? ''),
                });
                typeInst.on('change', ({ value }) => {
                    const o = opts_.find(x => String(x.v) === String(value));
                    if (!o) return;
                    // The option's ORIGINAL `v`, never the DOM string — the same law the
                    // select and radio branches follow, and for the same reason.
                    row.type = o.v;
                    onChange(rows);
                });
                rowUnsubs.push(() => typeInst?.el?.destroy?.());

                const delHost = ce('div');
                const delInst = MpiButton.mount(delHost, {
                    icon: 'trash',
                    variant: 'ghost',
                    size: 'sm',
                    info: `Remove ${row.name || 'this voice'}`,
                    extraClasses: cls('field-voice-remove'),
                });
                delInst.on('click', () => { rows.splice(i, 1); onChange(rows); paint(); });
                rowUnsubs.push(() => delInst?.el?.destroy?.());

                line.appendChild(nameHost);
                line.appendChild(typeHost);
                line.appendChild(delHost);
                list.appendChild(line);
            });

            const addHost = ce('div', { className: cls('field-voice-add') });
            const addInst = MpiButton.mount(addHost, {
                icon: 'plus',
                label: f.addLabel || 'Add a voice',
                size: 'sm',
            });
            addInst.on('click', () => {
                rows.push({ name: nextVoiceName(rows), type: opts_[0]?.v ?? '' });
                onChange(rows);
                paint();
            });
            rowUnsubs.push(() => addInst?.el?.destroy?.());
            list.appendChild(addHost);
        };
        paint();

        // Write the declared default back, the same law the select and radio branches
        // follow: a roster that shows two voices while sending none is the worst
        // outcome available, and a run that never touches the control must still carry
        // what the control displays.
        if (!Array.isArray(cur) && rows.length) onChange(rows);
        wrap.appendChild(list);
    } else {
        clientLogger.warn('declaredFields', `unknown field type "${f.type}" — skipping`);
        return null;
    }

    // A FIELD-level note, the always-visible twin of the radio's per-option one and
    // reusing its class. It exists for the disabled case: a greyed-out control with
    // no stated reason is the thing MPI-620 rejected, and the cure Fabio accepted
    // there was a note that reads AS the reason rather than as fine print. Only
    // rendered when a field asks for one.
    //
    // It lives HERE, past every branch, because a note is a property of the FIELD and
    // not of one widget. Written inside the `select` branch it silently dropped every
    // note a slider declared: `Input_Denoise` and `Input_Prompt_Strength` each carry
    // one in BOTH registries (LTX Upscale's flow and its tool-options twin) and none
    // of the four had ever reached the screen (MPI-645).
    if (f.note) {
        const fieldNote = ce('span', { className: cls('field-note') });
        fieldNote.textContent = f.note;
        wrap.appendChild(fieldNote);
    }
    return wrap;
}
