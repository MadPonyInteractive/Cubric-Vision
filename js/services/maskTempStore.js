/**
 * maskTempStore.js — Frontend wrapper for mask-temp:* IPC handlers.
 *
 * Persists per-(project, group, item) manual + subtract mask layers in a
 * session-scoped Electron TEMP folder. Cleared on app quit, stale dirs
 * pruned at boot. See main.js mask-temp:* handlers and
 * docs/plans/2026-04-29-layered-mask-persistence.md.
 *
 * Browser fallback: writes/delete are no-ops, reads return null fields.
 * A single warn is logged on first call so the dev knows persistence is off.
 *
 * No caching. Errors are logged via clientLogger and surfaced as
 * { ok: false } (writes/delete) or null fields (read).
 */

'use strict';

import { clientLogger } from './clientLogger.js';

let ipcRenderer = null;

try {
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    const electron = window.require('electron');
    ipcRenderer = electron.ipcRenderer;
  }
} catch (e) {
  // Browser mode — ipcRenderer stays null.
}

let _browserWarned = false;
function _warnBrowserOnce() {
  if (_browserWarned) return;
  _browserWarned = true;
  clientLogger.warn('mask-temp', 'Electron IPC unavailable — mask persistence disabled (browser dev mode).');
}

const NULL_READ = { manual: null, subtract: null };

export const maskTempStore = {
  async read(projectId, groupId, itemId) {
    if (!ipcRenderer) {
      _warnBrowserOnce();
      return { ...NULL_READ };
    }
    try {
      const resp = await ipcRenderer.invoke('mask-temp:read', projectId, groupId, itemId);
      if (!resp || resp.ok !== true) {
        if (resp && resp.error) clientLogger.warn('mask-temp', `read failed: ${resp.error}`);
        return { ...NULL_READ };
      }
      return {
        manual:   resp.manual   ?? null,
        subtract: resp.subtract ?? null,
      };
    } catch (err) {
      clientLogger.error('mask-temp', 'read invoke threw', err);
      return { ...NULL_READ };
    }
  },

  async writeManual(projectId, groupId, itemId, dataURL) {
    if (!ipcRenderer) { _warnBrowserOnce(); return { ok: false, error: 'no-ipc' }; }
    try {
      const resp = await ipcRenderer.invoke('mask-temp:write-manual', projectId, groupId, itemId, dataURL);
      if (!resp || resp.ok !== true) {
        clientLogger.warn('mask-temp', `writeManual failed: ${resp && resp.error}`);
        return { ok: false, error: (resp && resp.error) || 'unknown' };
      }
      return { ok: true };
    } catch (err) {
      clientLogger.error('mask-temp', 'writeManual invoke threw', err);
      return { ok: false, error: err.message };
    }
  },

  async writeSubtract(projectId, groupId, itemId, dataURL) {
    if (!ipcRenderer) { _warnBrowserOnce(); return { ok: false, error: 'no-ipc' }; }
    try {
      const resp = await ipcRenderer.invoke('mask-temp:write-subtract', projectId, groupId, itemId, dataURL);
      if (!resp || resp.ok !== true) {
        clientLogger.warn('mask-temp', `writeSubtract failed: ${resp && resp.error}`);
        return { ok: false, error: (resp && resp.error) || 'unknown' };
      }
      return { ok: true };
    } catch (err) {
      clientLogger.error('mask-temp', 'writeSubtract invoke threw', err);
      return { ok: false, error: err.message };
    }
  },

  async delete(projectId, groupId, itemId) {
    if (!ipcRenderer) { _warnBrowserOnce(); return { ok: false, error: 'no-ipc' }; }
    try {
      const resp = await ipcRenderer.invoke('mask-temp:delete', projectId, groupId, itemId);
      if (!resp || resp.ok !== true) {
        clientLogger.warn('mask-temp', `delete failed: ${resp && resp.error}`);
        return { ok: false, error: (resp && resp.error) || 'unknown' };
      }
      return { ok: true };
    } catch (err) {
      clientLogger.error('mask-temp', 'delete invoke threw', err);
      return { ok: false, error: err.message };
    }
  },
};
