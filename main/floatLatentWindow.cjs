/**
 * floatLatentWindow.cjs — MPI-270
 *
 * A small always-on-top OS window that shows live latent previews while the app
 * is minimized. Pure consumer of the MPI-269 preview:frame bus, forwarded from
 * the main renderer over IPC (a separate BrowserWindow has its own empty Events
 * bus, and blob: URLs don't cross documents — the renderer sends data URLs).
 *
 * The window aggregates one tile per active generation (local + remote side by
 * side). Width tracks the tile count (right edge pinned so it grows leftward).
 * Position, height, and last width are remembered across sessions; the first
 * ever open defaults to the bottom-right corner.
 */

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, screen } = require('electron');

const TILE_W = 200;
const WIN_H = 200;
const MARGIN = 16; // gap from the screen edge on first open
const BOUNDS_FILE = path.join(app.getPath('userData'), 'float-latent-bounds.json');

let win = null;
/** Engine lanes currently shown ('local'/'remote'), in insertion order — drives
 *  width. One tile per lane: a sequential queue on one engine reuses its single
 *  lane tile item-to-item, so the window never churns. @type {string[]} */
let tiles = [];
/** last user-chosen bounds {x,y,width,height} or null. */
let savedBounds = loadBounds();

function loadBounds() {
  try {
    if (fs.existsSync(BOUNDS_FILE)) return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'));
  } catch { /* ignore corrupt/missing */ }
  return null;
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try {
    savedBounds = win.getBounds();
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(savedBounds));
  } catch { /* best-effort */ }
}

function targetWidth() {
  return Math.max(1, tiles.length) * TILE_W;
}

/** Create (once) and show the window. Uses remembered bounds, else bottom-right. */
function ensureWindow(mainWindow) {
  if (win && !win.isDestroyed()) return win;
  const need = targetWidth();

  let x, y, width, height;
  if (savedBounds) {
    height = savedBounds.height;
    width = Math.max(savedBounds.width, need); // always wide enough for the tiles
    // keep the remembered right edge; grow leftward if tiles need more width
    const right = savedBounds.x + savedBounds.width;
    x = right - width;
    y = savedBounds.y;
  } else {
    const display = mainWindow
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay();
    const wa = display.workArea; // excludes taskbar
    width = need;
    height = WIN_H;
    x = wa.x + wa.width - width - MARGIN;
    y = wa.y + wa.height - height - MARGIN;
  }

  win = new BrowserWindow({
    width, height, x, y,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: TILE_W,
    minHeight: 120,
    show: false,
    backgroundColor: '#6d5a63', // mauve, ≈ --surface-1 oklch(0.46 0.022 350)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'float-latent.html'));
  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show();
  });
  // Remember where the user drags/sizes it.
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);
  win.on('closed', () => { win = null; tiles = []; });
  return win;
}

/** Resize to the tile count, keeping the right edge fixed (grow leftward).
 *  A user who has widened the window well past what the tiles need (e.g.
 *  maximized on another screen) is left alone — tiles just flex to fill it.
 *
 *  Debounced to the next tick: over a queue, item N's completion (removeTile)
 *  and item N+1's start (addTile) land in the same turn. Resizing eagerly on
 *  each would flash a 2-tile-wide window before shrinking back. Coalescing to
 *  one resize reads the settled tile count, so the window width never churns. */
let _resizePending = false;
function applyWidth() {
  if (_resizePending) return;
  _resizePending = true;
  setImmediate(() => {
    _resizePending = false;
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    const need = targetWidth();
    const userWidened = b.width > need + TILE_W / 2; // slack beyond a tile → user's choice
    if (userWidened) return;
    if (b.width !== need) {
      const right = b.x + b.width; // keep the right edge fixed
      win.setBounds({ x: right - need, y: b.y, width: need, height: b.height });
    }
  });
}

/** Claim a lane's tile for a gen. If the lane already has a tile (queue advancing
 *  on the same engine), reuse it in place — reset to waiting, new title, no new
 *  tile, no resize. A new lane grows the window by one tile. */
function addTile(mainWindow, lane, genId, title) {
  ensureWindow(mainWindow);
  if (!tiles.includes(lane)) {
    tiles.push(lane);
    applyWidth();
  }
  win.webContents.send('float-latent:add-tile', { lane, genId, title });
}

/** Freeze a lane's tile on its result mid-queue (no Done badge). The next queued
 *  item reuses the same tile. No resize — the slot is held for the successor.
 *  genId guards ownership (renderer ignores it if the lane already advanced). */
function spendTile(lane, genId, dataUrl) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('float-latent:spend', { lane, genId, dataUrl });
}

/** Paint a frame into a lane's tile. */
function frame(lane, genId, dataUrl, seq) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('float-latent:frame', { lane, genId, dataUrl, seq });
}

/** Lane's final gen done → freeze on its result + Done cue. Tile stays until the
 *  user acts (click/X/restore). */
function finalize(lane, genId, dataUrl) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('float-latent:finalize', { lane, genId, dataUrl });
}

/** Remove a lane's tile. Closes the window when the last tile is gone. genId
 *  guards ownership — a stale remove for an already-advanced lane is a no-op. */
function removeTile(lane, genId) {
  tiles = tiles.filter((l) => l !== lane);
  if (!win || win.isDestroyed()) return;
  if (tiles.length === 0) { close(); return; }
  win.webContents.send('float-latent:remove-tile', { lane, genId });
  applyWidth(); // coalesced resize; right edge pinned
}

function isOpen() {
  return Boolean(win && !win.isDestroyed());
}

function close() {
  if (win && !win.isDestroyed()) win.close();
  win = null;
  tiles = [];
}

module.exports = { addTile, frame, finalize, spendTile, removeTile, close, isOpen };
