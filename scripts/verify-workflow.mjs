#!/usr/bin/env node
/**
 * verify-workflow.mjs — prove a converted API workflow would be ACCEPTED by the
 * engine, without spending a generation. The second half of
 * `docs/workflow-authoring/bench-editing.md` § "Prove a graph correct without spending
 * a generation": there is NO validate-only endpoint, because `/prompt` validates and
 * then QUEUES — a 22B model loads before the graph's own ExecutionBlocker stops
 * anything. So the checks are re-implemented here against `/object_info`.
 *
 * Usage:
 *   node scripts/verify-workflow.mjs <api.json> [<api.json> ...]
 *   node scripts/verify-workflow.mjs --self-check          # no engine needed
 *
 * Exit 0 = clean. 1 = at least one violation. 2 = could not run.
 *
 * PAIRS WITH `validate-injection-rules.mjs`, it does not replace it. That one owns the
 * INJECTION contract (Output_* capture node, the Input_Seed convention, required inputs
 * satisfied, no link to a missing node). This one owns what the ENGINE will reject:
 *
 *   1. Class registered      — `class_type` exists in this engine's /object_info.
 *   2. COMBO in range        — every combo widget value is in the engine's list.
 *                              `value_not_in_list` is the most common reject there is,
 *                              and it is what a community graph naming weights we do
 *                              not have dies on.
 *   3. Link TYPE compatible  — re-implements `validate_node_input`
 *                              (comfy_execution/validation.py): equal passes, `*` on
 *                              either side passes, otherwise the comma-split sets must
 *                              OVERLAP. **INT -> FLOAT is a REJECT.**
 *
 * A node whose VALIDATE_INPUTS takes an `input_types` argument (e.g. MpiClamp) makes
 * ComfyUI skip the type check for that node entirely — `execution.py` guards on
 * `'input_types' not in validate_function_inputs`. We cannot see that from
 * /object_info, so a type finding on such a node is a false positive; check the node's
 * python before acting on one.
 *
 * DEFAULTS TO 48188, THE APP ENGINE — deliberately unlike its sibling, which defaults
 * to the 8188 authoring bench. bench-editing.md: "Convert against 48188, not the bench.
 * 8188 is the authoring bench and has run ahead of the shipped engine before, shifting a
 * widget silently. Anything the app will ship gets converted against the engine."
 * COMFY_URL overrides.
 */

import fs from 'node:fs/promises';
import process from 'node:process';
import http from 'node:http';

const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:48188';

// A combo arrives EITHER as the modern ["COMBO", {options: [...]}] or the legacy
// [[...], {...}]. Both shapes are live on engines we run; keying off only one silently
// stops checking half the widgets.
export function comboOptions(spec) {
    if (!Array.isArray(spec)) return null;
    if (Array.isArray(spec[0])) return spec[0];
    return spec[0] === 'COMBO' ? (spec[1]?.options ?? []) : null;
}

// ── The V3 schema, which klein_t2i already ships and a naive checker false-alarms on ──
//
// COMFY_MATCHTYPE_V3 is a TEMPLATED type: it resolves at runtime to whatever the
// template binds, and declares what it will accept in `template.allowed_types`
// ("IMAGE,MASK"). Using that set keeps real checking instead of waving it through as a
// wildcard — which matters, because these nodes sit mid-graph where a genuine clash
// would otherwise go unseen.
const MATCHTYPE = 'COMFY_MATCHTYPE_V3';
export function resolveType(spec) {
    if (!Array.isArray(spec)) return spec;
    return spec[0] === MATCHTYPE ? (spec[1]?.template?.allowed_types ?? '*') : spec[0];
}
export function resolveOutputType(t) { return t === MATCHTYPE ? '*' : t; }

// COMFY_DYNAMICCOMBO_V3 picks an option, and THAT option contributes nested inputs which
// reach the API graph dotted: `sampling_mode` plus `sampling_mode.temperature`. Reading
// only the flat signature reports every nested field as unknown — seven false positives
// on one TextGenerate node. Resolve the child against the union of all options' inputs,
// so a genuine typo is still caught.
export function dynamicComboOptions(spec) {
    return (Array.isArray(spec) && spec[0] === 'COMFY_DYNAMICCOMBO_V3') ? (spec[1]?.options ?? []) : null;
}

// COMFY_AUTOGROW_V3 is the other dotted parent: a repeating group that grows by name.
// `template.input` is the per-item signature and `template.names` the legal children,
// so `images.image_1` on TextEncodeBooguEdit is `["IMAGE", {}]` and `images.image_99`
// is a genuine fault.
export function autogrowTemplate(spec) {
    return (Array.isArray(spec) && spec[0] === 'COMFY_AUTOGROW_V3') ? (spec[1]?.template ?? null) : null;
}
export function hasDottedChildren(spec) { return !!(dynamicComboOptions(spec) || autogrowTemplate(spec)); }

function nestedSpec(parentSpec, child) {
    for (const opt of dynamicComboOptions(parentSpec) || []) {
        const io = opt.inputs || {};
        const hit = { ...(io.required || {}), ...(io.optional || {}) }[child];
        if (hit) return hit;
    }
    const tpl = autogrowTemplate(parentSpec);
    if (tpl) {
        const names = tpl.names;
        if (Array.isArray(names) && !names.includes(child)) return null;
        const io = tpl.input || {};
        // one declared item spec, reused under every generated name
        return Object.values({ ...(io.required || {}), ...(io.optional || {}) })[0] ?? null;
    }
    return null;
}

/** comfy_execution/validation.py `validate_node_input`, ported. */
export function typesOverlap(received, expected) {
    if (received === expected || received === '*' || expected === '*') return true;
    const got = new Set(String(received).split(','));
    return String(expected).split(',').some(t => got.has(t));
}

const isLink = v => Array.isArray(v) && v.length === 2
    && typeof v[0] === 'string' && Number.isInteger(v[1]);

// A combo naming a WEIGHT is a different question from a combo naming a sampler. The
// weight list is whatever is on this engine's disk right now, so a graph for a model the
// user has not installed reports `value_not_in_list` on every loader while being
// perfectly authored — 21 shipped files did exactly that on the first run. Those are
// NOTES by default and failures under --strict, which is the difference between "is this
// graph correct" and "can this engine run it today".
//
// Judged from the VALUES, never from a name list: a name list missed `clip_name1`,
// `clip_name1_opt`, `lora_1` and every third-party loader. And judged from the OFFENDING
// value first, not from the option list — a loader list routinely carries sentinels
// (`None` on every MpiLoraModel, `taesd*` on VAELoader), so requiring every option to be
// a filename mis-classified three more files as hard failures.
const WEIGHT_EXT = /\.(safetensors|ckpt|pth|pt|bin|gguf|sft|onnx)$/i;
const looksLikeWeight = v => typeof v === 'string' && WEIGHT_EXT.test(v);
export const isWeightChoice = (val, allowed) => looksLikeWeight(val) || allowed.some(looksLikeWeight);

export function checkWorkflow(graph, objectInfo, { strict = false } = {}) {
    const out = [];
    const notes = [];
    out.notes = notes;
    for (const [id, node] of Object.entries(graph)) {
        const def = objectInfo[node.class_type];
        if (!def) { out.push(`#${id}: class "${node.class_type}" is not registered on this engine`); continue; }
        const all = { ...(def.input.required || {}), ...(def.input.optional || {}) };

        for (const [name, val] of Object.entries(node.inputs || {})) {
            let spec = all[name];
            if (!spec && name.includes('.')) {
                const [parent, ...rest] = name.split('.');
                const parentSpec = all[parent];
                if (hasDottedChildren(parentSpec)) {
                    spec = nestedSpec(parentSpec, rest.join('.'));
                    if (!spec) { out.push(`#${id} ${node.class_type}: "${name}" — no option of "${parent}" declares "${rest.join('.')}"`); continue; }
                }
            }
            if (!spec) { out.push(`#${id} ${node.class_type}: input "${name}" is not on the engine's signature`); continue; }

            if (isLink(val)) {
                const [srcId, slot] = val;
                const src = graph[srcId];
                if (!src) { out.push(`#${id}.${name}: link to missing node #${srcId}`); continue; }
                const srcDef = objectInfo[src.class_type];
                if (!srcDef) continue;                       // already reported above
                const gives = srcDef.output?.[slot];
                if (gives === undefined) { out.push(`#${id}.${name}: #${srcId} ${src.class_type} has no output slot ${slot}`); continue; }
                if (comboOptions(spec) || dynamicComboOptions(spec)) continue;   // a combo fed by a link is the engine's problem, not a type clash
                const wants = resolveType(spec);
                const got = Array.isArray(gives) ? '*' : resolveOutputType(gives);
                if (!typesOverlap(got, wants)) {
                    out.push(`#${id}.${name}: wants ${wants}, #${srcId} ${src.class_type} slot ${slot} gives ${gives}`);
                }
                continue;
            }

            const dyn = dynamicComboOptions(spec);
            if (dyn) {
                const keys = dyn.map(o => o.key).filter(k => k !== undefined);
                if (keys.length && !keys.includes(val)) {
                    out.push(`#${id} ${node.class_type}: "${name}" = ${JSON.stringify(val)} is not one of its dynamic-combo options`);
                }
                continue;
            }
            const allowed = comboOptions(spec);
            if (allowed && allowed.length && !allowed.includes(val)) {
                const line = `#${id} ${node.class_type}: "${name}" = ${JSON.stringify(val)} is value_not_in_list`;
                if (isWeightChoice(val, allowed) && !strict) notes.push(`${line} — weight not installed on this engine`);
                else out.push(line);
            }
        }
    }
    return out;
}

// stdlib http, not fetch — global fetch (undici) leaves keep-alive sockets that
// assert-crash at process teardown on Node 24/Windows. Same reason as the converter.
function fetchObjectInfo() {
    return new Promise((resolve, reject) => {
        http.get(`${COMFY}/object_info`, { headers: { connection: 'close' } }, (res) => {
            if (res.statusCode !== 200) { reject(new Error(`/object_info returned ${res.statusCode}`)); res.resume(); return; }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => (body += c));
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        }).on('error', e => reject(new Error(`Cannot reach ComfyUI at ${COMFY} (${e.message}). Start the engine first.`)));
    });
}

/** The one runnable check: the two pieces of logic that are easy to get subtly wrong. */
function selfCheck() {
    const fail = [];
    const t = (got, want, expected, why) => {
        if (typesOverlap(got, want) !== expected) fail.push(`typesOverlap(${got}, ${want}) should be ${expected} — ${why}`);
    };
    t('IMAGE', 'IMAGE', true, 'equal passes');
    t('*', 'MASK', true, 'wildcard on the left passes');
    t('LATENT', '*', true, 'wildcard on the right passes');
    t('INT', 'FLOAT', false, 'INT -> FLOAT is a REJECT, the trap this port exists for');
    t('IMAGE', 'MASK', false, 'unrelated types clash');
    t('IMAGE,MASK', 'MASK', true, 'comma-split sets need only OVERLAP');
    t('MODEL', 'IMAGE,MASK', false, 'no overlap');

    const c = (spec, expected, why) => {
        const got = comboOptions(spec);
        const same = JSON.stringify(got) === JSON.stringify(expected);
        if (!same) fail.push(`comboOptions(${JSON.stringify(spec)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)} — ${why}`);
    };
    c(['COMBO', { options: ['red', 'green'] }], ['red', 'green'], 'modern shape');
    c([['euler', 'heun'], {}], ['euler', 'heun'], 'legacy shape');
    c(['INT', { default: 0 }], null, 'a scalar is not a combo');
    c(['MASK', {}], null, 'a link type is not a combo');

    // V3 schema — both of these false-alarmed on the shipped klein_t2i before they were modelled
    const mt = [MATCHTYPE, { template: { allowed_types: 'IMAGE,MASK' } }];
    if (resolveType(mt) !== 'IMAGE,MASK') fail.push('a matchtype must resolve to its allowed_types, not to a wildcard');
    if (resolveType([MATCHTYPE, {}]) !== '*') fail.push('a matchtype with no template falls back to wildcard');
    if (resolveOutputType(MATCHTYPE) !== '*') fail.push('a matchtype OUTPUT is unresolvable, so it must pass as wildcard');
    if (!typesOverlap(resolveOutputType(MATCHTYPE), 'IMAGE')) fail.push('matchtype output -> IMAGE must pass');
    if (!typesOverlap('IMAGE', resolveType(mt))) fail.push('IMAGE -> matchtype(IMAGE,MASK) must pass');
    if (typesOverlap('LATENT', resolveType(mt))) fail.push('LATENT -> matchtype(IMAGE,MASK) must FAIL — allowed_types is what keeps this honest');

    const dyn = ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'on', inputs: { required: { temperature: ['FLOAT', {}] } } }, { key: 'off', inputs: {} }] }];
    const dynGraph = { 1: { class_type: 'Dyn', inputs: { mode: 'on', 'mode.temperature': 0.7 } } };
    const dynOi = { Dyn: { input: { required: { mode: dyn } }, output: [] } };
    if (checkWorkflow(dynGraph, dynOi).length) fail.push('a dotted dynamic-combo child must resolve, not read as unknown');
    if (checkWorkflow({ 1: { class_type: 'Dyn', inputs: { mode: 'on', 'mode.nope': 1 } } }, dynOi).length !== 1) fail.push('an UNDECLARED dotted child must still be caught');
    if (checkWorkflow({ 1: { class_type: 'Dyn', inputs: { mode: 'zzz' } } }, dynOi).length !== 1) fail.push('a dynamic-combo value off its option keys must be caught');

    const ag = ['COMFY_AUTOGROW_V3', { template: { input: { required: { image: ['IMAGE', {}] } }, names: ['image_1', 'image_2'] } }];
    const agOi = { Grow: { input: { required: { images: ag } }, output: [] } };
    if (checkWorkflow({ 1: { class_type: 'Grow', inputs: { 'images.image_1': ['2', 0] }, }, 2: { class_type: 'Src2', inputs: {} } }, { ...agOi, Src2: { input: { required: {} }, output: ['IMAGE'] } }).length) fail.push('an autogrow child must resolve to its template spec');
    if (checkWorkflow({ 1: { class_type: 'Grow', inputs: { 'images.image_99': 1 } } }, agOi).length !== 1) fail.push('an autogrow child outside template.names must be caught');

    if (!isWeightChoice('x.safetensors', ['None'])) fail.push('a weight-looking VALUE is a weight choice even when the list is all sentinels');
    if (isWeightChoice('zzz', ['euler', 'heun'])) fail.push('sampler names are NOT weights — those must stay hard failures');
    if (!isWeightChoice('zzz', ['None', 'a.safetensors'])) fail.push('a list CONTAINING weights is a weight input even if the bad value does not look like one');
    // and the whole checker on a two-node graph with one deliberate fault each way
    const oi = {
        Src: { input: { required: {} }, output: ['INT'] },
        Sink: { input: { required: { v: ['FLOAT', {}], mode: ['COMBO', { options: ['a', 'b'] }] } }, output: [] },
    };
    const found = checkWorkflow({
        1: { class_type: 'Src', inputs: {} },
        2: { class_type: 'Sink', inputs: { v: ['1', 0], mode: 'zzz' } },
    }, oi);
    if (found.length !== 2) fail.push(`checkWorkflow should find 2 faults (INT->FLOAT link, bad combo), found ${found.length}: ${found.join(' | ')}`);
    if (checkWorkflow({ 1: { class_type: 'Nope', inputs: {} } }, oi).length !== 1) fail.push('an unregistered class must be reported');

    if (fail.length) { console.error(`self-check FAILED (${fail.length}):\n  ${fail.join('\n  ')}`); process.exit(1); }
    console.log('self-check passed — type overlap, combo shapes, and the checker itself.');
}

async function main() {
    const argv = process.argv.slice(2);
    if (argv.includes('--self-check')) return selfCheck();
    const strict = argv.includes('--strict');
    const files = argv.filter(a => !a.startsWith('--'));
    if (!files.length) {
        console.error('Usage: node scripts/verify-workflow.mjs [--strict] <api.json> [...]   |   --self-check');
        process.exit(2);
    }
    const objectInfo = await fetchObjectInfo();

    let bad = 0;
    let noted = 0;
    for (const f of files) {
        let wf;
        try { wf = JSON.parse(await fs.readFile(f, 'utf8')); }
        catch (e) { console.error(`✗ ${f}: cannot read/parse (${e.message})`); bad++; continue; }
        const violations = checkWorkflow(wf, objectInfo, { strict });
        const notes = violations.notes || [];
        noted += notes.length;
        if (violations.length) {
            bad++;
            console.error(`✗ ${f} — ${violations.length} engine-rejection risk(s):`);
            for (const v of violations) console.error(`    • ${v}`);
        } else {
            console.log(`✓ ${f} (${Object.keys(wf).length} nodes)${notes.length ? `  [${notes.length} uninstalled weight(s)]` : ''}`);
        }
        for (const n of notes) console.log(`    · ${n}`);
    }
    if (bad) {
        console.error(`\n${bad} file(s) would risk rejection by ${COMFY}. Fix in the RAW graph and re-convert — a converted API file is build output.`);
        process.exit(1);
    }
    console.log(`\nAll ${files.length} file(s) validate against ${COMFY}.`
        + (noted ? ` ${noted} weight(s) are simply not installed here — re-run with --strict to treat those as failures.` : ''));
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
