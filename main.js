const { app, BrowserWindow, session, Menu, MenuItem, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { fork } = require('child_process');
const logger = require('./routes/logger');
const { getComfyPath, getEngineRoot } = require('./routes/platformEngine');

const APP_CONFIG = loadAppConfig();

// Mask layer TEMP store — session-scoped, cleared on quit, stale dirs pruned at boot.
const SESSION_ID = randomUUID();
const MASK_TEMP_ROOT = path.join(app.getPath('temp'), 'cubric-' + SESSION_ID);

function loadAppConfig() {
  const fallback = { dev_mode: false };
  try {
    const source = fs.readFileSync(path.join(__dirname, 'dev_configs', 'app_config.js'), 'utf8');
    const devMode = source.match(/\bdev_mode\s*:\s*(true|false)\b/);
    return {
      ...fallback,
      dev_mode: devMode ? devMode[1] === 'true' : fallback.dev_mode,
    };
  } catch (err) {
    logger.warn('main', `Failed to read app_config.js; dev_mode=false (${err.message})`);
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

// Required on Windows to show the app icon (not Electron's) when launched via .bat.
// Use exe path as model ID — recommended for unpackaged Electron apps on Windows.
const WINDOWS_APP_USER_MODEL_ID = 'cubric.studio.vision';

if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
}

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

  mainWindow.on('closed', () => {
    saveWindowState();
    mainWindow = null;
  });
}

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

  // System notification — fires only when window is minimized.
  // Renderer sends unconditionally; main gates on isMinimized().
  ipcMain.on('notify-generation-complete', (event, payload = {}) => {
    if (!mainWindow || !mainWindow.isMinimized()) return;
    if (!Notification.isSupported()) return;

    const options = {
      title: payload.title || 'Generation complete',
      subtitle: payload.subtitle || 'Cubric Studio',
      body: payload.body || '',
      silent: false,
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
      logger.warn('notification', `Generation complete notification failed: ${error}`);
    });
    notif.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    notif.show();
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
