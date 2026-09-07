/**
 * tests/windows-hide-spawn.test.cjs — MPI-637.
 *
 * The server runs as a forked Electron child that owns NO console. On Windows,
 * a console-subsystem child spawned from a console-less parent gets a brand new
 * conhost — a terminal window that flashes open on the user's desktop. App boot
 * fired ten of them (4x wmic, 2x nvidia-smi --query-gpu=name, 2x bare nvidia-smi,
 * the polled VRAM read, the broker CLI) and read as malware.
 *
 * Two things keep it fixed, and both are easy to undo by accident:
 *   1. every child_process call in server-side code passes `windowsHide: true`;
 *   2. no call pairs it with `detached: true` — CreateProcess IGNORES
 *      CREATE_NO_WINDOW when DETACHED_PROCESS is set, so the pair silently
 *      cancels out and the window comes back with the flag still in the source.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['routes', 'services'];

/** Call sites that spawn Electron itself — a GUI-subsystem binary that never gets
 *  a console — so the flag is meaningless there. Keyed by the callee expression. */
const GUI_BINARY_CALLEES = new Set(['process.execPath']);

/** Source files under DIRS, absolute. */
function sourceFiles() {
    return DIRS.flatMap((dir) => {
        const abs = path.join(ROOT, dir);
        return fs.readdirSync(abs)
            .filter((f) => f.endsWith('.js'))
            .map((f) => path.join(abs, f));
    });
}

/**
 * Blank out comments, keeping every character position (so line numbers hold).
 * Without this the scanner reports prose — both files here discuss `spawn()` in
 * a comment right above the call it is describing.
 */
function stripComments(src) {
    const blank = (m) => m.replace(/[^\n]/g, ' ');
    return src
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        // `(?<!:)` keeps `https://…` inside a string from eating the rest of the line.
        .replace(/(?<!:)\/\/[^\n]*/g, blank);
}

/**
 * Names a file binds to a child_process function through `promisify`, e.g.
 * `const execFileP = promisify(execFile)`. MPI-651: nine ffmpeg/ffprobe calls
 * went through such an alias, so the callee-name scan below never saw them and
 * every one of them spawned a visible console window with this test green.
 */
function promisifiedAliases(src) {
    const re = /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:util\.)?promisify\(\s*(?:child_process\.)?(?:spawn|exec|execFile)\s*\)/g;
    return [...src.matchAll(re)].map((m) => m[1]);
}

/** Extract the full argument text of each child_process call in `src`. */
function callSites(rawSrc) {
    const src = stripComments(rawSrc);
    const sites = [];
    const names = ['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec', ...promisifiedAliases(src)];
    const re = new RegExp(`\\b(${names.join('|')})\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
        // `.exec(` on a regex literal is not child_process — require a preceding
        // boundary that is not a dot.
        if (src[m.index - 1] === '.') continue;
        let depth = 1;
        let i = re.lastIndex;
        while (i < src.length && depth > 0) {
            const c = src[i];
            if (c === '(') depth += 1;
            else if (c === ')') depth -= 1;
            i += 1;
        }
        sites.push({
            fn: m[1],
            line: src.slice(0, m.index).split('\n').length,
            args: src.slice(re.lastIndex, i - 1),
        });
    }
    return sites;
}

test('every server-side child_process call hides its console window', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
        const src = fs.readFileSync(file, 'utf8');
        if (!/require\(['"]child_process['"]\)/.test(src)) continue;
        for (const site of callSites(src)) {
            const callee = site.args.split(',')[0].trim();
            if (GUI_BINARY_CALLEES.has(callee)) continue;
            if (site.args.includes('windowsHide')) continue;
            offenders.push(`${path.relative(ROOT, file)}:${site.line} ${site.fn}(${callee}, …)`);
        }
    }
    assert.deepStrictEqual(offenders, [], `missing windowsHide:\n${offenders.join('\n')}`);
});

test('no call pairs windowsHide with detached — Windows ignores the flag then', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
        const src = fs.readFileSync(file, 'utf8');
        if (!/require\(['"]child_process['"]\)/.test(src)) continue;
        for (const site of callSites(src)) {
            if (site.args.includes('windowsHide') && /detached\s*:\s*true/.test(site.args)) {
                offenders.push(`${path.relative(ROOT, file)}:${site.line}`);
            }
        }
    }
    assert.deepStrictEqual(offenders, [], `detached:true cancels windowsHide:\n${offenders.join('\n')}`);
});

test('the broker is spawned through a GUI binary, not bare node', () => {
    // ensureBroker spawns DETACHED and must stay that way (a non-detached broker
    // dies with whichever app started it — measured 2026-08-28). DETACHED_PROCESS
    // makes Windows ignore windowsHide, so the only way to keep the broker
    // window-less is to hand it a GUI-subsystem binary: our own Electron, run as
    // Node. `['node', cliPath]` is console-subsystem and pops a terminal.
    const src = fs.readFileSync(path.join(ROOT, 'services', 'brokerBoot.js'), 'utf8');
    const call = src.slice(src.indexOf('ensureBroker({'));
    assert.ok(call.includes('process.execPath'), 'brokerCommand must use process.execPath');
    assert.ok(call.includes('ELECTRON_RUN_AS_NODE'), 'the spawned broker needs ELECTRON_RUN_AS_NODE');
    assert.ok(!/brokerCommand:\s*\[\s*'node'/.test(call), "brokerCommand must not be bare 'node'");
});

test('the scanner actually catches a bare call (it would pass on a broken regex)', () => {
    const bare = "const { spawn } = require('child_process');\nspawn('nvidia-smi', ['-L']);\n";
    const sites = callSites(bare);
    assert.strictEqual(sites.length, 1);
    assert.ok(!sites[0].args.includes('windowsHide'));
    // A regex literal's .exec() must NOT read as a child_process call.
    assert.strictEqual(callSites('const m = /a(b)/.exec(text);').length, 0);
    // A call named only in a comment is prose, not a call site.
    assert.strictEqual(callSites("require('child_process'); // spawn(x, y) below").length, 0);
    // MPI-651: the bug this test missed once — the call goes through an alias.
    const aliased = "const execFileP = promisify(execFile);\nexecFileP(ffmpeg, args, { maxBuffer: 4 });\n";
    const aliasSites = callSites(aliased).filter((s) => s.fn === 'execFileP');
    assert.strictEqual(aliasSites.length, 1);
    assert.ok(!aliasSites[0].args.includes('windowsHide'));
});
