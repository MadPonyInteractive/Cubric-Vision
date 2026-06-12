/**
 * main/secretsStore.js — main-process secret storage for the RunPod remote engine.
 *
 * Stores the user's RunPod API key and the per-Pod Cubric wrapper token, encrypted,
 * under <APP_USER_DATA>/runpod-secrets.json. Runs in the MAIN Electron process only
 * (safeStorage is main-only). The renderer never reads a raw secret back — it can set,
 * test, and clear via IPC. The forked Express server gets the decrypted key on demand
 * through a process-message bridge (registerForkBridge).
 *
 * Encryption:
 *   - Electron safeStorage (OS keychain) when available.
 *   - Otherwise (no keyring, e.g. headless Linux) a derived-key AES-256-GCM fallback,
 *     plus a weakEncryption flag so the UI warns the user once at save time. Never
 *     plaintext, never Electron's "basic_text" backend. (MPI-64 secret-storage.md,
 *     Option B — do not lock the user out of remote mode.)
 *
 * No Cubric auth backend, no cloud sync. Secrets never touch project files, localStorage,
 * logs, or bug reports.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let _app = null;
let _safeStorage = null;
let _logger = null;

// In-memory marker so we only warn once per process about weak encryption.
const FILE_NAME = 'runpod-secrets.json';

function _userDataDir() {
  // APP_USER_DATA is set by main.js; fall back to Electron app path.
  return process.env.APP_USER_DATA || (_app && _app.getPath('userData')) || os.tmpdir();
}

function _filePath() {
  return path.join(_userDataDir(), FILE_NAME);
}

function _log(level, msg) {
  // Never pass secret values here. Messages are static strings only.
  if (_logger && typeof _logger[level] === 'function') _logger[level]('runpod', msg);
}

// --- file I/O ---------------------------------------------------------------

function _read() {
  try {
    return JSON.parse(fs.readFileSync(_filePath(), 'utf8'));
  } catch {
    return { v: 1 };
  }
}

function _write(obj) {
  const tmp = _filePath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, _filePath());
}

// --- encryption -------------------------------------------------------------

function _encryptionAvailable() {
  try {
    return !!(_safeStorage && _safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

// Derived-key fallback (no OS keyring). Key derived from a per-install random salt
// (stored alongside, but the derivation also mixes machine identifiers) — strictly
// better than plaintext, weaker than OS keychain (inputs live on the same machine),
// which is exactly why the user is warned.
function _fallbackKey(salt) {
  const material = `${os.hostname()}|${os.userInfo().username}|cubric-runpod`;
  return crypto.scryptSync(material, salt, 32);
}

function _encrypt(plain) {
  if (_encryptionAvailable()) {
    return { enc: 'safe', blob: _safeStorage.encryptString(plain).toString('base64') };
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = _fallbackKey(salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: 'aesgcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    blob: ct.toString('base64'),
  };
}

function _decrypt(field) {
  if (!field || !field.blob) return null;
  if (field.enc === 'safe') {
    if (!_encryptionAvailable()) return null;
    return _safeStorage.decryptString(Buffer.from(field.blob, 'base64'));
  }
  if (field.enc === 'aesgcm') {
    const salt = Buffer.from(field.salt, 'base64');
    const iv = Buffer.from(field.iv, 'base64');
    const tag = Buffer.from(field.tag, 'base64');
    const key = _fallbackKey(salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(field.blob, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
  return null;
}

// --- public API (used by IPC handlers + fork bridge) ------------------------

function setApiKey(plainKey) {
  if (!plainKey || typeof plainKey !== 'string') {
    return { ok: false, reason: 'empty' };
  }
  const weak = !_encryptionAvailable();
  const data = _read();
  data.runpodApiKey = _encrypt(plainKey);
  _write(data);
  _log('info', 'RunPod API key stored');
  return { ok: true, weakEncryption: weak };
}

function hasApiKey() {
  return !!(_read().runpodApiKey);
}

function getApiKey() {
  return _decrypt(_read().runpodApiKey);
}

function clearApiKey() {
  const data = _read();
  delete data.runpodApiKey;
  _write(data);
  _log('info', 'RunPod API key cleared');
  return { ok: true };
}

function setWrapperToken(token, podId) {
  const data = _read();
  data.wrapperToken = _encrypt(token);
  data.wrapperTokenPodId = podId || null;
  _write(data);
  return { ok: true };
}

function getWrapperToken(podId) {
  const data = _read();
  if (podId && data.wrapperTokenPodId && data.wrapperTokenPodId !== podId) {
    return null; // stale token for a different Pod
  }
  return _decrypt(data.wrapperToken);
}

function clearWrapperToken() {
  const data = _read();
  delete data.wrapperToken;
  delete data.wrapperTokenPodId;
  _write(data);
  return { ok: true };
}

function encryptionStatus() {
  return { available: _encryptionAvailable(), platform: process.platform };
}

// --- wiring -----------------------------------------------------------------

/**
 * init({ app, safeStorage, ipcMain, logger }) — call once from main.js after the
 * Electron app is ready. Registers the renderer-facing IPC handlers.
 */
function init({ app, safeStorage, ipcMain, logger }) {
  _app = app;
  _safeStorage = safeStorage;
  _logger = logger || null;

  if (ipcMain) {
    ipcMain.handle('secrets:set-api-key', (_e, { key } = {}) => setApiKey(key));
    ipcMain.handle('secrets:has-api-key', () => ({ has: hasApiKey() }));
    ipcMain.handle('secrets:clear-api-key', () => clearApiKey());
    ipcMain.handle('secrets:encryption-status', () => encryptionStatus());
    // Wrapper token is write-only from the renderer (keyed to a podId). There is
    // deliberately no renderer get channel — the forked server resolves it via
    // the fork bridge. Used by Phase 4 in-app Pod-create and the manual store path.
    ipcMain.handle('secrets:set-wrapper-token', (_e, { token, podId } = {}) => {
      if (!token || typeof token !== 'string') return { ok: false, reason: 'empty' };
      try { return setWrapperToken(token, podId); } catch { return { ok: false, reason: 'error' }; }
    });
    ipcMain.handle('secrets:clear-wrapper-token', () => {
      try { return clearWrapperToken(); } catch { return { ok: false }; }
    });
  }
}

/**
 * registerForkBridge(serverProcess) — lets the forked Express server request the
 * decrypted API key without ever holding safeStorage. The raw value crosses the
 * fork channel only on demand and is not persisted by the child.
 */
function registerForkBridge(serverProcess) {
  if (!serverProcess || typeof serverProcess.on !== 'function') return;
  serverProcess.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'secrets:get-api-key-request') {
      let value = null;
      try { value = getApiKey(); } catch { value = null; }
      serverProcess.send({ type: 'secrets:get-api-key-response', id: msg.id, value });
    } else if (msg.type === 'secrets:get-wrapper-token-request') {
      let value = null;
      try { value = getWrapperToken(msg.podId); } catch { value = null; }
      serverProcess.send({ type: 'secrets:get-wrapper-token-response', id: msg.id, value });
    } else if (msg.type === 'secrets:set-wrapper-token-request') {
      try { setWrapperToken(msg.token, msg.podId); } catch { /* logged elsewhere */ }
      serverProcess.send({ type: 'secrets:set-wrapper-token-response', id: msg.id, ok: true });
    } else if (msg.type === 'secrets:clear-wrapper-token-request') {
      try { clearWrapperToken(); } catch { /* noop */ }
      serverProcess.send({ type: 'secrets:clear-wrapper-token-response', id: msg.id, ok: true });
    }
  });
}

module.exports = {
  init,
  registerForkBridge,
  // direct API (main-process callers / tests)
  setApiKey,
  hasApiKey,
  getApiKey,
  clearApiKey,
  setWrapperToken,
  getWrapperToken,
  clearWrapperToken,
  encryptionStatus,
};
