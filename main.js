const { app, BrowserWindow, session, Menu, MenuItem, ipcMain, dialog, shell, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { fork } = require('child_process');
const logger = require('./routes/logger');
const { getComfyPath, getEngineRoot } = require('./routes/platformEngine');
const secretsStore = require('./main/secretsStore');
const floatLatent = require('./main/floatLatentWindow.cjs');

const APP_CONFIG = loadAppConfig();

// Mask layer TEMP store — session-scoped, cleared on quit, stale dirs pruned at boot.
const SESSION_ID = randomUUID();
const MASK_TEMP_ROOT = path.join(app.getPath('temp'), 'cubric-' + SESSION_ID);

function loadAppConfig() {
  // dev_mode is derived from the build hash, mirroring dev_configs/app_config.js
  // (main is CommonJS and cannot import that ESM module). Staged portable builds
  // stamp a real hash into js/core/buildInfo.js, so dev_mode is off for releases
  // and on only for source/dev runs (BUILD_HASH === 'dev'). Default off on error.
  const fallback = { dev_mode: false };
  try {
    const source = fs.readFileSync(path.join(__dirname, 'js', 'core', 'buildInfo.js'), 'utf8');
    const hashMatch = source.match(/BUILD_HASH\s*=\s*['"]([^'"]+)['"]/);
    const hash = hashMatch ? hashMatch[1] : 'dev';
    return { ...fallback, dev_mode: hash === 'dev' };
  } catch (err) {
    logger.warn('main', `Failed to read buildInfo.js; dev_mode=false (${err.message})`);
    return fallback;
  }
}

function pruneStaleMaskTemp() {
  try {
    const tmpRoot = app.getPath('temp');
    const entries = fs.readdirSync(tmpRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('cubric-')) continue;
      if (entry.name === 'cubric-' + SESSION_ID) continue;
      const stalePath = path.join(tmpRoot, entry.name);
      try {
        fs.rmSync(stalePath, { recursive: true, force: true });
        logger.info('mask-temp', `Pruned stale session dir: ${stalePath}`);
      } catch (err) {
        logger.warn('mask-temp', `Failed to prune ${stalePath}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.warn('mask-temp', `pruneStaleMaskTemp failed: ${err.message}`);
  }
}

function sanitizeMaskId(id) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Invalid id (empty or non-string)');
  }
  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new Error(`Invalid id (path traversal): ${id}`);
  }
  return id;
}

function resolveMaskItemDir(projectId, groupId, itemId) {
  const p = sanitizeMaskId(projectId);
  const g = sanitizeMaskId(groupId);
  const i = sanitizeMaskId(itemId);
  return path.join(MASK_TEMP_ROOT, p, g, i);
}

function dataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('dataURL must be string');
  const idx = dataUrl.indexOf('base64,');
  if (idx === -1) throw new Error('dataURL missing base64 payload');
  return Buffer.from(dataUrl.slice(idx + 7), 'base64');
}

function bufferToPngDataUrl(buf) {
  return 'data:image/png;base64,' + buf.toString('base64');
}

function atomicWritePng(filePath, dataUrl) {
  const buf = dataUrlToBuffer(dataUrl);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, filePath);
}

async function getActiveDownloadsForQuit() {
  if (!serverProcess || serverProcess.killed) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch('http://127.0.0.1:3000/comfy/downloads/active', {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    logger.warn('main', `Failed to query active downloads before quit: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Best-effort: tear down the active RunPod Pod on quit. The backend branches on
// the user's delete-on-quit pref (MPI-64 Step 4.3): default STOPs the Pod warm
// (EXITED bills no GPU, only volume + reserved container disk, boot warm-resumes
// it); with delete-on-quit checked it DELETEs the Pod (frees container disk too).
// The wrapper idle watchdog is the real backstop if this times out. The network
// volume is unaffected either way.
async function teardownRemotePod() {
  if (!serverProcess || serverProcess.killed) return;
  const controller = new AbortController();
  // Delete-on-quit lists then deletes every cubric-vision Pod, and a RunPod
  // delete REST call can take several seconds each — 8s aborted mid-delete and
  // left the Pod running (hit live). 30s gives the sweep room to finish before
  // the window closes and the server child dies.
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    logger.info('main', 'Remote Pod teardown on quit: requesting…');
    const res = await fetch('http://127.0.0.1:3000/remote/pod/teardown', {
      method: 'POST',
      signal: controller.signal,
    });
    const out = await res.json().catch(() => ({}));
    logger.info('main', `Remote Pod teardown result: action=${out.action || '?'} ok=${out.ok} reaped=${(out.reaped || []).join(',') || 'none'} podId=${out.podId || 'none'}`);
  } catch (err) {
    logger.warn('main', `Remote Pod teardown on quit failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function confirmQuitWithActiveDownloads() {
  if (process.env.CUBRIC_E2E) return true;
  const active = await getActiveDownloadsForQuit();
  const modelCount = Array.isArray(active?.models) ? active.models.length : 0;
  const hasEngineDownload = !!active?.engine;
  if (modelCount === 0 && !hasEngineDownload) return true;

  const details = [];
  if (modelCount > 0) {
    details.push(`${modelCount} model download${modelCount === 1 ? '' : 's'} will resume from the existing partial file on next launch.`);
  }
  if (hasEngineDownload) {
    details.push('The engine download will restart from scratch on next launch.');
  }

  const options = {
    type: 'warning',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Downloads are still running',
    message: 'Quit Cubric Vision while downloads are active?',
    detail: details.join('\n'),
  };
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);

  return result.response === 0;
}

function cleanSessionTempFolders() {
  const ENGINE_ROOT = getEngineRoot();
  const inputDir = getComfyPath(ENGINE_ROOT, 'input');
  const outputDir = getComfyPath(ENGINE_ROOT, 'output');
  for (const dir of [inputDir, outputDir]) {
    if (fs.existsSync(dir)) {
      // Empty the directory contents without removing the directory itself
      for (const entry of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      }
      logger.info('comfy', `Cleaned temp folder: ${dir}`);
    }
  }

  if (fs.existsSync(MASK_TEMP_ROOT)) {
    try {
      fs.rmSync(MASK_TEMP_ROOT, { recursive: true, force: true });
      logger.info('mask-temp', `Cleaned session dir: ${MASK_TEMP_ROOT}`);
    } catch (err) {
      logger.warn('mask-temp', `Failed to clean ${MASK_TEMP_ROOT}: ${err.message}`);
    }
  }
}

// Required on Windows to show the app icon (not Electron's) when launched via .bat.
// Use exe path as model ID — recommended for unpackaged Electron apps on Windows.
const WINDOWS_APP_USER_MODEL_ID = 'cubric.studio.vision';

if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
}

// Internal Electron name (app.getName(), menu, notification sender). Does NOT
// change the OS taskbar/dock name on its own — that comes from package.json
// `name`/`desktopName` (Linux WM_CLASS/Wayland app_id), the bundled Info.plist
// (macOS), and setAppUserModelId (Windows). Set it anyway so in-app references
// read "Cubric Vision" instead of "cubric-vision"/"Electron".
app.setName('Cubric Vision');

if (process.env.CUBRIC_E2E) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

if (process.env.CUBRIC_E2E_USER_DATA) {
  fs.mkdirSync(process.env.CUBRIC_E2E_USER_DATA, { recursive: true });
  app.setPath('userData', path.resolve(process.env.CUBRIC_E2E_USER_DATA));
} else if (process.env.CUBRIC_USER_DATA_ROOT) {
  fs.mkdirSync(process.env.CUBRIC_USER_DATA_ROOT, { recursive: true });
  app.setPath('userData', path.resolve(process.env.CUBRIC_USER_DATA_ROOT));
}

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const NOTIFICATION_ICON_PATH = path.join(__dirname, 'assets', 'mascot', 'happy.png');

let mainWindow;
let serverProcess;
let windowState = {};
const activeNotifications = new Set();
let quitDownloadWarningAccepted = false;
let quitDownloadWarningInProgress = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      windowState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load window state:', err);
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    // Always save x/y to remember monitor, but only save width/height if not maximized/fullscreen
    windowState.x = bounds.x;
    windowState.y = bounds.y;
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized() && !mainWindow.isFullScreen()) {
      windowState.width = bounds.width;
      windowState.height = bounds.height;
    }
    windowState.isMaximized = mainWindow.isMaximized();
    windowState.isFullScreen = mainWindow.isFullScreen();
    fs.writeFileSync(STATE_FILE, JSON.stringify(windowState));
  } catch (err) {
    // Window may be destroyed by the time the debounced save fires — ignore
  }
}

function createWindow() {
  // Spoof Origin for ComfyUI requests to satisfy its strict local CSRF check
  // This resolves the "request with non matching host and origin" 403 error.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://127.0.0.1/*', '*://localhost/*', 'ws://127.0.0.1/*', 'ws://localhost/*', 'wss://127.0.0.1/*', 'wss://localhost/*'] },
    (details, callback) => {
      if (details.url.includes(':8188')) {
        // Satisfy ComfyUI's CSRF check by matching Host and Origin
        details.requestHeaders['Origin'] = 'http://127.0.0.1:8188';
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://127.0.0.1/*', '*://localhost/*', 'ws://127.0.0.1/*', 'ws://localhost/*', 'wss://127.0.0.1/*', 'wss://localhost/*'] },
    (details, callback) => {
      if (details.url.includes(':8188')) {
        // Force CORS headers to satisfy the browser security model
        details.responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        details.responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS, PUT, DELETE'];
        details.responseHeaders['Access-Control-Allow-Headers'] = ['Content-Type, Authorization, X-Requested-With'];
      }
      callback({ responseHeaders: details.responseHeaders });
    }
  );

  loadWindowState();

  const { width, height, x, y } = windowState;

  mainWindow = new BrowserWindow({
    width: width || 1280,
    height: height || 800,
    minWidth: 950,
    minHeight: 500,
    x: x,
    y: y,
    frame: false, // Frameless window
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Set to false to allow current app.js logic to work if it relies on node
      spellcheck: true
    },
    // Use the horse logo if available
    icon: path.join(__dirname, 'favicon.png'),
    title: require('./js/core/appName.cjs').APP_NAME,
    backgroundColor: '#0a0a0c', // Matches the design language
    show: false // Show once ready to avoid white flash
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((err) => {
        logger.error('system', 'open-external window handler error', err);
      });
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (/^https?:\/\//i.test(url) && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url).catch((err) => {
        logger.error('system', 'open-external navigation handler error', err);
      });
    }
  });

  // Remove the default menu
  Menu.setApplicationMenu(null);

  // Clear cache to ensure local dev static files are updated
  mainWindow.webContents.session.clearCache().then(() => {
    // Load the web app served by Express via 127.0.0.1 for host consistency
    mainWindow.loadURL('http://127.0.0.1:3000');
  });

  mainWindow.once('ready-to-show', () => {
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    if (windowState.isFullScreen) {
      mainWindow.setFullScreen(true);
    }
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (quitDownloadWarningAccepted) return;
    event.preventDefault();
    if (quitDownloadWarningInProgress) return;
    quitDownloadWarningInProgress = true;
    confirmQuitWithActiveDownloads().then(async (shouldQuit) => {
      quitDownloadWarningInProgress = false;
      if (!shouldQuit) return;
      // Tear down the remote Pod (if any) before quitting — best-effort, the
      // server child is still alive at this point so the call can reach it. The
      // backend stops-warm or deletes per the user's delete-on-quit pref.
      await teardownRemotePod();
      quitDownloadWarningAccepted = true;
      mainWindow?.close();
    });
  });

  // Save state on move/resize (debounced)
  let saveTimeout;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowState, 500);
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximize-change', true);
    saveWindowState();
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximize-change', false);
    saveWindowState();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window-fullscreen-change', true);
    saveWindowState();
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window-fullscreen-change', false);
    saveWindowState();
  });

  // Native Right-Click Context Menu for Cut/Copy/Paste + Spellcheck
  mainWindow.webContents.on('context-menu', (event, params) => {
    if (!APP_CONFIG.dev_mode) {
      return;
    }

    const menu = new Menu();

    // Add spellcheck suggestions
    if (params.dictionarySuggestions.length > 0) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Add to dictionary
    if (params.misspelledWord) {
      menu.append(new MenuItem({
        label: `Add "${params.misspelledWord}" to Dictionary`,
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }
    
    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'undo' }));
      menu.append(new MenuItem({ role: 'redo' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'cut' }));
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({ role: 'paste' }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    } else if (params.hasImageContents) {
      menu.append(new MenuItem({ role: 'copyImage' }));
    } else {
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    }

    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Inspect Element',
      click: () => mainWindow.webContents.inspectElement(params.x, params.y)
    }));
    
    menu.popup(mainWindow, params.x, params.y);
  });

  // MPI-270 — OS floating latent window. On minimize, ask the renderer whether
  // to show (setting on + a gen running); it replies via 'float-latent:show-state'.
  // On restore/focus, tear it down and clear the per-cycle dismiss flag.
  mainWindow.on('minimize', () => {
    if (floatDismissed) return;
    mainWindow.webContents.send('float-latent:query-show');
  });
  const teardownFloat = () => {
    floatDismissed = false;
    if (floatLatent.isOpen()) {
      floatLatent.close();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('float-latent:closed');
    }
  };
  mainWindow.on('restore', teardownFloat);
  mainWindow.on('focus', teardownFloat);

  mainWindow.on('closed', () => {
    saveWindowState();
    floatLatent.close();
    mainWindow = null;
  });
}

// MPI-270 — set when the user X's the float window; suppresses it until the next
// restore/focus (i.e. the current minimize cycle).
let floatDismissed = false;

// Start the Express server
function resolveMainPortableRoot() {
  if (process.env.CUBRIC_PORTABLE_ROOT) {
    return path.resolve(process.env.CUBRIC_PORTABLE_ROOT);
  }
  if (!app.isPackaged) return '';

  const executableDir = path.dirname(process.execPath);
  return path.basename(executableDir).toLowerCase() === 'app'
    ? path.dirname(executableDir)
    : executableDir;
}

function resolveMainResourcesPath(portableRoot) {
  if (process.env.MPI_RESOURCES_PATH) {
    return path.resolve(process.env.MPI_RESOURCES_PATH);
  }
  if (app.isPackaged && process.resourcesPath) {
    return process.resourcesPath;
  }
  if (portableRoot) {
    return path.join(portableRoot, 'resources');
  }
  return '';
}

function buildServerEnv(userDataPath, documentsPath) {
  const portableRoot = resolveMainPortableRoot();
  const resourcesPath = resolveMainResourcesPath(portableRoot);
  const env = {
    ...process.env,
    APP_USER_DATA: userDataPath,
    APP_DOCUMENTS: documentsPath,
    MPI_RESOURCES_PATH: resourcesPath,
  };

  if (portableRoot) {
    env.CUBRIC_PORTABLE_ROOT = portableRoot;
  }
  if (process.env.CUBRIC_ENGINE_ROOT) {
    env.CUBRIC_ENGINE_ROOT = path.resolve(process.env.CUBRIC_ENGINE_ROOT);
  }
  if (process.env.CUBRIC_MODELS_ROOT) {
    env.CUBRIC_MODELS_ROOT = path.resolve(process.env.CUBRIC_MODELS_ROOT);
  }
  if (process.env.CUBRIC_USER_DATA_ROOT) {
    env.CUBRIC_USER_DATA_ROOT = path.resolve(process.env.CUBRIC_USER_DATA_ROOT);
  }
  if (process.env.CUBRIC_UV_BIN) {
    env.CUBRIC_UV_BIN = path.resolve(process.env.CUBRIC_UV_BIN);
  }

  return env;
}

function startServer() {
  const userDataPath = app.getPath('userData');
  const documentsPath = app.getPath('documents');
  console.log('[main] APP_USER_DATA set to:', userDataPath);
  console.log('[main] APP_DOCUMENTS set to:', documentsPath);
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    silent: true,
    env: buildServerEnv(userDataPath, documentsPath)
  });

  // Let the forked server request decrypted RunPod secrets on demand (MPI-64).
  // safeStorage lives only in this main process; the key crosses the fork channel
  // only when asked and is never persisted by the child.
  secretsStore.registerForkBridge(serverProcess);

  const pipeChildStream = (stream, level) => {
    if (!stream) return;
    let buffer = '';
    let structuredContinuation = null;
    const structuredLogPattern = /^\[(?<timestamp>[^\]]+)\]\s+\[(?<level>INFO|WARN|ERROR)\]\s+\[(?<category>[^\]]+)\]\s*(?<message>[\s\S]*)$/;
    const writeStructuredLine = (levelName, category, message) => {
      if (levelName === 'error') logger.error(category, message);
      else if (levelName === 'warn') logger.warn(category, message);
      else logger.info(category, message);
    };
    const writeChildLine = (line) => {
      const match = line.match(structuredLogPattern);
      if (match?.groups) {
        const childLevel = match.groups.level.toLowerCase();
        const category = match.groups.category || 'server';
        const message = match.groups.message || '';
        structuredContinuation = { level: childLevel, category };
        writeStructuredLine(childLevel, category, message);
        return;
      }
      if (structuredContinuation) {
        writeStructuredLine(structuredContinuation.level, structuredContinuation.category, line);
        return;
      }
      logger[level]('server', line);
    };

    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line.length) writeChildLine(line);
      }
    });
    stream.on('end', () => {
      if (buffer.length) writeChildLine(buffer);
    });
  };
  pipeChildStream(serverProcess.stdout, 'info');
  pipeChildStream(serverProcess.stderr, 'error');

  serverProcess.on('error', (err) => {
    logger.error('server', 'Failed to start server', err);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      logger.error('server', `Server process exited with code ${code} signal ${signal}`);
    } else {
      logger.info('server', `Server process exited with code ${code} signal ${signal}`);
    }
  });
}

app.on('ready', () => {
  pruneStaleMaskTemp();
  logger.info('mask-temp', `session=${SESSION_ID} tempDir=${MASK_TEMP_ROOT}`);

  // macOS dock icon for the unpackaged portable: the bundled Electron.app ships
  // electron.icns; the build swaps it, but set it at runtime too as a fallback
  // for builds where the bundle icon was not replaced.
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(path.join(__dirname, 'favicon.png'));
    } catch (err) {
      logger.warn('main', `Failed to set dock icon: ${err.message}`);
    }
  }

  startServer();

  let readyCalled = false;
  const onReady = () => {
    if (readyCalled) return;
    readyCalled = true;
    createWindow();
  };

  // Wait for the server to signal it's ready
  serverProcess.on('message', async (msg) => {
    if (msg && typeof msg === 'object' && msg.type === 'open-folder') {
      try {
        const folderPath = typeof msg.folderPath === 'string' ? path.resolve(msg.folderPath) : '';
        if (!folderPath) throw new Error('Invalid folder path');
        const error = await shell.openPath(folderPath);
        if (error) throw new Error(error);
        serverProcess.send?.({ type: 'open-folder-result', id: msg.id, ok: true });
      } catch (err) {
        logger.error('system', 'open-folder bridge error', err);
        serverProcess.send?.({ type: 'open-folder-result', id: msg.id, ok: false, error: err.message });
      }
      return;
    }

    if (msg && typeof msg === 'object' && msg.type === 'reveal-item') {
      try {
        const itemPath = typeof msg.itemPath === 'string' ? path.resolve(msg.itemPath) : '';
        if (!itemPath) throw new Error('Invalid item path');
        shell.showItemInFolder(itemPath); // selects the file in the OS file browser (win/mac/linux)
        serverProcess.send?.({ type: 'reveal-item-result', id: msg.id, ok: true });
      } catch (err) {
        logger.error('system', 'reveal-item bridge error', err);
        serverProcess.send?.({ type: 'reveal-item-result', id: msg.id, ok: false, error: err.message });
      }
      return;
    }

    if (msg === 'server-ready') {
      console.log('[main] Server signaled ready.');
      onReady();
    }
  });

  // Fallback timeout in case signal is missed (5 seconds)
  setTimeout(() => {
    if (!readyCalled) {
      console.warn('[main] Server signal timed out, attempting to create window anyway...');
      onReady();
    }
  }, 5000);

  // Window Control IPC Handlers
  ipcMain.on('toggle-dev-tools', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  ipcMain.on('inspect-element', (event, x, y) => {
    if (mainWindow) {
      mainWindow.webContents.inspectElement(x || 0, y || 0);
    }
  });

  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  // ── MPI-270 float latent window ─────────────────────────────────────────────
  // Renderer's reply to 'float-latent:query-show'. Tiles/frames stream via the
  // handlers below once open; the renderer seeds the first tiles itself.
  ipcMain.on('float-latent:show-state', (_e, { show } = {}) => {
    // no-op: renderer sends add-tile/frame directly when show is true. Kept so
    // future gating (e.g. logging) has a hook.
  });
  ipcMain.on('float-latent:add-tile', (_e, { lane, genId, title } = {}) => {
    if (mainWindow && lane) floatLatent.addTile(mainWindow, lane, genId, title);
  });
  ipcMain.on('float-latent:frame', (_e, { lane, genId, dataUrl, seq } = {}) => {
    if (lane) floatLatent.frame(lane, genId, dataUrl, seq);
  });
  ipcMain.on('float-latent:finalize', (_e, { lane, genId, dataUrl } = {}) => {
    if (lane) floatLatent.finalize(lane, genId, dataUrl);
  });
  ipcMain.on('float-latent:spend', (_e, { lane, genId, dataUrl } = {}) => {
    if (lane) floatLatent.spendTile(lane, genId, dataUrl);
  });
  ipcMain.on('float-latent:tile-remove', (_e, { lane, genId } = {}) => {
    if (lane) {
      floatLatent.removeTile(lane, genId);
      // removeTile closes the window when the last tile goes — tell the renderer.
      if (!floatLatent.isOpen() && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('float-latent:closed');
      }
    }
  });
  ipcMain.on('float-latent:dismiss', () => {
    floatDismissed = true;
    floatLatent.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('float-latent:closed');
  });
  ipcMain.on('float-latent:restore', () => {
    floatLatent.close();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('float-latent:closed');
    }
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) {
      saveWindowState();
      mainWindow.close();
    }
  });

  ipcMain.on('window-fullscreen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  ipcMain.handle('window-state', () => ({
    isFullScreen: Boolean(mainWindow?.isFullScreen()),
    isMaximized: Boolean(mainWindow?.isMaximized())
  }));

  // RunPod secret storage (MPI-64): registers secrets:* IPC handlers. safeStorage
  // when available; derived-key encrypted fallback + weakEncryption flag otherwise.
  secretsStore.init({ app, safeStorage, ipcMain, logger });

  // System notification — fires only when the window is not focused
  // (minimized, behind another app, or on another workspace).
  // Renderer sends unconditionally; main gates on isFocused().
  const showOsNotification = (payload = {}, kind = 'notification') => {
    if (!mainWindow || mainWindow.isFocused()) return;
    if (!Notification.isSupported()) return;

    const options = {
      title: payload.title || 'Cubric Studio',
      subtitle: payload.subtitle || 'Cubric Studio',
      body: payload.body || '',
      // "Play sound on notification" setting: gate the OS chime. Defaults to
      // sound ON when the flag is absent (payload.sound === undefined).
      silent: payload.sound === false,
      urgency: payload.urgency || 'normal',
      timeoutType: payload.timeoutType || 'default',
    };
    if (fs.existsSync(NOTIFICATION_ICON_PATH)) {
      options.icon = NOTIFICATION_ICON_PATH;
    }

    const notif = new Notification(options);
    activeNotifications.add(notif);
    notif.on('close', () => activeNotifications.delete(notif));
    notif.on('failed', (_event, error) => {
      activeNotifications.delete(notif);
      logger.warn('notification', `${kind} notification failed: ${error}`);
    });
    notif.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    notif.show();
  };

  ipcMain.on('notify-generation-complete', (event, payload = {}) => {
    showOsNotification({
      title: payload.title || 'Generation complete',
      subtitle: payload.subtitle || 'Cubric Studio',
      body: payload.body || '',
      sound: payload.sound,
      urgency: payload.urgency,
      timeoutType: payload.timeoutType,
    }, 'Generation complete');
  });

  ipcMain.on('notify-download-complete', (event, payload = {}) => {
    showOsNotification({
      title: payload.title || 'Download complete',
      subtitle: payload.subtitle || 'Cubric Studio',
      body: payload.body || '',
      sound: payload.sound,
      urgency: payload.urgency,
      timeoutType: payload.timeoutType,
    }, 'Download complete');
  });

  ipcMain.on('notify-connection-complete', (event, payload = {}) => {
    showOsNotification({
      title: payload.title || 'Pod connected',
      subtitle: payload.subtitle || 'Cubric Studio',
      body: payload.body || '',
      sound: payload.sound,
      urgency: payload.urgency,
      timeoutType: payload.timeoutType,
    }, 'Pod connected');
  });

  // TODO: replace platform branches with screen.setCursorScreenPoint({x,y})
  // once Electron exposes it (not available as of Electron 41).
  ipcMain.on('warp-cursor', (event, x, y) => {
    const { execFile } = require('child_process');
    const px = Math.round(x);
    const py = Math.round(y);
    if (process.platform === 'win32') {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${px}, ${py})`
      ], { windowsHide: true }, () => {});
    } else if (process.platform === 'darwin') {
      // macOS: move cursor via osascript (no deps required)
      execFile('osascript', [
        '-e', `tell application "System Events" to set the position of the mouse cursor to {${px}, ${py}}`
      ], () => {});
    } else {
      // Linux: use xdotool if available, silent fail if not installed
      execFile('xdotool', ['mousemove', '--', String(px), String(py)], () => {});
    }
  });

  // Open external URL in default browser
  ipcMain.handle('open-external', async (_evt, url) => {
    try {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return { ok: false, error: 'Invalid URL' };
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      logger.error('system', 'open-external error', err);
      return { ok: false, error: err.message };
    }
  });

  // Mask layer TEMP store IPC — session-scoped persistence for mask layers.
  ipcMain.handle('mask-temp:get-session-id', async () => {
    return { ok: true, sessionId: SESSION_ID, tempDir: MASK_TEMP_ROOT };
  });

  ipcMain.handle('mask-temp:read', async (_evt, projectId, groupId, itemId) => {
    try {
      const dir = resolveMaskItemDir(projectId, groupId, itemId);
      const out = { manual: null, subtract: null, auto: null };
      const manualPath = path.join(dir, 'manual.png');
      const subtractPath = path.join(dir, 'subtract.png');
      const autoPath = path.join(dir, 'auto.json');
      if (fs.existsSync(manualPath)) {
        out.manual = bufferToPngDataUrl(fs.readFileSync(manualPath));
      }
      if (fs.existsSync(subtractPath)) {
        out.subtract = bufferToPngDataUrl(fs.readFileSync(subtractPath));
      }
      if (fs.existsSync(autoPath)) {
        try {
          out.auto = JSON.parse(fs.readFileSync(autoPath, 'utf8'));
        } catch (err) {
          logger.warn('mask-temp', `auto read failed: ${err.message}`);
        }
      }
      return { ok: true, ...out };
    } catch (err) {
      logger.error('mask-temp', 'read failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mask-temp:write-manual', async (_evt, projectId, groupId, itemId, dataUrl) => {
    try {
      const dir = resolveMaskItemDir(projectId, groupId, itemId);
      atomicWritePng(path.join(dir, 'manual.png'), dataUrl);
      return { ok: true };
    } catch (err) {
      logger.error('mask-temp', 'write-manual failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mask-temp:write-subtract', async (_evt, projectId, groupId, itemId, dataUrl) => {
    try {
      const dir = resolveMaskItemDir(projectId, groupId, itemId);
      atomicWritePng(path.join(dir, 'subtract.png'), dataUrl);
      return { ok: true };
    } catch (err) {
      logger.error('mask-temp', 'write-subtract failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mask-temp:write-auto', async (_evt, projectId, groupId, itemId, autoState) => {
    try {
      const dir = resolveMaskItemDir(projectId, groupId, itemId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, 'auto.json');
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(autoState || null), 'utf8');
      fs.renameSync(tmpPath, filePath);
      return { ok: true };
    } catch (err) {
      logger.error('mask-temp', 'write-auto failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mask-temp:delete-auto', async (_evt, projectId, groupId, itemId) => {
    try {
      const dir = resolveMaskItemDir(projectId, groupId, itemId);
      fs.rmSync(path.join(dir, 'auto.json'), { force: true });
      return { ok: true };
    } catch (err) {
      logger.error('mask-temp', 'delete-auto failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mask-temp:delete', async (_evt, projectId, groupId, itemId) => {
    try {
      const dir = resolveMaskItemDir(projectId, groupId, itemId);
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      logger.error('mask-temp', 'delete failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mask-temp:cleanup-session', async () => {
    try {
      fs.rmSync(MASK_TEMP_ROOT, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      logger.error('mask-temp', 'cleanup-session failed', err);
      return { ok: false, error: err.message };
    }
  });

  // Cross-platform folder picker using Electron's native dialog
  ipcMain.handle('choose-folder', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose a folder for your project',
      });
      if (result.canceled) {
        return { cancelled: true, path: null };
      }
      return { cancelled: false, path: result.filePaths[0] };
    } catch (err) {
      logger.error('system', 'Folder picker error', err);
      return { cancelled: true, path: null, error: err.message };
    }
  });

  // Bulk download: pick a destination folder once, copy N files into it.
  // sources = array of absolute file paths. Collisions get " (n)" suffix.
  ipcMain.handle('save-files-to-folder', async (_event, sources) => {
    try {
      if (!Array.isArray(sources) || sources.length === 0) {
        return { cancelled: false, copied: 0, skipped: 0, destination: null };
      }
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: `Choose folder to save ${sources.length} file${sources.length === 1 ? '' : 's'}`,
        buttonLabel: 'Save here',
      });
      if (result.canceled || !result.filePaths[0]) {
        return { cancelled: true, copied: 0, skipped: 0, destination: null };
      }
      const destDir = result.filePaths[0];
      let copied = 0;
      let skipped = 0;
      for (const src of sources) {
        try {
          if (!src || !fs.existsSync(src)) { skipped++; continue; }
          const base = path.basename(src);
          const ext = path.extname(base);
          const stem = base.slice(0, base.length - ext.length);
          let target = path.join(destDir, base);
          let n = 1;
          while (fs.existsSync(target)) {
            target = path.join(destDir, `${stem} (${n})${ext}`);
            n++;
          }
          fs.copyFileSync(src, target);
          copied++;
        } catch (err) {
          skipped++;
          logger.warn('system', `save-files-to-folder copy failed: ${src} — ${err.message}`);
        }
      }
      return { cancelled: false, copied, skipped, destination: destDir };
    } catch (err) {
      logger.error('system', 'save-files-to-folder error', err);
      return { cancelled: true, copied: 0, skipped: 0, destination: null, error: err.message };
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean ComfyUI temp folders on quit (cross-platform, synchronous)
app.on('before-quit', () => {
  cleanSessionTempFolders();
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
