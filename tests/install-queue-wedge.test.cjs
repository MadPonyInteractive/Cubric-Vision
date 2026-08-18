'use strict';

/**
 * MPI-395 — the serial install queue must not wedge on a no-op install.
 *
 * Installs are serialised through a client-side promise chain gated on `_inFlight`.
 * The backend registers the job and starts it BEFORE /download/start responds
 * (register-before-respond, G8) — and when every dep is already on disk it also
 * FINISHES it inside the request handler (`_startPendingDeps` finds 0 queued deps).
 * So a terminal listener armed AFTER `await res.json()` misses download:complete
 * outright: `_awaitDownloadDone` then burns its 30-minute ceiling with `_inFlight`
 * pinned, and every install clicked in that window sits at 'queued' forever — with no
 * revert timer, because only 'pending' arms one.
 *
 * Hit live on a remote connect: `engine:assets` re-runs every session and is a pure
 * no-op once the volume already holds the weights, so the FIRST model install after
 * connecting is the one that dies. Silently.
 *
 * No jsdom in this suite (see settings-models-root-guard.test.cjs), so this is
 * asserted on source text and on the real ordering inside routes/downloadManager.js.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const DL_SERVICE = path.join(__dirname, '..', 'js', 'services', 'downloadService.js');
const DL_ROUTE = path.join(__dirname, '..', 'routes', 'downloadManager.js');

const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the terminal listener is armed BEFORE the POST, not after it', async () => {
    const code = stripComments(await fs.readFile(DL_SERVICE, 'utf8'));

    const armAt = code.indexOf('_awaitDownloadDone(modelId)');
    const postAt = code.indexOf('_firePost(modelId, dependencies)');
    assert.ok(armAt > -1 && postAt > -1, 'expected both the arm and the POST in start()');
    assert.ok(armAt < postAt,
        '_awaitDownloadDone must be armed before _firePost — the backend can complete a '
        + 'no-op install inside the request handler, before the response lands (MPI-395)');

    // The chained form is exactly what regressed. `.then(fired => fired ? _awaitDownloadDone(...))`
    // arms only once the POST has resolved.
    assert.doesNotMatch(code, /\?\s*this\._awaitDownloadDone\(/,
        'arming the listener inside the post-POST .then() re-opens the wedge (MPI-395)');

    // A POST that never fired must tear the listener set down: a cancel-while-queued
    // emits download:cancelled BEFORE this arms, so nothing would ever resolve it.
    assert.match(code, /done\.cancel\(\)/,
        'an unfired POST must cancel the armed listener or it leaks for 30min (MPI-395)');
    assert.match(code, /return \{ promise, cancel \}/,
        '_awaitDownloadDone must expose its cleanup path to the caller (MPI-395)');
});

test('the 30-minute safety ceiling is not silent', async () => {
    const code = stripComments(await fs.readFile(DL_SERVICE, 'utf8'));
    const ceilingAt = code.indexOf('30 * 60 * 1000');
    assert.ok(ceilingAt > -1, 'expected the 30-minute safety ceiling');
    // It firing means every queued install was frozen for half an hour. Recovering
    // silently is what made this undiagnosable from a log.
    const window = code.slice(Math.max(0, ceilingAt - 400), ceilingAt);
    assert.match(window, /clientLogger\.warn/,
        'the safety ceiling must log when it releases the queue (MPI-395)');
});

test('the backend really does start the job before responding', async () => {
    // This is the premise the fix rests on — pin it, so a future route refactor that
    // moves res.json() earlier does not silently invalidate the reasoning above.
    const code = await fs.readFile(DL_ROUTE, 'utf8');
    const startAt = code.indexOf('_startPendingDeps();');
    assert.ok(startAt > -1, 'expected _startPendingDeps() in the download/start route');
    const respondAt = code.indexOf('res.json({ success: true, jobId: modelId', startAt);
    assert.ok(respondAt > startAt,
        'the route starts the job before it responds — register-before-respond (MPI-395)');
});

/**
 * MPI-576 — the internal heals install SILENTLY, by construction.
 *
 * Two of them run on the first remote connect: the node-drift re-clone
 * (`engine:node-drift`) and the engine-asset install (`engine:assets`). Neither is
 * user-initiated and neither may be announced. This was an id ALLOWLIST in
 * notificationService holding one literal ('engine:assets', MPI-395) — and the very
 * next `engine:*` id escaped it, announcing its raw job id to the user as
 * "engine:node-drift installed." on every connect. So the assertion is no longer
 * "the list contains the id"; it is "the caller declares the job silent and the
 * announcement sites read that", which a third id cannot escape.
 */
test('internal heal jobs are started silent, and both toast sites honour it', async () => {
    const notif = stripComments(
        await fs.readFile(path.join(__dirname, '..', 'js', 'shell', 'notificationService.js'), 'utf8'));
    const shell = stripComments(await fs.readFile(path.join(__dirname, '..', 'js', 'shell.js'), 'utf8'));
    const dl = stripComments(await fs.readFile(DL_SERVICE, 'utf8'));

    // 1. Every internal job id shell.js owns is started with { silent: true }.
    const ids = [...shell.matchAll(/^const (\w*JOB_ID) = '(engine:[^']+)';/gm)];
    assert.ok(ids.length >= 2,
        'expected shell.js to own both internal job ids (engine:node-drift, engine:assets)');
    for (const [, constName, id] of ids) {
        assert.match(shell, new RegExp(`downloadService\\.start\\(${constName}, \\w+, \\{ silent: true \\}\\)`),
            `${id} (${constName}) must be started with { silent: true } — an internal heal `
            + 'that announces itself is MPI-395 and MPI-576 all over again');
    }

    // 2. downloadService marks the job and stamps the flag onto the completion event.
    assert.match(dl, /_silentJobs\.add\(modelId\)/, 'start() must record a silent job');
    assert.match(dl, /const silent = _silentJobs\.delete\(data\.modelId\)/,
        'the complete handler must resolve (and clear) the silent mark');
    assert.match(dl, /data\.silent = silent;/,
        'the flag must be stamped onto download:complete — notificationService reads it there');

    // 3. The cascade toast is skipped for a silent job. It fires off a registry diff
    //    ("absent before the re-sync, present after"), and the drift heal makes that
    //    diff huge and legitimate: a drifted volume node reports installed:false for
    //    EVERY model whose dep universe holds it, so one KB-scale re-clone flips the
    //    whole sharing set — six models announced as fresh installs, nothing downloaded.
    const syncAt = dl.indexOf('reSyncInstalledModels().then(() => {');
    const toastAt = dl.indexOf('installed.`', syncAt);
    assert.ok(syncAt > -1 && toastAt > syncAt, 'expected the cascade toast after the re-sync');
    assert.match(dl.slice(syncAt, toastAt), /if \(silent\) return;/,
        'the cascade toast must bail on a silent job — the re-sync still runs, only the '
        + 'announcement is suppressed (MPI-576)');

    // 4. notificationService gates on the FACT, not on a list of ids it has to maintain.
    assert.match(notif, /data\.silent === true\) return;/,
        'notificationService must suppress a silent job by its flag');
    assert.doesNotMatch(notif, /'engine:/,
        'no engine job-id literal may come back here — the allowlist is what leaked '
        + 'engine:node-drift in the first place (MPI-576)');
});
