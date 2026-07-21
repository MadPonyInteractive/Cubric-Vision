/**
 * heroStats.js — Hydrates the three landing-page hero footer stat slots.
 *
 *   #heroStatGpu     — "RTX 4090 · 24 GB VRAM · 64 GB RAM"   (via /system/gpu-info)
 *   #heroStatModels  — "7 / 23"                              (via models:checked event)
 *   #heroStatSession — "2 days ago" / "10min/$1.51"          (projects:listed; or
 *                       remote:connection while cloud-connected — MPI-80)
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

// Last `projects:listed` payload, cached so the session slot can repaint the
// local "last session" line when the remote engine disconnects (MPI-80).
let _lastProjects = null;
// True while the session slot is owned by the live remote session (MPI-80) —
// declared here so _renderSession's guard reads it before _renderRemoteSession
// is defined below.
let _remoteSessionActive = false;

function _renderSession(projects) {
    if (projects !== undefined) _lastProjects = projects;
    // While remote-connected with live cost data, the slot shows the current
    // remote session instead — _renderRemoteSession owns it (MPI-80).
    if (_remoteSessionActive) return;
    _setSessionLabel('last session');
    const el = gid('heroStatSession');
    if (!el) return;
    if (!_lastProjects || _lastProjects.length === 0) {
        el.textContent = 'No sessions yet';
        return;
    }
    el.textContent = _formatRelative(_lastProjects[0].updatedAt);
}

function _setSessionLabel(text) {
    const lbl = gid('heroStatSessionLabel');
    if (lbl) lbl.textContent = text;
}

// MPI-80: format billable Pod uptime as "45s" (<1min), "10min" (<1h) or "2h 5m"
// (>=1h). Seconds matter for the first minute so the badge climbs immediately on
// connect instead of sitting at "0min".
function _formatDuration(secs) {
    const total = Math.max(0, Math.floor(secs));
    if (total < 60) return `${total}s`;
    const mins = Math.floor(total / 60);
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
}

// MPI-80: paint "current session" + "10min/$1.51" when remote-connected and we
// have billing-true uptime. Cost = uptimeHours × securePrice. Requires BOTH a
// finite uptime and a known $/hr; otherwise the slot falls back to "last session".
function _renderRemoteSession({ uptimeSeconds, pricePerHr }) {
    const hasUptime = Number.isFinite(uptimeSeconds) && uptimeSeconds > 0;
    const hasPrice = Number.isFinite(pricePerHr) && pricePerHr > 0;
    if (!hasUptime || !hasPrice) {
        // No usable cost data — let the project "last session" line stand.
        _remoteSessionActive = false;
        _renderSession(undefined);
        return;
    }
    _remoteSessionActive = true;
    _setSessionLabel('current session');
    const el = gid('heroStatSession');
    if (!el) return;
    const cost = (uptimeSeconds / 3600) * pricePerHr;
    el.innerHTML = '';
    el.appendChild(document.createTextNode(`${_formatDuration(uptimeSeconds)}/`));
    const accent = document.createElement('span');
    accent.className = 'mpi-landing__stat-accent';
    accent.textContent = `$${cost.toFixed(2)}`;
    el.appendChild(accent);
}

// Cached local-machine GPU/VRAM/RAM line so it can be restored when the remote
// engine disconnects (the footer flips to the Pod card while connected).
let _localGpuFrag = null;
let _remoteConnected = false;
let _remotePhase = null; // MPI-73: 'connecting' | 'disconnecting' — suppress the local GPU line mid-transition
// Last connect % seen this connecting window. The live % lives only in the GPU
// slot's textContent, so any re-render of that slot (a phase re-emit, a nav that
// flips the footer local→remote) loses it and re-seeded 0. Cache it so a
// connecting re-render restores the real number instead of snapping back to 0%.
// Reset to null when the connect resolves (connected / local / disconnected).
let _lastConnectPct = null;

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
function _renderEngine({ connected, gpuName, vramGb, ramGb, uptimeSeconds, pricePerHr, phase = null }) {
    _remoteConnected = !!connected;
    _remotePhase = phase || null;
    // MPI-80: session slot tracks the engine. Connected with cost data → current
    // remote session; otherwise restore the project "last session" line.
    if (connected && phase === null) {
        _renderRemoteSession({ uptimeSeconds, pricePerHr });
    } else {
        _remoteSessionActive = false;
        _renderSession(undefined);
    }
    const label = gid('heroStatEngine');
    const gpu = gid('heroStatGpu');
    if (phase === 'connecting' || phase === 'disconnecting') {
        if (label) label.textContent = phase === 'connecting' ? 'connecting · offline' : 'disconnecting · online';
        // MPI-87: while connecting, the GPU slot shows a live elapsed-based connect %
        // (seeded at 0% here; updated by remote:connect-progress). The footer label
        // already says "connecting", so the slot is just the bare number.
        // A repeated phase:'connecting' render (a phase re-emit, or a nav that flipped
        // the footer local→remote and back) must NOT reset a % the boot poll already
        // climbed. Restore from the cached last %, not a hard 0 — the slot's textContent
        // is the ONLY place the live % lived, so any re-render lost it and snapped to 0
        // (climb→0 on every gallery round-trip / feed tick).
        if (gpu) {
            if (phase === 'connecting') {
                gpu.textContent = `${_lastConnectPct ?? 0}%`;
            } else {
                gpu.textContent = '';
            }
        }
        return;
    }
    // Connect resolved (or dropped) — the connecting window is over, drop the cache
    // so the NEXT connect starts fresh at 0 instead of restoring a stale prior %.
    _lastConnectPct = null;
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
        if (!Number.isFinite(pct)) return;
        _lastConnectPct = pct; // cache so a re-render (nav round-trip) restores it
        const gpu = gid('heroStatGpu');
        if (gpu) gpu.textContent = `${pct}%`;
    });
}
