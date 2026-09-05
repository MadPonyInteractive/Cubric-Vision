// MPI-664 — the instrumental run, at GRAPH level, on the bench (8188).
//
// WHAT THIS PROVES: that with Instrumental ON, `Lyrics_Gate` routes `Input_Structure`
// through `Bare_Tags` and the encoder receives the user's section names WORDLESS, and
// that the resulting audio sings nothing. Both are properties of the shipped graph.
//
// WHAT IT DOES NOT PROVE: what a user gets. The announcer is a SEPARATE dispatch
// (`promptEnhance`) driven from `MpiBaseFlow._run`, which no agent path reaches -
// `resolveFlowFieldValues` rejects `Input_Mood`/`Input_Vocal`/`Input_Arrangement`
// because they are enhancer targets, not declared fields. They are supplied by hand
// below, and are the one part of this run that is not the real thing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = process.env.COMFY_URL || 'http://127.0.0.1:8188';
const REPO = 'C:/AI/Mpi/Cubric-Vision';
const HERE = path.dirname(fileURLToPath(import.meta.url));

// The section plan under test. Four sections, each with an unmistakable instrument, so
// "did they land in this order?" is answerable by ear rather than by opinion.
const STRUCTURE = [
  '[Intro] one single orchestral drum hit, then silence',
  '[Verse] solo viola carries the melody, nothing else',
  '[Chorus] the full string section joins the viola',
  '[Outro] a choir pad swells and fades out',
].join('\n');

const PARAMS = {
  73: { boolean: true },                       // Input_Instrumental  <- the test
  104: { string: STRUCTURE },                  // Input_Structure     <- the test
  101: { string: 'A short orchestral piece that builds from near-silence to a full string section and ends on a choir.' },
  68: { string: 'Cinematic orchestral.' },     // Input_Style
  69: { string: '' },                          // Input_Style_Custom
  70: { int: 96 },                             // Input_Bpm
  74: { float: 90 },                           // Input_Duration
  65: { int: Math.floor(Math.random() * 1e12) },
  // HAND-SUPPLIED, standing in for the announcer. Written to FOLLOW the structure
  // rather than rival it - the 2026-09-03 defect was an enhancer inventing its own
  // timed plan while the user's sat in the lyrics slot.
  45: { string: 'Solemn and spacious, opening almost empty and growing warmer and fuller as it goes, ending in something choral and resolved.' },
  100: { string: 'A single deep orchestral drum stroke alone at the start. Then a solo viola, dry and close, carrying the tune unaccompanied. The full string section enters underneath and around it. A wordless choir pad swells at the end and fades. No drum kit, no bass guitar, no synthesiser.' },
};

const wf = JSON.parse(fs.readFileSync(`${REPO}/comfy_workflows/flow_minimax_music.json`, 'utf8'));
for (const [id, patch] of Object.entries(PARAMS)) {
  if (!wf[id]) throw new Error(`node ${id} is not in the graph - it was renumbered, re-read it`);
  Object.assign(wf[id].inputs, patch);
}
wf['62'].inputs.filename_prefix = 'audio/mpi664_instrumental';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}: ${await r.text()}`);
  return r.json();
};

const { prompt_id } = await j(`${HOST}/prompt`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: wf }),
});
console.log(`queued ${prompt_id}`);

const t0 = Date.now();
let hist = null;
for (;;) {
  const h = await j(`${HOST}/history/${prompt_id}`);
  if (h[prompt_id]?.status?.completed !== undefined) { hist = h[prompt_id]; break; }
  if (Date.now() - t0 > 1800000) throw new Error('timed out after 30 min');
  if ((Date.now() - t0) % 30000 < 2000) process.stdout.write('.');
  await sleep(2000);
}
const wall = ((Date.now() - t0) / 1000).toFixed(1);
if (!hist.status.completed) {
  console.error(`FAILED after ${wall}s:`, JSON.stringify(hist.status.messages).slice(0, 3000));
  process.exit(1);
}
const files = Object.values(hist.outputs).flatMap((o) => o.audio || []);
console.log(`\ncompleted in ${wall}s -> ${files.map((f) => f.filename).join(', ')}`);

// Read back what the ENCODER actually received, from the engine's own record of the
// executed graph - not from what this script sent. Arriving is not the same as taking
// effect, and node 103 is the whole point of the run.
const sent = hist.prompt[2];
console.log('\n--- what reached the encoder ---');
console.log('Instrumental      :', sent['73'].inputs.boolean);
console.log('Lyrics_Gate picks :', JSON.stringify(sent['103'].inputs.true), '(105 = Bare_Tags)');
console.log('Input_Structure   :', JSON.stringify(sent['104'].inputs.string));
fs.writeFileSync(path.join(HERE, 'instrumental_run.result.json'),
  JSON.stringify({ prompt_id, wall, files, structure: STRUCTURE }, null, 2));
