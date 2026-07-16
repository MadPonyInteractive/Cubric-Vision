#!/usr/bin/env node
/**
 * sync-raw-workflows.mjs — convert the LiteGraph workflow sources the user edited in
 * comfy_workflows/raw/ into API format, validate them, and bake runtime files.
 *
 * "What changed" is GIT-DRIVEN (raw/*.json differing from HEAD — modified/staged/
 * untracked), not mtime: deterministic across checkouts and clones. --all forces all.
 *
 * For each changed raw/*.json:
 *   - "<name>_template.json"  -> API at comfy_workflows/scripts/workflow_generation/<name>.json
 *                                (a generator SOURCE; orchestrate.py bakes runtime files after)
 *   - "<name>.json"           -> API at comfy_workflows/<name>.json (runtime, used directly)
 *
 * Flow:
 *   1. git-diff raw/ vs HEAD → changed sources
 *   2. COMMIT the raw sources (raw only — the record of the user's edit)
 *   3. convert each changed raw → API
 *   4. GATE: validate-injection-rules.mjs on every converted API — ANY violation STOPS
 *      the run (raw is committed; nothing bad gets baked) and tells the user to fix in
 *      the ComfyUI graph and re-export
 *   5. orchestrate.py bakes runtime files from changed templates
 *   6. leave generated API + runtime STAGED (uncommitted) — /mpi-end commits them, so
 *      a session produces ONE generated-workflow commit, not one per sync
 *
 * Usage:
 *   node scripts/sync-raw-workflows.mjs          # sync git-changed raw
 *   node scripts/sync-raw-workflows.mjs --all    # reconvert every raw file
 *
 * Requires a running ComfyUI (widget names via /object_info) — same as workflow-to-api.mjs.
 * COMFY_URL overrides the default http://127.0.0.1:8188.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
const VALIDATOR = path.join(SCRIPT_DIR, 'validate-injection-rules.mjs');

const argv = process.argv.slice(2);
const FORCE = argv.includes('--all');   // reconvert every raw file, not just git-changed

const isTemplate = (name) => /_template\.json$/i.test(name);

// raw/ is the user's SOURCE OF TRUTH — the only editable LiteGraph copies. No
// script may ever write there; a mis-export the user has to re-do is unrecoverable.
// Assert every output lands OUTSIDE raw/, so a future routing bug can't clobber it.
function assertNotInRaw(outPath) {
  const inRaw = !path.relative(RAW_DIR, outPath).startsWith('..');
  if (inRaw) {
    throw new Error(`REFUSING to write inside raw/ (user-owned source): ${rel(outPath)}`);
  }
  return outPath;
}
const outPathFor = (name) =>
  assertNotInRaw(isTemplate(name) ? path.join(GEN_DIR, name) : path.join(WORKFLOWS_DIR, name));

/** git output paths relative to repo root, forward-slashed (git wants those). */
function rel(p) { return path.relative(REPO_ROOT, p).split(path.sep).join('/'); }

/** raw/*.json that differ from HEAD (modified, staged, or untracked). This is the
 *  git-driven "what changed" — deterministic across checkouts/clones, unlike mtime. */
function gitChangedRaw() {
  // -uall so untracked files are listed individually (default collapses a wholly-
  // untracked dir to a single "?? raw/" line). Model Merger.json is gitignored, so
  // it never appears here.
  const out = execFileSync('git', ['status', '--porcelain', '-uall', '--', 'comfy_workflows/raw'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean)
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))       // strip status + quotes
    .filter((p) => p.startsWith('comfy_workflows/raw/') && p.endsWith('.json'))
    .map((p) => path.basename(p));
}

async function main() {
  if (!existsSync(RAW_DIR)) {
    console.log(`No raw dir: ${RAW_DIR} — nothing to do.`);
    return;
  }

  // Guard: orchestrate.py does a GLOBAL template rebuild, which overwrites any
  // uncommitted GENERATED files (templates in GEN_DIR + runtime in comfy_workflows).
  // Refuse if any of those are dirty so we never clobber in-progress generated work.
  // raw/ changes are EXPECTED (that's our input) and are committed below, so ignore
  // raw/ here.
  const dirtyGenerated = execFileSync('git', ['status', '--porcelain', '--', 'comfy_workflows'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  })
    .split('\n').filter(Boolean)
    .filter((l) => !l.slice(3).trim().replace(/^"|"$/g, '').startsWith('comfy_workflows/raw/'));
  if (dirtyGenerated.length) {
    console.error(
      `Refusing: ${dirtyGenerated.length} uncommitted GENERATED workflow change(s). ` +
      `orchestrate.py rebuilds ALL templates and would overwrite them.\n` +
      `Commit or stash them first (or run /mpi-end), then re-run.\n` +
      dirtyGenerated.map((l) => '  ' + l).join('\n')
    );
    process.exit(1);
  }

  // 1. What changed — git-driven, not mtime. --all forces every raw file.
  let changed;
  if (FORCE) {
    const { readdirSync } = await import('node:fs');
    changed = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
  } else {
    changed = gitChangedRaw();
  }
  if (!changed.length) { console.log('No raw/ workflows changed vs HEAD — nothing to do.'); return; }
  console.log(`Changed raw workflow(s): ${changed.join(', ')}`);

  // 1b. GATE — filenames MUST be all-lowercase. The runtime file (and its GEN template)
  //     inherit this exact name; models.js `workflows` keys must match byte-for-byte, and
  //     the Pod FS is case-sensitive. A mixed-case name (Chroma_t2i.json) works on Windows
  //     but 404s on the Pod if a key is ever "corrected" to a different case (MPI-291).
  //     Stop BEFORE the raw commit so nothing mixed-case lands. NOTE: fixing this is a
  //     case-only rename, which collides in git's `add` on core.ignorecase=true — do it in
  //     two steps: `git mv X x.tmp && git mv x.tmp x`, or rename + `git add -A` the pair.
  const mixedCase = changed.filter((f) => f !== f.toLowerCase());
  if (mixedCase.length) {
    console.error(
      `\nSTOP: ${mixedCase.length} raw workflow filename(s) are NOT all-lowercase:\n` +
      mixedCase.map((f) => `  ${f}  ->  ${f.toLowerCase()}`).join('\n') +
      `\n\nWorkflow filenames must be lowercase (case-sensitive Pod FS; the runtime file + ` +
      `models.js key inherit this name). Rename in comfy_workflows/raw/ to the lowercase form ` +
      `above, then re-run. Nothing was committed.`
    );
    process.exit(1);
  }

  // 2. Commit the RAW sources FIRST — the record of the user's edit. Generated API +
  //    runtime are NOT committed here (too many commits); /mpi-end closes them.
  const rawPaths = changed.map((f) => `comfy_workflows/raw/${f}`);
  const rawMsg =
    `chore(workflows): raw source edit — ${changed.join(', ')}\n\n` +
    `LiteGraph source(s). Generated API templates + orchestrated runtime files land ` +
    `staged (uncommitted); /mpi-end commits them.`;
  execFileSync('git', ['add', '--', ...rawPaths], { cwd: REPO_ROOT, stdio: 'inherit' });
  execFileSync('git', ['commit', '-n', '-m', rawMsg, '--only', '--', ...rawPaths], { cwd: REPO_ROOT, stdio: 'inherit' });
  console.log(`Committed raw source(s): ${changed.join(', ')}`);

  // 3. Convert each changed raw -> API.
  const touched = [];
  let anyTemplate = false;
  for (const f of changed) {
    const src = path.join(RAW_DIR, f);
    const out = outPathFor(f);
    let api;
    try {
      api = execFileSync('node', [CONVERTER, src], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      console.error(`FAIL  convert ${f}: ${(e.stderr || e.message).toString().trim()}`);
      process.exit(1);
    }
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, api);
    touched.push(out);
    anyTemplate ||= isTemplate(f);
    console.log(`OK    ${f} -> ${rel(out)}`);
  }

  // 4. GATE — validate every converted API against the injection rules BEFORE baking.
  //    Any violation stops the run (raw is already committed; nothing bad gets baked).
  console.log('\nValidating injection rules...');
  try {
    execFileSync('node', [VALIDATOR, ...touched], { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch {
    console.error(
      `\nSTOP: converted workflow(s) violate the injection rules (see above). Fix the ` +
      `offending node(s) in the ComfyUI graph editor and re-export to raw/, then re-run. ` +
      `orchestrate.py was NOT run — no bad runtime was baked. The raw commit stands.`
    );
    process.exit(1);
  }

  // 5. Orchestrate — templates are generator SOURCES; bake their runtime files.
  if (anyTemplate) {
    console.log('\nRunning orchestrate.py (template -> runtime files)...');
    execFileSync('python', ['orchestrate.py'], { cwd: GEN_DIR, stdio: 'inherit' });
  }

  // 6. Leave generated API + runtime STAGED (uncommitted) for /mpi-end to commit.
  const generated = execFileSync('git', ['status', '--porcelain', '--', 'comfy_workflows'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  })
    .split('\n').filter(Boolean)
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
    .filter((p) => p.startsWith('comfy_workflows/') && !p.startsWith('comfy_workflows/raw/'));
  if (generated.length) {
    execFileSync('git', ['add', '--', ...generated], { cwd: REPO_ROOT, stdio: 'inherit' });
    console.log(`\nStaged ${generated.length} generated file(s) (API + runtime) — NOT committed. Run /mpi-end to close them.`);
  } else {
    console.log('\nNo generated changes (conversion produced identical output).');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
