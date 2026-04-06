const { app, BrowserWindow, session, Menu, MenuItem, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

let mainWindow;
let serverProcess;
let windowState = {};

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
    console.error('Failed to save window state:', err);
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
    title: 'Mpi AI Suite',
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
function startServer() {
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    env: { ...process.env, APP_USER_DATA: app.getPath('userData') }
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code} and signal ${signal}`);
  });
}

app.on('ready', () => {
  startServer();

  let readyCalled = false;
  const onReady = () => {
    if (readyCalled) return;
    readyCalled = true;
    createWindow();
  };

  // Wait for the server to signal it's ready
  serverProcess.on('message', (msg) => {
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
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
