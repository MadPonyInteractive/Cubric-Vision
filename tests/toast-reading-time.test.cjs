'use strict';

// MPI-542 — a toast must stay up long enough to be READ.
//
// Live 2026-08-11: the disk-full toast landed as 140 characters of real numbers on a
// flat 3000ms timer. Fabio could not finish the FIRST LINE. Every toast in the app had
// the same budget whether it said "Copied" or quoted three figures and a drive letter.
//
// The rate is not invented: broadcast subtitling settled it decades ago (Netflix caps
// adult English at 17 chars/sec, the BBC works to ~160-180 wpm). Both assume the reader
// is already looking at the text; a toast is not, so readingTimeMs budgets a slower
// 12 CPS plus a lead-in for noticing it at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('reading time scales with the message and is clamped at both ends', async () => {
    const { readingTimeMs } = await import('../js/utils/string.js');

    // The message that started this. Anything near the old 3s fails the user.
    const diskFull = 'Not enough disk space on the Pod volume to install this model — '
        + '33.4 GB needed (5% working margin included), 6.4 GB free of 139.7 GB.';
    const t = readingTimeMs(diskFull);
    assert.ok(
        t >= 12000 - 1, // 137 chars at 12 CPS + lead-in exceeds the ceiling
        `REGRESSION: the disk-full toast is back to ${t}ms — it was unreadable at 3000`,
    );

    // Short toasts keep feeling immediate rather than lingering.
    assert.equal(readingTimeMs('Copied'), 3000, 'a one-word toast must not overstay');
    assert.equal(readingTimeMs(''), 3000, 'empty/undefined text falls back to the floor');
    assert.equal(readingTimeMs(undefined), 3000);

    // Monotonic in length — the whole point.
    const short = readingTimeMs('Model installed.');
    const medium = readingTimeMs('The remote engine is not ready yet — install this model again in a moment.');
    assert.ok(medium > short, 'a longer message must get more time');

    // Ceiling holds: a runaway message is a copy problem, not a timer problem.
    assert.equal(readingTimeMs('x'.repeat(5000)), 12000, 'no toast may camp on screen');
});

test('MpiToast defaults to reading time, and an explicit duration still wins', () => {
    // SOURCE-READ: MpiToast.js reaches ComponentFactory and Storage, so it does not
    // import in bare Node. What matters is the ONE expression that picks the default.
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'js/components/Primitives/MpiToast/MpiToast.js'), 'utf8');

    assert.match(
        src, /props\.duration !== undefined \? props\.duration : readingTimeMs\(props\.message\)/,
        'REGRESSION: MpiToast no longer derives its default lifespan from the message — '
        + 'either it is back to a flat constant, or an explicit duration stopped winning '
        + '(duration:0 must still mean persistent)',
    );
});
