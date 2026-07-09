#!/usr/bin/env node

/**
 * scripts/release-notes-approval.mjs — Release-notes reveal/approval gate.
 *
 * Hard rule: the portable build refuses to run until the user has REVEALED and
 * APPROVED the exact release notes that will ship in the in-app changelog
 * overlay (MpiChangelogDialog). Approval is recorded as a token sidecar
 * (docs/releases/.approved-<version>.json) holding a SHA256 of the rendered
 * notes payload. If the notes change after approval, the hash no longer matches
 * and the build blocks again until re-approved.
 *
 * This mechanism works headless (CI reads the committed token) AND locally (the
 * `release:approve` CLI prints the rendered notes, asks y/n, and writes the
 * token on yes). build-portable.mjs calls assertApproved() before staging.
 *
 * CLI usage:
 *   node scripts/release-notes-approval.mjs approve [--version X.Y.Z] [--yes]
 *   node scripts/release-notes-approval.mjs show    [--version X.Y.Z]
 *   node scripts/release-notes-approval.mjs check   [--version X.Y.Z]
 *
 * --yes    : skip the interactive prompt (write the token non-interactively).
 * --version: override the version (defaults to package.json version).
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const RELEASE_NOTES_FILE = path.join(REPO_ROOT, 'js', 'data', 'releaseNotes.js');
const PACKAGE_JSON_FILE = path.join(REPO_ROOT, 'package.json');
const RELEASES_DIR = path.join(REPO_ROOT, 'docs', 'releases');

// Mirror of MpiChangelogDialog.SECTIONS — order + titles MUST match the overlay
// so the approved preview is byte-for-byte what users see.
const SECTIONS = [
  { key: 'breakingChanges', title: 'Breaking changes' },
  { key: 'importantChanges', title: 'Important' },
  { key: 'whatIsNew', title: "What's new" },
  { key: 'fixes', title: 'Fixes' },
  { key: 'engineNotes', title: 'Engine' },
];

// ── Stage derivation (mirror of js/core/appStage.js deriveStage) ─────────────
function deriveStage(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim());
  if (!m) return 'alpha';
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (major < 1) return 'alpha';
  if (minor === 0 && patch === 0) return 'release';
  if (patch === 0) return 'beta';
  return 'alpha';
}

function stageLabel(version) {
  const s = deriveStage(version);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── releaseNotes.js parsing (brace-balanced, comment/string aware) ───────────
function skipString(text, index) {
  const quote = text[index];
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/**
 * Extract the object-literal text for RELEASE_NOTES['<version>'] by brace
 * matching. Returns the literal text (including braces) or null when the
 * version key is absent.
 */
function findVersionObjectLiteral(text, version) {
  const escaped = version.replaceAll('.', '\\.');
  const keyRe = new RegExp(`['"]${escaped}['"]\\s*:`);
  const keyMatch = keyRe.exec(text);
  if (!keyMatch) return null;

  const start = text.indexOf('{', keyMatch.index);
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(text, i) - 1; continue; }
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
  return null;
}

/** Pull a `key: [ ... ]` string array out of an object literal. */
function extractStringArray(objectText, key) {
  const re = new RegExp(`${key}\\s*:\\s*\\[`);
  const m = re.exec(objectText);
  if (!m) return [];
  const start = objectText.indexOf('[', m.index);
  let depth = 0;
  let end = -1;
  for (let i = start; i < objectText.length; i += 1) {
    const ch = objectText[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(objectText, i) - 1; continue; }
    if (ch === '[') depth += 1;
    if (ch === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  const inner = objectText.slice(start, end + 1);
  // Match top-level quoted strings (single, double, or backtick).
  return [...inner.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)].map((mm) => mm[2]);
}

/**
 * Read js/data/releaseNotes.js and return the structured notes payload for a
 * version, or null when the version has no entry.
 */
export async function extractNotesForVersion(version) {
  const text = await fs.readFile(RELEASE_NOTES_FILE, 'utf8');
  const literal = findVersionObjectLiteral(text, version);
  if (!literal) return null;
  return {
    version,
    breakingChanges: extractStringArray(literal, 'breakingChanges'),
    importantChanges: extractStringArray(literal, 'importantChanges'),
    whatIsNew: extractStringArray(literal, 'whatIsNew'),
    fixes: extractStringArray(literal, 'fixes'),
    engineNotes: extractStringArray(literal, 'engineNotes'),
  };
}

/**
 * Stable SHA256 over the rendered notes payload. Built from the canonical
 * section order + raw item strings so it changes iff what ships changes.
 */
export function computeApprovalHash(payload) {
  const canonical = SECTIONS.map(({ key }) => [key, payload[key] || []]);
  const serialized = JSON.stringify({ version: payload.version, sections: canonical });
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/** Render the notes exactly as the overlay shows them (plain text, fixed order). */
export function renderNotes(payload) {
  const lines = [];
  lines.push('=== Release notes preview — what users will see ===');
  lines.push('');
  lines.push(`${stageLabel(payload.version)} · v${payload.version}`);

  let anyShown = false;
  for (const { key, title } of SECTIONS) {
    const items = payload[key] || [];
    if (items.length === 0) continue;
    anyShown = true;
    lines.push('');
    lines.push(title);
    for (const item of items) lines.push(`  • ${item}`);
  }
  if (!anyShown) {
    lines.push('');
    lines.push('(No non-empty sections — the overlay would be skipped entirely.)');
  }
  return lines.join('\n');
}

function tokenPath(version) {
  return path.join(RELEASES_DIR, `.approved-${version}.json`);
}

async function readToken(version) {
  try {
    const raw = await fs.readFile(tokenPath(version), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Throw unless an approval token exists for `version` AND its hash matches the
 * current release notes. Called by build-portable.mjs before any staging.
 */
export async function assertApproved(version) {
  const payload = await extractNotesForVersion(version);
  if (!payload) {
    throw new Error(
      `No release notes found for v${version} in js/data/releaseNotes.js. `
      + 'Add the RELEASE_NOTES entry (via /mpi-version-bump), then run `npm run release:approve`.',
    );
  }
  const expected = computeApprovalHash(payload);
  const token = await readToken(version);
  if (!token) {
    throw new Error(
      `Release notes for v${version} have not been approved. `
      + 'Run `npm run release:approve` to review and approve the user-facing notes before building.',
    );
  }
  if (token.hash !== expected) {
    throw new Error(
      `Release notes for v${version} changed after approval (hash mismatch). `
      + 'Re-run `npm run release:approve` to review and re-approve the updated notes before building.',
    );
  }
}

async function writeToken(version, hash) {
  // Timestamp via env (CI) or a plain marker; Date is intentionally avoided in
  // some harness contexts, so accept an override and fall back to a build-system
  // ISO string when available.
  const approvedAt = process.env.CUBRIC_APPROVAL_TIMESTAMP || new Date().toISOString();
  const body = `${JSON.stringify({ version, hash, approvedAt }, null, 2)}\n`;
  await fs.mkdir(RELEASES_DIR, { recursive: true });
  await fs.writeFile(tokenPath(version), body, 'utf8');
}

function parseCliArgs(argv) {
  const opts = { command: argv[0] || 'show', version: null, yes: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--version') opts.version = argv[++i];
    else if (arg.startsWith('--version=')) opts.version = arg.slice('--version='.length);
  }
  return opts;
}

async function resolveVersion(explicit) {
  if (explicit) return explicit;
  const pkg = JSON.parse(await fs.readFile(PACKAGE_JSON_FILE, 'utf8'));
  return pkg.version;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const version = await resolveVersion(opts.version);
  const payload = await extractNotesForVersion(version);

  if (!payload) {
    console.error(`No release notes found for v${version} in js/data/releaseNotes.js.`);
    process.exitCode = 1;
    return;
  }

  if (opts.command === 'show') {
    console.log(renderNotes(payload));
    return;
  }

  if (opts.command === 'check') {
    try {
      await assertApproved(version);
      console.log(`Release notes for v${version} are approved.`);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    }
    return;
  }

  if (opts.command === 'approve') {
    console.log(renderNotes(payload));
    console.log('');
    const hash = computeApprovalHash(payload);
    if (!opts.yes) {
      const answer = await ask('Approve these notes for the build? [y/N] ');
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Not approved. Edit js/data/releaseNotes.js and re-run `npm run release:approve`.');
        process.exitCode = 1;
        return;
      }
    }
    await writeToken(version, hash);
    console.log(`Approved. Wrote ${path.relative(REPO_ROOT, tokenPath(version))} (commit it with the version bump).`);
    return;
  }

  console.error(`Unknown command: ${opts.command}. Use approve | show | check.`);
  process.exitCode = 1;
}

// Only run the CLI when invoked directly (not when imported by build-portable).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
