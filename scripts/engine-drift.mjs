/**
 * Which first-party node classes actually CHANGED between two MpiNodes pins — and which
 * shipped graphs load one.
 *
 * WHY THIS EXISTS. The smoke-evidence staleness rule used to be "node_lock.json changed
 * after the evidence was recorded -> every row is stale". That is right about the risk and
 * wrong about the blast radius. MpiNodes is code-only and its pin moves for reasons that
 * cannot touch most graphs: on 2026-09-06 the pin moved to v1.2.11, which added
 * MpiWindowedSampler, added a `video_path` output to MpiSaveVideo, and left the other ~120
 * classes byte-identical. Under the blunt rule all 37 smoke rows died, including 29 image
 * ops whose graphs load none of those nodes — so the only way to ship was a 290 GB full
 * matrix re-proving things the pin could not have reached.
 *
 * The rule here is the same gate aimed properly: a row is stale when the graph behind it
 * loads a class whose source actually moved.
 *
 * ERRING. Every unknown resolves to "changed". A pack that is not MpiNodes, a checkout that
 * is missing, a commit that cannot be read, a core ComfyUI bump — all of those return the
 * blunt verdict, because a gate that cannot see must not wave things through. That is the
 * whole lesson of MPI-465, and narrowing the aim must not soften it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const MPINODES_REPO = process.env.CUBRIC_MPINODES_REPO || 'c:/AI/Mpi/ComfyUi-MpiNodes';
const PACK = 'ComfyUI-MpiNodes';

function git(repo, args) {
    try {
        return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return null;
    }
}

/**
 * Top-level `class X:` blocks, plus everything that is NOT inside one ("the shell":
 * imports, module helpers, constants).
 *
 * The shell matters as much as the blocks. v1.2.11 lifted MpiClearVram's body into a
 * module-level `_clear_vram()` helper — the class block changed, but had the extraction
 * gone the other way the class could have been byte-identical while its behaviour moved
 * entirely into shared code. So a changed shell condemns every class in the module.
 */
function splitModule(src) {
    const lines = src.split(/\r?\n/);
    const starts = [];
    lines.forEach((l, i) => {
        const m = /^class\s+([A-Za-z_]\w*)/.exec(l);
        if (m) starts.push([i, m[1]]);
    });
    const classes = new Map();
    const inClass = new Array(lines.length).fill(false);
    starts.forEach(([i, name], k) => {
        const end = k + 1 < starts.length ? starts[k + 1][0] : lines.length;
        classes.set(name, lines.slice(i, end).join('\n').trimEnd());
        for (let j = i; j < end; j++) inClass[j] = true;
    });
    const shell = lines.filter((_, i) => !inClass[i]).join('\n').trim();
    return { classes, shell };
}

/** The MpiNodes commit pinned by a given node_lock.json body. */
export function packPinOf(lockJson) {
    try {
        return (JSON.parse(lockJson)?.nodes || {})[PACK]?.commit || null;
    } catch {
        return null;
    }
}

/** Everything node_lock.json pinned at `commit`, for comparing two points in history. */
export function lockAt(repo, commit) {
    return git(repo, ['show', `${commit}:dev_configs/node_lock.json`]);
}

/** The last commit that touched node_lock.json at or before `isoTime`. */
export function lockCommitBefore(repo, isoTime) {
    const out = git(repo, ['log', '-1', `--before=${isoTime}`, '--format=%H', '--', 'dev_configs/node_lock.json']);
    return out ? out.trim() || null : null;
}

/**
 * Classes whose source differs between two MpiNodes commits.
 * Returns `null` when the question cannot be answered — callers must treat that as
 * "everything changed", never as "nothing changed".
 */
export function changedClasses(from, to, repo = MPINODES_REPO) {
    if (!from || !to) return null;
    if (from === to) return new Set();
    if (!existsSync(repo)) return null;
    const diff = git(repo, ['diff', '--name-only', `${from}..${to}`]);
    if (diff === null) return null; // commit missing from the local checkout

    const changed = new Set();
    for (const file of diff.split('\n').map(s => s.trim()).filter(Boolean)) {
        if (!file.endsWith('.py')) continue;
        // __init__.py names every class in the pack, so diffing its body would condemn
        // all of them on any mapping edit. Its membership is compared separately below.
        if (file === '__init__.py') continue;
        const a = git(repo, ['show', `${from}:${file}`]);
        const b = git(repo, ['show', `${to}:${file}`]);
        if (a === null && b === null) return null;
        const A = splitModule(a || '');
        const B = splitModule(b || '');
        if (A.shell !== B.shell) {
            // Module-level code moved: no class in this file can be called unaffected.
            for (const n of new Set([...A.classes.keys(), ...B.classes.keys()])) changed.add(n);
            continue;
        }
        for (const n of new Set([...A.classes.keys(), ...B.classes.keys()])) {
            if (A.classes.get(n) !== B.classes.get(n)) changed.add(n);
        }
    }

    // A class that appeared or vanished from NODE_CLASS_MAPPINGS, even with an untouched
    // module — the mapping key IS the class_type a graph names.
    const keys = {};
    for (const c of [from, to]) {
        const src = git(repo, ['show', `${c}:__init__.py`]);
        if (src === null) return null;
        keys[c] = new Set([...src.matchAll(/["'](Mpi[A-Za-z0-9_]*)["']\s*:/g)].map(m => m[1]));
    }
    for (const k of keys[from]) if (!keys[to].has(k)) changed.add(k);
    for (const k of keys[to]) if (!keys[from].has(k)) changed.add(k);

    return changed;
}

/**
 * Classes a human has signed off for exactly this pin move.
 *
 * Pinned to `from`/`to`: the moment either end moves the attestation stops applying and its
 * classes are changed again. It can wave through one reviewed hop, never a standing exemption
 * — which is the difference between this and `--allow-unproven-engine`.
 */
export function attestedClasses(file, from, to) {
    if (!file || !existsSync(file)) return new Set();
    let doc;
    try {
        doc = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return new Set();
    }
    if (doc?.pack !== PACK) return new Set();
    const short = (c) => String(c || '').slice(0, 12);
    if (short(doc.from) !== short(from) || short(doc.to) !== short(to)) return new Set();
    return new Set(Object.entries(doc.classes || {})
        .filter(([, v]) => v && typeof v.reason === 'string' && v.reason.trim().length > 0)
        .map(([k]) => k));
}

/** Runtime graph -> the changed classes it loads. `raw/` and `scripts/` are templates, not dispatched. */
export function graphsLoading(classSet, wfDir) {
    const hits = new Map();
    if (!classSet || !classSet.size || !existsSync(wfDir)) return hits;
    for (const f of readdirSync(wfDir)) {
        if (!f.endsWith('.json')) continue;
        let g;
        try {
            g = JSON.parse(readFileSync(path.join(wfDir, f), 'utf8'));
        } catch {
            continue;
        }
        if (!g || typeof g !== 'object') continue;
        const found = new Set();
        for (const n of Object.values(g)) {
            const ct = n && n.class_type;
            if (typeof ct === 'string' && classSet.has(ct)) found.add(ct);
        }
        if (found.size) hits.set(f, [...found].sort());
    }
    return hits;
}

/**
 * The whole verdict for one "evidence recorded at T, node_lock last moved at U" question.
 *
 * `{ stale, reason, classes, graphs }` — `stale:false` only when the pin move is provably
 * unable to reach any shipped graph.
 */
export function assessPinMove({ repo, wfDir, evidenceAt, pinMovedAt, attestationFile, nodesRepo = MPINODES_REPO }) {
    const blunt = (reason) => ({ stale: true, reason, classes: null, graphs: null });
    if (!pinMovedAt || !evidenceAt) return blunt('cannot read the pin-move or evidence timestamp');
    if (new Date(evidenceAt) >= new Date(pinMovedAt)) return { stale: false, reason: 'evidence postdates the pin move', classes: new Set(), graphs: new Map() };

    const thenCommit = lockCommitBefore(repo, evidenceAt);
    if (!thenCommit) return blunt('cannot resolve which node_lock.json was in force when the evidence was recorded');
    const thenLock = lockAt(repo, thenCommit);
    const nowLock = readFileSync(path.join(repo, 'dev_configs/node_lock.json'), 'utf8');
    if (!thenLock) return blunt('cannot read the node_lock.json in force when the evidence was recorded');

    // A core ComfyUI bump reaches every graph through the sampler and the loaders. Never narrowed.
    const coreOf = (s) => { try { return JSON.parse(s)?.comfyui?.core?.tag || null; } catch { return null; } };
    if (coreOf(thenLock) !== coreOf(nowLock)) return blunt(`the ComfyUI core tag moved ${coreOf(thenLock)} -> ${coreOf(nowLock)}`);

    // Any pin other than MpiNodes moving is out of reach: those packs are not checked out here.
    const others = (s) => { try { const n = JSON.parse(s)?.nodes || {}; return JSON.stringify(Object.fromEntries(Object.entries(n).filter(([k]) => k !== PACK).sort())); } catch { return null; } };
    if (others(thenLock) !== others(nowLock)) return blunt('a third-party node pin moved, and those packs are not checked out here to diff');

    const from = packPinOf(thenLock);
    const to = packPinOf(nowLock);
    const changed = changedClasses(from, to, nodesRepo);
    if (changed === null) return blunt(`cannot diff ${PACK} ${String(from).slice(0, 8)}..${String(to).slice(0, 8)} (no local checkout at ${nodesRepo}?)`);

    const attested = attestedClasses(attestationFile, from, to);
    const effective = new Set([...changed].filter(c => !attested.has(c)));
    const graphs = graphsLoading(effective, wfDir);
    return {
        stale: graphs.size > 0,
        reason: graphs.size
            ? `${effective.size} changed class(es) reach ${graphs.size} shipped graph(s)`
            : (changed.size ? 'no shipped graph loads a changed class' : 'no class changed between the pins'),
        classes: effective,
        graphs,
        changed,
        attested,
        from,
        to,
    };
}
