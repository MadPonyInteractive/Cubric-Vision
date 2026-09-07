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
    // app file the delta will replace.
    writeJson(path.join(install, ...MANIFEST_REL), {
      appId: 'cubric.vision', toVersion: '1.3.0', files: [], preserve: [],
    });
    fs.mkdirSync(path.join(install, 'app'), { recursive: true });
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
