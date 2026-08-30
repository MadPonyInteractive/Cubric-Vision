'use strict';

/**
 * A Flow's saved file must be named after the Flow (MPI-660).
 *
 * Output media is filed as `<prefix>_NNN.<ext>` and the prefix defaults to the OP KEY.
 * That key is internal: the Flow titled "Text to Speech" runs on `flowChatterBox`, so
 * its gallery card read `flowChatterBox_001` under a chip saying FLOW: TEXT TO SPEECH —
 * a name that appears nowhere in the Library. `CommandDef.filePrefix` overrides it.
 *
 * This pins the invariant, not the current table: every Flow's effective prefix must
 * read as its own title, either spelled out (`flowDrawItIn` ← "Draw It In") or as its
 * initials (`flowTTS` ← "Text to Speech"). A new Flow wired to an oddly-named op fails
 * here instead of shipping a card named after something the user cannot find.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const read = p => require('node:fs').readFileSync(path.join(__dirname, '..', p), 'utf8');
const esm = p => import('file://' + path.join(__dirname, '..', p).replace(/\\/g, '/'));

// The one op a Flow borrows rather than owns: `ltxVideoUpscale` is ALSO the
// `ltx-video-upscaler` plugin under the Upscale tool, where the run is not a Flow at
// all — so it keeps its own key and a Flow-shaped prefix would lie on that path.
const BORROWED_OPS = new Set(['ltxVideoUpscale']);

const compact   = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const initials  = s => s.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toLowerCase();
const deFlow    = s => compact(s).replace(/^flow/, '');

test('every Flow files its output under its own name', async () => {
  const { FLOWS }     = await esm('js/data/flowsRegistry.js');
  const { getCommand } = await esm('js/data/commandRegistry.js');

  const offenders = [];
  for (const flow of FLOWS) {
    if (BORROWED_OPS.has(flow.operation)) continue;
    const cmd    = getCommand(flow.operation);
    assert.ok(cmd, `Flow "${flow.title}" dispatches ${flow.operation}, which is not a command`);
    const prefix = deFlow(cmd.filePrefix || flow.operation);
    if (prefix !== compact(flow.title) && prefix !== initials(flow.title)) {
      offenders.push(`${flow.title} → ${cmd.filePrefix || flow.operation}_001`);
    }
  }

  assert.deepEqual(offenders, [], 'set CommandDef.filePrefix so the file reads as the Flow');
});

// The three hops that carry the override are wiring, and none of them can run headless
// (the save needs a live ComfyUI output to download). Dropped anywhere along the way the
// prefix silently falls back to the op key — the exact bug this fixes, back again.
test('filePrefix survives the trip from the registry to the sequence allocator', () => {
  const gen = read('js/services/generationService.js');
  assert.match(gen, /filePrefix: getCommand\(operation\)\?\.filePrefix \?\? null/,
    'generationService must read the override off the command it is running');

  const svc = read('js/services/projectService.js');
  const call = svc.slice(svc.indexOf('export async function saveGeneration'));
  const body = call.slice(0, call.indexOf('});'));
  assert.ok((body.match(/filePrefix/g) || []).length >= 2,
    'saveGeneration must both accept filePrefix and put it in the POST body');

  const routes = read('routes/projects.js');
  assert.match(routes, /const prefix = String\(filePrefix \|\| operation\)/,
    'the server must prefer filePrefix and fall back to the op key');
  // `operation` is stamped in every sidecar and versioned in operationRegistry.js.
  // Renaming it instead of the filename would orphan Reuse on every existing card.
  assert.match(routes, /operation = 'generated', filePrefix = null/,
    'filePrefix must be a separate field, not a replacement for operation');
});
