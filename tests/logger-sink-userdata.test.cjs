'use strict';

// Regression test for MPI-418 — [server]/[main] lines never reached the app.log
// a user actually sends.
//
// Bug: routes/logger.js resolved its log directory from process.env.APP_USER_DATA
// at MODULE LOAD. main.js requires the logger on its first line, long before it
// resolves userData and exports APP_USER_DATA (that only ever went into the
// server fork's env), so the main process logged to <app>/logs while the fork
// logged to <user-data>/logs. Every line main writes — including every [server]
// line, which is the fork's own stdout/stderr replayed by pipeChildStream — went
// to a second file nobody collects. [engine] lines came from the fork and
// arrived, which made the gap read as a missing category rather than a missing
// file.
//
// Fix: resolve lazily on first write, and have main.js set APP_USER_DATA on
// itself. This test drives the REAL module in child processes so it pins the
// actual sink, not a mirror of it.
//
// Run: node tests/logger-sink-userdata.test.cjs

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const LOGGER = path.join(__dirname, '..', 'routes', 'logger.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-logger-'));

// Requires the logger, writes one line, waits for the fire-and-forget append.
const CHILD = `
    const logger = require(${JSON.stringify(LOGGER)});
    logger.error('server', 'FIRST_LINE_MARKER');
    setTimeout(() => process.exit(0), 500);
`;

function run(env) {
    execFileSync(process.execPath, ['-e', CHILD], {
        env: { ...process.env, ...env },
        stdio: 'ignore',
    });
}

// ── 1. APP_USER_DATA set BEFORE require → log lands under it ──────────────────
const userData = path.join(tmp, 'user-data');
run({ APP_USER_DATA: userData });
const expected = path.join(userData, 'logs', 'app.log');
assert.ok(fs.existsSync(expected), `expected the log at ${expected}`);

// ── 2. The FIRST line is not dropped ──────────────────────────────────────────
// Lazy resolution removed the module-load head start that the old `_ready` flag
// silently relied on, so the very first write — where boot failures live — would
// have been thrown away. The append awaits the directory instead of racing it.
const body = fs.readFileSync(expected, 'utf8');
assert.ok(body.includes('FIRST_LINE_MARKER'), 'first line was dropped');
assert.ok(body.includes('[ERROR] [server]'), 'category/level prefix missing');

// ── 3. APP_USER_DATA set AFTER require still wins ─────────────────────────────
// This is the main.js ordering: `require('./routes/logger')` at line 1, the env
// var only once app.setPath('userData') has been applied. Eager resolution
// failed exactly here.
const late = path.join(tmp, 'late');
execFileSync(process.execPath, ['-e', `
    const logger = require(${JSON.stringify(LOGGER)});
    process.env.APP_USER_DATA = ${JSON.stringify(late)};
    logger.info('main', 'LATE_MARKER');
    setTimeout(() => process.exit(0), 500);
`], { env: { ...process.env, APP_USER_DATA: '' }, stdio: 'ignore' });
const lateLog = path.join(late, 'logs', 'app.log');
assert.ok(fs.existsSync(lateLog), `env set after require must still be honoured (${lateLog})`);
assert.ok(fs.readFileSync(lateLog, 'utf8').includes('LATE_MARKER'), 'late-env line missing');

fs.rmSync(tmp, { recursive: true, force: true });

// ── 4. main.js must not replay what the child already wrote ───────────────────
// Consequence of the fix above: both processes append to the same app.log, so
// pipeChildStream re-logging the child's structured stdout wrote every server
// line TWICE (seen on the Windows portable 2026-07-31) and halved the rotation
// window. Mirrors the writeChildLine state machine in main.js startServer().
function makeWriteChildLine(sink, level) {
    let childLoggedItself = false;
    const structuredLogPattern = /^\[[^\]]+\]\s+\[(?:INFO|WARN|ERROR)\]\s+\[[^\]]+\]/;
    return (line) => {
        if (structuredLogPattern.test(line)) { childLoggedItself = true; return; }
        if (childLoggedItself && /^\s/.test(line)) return;
        childLoggedItself = false;
        sink.push([level, line]);
    };
}

const out = [];
const write = makeWriteChildLine(out, 'info');

// The child's own logger already persisted these two.
write('[2026-07-31T16:48:00.727Z] [INFO] [system] Server initialization started');
write('[2026-07-31T16:48:04.485Z] [ERROR] [engine] Engine download failed');
write('    at _runEngineDownload (routes/engine.js:480:11)');   // its stack — also already persisted
// Raw output with no logger behind it — the reason this pipe exists at all.
write('◇ injected env (0) from .env');
write('Error [ERR_REQUIRE_ESM]: require() of ES Module modelDeps.js');

assert.deepStrictEqual(out, [
    ['info', '◇ injected env (0) from .env'],
    ['info', 'Error [ERR_REQUIRE_ESM]: require() of ES Module modelDeps.js'],
], 'only un-persisted raw child output may be replayed');

// The MPI-418 case specifically: a raw Node error AFTER a structured line still
// reaches the log. Dropping it would re-break the bug this card exists for.
const out2 = [];
const write2 = makeWriteChildLine(out2, 'error');
write2('[2026-07-31T16:48:00.727Z] [INFO] [system] Server initialization started');
write2('Error [ERR_REQUIRE_ESM]: require() of ES Module');
assert.strictEqual(out2.length, 1, 'raw error following a structured line must survive');

console.log('logger-sink-userdata: PASS (5 checks)');
