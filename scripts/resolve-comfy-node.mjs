#!/usr/bin/env node
/**
 * resolve-comfy-node.mjs — given a ComfyUI class_type that isn't in the live
 * engine's /object_info, find which custom-node pack ships it.
 *
 * When workflow-to-api.mjs throws `Unknown node type "X"`, that means X is not
 * installed (or was renamed). This tool answers "so where do I get X?" by
 * reverse-looking-up the class name in ComfyUI-Manager's extension-node-map.json
 * (repo_url -> [ [class_types...], {title_aux} ]) — the same index the Manager
 * uses. Optionally enriches with Comfy Registry install data (pip deps, downloadUrl).
 *
 * Usage:
 *   node scripts/resolve-comfy-node.mjs MpiLoadImageFromPath
 *   node scripts/resolve-comfy-node.mjs MpiString VHS_VideoCombine   # multiple
 *   node scripts/resolve-comfy-node.mjs --registry MpiString         # + Registry deps
 *   node scripts/resolve-comfy-node.mjs --refresh MpiString          # bypass cache
 *   node scripts/resolve-comfy-node.mjs --missing path/to/workflow.json  # every unknown in a raw export
 *
 * The node-map is cached under scratch (24h) so repeat lookups are offline-fast.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import https from 'node:https';

const NODE_MAP_URL =
  'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/extension-node-map.json';
const REGISTRY = 'https://api.comfy.org';
const CACHE_FILE = path.join(os.tmpdir(), 'comfy-extension-node-map.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// stdlib https.get — same reasoning as workflow-to-api.mjs (avoid undici socket teardown crash).
function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { connection: 'close', 'user-agent': 'cubric-resolve-node' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getJson(res.headers.location));           // follow redirect
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url} -> HTTP ${res.statusCode}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function loadNodeMap({ refresh }) {
  if (!refresh && existsSync(CACHE_FILE)) {
    const age = Date.now() - (await fs.stat(CACHE_FILE)).mtimeMs;
    if (age < CACHE_TTL_MS) return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
  }
  const map = await getJson(NODE_MAP_URL);
  await fs.writeFile(CACHE_FILE, JSON.stringify(map)).catch(() => {});   // cache best-effort
  return map;
}

/** class_type -> [ { repo, title } ] reverse index. */
function buildIndex(map) {
  const idx = new Map();
  for (const [repo, entry] of Object.entries(map)) {
    const classes = entry?.[0] || [];
    const title = entry?.[1]?.title_aux || repo.split('/').pop();
    for (const cls of classes) {
      if (!idx.has(cls)) idx.set(cls, []);
      idx.get(cls).push({ repo, title });
    }
  }
  return idx;
}

/** Try Registry install data by pack id (Registry ids are usually the repo name, lowercased). */
async function registryInstall(title, repo) {
  const candidates = [title, repo.split('/').pop()]
    .map((s) => s.toLowerCase())
    .filter((v, i, a) => a.indexOf(v) === i);
  for (const id of candidates) {
    try {
      const v = await getJson(`${REGISTRY}/nodes/${encodeURIComponent(id)}/install`);
      return { id, deps: v.dependencies || [], downloadUrl: v.downloadUrl, version: v.version };
    } catch { /* not this id */ }
  }
  return null;
}

async function report(cls, idx, { registry }) {
  const hits = idx.get(cls);
  if (!hits || !hits.length) {
    console.log(`\n✗ ${cls}\n  Not in ComfyUI-Manager's node map. Likely a private/local pack (e.g. our MpiNodes) or a typo.`);
    return;
  }
  console.log(`\n✓ ${cls}  — shipped by ${hits.length} pack(s):`);
  for (const { repo, title } of hits) {
    console.log(`  • ${title}\n    ${repo}`);
    if (registry) {
      const reg = await registryInstall(title, repo);
      if (reg) {
        console.log(`    Registry id: ${reg.id}  (v${reg.version})`);
        if (reg.deps.length) console.log(`    pip deps: ${reg.deps.join(', ')}`);
        if (reg.downloadUrl) console.log(`    download: ${reg.downloadUrl}`);
      }
    }
  }
}

/** Pull class_types out of a LiteGraph export that aren't Mpi* private nodes. */
async function unknownsFrom(file) {
  const wf = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!wf.nodes) throw new Error(`${file} has no .nodes[] — not a LiteGraph export.`);
  return [...new Set(wf.nodes.map((n) => n.type).filter(Boolean))];
}

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes('--refresh');
  const registry = args.includes('--registry');
  const missingIdx = args.indexOf('--missing');

  let classes = args.filter((a) => !a.startsWith('--'));
  if (missingIdx !== -1) {
    const file = args[missingIdx + 1];
    if (!file) throw new Error('--missing needs a workflow .json path');
    classes = await unknownsFrom(file);
    console.log(`Checking ${classes.length} node type(s) from ${path.basename(file)}...`);
  }
  if (!classes.length) {
    console.error('Usage: node scripts/resolve-comfy-node.mjs <ClassType>... [--registry] [--refresh]');
    console.error('       node scripts/resolve-comfy-node.mjs --missing <workflow.json>');
    process.exit(2);
  }

  const idx = buildIndex(await loadNodeMap({ refresh }));
  for (const cls of classes) await report(cls, idx, { registry });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
