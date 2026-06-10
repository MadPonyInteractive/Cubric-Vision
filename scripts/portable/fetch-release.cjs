#!/usr/bin/env node

'use strict';

// Online-updater download step, run via electron-as-node (ELECTRON_RUN_AS_NODE=1)
// by the portable update launchers (update.sh / update.command / update.bat).
//
// WHY THIS EXISTS: the launchers must NOT depend on tools the host OS might not
// ship. The original shell launchers called `curl` to hit the GitHub API and
// download the asset; on a minimal Linux box `curl` was absent ("curl: not
// found", exit 127) and the update silently failed. We cannot make that
// assumption — especially for macOS, which we cannot test. The ONE thing a
// portable install is guaranteed to have is its own bundled Electron binary
// (it IS the app). Electron is a full Node runtime, so we do all network work
// here with Node's built-in `https` module: no curl, no wget, no system node,
// no jq. The launcher's only job is to locate the Electron binary and run this.
//
// Usage:
//   electron fetch-release.cjs --repo <owner/name> --pattern <asset-regex> --out-dir <dir>
// Prints the absolute path of the downloaded asset on stdout (last line).

const fs = require('fs');
const path = require('path');
const https = require('https');

function parseArgs(argv) {
  const opts = { repo: '', pattern: '', outDir: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    else if (arg === '--repo') opts.repo = argv[++i];
    else if (arg.startsWith('--repo=')) opts.repo = arg.slice('--repo='.length);
    else if (arg === '--pattern') opts.pattern = argv[++i];
    else if (arg.startsWith('--pattern=')) opts.pattern = arg.slice('--pattern='.length);
    else if (arg === '--out-dir') opts.outDir = argv[++i];
    else if (arg.startsWith('--out-dir=')) opts.outDir = arg.slice('--out-dir='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.repo) throw new Error('Missing --repo <owner/name>');
  if (!opts.pattern) throw new Error('Missing --pattern <asset-name-regex>');
  if (!opts.outDir) throw new Error('Missing --out-dir <dir>');
  return opts;
}

const UA = 'CubricVision-Updater';

// GET a URL, following redirects (GitHub asset URLs 302 to a CDN). Resolves
// with { status, headers, body } for non-redirect responses. `binary` controls
// whether the body is collected as a Buffer (asset) or string (JSON).
function httpGet(url, { binary = false, redirectsLeft = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' } }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume(); // drain
        if (redirectsLeft <= 0) { reject(new Error('Too many redirects')); return; }
        const next = new URL(headers.location, url).toString();
        resolve(httpGet(next, { binary, redirectsLeft: redirectsLeft - 1 }));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: statusCode, headers, body: binary ? buf : buf.toString('utf8') });
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(new Error('Request timed out')); });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rx = new RegExp(opts.pattern);

  // 1. Latest published, non-prerelease release. /releases/latest 404s when the
  //    repo is private (no auth here) or only drafts/prereleases exist.
  const apiUrl = `https://api.github.com/repos/${opts.repo}/releases/latest`;
  const rel = await httpGet(apiUrl);
  if (rel.status === 404) {
    throw new Error(
      `no published release found for ${opts.repo}. If the repository is private it is not visible without authentication; ` +
      'make sure it is public. Drafts and prereleases are also ignored by the "latest" endpoint.'
    );
  }
  if (rel.status !== 200) {
    throw new Error(`GitHub API returned HTTP ${rel.status} for ${apiUrl}`);
  }

  let data;
  try { data = JSON.parse(rel.body); }
  catch (e) { throw new Error(`could not parse the release API response: ${e.message}`); }

  const asset = (data.assets || []).find((a) => rx.test(a.name));
  if (!asset) {
    throw new Error(`no update asset matching ${opts.pattern} in release ${data.tag_name || '(latest)'}.`);
  }

  // 2. Download the asset to out-dir.
  fs.mkdirSync(opts.outDir, { recursive: true });
  const target = path.join(opts.outDir, asset.name);
  process.stderr.write(`Downloading ${asset.name}...\n`);
  const dl = await httpGet(asset.browser_download_url, { binary: true });
  if (dl.status !== 200) {
    throw new Error(`download of ${asset.name} failed (HTTP ${dl.status}).`);
  }
  fs.writeFileSync(target, dl.body);

  // The launcher reads the downloaded path from stdout (last line).
  process.stdout.write(`${target}\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch-release error: ${err.message}\n`);
  process.exit(1);
});
