'use strict';

// MPI-542 — a disk-full block must SAY the thing the gate actually decided.
//
// Two live instances in app.log, 2026-08-11:
//   LOCAL : "install blocked - disk full: need 29.3 GB free, have 29.4 GB at
//           G:/CubricModels" — it had MORE than it asked for and blocked anyway. The
//           gate compares against needed * 1.05; the message printed the un-margined
//           number. The decision was right; the message made it look broken.
//   REMOTE: the server computed "need 57.8 GB, have 34.8 GB free of 139.7 GB" on the
//           POD VOLUME, and the client threw it away for "Not enough disk space to
//           install LTX 2.3. Free up space and try again." — which names no disk and
//           points the user at the wrong machine. No local cleanup can help.
//
// The fix is the shape already proven twice in the same function (MPI-427 networkBlocked,
// MPI-539 toast): the server writes the user-facing message, the client shows it verbatim.
// So both gates now set `toast: true`, and the client's toast arm must be checked BEFORE
// _isOutOfSpaceError — that matcher hits "no space left on device"/"not enough disk
// space", i.e. the very messages we now want passed through.
//
// SOURCE-READ on both sides, deliberately:
//   - js/services/downloadService.js cannot import in bare Node (MpiButton.js imports an
//     ABSOLUTE '/js/utils/icons.js' -> c:\js\utils\icons.js). Established convention in
//     tests/download-mode-pod-guards.test.cjs — branch ORDER is what this pins.
//   - the two server gates live inside express route handlers whose _freeDiskBytes /
//     remoteVolumeFreeBytes reads are module-internal, so firing them behaviourally means
//     faking a full disk. What broke was a number printed from a different expression than
//     the one compared, and that is exactly what a same-identifier pin catches.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('both disk-full gates print the SAME number they compared against', () => {
    const src = read('routes/downloadManager.js');

    for (const [label, freeVar, needVar] of [
        ['local', 'freeBytes', 'requiredBytes'],
        ['remote', 'freeInfo.freeBytes', 'remoteRequiredBytes'],
    ]) {
        // The margin is applied ONCE, into the identifier that is then both compared and
        // printed. A gate that inlines `* 1.05` in the comparison is the original bug.
        assert.match(
            src, new RegExp(`const ${needVar} = \\w+ \\* 1\\.05`),
            `the ${label} gate no longer folds the 5% margin into one identifier`,
        );
        assert.match(
            src, new RegExp(`${freeVar.replace('.', '\\.')} < ${needVar}`),
            `the ${label} gate stopped comparing against ${needVar} — if it compares against a `
            + 'different expression than it prints, the message contradicts the decision again',
        );
        assert.match(
            src, new RegExp(`error: \`[^\`]*\\$\\{_fmtGb\\(${needVar}\\)\\}`),
            `REGRESSION: the ${label} disk-full message no longer prints ${needVar} — it is `
            + 'back to quoting a requirement smaller than the one that blocked the install',
        );
    }

    // Verbatim pass-through is what makes the precise message reach the user at all.
    const toastCount = (src.match(/toast: true,\n\s*error: `Not enough disk space/g) || []).length;
    assert.equal(
        toastCount, 2,
        'REGRESSION: a disk-full gate lost `toast: true` — the client falls back to its '
        + 'generic "free up space" message, which names no drive and, on a remote install, '
        + 'points at the wrong machine',
    );

    // The remote verdict must name the Pod volume; "free up space" on the local disk is
    // useless advice when the full disk is 1500km away.
    assert.match(
        src, /Not enough disk space on the Pod volume/,
        'the remote disk-full message stopped naming the Pod volume',
    );
});

test('the client shows a server-authored disk message instead of overwriting it', () => {
    const src = read('js/services/downloadService.js');

    // Three arms handle a failed install: the POST-reject in _firePost, and the two
    // download:failed branches (job known / job unknown). In every one, the toast verdict
    // must be reached BEFORE the out-of-space matcher, or the precise message is lost.
    const toastArms = [...src.matchAll(/(?:err|data)\.toast/g)].map(m => m.index);
    const genericArms = [...src.matchAll(/_isOutOfSpaceError\((?:err|data)\.error\)/g)].map(m => m.index);

    assert.equal(toastArms.length, 3, 'the three failure arms moved — re-anchor this test');
    assert.equal(genericArms.length, 3, 'the three failure arms moved — re-anchor this test');

    for (let i = 0; i < 3; i++) {
        assert.ok(
            toastArms[i] < genericArms[i],
            `REGRESSION: failure arm ${i + 1} checks _isOutOfSpaceError before the toast `
            + 'verdict — it matches the server\'s own "not enough disk space" text and '
            + 'replaces a message carrying the drive and the real numbers with a generic one',
        );
    }
});
