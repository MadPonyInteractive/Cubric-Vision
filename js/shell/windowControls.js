/**
 * windowControls.js — Management of Electron window buttons and IPC events.
 * Fail-safe for browser testing.
 */

import { gid, on } from '../utils/dom.js';

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
  const btnMin    = gid('win-minimize');
  const btnMax    = gid('win-maximize');
  const btnClose  = gid('win-close');
  const btnFS     = gid('win-fullscreen');

  const maxIcon      = gid('max-icon');
  const restoreIcon  = gid('restore-icon');
  const fsEnterIcon  = gid('fullscreen-enter-icon');
  const fsExitIcon   = gid('fullscreen-exit-icon');

  const setFullscreenState = (isFullScreen) => {
    document.body.classList.toggle('window-fullscreen', Boolean(isFullScreen));

    if (fsEnterIcon && fsExitIcon && btnFS) {
      fsEnterIcon.classList.toggle('hide', isFullScreen);
      fsExitIcon.classList.toggle('hide', !isFullScreen);
      btnFS.title = isFullScreen ? 'Exit Full Screen' : 'Full Screen';
    }
  };

  if (btnMin) on(btnMin, 'click', () => {
    if (ipcRenderer) ipcRenderer.send('window-minimize');
  });

  if (btnFS) on(btnFS, 'click', () => {
    if (ipcRenderer) ipcRenderer.send('window-fullscreen');
  });

  if (btnMax) on(btnMax, 'click', () => {
    if (ipcRenderer) ipcRenderer.send('window-maximize');
  });

  if (btnClose) on(btnClose, 'click', () => {
    if (ipcRenderer) ipcRenderer.send('window-close');
  });

  // Listen for Electron State changes
  if (ipcRenderer) {
    ipcRenderer.on('window-fullscreen-change', (event, isFullScreen) => {
      setFullscreenState(isFullScreen);
    });

    ipcRenderer.on('window-maximize-change', (event, isMaximized) => {
      if (maxIcon && restoreIcon) {
        maxIcon.classList.toggle('hide', isMaximized);
        restoreIcon.classList.toggle('hide', !isMaximized);
      }
    });

    ipcRenderer.invoke('window-state').then((state) => {
      setFullscreenState(state?.isFullScreen);

      if (maxIcon && restoreIcon) {
        maxIcon.classList.toggle('hide', state?.isMaximized);
        restoreIcon.classList.toggle('hide', !state?.isMaximized);
      }
    });
  }
}

/** Close the app window (browser-safe no-op in dev). */
export function quitApp() {
  if (ipcRenderer) ipcRenderer.send('window-close');
}
