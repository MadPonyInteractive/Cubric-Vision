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
import { generationStore } from '../services/generationStore.js';
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

// The float window has two FIXED lanes: 'local' and 'remote', one tile each,
// and a gen's lane = its engine and NEVER changes. Frames route by their own
// engine tag (see preview:frame). started/complete/cancel carry no engine tag,
// so resolve from the store job by genId (store.genId === the activeGenerations
// id, set at dispatch — an exact match) and cache it. `generation:started`
// seeds the cache while the store job is live, so a later `complete` still
// resolves after the job is gone.
const _laneOf = new Map(); // genId -> 'local' | 'remote'

/** Lane for a gen with no engine tag (started/complete/cancel) — store lookup. */
function laneFor(genId) {
  if (_laneOf.has(genId)) return _laneOf.get(genId);
  const job = generationStore.list().find((j) => j.genId === genId);
  const lane = job?.lane === 'remote' ? 'remote' : 'local';
  _laneOf.set(genId, lane);
  return lane;
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
    const last = activeGenerations.getLastPreview(entry.id);
    // Seed the cache from the engine-tagged held latent when we have it (exact),
    // else fall back to the store lookup.
    const lane = last?.engine ? (last.engine === 'remote' ? 'remote' : 'local') : laneFor(entry.id);
    _laneOf.set(entry.id, lane);
    ipcRenderer.send('float-latent:add-tile', { lane, genId: entry.id, title: titleFor(entry) });
    if (last?.url) {
      const dataUrl = await blobUrlToDataUrl(last.url);
      if (dataUrl) ipcRenderer.send('float-latent:frame', { lane, dataUrl, seq: last.seq });
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
  Events.on('preview:frame', async ({ engine, seq, url }) => {
    if (!windowOpen) return;
    // Route STRICTLY by the engine tag → lane. The engine tag is the ONLY reliable
    // lane source: the two engines have independent promptId spaces (byPromptId can
    // collide) AND the store job isn't registered yet at generation:started time
    // (an await gap), so neither a promptId lookup nor a started-time store lookup
    // can be trusted. The lane IS the engine. The frame also OWNS tile creation and
    // labelling: the store is populated by the time frames flow, so we resolve this
    // lane's active gen (title + ownership) from it here — correct by construction.
    const lane = engine === 'remote' ? 'remote' : 'local';
    const genId = generationStore.activeGenId(lane);
    if (genId) _laneOf.set(genId, lane); // seed for complete/cancel (no engine tag there)
    const now = Date.now();
    if (_encoding.has(lane)) return;
    if (now - (_lastSent.get(lane) || 0) < FRAME_MIN_MS) return;
    _encoding.add(lane);
    let dataUrl = null;
    try { dataUrl = await blobUrlToDataUrl(url); } finally { _encoding.delete(lane); }
    if (!dataUrl || !windowOpen) return; // window may have closed mid-encode
    _lastSent.set(lane, Date.now());
    const title = genId ? titleFor(activeGenerations.get(genId) || {}) : '';
    // add-tile is idempotent: creates the lane tile (with title/owner) if absent,
    // or relabels+takes ownership if the queue advanced on this lane.
    ipcRenderer.send('float-latent:add-tile', { lane, genId, title });
    ipcRenderer.send('float-latent:frame', { lane, genId, dataUrl, seq });
  });

  // NOTE: no add-tile on generation:started. The lane can't be resolved reliably
  // there (store job not yet registered), so the first preview:frame — which
  // carries the authoritative engine tag — creates and labels the tile instead.

  // A gen COMPLETED → keep its tile, freeze it on the final result so the user can
  // click it to open the app (the whole window restores on click). The window stays
  // open until the user acts (click/X) or un-minimizes. Image results paint the
  // returned file; video results keep the last live latent (a video data-URL is too
  // heavy for a thumbnail tile).
  // eslint-disable-next-line mpi/require-destroy-on-events
  Events.on('generation:complete', async ({ id, item }) => {
    const lane = laneFor(id);
    _lastSent.delete(lane); // throttle/encode maps are lane-keyed (see preview:frame)
    _encoding.delete(lane);
    _laneOf.delete(id);
    if (!windowOpen) return;
    // PER-LANE completion: the mascot "Done" cue fires when THIS lane's batch is
    // empty — independent of the other lane. Local finishing while remote runs must
    // still show Done on the local tile (not wait for remote). Exclude this gen so
    // the check is order-proof w.r.t. the store releasing its lane. More work on
    // THIS lane → spend (freeze, no badge) so the next queued item reuses the tile.
    const moreWork = generationStore.laneDepth(lane, id) > 0;
    const isVideo = item?.type === 'video' || item?.mediaType === 'video';
    let dataUrl = null;
    if (item?.filePath && !isVideo) {
      dataUrl = await blobUrlToDataUrl(resolveMediaUrl(item.filePath));
    }
    if (!windowOpen) return; // may have closed mid-encode
    // Guard by genId: a sequential queue promotes the next item BEFORE this one's
    // complete fires, so the lane tile may already belong to the successor. The
    // renderer ignores spend/finalize whose genId no longer owns the tile — else a
    // late item-N spend would freeze over item-(N+1)'s live frames.
    const channel = moreWork ? 'float-latent:spend' : 'float-latent:finalize';
    ipcRenderer.send(channel, { lane, genId: id, dataUrl });
  });

  // A gen was CANCELLED or ERRORED → drop its lane's tile. Main closes the window
  // when the last tile goes.
  const drop = ({ id }) => {
    const lane = laneFor(id);
    _lastSent.delete(lane);
    _encoding.delete(lane);
    _laneOf.delete(id);
    if (windowOpen) ipcRenderer.send('float-latent:tile-remove', { lane, genId: id });
  };
  /* eslint-disable mpi/require-destroy-on-events */
  Events.on('generation:cancelled', drop);
  Events.on('generation:error', drop);
  /* eslint-enable mpi/require-destroy-on-events */

  clientLogger?.debug?.('system', 'floatLatentBridge initialized');
}
