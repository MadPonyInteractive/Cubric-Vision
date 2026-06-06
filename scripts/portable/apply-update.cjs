#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const opts = { root: '', bundle: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--root') opts.root = argv[++i];
    else if (arg.startsWith('--root=')) opts.root = arg.slice('--root='.length);
    else if (arg === '--bundle') opts.bundle = argv[++i];
    else if (arg.startsWith('--bundle=')) opts.bundle = arg.slice('--bundle='.length);
    else if (!opts.bundle) opts.bundle = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.root) throw new Error('Missing --root <portable-root>');
  if (!opts.bundle) throw new Error('Missing --bundle <update.zip>');
  opts.root = path.resolve(opts.root);
  opts.bundle = path.resolve(opts.bundle);
  return opts;
}

function assertInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing path outside portable root: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

function loadExtractZip(root) {
  const modulePath = path.join(root, 'app', 'node_modules', 'extract-zip');
  return require(modulePath);
}

function findManifestRoot(dir, depth = 0) {
  const candidate = path.join(dir, 'resources', 'cubric', 'update-manifest.json');
  if (fs.existsSync(candidate)) return dir;
  if (depth > 2) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findManifestRoot(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

function backupExisting(root, backupRoot, relPath) {
  const target = assertInside(root, path.join(root, ...relPath.split('/')));
  if (!fs.existsSync(target)) return;
  const backup = assertInside(backupRoot, path.join(backupRoot, ...relPath.split('/')));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.cpSync(target, backup, { recursive: true, force: true });
}

function copyManifestFile(bundleRoot, portableRoot, backupRoot, relPath) {
  const source = path.resolve(bundleRoot, ...relPath.split('/'));
  const target = assertInside(portableRoot, path.join(portableRoot, ...relPath.split('/')));
  if (!source.startsWith(path.resolve(bundleRoot) + path.sep) && source !== path.resolve(bundleRoot)) {
    throw new Error(`Refusing bundle path outside extracted update: ${source}`);
  }
  if (!fs.existsSync(source)) {
    throw new Error(`Update manifest listed missing file: ${relPath}`);
  }
  backupExisting(portableRoot, backupRoot, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function applyDeletes(portableRoot, backupRoot, manifest) {
  for (const relPath of manifest.delete || []) {
    backupExisting(portableRoot, backupRoot, relPath);
    const target = assertInside(portableRoot, path.join(portableRoot, ...relPath.split('/')));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function getCliArgs() {
  const argv = process.argv.slice(1);
  return argv[0] && argv[0].endsWith('apply-update.cjs') ? argv.slice(1) : argv;
}

async function main() {
  const opts = parseArgs(getCliArgs());
  if (!fs.existsSync(opts.bundle)) {
    throw new Error(`Update bundle not found: ${opts.bundle}`);
  }
  const extractZip = loadExtractZip(opts.root);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tmpRoot = path.join(opts.root, 'update', 'tmp', `update-${stamp}`);
  const rollbackRoot = path.join(opts.root, 'update', 'rollback', stamp);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(tmpRoot, { recursive: true });
  await extractZip(opts.bundle, { dir: tmpRoot });

  const bundleRoot = findManifestRoot(tmpRoot);
  if (!bundleRoot) {
    throw new Error('Update bundle does not contain resources/cubric/update-manifest.json');
  }
  const manifestPath = path.join(bundleRoot, 'resources', 'cubric', 'update-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  if (manifest.appId !== 'cubric.vision') {
    throw new Error(`Wrong update appId: ${manifest.appId}`);
  }
  if (manifest.platform && manifest.platform !== process.platform) {
    throw new Error(`Wrong update platform: ${manifest.platform}; current platform is ${process.platform}`);
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('Update manifest files must be an array');
  }

  fs.mkdirSync(rollbackRoot, { recursive: true });
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string') continue;
    copyManifestFile(bundleRoot, opts.root, rollbackRoot, file.path);
  }
  applyDeletes(opts.root, rollbackRoot, manifest);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`Applied Cubric Vision update to ${manifest.toVersion || 'unknown version'}.`);
  console.log(`Rollback files, if any, are in: ${rollbackRoot}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
