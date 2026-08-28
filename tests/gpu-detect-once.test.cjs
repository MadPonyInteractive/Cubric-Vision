/**
 * tests/gpu-detect-once.test.cjs — MPI-639.
 *
 * GPU detection cost 8 process spawns per boot where 2 would do:
 *   - resolveDownloadConfig cached the RESULT, assigned after the await, so the two
 *     boot callers (GET /system/stats and GET /system/gpu-info, both fired by the
 *     landing hero stat slots ~30ms apart) each saw a null cache and ran a full
 *     detection;
 *   - detectAmdGPU and detectIntelArcGPU issued the SAME `wmic` command and ran it
 *     unconditionally, beside the NVIDIA probe, so a machine that had already
 *     identified its card still paid for two ~200ms WMI calls.
 *
 * Both are invisible from the outside — the resolved config is identical either
 * way — so this counts the actual spawns.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const cp = require('child_process');

const MODULE = path.join(__dirname, '..', 'routes', 'platformEngine.js');

/**
 * Load platformEngine with `execFile` stubbed. The module destructures execFile at
 * load time, so the stub has to be in place BEFORE the require — and the module
 * cache has to be dropped, or a previous test's session cache answers instead.
 *
 * @param {(cmd: string, args: string[]) => {error?: Error, stdout?: string}} respond
 * @returns {{ platformEngine: object, calls: string[] }}
 */
function loadWithStub(respond) {
    const calls = [];
    const realExecFile = cp.execFile;
    cp.execFile = (cmd, args, opts, cb) => {
        const done = typeof opts === 'function' ? opts : cb;
        calls.push([cmd, ...(args || [])].join(' ').trim());
        const { error = null, stdout = '' } = respond(cmd, args || []);
        setImmediate(() => done(error, stdout, ''));
        return { on() {}, kill() {} };
    };
    delete require.cache[require.resolve(MODULE)];
    try {
        return { platformEngine: require(MODULE), calls };
    } finally {
        cp.execFile = realExecFile;
        delete require.cache[require.resolve(MODULE)];
    }
}

const NVIDIA_PRESENT = (cmd, args) => {
    if (cmd !== 'nvidia-smi') return { error: new Error(`unexpected ${cmd}`) };
    if (args.includes('--query-gpu=name')) return { stdout: 'NVIDIA GeForce RTX 4060 Ti\n' };
    return { stdout: 'CUDA Version: 12.8\n' };
};

const NO_NVIDIA = (cmd) => {
    if (cmd === 'nvidia-smi') return { error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) };
    return { stdout: 'Name\nAMD Radeon RX 7900 XTX\n' };
};

test('two concurrent callers cause ONE detection, not two', async () => {
    const { platformEngine, calls } = loadWithStub(NVIDIA_PRESENT);
    // Exactly the boot shape: /system/stats and /system/gpu-info, neither awaiting
    // the other. Awaiting them in sequence would pass even with the old result cache.
    const [a, b] = await Promise.all([
        platformEngine.resolveDownloadConfig(),
        platformEngine.resolveDownloadConfig(),
    ]);
    assert.strictEqual(a, b, 'both callers must get the same resolved object');
    assert.strictEqual(a.gpu.vendor, 'nvidia');
    assert.deepStrictEqual(calls, [
        'nvidia-smi --query-gpu=name --format=csv,noheader',
        'nvidia-smi',
    ], `one detection = 2 spawns, got ${calls.length}: ${calls.join(' | ')}`);
});

test('a later call spawns nothing at all', async () => {
    const { platformEngine, calls } = loadWithStub(NVIDIA_PRESENT);
    await platformEngine.resolveDownloadConfig();
    const afterFirst = calls.length;
    await platformEngine.resolveDownloadConfig();
    await platformEngine.resolveDownloadConfig();
    assert.strictEqual(calls.length, afterFirst, 'cached calls must not re-probe');
});

test('wmic is skipped entirely when nvidia-smi already found the card', async () => {
    const { platformEngine, calls } = loadWithStub(NVIDIA_PRESENT);
    await platformEngine.resolveDownloadConfig();
    assert.deepStrictEqual(calls.filter((c) => c.startsWith('wmic')), []);
});

test('with no NVIDIA, wmic runs ONCE and still finds AMD', async () => {
    const { platformEngine, calls } = loadWithStub(NO_NVIDIA);
    const cfg = await platformEngine.resolveDownloadConfig();
    const wmic = calls.filter((c) => c.startsWith('wmic'));
    assert.strictEqual(wmic.length, 1, `one WMI probe answers both vendors, got ${wmic.length}`);
    // Proves the single probe is really read for BOTH vendors, not just AMD.
    assert.strictEqual(cfg.gpu.vendor, 'amd');
    assert.ok(cfg.comfy.url.endsWith('ComfyUI_windows_portable_amd.7z'));
});
