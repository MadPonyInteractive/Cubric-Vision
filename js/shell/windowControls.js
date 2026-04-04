/**
 * windowControls.js — Management of Electron window buttons and IPC events.
 * Fail-safe for browser testing.
 */

let ipcRenderer = null;

try {
  if (typeof window.require === 'function') {
    const electron = window.require('electron');
    ipcRenderer = electron.ipcRenderer;
  }
} catch (e) {
  // Silent fail — expected in Browser Mode
}

/**
 * Binds Click listeners to window control buttons (min, max, close, fullscreen).
 */
export function bindWindowControls() {
  const btnMin    = document.getElementById('win-minimize');
  const btnMax    = document.getElementById('win-maximize');
  const btnClose  = document.getElementById('win-close');
  const btnFS     = document.getElementById('win-fullscreen');
  
  const maxIcon      = document.getElementById('max-icon');
  const restoreIcon  = document.getElementById('restore-icon');
  const fsEnterIcon  = document.getElementById('fullscreen-enter-icon');
  const fsExitIcon   = document.getElementById('fullscreen-exit-icon');

  const isBrowser = !ipcRenderer;

  if (isBrowser) {
    console.log('[shell/windowControls] Browser Mode: Window buttons disabled.');
  }

  if (btnMin) btnMin.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-minimize');
  });

  if (btnFS) btnFS.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-fullscreen');
  });

  if (btnMax) btnMax.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-maximize');
  });

  if (btnClose) btnClose.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-close');
  });

  // Listen for Electron State changes
  if (ipcRenderer) {
    ipcRenderer.on('window-fullscreen-change', (event, isFullScreen) => {
      if (fsEnterIcon && fsExitIcon && btnFS) {
        fsEnterIcon.classList.toggle('hide', isFullScreen);
        fsExitIcon.classList.toggle('hide', !isFullScreen);
        btnFS.title = isFullScreen ? 'Exit Full Screen' : 'Full Screen';
      }
    });

    ipcRenderer.on('window-maximize-change', (event, isMaximized) => {
      if (maxIcon && restoreIcon) {
        maxIcon.classList.toggle('hide', isMaximized);
        restoreIcon.classList.toggle('hide', !isMaximized);
      }
    });
  }
}
