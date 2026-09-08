'use strict';

// MPI-523 — an applied update must leave the install describing ITSELF. The
// bundle's update-manifest.json is not in its own files[] (createUpdateManifest
// builds the file list, then writes the manifest into that same stage root), so
// the applier copied every file EXCEPT the one that says which version is now
// installed. A 1.3.1 -> 1.4.0 delta left resources/cubric/update-manifest.json
// reading toVersion 1.3.0, contradicting appVersion.js and costing real
// diagnosis time at the 1.4.0 close-out.
//
// The applier runs as a child process on purpose: apply-update.cjs calls main()
// at load, so requiring it would run an update against this repo.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const APPLIER = path.join(REPO_ROOT, 'scripts', 'portable', 'apply-update.cjs');
const MANIFEST_REL = ['resources', 'cubric', 'update-manifest.json'];

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

test('applying an update refreshes the INSTALLED update-manifest.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi523-'));
  const install = path.join(root, 'install');
  const bundle = path.join(root, 'bundle');
  try {
    // The install as a previous FULL extract left it: an old manifest, and one
    // app file the delta will replace. app/package.json is what the MPI-709
    // precondition reads to decide the delta applies here — every real install
    // has one (Electron needs it to find main), so seeding it is fixture parity,
    // not a workaround.
    writeJson(path.join(install, ...MANIFEST_REL), {
      appId: 'cubric.vision', toVersion: '1.3.0', files: [], preserve: [],
    });
    writeJson(path.join(install, 'app', 'package.json'), {
      name: 'cubric-vision', version: '1.3.0',
    });
    fs.writeFileSync(path.join(install, 'app', 'changed.txt'), 'old');

    // A delta bundle, built the way the real one is: the manifest lists the
    // changed file and NOT itself.
    fs.mkdirSync(path.join(bundle, 'app'), { recursive: true });
    fs.writeFileSync(path.join(bundle, 'app', 'changed.txt'), 'new');
    writeJson(path.join(bundle, ...MANIFEST_REL), {
      appId: 'cubric.vision',
      platform: process.platform,
      fromVersion: '1.3.0',
      toVersion: '1.4.0',
      files: [{ path: 'app/changed.txt' }],
      preserve: [],
      delete: [],
    });

    const run = spawnSync(process.execPath, [APPLIER, '--root', install, '--bundle', bundle], {
      encoding: 'utf8',
    });
    assert.strictEqual(run.status, 0, `applier failed: ${run.stderr || run.stdout}`);

    // The ordinary file landed...
    assert.strictEqual(fs.readFileSync(path.join(install, 'app', 'changed.txt'), 'utf8'), 'new');

    // ...and so did the manifest, which is the whole point: the install no
    // longer claims 1.3.0.
    const installed = JSON.parse(fs.readFileSync(path.join(install, ...MANIFEST_REL), 'utf8'));
    assert.strictEqual(installed.toVersion, '1.4.0');
    assert.strictEqual(installed.fromVersion, '1.3.0');

    // The replaced manifest is recoverable like every other overwritten file.
    const rollbacks = fs.readdirSync(path.join(install, 'update', 'rollback'));
    assert.strictEqual(rollbacks.length, 1);
    const backed = JSON.parse(
      fs.readFileSync(path.join(install, 'update', 'rollback', rollbacks[0], ...MANIFEST_REL), 'utf8'),
    );
    assert.strictEqual(backed.toVersion, '1.3.0');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// MPI-709 — a DELTA bundle applies to exactly ONE starting version. The 1.4.4 ->
// 1.5.0 delta was applied onto a 1.4.0 install, which dropped the 67 files added
// across the whole 1.4.x line (dompurify, agentDispatch.js, MpiMediaPicker,
// MpiStepPreview...). The renderer died on the first missing import while the
// updater printed "Update applied successfully", so the corruption was silent:
// appId and platform were the only preconditions the applier checked.

/**
 * An install reporting `version`, plus one app file.
 *
 * The version the guard reads is `resources/app/package.json`, NOT the top-level
 * update-manifest.json: on the real install this bug was found on, package.json
 * said 1.5.0 while the manifest still said 1.3.0, stale across two in-place
 * updates. Both are seeded here, deliberately disagreeing when `staleManifest`
 * is set, so a regression back to the manifest fails loudly instead of passing.
 */
function seedInstall(install, version, staleManifest = '0.0.11') {
  if (version !== null) {
    writeJson(path.join(install, 'resources', 'app', 'package.json'), {
      name: 'cubric-vision', version,
    });
  }
  writeJson(path.join(install, ...MANIFEST_REL), {
    appId: 'cubric.vision', toVersion: staleManifest, files: [], preserve: [],
  });
  fs.mkdirSync(path.join(install, 'app'), { recursive: true });
  fs.writeFileSync(path.join(install, 'app', 'changed.txt'), 'old');
}

/** A bundle carrying one file. `fromVersion: null` makes it a FULL bundle. */
function seedBundle(bundle, fromVersion, toVersion) {
  fs.mkdirSync(path.join(bundle, 'app'), { recursive: true });
  fs.writeFileSync(path.join(bundle, 'app', 'changed.txt'), 'new');
  writeJson(path.join(bundle, ...MANIFEST_REL), {
    appId: 'cubric.vision',
    platform: process.platform,
    fromVersion,
    toVersion,
    files: [{ path: 'app/changed.txt' }],
    preserve: [],
    delete: [],
  });
}

function runApplier(install, bundle) {
  return spawnSync(process.execPath, [APPLIER, '--root', install, '--bundle', bundle], {
    encoding: 'utf8',
  });
}

test('a FULL bundle (fromVersion null) applies onto any installed version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi709-full-'));
  const install = path.join(root, 'install');
  const bundle = path.join(root, 'bundle');
  try {
    // Four releases behind, which is exactly the case a delta cannot serve.
    seedInstall(install, '1.4.0');
    seedBundle(bundle, null, '1.5.1');

    const run = runApplier(install, bundle);
    assert.strictEqual(run.status, 0, `full bundle refused: ${run.stderr || run.stdout}`);
    assert.strictEqual(fs.readFileSync(path.join(install, 'app', 'changed.txt'), 'utf8'), 'new');

    // This is what makes a full bundle the repair path: it heals an install no
    // matter how far behind it is, in place, without touching engine/ or user-data/.
    const installed = JSON.parse(fs.readFileSync(path.join(install, ...MANIFEST_REL), 'utf8'));
    assert.strictEqual(installed.toVersion, '1.5.1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a delta whose fromVersion does not match is REFUSED, and changes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi709-mismatch-'));
  const install = path.join(root, 'install');
  const bundle = path.join(root, 'bundle');
  try {
    seedInstall(install, '1.4.0');
    seedBundle(bundle, '1.4.4', '1.5.0');   // the exact bundle that broke 1.5.0

    const run = runApplier(install, bundle);
    assert.notStrictEqual(run.status, 0, 'mismatched delta was applied');
    const said = `${run.stderr}${run.stdout}`;
    assert.match(said, /1\.4\.0/, 'the error should name the installed version');
    assert.match(said, /1\.4\.4/, 'the error should name the version it expects');
    // Never send a user to a fresh download: a new folder has no engine/, so it
    // costs the entire ComfyUI download again (Fabio, 2026-09-08).
    assert.doesNotMatch(said, /reinstall|download the full/i);

    // Refused means UNTOUCHED — the app file, the version, the manifest, and no
    // rollback dir (nothing was backed up because nothing was overwritten).
    assert.strictEqual(fs.readFileSync(path.join(install, 'app', 'changed.txt'), 'utf8'), 'old');
    const pkg = JSON.parse(
      fs.readFileSync(path.join(install, 'resources', 'app', 'package.json'), 'utf8'),
    );
    assert.strictEqual(pkg.version, '1.4.0');
    const installed = JSON.parse(fs.readFileSync(path.join(install, ...MANIFEST_REL), 'utf8'));
    assert.strictEqual(installed.toVersion, '0.0.11', 'the stale manifest must be left alone too');
    assert.strictEqual(fs.existsSync(path.join(install, 'update', 'rollback')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a delta is REFUSED when the installed version cannot be read', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi709-unknown-'));
  const install = path.join(root, 'install');
  const bundle = path.join(root, 'bundle');
  try {
    seedInstall(install, null);             // no manifest at all
    seedBundle(bundle, '1.4.4', '1.5.0');

    const run = runApplier(install, bundle);
    // Refuse rather than guess: an unverifiable delta is the case that corrupted
    // the real installs, so "probably fine" is the wrong default.
    assert.notStrictEqual(run.status, 0, 'unverifiable delta was applied');
    assert.strictEqual(fs.readFileSync(path.join(install, 'app', 'changed.txt'), 'utf8'), 'old');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
