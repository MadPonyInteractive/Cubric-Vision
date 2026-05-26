/**
 * heroStats.js — Hydrates the three landing-page hero footer stat slots.
 *
 *   #heroStatGpu     — "RTX 4090 · 24 GB VRAM · 64 GB RAM"   (via /system/gpu-info)
 *   #heroStatModels  — "7 / 23"                              (via models:checked event)
 *   #heroStatSession — "2 days ago"                          (via projects:listed event)
 */

import { gid } from '../utils/dom.js';
import { Events } from '../events.js';
import { MODELS } from '../data/modelRegistry.js';
import { clientLogger } from '../services/clientLogger.js';

const GB = 1024 ** 3;

function _formatGB(bytes) {
    if (!bytes || bytes <= 0) return null;
    return `${Math.round(bytes / GB)}GB`;
}

function _stripGpuPrefix(name) {
    if (!name) return null;
    return name.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '').trim();
}

function _formatRelative(iso) {
    if (!iso) return '—';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '—';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}

function _renderModels(installedCount = 0) {
    const el = gid('heroStatModels');
    if (!el) return;
    el.innerHTML = '';
    const accent = document.createElement('span');
    accent.className = 'mpi-landing__stat-accent';
    accent.textContent = String(installedCount);
    el.appendChild(accent);
    el.appendChild(document.createTextNode(` / ${MODELS.length}`));
}

function _renderSession(projects) {
    const el = gid('heroStatSession');
    if (!el) return;
    if (!projects || projects.length === 0) {
        el.textContent = 'No sessions yet';
        return;
    }
    el.textContent = _formatRelative(projects[0].updatedAt);
}

async function _renderGpu() {
    const el = gid('heroStatGpu');
    if (!el) return;
    try {
        const res = await fetch('/system/gpu-info');
        if (!res.ok) return;
        const { gpu, vramTotal, ramTotal } = await res.json();
        const gpuLabel = _stripGpuPrefix(gpu?.name);
        const vram = _formatGB(vramTotal);
        const ram = _formatGB(ramTotal);
        const frag = document.createDocumentFragment();
        const sep = () => frag.appendChild(document.createTextNode(' · '));
        if (gpuLabel) frag.appendChild(document.createTextNode(gpuLabel));
        if (vram) {
            if (frag.childNodes.length) sep();
            const accent = document.createElement('span');
            accent.className = 'mpi-landing__stat-accent';
            accent.textContent = `${vram} VRAM`;
            frag.appendChild(accent);
        }
        if (ram) {
            if (frag.childNodes.length) sep();
            frag.appendChild(document.createTextNode(`${ram} RAM`));
        }
        if (frag.childNodes.length) {
            el.innerHTML = '';
            el.appendChild(frag);
        }
    } catch (err) {
        clientLogger.warn('heroStats', 'gpu-info fetch failed', err);
    }
}

/**
 * Initialize hero footer stats. Idempotent — safe to call once at boot.
 * Subscriptions live for the app lifetime (landing page persists).
 */
export function initHeroStats() {
    _renderModels(0);
    _renderSession(null);
    _renderGpu();

    Events.on('models:checked', ({ installedModelIds }) => _renderModels(installedModelIds?.length ?? 0));
    Events.on('projects:listed', ({ projects }) => _renderSession(projects));
}
