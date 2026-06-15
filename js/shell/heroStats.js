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

// Cached local-machine GPU/VRAM/RAM line so it can be restored when the remote
// engine disconnects (the footer flips to the Pod card while connected).
let _localGpuFrag = null;
let _remoteConnected = false;
let _remotePhase = null; // MPI-73: 'connecting' | 'disconnecting' — suppress the local GPU line mid-transition

function _buildLocalGpuFrag({ gpu, vramTotal, ramTotal }) {
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
    return frag.childNodes.length ? frag : null;
}

async function _renderGpu() {
    const el = gid('heroStatGpu');
    if (!el) return;
    try {
        const res = await fetch('/system/gpu-info');
        if (!res.ok) return;
        const info = await res.json();
        const frag = _buildLocalGpuFrag(info);
        if (frag) {
            // Keep a clone so the live one can be mounted now and re-cloned later.
            _localGpuFrag = frag.cloneNode(true);
            // Don't paint the local GPU line while remote-connected OR mid-transition.
            // At boot the gpu-info fetch resolves AFTER the "connecting" emit cleared
            // the card; without the phase guard it re-paints the local GPU over the
            // cleared card (MPI-73 — local GPU lingered during a boot auto-connect).
            if (!_remoteConnected && !_remotePhase) {
                el.innerHTML = '';
                el.appendChild(frag);
            }
        }
    } catch (err) {
        clientLogger.warn('heroStats', 'gpu-info fetch failed', err);
    }
}

// Flip the engine label + GPU stat between local hardware and the connected Pod.
// Remote line mirrors the local format: "RTX A4000 · 16GB VRAM · 24GB RAM" (VRAM
// accented). VRAM/RAM are best-effort — each segment is dropped if absent.
// MPI-73: a transient `phase` ('connecting'|'disconnecting') shows the in-progress
// transition with NO GPU card below (no hardware to show mid-connect).
// MPI-64 A1: a sticky `phase==='disconnected'` marks an INVOLUNTARY engine drop
// (container OOM / WS death) — distinct from a user Disconnect (which paints plain
// 'local · offline'). It keeps remote context ("remote · disconnected", no GPU
// card) so the app doesn't masquerade as offline-by-choice, until the user
// reconnects from Settings → RunPod (which then emits connected:true and repaints).
function _renderEngine({ connected, gpuName, vramGb, ramGb, phase = null }) {
    _remoteConnected = !!connected;
    _remotePhase = phase || null;
    const label = gid('heroStatEngine');
    const gpu = gid('heroStatGpu');
    if (phase === 'connecting' || phase === 'disconnecting') {
        if (label) label.textContent = phase === 'connecting' ? 'connecting · offline' : 'disconnecting · online';
        // MPI-87: while connecting, the GPU slot shows a live elapsed-based connect %
        // (seeded at 0% here; updated by remote:connect-progress). The footer label
        // already says "connecting", so the slot is just the bare number.
        if (gpu) gpu.textContent = phase === 'connecting' ? '0%' : '';
        return;
    }
    if (phase === 'disconnected') {
        if (label) label.textContent = 'remote · disconnected';
        if (gpu) gpu.innerHTML = '';
        return;
    }
    if (label) label.textContent = connected ? 'remote · online' : 'local · offline';
    if (!gpu) return;
    if (connected) {
        const frag = document.createDocumentFragment();
        const sep = () => frag.appendChild(document.createTextNode(' · '));
        frag.appendChild(document.createTextNode(_stripGpuPrefix(gpuName) || 'Remote GPU'));
        if (Number(vramGb) > 0) {
            sep();
            const accent = document.createElement('span');
            accent.className = 'mpi-landing__stat-accent';
            accent.textContent = `${Math.round(vramGb)}GB VRAM`;
            frag.appendChild(accent);
        }
        if (Number(ramGb) > 0) {
            sep();
            frag.appendChild(document.createTextNode(`${Math.round(ramGb)}GB RAM`));
        }
        gpu.innerHTML = '';
        gpu.appendChild(frag);
    } else {
        // Restore the cached local line (re-clone so the node isn't consumed).
        gpu.innerHTML = '';
        if (_localGpuFrag) gpu.appendChild(_localGpuFrag.cloneNode(true));
        else _renderGpu();
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
    // Persistent remote-engine feedback (MPI-64 Step 4.4) — flip local↔remote.
    Events.on('remote:connection', (payload) => _renderEngine(payload || {}));
    // MPI-87: live connect % in the GPU slot, but only while the connecting phase
    // is active — a late tick after the phase resolves must not clobber the GPU card.
    Events.on('remote:connect-progress', ({ pct } = {}) => {
        if (_remotePhase !== 'connecting') return;
        const gpu = gid('heroStatGpu');
        if (gpu && Number.isFinite(pct)) gpu.textContent = `${pct}%`;
    });
}
