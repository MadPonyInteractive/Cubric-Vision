#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONNECTOR_MANIFEST_REL = 'resources/cubric/connector-manifest.json';
const UPDATE_MANIFEST_REL = 'resources/cubric/update-manifest.json';
const TEMPLATE_ROOT = path.join(SCRIPT_DIR, 'portable');
const DEFAULT_STAGE_DIR = path.join(REPO_ROOT, 'dist', 'portable');

const PLATFORM_CONFIG = {
  win32: {
    label: 'windows',
    start: 'start.bat',
    update: 'update.bat',
    updateFromZip: 'update-from-zip.bat',
    templateDir: 'windows',
  },
  linux: {
    label: 'linux',
    start: 'start.sh',
    update: 'update.sh',
    updateFromZip: 'update-from-zip.sh',
    templateDir: 'linux',
  },
  darwin: {
    label: 'macos',
    start: 'start.command',
    update: 'update.command',
    updateFromZip: 'update-from-zip.command',
    templateDir: 'macos',
  },
};

const PRESERVE = [
  'engine/',
  'models/',
  'user-data/',
  '<documents>/Cubric Studio/Projects/',
];

function parseArgs(argv) {
  const opts = {
    platform: process.platform,
    arch: process.arch,
    dryRun: false,
    clean: false,
    stageDir: DEFAULT_STAGE_DIR,
    sourceManifest: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--clean') {
      opts.clean = true;
    } else if (arg === '--no-source-manifest') {
      opts.sourceManifest = false;
    } else if (arg === '--platform') {
      opts.platform = argv[++i];
    } else if (arg.startsWith('--platform=')) {
      opts.platform = arg.slice('--platform='.length);
    } else if (arg === '--arch') {
      opts.arch = argv[++i];
    } else if (arg.startsWith('--arch=')) {
      opts.arch = arg.slice('--arch='.length);
    } else if (arg === '--version') {
      opts.version = argv[++i];
    } else if (arg.startsWith('--version=')) {
      opts.version = arg.slice('--version='.length);
    } else if (arg === '--stage-dir') {
      opts.stageDir = argv[++i];
    } else if (arg.startsWith('--stage-dir=')) {
      opts.stageDir = arg.slice('--stage-dir='.length);
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/build-portable.mjs [options]

Options:
  --dry-run              Stage manifests/templates only. No downloads or user folders.
  --clean                Remove the target artifact root before staging.
  --platform <value>     win32, linux, or darwin. Defaults to current platform.
  --arch <value>         Architecture label. Defaults to current arch.
  --version <value>      Release version. Defaults to package.json version.
  --stage-dir <path>     Parent directory for the artifact root.
  --no-source-manifest   Do not mirror the generated manifest to resources/cubric.
`);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyFileEnsured(from, to) {
  await ensureDir(path.dirname(to));
  await fs.copyFile(from, to);
}

async function makeExecutableIfNeeded(filePath) {
  if (filePath.endsWith('.sh') || filePath.endsWith('.command')) {
    await fs.chmod(filePath, 0o755);
  }
}

async function writeFileEnsured(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, 'utf8');
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function assertSupportedPlatform(platform) {
  if (!PLATFORM_CONFIG[platform]) {
    throw new Error(`Unsupported platform "${platform}". Use win32, linux, or darwin.`);
  }
}

function assertSafeClean(targetPath) {
  const resolved = path.resolve(targetPath);
  const repo = path.resolve(REPO_ROOT);
  const tmp = path.resolve(process.env.TEMP || process.env.TMP || 'C:\\tmp');
  const isUnderRepoDist = resolved.startsWith(path.join(repo, 'dist') + path.sep);
  const isUnderTmp = resolved.startsWith(tmp + path.sep) || resolved.startsWith(path.resolve('C:\\tmp') + path.sep);
  if (!isUnderRepoDist && !isUnderTmp) {
    throw new Error(`Refusing to clean outside repo dist/ or temp: ${resolved}`);
  }
  if (resolved === repo || resolved.length < 12) {
    throw new Error(`Refusing to clean unsafe path: ${resolved}`);
  }
}

async function stagePortableSkeleton(stageRoot, opts, config) {
  await ensureDir(stageRoot);
  await ensureDir(path.join(stageRoot, 'app'));
  await ensureDir(path.join(stageRoot, 'resources', 'cubric'));
  await ensureDir(path.join(stageRoot, 'engine'));
  await ensureDir(path.join(stageRoot, 'models'));
  await ensureDir(path.join(stageRoot, 'user-data'));
  await ensureDir(path.join(stageRoot, 'update'));

  const connectorSource = path.join(REPO_ROOT, CONNECTOR_MANIFEST_REL);
  const connectorTarget = path.join(stageRoot, CONNECTOR_MANIFEST_REL);
  await copyFileEnsured(connectorSource, connectorTarget);

  const startTarget = path.join(stageRoot, config.start);
  const updateTarget = path.join(stageRoot, config.update);
  const updateFromZipTarget = path.join(stageRoot, config.updateFromZip);
  await copyFileEnsured(path.join(TEMPLATE_ROOT, config.templateDir, config.start), startTarget);
  await copyFileEnsured(path.join(TEMPLATE_ROOT, config.templateDir, config.update), updateTarget);
  await copyFileEnsured(
    path.join(TEMPLATE_ROOT, config.templateDir, config.updateFromZip),
    updateFromZipTarget,
  );
  await makeExecutableIfNeeded(startTarget);
  await makeExecutableIfNeeded(updateTarget);
  await makeExecutableIfNeeded(updateFromZipTarget);
  await copyFileEnsured(path.join(TEMPLATE_ROOT, 'update-runbook.md'), path.join(stageRoot, 'update', 'README.md'));

  if (opts.dryRun) {
    await writeFileEnsured(
      path.join(stageRoot, 'app', 'PORTABLE_DRY_RUN.txt'),
      [
        'Cubric Vision portable dry-run stage.',
        'This placeholder proves manifest generation without copying app sources, user folders, or downloaded binaries.',
        '',
      ].join('\n'),
    );
    return;
  }

  throw new Error('Full app/runtime packaging is not implemented yet. Re-run with --dry-run for the current skeleton.');
}

function assertConnectorManifest(manifest) {
  const errors = [];
  if (manifest.appId !== 'cubric.vision') errors.push('appId must be cubric.vision');
  if (manifest.protocolVersion !== '0.1.0') errors.push('protocolVersion must be 0.1.0');
  if (manifest.metadata?.manifestOnly !== true) errors.push('metadata.manifestOnly must be true');
  if (errors.length) {
    throw new Error(`Connector manifest smoke assertions failed: ${errors.join('; ')}`);
  }
}

async function listFiles(root, dir = root) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, fullPath));
    } else if (entry.isFile()) {
      files.push(toPosix(path.relative(root, fullPath)));
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function buildFileEntries(stageRoot) {
  const files = await listFiles(stageRoot);
  const entries = [];
  for (const relPath of files) {
    if (relPath === UPDATE_MANIFEST_REL) continue;
    const fullPath = path.join(stageRoot, ...relPath.split('/'));
    const stat = await fs.stat(fullPath);
    entries.push({
      path: relPath,
      size: stat.size,
      sha256: await sha256(fullPath),
    });
  }
  return entries;
}

async function createUpdateManifest(stageRoot, opts, config) {
  const connectorPath = path.join(stageRoot, CONNECTOR_MANIFEST_REL);
  const connectorManifest = await readJson(connectorPath);
  assertConnectorManifest(connectorManifest);

  const manifest = {
    schemaVersion: 1,
    appId: 'cubric.vision',
    displayName: 'Cubric Studio Vision',
    platform: opts.platform,
    arch: opts.arch,
    fromVersion: null,
    toVersion: opts.version,
    protocolVersion: connectorManifest.protocolVersion,
    connectorManifestPath: CONNECTOR_MANIFEST_REL,
    connectorManifestHash: await sha256(connectorPath),
    files: await buildFileEntries(stageRoot),
    preserve: PRESERVE,
    delete: [],
    createdAt: new Date().toISOString(),
    artifact: {
      kind: opts.dryRun ? 'dry-run-stage' : 'portable-stage',
      rootName: path.basename(stageRoot),
      launchers: [config.start, config.update, config.updateFromZip],
    },
  };

  await writeFileEnsured(path.join(stageRoot, UPDATE_MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`);
  if (opts.sourceManifest) {
    await writeFileEnsured(path.join(REPO_ROOT, UPDATE_MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return manifest;
}

function validateUpdateManifest(manifest) {
  const required = [
    'schemaVersion',
    'appId',
    'displayName',
    'platform',
    'arch',
    'toVersion',
    'protocolVersion',
    'connectorManifestPath',
    'connectorManifestHash',
    'files',
    'preserve',
    'createdAt',
  ];
  const missing = required.filter((field) => manifest[field] === undefined);
  if (missing.length) throw new Error(`Update manifest missing fields: ${missing.join(', ')}`);
  if (manifest.appId !== 'cubric.vision') throw new Error('Update manifest appId must be cubric.vision');
  if (manifest.protocolVersion !== '0.1.0') throw new Error('Update manifest protocolVersion must be 0.1.0');
  if (!Array.isArray(manifest.files)) throw new Error('Update manifest files must be an array');
  if (!Array.isArray(manifest.preserve)) throw new Error('Update manifest preserve must be an array');
  for (const preserved of PRESERVE) {
    if (!manifest.preserve.includes(preserved)) {
      throw new Error(`Update manifest preserve list missing ${preserved}`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  assertSupportedPlatform(opts.platform);
  const packageJson = await readJson(path.join(REPO_ROOT, 'package.json'));
  opts.version ??= packageJson.version;

  const config = PLATFORM_CONFIG[opts.platform];
  const rootName = `CubricVision-${config.label}-${opts.arch}-v${opts.version}`;
  const stageRoot = path.resolve(opts.stageDir, rootName);

  if (opts.clean && await pathExists(stageRoot)) {
    assertSafeClean(stageRoot);
    await fs.rm(stageRoot, { recursive: true, force: true });
  }

  await stagePortableSkeleton(stageRoot, opts, config);
  const manifest = await createUpdateManifest(stageRoot, opts, config);
  validateUpdateManifest(manifest);

  const summary = {
    stageRoot,
    dryRun: opts.dryRun,
    updateManifest: path.join(stageRoot, UPDATE_MANIFEST_REL),
    sourceManifest: opts.sourceManifest ? path.join(REPO_ROOT, UPDATE_MANIFEST_REL) : null,
    connectorManifestHash: manifest.connectorManifestHash,
    fileCount: manifest.files.length,
    preserve: manifest.preserve,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
