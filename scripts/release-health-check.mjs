#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const rel = (...parts) => path.join(REPO_ROOT, ...parts);

const FILES = {
  appVersion: rel('js', 'core', 'appVersion.js'),
  packageJson: rel('package.json'),
  packageLock: rel('package-lock.json'),
  migrations: rel('js', 'migrations', 'projectMigrations.js'),
  routesProjects: rel('routes', 'projects.js'),
  commandRegistry: rel('js', 'data', 'commandRegistry.js'),
  operationRegistry: rel('js', 'core', 'operationRegistry.js'),
  operationRegistryJson: rel('operation_registry.json'),
  universalWorkflows: rel('js', 'data', 'modelConstants', 'universal_workflows.js'),
  models: rel('js', 'data', 'modelConstants', 'models.js'),
  releaseNotes: rel('js', 'data', 'releaseNotes.js'),
  releasesDir: rel('docs', 'releases'),
  systemDependencies: rel('dev_configs', 'system_dependencies.json'),
  preReleaseTest: rel('scripts', 'pre_release_test.py'),
};

const failures = [];

function fail(message) {
  failures.push(message);
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

function matchRequired(text, regex, label) {
  const match = regex.exec(text);
  if (!match) throw new Error(`Could not find ${label}`);
  return match[1];
}

function skipWhitespaceAndComments(text, index) {
  let i = index;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

function skipString(text, index) {
  const quote = text[index];
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function findObjectLiteral(text, markerRegex, label) {
  const marker = markerRegex.exec(text);
  if (!marker) throw new Error(`Could not find ${label}`);

  const start = text.indexOf('{', marker.index);
  if (start < 0) throw new Error(`Could not find opening brace for ${label}`);

  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i) - 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  throw new Error(`Could not find closing brace for ${label}`);
}

function readObjectKey(text, index) {
  const ch = text[index];
  if (ch === '"' || ch === "'") {
    const end = skipString(text, index);
    return { key: text.slice(index + 1, end - 1), end };
  }

  const match = /^[A-Za-z_$][\w$]*/.exec(text.slice(index));
  if (!match) return null;
  return { key: match[0], end: index + match[0].length };
}

function parseTopLevelObjectEntries(objectText) {
  const inner = objectText.slice(1, -1);
  const entries = new Map();
  let i = 0;

  while (i < inner.length) {
    i = skipWhitespaceAndComments(inner, i);
    if (inner[i] === ',') {
      i += 1;
      continue;
    }

    const keyInfo = readObjectKey(inner, i);
    if (!keyInfo) {
      i += 1;
      continue;
    }

    i = skipWhitespaceAndComments(inner, keyInfo.end);
    if (inner[i] !== ':') {
      i += 1;
      continue;
    }

    i += 1;
    const valueStart = i;
    let depth = 0;
    while (i < inner.length) {
      const ch = inner[i];
      const next = inner[i + 1];
      if (ch === '"' || ch === "'" || ch === '`') {
        i = skipString(inner, i);
        continue;
      }
      if (ch === '/' && next === '/') {
        i += 2;
        while (i < inner.length && inner[i] !== '\n') i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < inner.length && !(inner[i] === '*' && inner[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') depth += 1;
      if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) break;
      i += 1;
    }

    entries.set(keyInfo.key, inner.slice(valueStart, i).trim());
    if (inner[i] === ',') i += 1;
  }

  return entries;
}

function extractStringArrayValues(text) {
  return [...text.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function extractRegistryMeta(body) {
  return {
    latestVersion: /latestVersion\s*:\s*['"]([^'"]+)['"]/.exec(body)?.[1],
    appVersionIntroduced: /appVersionIntroduced\s*:\s*['"]([^'"]+)['"]/.exec(body)?.[1],
    deprecated: /deprecated\s*:\s*true\b/.test(body),
  };
}

function diff(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

async function checkVersions() {
  const appText = await readText(FILES.appVersion);
  const packageJson = await readJson(FILES.packageJson);
  const packageLock = await readJson(FILES.packageLock);

  const appVersion = matchRequired(appText, /APP_VERSION\s*=\s*['"]([^'"]+)['"]/, 'APP_VERSION');
  const schemaVersion = Number(matchRequired(appText, /SCHEMA_VERSION\s*=\s*(\d+)/, 'SCHEMA_VERSION'));

  if (packageJson.version !== appVersion) {
    fail(`Version drift: APP_VERSION is ${appVersion}, package.json version is ${packageJson.version}.`);
  }
  if (packageLock.version !== appVersion) {
    fail(`Version drift: APP_VERSION is ${appVersion}, package-lock.json version is ${packageLock.version}.`);
  }
  if (packageLock.packages?.['']?.version !== appVersion) {
    fail(`Version drift: APP_VERSION is ${appVersion}, package-lock root package version is ${packageLock.packages?.['']?.version}.`);
  }

  return { appVersion, schemaVersion };
}

async function checkReleaseNotes(appVersion) {
  const notesText = await readText(FILES.releaseNotes);
  const escapedVersion = appVersion.replaceAll('.', '\\.');
  const hasRuntimeNotes = new RegExp(`['"]${escapedVersion}['"]\\s*:`).test(notesText);
  if (!hasRuntimeNotes) {
    fail(`Missing runtime release notes for APP_VERSION ${appVersion} in js/data/releaseNotes.js.`);
  }

  const releaseFiles = await fs.readdir(FILES.releasesDir);
  const hasMarkdown = releaseFiles.some((name) => name.endsWith(`-v${appVersion}.md`));
  if (!hasMarkdown) {
    fail(`Missing archival release note docs/releases/YYYY-MM-DD-v${appVersion}.md.`);
  }
}

async function checkSchema(schemaVersion) {
  const migrationsText = await readText(FILES.migrations);
  const routesText = await readText(FILES.routesProjects);
  const migrationSchema = Number(matchRequired(migrationsText, /SCHEMA_VERSION\s*=\s*(\d+)/, 'migration SCHEMA_VERSION'));

  if (migrationSchema !== schemaVersion) {
    fail(`Schema drift: appVersion SCHEMA_VERSION is ${schemaVersion}, projectMigrations SCHEMA_VERSION is ${migrationSchema}.`);
  }

  const routeSchemaMatches = [...routesText.matchAll(/schemaVersion\s*:\s*(\d+|SCHEMA_VERSION)/g)];
  if (!routeSchemaMatches.length) {
    fail('Could not find schemaVersion in routes/projects.js create-project route.');
  }
  for (const match of routeSchemaMatches) {
    if (match[1] !== 'SCHEMA_VERSION' && Number(match[1]) !== schemaVersion) {
      fail(`Stale project creation schemaVersion in routes/projects.js: ${match[1]} (current ${schemaVersion}).`);
    }
  }

  if (!/shared\s*:\s*\{\s*image\s*:\s*\{\s*\}\s*,\s*video\s*:\s*\{\s*\}/s.test(routesText)) {
    fail('routes/projects.js create-project route does not initialize shared.image/shared.video for schema v2 projects.');
  }
}

async function checkOperations() {
  const commandText = await readText(FILES.commandRegistry);
  const operationText = await readText(FILES.operationRegistry);
  const universalText = await readText(FILES.universalWorkflows);
  const modelsText = await readText(FILES.models);
  const mirror = await readJson(FILES.operationRegistryJson);
  delete mirror._comment;

  const commandEntries = parseTopLevelObjectEntries(findObjectLiteral(commandText, /const\s+commands\s*=/, 'commands'));
  const registryEntries = parseTopLevelObjectEntries(findObjectLiteral(operationText, /OPERATION_REGISTRY\s*=/, 'OPERATION_REGISTRY'));
  const universalEntries = parseTopLevelObjectEntries(findObjectLiteral(universalText, /UNIVERSAL_WORKFLOWS\s*=/, 'UNIVERSAL_WORKFLOWS'));

  const activeCommands = [...commandEntries.entries()]
    .filter(([, body]) => !/stub\s*:\s*true\b/.test(body))
    .map(([key]) => key)
    .sort();
  const registryOps = [...registryEntries.keys()].sort();
  const deprecatedOps = [...registryEntries.entries()]
    .filter(([, body]) => /deprecated\s*:\s*true\b/.test(body))
    .map(([key]) => key);
  const activeRegistryOps = registryOps.filter((key) => !deprecatedOps.includes(key));
  const mirrorOps = Object.keys(mirror).sort();
  const universalOps = [...universalEntries.keys()].sort();
  const modelSupportedOps = [...modelsText.matchAll(/supportedOps\s*:\s*\[([\s\S]*?)\]/g)]
    .flatMap((match) => extractStringArrayValues(match[1]))
    .sort();

  for (const key of diff(activeCommands, activeRegistryOps)) fail(`Operation registry missing active command: ${key}.`);
  for (const key of diff(modelSupportedOps, activeCommands)) fail(`Model supportedOps references command missing from commandRegistry.js: ${key}.`);
  for (const key of diff(modelSupportedOps, registryOps)) fail(`Model supportedOps references operation missing from operationRegistry.js: ${key}.`);
  for (const key of diff(universalOps, activeCommands)) fail(`Universal workflow missing commandRegistry entry: ${key}.`);
  for (const key of diff(universalOps, registryOps)) fail(`Universal workflow missing operationRegistry entry: ${key}.`);
  for (const key of diff(registryOps, mirrorOps)) fail(`operation_registry.json missing registry entry: ${key}.`);
  for (const key of diff(mirrorOps, registryOps)) fail(`operation_registry.json has extra entry not in operationRegistry.js: ${key}.`);

  for (const [key, body] of registryEntries) {
    const meta = extractRegistryMeta(body);
    const mirrored = mirror[key];
    if (!mirrored) continue;
    if (mirrored.latestVersion !== meta.latestVersion) {
      fail(`operation_registry.json latestVersion mismatch for ${key}: ${mirrored.latestVersion} != ${meta.latestVersion}.`);
    }
    if (mirrored.appVersionIntroduced !== meta.appVersionIntroduced) {
      fail(`operation_registry.json appVersionIntroduced mismatch for ${key}: ${mirrored.appVersionIntroduced} != ${meta.appVersionIntroduced}.`);
    }
    if (Boolean(mirrored.deprecated) !== Boolean(meta.deprecated)) {
      fail(`operation_registry.json deprecated flag mismatch for ${key}.`);
    }
  }

  for (const key of universalOps) {
    if (mirror[key]?.universal !== true) {
      fail(`operation_registry.json entry ${key} must include universal: true.`);
    }
  }
}

async function checkPreReleaseEngineSource() {
  const preReleaseText = await readText(FILES.preReleaseTest);
  const deps = await readJson(FILES.systemDependencies);
  if (!deps.engine?.version) {
    fail('dev_configs/system_dependencies.json is missing engine.version.');
  }
  if (!preReleaseText.includes('system_dependencies.json')) {
    fail('scripts/pre_release_test.py must read ComfyUI version from dev_configs/system_dependencies.json.');
  }
  if (/COMFY_VERSION\s*=\s*['"]/.test(preReleaseText)) {
    fail('scripts/pre_release_test.py still searches appVersion.js for COMFY_VERSION.');
  }
}

async function main() {
  try {
    const { appVersion, schemaVersion } = await checkVersions();
    await checkReleaseNotes(appVersion);
    await checkSchema(schemaVersion);
    await checkOperations();
    await checkPreReleaseEngineSource();
  } catch (err) {
    fail(err.message);
  }

  if (failures.length) {
    console.error('Release health check failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exit(1);
  }

  console.log('Release health check passed.');
}

main();
