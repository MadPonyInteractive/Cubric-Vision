/**
 * floatLatentBridge.js — MPI-270
 *
 * Renderer half of the OS floating latent window. This document owns the
 * MPI-269 preview:frame bus; the float window is a separate BrowserWindow with
 * its own empty Events bus, so we forward frames to it over IPC. blob: URLs are
 * per-document and won't resolve there — we convert to a data URL first.
 *
 * Show gate: app minimized AND state.floatLatentWindow AND ≥1 running gen. Main
 * process owns minimize detection and the window lifecycle; this bridge answers
 * main's "should I show?" query and streams tiles/frames while it's open.
 *
 * Desktop-only: in browser dev mode there is no ipcRenderer, so every path
 * no-ops cleanly.
 */

import { Events } from '../events.js';
import { state } from '../state.js';
import { activeGenerations } from '../services/activeGenerations.js';
import { getModelById } from '../data/modelRegistry.js';
import { resolveMediaUrl } from '../utils/mediaActions.js';
import { clientLogger } from '../services/clientLogger.js';

let ipcRenderer = null;
try {
  if (typeof window.require === 'function') {
    ipcRenderer = window.require('electron').ipcRenderer;
  }
} catch { /* browser mode */ }

/** True while the float window is open (main told us to show). */
let windowOpen = false;

// Frame throttle — latent previews don't need every frame. Coalesce to at most
// one in-flight encode per gen and ~8fps, so a fast multi-gen run can't flood the
// IPC channel with base64 data URLs (that was eating RAM). ponytail: per-gen
// last-send timestamp + a single pending frame; newest wins.
const FRAME_MIN_MS = 120;
const _lastSent = new Map();   // genId -> ms of last forwarded frame
const _encoding = new Set();   // genId currently mid-encode (drop newer until done)

function titleFor(entry) {
  return getModelById(entry.modelId)?.name || entry.modelId || 'Generating';
}

function runningGens() {
  return activeGenerations.list().filter((e) => e.status === 'running');
}

/** blob: URL → data URL (per-document blobs don't cross the IPC boundary). */
async function blobUrlToDataUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  const blob = await fetch(url).then((r) => r.blob());
  return await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
}

/** Open the window with a tile per running gen, seeded from the last held latent. */
async function openTiles() {
  for (const entry of runningGens()) {
    ipcRenderer.send('float-latent:add-tile', { genId: entry.id, title: titleFor(entry) });
    const last = activeGenerations.getLastPreview(entry.id);
    if (last?.url) {
      const dataUrl = await blobUrlToDataUrl(last.url);
      if (dataUrl) ipcRenderer.send('float-latent:frame', { genId: entry.id, dataUrl, seq: last.seq });
    }
  }
}

export function initFloatLatentBridge() {
  if (!ipcRenderer) return; // browser dev — no OS window

  // Main asks whether to show (on minimize). Reply, and if yes, seed tiles.
  ipcRenderer.on('float-latent:query-show', async () => {
    const on = state.floatLatentWindow === true;
    const gens = runningGens();
    const show = on && gens.length > 0;
    ipcRenderer.send('float-latent:show-state', { show });
    if (show) {
      windowOpen = true;
      await openTiles();
    }
  });

  // Main closed the window (restore/focus/dismiss/last-tile). Stop forwarding.
  ipcRenderer.on('float-latent:closed', () => {
    windowOpen = false;
    _lastSent.clear();
    _encoding.clear();
  });

  // App-lifetime listeners (boot-once singleton, never torn down) — same pattern
  // as activeGenerations.js's bus listener. No cleanup array needed.
  // Live frames — forward only while the window is open.
  // eslint-disable-next-line mpi/require-destroy-on-events
  Events.on('preview:frame', async ({ promptId, seq, url }) => {
    if (!windowOpen) return;
    const entry = activeGenerations.byPromptId(promptId);
    if (!entry) return;
    const genId = entry.id;
    // Throttle: skip if we forwarded one for this gen too recently, or if a
    // prior frame is still encoding (newest-wins, never queue). The float window
    // still holds the last good latent via its own last-painted frame.
    const now = Date.now();
    if (_encoding.has(genId)) return;
    if (now - (_lastSent.get(genId) || 0) < FRAME_MIN_MS) return;
    _encoding.add(genId);
    let dataUrl = null;
    try { dataUrl = await blobUrlToDataUrl(url); } finally { _encoding.delete(genId); }
    if (!dataUrl || !windowOpen) return; // window may have closed mid-encode
    _lastSent.set(genId, Date.now());
    ipcRenderer.send('float-latent:frame', { genId, dataUrl, seq });
  });

  // A gen started while the window is open → add its tile.
  // eslint-disable-next-line mpi/require-destroy-on-events
  Events.on('generation:started', ({ id }) => {
    if (!windowOpen) return;
    const entry = activeGenerations.get(id);
    if (entry) ipcRenderer.send('float-latent:add-tile', { genId: id, title: titleFor(entry) });
  });

  // A gen COMPLETED → keep its tile, freeze it on the final result so the user can
  // click it to open the app (the whole window restores on click). The window stays
  // open until the user acts (click/X) or un-minimizes. Image results paint the
  // returned file; video results keep the last live latent (a video data-URL is too
  // heavy for a thumbnail tile).
  // eslint-disable-next-line mpi/require-destroy-on-events
  Events.on('generation:complete', async ({ id, item }) => {
    _lastSent.delete(id);
    _encoding.delete(id);
    if (!windowOpen) return;
    const isVideo = item?.type === 'video' || item?.mediaType === 'video';
    let dataUrl = null;
    if (item?.filePath && !isVideo) {
      dataUrl = await blobUrlToDataUrl(resolveMediaUrl(item.filePath));
    }
    if (!windowOpen) return; // may have closed mid-encode
    ipcRenderer.send('float-latent:finalize', { genId: id, dataUrl });
  });

  // A gen was CANCELLED or ERRORED → nothing to keep, drop the tile. Main closes
  // the window when the last tile goes.
  const drop = ({ id }) => {
    _lastSent.delete(id);
    _encoding.delete(id);
    if (windowOpen) ipcRenderer.send('float-latent:tile-remove', { genId: id });
  };
  /* eslint-disable mpi/require-destroy-on-events */
  Events.on('generation:cancelled', drop);
  Events.on('generation:error', drop);
  /* eslint-enable mpi/require-destroy-on-events */

  clientLogger?.debug?.('system', 'floatLatentBridge initialized');
}
