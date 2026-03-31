/**
 * themeManager.js — Handles Light/Dark mode transitions and persistence.
 */

import { state } from './state.js';

export function initTheme() {
    const savedTheme = localStorage.getItem('mpi-theme') || 'dark';
    const isLight = savedTheme === 'light';
    
    state.isLightMode = isLight;
    applyTheme(isLight);
}

export function toggleTheme(isLight) {
    state.isLightMode = isLight;
    const theme = isLight ? 'light' : 'dark';
    
    localStorage.setItem('mpi-theme', theme);
    applyTheme(isLight);
}

function applyTheme(isLight) {
    if (isLight) {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }
}
