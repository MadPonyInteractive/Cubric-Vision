'use strict';

// MPI-387 fix D — the Windows portable artifact uses the STANDARD ELECTRON
// LAYOUT: a plain CubricVision.exe at the zip root, the app tree at
// resources/app, and no .vbs/.bat anywhere in the launch chain. Smart App
// Control on a clean Windows 11 install hard-blocks .bat/.cmd/.vbs with no
// per-file allowlist and no override in the dialog, so a script launcher is a
// dead end, not an inconvenience. This test pins the pieces that would silently
// re-break it. A full staging run is the real verification (see
// docs/releases/portable-distribution-contract.md); these are the cheap
// invariants that belong in the suite.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.join(__dirname, '..');
const WIN_TEMPLATES = path.join(REPO_ROOT, 'scripts', 'portable', 'windows');

function readTemplate(name) {
  return fs.readFileSync(path.join(WIN_TEMPLATES, name), 'utf8');
}

test('win32 stages the app under resources/app; linux and macOS keep app/', async () => {
  const { PLATFORM_CONFIG } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'scripts', 'build-portable.mjs')).href
  );
  assert.strictEqual(PLATFORM_CONFIG.win32.appDirRel, 'resources/app');
  assert.strictEqual(PLATFORM_CONFIG.win32.electronRoot, true);
  assert.strictEqual(PLATFORM_CONFIG.win32.exeName, 'CubricVision.exe');

  // Electron only resolves resources/app relative to the exe; the relayout is
  // pointless without the exe at the root, and harmful without the app move.
  for (const platform of ['linux', 'darwin']) {
    assert.strictEqual(PLATFORM_CONFIG[platform].appDirRel, 'app', `${platform} layout must not move`);
    assert.ok(!PLATFORM_CONFIG[platform].electronRoot, `${platform} must not get the relayout`);
  }
});

test('win32 ships no start launcher', async () => {
  const { PLATFORM_CONFIG } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'scripts', 'build-portable.mjs')).href
  );
  assert.strictEqual(PLATFORM_CONFIG.win32.start, undefined);
  assert.strictEqual(PLATFORM_CONFIG.win32.withTerminalStart, undefined);

  const staged = fs.readdirSync(WIN_TEMPLATES);
  assert.ok(!staged.some((name) => name.endsWith('.vbs')), `no .vbs may ship: ${staged.join(', ')}`);
  assert.ok(
    !staged.some((name) => name.startsWith('start')),
    `no start launcher may ship: ${staged.join(', ')}`,
  );

  // Linux/macOS still need theirs — a "tidy up" that deleted them everywhere
  // would leave those platforms with no way to launch at all.
  assert.strictEqual(PLATFORM_CONFIG.linux.start, 'start.sh');
  assert.strictEqual(PLATFORM_CONFIG.darwin.start, 'start.command');
});

test('retiring the Windows start chain is expressible as a delta delete', async () => {
  const { RETIRED_PATHS } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'scripts', 'build-portable.mjs')).href
  );
  // applyDelta scopes delete[] to the roots the NEW bundle ships, so a retired
  // root-level launcher is invisible to it. Without these entries an updated
  // install keeps a start.vbs that does `pushd %ROOT%\app` and dies on launch.
  assert.deepStrictEqual(RETIRED_PATHS.win32, ['start.vbs', 'start-with-terminal.bat']);
  // app/ must NOT be listed: the applier that runs a transition update is the
  // user's OLD one, executing app/node_modules/electron/dist/electron.exe as
  // node, and Windows cannot delete a running image.
  assert.ok(!RETIRED_PATHS.win32.includes('app/'), 'deleting a running electron.exe aborts the update');
});

test('Windows updaters run through CubricVision.exe, not a nested electron.exe', () => {
  const fromZip = readTemplate('update-from-zip.bat');
  assert.match(fromZip, /CubricVision\.exe/);
  assert.ok(
    !/app\\node_modules\\electron/.test(fromZip),
    'update-from-zip.bat still points at the pre-relayout electron.exe',
  );

  // The online updater must not depend on a blocked script for its real work:
  // the in-app button spawns win-update.cjs directly, and the .bat is only a
  // second entry point onto the same file.
  const online = readTemplate('update.bat');
  assert.match(online, /win-update\.cjs/);
  assert.ok(!/powershell/i.test(online), 'the PowerShell download step moved into win-update.cjs');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'portable', 'win-update.cjs')));
});

test('apply-update resolves extract-zip in both live layouts', () => {
  const applier = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'portable', 'apply-update.cjs'),
    'utf8',
  );
  // Windows is resources/app, Linux/macOS are app. Losing either breaks the
  // SECOND update on that platform, not the first — it would pass a naive smoke.
  assert.match(applier, /'resources', 'app', 'node_modules', 'extract-zip'/);
  assert.match(applier, /'app', 'node_modules', 'extract-zip'/);
  // Windows cannot overwrite a running image; the updater runs through the very
  // exe an Electron bump would replace.
  assert.match(applier, /evictBusyFile/);
});

test('main.js derives the portable roots without a start script', () => {
  const main = fs.readFileSync(path.join(REPO_ROOT, 'main.js'), 'utf8');
  // getDefaultModelsRoot falls back to <engine>/mpi_models, so an unset
  // CUBRIC_MODELS_ROOT buries models inside the engine folder.
  assert.match(main, /env\.CUBRIC_MODELS_ROOT = path\.join\(portableRoot, 'models'\)/);
  assert.match(main, /env\.CUBRIC_ENGINE_ROOT = path\.join\(portableRoot, 'engine'\)/);
  assert.match(main, /env\.CUBRIC_USER_DATA_ROOT = path\.join\(portableRoot, 'user-data'\)/);
  // run-update must not spawn a SAC-blocked .bat on Windows.
  assert.match(main, /win-update\.cjs/);
  assert.ok(!/'update\.bat'/.test(main), 'run-update still spawns the blocked update.bat');
});

// -- MPI-416 (absorbed MPI-417): the connector symlink ---------------------------
// `@cubric/connector` is a `file:` dep on a SIBLING REPO, so npm leaves a symlink in
// node_modules - dangling on CI, where the sibling does not exist. copyAppTree
// recreates symlinks and macOS ditto preserves them, so a VERIFIED 1.3.0 artifact
// shipped a link to ../../../Cubric-Studio/... Nothing crashed (every consumer
// dynamic-imports it in try/catch), but our own documented first-run command,
// `xattr -dr com.apple.quarantine <folder>`, printed "No such file" for every Mac user.
test('the @cubric file: dependency is excluded from the staged app tree', async () => {
    const { shouldExcludeAppPath } = await import(
        pathToFileURL(path.join(REPO_ROOT, 'scripts', 'build-portable.mjs')).href);
    assert.equal(shouldExcludeAppPath('node_modules/@cubric/connector', 'connector'), true);
    assert.equal(shouldExcludeAppPath('node_modules/@cubric', '@cubric'), true);
    // Everything else in node_modules still ships - the app does not run without it.
    assert.equal(shouldExcludeAppPath('node_modules/express/index.js', 'index.js'), false);
    assert.equal(shouldExcludeAppPath('node_modules/@babel/runtime', 'runtime'), false);
});

test('a dangling symlink anywhere in the staged tree fails the build', async () => {
    const { assertNoDanglingSymlinks } = await import(
        pathToFileURL(path.join(REPO_ROOT, 'scripts', 'build-portable.mjs')).href);
    const os = require('node:os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi416-'));
    try {
        // A real file + a link to it: the shape every macOS .framework uses, and the
        // reason this check tests reachability rather than banning symlinks.
        fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(root, 'nested', 'real.txt'), 'x');
        try {
            fs.symlinkSync(path.join(root, 'nested', 'real.txt'), path.join(root, 'good.link'));
        } catch (err) {
            // Windows without Developer Mode / admin cannot create symlinks at all.
            // Skipping is honest; asserting nothing would be a green test that proves nothing.
            console.log(`  skip  dangling-symlink check (symlinks unavailable: ${err.code})`);
            return;
        }
        await assertNoDanglingSymlinks(root); // resolves: nothing is broken

        fs.symlinkSync(path.join(root, 'nested', 'gone.txt'), path.join(root, 'bad.link'));
        await assert.rejects(() => assertNoDanglingSymlinks(root), /dangling symlink/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
