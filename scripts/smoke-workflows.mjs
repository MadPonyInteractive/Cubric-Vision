#!/usr/bin/env node
/**
 * smoke-workflows.mjs — execute a minimal generation for every op, on a RunPod GPU Pod.
 *
 * The gate for docs/playbooks/bump-engine/ (MPI-467). MPI-465 shipped a completely dead
 * LTX for six days because a ComfyUI bump changed a return type under a custom node and
 * NOTHING in this repo ever executed a workflow. Graph validation would have passed it —
 * it threw at sampling start, after the loaders ran. So this EXECUTES.
 *
 * Usage:
 *   node scripts/smoke-workflows.mjs --plan            # resolve + print, spend nothing
 *   node scripts/smoke-workflows.mjs                   # full run (default: every model)
 *   node scripts/smoke-workflows.mjs --models qwen-edit,klein-4b
 *   node scripts/smoke-workflows.mjs --keep-volume     # skip the teardown prompt
 *   node scripts/smoke-workflows.mjs --gpu "NVIDIA L4" # force a card
 *
 * Requires the app running (drives its routes, so it exercises the path users hit and
 * writes no new RunPod API code) and a RunPod key in Settings.
 *
 * ponytail: no --nodes selector yet. "Smoke the models a node bump affects" is
 * --models today; automating the class_type -> python_module lookup off /object_info is
 * ~15 lines whenever a real node bump wants it. Not built on speculation.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = path.join(REPO, 'comfy_workflows');
const APP = `http://127.0.0.1:${process.env.CUBRIC_PORT || 3000}`;

// ── Infrastructure. Decided in MPI-467; reasons in docs/playbooks/bump-engine/01-smoke-run.md
const DATACENTER = 'EU-RO-1';          // volumes are DC-locked; the cards live here
const GPU_ORDER = ['L4', 'RTX 3090', 'RTX 4090'];  // cheapest-first by measured availability
const MIN_RAM_GB = 48;                 // weights spill to RAM on a 24GB card (footprint.js)
const VOLUME_NAME = 'cubric-smoke';
const VOLUME_HEADROOM_GB = 40;
const ENGINE = 'remote';
const ARCH = 'modern';                 // L4/3090/4090 are all 'modern' (gpuArch.js)

// ── The per-op budget. Written down so a later run cannot quietly get weaker.
const BUDGET = { steps: 1, edge: 128, frames: 1, seed: 42 };

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const PLAN_ONLY = flag('plan');

const log = (...a) => console.log(...a);
const die = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

async function app(route, init) {
    const r = await fetch(`${APP}${route}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    if (!r.ok) throw new Error(`${route} -> ${r.status} ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
    return body;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. Resolve the smoke set ─────────────────────────────────────────────────
// Dedupe by class_type SET, not filename: a core bump breaks a NODE, so two graphs with
// an identical node set are one test. That is what collapses the SDXL family to one.
// Lowest sizeTier per group wins. NEVER hardcode the resulting GB — it moves weekly.

async function loadRegistry() {
    const u = (p) => `file:///${path.join(REPO, p).replace(/\\/g, '/')}`;
    const [{ MODELS }, { DEPS }, resolve, { sizeToGb }, { COMMANDS }] = await Promise.all([
        import(u('js/data/modelConstants/models.js')),
        import(u('js/data/modelConstants/dependencies.js')),
        import(u('js/data/modelConstants/resolveModelDeps.js')),
        import(u('js/data/modelConstants/footprint.js')),
        import(u('js/data/commandRegistry.js')),
    ]);
    return { MODELS, DEPS, COMMANDS, ...resolve, sizeToGb };
}

const isWeight = (d) => d && d.size && d.type !== 'custom_nodes' && d.type !== 'json';

function classSetOf(file) {
    const p = path.join(WF_DIR, file);
    if (!existsSync(p)) return `MISSING:${file}`;
    const g = JSON.parse(readFileSync(p, 'utf8'));
    return [...new Set(Object.values(g).map(n => n.class_type).filter(Boolean))].sort().join(',');
}

const TIER_RANK = { low: 0, balanced: 1, high: 2 };

function resolveSmokeSet(reg, only) {
    const { MODELS, DEPS, resolveDeps, resolveWorkflowFile, sizeToGb } = reg;
    const depsOf = (m, ops) => resolveDeps(m, ops || null, null, ENGINE, { arch: ARCH });
    const gbOf = (ids) => [...ids].reduce((g, i) => g + (isWeight(DEPS[i]) ? sizeToGb(DEPS[i].size) : 0), 0);

    // Group by class_type-set fingerprint ONCE. The scoped path needs the same grouping
    // the full path does: a family shares one workflow file, so running any member proves
    // the graph for all of them — that is the premise the whole dedupe rests on, and it
    // does not stop being true because the caller named the member instead of the runner.
    const groups = new Map();
    for (const m of MODELS) {
        const files = [...new Set(Object.values(m.workflows || {}))].sort();
        const fp = files.map(classSetOf).join(' || ');
        if (!groups.has(fp)) groups.set(fp, []);
        groups.get(fp).push(m);
    }
    const familyOf = (m) => [...groups.values()].find(ms => ms.includes(m)) || [m];

    let set;
    if (only?.length) {
        const missing = only.filter(id => !MODELS.some(m => m.id === id));
        if (missing.length) die(`unknown model id(s): ${missing.join(', ')}`);
        // An explicit selection is the caller's call — take it verbatim, no collapsing.
        // It still COVERS its family: same workflow, same class_type set, same break.
        const picked = MODELS.filter(m => only.includes(m.id));
        set = picked.map(m => ({
            model: m,
            ops: m.supportedOps || [],
            covers: familyOf(m).filter(s => s !== m && !picked.includes(s)).map(s => s.id),
            gb: gbOf(depsOf(m)),
        }));
    } else {
        set = [];
        for (const members of groups.values()) {
            const best = members.slice().sort((a, b) =>
                (TIER_RANK[a.sizeTier] ?? 1) - (TIER_RANK[b.sizeTier] ?? 1) ||
                gbOf(depsOf(a)) - gbOf(depsOf(b)))[0];
            set.push({
                model: best,
                ops: best.supportedOps || [],
                covers: members.filter(m => m !== best).map(m => m.id),
                gb: gbOf(depsOf(best)),
            });
        }
    }

    // Both branches land here. The scoped branch used to `return` above and skip all of
    // it, leaving set.totalGb undefined — `--models` died in printPlan before it rented
    // anything. Nothing downstream may assume it ran the full matrix.
    // Union, so shared VAEs/encoders are counted once — the per-row sum over-states it.
    const union = new Set();
    set.forEach(e => depsOf(e.model).forEach(i => union.add(i)));
    set.totalGb = gbOf(union);
    set.depIds = [...union];
    set.skippedWeights = Object.keys(DEPS)
        .filter(i => isWeight(DEPS[i]) && !union.has(i) && MODELS.some(m => depsOf(m).includes(i)))
        .map(i => `${i}(${DEPS[i].size})`);

    // What this run will NOT prove — models whose class_type set NO member of this run
    // touches. A full run is empty here by construction. A scoped run lists the other
    // FAMILIES it left out, not the siblings of the one it ran.
    const proven = new Set(set.flatMap(e => [e.model.id, ...e.covers]));
    set.scope = {
        requested: only?.length ? only : 'all',
        modelsRun: set.map(e => e.model.id),
        covers: [...new Set(set.flatMap(e => e.covers))],   // two siblings picked = one family covered
        unproven: MODELS.map(m => m.id).filter(id => !proven.has(id)),
        modelsInRegistry: MODELS.length,
    };
    return set;
}

function printPlan(reg, set) {
    const { resolveWorkflowFile } = reg;
    log(`\n── Smoke set ── ${DATACENTER} · arch=${ARCH} · engine=${ENGINE}`);
    let ops = 0;
    for (const e of [...set].sort((a, b) => b.gb - a.gb)) {
        const covers = e.covers.length ? `  covers ${e.covers.join(', ')}` : '';
        log(`${e.gb.toFixed(1).padStart(7)} GB  ${e.model.id.padEnd(22)} tier=${(e.model.sizeTier || '-').padEnd(9)} ops=${e.ops.length}${covers}`);
        for (const op of e.ops) {
            const f = resolveWorkflowFile(e.model, op, ENGINE, { variantTokens: { arch: ARCH } });
            const missing = f && !existsSync(path.join(WF_DIR, f)) ? '   ← FILE MISSING' : '';
            log(`            ${op.padEnd(18)} ${f || '(no workflow)'}${missing}`);
            ops++;
        }
    }
    log(`\n  models ${set.length} · ops ${ops} · weights ${set.totalGb.toFixed(1)} GB` +
        ` · volume ${Math.ceil((set.totalGb + VOLUME_HEADROOM_GB) / 10) * 10} GB`);
    log(`  budget: ${BUDGET.steps} step · ${BUDGET.edge}px target · ${BUDGET.frames} frame(s) · seed ${BUDGET.seed}`);
    if (set.scope.unproven.length) {
        log(`\n  SCOPED RUN — ${set.scope.unproven.length} of ${set.scope.modelsInRegistry} models are in no family this`);
        log(`  run touches, so nothing here proves them:`);
        log(`    ${set.scope.unproven.join(', ')}`);
    }
    if (set.skippedWeights?.length) {
        log(`\n  NOT loaded by this set (${set.skippedWeights.length}) — a break tied to the weight FORMAT`);
        log(`  under the same loader node would be missed:\n    ${set.skippedWeights.join('\n    ')}`);
    }
    return ops;
}

// ── 2. Minimize a graph ──────────────────────────────────────────────────────
// Generic, by node TITLE — the same convention the injector uses, so it survives graph
// edits. A per-graph override table would rot the moment a workflow changed.
// Divisibility is why BUDGET.edge is a TARGET: video graphs reject arbitrary sizes, so
// clamp UP to what the graph's existing value is divisible by rather than forcing 128.

const TITLE_RULES = [
    [/^Input_Width$/i, (cur) => snapDown(cur, BUDGET.edge)],
    [/^Input_Height$/i, (cur) => snapDown(cur, BUDGET.edge)],
    [/^Input_Steps$/i, () => BUDGET.steps],
    [/^Input_Frames$/i, (cur) => snapFrames(cur)],
    [/^Input_Seed$/i, () => BUDGET.seed],
];

/** Largest multiple of the current value's divisibility that is <= target, min one unit. */
function snapDown(cur, target) {
    const n = Number(cur);
    if (!Number.isFinite(n) || n <= 0) return target;
    const div = [64, 32, 16, 8].find(d => n % d === 0) || 8;
    return Math.max(div, Math.floor(target / div) * div);
}

/** Video frame counts are typically 4n+1 (LTX, Wan). Keep the form, take the floor. */
function snapFrames(cur) {
    const n = Number(cur);
    if (!Number.isFinite(n) || n <= 1) return BUDGET.frames;
    return n % 4 === 1 ? 5 : Math.max(1, BUDGET.frames);
}

export function minimizeGraph(graph) {
    const applied = [];
    for (const node of Object.values(graph)) {
        const title = node?._meta?.title;
        if (!title) continue;
        for (const [re, fn] of TITLE_RULES) {
            if (!re.test(title)) continue;
            const key = Object.keys(node.inputs || {}).find(k => typeof node.inputs[k] !== 'object');
            if (!key) continue;
            const before = node.inputs[key];
            const after = fn(before);
            if (after !== before) { node.inputs[key] = after; applied.push(`${title}=${after}`); }
        }
    }
    return applied;
}

/** Set an injectable node's value by exact title. Returns false when no node matches — */
/** injection SILENTLY SKIPS an unmatched title, which is the trap add-model documents. */
export function injectByTitle(graph, title, value) {
    let hit = false;
    for (const node of Object.values(graph)) {
        if (node?._meta?.title !== title) continue;
        const key = Object.keys(node.inputs || {}).find(k => typeof node.inputs[k] !== 'object');
        if (key) { node.inputs[key] = value; hit = true; }
    }
    return hit;
}

// ── 3. Volume + pods ─────────────────────────────────────────────────────────

async function ensureVolume(gb) {
    const want = Math.ceil((gb + VOLUME_HEADROOM_GB) / 10) * 10;
    const { volumes = [], networkVolumes = [] } = await app('/runpod/volumes');
    const list = volumes.length ? volumes : networkVolumes;
    const fits = list.find(v => v.dataCenterId === DATACENTER && Number(v.size) >= want);
    if (fits) { log(`  volume: reusing ${fits.id} (${fits.size} GB, ${fits.name || 'unnamed'})`); return fits; }

    const tooSmall = list.filter(v => v.dataCenterId === DATACENTER);
    if (tooSmall.length) {
        log(`  volume: ${tooSmall.map(v => `${v.name || v.id}=${v.size}GB`).join(', ')} — all under ${want} GB`);
    }
    log(`  volume: creating ${VOLUME_NAME} ${want} GB in ${DATACENTER}`);
    const made = await app('/runpod/volumes', {
        method: 'POST',
        body: JSON.stringify({ name: VOLUME_NAME, size: want, dataCenterId: DATACENTER }),
    });
    return made.volume || made;
}

async function pickGpu(volumeId) {
    if (opt('gpu')) return { id: opt('gpu'), displayName: opt('gpu') };
    const avail = await app('/runpod/gpu-availability');
    const gpus = avail.gpuTypes || avail.gpus || [];
    for (const want of GPU_ORDER) {
        const hit = gpus.find(g =>
            `${g.displayName || g.id}`.toLowerCase().includes(want.toLowerCase()) &&
            (g.stockStatus == null || `${g.stockStatus}`.toLowerCase() !== 'none'));
        if (hit) { log(`  gpu: ${hit.displayName || hit.id} (preferred #${GPU_ORDER.indexOf(want) + 1})`); return hit; }
    }
    die(`no preferred GPU available in ${DATACENTER}. Wanted, in order: ${GPU_ORDER.join(' → ')}`);
}

async function waitReady(what, probe, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        try { if (await probe()) return true; } catch { /* keep polling */ }
        process.stdout.write('.');
        await sleep(5000);
    }
    die(`${what} did not become ready within ${Math.round(timeoutMs / 60000)} min`);
}

/** Gate 7 of the playbook: prove the Pod runs the engine we THINK we are smoking. */
/** Smoking an unrebuilt image validates the OLD engine and stamps the bump safe. */
async function assertPodEngineVersion() {
    const lock = JSON.parse(readFileSync(path.join(REPO, 'dev_configs/node_lock.json'), 'utf8'));
    const want = lock.comfyui.core.tag.replace(/^v/, '');
    const status = await app('/remote/comfy/status');
    const got = String(status.comfyVersion || status.version || '').replace(/^v/, '');
    if (!got) {
        log(`  ⚠ Pod reported no engine version — cannot prove it is on ${want}. See playbook gate 7.`);
        return { want, got: null, proven: false };
    }
    if (got !== want) die(`Pod runs ComfyUI ${got}, node_lock pins ${want}. Rebuild the Pod image first (playbook gate 6) — smoking now would validate the OLD engine.`);
    log(`  engine: Pod reports ${got}, matches node_lock ✓`);
    return { want, got, proven: true };
}

// ── 4. Execute ───────────────────────────────────────────────────────────────

async function stageProbeImage() {
    const sharp = (await import('sharp')).default;
    const png = await sharp({
        create: { width: BUDGET.edge, height: BUDGET.edge, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).png().toBuffer();
    const out = path.join(REPO, '.smoke-probe.png');
    writeFileSync(out, png);
    return out;
}

async function runOp(reg, model, op, probeImage) {
    const { resolveWorkflowFile, COMMANDS } = reg;
    const file = resolveWorkflowFile(model, op, ENGINE, { variantTokens: { arch: ARCH } });
    if (!file) return { op, status: 'SKIP', why: 'no workflow mapped' };
    const p = path.join(WF_DIR, file);
    if (!existsSync(p)) return { op, status: 'SKIP', why: `workflow file missing: ${file}` };

    const graph = JSON.parse(readFileSync(p, 'utf8'));

    // The model's own branch selector — one graph serving many ops (klein-4b: 7 branches).
    for (const [title, value] of Object.entries(model.opInject?.[op] || {})) {
        if (!injectByTitle(graph, title, value)) {
            return { op, status: 'FAIL', why: `opInject title "${title}" matches no node — the graph would run the WRONG branch` };
        }
    }
    for (const mi of COMMANDS[op]?.mediaInputs || []) {
        if (!mi.required) continue;
        if (mi.mediaType !== 'image') return { op, status: 'SKIP', why: `needs a ${mi.mediaType} input; only images are staged` };
        injectByTitle(graph, mi.title, probeImage);
    }
    const applied = minimizeGraph(graph);

    const { prompt_id } = await app('/proxy/prompt', {
        method: 'POST', body: JSON.stringify({ prompt: graph }),
    });
    if (!prompt_id) return { op, status: 'FAIL', why: 'no prompt_id returned' };

    const t0 = Date.now();
    while (Date.now() - t0 < 15 * 60 * 1000) {
        await sleep(4000);
        const h = await app(`/proxy/history/${prompt_id}`).catch(() => null);
        const rec = h?.[prompt_id];
        if (!rec) continue;
        const st = rec.status || {};
        if (st.status_str === 'error' || st.completed === false && st.messages?.some(m => m[0] === 'execution_error')) {
            const err = st.messages?.find(m => m[0] === 'execution_error')?.[1];
            return { op, status: 'FAIL', why: `${err?.node_type || '?'}: ${String(err?.exception_message || 'execution_error').slice(0, 180)}`, budget: applied };
        }
        if (st.completed) {
            const outs = Object.values(rec.outputs || {});
            const media = outs.reduce((n, o) => n + (o.images?.length || 0) + (o.gifs?.length || 0) + (o.videos?.length || 0), 0);
            if (!media) return { op, status: 'FAIL', why: 'completed but produced no media', budget: applied };
            return { op, status: 'PASS', secs: Math.round((Date.now() - t0) / 1000), media, budget: applied };
        }
    }
    return { op, status: 'FAIL', why: 'timed out after 15 min' };
}

// ── 5. Main ──────────────────────────────────────────────────────────────────

async function main() {
    const reg = await loadRegistry();
    const only = opt('models')?.split(',').map(s => s.trim()).filter(Boolean);
    const set = resolveSmokeSet(reg, only);
    const opCount = printPlan(reg, set);

    if (PLAN_ONLY) { log('\n--plan: nothing rented, nothing spent.\n'); return; }

    log(`\n── Live run ──`);
    const volume = await ensureVolume(set.totalGb);
    log(`  installing ${set.depIds.length} deps on a CPU Pod (download mode)…`);
    // ponytail: install via the app's normal per-model route. Same queue, same SSE, same
    // code users hit — a bespoke bulk installer would be a second path to keep correct.
    for (const e of set) {
        await app('/comfy/models/download/start', {
            method: 'POST',
            body: JSON.stringify({ modelId: e.model.id, dependencies: reg.resolveDeps(e.model, null, null, ENGINE, { arch: ARCH }).map(id => reg.DEPS[id]).filter(Boolean) }),
        });
    }
    await waitReady('model install', async () => {
        const s = await app('/comfy/downloads/status');
        return !(s.jobs || []).some(j => j.status === 'downloading' || j.status === 'queued');
    }, 6 * 60 * 60 * 1000);

    const gpu = await pickGpu(volume.id);
    await app('/remote/pod/create', {
        method: 'POST',
        body: JSON.stringify({ gpuTypeId: gpu.id, volumeId: volume.id, datacenter: DATACENTER, minMemoryInGb: MIN_RAM_GB }),
    });
    await waitReady('GPU Pod', async () => (await app('/remote/comfy/status')).ready, 20 * 60 * 1000);
    const engine = await assertPodEngineVersion();

    const probe = await stageProbeImage();
    const results = [];
    for (const e of set) {
        for (const op of e.ops) {
            const r = await runOp(reg, e.model, op, probe).catch(err => ({ op, status: 'FAIL', why: err.message }));
            results.push({ model: e.model.id, ...r });
            log(`  ${r.status.padEnd(4)} ${e.model.id}/${op}${r.why ? ' — ' + r.why : ` (${r.secs}s, ${r.media} out)`}`);
        }
    }

    // ── report. A SKIP is never folded into the pass count. That is the whole card.
    const n = (s) => results.filter(r => r.status === s).length;
    const skipped = results.filter(r => r.status === 'SKIP').map(r => `${r.model}/${r.op}`);
    log(`\nPASS ${n('PASS')} · SKIP ${n('SKIP')}${skipped.length ? ` (${skipped.join(', ')})` : ''} · FAIL ${n('FAIL')}`);
    log(`budget applied: ${BUDGET.steps} step · ${BUDGET.edge}px target · seed ${BUDGET.seed}`);
    if (set.scope.unproven.length) {
        log(`SCOPED — ${set.scope.unproven.length} of ${set.scope.modelsInRegistry} models UNPROVEN: ${set.scope.unproven.join(', ')}`);
    }
    log(`Pod-green is NOT Windows-green — the local portable half is playbook gate 5.`);

    const evidence = {
        at: new Date().toISOString(), engine, datacenter: DATACENTER,
        gpu: gpu.displayName || gpu.id, volume: { id: volume.id, size: volume.size },
        budget: BUDGET, results,
        counts: { pass: n('PASS'), skip: n('SKIP'), fail: n('FAIL'), opsPlanned: opCount },
        // What this file does NOT prove. Without it a `--models klein-4b` run writes an
        // evidence file that reads exactly like the full matrix: 7 pass, 0 fail. The
        // runner refuses to fold an in-run SKIP into the pass count; a whole FAMILY
        // excluded by --models never becomes a result row at all, which is the same lie
        // one level up. `covers` is not a gap — a sibling on the same workflow is proven.
        scope: set.scope,
        limits: [
            'Pod-green is not Windows-green: different OS, python, torch, CUDA.',
            'Deduped by class_type set — a break tied to weight FORMAT under the same loader node is not covered.',
            'Proves a graph RUNS; does not judge output quality.',
            ...(set.scope.unproven.length
                ? [`SCOPED RUN: ${set.scope.unproven.length} of ${set.scope.modelsInRegistry} models are in no family this run touched — ${set.scope.unproven.join(', ')}.`]
                : []),
        ],
        skippedWeights: set.skippedWeights,
    };
    writeFileSync(path.join(REPO, 'dev_configs/smoke-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    log(`evidence: dev_configs/smoke-evidence.json`);

    if (!flag('keep-volume')) {
        log(`\nVolume ${volume.id} (${volume.size} GB): keep ≈ $20/month · delete = ~${set.totalGb.toFixed(0)} GB re-downloaded next run (hours, pennies).`);
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const ans = (await rl.question('Delete the volume? [y/N] ')).trim().toLowerCase();
        rl.close();
        if (ans === 'y') { await app(`/runpod/volumes/${volume.id}`, { method: 'DELETE' }); log('  deleted.'); }
        else log('  kept.');
    }
    await app('/remote/pod/delete-active', { method: 'POST' }).catch(() => log('  ⚠ could not delete the Pod — check RunPod.'));

    if (n('FAIL')) process.exit(1);
}

// demo(): the pure half runs with no app, no Pod, no network.
if (flag('self-check')) {
    const g = {
        1: { class_type: 'X', _meta: { title: 'Input_Width' }, inputs: { value: 1024 } },
        2: { class_type: 'X', _meta: { title: 'Input_Steps' }, inputs: { value: 30 } },
        3: { class_type: 'X', _meta: { title: 'Input_Frames' }, inputs: { value: 121 } },
        4: { class_type: 'X', _meta: { title: 'Input_wf_type' }, inputs: { value: 0 } },
        5: { class_type: 'Y', inputs: { latent: ['1', 0] } },
    };
    const applied = minimizeGraph(g);
    const assert = (c, m) => { if (!c) { console.error(`self-check FAILED: ${m}`); process.exit(1); } };
    assert(g[1].inputs.value === 128, `width 1024 -> 128, got ${g[1].inputs.value}`);
    assert(g[2].inputs.value === 1, `steps -> 1, got ${g[2].inputs.value}`);
    assert(g[3].inputs.value === 5, `121 is 4n+1 so frames -> 5, got ${g[3].inputs.value}`);
    assert(g[4].inputs.value === 0, 'minimizer must not touch a branch selector');
    assert(g[5].inputs.latent[0] === '1', 'minimizer must never rewrite a link');
    assert(injectByTitle(g, 'Input_wf_type', 4) && g[4].inputs.value === 4, 'injectByTitle sets by title');
    assert(injectByTitle(g, 'Input_Nonexistent', 1) === false, 'injectByTitle reports a miss (silent skip is the trap)');
    assert(snapDown(1216, 128) === 128 && snapDown(768, 128) === 128, 'snapDown lands on a legal multiple');
    console.log(`self-check OK (${applied.join(', ')})`);
    process.exit(0);
}

main().catch(e => die(e.stack || e.message));
