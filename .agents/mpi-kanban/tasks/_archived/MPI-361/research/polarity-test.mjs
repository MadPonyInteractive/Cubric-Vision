// Discriminating test for MPI-361's negative-point polarity.
//
// RUN FROM THE REPO ROOT (it imports `sharp` from node_modules) with the local
// engine up on 127.0.0.1:8188 and mpi361_probe.png in its input dir:
//   cp .agents/mpi-kanban/tasks/MPI-361/research/polarity-test.mjs ./tmp.mjs && node ./tmp.mjs && rm tmp.mjs
//
// Result 2026-07-28: two positives 94,835 px (9.00%, the whole person) vs
// positive+negative 15,553 px (1.48%, the shorts alone) — 6.10x. PASS.
//
// MaskManager synthesizes r=8 for a positive dot and r=4 for a negative one,
// betting that SAMDetectorCombined(mask_hint_use_negative='Small') reads bbox
// width < 10px as negative. Same TWO LOCATIONS both times, only the second dot's
// radius differs. If the bet is wrong the two runs return the same mask.
import fs from 'node:fs/promises';
import http from 'node:http';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';

const S = 'C:/Users/Fabio/AppData/Local/Temp/claude/c--AI-Mpi-Cubric-Vision/eaebdf1b-c455-4502-9e8b-0722e0d951cb/scratchpad';
const WF = 'c:/AI/Mpi/Cubric-Vision/comfy_workflows/img_auto_mask.json';
const PROBE = 'C:/AI/Mpi/Cubric-Vision/engine/ComfyUI_windows_portable/ComfyUI/input/mpi361_probe.png';
const W = 928, H = 1136;
const SHORTS = { x: 458, y: 572 };   // the denim shorts (the bench's proven dot)
const CALF   = { x: 470, y: 900 };   // lower leg, well outside the shorts

function req(method, path, body) {
  return new Promise((res, rej) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: '127.0.0.1', port: 8188, path, method,
      headers: { connection: 'close', ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) } },
      (s) => { let b = ''; s.setEncoding('utf8'); s.on('data', c => b += c); s.on('end', () => res({ status: s.statusCode, body: b })); });
    r.on('error', rej); if (data) r.write(data); r.end();
  });
}

async function dotsPng(dots, out) {
  const circles = dots.map(d => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="white"/>`).join('');
  const svg = `<svg width="${W}" height="${H}"><rect width="100%" height="100%" fill="black"/>${circles}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}

async function run(label, dotsPath) {
  const wf = JSON.parse(await fs.readFile(WF, 'utf8'));
  wf['1630'].inputs.string = PROBE;
  wf['1650'].inputs.string = dotsPath;
  wf['1657'].inputs.boolean = true;
  wf['1593'].inputs.picks = '1';
  const q = await req('POST', '/prompt', { prompt: wf, client_id: randomUUID() });
  if (q.status !== 200) throw new Error(`${label} queue ${q.status}: ${q.body.slice(0, 800)}`);
  const pid = JSON.parse(q.body).prompt_id;
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const hist = JSON.parse((await req('GET', `/history/${pid}`)).body || '{}')[pid];
    if (!hist?.status?.status_str) continue;
    if (hist.status.status_str === 'error') throw new Error(`${label} execution error`);
    const img = hist.outputs?.['1559']?.images?.[0];
    if (!img) throw new Error(`${label}: no Output_image`);
    const file = `${S}/pol_${label}.png`;
    await new Promise((res, rej) => {
      const ws = require('node:fs').createWriteStream(file);
      http.get(`http://127.0.0.1:8188/view?filename=${img.filename}&type=temp`, { headers: { connection: 'close' } },
        r => { r.pipe(ws); ws.on('finish', () => { ws.close(); res(); }); }).on('error', rej);
    });
    const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
    let white = 0;
    for (let p = 0; p < data.length; p++) if (data[p] > 127) white++;
    return { white, pct: 100 * white / (info.width * info.height) };
  }
  throw new Error(`${label}: timeout`);
}

const { createRequire } = await import('node:module');
globalThis.require = createRequire(import.meta.url);

const twoPositive = await dotsPng([{ ...SHORTS, r: 8 }, { ...CALF, r: 8 }], `${S}/dots_pp.png`);
const posPlusNeg  = await dotsPng([{ ...SHORTS, r: 8 }, { ...CALF, r: 4 }], `${S}/dots_pn.png`);

const a = await run('two-positive', twoPositive);
const b = await run('pos-plus-neg', posPlusNeg);

console.log(`shorts(r8) + calf(r8)  -> ${a.white} px  ${a.pct.toFixed(2)}%`);
console.log(`shorts(r8) + calf(r4)  -> ${b.white} px  ${b.pct.toFixed(2)}%`);

const ratio = a.white / Math.max(1, b.white);
console.log(`\nratio ${ratio.toFixed(2)}x`);
if (Math.abs(a.white - b.white) < a.white * 0.10) {
  console.log('FAIL: radius made no difference -> the 10px negative cliff is NOT where we think it is.');
  process.exit(1);
}
console.log('PASS: dot radius flips polarity. r=8 positive / r=4 negative straddles the cliff.');
