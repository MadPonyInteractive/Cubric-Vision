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
// Sharing one file then exposed the write path itself: both processes ran
// stat -> move -> append, so both rotated and the second moved the FRESH file
// over the real backup (measured end state: app.log 472 bytes, app.log.1 100
// bytes, a whole session erased). Checks 6-10 pin the redesign — one writer,
// verbatim relay, timestamped archives, pruning.
//
// Run: node tests/logger-sink-userdata.test.cjs

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, fork, spawn } = require('child_process');

const LOGGER = path.join(__dirname, '..', 'routes', 'logger.js');
const MAX_LOG_BYTES = 256 * 1024;
const MAX_ARCHIVES = 20;
const ARCHIVE_RE = /^app-\d{8}-\d{6}(-\d+)?\.log$/;
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

// ── 4. main.js routes child output by kind ────────────────────────────────────
// The child no longer writes the file, so its structured lines must be RELAYED
// verbatim (keeping the child's own timestamp), while raw output — which has no
// logger behind it — is formatted under [server]. Mirrors the writeChildLine
// state machine in main.js startServer().
function makeWriteChildLine(sink, level) {
    let childLoggedItself = false;
    const structuredLogPattern = /^\[[^\]]+\]\s+\[(?:INFO|WARN|ERROR)\]\s+\[[^\]]+\]/;
    return (line) => {
        if (structuredLogPattern.test(line)) {
            childLoggedItself = true;
            sink.push(['raw', line]);
            return;
        }
        if (childLoggedItself && /^\s/.test(line)) { sink.push(['raw', line]); return; }
        childLoggedItself = false;
        sink.push([level, line]);
    };
}

const out = [];
const write = makeWriteChildLine(out, 'info');

// The child's own logger formatted these two; they arrive already stamped.
write('[2026-07-31T16:48:00.727Z] [INFO] [system] Server initialization started');
write('[2026-07-31T16:48:04.485Z] [ERROR] [engine] Engine download failed');
write('    at _runEngineDownload (routes/engine.js:480:11)');   // its stack
// Raw output with no logger behind it — the reason this pipe exists at all.
write('◇ injected env (0) from .env');
write('Error [ERR_REQUIRE_ESM]: require() of ES Module modelDeps.js');

assert.deepStrictEqual(out, [
    ['raw', '[2026-07-31T16:48:00.727Z] [INFO] [system] Server initialization started'],
    ['raw', '[2026-07-31T16:48:04.485Z] [ERROR] [engine] Engine download failed'],
    ['raw', '    at _runEngineDownload (routes/engine.js:480:11)'],
    ['info', '◇ injected env (0) from .env'],
    ['info', 'Error [ERR_REQUIRE_ESM]: require() of ES Module modelDeps.js'],
], 'structured child lines relay verbatim; raw output is formatted');

// The MPI-418 case specifically: a raw Node error AFTER a structured line still
// reaches the log as [server]. Dropping it would re-break the bug this card
// exists for.
const out2 = [];
const write2 = makeWriteChildLine(out2, 'error');
write2('[2026-07-31T16:48:00.727Z] [INFO] [system] Server initialization started');
write2('Error [ERR_REQUIRE_ESM]: require() of ES Module');
assert.deepStrictEqual(out2[1], ['error', 'Error [ERR_REQUIRE_ESM]: require() of ES Module'],
    'raw error following a structured line must survive');

// ── Harness for the write-path checks ─────────────────────────────────────────
// fork() gives the child a `process.send`; spawn() does not. That is the exact
// discriminator routes/logger uses, so the two must be driven for real.
const CHILD_FILE = path.join(tmp, 'child.cjs');
fs.writeFileSync(CHILD_FILE, `
    const logger = require(${JSON.stringify(LOGGER)});
    eval(process.env.MPI_TEST_CODE);
    setTimeout(() => process.exit(0), 1200);
`);

const childEnv = (dir, code) => ({ ...process.env, APP_USER_DATA: dir, MPI_TEST_CODE: code });
const exited = (child) => new Promise(res => child.on('exit', res));
const runFork  = (dir, code) => {
    const child = fork(CHILD_FILE, [], { env: childEnv(dir, code), silent: true });
    // main.js reads this pipe; an unread one fills and blocks the child forever.
    child.stdout.resume();
    child.stderr.resume();
    return exited(child);
};
const runSpawn = (dir, code) => exited(spawn(process.execPath, [CHILD_FILE], { env: childEnv(dir, code), stdio: 'ignore' }));
const logsDir  = (dir) => path.join(dir, 'logs');
const archives = (dir) => fs.readdirSync(logsDir(dir)).filter(f => ARCHIVE_RE.test(f)).sort();
const seedFullLog = (dir) => {
    fs.mkdirSync(logsDir(dir), { recursive: true });
    fs.writeFileSync(path.join(logsDir(dir), 'app.log'), 'S'.repeat(300 * 1024));
};

(async () => {
    // ── 5. A fork must not write the file it shares with main ─────────────────
    const forkDir = path.join(tmp, 'forked');
    await runFork(forkDir, `logger.error('server', 'FORK_MARKER')`);
    assert.ok(!fs.existsSync(path.join(logsDir(forkDir), 'app.log')),
        'a forked child must not write app.log — main relays its stdout instead');

    // ── 6. …but a standalone `node server.js` in dev still does ───────────────
    const soloDir = path.join(tmp, 'solo');
    await runSpawn(soloDir, `logger.error('server', 'SOLO_MARKER')`);
    assert.ok(fs.readFileSync(path.join(logsDir(soloDir), 'app.log'), 'utf8').includes('SOLO_MARKER'),
        'a non-forked process is the sole writer and must still log');

    // ── 7. Relay is byte-verbatim — the CHILD's timestamp survives ─────────────
    const relayDir = path.join(tmp, 'relay');
    const CHILD_LINE = '[2026-07-31T16:48:04.485Z] [ERROR] [engine] Engine download failed';
    await runSpawn(relayDir, `logger.appendRaw(${JSON.stringify(CHILD_LINE)})`);
    const relayed = fs.readFileSync(path.join(logsDir(relayDir), 'app.log'), 'utf8').split('\n');
    assert.ok(relayed.includes(CHILD_LINE),
        'appendRaw must append the line unchanged, not re-stamp it with main\'s receive time');

    // ── 8. Rotation archives to a timestamped file, never below the cap ───────
    const rotDir = path.join(tmp, 'rotate');
    seedFullLog(rotDir);
    await runSpawn(rotDir, `logger.info('system', 'AFTER_ROTATE')`);
    const rotArchives = archives(rotDir);
    assert.strictEqual(rotArchives.length, 1, `expected one archive, got ${rotArchives.join()}`);
    assert.ok(fs.statSync(path.join(logsDir(rotDir), rotArchives[0])).size >= MAX_LOG_BYTES,
        'the archive holds the FULL old log, not a fresh file moved over it');
    const fresh = fs.readFileSync(path.join(logsDir(rotDir), 'app.log'), 'utf8');
    assert.ok(fresh.includes('AFTER_ROTATE') && fresh.length < MAX_LOG_BYTES,
        'app.log stays the active file and restarts empty');

    // ── 9. Pruning keeps the newest MAX_ARCHIVES ──────────────────────────────
    const pruneDir = path.join(tmp, 'prune');
    seedFullLog(pruneDir);
    const stamps = Array.from({ length: 25 }, (_, i) => `app-20260101-0000${String(i).padStart(2, '0')}.log`);
    for (const name of stamps) fs.writeFileSync(path.join(logsDir(pruneDir), name), 'old');
    await runSpawn(pruneDir, `logger.info('system', 'PRUNE_TRIGGER')`);
    const kept = archives(pruneDir);
    assert.strictEqual(kept.length, MAX_ARCHIVES, `expected ${MAX_ARCHIVES} archives, got ${kept.length}`);
    assert.ok(!kept.includes(stamps[0]), 'the oldest archive must be unlinked');
    assert.ok(kept.includes(stamps[24]), 'the newest old archive must survive');

    // ── 10. Race regression: a fork spamming across a rotation boundary ────────
    // The destructive bug, driven for real: two live processes on one file while
    // it crosses the cap. With one writer no archive can be a fresh stub.
    const raceDir = path.join(tmp, 'race');
    seedFullLog(raceDir);
    const spam = (marker) => `for (let i = 0; i < 400; i++) logger.info('server', '${marker} ' + 'A'.repeat(400));`;
    await Promise.all([
        runFork(raceDir, spam('FORK_MARKER')),
        runSpawn(raceDir, spam('MAIN_MARKER')),
    ]);
    for (const name of archives(raceDir)) {
        const size = fs.statSync(path.join(logsDir(raceDir), name)).size;
        assert.ok(size >= MAX_LOG_BYTES, `archive ${name} is ${size} bytes — a rotation raced and destroyed it`);
    }
    const raceBody = fs.readdirSync(logsDir(raceDir))
        .map(f => fs.readFileSync(path.join(logsDir(raceDir), f), 'utf8')).join('');
    assert.ok(!raceBody.includes('FORK_MARKER'), 'the fork wrote to the shared file');
    assert.ok(raceBody.includes('MAIN_MARKER'), 'the sole writer lost its lines');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('logger-sink-userdata: PASS (10 checks)');
})().catch(err => { console.error(err); process.exit(1); });
