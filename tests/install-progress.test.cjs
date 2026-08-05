'use strict';

// Contract tests for routes/install/computeProgress.js (MPI-276 Phase 1, G12).
// The 5 historical progress bugs are named regression cases.
// Run: node tests/install-progress.test.cjs

const assert = require('node:assert/strict');
const { computeProgress, isNodeTickPending, parseSizeToBytes, depDenominator } = require('../routes/install/computeProgress.js');

const GB = 1024 ** 3;
const MB = 1024 ** 2;

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  ok  ${name}`); }

const dep = (o) => ({ type: 'model', status: 'downloading', seedBytes: 0, totalBytes: 0, downloadedBytes: 0, ...o });

// ── parseSizeToBytes ────────────────────────────────────────────────────────────

test('parseSizeToBytes handles GB/MB/KB/B and junk', () => {
    assert.equal(parseSizeToBytes('1 GB'), GB);
    assert.equal(parseSizeToBytes('300 MB'), 300 * MB);
    assert.equal(parseSizeToBytes('6.9 GB'), 6.9 * GB);
    assert.equal(parseSizeToBytes(''), 0);
    assert.equal(parseSizeToBytes(null), 0);
    assert.equal(parseSizeToBytes('lots'), 0);
});

// ── depDenominator: real-total-wins (no Math.max) ───────────────────────────────

test('depDenominator prefers real total over seed (MPI-164, no max)', () => {
    // real total SMALLER than inflated seed → real wins (bar would finish short with max)
    assert.equal(depDenominator({ totalBytes: 5 * GB, seedBytes: 6.9 * GB }), 5 * GB);
    // real not yet known → seed
    assert.equal(depDenominator({ totalBytes: 0, seedBytes: 6.9 * GB }), 6.9 * GB);
});

// ── MPI-95: pending dep still in the denominator ─────────────────────────────────

test('mpi95_pending_dep_denominator', () => {
    // one dep downloading with real total, a second dep still pending (only seed).
    // The pending dep MUST count (seed), so the bar can't snap to 100% early.
    const job = { deps: [
        dep({ status: 'downloading', totalBytes: 4 * GB, downloadedBytes: 4 * GB }),
        dep({ status: 'queued', seedBytes: 4 * GB, totalBytes: 0, downloadedBytes: 0 }),
    ] };
    const p = computeProgress(job);
    assert.equal(p.totalBytes, 8 * GB, 'pending seed included');
    assert.ok(p.progress < 1, `not 100% (${p.progress})`);
    assert.equal(p.progress, 0.5);
});

// ── MPI-140: seed overestimate does not cap the bar short ─────────────────────────

test('mpi140_seed_overestimate_cap', () => {
    // seed overestimated 6.9GB; real total arrives at 5GB and all bytes in.
    // Denominator becomes 5GB (real wins) so the bar reaches 100%, not ~72%.
    const job = { deps: [dep({ status: 'downloading', seedBytes: 6.9 * GB, totalBytes: 5 * GB, downloadedBytes: 5 * GB })] };
    const p = computeProgress(job);
    assert.equal(p.totalBytes, 5 * GB);
    assert.equal(p.progress, 1);
    assert.equal(p.phase, 'verifying');
});

// ── MPI-164: verifying phase gated on ALL bytes done ─────────────────────────────

test('mpi164_verifying_gate_all_bytes', () => {
    // dep A done, dep B still mid-download → NO verifying sweep yet.
    const partial = { deps: [
        dep({ status: 'downloading', totalBytes: 2 * GB, downloadedBytes: 2 * GB }),
        dep({ status: 'downloading', totalBytes: 2 * GB, downloadedBytes: 1 * GB }),
    ] };
    let p = computeProgress(partial);
    assert.notEqual(p.phase, 'verifying', 'not all bytes in');
    assert.equal(p.progress, 0.75);
    // now B finishes → verifying
    partial.deps[1].downloadedBytes = 2 * GB;
    p = computeProgress(partial);
    assert.equal(p.phase, 'verifying');
    assert.equal(p.progress, 1);
});

// ── MPI-231: custom_nodes excluded from BOTH sides of the ratio ──────────────────

test('mpi231_custom_nodes_excluded', () => {
    // a node dep streamed 203MB against a 15MB seed — must NOT enter the ratio.
    const job = { deps: [
        dep({ type: 'model', status: 'downloading', totalBytes: 2 * GB, downloadedBytes: 1 * GB }),
        dep({ type: 'custom_nodes', status: 'downloading', seedBytes: 15 * MB, downloadedBytes: 203 * MB }),
    ] };
    const p = computeProgress(job);
    assert.equal(p.totalBytes, 2 * GB, 'node bytes excluded from total');
    assert.equal(p.downloadedBytes, 1 * GB, 'node bytes excluded from numerator');
    assert.equal(p.progress, 0.5);
});

test('custom_nodes-only job is indeterminate/preparing (no ratio)', () => {
    const job = { deps: [dep({ type: 'custom_nodes', status: 'downloading', downloadedBytes: 50 * MB })] };
    const p = computeProgress(job);
    assert.equal(p.indeterminate, true);
    assert.equal(p.phase, 'preparing');
});

// ── MPI-258 B3: partial reinstall denominator includes installed deps ─────────────

test('mpi258b3_partial_reinstall_denominator', () => {
    // model has 2 deps; one already installed (complete, credited full), one re-downloading.
    // Denominator MUST include the installed dep, else the bar over-reads.
    const job = { deps: [
        dep({ status: 'complete', totalBytes: 3 * GB, downloadedBytes: 3 * GB }),
        dep({ status: 'downloading', totalBytes: 3 * GB, downloadedBytes: 1.5 * GB }),
    ] };
    const p = computeProgress(job);
    assert.equal(p.totalBytes, 6 * GB, 'installed dep counted');
    assert.equal(p.progress, 0.75, '(3 + 1.5) / 6');
});

// ── totalBytes is SET, not accumulated ───────────────────────────────────────────

test('totalBytes_is_set_not_accumulated', () => {
    // Calling computeProgress twice on the same job must NOT double the total.
    const job = { deps: [dep({ status: 'downloading', totalBytes: 2 * GB, downloadedBytes: 1 * GB })] };
    const a = computeProgress(job);
    const b = computeProgress(job);
    assert.equal(a.totalBytes, 2 * GB);
    assert.equal(b.totalBytes, 2 * GB, 'idempotent — not 4GB');
});

// ── indeterminate when nothing known yet ─────────────────────────────────────────

test('indeterminate before any total known', () => {
    const job = { deps: [dep({ status: 'queued', seedBytes: 0, totalBytes: 0, downloadedBytes: 0 })] };
    const p = computeProgress(job);
    assert.equal(p.indeterminate, true);
    assert.equal(p.progress, 0);
});

test('all deps complete → verifying then 100%', () => {
    const job = { deps: [
        dep({ status: 'complete', totalBytes: 1 * GB, downloadedBytes: 1 * GB }),
        dep({ status: 'complete', totalBytes: 1 * GB, downloadedBytes: 1 * GB }),
    ] };
    const p = computeProgress(job);
    assert.equal(p.progress, 1);
    assert.equal(p.phase, 'verifying');
});

// -- MPI-410 (absorbed MPI-412): the install-screen strobe -----------------------
// A custom_nodes dep and a weight dep stream CONCURRENTLY, and the tick broadcast
// used to derive `indeterminate` from whichever dep ticked last. The engine install
// screen then alternated 'Preparing dependencies...' with a byte readout on every
// event, and a model tile re-rendered on the same flag. The sweep must depend on the
// JOB, not the tick: only while no honest total exists, or while the node phase is
// all that is left.

const nodeDep = (o) => ({ type: 'custom_nodes', status: 'downloading', seedBytes: 0, totalBytes: 0, downloadedBytes: 0, ...o });

test('mpi410_no_strobe_while_weights_still_stream', () => {
    const deps = [
        nodeDep({ status: 'downloading' }),
        dep({ status: 'downloading', totalBytes: 4 * GB, downloadedBytes: 1 * GB }),
    ];
    // The node tick and the weight tick must agree - this is the whole strobe.
    assert.equal(isNodeTickPending(deps), false, 'node still running but weights are not done: stay determinate');
    const p = computeProgress({ deps });
    assert.equal(p.indeterminate, false);
});

test('mpi410_sweep_once_only_the_node_phase_is_left', () => {
    const deps = [
        nodeDep({ status: 'downloading' }),   // pip run, minutes, no honest total
        dep({ status: 'complete', totalBytes: 4 * GB, downloadedBytes: 4 * GB }),
    ];
    assert.equal(isNodeTickPending(deps), true, 'weights done, node still working: sweep');
});

test('mpi410_node_only_job_stays_indeterminate', () => {
    const deps = [nodeDep({ status: 'downloading' })];
    const p = computeProgress({ deps });
    assert.equal(p.indeterminate, true, 'no byte denominator at all');
    // The live tick sites compute the same expression.
    assert.equal(p.totalBytes <= 0 || isNodeTickPending(deps), true);
});

// The three cases above only prove the MODULE. The strobe lived in the two live
// broadcast sites, which kept their own copy of the rule - so pin those to it.
test('mpi410_both_tick_sites_use_the_job_level_rule', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'downloadManager.js'), 'utf8');
    // Strip line comments first: the fix's own note quotes the old expression,
    // and a guard that trips on prose is a guard nobody keeps.
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    const uses = code.match(/isNodeTickPending\(modelJob\.deps\)/g) || [];
    assert.equal(uses.length, 2, 'local AND remote tick sites (engine-split sweep)');
    assert.equal(/isNodeTick\s*\|\|/.test(code), false, 'no per-dep tick flag may drive the whole-job display again');
});

console.log(`\ninstall-progress: ${passed} passed`);
