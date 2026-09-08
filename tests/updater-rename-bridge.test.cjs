/**
 * MPI-708 Phase 0b — the 1.5 updater must be able to cross the Cubric Studio rename.
 *
 * The thing being protected is unusual: these assertions guard code that runs from the
 * user's ALREADY-INSTALLED copy. If 1.5 ships with a pattern that only knows
 * "CubricVision", then when 2.0 renames the release assets that install looks for a file
 * that no longer exists, reports "no update available", and there is no later release that
 * can fix it — the broken updater is the one doing the looking. So these are one-way
 * doors, and the tests exist to stop a well-meaning tidy-up narrowing them back.
 *
 * The shell and batch updaters cannot be required, and win-update.cjs runs on import, so
 * the patterns are asserted against the shipped SOURCE. That is deliberate: it is the
 * literal these installs will carry, not a copy of it.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const P = (...p) => path.join(REPO_ROOT, 'scripts', 'portable', ...p);
const read = (...p) => fs.readFileSync(P(...p), 'utf8');
const APPLIER = P('apply-update.cjs');
const MANIFEST_REL = ['resources', 'cubric', 'update-manifest.json'];

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** The single-quoted or JS-string regex literal a platform updater passes to fetch-release. */
function patternsIn(src) {
    return [...src.matchAll(/\^Cubric[^'"\s\\]*(?:\\\\?\.zip\$)/g)].map(m => m[0]);
}

test('every platform updater accepts BOTH product names', () => {
    const cases = [
        ['windows', read('win-update.cjs'), 'windows-x64'],
        ['linux', read('linux', 'update.sh'), 'linux-x64'],
        ['macos', read('macos', 'update.command'), 'macos-arm64'],
        ['macos', read('macos', 'update.command'), 'macos-x64'],
    ];

    for (const [label, src, slug] of cases) {
        const literal = patternsIn(src).find(p => p.includes(slug));
        assert.ok(literal, `${label}: no asset pattern found for ${slug}`);
        // Normalise the JS-source double escaping (\\.zip) to a real regex.
        const re = new RegExp(literal.replace(/\\\\/g, '\\'));

        assert.ok(re.test(`CubricVision-${slug}-update-v2.0.0.zip`),
            `${label}/${slug}: must still match the legacy asset name`);
        assert.ok(re.test(`CubricStudio-${slug}-update-v2.0.0.zip`),
            `${label}/${slug}: must match the renamed asset, or this install can never reach 2.0`);

        // Still discriminating: a FULL build is not an update bundle, and neither is
        // somebody else's asset. Widening the name must not widen what counts as an update.
        assert.ok(!re.test(`CubricStudio-${slug}-v2.0.0.zip`),
            `${label}/${slug}: a full build must not be mistaken for an update bundle`);
        assert.ok(!re.test(`SomeoneElse-${slug}-update-v2.0.0.zip`),
            `${label}/${slug}: an unrelated asset must be rejected`);
    }
});

test('the Windows entry points resolve the new exe name first, then the old', () => {
    for (const f of [['windows', 'update.bat'], ['windows', 'update-from-zip.bat'], ['win-update.cjs']]) {
        // Code lines only. Comments legitimately mention either name in either order, and
        // an assertion that cannot tell them apart fails on prose rather than on behaviour.
        const code = read(...f)
            .split(/\r?\n/)
            .filter(l => !/^\s*(rem\b|::|\/\/|\*|\/\*)/i.test(l))
            .join('\n');
        const order = [...code.matchAll(/Cubric(Studio|Vision)\.exe/g)].map(m => m[1]);
        assert.ok(order.includes('Studio'), `${f.join('/')}: must know the renamed exe`);
        assert.ok(order.includes('Vision'), `${f.join('/')}: must still fall back to the old exe`);
        assert.strictEqual(order.indexOf('Studio') < order.indexOf('Vision'), true,
            `${f.join('/')}: the renamed exe must be tried FIRST — after 2.0 both names can be on disk`);
    }
});

test('the applier accepts either appId, and still refuses a foreign one', () => {
    const attempt = (bundleAppId) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi708-'));
        const install = path.join(root, 'install');
        const bundle = path.join(root, 'bundle');

        writeJson(path.join(install, ...MANIFEST_REL), {
            appId: 'cubric.vision', toVersion: '1.5.0', files: [], preserve: [],
        });
        writeJson(path.join(install, 'app', 'package.json'), {
            name: 'cubric-vision', version: '1.5.0',
        });
        fs.writeFileSync(path.join(install, 'app', 'changed.txt'), 'old');

        fs.mkdirSync(path.join(bundle, 'app'), { recursive: true });
        fs.writeFileSync(path.join(bundle, 'app', 'changed.txt'), 'new');
        writeJson(path.join(bundle, ...MANIFEST_REL), {
            appId: bundleAppId,
            platform: process.platform,
            fromVersion: '1.5.0',
            toVersion: '2.0.0',
            files: [{ path: 'app/changed.txt' }],
            preserve: [],
            delete: [],
        });

        const run = spawnSync(process.execPath, [APPLIER, '--root', install, '--bundle', bundle], { encoding: 'utf8' });
        return { run, install };
    };

    for (const id of ['cubric.vision', 'cubric.studio']) {
        const { run, install } = attempt(id);
        assert.strictEqual(run.status, 0, `appId ${id} must be accepted: ${run.stderr || run.stdout}`);
        assert.strictEqual(fs.readFileSync(path.join(install, 'app', 'changed.txt'), 'utf8'), 'new');
    }

    const { run, install } = attempt('someone.else');
    assert.notStrictEqual(run.status, 0, 'a foreign appId must still be refused');
    assert.match(`${run.stderr}${run.stdout}`, /Wrong update appId/);
    assert.strictEqual(fs.readFileSync(path.join(install, 'app', 'changed.txt'), 'utf8'), 'old',
        'a refused bundle must leave the install byte-identical');
});
