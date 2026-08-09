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

import { readFileSync, writeFileSync, existsSync, openSync, writeSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
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
const CPU_SENTINEL = '__cpu__';        // download-mode Pod (MPI-88); slim -cpu image, no GPU bill
const ENGINE = 'remote';
const ARCH = 'modern';                 // L4/3090/4090 are all 'modern' (gpuArch.js)

// ── The per-op budget. Written down so a later run cannot quietly get weaker.
const BUDGET = { steps: 1, edge: 128, frames: 1, seed: 42 };
// No byte movement for this long, while the job still says it is downloading, means the
// Pod is gone — not that the file is big. 10 min clears the slowest legitimate gap
// (a hash verify on a 40 GB weight) without letting a dead Pod run the clock out.
const STALL_MS = 10 * 60 * 1000;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const PLAN_ONLY = flag('plan');

// A 15-minute failure on a rented GPU with no record is a failure you diagnose by
// guessing. The second matrix's minimax-h3/t2v_ms timeout had NO evidence anywhere:
// the run went to 20:23Z while app.log stopped at 19:16Z (the app logs nothing for a
// successful proxy hop, so silence is normal), the wrapper mirrors ComfyUI stdout to
// the POD console only, and teardown deletes the Pod. The whole transcript was terminal
// scrollback and died with the terminal. So tee it next to the evidence it explains.
// Truncated per run, like smoke-evidence.json — one file describing one matrix.
// .txt, NOT .log: .gitignore:54 is a blanket *.log, and a transcript that cannot be
// committed alongside the evidence it explains is the gap this exists to close.
const RUN_LOG = path.join(REPO, 'dev_configs/smoke-run.txt');
let _runLogFd = null;
// STAMPED in the file, bare on the console. "It failed around 19:55Z" is only useful
// next to a line that says what the runner was doing at 19:55Z.
function _transcribe(line) {
    try {
        _runLogFd ??= openSync(RUN_LOG, 'w');
        writeSync(_runLogFd, `[${new Date().toISOString()}] ${line}\n`);
    } catch { /* a transcript that cannot be written must never abort a paid run */ }
}
const log = (...a) => { console.log(...a); _transcribe(a.map(String).join(' ')); };
const die = (m) => { console.error(`\n✗ ${m}`); _transcribe(`✗ ${m}`); process.exit(1); };

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

// The model's declared speed/quality control. The shipped graph BAKES the SLOW value -
// krea2_t2i_nsfw.json bakes Input_is_Turbo FALSE while the app itself defaults krea2Turbo
// TRUE - and those graphs carry NO Input_Steps node, so the 1-step budget cannot reach
// them: measured 2026-08-08, krea2 ops ran 75-187s against 4-38s elsewhere.
// CAPABILITY-GATED, never by title alone. klein_t2i.json carries Input_is_Turbo while
// klein-4b declares turboToggle:false (its base+turbo pair was dropped), and chroma's
// Input_Tier selects Flash-vs-Hyper rather than speed - a title-only rule would flip both.
// Values: Input_Tier is 1-indexed 1=Quality 2=Turbo 3=Hyper (js/data/promptControlDefaults.js).
const FAST_TIER = [
    ['turboToggle', 'Input_is_Turbo', true],
    ['tierSelect', 'Input_Tier', 3],
];

/** Fastest tier a model declares it supports. Reported, never silent - a run that stops */
/** applying one must SAY so rather than quietly get slower. */
export function applyFastTier(graph, model) {
    const applied = [];
    for (const [cap, title, value] of FAST_TIER) {
        if (!model?.capabilities?.[cap]) continue;
        applied.push(`${title}=${injectByTitle(graph, title, value) ? value : 'ABSENT'}`);
    }
    return applied;
}

/** Flatten ComfyUI's node_errors into one line, or null when the prompt validated whole. */
/** Slot names differ by node - an MpiStyleLoras bank names its inputs lora_1..lora_5, not */
/** lora_name (MPI-359) - so read extra_info.input_name rather than matching a literal. */
export function summarizeNodeErrors(nodeErrors) {
    const ids = Object.keys(nodeErrors || {});
    if (!ids.length) return null;
    const parts = [];
    for (const id of ids) {
        const n = nodeErrors[id] || {};
        for (const e of n.errors || []) {
            const slot = e?.extra_info?.input_name;
            const got = e?.extra_info?.received_value;
            parts.push(`${n.class_type || id}${slot ? '.' + slot : ''}${got === undefined ? '' : `=${got}`}`);
        }
    }
    return parts.slice(0, 6).join(', ') + (parts.length > 6 ? ` (+${parts.length - 6} more)` : '');
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
    // GET /runpod/volumes answers a BARE ARRAY. Destructuring `{volumes, networkVolumes}`
    // off it yields two undefineds, so the reuse check saw an empty list and minted a NEW
    // 350 GB volume on every run — three of them before it was caught (2026-08-08), each
    // billing monthly for weights already sitting on the last one. Never infer a route's
    // response shape; this one was one curl away.
    const raw = await app('/runpod/volumes');
    const list = Array.isArray(raw) ? raw : (raw.volumes || raw.networkVolumes || []);
    // --volume pins an exact id. With several same-named volumes only the caller knows
    // which one holds the weights, and "first that fits" would happily pick an empty twin.
    const pin = opt('volume');
    if (pin) {
        const hit = list.find(v => v.id === pin);
        if (!hit) die(`--volume ${pin} is not one of: ${list.map(v => v.id).join(', ') || '(none)'}`);
        log(`  volume: pinned ${hit.id} (${hit.size} GB, ${hit.name || 'unnamed'})`);
        return hit;
    }
    const sameName = list.filter(v => v.dataCenterId === DATACENTER && v.name === VOLUME_NAME);
    if (sameName.length > 1) {
        die(`${sameName.length} volumes named ${VOLUME_NAME} in ${DATACENTER} (${sameName.map(v => v.id).join(', ')}). ` +
            `Delete the spares or pin one with --volume <id> — picking blind risks smoking an EMPTY volume.`);
    }
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
    // EXACT name match, never a substring. `includes('l4')` also matches L40 and L40S —
    // different cards at a different price — and 'RTX 3090' also matches 3090 Ti. L4
    // happening to sort first in RunPod's array is luck, not logic, and luck silently
    // rents the wrong card.
    // Availability: the payload has NO stockStatus field, so the guard that used to sit
    // here (`g.stockStatus == null || ...`) could never fire and this function never
    // actually checked stock. The real signal in this response is `lowestPrice`: an
    // unavailable type reports nulls (measured 2026-08-08 — MI300X null, while
    // L4/3090/4090 reported 55/30/31).
    const named = (g) => `${g.displayName || g.id}`.toLowerCase();
    const inStock = (g) => (g.lowestPrice && g.lowestPrice.minMemory != null);
    for (const want of GPU_ORDER) {
        const match = gpus.filter(g => named(g) === want.toLowerCase());
        const hit = match.find(inStock);
        if (hit) { log(`  gpu: ${hit.displayName || hit.id} (preferred #${GPU_ORDER.indexOf(want) + 1})`); return hit; }
        if (match.length) log(`  ${want}: present but reporting no availability — next choice`);
    }
    die(`no preferred GPU available in ${DATACENTER}. Wanted, in order: ${GPU_ORDER.join(' → ')}. `
        + `Types offered: ${gpus.map(g => `${g.displayName || g.id}${inStock(g) ? '' : ' (no stock)'}`).join(', ')}`);
}

/** @param {{soft?:boolean}} [o] soft → return false on timeout instead of exiting */
async function waitReady(what, probe, timeoutMs, o = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        try { if (await probe()) return true; } catch { /* keep polling */ }
        process.stdout.write('.');
        await sleep(5000);
    }
    if (o.soft) { log(`\n  ⚠ ${what} did not become ready within ${Math.round(timeoutMs / 60000)} min`); return false; }
    die(`${what} did not become ready within ${Math.round(timeoutMs / 60000)} min`);
}

/**
 * Create a Pod and REPLACE IT if its wrapper never answers.
 *
 * RunPod reports `RUNNING` for a Pod whose container is failing to start — seen live
 * 2026-08-08, a Pod looping `error creating container: cant create container; network
 * must exist` for minutes while every app-side probe said RUNNING. There is no signal
 * for this short of the wrapper answering, and a run that just keeps polling waits
 * forever on a host that will never work. So: give the boot a budget, then throw the
 * host away and ask for another one.
 */
async function createPodWithRetry(spec, label, readyMs, attempts = 3) {
    _podLive = false;
    for (let a = 1; a <= attempts; a++) {
        log(`\n  ${label}: create (attempt ${a}/${attempts})…`);
        const made = await app('/remote/pod/create', { method: 'POST', body: JSON.stringify(spec) });
        if (made && made.error) {
            log(`  ⚠ create refused: ${made.message || made.error}`);
        } else if (await waitReady(label, async () => (await app('/remote/comfy/status')).ready, readyMs, { soft: true })) {
            _podLive = true;
            return true;
        }
        log(`  recycling the Pod — RUNNING with no wrapper is a dead host, not a slow one`);
        await app('/remote/pod/delete-active', { method: 'POST' }).catch(() => { });
        await sleep(5000);
    }
    die(`${label} never came up in ${attempts} attempts. RunPod capacity or image pull is broken in ${DATACENTER} right now.`);
}

/**
 * A rented Pod OUTLIVES a crashed script. `die` is process.exit(1) and deletes nothing,
 * so every failure after a create leaked the rental until a human noticed the bill.
 * eb89f59f closed that for the create itself (createPodWithRetry deletes before each
 * retry and before it gives up); everything downstream of a successful create was still
 * open — an engine mismatch, a failed probe upload, a 502 from any app() call, any throw
 * caught by main(). One flag plus one wrapper closes the tail. Deleting the Pod is also
 * the SAFE direction with a fill in flight: it is cancelling WITH a Pod attached that
 * deletes partials off the volume, never the delete itself.
 */
let _podLive = false;
async function abort(msg) {
    if (_podLive) {
        log(`
  deleting the live Pod before exit — an abandoned rental bills until someone notices…`);
        await app('/remote/pod/delete-active', { method: 'POST' }).catch(() => log('  ⚠ delete FAILED — check RunPod by hand, now.'));
        _podLive = false;
    }
    die(msg);
}

/** The manifest is stamped by the wrapper DURING boot (_stamp_manifest_provenance) and
 *  /remote/pod/manifest 409s until the app has flipped remote-active - so a SINGLE read
 *  races both and reports a missing comfyui_ref that is merely LATE. That aborted a run
 *  on 2026-08-08 four poll-ticks after create, on a Pod whose image was correctly built
 *  from 0.30.0 and which had proved it twice an hour earlier. Poll until the field shows
 *  up or the window closes; a genuinely unstamped image still aborts, just later. */
async function readPodManifestWithRef(timeoutMs = 3 * 60 * 1000) {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeoutMs) {
        const m = await app('/remote/pod/manifest').catch(() => null);
        if (m?.comfyui_ref) return m;
        if (m) last = m;
        await sleep(5000);
    }
    if (last) {
        // Answered, but without the field - say WHAT it held, or the next reader has to
        // guess between "route never answered" and "image was built without the arg".
        log(`  manifest answered without comfyui_ref; keys: ${Object.keys(last).join(', ') || '(empty)'}`);
    } else {
        log(`  /remote/pod/manifest never answered in ${Math.round(timeoutMs / 60000)} min`);
    }
    return last;
}

// ── Hot store ────────────────────────────────────────────────────────────────
// The app stages a model's weights onto the Pod's fast container disk BEFORE it
// generates (commandExecutor _ensureRemoteHotStore, MPI-194/329). The runner POSTs
// straight to /proxy/prompt, so it never asked - and every op therefore read its
// weights off the NETWORK VOLUME. Measured 2026-08-08: container disk sat at 1 GB of
// 455 GB for a whole matrix while the volume served every load. SAME bypass class as
// the separator heal: a runner that skips the app's own preparation is not smoking the
// product, and here it pays volume-read latency on every model, in GPU minutes.
// Mirrors commandExecutor's filter exactly - do not re-derive it: >= HOT_STORE_MIN_GB,
// and never a file LARGER than VRAM (it cannot stay resident, and a huge copy hogs the
// wrapper's single hot-store lock).
const HOT_STORE_MIN_GB = 0.1;   // js/services/commandExecutor.js:453

/** VRAM of the Pod's GPU, or null when unknown (null = no cap, same as the app). */
async function podVramGb(gpuTypeId) {
    const d = await app(`/remote/pod/specs?gpuTypeId=${encodeURIComponent(gpuTypeId)}`).catch(() => null);
    const v = Number(d?.vramGb);
    return Number.isFinite(v) && v > 0 ? v : null;
}

/** Hot-store file list for a model. Exported for --self-check: the filename split is */
/** the fiddly part (the comfy subdir is the FIRST path segment, not dep.type). */
export function hotStoreFiles(reg, model, vramGb) {
    const { DEPS, resolveDeps, sizeToGb } = reg;
    return resolveDeps(model, model.supportedOps || null, null, ENGINE, { arch: ARCH })
        .map(id => DEPS[id])
        .filter(d => d && d.filename
            && sizeToGb(d.size) >= HOT_STORE_MIN_GB
            && (!vramGb || sizeToGb(d.size) <= vramGb))
        .map(d => {
            const slash = d.filename.indexOf('/');
            if (slash < 0) return null;
            return {
                type: d.type || d.filename.slice(0, slash),
                filename: d.filename.slice(slash + 1),
                size_bytes: Math.round(sizeToGb(d.size) * (1024 ** 3)),
                sha256: d.sha256 || '',
            };
        })
        .filter(Boolean);
}

/** Stage one model's weights. Non-fatal: the volume copy still works, just slower. */
async function stageModelOnPod(reg, model, vramGb) {
    const files = hotStoreFiles(reg, model, vramGb);
    if (!files.length) return;
    const res = await app('/remote/hot-store/ensure', {
        method: 'POST', body: JSON.stringify({ files }),
    }).catch(() => null);
    if (!res) { log(`  hot-store: ensure failed for ${model.id} - generating from volume`); return; }
    const staged = (res.results || []).filter(r => r.staged).length;
    log(`  hot-store: ${staged}/${files.length} file(s) on Pod disk`);
}

/** Gate 7 of the playbook: prove the Pod runs the engine we THINK we are smoking. */
/** Smoking an unrebuilt image validates the OLD engine and stamps the bump safe. */
async function assertPodEngineVersion() {
    const lock = JSON.parse(readFileSync(path.join(REPO, 'dev_configs/node_lock.json'), 'utf8'));
    const want = lock.comfyui.core.tag.replace(/^v/, '');
    // `comfyui_ref` in the Pod manifest is the ONLY record of which ComfyUI the running
    // image was built from (wrapper _stamp_manifest_provenance, from the CUBRIC_COMFYUI_REF
    // build arg). This read USED to be `/remote/comfy/status`.comfyVersion — a field that
    // route has never returned. It answers {running, ready, comfyReady, wrapperVersion,
    // connecting, connectElapsedMs, noGpu}, and the wrapper's /health only adds
    // wrapper_version, so `got` was ALWAYS '' and the mismatch die() below was dead code.
    // That deadlocked the release: the run wrote engine.got = null, and
    // release-health-check.mjs then refuses that very file for not recording what was
    // smoked (checkSmokeEvidence, "cannot prove WHAT was smoked"). A full GPU matrix could
    // not produce evidence its own gate would accept.
    const manifest = await readPodManifestWithRef();
    const got = String(manifest?.comfyui_ref || '').replace(/^v/, '');
    if (!got) {
        // Continuing here spends a whole GPU matrix on a file release:check will reject,
        // so it stops by default. The flag exists for the honest case: an image baked
        // before the build arg, smoked when the engine has NOT moved (unbumped runs are
        // never gated on evidence).
        const why = `Pod manifest carries no comfyui_ref, so this run cannot prove it is on ${want} (playbook gate 7). `
            + `release:check REFUSES evidence with no engine.got when the pin moved. Re-run with --allow-unproven-engine to smoke anyway.`;
        if (!flag('allow-unproven-engine')) await abort(why);
        log(`  ⚠ ${why}`);
        return { want, got: null, proven: false };
    }
    if (got !== want) await abort(`Pod image was built from ComfyUI ${got}, node_lock pins ${want}. Rebuild the Pod image first (playbook gate 6) — smoking now would validate the OLD engine.`);
    log(`  engine: Pod image built from ${got}, matches node_lock ✓`);
    return { want, got, proven: true };
}

// ── 4. Execute ───────────────────────────────────────────────────────────────

async function stageProbeImage() {
    const sharp = (await import('sharp')).default;
    const png = await sharp({
        create: { width: BUDGET.edge, height: BUDGET.edge, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).png().toBuffer();
    const out = path.join(tmpdir(), 'smoke-probe.png');
    writeFileSync(out, png);
    // The Pod cannot see a Windows path. Upload it and inject the Pod-ABSOLUTE path the
    // loader nodes resolve (`MpiLoadImageFromPath` runs os.path.isfile on the Pod) — the
    // same route the app's own dispatch uses (comfyController._uploadRemoteMedia). Inject
    // the local path instead and every op with a required image self-gates to no output,
    // which reads as a broken model and is not one.
    const up = await app('/remote/upload/media', {
        method: 'POST', body: JSON.stringify({ localPath: out, filename: 'smoke-probe.png' }),
    });
    if (!up?.success || !(up.path || up.name)) await abort('probe image upload to the Pod failed — every op with an image input would self-gate.');
    log(`  probe image on the Pod: ${up.path || up.name}`);
    return up.path || up.name;
}

/**
 * The OFFLINE half of an op: resolve its graph, select its branch, inject the probe and
 * apply the budget. No network. Split out so `--plan` can sweep all 35 ops for free —
 * a mismatched `opInject` title found after a ~300 GB volume fill has already cost the
 * expensive half of the run, and it is a fault the registry alone can prove.
 * @returns {{graph:object,applied:object}|{status:'SKIP'|'FAIL',why:string}}
 */
/**
 * The app heals Windows path separators at injection; this runner does not go through it.
 *
 * `comfyController` § 3b flips `\` to `/` on every path-bearing loader input for any engine
 * whose enum uses `/` — always true of the Linux Pod. The runner loads a workflow off disk
 * and POSTs it straight to /proxy/prompt, so it skipped that heal entirely and every BAKED
 * subfoldered value (75 of them across 14 workflows: `chroma\styles\x`, `krea-2\style\x`,
 * `flux2-klein\styles\x`) hit ComfyUI `value_not_in_list`. ComfyUI validates PER OUTPUT
 * NODE, so the damage varied: where the bad value fed the only output the op produced no
 * media and FAILED; elsewhere that output was dropped and a sibling still rendered, so the
 * op PASSED with its style LoRAs silently missing. Four FAILs on the 2026-08-08 run were
 * this, and they were harness artefacts — the product ships the heal.
 *
 * Kept deliberately as a MIRROR, not an import: comfyController is browser-side (absolute
 * `/js/...` specifiers) and does not load in bare Node. If § 3b's key list changes, change
 * this too — a divergence here reads as a model bug and is not one.
 */
const HEAL_KEYS = ['lora_name', 'upscale_model', 'ckpt_name', 'unet_name', 'model_name', 'vae_name', 'clip_name'];
const HEAL_KEY_RE = /^lora_\d+$/;   // MpiStyleLoras banks slot lora_1..lora_5 (MPI-359)
function healSeparators(graph) {
    let n = 0;
    for (const node of Object.values(graph)) {
        if (!node || !node.inputs) continue;
        for (const k of Object.keys(node.inputs)) {
            if (!HEAL_KEYS.includes(k) && !HEAL_KEY_RE.test(k)) continue;
            const v = node.inputs[k];
            if (typeof v === 'string' && v.includes('\\')) { node.inputs[k] = v.replace(/\\/g, '/'); n++; }
        }
    }
    return n;
}

function prepOp(reg, model, op, probeImage) {
    const { resolveWorkflowFile, COMMANDS } = reg;
    const file = resolveWorkflowFile(model, op, ENGINE, { variantTokens: { arch: ARCH } });
    if (!file) return { status: 'SKIP', why: 'no workflow mapped' };
    const p = path.join(WF_DIR, file);
    if (!existsSync(p)) return { status: 'SKIP', why: `workflow file missing: ${file}` };

    const graph = JSON.parse(readFileSync(p, 'utf8'));

    // The model's own branch selector — one graph serving many ops (klein-4b: 7 branches).
    for (const [title, value] of Object.entries(model.opInject?.[op] || {})) {
        if (!injectByTitle(graph, title, value)) {
            return { status: 'FAIL', why: `opInject title "${title}" matches no node — the graph would run the WRONG branch` };
        }
    }
    for (const mi of COMMANDS[op]?.mediaInputs || []) {
        if (!mi.required) continue;
        if (mi.mediaType !== 'image') return { status: 'SKIP', why: `needs a ${mi.mediaType} input; only images are staged` };
        injectByTitle(graph, mi.title, probeImage);
    }
    healSeparators(graph);
    const fast = applyFastTier(graph, model);
    return { graph, applied: [...fast, ...minimizeGraph(graph)] };
}

/** Free sweep of every op's offline half. Returns the count of hard faults. */
function preflightOps(reg, set) {
    const problems = [];
    for (const e of set) {
        for (const op of e.ops) {
            const r = prepOp(reg, e.model, op, '/workspace/comfyui/input/smoke-probe.png');
            if (r.status) problems.push(`  ${r.status} ${e.model.id}/${op} — ${r.why}`);
        }
    }
    const fails = problems.filter(l => l.trim().startsWith('FAIL')).length;
    if (problems.length) {
        log(`\n  preflight (offline, free): ${problems.length} op(s) would not execute`);
        problems.forEach(l => log(l));
    } else log(`\n  preflight (offline, free): all ops resolve a graph, a branch and a budget ✓`);
    return fails;
}

// A prompt absent from history is normally just RUNNING, so the loop below waits. But a
// prompt absent from history AND from the queue is GONE: ComfyUI holds every accepted
// prompt in one or the other, and only loses it when its own process restarts underneath.
// The signal is available in seconds and the runner used to spend the full 15 minutes
// finding it, then report `timed out`, which reads as a slow model and sent a whole
// session hunting a model bug that was not there (MPI-467: minimax-h3/t2v_ms, 2026-08-08
// ~19:55Z. Its sibling i2v_ms passed at 260s on the same Pod minutes later). Pod-side, only
// POST /wrapper/restart-comfy can do this — an unexpected ComfyUI death takes the whole
// container down with it (wrapper.py ComfyManager._supervise -> os._exit(1); start.sh ends
// in `exec uvicorn` with no respawn), so a Pod that is still answering proves a REQUESTED
// restart, not a crash.
const ORPHAN_GRACE_MS = 30_000;

/** @returns {Promise<string|null>} why the prompt is gone, or null to keep waiting. */
async function orphanReason(promptId, elapsedMs) {
    // Never call orphan on the submit->queue window, and never on a relay blip: a queue
    // read we could not make is not evidence the prompt left.
    if (elapsedMs < ORPHAN_GRACE_MS) return null;
    const q = await app('/proxy/queue').catch(() => null);
    if (!q) return null;
    const queued = [...(q.queue_running || []), ...(q.queue_pending || [])].some(e => e?.[1] === promptId);
    if (queued) return null;
    // Re-read history AFTER the queue. A prompt that finished between the two reads is
    // briefly absent from both, and reporting that as orphaned would fail a PASSING op.
    const again = await app(`/proxy/history/${promptId}`).catch(() => null);
    if (again?.[promptId]) return null;
    // Name the mechanism in the result line, so the next reader does not have to re-derive
    // it. comfyReady is the flag that dips across a restart-comfy while wrapper `ready`
    // stays true the whole time (MPI-107).
    const st = await app('/remote/comfy/status').catch(() => null);
    return `prompt orphaned after ${Math.round(elapsedMs / 1000)}s — gone from history AND queue, `
        + `so ComfyUI restarted under it (comfyReady=${st?.comfyReady ?? '?'}); `
        + `only POST /wrapper/restart-comfy does that, a crash would have taken the Pod down`;
}

async function runOp(reg, model, op, probeImage) {
    const prep = prepOp(reg, model, op, probeImage);
    if (prep.status) return { op, status: prep.status, why: prep.why };
    const { graph, applied } = prep;

    const ack = await app('/proxy/prompt', {
        method: 'POST', body: JSON.stringify({ prompt: graph }),
    });
    const { prompt_id } = ack || {};
    if (!prompt_id) return { op, status: 'FAIL', why: 'no prompt_id returned' };
    // ComfyUI validates PER OUTPUT NODE: validate_prompt succeeds as soon as ONE output
    // survives, and the 200 ack carries node_errors for the ones that did not ({} when
    // clean). Scoring PASS on media count alone therefore reports a graph that rendered
    // from a surviving output while its style-LoRA bank was dropped. Reported by the
    // MPI-495 session, whose app-side half reads the same field. (MPI-495)
    const partial = summarizeNodeErrors(ack.node_errors);
    if (partial) return { op, status: 'FAIL', why: `partial validation: ${partial}`, budget: applied };

    const t0 = Date.now();
    while (Date.now() - t0 < 15 * 60 * 1000) {
        await sleep(4000);
        const h = await app(`/proxy/history/${prompt_id}`).catch(() => null);
        const rec = h?.[prompt_id];
        if (!rec) {
            const gone = await orphanReason(prompt_id, Date.now() - t0);
            if (gone) return { op, status: 'FAIL', why: gone, budget: applied };
            continue;
        }
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
    // Give up on the OP, but never leave it executing: ComfyUI runs one prompt at a time,
    // so an abandoned job makes every later op queue behind it and time out in turn - a
    // cascade that reads as many broken models rather than one slow op. Best-effort:
    // a Pod that has already gone away is exactly when this throws, and that is not a
    // reason to lose the FAIL we are about to report.
    await app('/proxy/interrupt', { method: 'POST' }).catch(() => {});
    return { op, status: 'FAIL', why: 'timed out after 15 min', budget: applied };
}

// ── 5. Main ──────────────────────────────────────────────────────────────────

// ── 0. Pod lock preflight ────────────────────────────────────────────────────
// The Pod image bakes its nodes from a DIFFERENT node_lock.json in a DIFFERENT repo, so
// bumping Vision's copy leaves the image on the old engine and the smoke measures the
// wrong thing. That step lived only in the playbook, and a step that lives only in a
// playbook is a step someone forgets — so it runs here, in the command every smoke
// already starts with, at the moment it is actionable.
const POD_REPO = process.env.CUBRIC_POD_REPO || 'c:/AI/Mpi/mpi-ci/cubric-vision-pod';

/**
 * Gate 8: do the shipped workflows only use FIRST-PARTY nodes the pinned commit actually has?
 *
 * `checkPodLock` proves Vision's node_lock and the pod repo's agree. On 2026-08-08 they agreed
 * perfectly - both pinned ComfyUI-MpiNodes at a6e5d5e0 - and both were STALE: `MpiStageLatents`
 * landed in da23e911, SIXTEEN HOURS LATER, and five shipped workflows already used it. Two locks
 * in sync say nothing about whether the pin is new enough for the graphs, so that check can
 * never catch this. The Pod installed MpiNodes at the pin, ComfyUI had no such node type, and
 * all six multi-stage video ops died on `missing_node_type` AFTER a GPU was rented.
 *
 * MpiNodes is code-only and installs to the volume at connect, so the fix is a pin bump with no
 * image rebuild - which is exactly why the pin drifts quietly. One unauthenticated fetch of
 * `__init__.py` at the pinned commit lists every first-party class, so this costs nothing and
 * runs on --plan. Non-first-party packs (Krea2*, Impact, etc.) are NOT checked: they are pinned
 * per-node elsewhere and their absence is a different failure with a different fix.
 */
async function checkFirstPartyNodes(set) {
    const lock = JSON.parse(readFileSync(path.join(REPO, 'dev_configs/node_lock.json'), 'utf8'));
    const entry = (lock.nodes || {})['ComfyUI-MpiNodes'];
    if (!entry || !entry.commit || !entry.repo) {
        log(`\n  WARN node_lock has no ComfyUI-MpiNodes pin - cannot check first-party nodes.`);
        return true;
    }
    const url = `https://raw.githubusercontent.com/${entry.repo}/${entry.commit}/__init__.py`;
    let src;
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        src = await r.text();
    } catch (err) {
        // Offline / rate-limited is not evidence of drift - never block a run on the check itself.
        log(`\n  WARN could not read MpiNodes @ ${entry.commit.slice(0, 8)} (${err.message}) - first-party node check skipped.`);
        return true;
    }
    const have = new Set(src.match(/\bMpi[A-Za-z0-9_]*/g) || []);
    const missing = new Map();
    for (const e of set) {
        for (const op of e.ops) {
            const file = reg_resolveFile(e.model, op);
            if (!file) continue;
            const fp = path.join(WF_DIR, file);
            if (!existsSync(fp)) continue;
            for (const n of Object.values(JSON.parse(readFileSync(fp, 'utf8')))) {
                const ct = n && n.class_type;
                if (typeof ct === 'string' && ct.startsWith('Mpi') && !have.has(ct)) {
                    if (!missing.has(ct)) missing.set(ct, new Set());
                    missing.get(ct).add(`${e.model.id}/${op}`);
                }
            }
        }
    }
    if (!missing.size) {
        log(`\n  first-party nodes: every Mpi* class_type exists at MpiNodes ${entry.commit.slice(0, 8)} OK`);
        return true;
    }
    log(`\n  MpiNodes PIN IS TOO OLD for the shipped workflows - ${missing.size} node type(s) missing:`);
    for (const [ct, ops] of missing) log(`     ${ct} - needed by ${[...ops].join(', ')}`);
    log(`  node_lock pins ${entry.commit.slice(0, 8)}; these classes are not in its __init__.py.`);
    log(`  Bump ComfyUI-MpiNodes in BOTH dev_configs/node_lock.json and the pod repo's node_lock.json.`);
    log(`  MpiNodes is code-only: it reinstalls to the volume at connect, so NO image rebuild is needed.`);
    return false;
}

/**
 * Gate 9: do the shipped graphs SUPPLY every required input of every Mpi* node they use?
 *
 * Gate 8 above proves each Mpi* class EXISTS at the pin. Class existence was never the
 * failing condition, which is how MPI-498 survived two releases and two GPU matrices:
 * `MpiScaledDimensions` gained a REQUIRED `upscale_method` in MpiNodes ba9e156
 * (2026-07-16), six shipped graph nodes never supplied it, and ComfyUI's
 * `execution.py:901` tests `if x not in inputs` and raises `required_input_missing`
 * BEFORE any default is read - so the input's `lanczos` default saved nothing. The
 * prompt was then accepted anyway, because `MpiLoadImageFromPath` subclasses
 * PreviewImage with OUTPUT_NODE=True (img.py:380): the input LOADER is itself a valid
 * output with no upstream deps, so it survived while every real PreviewImage was
 * dropped, and PiD returned THE INPUT IMAGE in 4s. (Diagnosed by the MPI-498 session.)
 *
 * WHY THIS CANNOT BE CAUGHT AT EXPORT. workflow-to-api.mjs already self-checks exactly
 * this (its `holes` pass) against the /object_info it converted with - so a node pack
 * that moves AFTER a graph is frozen on disk is invisible to it, and a hand-edit never
 * runs it at all. Both happened: nvidia_pid.json was last exported in ab9caa71
 * (2026-07-17), a HAND-PATCH twelve minutes after a raw sync. A check on the shipped
 * graphs, independent of how they got there, is the only thing that closes this.
 *
 * WHY /object_info AND NEVER A SOURCE PARSE. ~120 Mpi* nodes in these graphs build
 * INPUT_TYPES PROGRAMMATICALLY (MpiAnySwitch, MpiAnySwitch10, MpiPacker, MpiClearVram,
 * MpiSimpleBoolean, MpiBoolean...), so a static/AST read of the pinned source finds no
 * required-input literal for the MAJORITY of first-party nodes and reports 0 holes.
 * A gate that silently passes most of what it claims to cover is worse than none, so
 * this asks a live engine what actually registered. When no engine answers it says
 * NOT CHECKED and never reports green.
 *
 * Trusted only when the local MpiNodes checkout is exactly at the pinned commit -
 * otherwise the answer describes a different node pack than the Pod will install.
 */
const MPINODES_REPO = process.env.CUBRIC_MPINODES_REPO || 'c:/AI/Mpi/ComfyUi-MpiNodes';
const LOCAL_ENGINES = [process.env.COMFY_URL, 'http://127.0.0.1:8188', 'http://127.0.0.1:48188'].filter(Boolean);

/**
 * The whole gate, as a pure function so --self-check can exercise it and a historical
 * graph can be replayed straight out of git without touching the working tree.
 * @returns {string[]} one line per hole, empty when the graph is complete.
 */
function requiredInputHoles(graph, objectInfo) {
    const holes = [];
    for (const [id, n] of Object.entries(graph)) {
        const ct = n && n.class_type;
        // Mpi* only. A third-party pack is pinned per-node elsewhere and the local copy may
        // legitimately differ from the Pod's, so its `required` set is not evidence here.
        if (typeof ct !== 'string' || !ct.startsWith('Mpi')) continue;
        const req = objectInfo[ct]?.input?.required;
        if (!req) continue;                       // an absent class is gate 8's finding, not this one
        const have = Object.keys(n.inputs || {});
        // An autogrow / dynamic-combo group is emitted as `<name>.<sub>` entries and never as
        // the bare name, so a prefix hit satisfies it (the rule the converter's own self-check
        // uses). Without this, every H3 reference slot reads as missing.
        const missing = Object.keys(req).filter(k => !have.some(h => h === k || h.startsWith(`${k}.`)));
        if (missing.length) holes.push(`${id} ${ct} — missing: ${missing.join(', ')}`);
    }
    return holes;
}

async function checkRequiredInputs(set) {
    const lock = JSON.parse(readFileSync(path.join(REPO, 'dev_configs/node_lock.json'), 'utf8'));
    const pin = (lock.nodes || {})['ComfyUI-MpiNodes']?.commit;
    const skip = (why) => { log(`\n  required inputs: NOT CHECKED — ${why}`); return true; };
    if (!pin) return skip('node_lock has no ComfyUI-MpiNodes pin');

    let head;
    try {
        head = execFileSync('git', ['-C', MPINODES_REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch (err) {
        return skip(`cannot read ${MPINODES_REPO} (${err.message}); set CUBRIC_MPINODES_REPO`);
    }
    if (!head.startsWith(pin) && !pin.startsWith(head)) {
        // Checking against the wrong pack is how you get a confident wrong answer.
        return skip(`local MpiNodes is at ${head.slice(0, 8)}, node_lock pins ${pin.slice(0, 8)} — `
            + `check out the pin (git -C ${MPINODES_REPO} checkout ${pin.slice(0, 8)}) or run /mpi-nodes-sync`);
    }

    let objectInfo = null, from = null;
    for (const base of LOCAL_ENGINES) {
        try {
            const r = await fetch(`${base}/object_info`, { signal: AbortSignal.timeout(15000) });
            if (!r.ok) continue;
            objectInfo = await r.json();
            from = base;
            break;
        } catch { /* try the next one */ }
    }
    if (!objectInfo) {
        return skip(`no local engine answered /object_info (${LOCAL_ENGINES.join(', ')}). `
            + `Start the bench so this gate can run — it is free and it catches MPI-498's class of defect before a GPU is rented.`);
    }

    // EVERY shipped graph, not just the resolved smoke set. NO flow_*.json can ever be
    // reached by a matrix: resolveSmokeSet enumerates models x supportedOps and resolves
    // through model.workflows[op], while flow ops live in flowsRegistry.js and no model
    // declares one. MPI-498 proved the cost — the set would have caught 4 of its 6 nodes,
    // missing both in flow_sdxl_4k.json. That file is being deleted (MPI-332, and the user
    // confirmed it 2026-08-09), so the flow that actually needs this cover is
    // flow_head_swap.json: Head Swap is flow #1 of the real product (MPI-299), carries no
    // MpiScaledDimensions today, and is exposed to the identical class of defect with no
    // other guard anywhere. This check is file-based and free, so sweeping the whole
    // directory costs nothing and needs no maintenance as flows come and go.
    const graphs = readdirSync(WF_DIR).filter(f => f.endsWith('.json')).sort();
    const holes = [];
    for (const file of graphs) {
        let graph;
        try {
            graph = JSON.parse(readFileSync(path.join(WF_DIR, file), 'utf8'));
        } catch (err) {
            holes.push(`     ${file} — unreadable: ${err.message}`);
            continue;
        }
        holes.push(...requiredInputHoles(graph, objectInfo).map(h => `     ${file} node ${h}`));
    }
    if (!holes.length) {
        log(`\n  required inputs: ${graphs.length} shipped graphs sweep clean — every Mpi* node supplies its required inputs ✓ (via ${from}, MpiNodes ${pin.slice(0, 8)})`);
        return true;
    }
    log(`\n  🛑 SHIPPED GRAPHS ARE MISSING REQUIRED INPUTS — ${holes.length} node(s):`);
    holes.forEach(l => log(l));
    log(`  ComfyUI raises required_input_missing on these BEFORE reading any default, then still`);
    log(`  accepts the prompt if some output survives — so the op can score PASS having generated nothing.`);
    log(`  Fix the graph AND its comfy_workflows/raw/ twin (the converter reads widgets_values`);
    log(`  positionally, so a short raw re-drops the input on the next export).`);
    return false;
}

/** Warns on --plan, hard-fails before any spend. @returns {boolean} in sync */
function checkPodLock() {
    const podLock = path.join(POD_REPO, 'node_lock.json');
    if (!existsSync(podLock)) {
        log(`\n  ⚠ pod lock not found at ${podLock} — cannot verify the image is at this engine.`);
        log(`    Set CUBRIC_POD_REPO if mpi-ci lives elsewhere.`);
        return true;                       // absent ≠ drifted; do not block another machine
    }
    const ours = JSON.parse(readFileSync(path.join(REPO, 'dev_configs/node_lock.json'), 'utf8'));
    const theirs = JSON.parse(readFileSync(podLock, 'utf8'));
    const drift = [];
    const ourTag = ours.comfyui?.core?.tag, theirTag = theirs.comfyui?.core?.tag;
    if (ourTag !== theirTag) drift.push(`core ${theirTag} -> ${ourTag}`);
    for (const [id, n] of Object.entries(ours.nodes || {})) {
        if (n.commit && theirs.nodes?.[id]?.commit !== n.commit) drift.push(id);
    }
    // python_deps.txt is the SECOND half of the sync and drifts silently (MPI-413): the
    // Dockerfile COPYs both, a node bump moves both, and shipping one without the other
    // bakes a mismatched engine. Checking only the lock is how a "synced" pod still drifts.
    // Compare LF-normalized — this repo converts line endings, so raw bytes false-positive.
    const podDeps = path.join(POD_REPO, 'python_deps.txt');
    const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    if (!existsSync(podDeps)) drift.push('python_deps.txt (missing)');
    else if (norm(path.join(REPO, 'dev_configs/python_deps.txt')) !== norm(podDeps)) drift.push('python_deps.txt');
    if (!drift.length) { log(`\n  pod lock + python_deps in sync with ${ourTag} ✓`); return true; }

    log(`\n  🛑 POD LOCK IS BEHIND — ${drift.join(', ')}`);
    log(`  The Pod image bakes nodes from those files, so smoking now measures the OLD engine.`);
    log(`  Sync them, rebuild the DEV image, then re-run:`);
    log(`    cp dev_configs/node_lock.json "${podLock}"`);
    log(`    cp dev_configs/python_deps.txt "${podDeps}"`);
    log(`    git -C "${POD_REPO}" commit --only node_lock.json python_deps.txt -m "chore(pod): sync node_lock to ComfyUI ${String(ourTag || '').replace(/^v/, '')}"`);
    log(`    /build-pod-image   — DEV tag v<ver>-dev-<profile>, bump ONLY POD_IMAGE_VERSION_DEV/_CPU_DEV`);
    log(`  Never rebuild the user-facing image for a bump in flight.`);
    return false;
}

let reg_resolveFile = () => null;

async function main() {
    const reg = await loadRegistry();
    reg_resolveFile = (m, op) => reg.resolveWorkflowFile(m, op, ENGINE, { variantTokens: { arch: ARCH } });
    const only = opt('models')?.split(',').map(s => s.trim()).filter(Boolean);
    const set = resolveSmokeSet(reg, only);
    const opCount = printPlan(reg, set);
    const preflightFails = preflightOps(reg, set);
    const podLockOk = checkPodLock();
    const nodesOk = await checkFirstPartyNodes(set);
    const inputsOk = await checkRequiredInputs(set);

    if (PLAN_ONLY) { log('\n--plan: nothing rented, nothing spent.\n'); return; }
    if (!podLockOk) die('pod lock is behind — sync it and rebuild the DEV image before smoking.');
    if (!nodesOk) die('the MpiNodes pin predates a node the workflows use - bump it before renting anything.');
    if (!inputsOk) die('shipped graphs are missing required node inputs - fix them before renting anything.');
    if (preflightFails) die(`${preflightFails} op(s) fail preflight offline — fix the graph/registry before renting anything.`);

    log(`\n── Live run ──`);
    const volume = await ensureVolume(set.totalGb);

    // The CPU Pod is not an optimisation — it is what makes the installs below REMOTE.
    // /comfy/models/download/start branches on remoteModels.isRemoteActive()
    // (routes/downloadManager.js), and remote mode only goes active when a Pod is
    // created (_afterPodCreated → setRemoteMode). With no Pod up, every POST in the
    // loop takes the LOCAL branch and lands ~300 GB on the developer's own disk.
    // A download Pod runs the wrapper only — `ready` is the whole signal; `comfyReady`
    // never comes (no torch, no ComfyUI in the -cpu image). Measured: a healthy one
    // answers in ~30s, and the user's standing observation is that a CPU Pod never takes
    // longer than 5 minutes to connect. So 5 min is the ceiling, not a guess: past it the
    // host is bad, not busy, and waiting longer only pays for a Pod that will never work.
    const cpuSpec = { gpuTypeId: CPU_SENTINEL, volumeId: volume.id, datacenter: DATACENTER };
    await createPodWithRetry(cpuSpec, 'CPU download Pod', 5 * 60 * 1000);
    const mode = await app('/remote/mode');
    if (!mode.active || !mode.podId) await abort('remote mode is not active after the CPU Pod came up — refusing to install, the deps would download LOCALLY.');
    log(` remote mode active on ${mode.podId}`);

    // `installing` and `paused` are in-flight too (routes/downloadManager.js:1523) —
    // waiting on downloading/queued alone lets the run leave for the GPU while the Pod
    // is still unpacking.
    const IN_FLIGHT = ['queued', 'downloading', 'paused', 'installing'];

    /**
     * Install the models ONE AT A TIME, each fully drained before the next.
     *
     * Not a pacing preference — POSTing all 13 at once is a load the product never
     * generates (the model manager installs sequentially, MPI-184) and the Pod cannot
     * survive it. Measured 2026-08-08: 63 concurrent wrapper installs starved a cpu3c
     * download Pod into answering 524 to every request including /health, the install
     * SSE died every 90s, and the fill flat-lined at ~97 GB while the app's counters
     * froze at 82.9 GB. The Pod stayed RUNNING throughout, which is what makes the
     * failure so easy to misread as progress.
     *
     * @returns {Promise<string[]>} model ids with a failed dep
     */
    const installModels = async (entries) => {
        // ponytail: install via the app's normal per-model route. Same queue, same SSE, same
        // code users hit — a bespoke bulk installer would be a second path to keep correct.
        for (const [i, e] of entries.entries()) {
            log(`\n  [${i + 1}/${entries.length}] ${e.model.id}`);
            await app('/comfy/models/download/start', {
                method: 'POST',
                body: JSON.stringify({ modelId: e.model.id, dependencies: reg.resolveDeps(e.model, null, null, ENGINE, { arch: ARCH }).map(id => reg.DEPS[id]).filter(Boolean) }),
            });
            // The job must EXIST before "not in flight" can mean "finished" — a POST that
            // has not registered yet would otherwise read as an instant install.
            //
            // And bytes must actually MOVE. The app's counters are SSE-fed, so when the Pod
            // stops answering they simply stop changing — on 2026-08-08 that read as a
            // download in progress for ninety minutes while nothing was happening. A wait
            // with no progress check cannot tell a slow download from a dead one.
            let last = -1, lastMoveMs = Date.now();
            const done = await waitReady(`install ${e.model.id}`, async () => {
                const j = ((await app('/comfy/downloads/status')).jobs || []).find(x => x.modelId === e.model.id);
                if (!j) return false;
                const got = (j.deps || []).reduce((a, d) => a + (d.downloadedBytes || 0), 0);
                if (got !== last) { last = got; lastMoveMs = Date.now(); }
                else if (Date.now() - lastMoveMs > STALL_MS) throw new Error('stalled');
                return !IN_FLIGHT.includes(j.status);
            }, 3 * 60 * 60 * 1000, { soft: true }).catch(() => false);

            if (!done) {
                // Recycle the Pod and re-POST once. aria2 resumes from the volume, so the
                // bytes already down are not lost — a stall costs minutes, not the fill.
                log(`\n  ⚠ ${e.model.id} stopped progressing — recycling the download Pod and retrying`);
                await app('/remote/pod/delete-active', { method: 'POST' }).catch(() => { });
                await sleep(5000);
                await createPodWithRetry(cpuSpec, 'CPU download Pod', 5 * 60 * 1000);
                await app('/comfy/models/download/start', {
                    method: 'POST',
                    body: JSON.stringify({ modelId: e.model.id, dependencies: reg.resolveDeps(e.model, null, null, ENGINE, { arch: ARCH }).map(id => reg.DEPS[id]).filter(Boolean) }),
                });
                await waitReady(`install ${e.model.id} (retry)`, async () => {
                    const j = ((await app('/comfy/downloads/status')).jobs || []).find(x => x.modelId === e.model.id);
                    return !!j && !IN_FLIGHT.includes(j.status);
                }, 3 * 60 * 60 * 1000);
            }
        }
        const jobs = (await app('/comfy/downloads/status')).jobs || [];
        return jobs.filter(j => (j.deps || []).some(d => d.status === 'failed' || d.status === 'error'))
            .map(j => j.modelId);
    };

    log(`  installing ${set.depIds.length} deps on a CPU Pod (download mode)…`);
    let bad = await installModels(set);

    // One retry round. The wrapper's install route can still 404 after /health goes
    // green on a cold -cpu Pod, and remoteModels.wrapperFetch only spends ~30s on that
    // window — on the first live run (2026-08-08) LTX lost all 12 deps to it while every
    // later model, POSTed seconds afterwards, installed fine. A re-POST is what fixed it
    // by hand, so the runner does it instead of failing a ~300 GB fill on a boot race.
    if (bad.length) {
        log(`\n  ⚠ ${bad.length} model(s) had a failed dep: ${bad.join(', ')} — one retry round…`);
        const retry = [...set].filter(e => bad.includes(e.model.id));
        bad = await installModels(retry);
    }

    // Playbook step 4: verify BEFORE renting a GPU. A weight that failed here and is
    // only discovered at sampling time has already cost the expensive half of the run.
    if (bad.length) await abort(`install failed after a retry for: ${bad.join(', ')}`);
    log(`  installs verified: no failed deps`);

    // The GPU Pod mounts the same volume, so the CPU Pod has to go first.
    log(`\n  deleting the CPU download Pod…`);
    await app('/remote/pod/delete-active', { method: 'POST' }).catch(() => log('  ⚠ CPU Pod delete failed — check RunPod.'));
    _podLive = false;

    // The two halves have very different risk: the fill is a $0.06/hr CPU Pod, the matrix
    // is a rented GPU that bills while nobody is watching. Splitting them lets the volume
    // be filled unattended and the GPU leg wait for someone awake — without hand-rolling a
    // second driver that would miss the retry round, the stall watchdog and the preflight.
    if (flag('install-only')) {
        log(`
--install-only: volume filled and verified. Nothing rented from here.`);
        log(`Re-run without the flag for the GPU leg — models 1-N re-verify in seconds.`);
        return;
    }

    const gpu = await pickGpu(volume.id);
    // The GPU Pod gets the SAME watchdog as the CPU one, and for a worse reason: this
    // path used a bare create + a hard 20-minute waitReady, and die() is process.exit(1)
    // which deletes NOTHING. A dead host therefore cost 20 idle minutes and then LEAKED a
    // rented GPU Pod, billing until a human noticed — the CPU leg has been safe from this
    // since e60b269b only because createPodWithRetry deletes the Pod before every retry
    // AND before it gives up. EU-RO-1 produced four RUNNING-but-dead hosts on 2026-08-08,
    // so this is a live risk, not a theoretical one. Two attempts, not three: each one is
    // billed GPU time, so the retry is a safety net, not a persistence strategy.
    await createPodWithRetry(
        { gpuTypeId: gpu.id, volumeId: volume.id, datacenter: DATACENTER, minMemoryInGb: MIN_RAM_GB },
        'GPU Pod', 20 * 60 * 1000, 2);
    const engine = await assertPodEngineVersion();

    const probe = await stageProbeImage();
    const results = [];
    const vramGb = await podVramGb(gpu.id);
    for (const e of set) {
        await stageModelOnPod(reg, e.model, vramGb);
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
    _podLive = false;

    if (n('FAIL')) process.exit(1);
}

// THIS MODULE RENTS HARDWARE WHEN IT LOADS — or it did until this guard. `main()` was
// called bare at the bottom, so a plain `import` of the file ran a LIVE matrix: measured
// 2026-08-09, importing it to reuse ONE pure helper created a CPU download Pod, ran the
// whole install leg, deleted that Pod, and created an L4 before a 2-minute command
// timeout killed it mid-create. Real money, an untracked Pod, and it displaced the
// podId the app was tracking. The `--self-check` block below is the same hazard in
// miniature: it ends in process.exit(0), which on import would kill the HOST process.
// So: nothing below runs unless this file IS the process entry point. Keeping the
// helpers importable is what makes a probe script able to build the exact same graph
// the matrix builds, instead of a lookalike.
const INVOKED_DIRECTLY = !!process.argv[1]
    && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

// applyFastTier / minimizeGraph / summarizeNodeErrors / injectByTitle / hotStoreFiles
// already carry inline `export` — which is the point: this file was ALWAYS a module
// someone meant to import, and the bare main() call made doing so cost money.
export { requiredInputHoles, prepOp, loadRegistry, healSeparators };

// demo(): the pure half runs with no app, no Pod, no network.
if (INVOKED_DIRECTLY && flag('self-check')) {
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

    // healSeparators: the four FAILs on 2026-08-08 that were the harness, not the model.
    const hg = {
        1: { class_type: 'MpiStyleLoras', inputs: { lora_1: 'chroma\\styles\\a.safetensors', lora_2: 'None' } },
        2: { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: 'krea-2\\style\\b.safetensors' } },
        3: { class_type: 'MpiPromptList', inputs: { text: 'a\\b keep me' } },
    };
    const healed = healSeparators(hg);
    assert(healed === 2, `healed 2 path values, got ${healed}`);
    assert(hg[1].inputs.lora_1 === 'chroma/styles/a.safetensors', 'lora_N slot is healed (MpiStyleLoras banks)');
    assert(hg[1].inputs.lora_2 === 'None', 'None has no separator and passes through');
    assert(hg[2].inputs.lora_name === 'krea-2/style/b.safetensors', 'lora_name is healed');
    assert(hg[3].inputs.text.includes('\\'), 'a NON-path input must never be touched');
    // applyFastTier: capability-gated, because two shipped graphs carry these titles for
    // a DIFFERENT purpose. A title-only rule would flip klein's turbo and chroma's bake.
    const tg = () => ({
        1: { class_type: 'MpiSimpleBoolean', _meta: { title: 'Input_is_Turbo' }, inputs: { boolean: false } },
        2: { class_type: 'MpiInt', _meta: { title: 'Input_Tier' }, inputs: { int: 1 } },
    });
    const on = tg();
    const onApplied = applyFastTier(on, { capabilities: { turboToggle: true, tierSelect: true } });
    assert(on[1].inputs.boolean === true, 'turboToggle model gets Input_is_Turbo true');
    assert(on[2].inputs.int === 3, 'tierSelect model gets Input_Tier 3 (Hyper)');
    assert(onApplied.length === 2, `fast tier must REPORT what it applied, got ${onApplied.join(',')}`);
    const off = tg();
    assert(applyFastTier(off, { capabilities: { turboToggle: false, tierSelect: false } }).length === 0
        && off[1].inputs.boolean === false && off[2].inputs.int === 1,
        'a model that does NOT declare the capability is left alone (klein/chroma carry these titles)');
    assert(applyFastTier({}, { capabilities: { turboToggle: true } })[0] === 'Input_is_Turbo=ABSENT',
        'a declared capability whose node is missing is reported ABSENT, never silently skipped');

    // node_errors: a 200 ack with a dropped output is NOT a pass (MPI-495).
    assert(summarizeNodeErrors(undefined) === null && summarizeNodeErrors({}) === null,
        'a clean prompt returns null - {} is the normal shape, not an error');
    const ne = { '41': { class_type: 'MpiStyleLoras', errors: [
        { type: 'value_not_in_list', extra_info: { input_name: 'lora_3', received_value: 'krea-2/x.safetensors' } }] } };
    assert(summarizeNodeErrors(ne) === 'MpiStyleLoras.lora_3=krea-2/x.safetensors',
        `node_errors names the BANK SLOT, not lora_name (MPI-359); got ${summarizeNodeErrors(ne)}`);

    // hotStoreFiles: the comfy subdir is the FIRST path segment of filename, not dep.type,
    // and the VRAM cap must drop a file BIGGER than the card (MPI-329).
    const hsReg = {
        sizeToGb: (n) => n,
        resolveDeps: () => ['big', 'small', 'tiny', 'flat'],
        DEPS: {
            big:   { filename: 'diffusion_models/ltx.safetensors', size: 42, sha256: 'aa' },
            small: { filename: 'text_encoders/t5.safetensors', size: 11, sha256: 'bb' },
            tiny:  { filename: 'loras/x.safetensors', size: 0.05, sha256: 'cc' },
            flat:  { filename: 'no_subdir.safetensors', size: 5, sha256: 'dd' },
        },
    };
    const hs = hotStoreFiles(hsReg, { supportedOps: ['t2i'] }, 24);
    assert(hs.length === 1, `24GB card keeps only the 11GB TE, got ${hs.map(f => f.filename).join(',')}`);
    assert(hs[0].type === 'text_encoders' && hs[0].filename === 't5.safetensors',
        `type is the FIRST path segment and is stripped from filename, got ${JSON.stringify(hs[0])}`);
    assert(hotStoreFiles(hsReg, {}, 96).length === 2, 'a 96GB card also stages the 42GB transformer');
    assert(hotStoreFiles(hsReg, {}, null).length === 2, 'unknown VRAM = no cap, same as the app');

    // Gate 9. The shape below IS MPI-498: MpiScaledDimensions with a required
    // upscale_method the graph never supplied. Verified against the real pre-fix graphs
    // out of git (06cf70d4~1) — 4 holes in nvidia_pid.json, 2 in flow_sdxl_4k.json, the
    // exact six nodes MPI-498 named, and 0 against the working tree.
    const oi = {
        MpiScaledDimensions: { input: { required: { value: ['INT'], upscale_method: ['COMBO'] } } },
        MpiH3References: { input: { required: { clip: ['CLIP'], ref_images: ['AUTOGROW'] } } },
        KJUpscale: { input: { required: { upscale_method: ['COMBO'] } } },
    };
    const holes = (g) => requiredInputHoles(g, oi);
    assert(holes({ 1: { class_type: 'MpiScaledDimensions', inputs: { value: 8 } } }).length === 1,
        'a required input the graph never supplies is a hole (MPI-498)');
    assert(holes({ 1: { class_type: 'MpiScaledDimensions', inputs: { value: 8, upscale_method: 'lanczos' } } }).length === 0,
        'a supplied required input is not a hole');
    assert(holes({ 1: { class_type: 'MpiScaledDimensions', inputs: { value: 8, upscale_method: ['9', 0] } } }).length === 0,
        'a required input satisfied by a LINK is not a hole — links live in the same inputs map');
    // The autogrow rule. Core emits `ref_images.ref_image_0`, never the bare `ref_images`;
    // without the prefix match every H3 reference slot would report as missing and the gate
    // would cry wolf on a correct graph.
    assert(holes({ 1: { class_type: 'MpiH3References', inputs: { clip: ['2', 0], 'ref_images.ref_image_0': ['3', 0] } } }).length === 0,
        'an autogrow group is satisfied by a `<name>.<sub>` entry, not the bare name');
    // Scope. A third-party pack is pinned per-node elsewhere and the LOCAL copy may
    // legitimately differ from the Pod's, so its required set is not evidence here.
    assert(holes({ 1: { class_type: 'KJUpscale', inputs: {} } }).length === 0,
        'non-Mpi* classes are out of scope — the local copy may not be the Pod copy');
    // A class absent from /object_info has no `required` map at all, so dropping the guard
    // makes this line throw on Object.keys(undefined) rather than report — mutation-verified.
    // Skipping is also the right ANSWER: an absent class is gate 8's finding, and
    // double-reporting it here would explain it worse.
    assert(holes({ 1: { class_type: 'MpiNotInThisEngine', inputs: {} } }).length === 0,
        'a class absent from /object_info is skipped, not crashed on — gate 8 owns that finding');

    console.log(`self-check OK (${applied.join(', ')})`);
    process.exit(0);
}

if (INVOKED_DIRECTLY) main().catch(e => abort(e.stack || e.message));
