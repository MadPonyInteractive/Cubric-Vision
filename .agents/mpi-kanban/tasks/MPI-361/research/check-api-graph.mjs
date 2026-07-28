// Validate an API-format ComfyUI prompt: no dangling links, no missing required inputs.
import fs from 'node:fs/promises';
import http from 'node:http';

const file = process.argv[2];
const wf = JSON.parse(await fs.readFile(file, 'utf8'));

const objInfo = await new Promise((res, rej) => {
  http.get('http://127.0.0.1:8188/object_info', { headers: { connection: 'close' } }, (r) => {
    let b = ''; r.setEncoding('utf8'); r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});

let dangling = 0, missing = 0;
for (const [id, node] of Object.entries(wf)) {
  const def = objInfo[node.class_type];
  if (!def) { console.log(`UNKNOWN CLASS  node ${id}  ${node.class_type}`); missing++; continue; }
  for (const [k, v] of Object.entries(node.inputs || {})) {
    if (Array.isArray(v) && v.length === 2 && typeof v[1] === 'number') {
      if (!wf[String(v[0])]) { console.log(`DANGLING  node ${id} (${node.class_type}).${k} -> ${v[0]}`); dangling++; }
    }
  }
  for (const k of Object.keys(def.input?.required || {})) {
    if (!(k in (node.inputs || {}))) { console.log(`MISSING REQUIRED  node ${id} (${node.class_type}).${k}`); missing++; }
  }
}
console.log(`\n${file}: ${Object.keys(wf).length} nodes, ${dangling} dangling, ${missing} missing-required`);
process.exit(dangling + missing ? 1 : 0);
