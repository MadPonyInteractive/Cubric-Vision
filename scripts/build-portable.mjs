#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONNECTOR_MANIFEST_REL = 'resources/cubric/connector-manifest.json';
const UPDATE_MANIFEST_REL = 'resources/cubric/update-manifest.json';
const BUILD_INFO_REL = 'js/core/buildInfo.js';
const TEMPLATE_ROOT = path.join(SCRIPT_DIR, 'portable');
const DEFAULT_STAGE_DIR = path.join(REPO_ROOT, 'dist', 'portable');
const execFileAsync = promisify(execFile);

const PLATFORM_CONFIG = {
  win32: {
    label: 'windows',
    start: 'start.bat',
    update: 'update.bat',
    updateFromZip: 'update-from-zip.bat',
    templateDir: 'windows',
    fullArchiveExt: '.zip',
    updateArchiveExt: '.zip',
    ffmpegRel: 'node_modules/ffmpeg-static/ffmpeg.exe',
    ffprobeRel: 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe',
  },
  linux: {
    label: 'linux',
    start: 'start.sh',
    update: 'update.sh',
    updateFromZip: 'update-from-zip.sh',
    templateDir: 'linux',
    fullArchiveExt: '.tar.gz',
    updateArchiveExt: '.zip',
    ffmpegRel: 'node_modules/ffmpeg-static/ffmpeg',
    ffprobeRel: 'node_modules/ffprobe-static/bin/linux/x64/ffprobe',
  },
  darwin: {
    label: 'macos',
    start: 'start.command',
    update: 'update.command',
    updateFromZip: 'update-from-zip.command',
    templateDir: 'macos',
    fullArchiveExt: '.zip',
    updateArchiveExt: '.zip',
    ffmpegRelByArch: {
      x64: 'node_modules/ffprobe-static/bin/darwin/x64/ffprobe',
      arm64: 'node_modules/ffprobe-static/bin/darwin/arm64/ffprobe',
    },
    ffmpegRel: 'node_modules/ffmpeg-static/ffmpeg',
  },
};

const PRESERVE = [
  'engine/',
  'models/',
  'user-data/',
  '<documents>/Cubric Studio/Projects/',
];

const APP_COPY_EXCLUDES = new Set([
  '.agents',
  '.claude',
  '.codex',
  '.eslint-rules',
  '.env',
  '.env.local',
  '.git',
  '.engine-config.json',
  '.github',
  '.husky',
  '.kilo',
  '.playwright',
  '.playwright-cli',
  '.vscode',
  'AGENTS.md',
  'CLAUDE.md',
  'Cubric-Vision.code-workspace',
  'build',
  'coverage',
  'debug.log',
  'dist',
  'electron-builder.yml',
  'engine',
  'logs',
  'media-for-testing',
  'next.md',
  'nimbalyst-local',
  'output',
  'plans',
  'playwright-report',
  'playwright.desktop.config.js',
  'projects',
  'scripts',
  'test-results',
  'tests',
  'tmp',
  'eslint.config.js',
  'jsconfig.json',
]);

function parseArgs(argv) {
  const opts = {
    platform: process.platform,
    arch: process.arch,
    dryRun: false,
    clean: false,
    stageDir: DEFAULT_STAGE_DIR,
    sourceManifest: true,
    archive: true,
    updateBundle: true,
    buildHash: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--clean') {
      opts.clean = true;
    } else if (arg === '--no-source-manifest') {
      opts.sourceManifest = false;
    } else if (arg === '--no-archive') {
      opts.archive = false;
    } else if (arg === '--no-update-bundle') {
      opts.updateBundle = false;
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
    } else if (arg === '--build-hash') {
      opts.buildHash = argv[++i];
    } else if (arg.startsWith('--build-hash=')) {
      opts.buildHash = arg.slice('--build-hash='.length);
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
  --build-hash <value>   Build hash to stamp. Defaults to Git short SHA.
  --stage-dir <path>     Parent directory for the artifact root.
  --no-source-manifest   Do not mirror the generated manifest to resources/cubric.
  --no-archive           Stage folders only; do not write zip/tar.gz artifacts.
  --no-update-bundle     Do not stage the matching update bundle.
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

async function copyDirEnsured(from, to) {
  if (!await pathExists(from)) return false;
  await ensureDir(path.dirname(to));
  await fs.cp(from, to, { recursive: true, force: true });
  return true;
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function normalizeBuildHash(value) {
  if (typeof value !== 'string') return 'dev';
  const hash = value.trim().toLowerCase();
  if (!hash || hash === 'dev') return 'dev';
  if (!/^[0-9a-f]{7,40}$/.test(hash)) {
    throw new Error(`Invalid build hash "${value}". Expected 7-40 hex characters or "dev".`);
  }
  return hash;
}

async function resolveBuildHash(explicit) {
  if (explicit) return normalizeBuildHash(explicit);
  if (process.env.CUBRIC_BUILD_HASH) return normalizeBuildHash(process.env.CUBRIC_BUILD_HASH);
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: REPO_ROOT });
    return normalizeBuildHash(stdout);
  } catch {
    return 'dev';
  }
}

async function writeBuildInfo(appRoot, buildHash) {
  await writeFileEnsured(
    path.join(appRoot, BUILD_INFO_REL),
    [
      '/**',
      ' * js/core/buildInfo.js - generated during portable staging.',
      ' * Source/dev runs use the committed default in the repository.',
      ' */',
      '',
      `export const BUILD_HASH = '${buildHash}';`,
      '',
    ].join('\n'),
  );
}

function shouldExcludeAppPath(relPath, entryName) {
  const normalized = toPosix(relPath);
  const rootName = normalized.split('/')[0] || entryName;
  if (APP_COPY_EXCLUDES.has(rootName)) return true;
  if (rootName.startsWith('.env')) return true;
  if (normalized.endsWith('.log')) return true;
  return false;
}

async function copyAppTree(fromDir, toDir, relBase = '', skipAbs = null) {
  await ensureDir(toDir);
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relBase ? path.join(relBase, entry.name) : entry.name;
    if (shouldExcludeAppPath(relPath, entry.name)) continue;
    const sourcePath = path.join(fromDir, entry.name);
    // Never descend into the artifact/stage root itself — guards against a
    // recursive copy bomb when --stage-dir resolves inside the repo.
    if (skipAbs && path.resolve(sourcePath) === skipAbs) continue;
    const targetPath = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyAppTree(sourcePath, targetPath, relPath, skipAbs);
    } else if (entry.isFile()) {
      await copyFileEnsured(sourcePath, targetPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = await fs.readlink(sourcePath);
      await ensureDir(path.dirname(targetPath));
      try {
        await fs.symlink(linkTarget, targetPath);
      } catch {
        // Windows without symlink privileges can still stage the resolved file.
        const realPath = await fs.realpath(sourcePath);
        const stat = await fs.stat(realPath);
        if (stat.isDirectory()) await copyAppTree(realPath, targetPath, relPath, skipAbs);
        else await copyFileEnsured(realPath, targetPath);
      }
    }
  }
}

async function stageResources(stageRoot, opts, config) {
  await copyDirEnsured(path.join(REPO_ROOT, 'resources'), path.join(stageRoot, 'resources'));
  await copyDirEnsured(path.join(REPO_ROOT, 'media', 'icons'), path.join(stageRoot, 'resources', 'icons'));

  const ffmpegSource = path.join(REPO_ROOT, ...config.ffmpegRel.split('/'));
  const ffmpegName = opts.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (await pathExists(ffmpegSource)) {
    await copyFileEnsured(ffmpegSource, path.join(stageRoot, 'resources', ffmpegName));
  }

  const ffprobeRel = config.ffprobeRelByArch?.[opts.arch] || config.ffprobeRel;
  const ffprobeName = opts.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  if (ffprobeRel) {
    const ffprobeSource = path.join(REPO_ROOT, ...ffprobeRel.split('/'));
    if (await pathExists(ffprobeSource)) {
      await copyFileEnsured(ffprobeSource, path.join(stageRoot, 'resources', ffprobeName));
    }
  }
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
  const isUnderTmp =
    resolved.startsWith(tmp + path.sep) ||
    resolved.startsWith(path.resolve('C:\\tmp') + path.sep) ||
    resolved.startsWith(path.resolve('D:\\tmp') + path.sep);
  if (!isUnderRepoDist && !isUnderTmp) {
    throw new Error(`Refusing to clean outside repo dist/, C:\\tmp, D:\\tmp, or system temp: ${resolved}`);
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

  await stageResources(stageRoot, opts, config);

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
  await copyFileEnsured(path.join(TEMPLATE_ROOT, 'apply-update.cjs'), path.join(stageRoot, 'update', 'apply-update.cjs'));

  if (opts.dryRun) {
    await writeFileEnsured(
      path.join(stageRoot, 'app', 'PORTABLE_DRY_RUN.txt'),
      [
        'Cubric Vision portable dry-run stage.',
        'This placeholder proves manifest generation without copying app sources, user folders, or downloaded binaries.',
        '',
      ].join('\n'),
    );
    await writeBuildInfo(path.join(stageRoot, 'app'), opts.buildHash);
    return;
  }

  await copyAppTree(REPO_ROOT, path.join(stageRoot, 'app'), '', path.resolve(stageRoot));
  await writeBuildInfo(path.join(stageRoot, 'app'), opts.buildHash);
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

async function createUpdateManifest(stageRoot, opts, config, artifactKind = null) {
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
      kind: artifactKind || (opts.dryRun ? 'dry-run-stage' : 'portable-stage'),
      rootName: path.basename(stageRoot),
      launchers: [config.start, config.update, config.updateFromZip],
      buildHash: opts.buildHash,
    },
  };

  await writeFileEnsured(path.join(stageRoot, UPDATE_MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`);
  const shouldMirrorSource = opts.sourceManifest && !String(manifest.artifact.kind).includes('update-bundle');
  if (shouldMirrorSource) {
    await writeFileEnsured(path.join(REPO_ROOT, UPDATE_MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return manifest;
}

async function stageUpdateBundle(fullStageRoot, updateStageRoot, opts, config) {
  if (opts.clean && await pathExists(updateStageRoot)) {
    assertSafeClean(updateStageRoot);
    await fs.rm(updateStageRoot, { recursive: true, force: true });
  }
  await ensureDir(updateStageRoot);
  await copyDirEnsured(path.join(fullStageRoot, 'app'), path.join(updateStageRoot, 'app'));
  await copyDirEnsured(path.join(fullStageRoot, 'resources'), path.join(updateStageRoot, 'resources'));
  await copyDirEnsured(path.join(fullStageRoot, 'update'), path.join(updateStageRoot, 'update'));
  for (const launcher of [config.start, config.update, config.updateFromZip]) {
    await copyFileEnsured(path.join(fullStageRoot, launcher), path.join(updateStageRoot, launcher));
    await makeExecutableIfNeeded(path.join(updateStageRoot, launcher));
  }
  return createUpdateManifest(updateStageRoot, opts, config, opts.dryRun ? 'dry-run-update-bundle' : 'update-bundle');
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

async function createZipFromDir(sourceDir, zipPath, { includeRoot = false } = {}) {
  const files = await listFiles(sourceDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();
  const rootPrefix = includeRoot ? path.basename(sourceDir) : '';

  for (const relPath of files) {
    const sourcePath = path.join(sourceDir, ...relPath.split('/'));
    const raw = await fs.readFile(sourcePath);
    const compressed = await promisify(zlib.deflateRaw)(raw, { level: 9 });
    const archivePath = rootPrefix ? `${rootPrefix}/${relPath}` : relPath;
    const name = Buffer.from(archivePath, 'utf8');
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralOffset = offset;
  const centralBody = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBody.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  await ensureDir(path.dirname(zipPath));
  await fs.writeFile(zipPath, Buffer.concat([...localParts, centralBody, end]));
  return zipPath;
}

function tarHeader(name, size, mode = 0o644, type = '0') {
  const header = Buffer.alloc(512, 0);
  let namePart = name;
  let prefixPart = '';
  if (Buffer.byteLength(namePart) > 100) {
    const slashIndexes = [...name].map((char, index) => (char === '/' ? index : -1)).filter((index) => index >= 0);
    const splitIndex = slashIndexes.reverse().find((index) => (
      Buffer.byteLength(name.slice(0, index)) <= 155
      && Buffer.byteLength(name.slice(index + 1)) <= 100
    ));
    if (splitIndex === undefined) {
      throw new Error(`tar path too long: ${name}`);
    }
    prefixPart = name.slice(0, splitIndex);
    namePart = name.slice(splitIndex + 1);
  }
  Buffer.from(namePart).copy(header, 0);
  if (prefixPart) Buffer.from(prefixPart).copy(header, 345);
  header.write(mode.toString(8).padStart(7, '0') + '\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return header;
}

async function createTarGzFromDir(sourceDir, tarGzPath) {
  const rootName = path.basename(sourceDir);
  const files = await listFiles(sourceDir);
  const parts = [tarHeader(`${rootName}/`, 0, 0o755, '5')];
  for (const relPath of files) {
    const sourcePath = path.join(sourceDir, ...relPath.split('/'));
    const data = await fs.readFile(sourcePath);
    const mode = relPath.endsWith('.sh') || relPath.endsWith('.command') ? 0o755 : 0o644;
    const name = `${rootName}/${relPath}`;
    parts.push(tarHeader(name, data.length, mode, '0'), data);
    const remainder = data.length % 512;
    if (remainder) parts.push(Buffer.alloc(512 - remainder, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  await ensureDir(path.dirname(tarGzPath));
  await fs.writeFile(tarGzPath, await promisify(zlib.gzip)(Buffer.concat(parts), { level: 9 }));
  return tarGzPath;
}

async function createArchiveFromDir(sourceDir, archivePath, ext, { includeRoot = false } = {}) {
  if (ext === '.tar.gz') return createTarGzFromDir(sourceDir, archivePath);
  return createZipFromDir(sourceDir, archivePath, { includeRoot });
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
  opts.buildHash = await resolveBuildHash(opts.buildHash);

  const config = PLATFORM_CONFIG[opts.platform];
  const rootName = `CubricVision-${config.label}-${opts.arch}-v${opts.version}`;
  const updateRootName = `CubricVision-${config.label}-${opts.arch}-update-v${opts.version}`;
  const stageRoot = path.resolve(opts.stageDir, rootName);
  const updateStageRoot = path.resolve(opts.stageDir, updateRootName);

  // Fail fast if the stage dir sits inside the repo (other than dist/). The
  // copy walker skips the stage root, but staging inside the source tree is
  // never intended and previously caused a recursive copy bomb.
  const resolvedStageParent = path.resolve(opts.stageDir);
  const repoResolved = path.resolve(REPO_ROOT);
  const stageInsideRepo =
    resolvedStageParent === repoResolved ||
    resolvedStageParent.startsWith(repoResolved + path.sep);
  const stageUnderDist = resolvedStageParent.startsWith(path.join(repoResolved, 'dist') + path.sep)
    || resolvedStageParent === path.join(repoResolved, 'dist');
  if (stageInsideRepo && !stageUnderDist) {
    throw new Error(`Refusing to stage inside the repo tree: ${resolvedStageParent}. Use dist/, C:\\tmp, or D:\\tmp.`);
  }

  if (opts.clean && await pathExists(stageRoot)) {
    assertSafeClean(stageRoot);
    await fs.rm(stageRoot, { recursive: true, force: true });
  }

  await stagePortableSkeleton(stageRoot, opts, config);
  const manifest = await createUpdateManifest(stageRoot, opts, config);
  validateUpdateManifest(manifest);
  let updateManifest = null;
  if (opts.updateBundle) {
    updateManifest = await stageUpdateBundle(stageRoot, updateStageRoot, opts, config);
    validateUpdateManifest(updateManifest);
  }

  let artifactArchive = null;
  let updateArchive = null;
  if (opts.archive) {
    artifactArchive = path.resolve(opts.stageDir, `${rootName}${config.fullArchiveExt}`);
    updateArchive = opts.updateBundle
      ? path.resolve(opts.stageDir, `${updateRootName}${config.updateArchiveExt}`)
      : null;
    if (opts.clean && await pathExists(artifactArchive)) await fs.rm(artifactArchive, { force: true });
    if (opts.clean && updateArchive && await pathExists(updateArchive)) await fs.rm(updateArchive, { force: true });
    await createArchiveFromDir(stageRoot, artifactArchive, config.fullArchiveExt, { includeRoot: true });
    if (updateArchive) {
      await createArchiveFromDir(updateStageRoot, updateArchive, config.updateArchiveExt);
    }
  }

  const summary = {
    stageRoot,
    updateStageRoot: opts.updateBundle ? updateStageRoot : null,
    dryRun: opts.dryRun,
    buildHash: opts.buildHash,
    updateManifest: path.join(stageRoot, UPDATE_MANIFEST_REL),
    updateBundleManifest: opts.updateBundle ? path.join(updateStageRoot, UPDATE_MANIFEST_REL) : null,
    sourceManifest: opts.sourceManifest ? path.join(REPO_ROOT, UPDATE_MANIFEST_REL) : null,
    artifactArchive,
    updateArchive,
    connectorManifestHash: manifest.connectorManifestHash,
    fileCount: manifest.files.length,
    updateFileCount: updateManifest?.files?.length ?? null,
    preserve: manifest.preserve,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
