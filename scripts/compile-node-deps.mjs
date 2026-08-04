#!/usr/bin/env node
/**
 * compile-node-deps.mjs — keep the curated Python dependency set honest (MPI-413).
 *
 * The engine installs ONE curated pip file instead of letting each custom node resolve
 * its own requirements.txt on the user's machine. That only stays true if the curated
 * file tracks the nodes we actually pin. This script is both halves of that contract,
 * deliberately in one command so the generator and the drift gate can never diverge:
 *
 *   node scripts/compile-node-deps.mjs --check   # does python_deps.in cover every
 *                                                # requirement the pinned nodes declare?
 *   node scripts/compile-node-deps.mjs           # regenerate python_deps.txt
 *
 * Node requirements are fetched from GitHub at the EXACT commit in
 * dev_configs/node_lock.json — not read off a local engine — so the result is
 * reproducible on any machine and needs no ComfyUI install.
 *
 * The compile is constrained by ComfyUI core's own requirements.txt (at the pinned core
 * commit) so the set is strictly additive and compatible with core's floors, and the
 * torch family is excluded outright so this file can never move a user's torch.
 *
 * ADDING OR BUMPING A NODE WITH REQUIREMENTS: run --check, add what it reports to
 * python_deps.in, regenerate, review the diff, commit both files.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, 'dev_configs', 'node_lock.json');
const IN_FILE = path.join(ROOT, 'dev_configs', 'python_deps.in');
const OUT_FILE = path.join(ROOT, 'dev_configs', 'python_deps.txt');

// The engine owns these; the compile must never emit them. See python_deps.in.
const ENGINE_OWNED = ['torch', 'torchvision', 'torchaudio'];

// The one opencv distribution we ship. Every variant installs into the same `cv2`
// namespace, so more than one in an engine means whichever pip touched last decides what
// `import cv2` gets. contrib+headless is the superset and the right build for a non-GUI
// engine. See python_deps.in.
const OPENCV_KEEP = 'opencv-contrib-python-headless';

/**
 * Is this package part of the engine-owned torch stack?
 *
 * `--no-emit-package torch` drops torch itself but NOT its transitive closure, and torch
 * is legitimately in that closure — diffusers, ultralytics, kornia, albumentations and
 * mediapipe all depend on it. So a naive compile still emits pinned `triton`, ~16
 * `nvidia-*` CUDA wheels and (on Linux) `cuda-toolkit` / `cuda-bindings` /
 * `cuda-pathfinder`: several GB of engine-owned, platform-specific runtime this file has
 * no business choosing. That is the literal stack from MPI-413's Evidence A, the one that
 * landed on a CPU-only Linux box with no NVIDIA driver, so the compile filters it out and
 * the guard re-checks the result.
 *
 * `nvidia-ml-py` is deliberately NOT in here: it is a small pure-Python NVML binding that
 * ultralytics genuinely requires and it pulls no CUDA runtime.
 */
function isEngineOwned(name) {
    if (ENGINE_OWNED.map(normalize).includes(name)) return true;
    if (name === 'triton') return true;
    if (name.startsWith('cuda-')) return true;
    return name.startsWith('nvidia-') && name !== 'nvidia-ml-py';
}

/** Why this package must not appear in the lock, or null to keep it. */
function removalReason(name) {
    if (isEngineOwned(name)) return 'engine-owned torch stack';
    if (name.startsWith('opencv-') && name !== OPENCV_KEEP) return `duplicate cv2 — unified to ${OPENCV_KEEP}`;
    return null;
}

// Packages we deliberately refuse, with the reason --check prints when a node
// re-declares one. Full rationale lives in python_deps.in.
const DROPPED = {
    'sam2': 'needs `git clone`, which no portable engine has (MPI-387); Impact-Pack nodes we never exercise',
    'cupy': 'unreachable from the one FI node we ship (RIFE VFI); absent from every engine today',
    'cupy-wheel': 'source-only shim whose setup.py imports pkg_resources — fails to build on every platform',
};

// Every node in node_lock declares its deps in `requirements.txt` except this one:
// ComfyUI-Frame-Interpolation has no requirements.txt at all. Its install.py loops
// requirements-no-cupy.txt one `os.system` pip per line, then tries to install cupy.
// We take the file and drop the cupy step.
const REQUIREMENTS_FILE = {
    'ComfyUI-Frame-Interpolation': 'requirements-no-cupy.txt',
};

/** PEP 503 normalisation — `Pillow`, `pillow` and `importlib_metadata` must compare equal. */
const normalize = (name) => name.toLowerCase().replace(/[-_.]+/g, '-');

/**
 * Pull the distribution name out of one requirements line.
 * Returns null for anything that is not a plain named requirement (comments, blank
 * lines, pip options, VCS/URL installs) — `dropped` collects the VCS ones so --check
 * can tell "we deliberately dropped this" apart from "this is new".
 */
function parseRequirement(line) {
    const stripped = line.replace(/\s+#.*$/, '').trim();
    if (!stripped || stripped.startsWith('#') || stripped.startsWith('-')) return null;
    if (/^[a-z+]+:\/\//i.test(stripped) || stripped.startsWith('git+')) {
        // e.g. git+https://github.com/facebookresearch/sam2 — name it by its repo tail.
        const tail = stripped.split(/[#?]/)[0].replace(/\.git$/, '').split('/').pop();
        return tail ? { name: normalize(tail), raw: stripped, vcs: true } : null;
    }
    // Strip the environment marker, then extras, then any version specifier.
    const beforeMarker = stripped.split(';')[0].trim();
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(beforeMarker);
    return match ? { name: normalize(match[1]), raw: stripped, vcs: false } : null;
}

function parseRequirementsText(text) {
    return text.split(/\r?\n/).map(parseRequirement).filter(Boolean);
}

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.text();
}

const rawUrl = (repo, commit, file) => `https://raw.githubusercontent.com/${repo}/${commit}/${file}`;

/** Fetch the declared requirements of every node_lock node that has any. */
async function fetchNodeRequirements(lock) {
    const nodes = Object.entries(lock.nodes).filter(([, n]) => n.installRequirements);
    return Promise.all(nodes.map(async ([id, node]) => {
        if (node.source !== 'git-commit') {
            throw new Error(`${id}: only git-commit nodes can be fetched, got source="${node.source}"`);
        }
        const file = REQUIREMENTS_FILE[id] || 'requirements.txt';
        const text = await fetchText(rawUrl(node.repo, node.commit, file));
        return { id, file, requirements: parseRequirementsText(text) };
    }));
}

async function runCheck(lock) {
    const curated = new Set(parseRequirementsText(await fs.readFile(IN_FILE, 'utf8')).map(r => r.name));
    const engineOwned = new Set(ENGINE_OWNED.map(normalize));
    const dropped = new Map(Object.entries(DROPPED).map(([k, v]) => [normalize(k), v]));

    const nodes = await fetchNodeRequirements(lock);
    const uncovered = [];
    const seen = new Set();

    for (const { id, file, requirements } of nodes) {
        console.log(`  ${id} (${file}): ${requirements.length} declared`);
        for (const req of requirements) {
            seen.add(req.name);
            if (curated.has(req.name) || engineOwned.has(req.name)) continue;
            if (dropped.has(req.name)) {
                console.log(`    - ${req.name}: dropped on purpose — ${dropped.get(req.name)}`);
                continue;
            }
            uncovered.push({ id, req });
        }
    }

    // An opencv variant is "covered" by the unified contrib+headless build even though
    // the names differ — see python_deps.in. Anything else unnamed is real drift.
    const opencvCovered = [...curated].some(n => n.startsWith('opencv-'));
    const realUncovered = uncovered.filter(({ req }) => !(opencvCovered && req.name.startsWith('opencv-')));

    // Orphans are not a failure: a pin can outlive the node that motivated it, and the
    // transitive closure legitimately needs names no node declares directly.
    const orphans = [...curated].filter(n => !seen.has(n) && !n.startsWith('opencv-'));

    console.log('');
    if (orphans.length) console.log(`Curated but not declared by any node (fine, just noting): ${orphans.join(', ')}`);

    if (!realUncovered.length) {
        console.log('OK — every declared node requirement is covered by python_deps.in.');
        return 0;
    }
    console.log(`DRIFT — ${realUncovered.length} declared requirement(s) missing from python_deps.in:`);
    for (const { id, req } of realUncovered) console.log(`  ${req.raw}   (from ${id})`);
    console.log('\nAdd them to dev_configs/python_deps.in (or to DROPPED here, with a reason), then regenerate.');
    return 1;
}

/**
 * Drop the entries this file must not choose, along with the indented `# via` block that
 * belongs to each. Both classes are REAL transitive requirements — that is exactly why
 * they survive a resolve and why they have to be removed deliberately.
 *
 * INSTALL THIS LOCK WITH `--no-deps`. It is the complete closure by construction, and
 * only `--no-deps` makes these removals hold: a plain `pip install -r` would re-derive
 * `opencv-python` from ultralytics and `opencv-python-headless` from albumentations and
 * put three cv2 builds back in the engine.
 */
function stripUnwanted(text) {
    const lines = text.split(/\r?\n/);
    const out = [];
    const removed = new Map();
    let kept = 0;
    let skipping = false;

    for (const line of lines) {
        if (/^\s*#/.test(line) || !line.trim()) {
            if (!skipping) out.push(line);   // a `# via` block under a dropped entry goes with it
            continue;
        }
        const req = parseRequirement(line);
        const reason = req && removalReason(req.name);
        skipping = !!reason;
        if (skipping) { removed.set(req.name, reason); continue; }
        if (req) kept++;
        out.push(line);
    }

    const byReason = new Map();
    for (const [name, reason] of removed) byReason.set(reason, [...(byReason.get(reason) || []), name]);

    const note = [
        '',
        '# ── Install this file with `pip install -r python_deps.txt --no-deps` ──────────',
        '# It is the complete resolved closure, minus the entries below, which are real',
        '# transitive requirements removed on purpose. Without --no-deps pip re-derives them.',
        '#',
        ...[...byReason].flatMap(([reason, names]) => [`# ${reason}:`, `#   ${names.join(', ')}`]),
        '#',
        '# torch and its CUDA runtime are installed by engine provisioning (comfy-cli vendor',
        '# branch, the pinned macOS trio, the Windows portable archive, or the Pod image) —',
        '# never by this file. Regenerate with: node scripts/compile-node-deps.mjs',
        '',
    ];
    return { text: [...out.filter((l, i) => !(l === '' && out[i - 1] === '')), ...note].join('\n'), kept, removed };
}

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
        child.on('error', reject);
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    });
}

async function runCompile(lock) {
    // ComfyUI core's requirements at the pinned core commit, used as a CONSTRAINT.
    // Core's file is mostly unpinned, so most lines constrain nothing — the ones that
    // do (numpy>=1.25.0, transformers>=4.50.3, kornia>=0.7.1, pydantic~=2.0, …) are
    // exactly what keeps our set compatible with the core we ship.
    const coreText = await fetchText(rawUrl('comfyanonymous/ComfyUI', lock.comfyui.core.commit, 'requirements.txt'));
    const constraintPath = path.join(os.tmpdir(), `cubric-core-constraints-${lock.comfyui.core.tag}.txt`);
    await fs.writeFile(constraintPath, coreText);

    const args = [
        'pip', 'compile', '--universal', '--python-version', '3.12',
        '--constraint', constraintPath,
        ...ENGINE_OWNED.flatMap(p => ['--no-emit-package', p]),
        '--output-file', OUT_FILE,
        IN_FILE,
    ];
    console.log(`\nuv ${args.join(' ')}\n`);
    await run('uv', args);

    const filtered = stripUnwanted(await fs.readFile(OUT_FILE, 'utf8'));
    await fs.writeFile(OUT_FILE, filtered.text);

    const leaked = parseRequirementsText(filtered.text).map(r => r.name).filter(n => removalReason(n));
    if (leaked.length) throw new Error(`python_deps.txt still emits removed packages: ${leaked.join(', ')}`);

    console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)} — ${filtered.kept} packages kept, `
        + `${filtered.removed.size} removed:`);
    for (const [name, reason] of filtered.removed) console.log(`    ${name.padEnd(28)} ${reason}`);
    return 0;
}

const lock = JSON.parse(await fs.readFile(LOCK, 'utf8'));
const check = process.argv.includes('--check');
console.log(`ComfyUI core ${lock.comfyui.core.tag} — ${check ? 'drift check' : 'compile'}\n`);
process.exitCode = check ? await runCheck(lock) : await runCompile(lock);
