#!/usr/bin/env node
/**
 * sync-raw-workflows.mjs — one-shot: convert LiteGraph workflow exports dropped in
 * comfy_workflows/raw/ into API format, run the template generator, and commit.
 *
 * For each raw/*.json changed since its last conversion (mtime):
 *   - "<name>_template.json"  -> API at comfy_workflows/scripts/workflow_generation/<name>.json
 *                                (a generator source; orchestrate.py bakes runtime files after)
 *   - "<name>.json"           -> API at comfy_workflows/<name>.json (runtime, used directly)
 *
 * If any template was (re)written, runs orchestrate.py to regenerate runtime files.
 * Then commits exactly the workflow files this run touched (by pathspec, never git add -A).
 *
 * Usage:
 *   node scripts/sync-raw-workflows.mjs            # convert changed, generate, commit
 *   node scripts/sync-raw-workflows.mjs --all      # reconvert every raw file
 *   node scripts/sync-raw-workflows.mjs --no-commit # do the work, leave it for review
 *
 * Requires a running ComfyUI (widget names via /object_info) — same as workflow-to-api.mjs.
 * COMFY_URL overrides the default http://127.0.0.1:8188.
 */

import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const RAW_DIR = path.join(REPO_ROOT, 'comfy_workflows', 'raw');
const WORKFLOWS_DIR = path.join(REPO_ROOT, 'comfy_workflows');
const GEN_DIR = path.join(WORKFLOWS_DIR, 'scripts', 'workflow_generation');
const CONVERTER = path.join(SCRIPT_DIR, 'workflow-to-api.mjs');

const argv = process.argv.slice(2);
const FORCE = argv.includes('--all');
const NO_COMMIT = argv.includes('--no-commit');

const isTemplate = (name) => /_template\.json$/i.test(name);
const outPathFor = (name) =>
  isTemplate(name) ? path.join(GEN_DIR, name) : path.join(WORKFLOWS_DIR, name);

function mtime(p) {
  try { return statSync(p).mtimeMs; } catch { return -Infinity; }
}

/** git output paths relative to repo root, forward-slashed (git wants those). */
function rel(p) { return path.relative(REPO_ROOT, p).split(path.sep).join('/'); }

async function main() {
  if (!existsSync(RAW_DIR)) {
    console.log(`No raw dir: ${RAW_DIR} — nothing to do.`);
    return;
  }

  // Guard: orchestrate.py does a GLOBAL template rebuild, which overwrites any
  // uncommitted runtime files. Refuse to run on a dirty workflow tree so we never
  // clobber in-progress work. raw/ is untracked scratch — ignore it.
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'comfy_workflows'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((l) => !l.slice(3).trim().startsWith('comfy_workflows/raw/'));
  if (dirty.length) {
    console.error(
      `Refusing: comfy_workflows has ${dirty.length} uncommitted change(s). ` +
      `orchestrate.py rebuilds ALL templates and would overwrite them.\n` +
      `Commit or stash your workflow changes first, then re-run.\n` +
      dirty.map((l) => '  ' + l).join('\n')
    );
    process.exit(1);
  }
  const files = (await fs.readdir(RAW_DIR)).filter((f) => f.endsWith('.json'));
  if (!files.length) { console.log('raw/ is empty.'); return; }

  const touched = [];        // API output paths written this run
  let anyTemplate = false;

  for (const f of files) {
    const src = path.join(RAW_DIR, f);
    const out = outPathFor(f);
    if (!FORCE && mtime(out) >= mtime(src)) {
      console.log(`skip  ${f} (output up to date)`);
      continue;
    }
    // Convert via the existing single-file converter (stdout -> file).
    let api;
    try {
      api = execFileSync('node', [CONVERTER, src], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      console.error(`FAIL  ${f}: ${(e.stderr || e.message).toString().trim()}`);
      process.exitCode = 1;
      continue;
    }
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, api);
    touched.push(out);
    anyTemplate ||= isTemplate(f);
    console.log(`OK    ${f} -> ${rel(out)}`);
  }

  if (!touched.length) { console.log('\nNothing changed.'); return; }

  // Templates are only generator SOURCES — bake runtime files before committing.
  if (anyTemplate) {
    console.log('\nRunning orchestrate.py (template -> runtime files)...');
    execFileSync('python', ['orchestrate.py'], { cwd: GEN_DIR, stdio: 'inherit' });
  }

  if (NO_COMMIT) {
    console.log('\n--no-commit: leaving changes for review.');
    return;
  }

  // Commit exactly the workflow dirs' changes (converted sources + generated runtime).
  // Scope to the two workflow dirs — never the whole tree (shared repo).
  const commitPaths = execFileSync(
    'git', ['status', '--porcelain', '--', 'comfy_workflows'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim())
    .filter((p) => !p.startsWith('comfy_workflows/raw/'));  // raw/ stays untracked scratch

  if (!commitPaths.length) { console.log('\nNo committable workflow changes.'); return; }

  const names = [...new Set(commitPaths.map((p) => path.basename(p)))].join(', ');
  const msg = `chore(workflows): sync ${touched.length} raw workflow(s) to API format\n\n${commitPaths.join('\n')}`;
  // --only <paths>: commit exactly these files regardless of what else is staged
  // (shared tree — never sweep a peer's staged work). -n skips lint-staged.
  execFileSync('git', ['commit', '-n', '-m', msg, '--only', '--', ...commitPaths], { cwd: REPO_ROOT, stdio: 'inherit' });
  console.log(`\nCommitted: ${names}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
