// podDiskBar — shared connected-Pod disk-usage bar (MPI-237).
//
// Mounts an MpiProgressBar + inline "NNgb / MMgb" label into a host element and
// polls GET /remote/pod/disk every 10s. Works for BOTH a network-volume Pod and
// an ephemeral "Any region" Pod (MPI-78) — the server resolves the correct total
// (volume size or container-disk size) and returns { used, total, ephemeral }.
//
// One helper, two call sites (RunPod Settings + Model Library), so the disk-bar
// logic can never drift between them. Hidden until a Pod reports usable numbers.
//
// Usage:
//   const bar = mountPodDiskBar(hostEl);   // hostEl is an empty container
//   ...
//   bar.destroy();                          // stops the poll, tears down the bar

import { MpiProgressBar } from '../components/Primitives/MpiProgressBar/MpiProgressBar.js';
import { ce } from '../utils/dom.js';

const POLL_MS = 10000;

// GB (base-10) from bytes, one decimal — matches the RunPod volume sizing.
function _gb(bytes) {
    return Math.round((bytes / 1e9) * 10) / 10;
}

/**
 * Mount a live Pod disk-usage bar into `hostEl`.
 * @param {HTMLElement} hostEl - empty container the bar + text render into.
 * @returns {{ destroy: () => void }}
 */
export function mountPodDiskBar(hostEl) {
    // Wrapper starts hidden; the first successful poll reveals it.
    const wrap = ce('div', { className: 'mpi-pod-disk' });
    wrap.style.display = 'none';
    const barHost = ce('div', { className: 'mpi-pod-disk__bar' });
    const text = ce('span', { className: 'mpi-pod-disk__text' });
    wrap.appendChild(barHost);
    wrap.appendChild(text);
    hostEl.appendChild(wrap);

    let barInst = null;   // MpiProgressBar instance
    let barMax = null;    // total GB the bar was mounted with (remount on change)
    let timer = null;
    let disposed = false;

    // (Re)mount the progress bar for a given total (GB). MpiProgressBar fixes its
    // max at mount, so a total change (e.g. switching volume ↔ ephemeral pods)
    // needs a fresh mount.
    function ensureBar(totalGb) {
        if (barInst && barMax === totalGb) return;
        barInst?.destroy?.();
        barHost.innerHTML = '';
        barInst = MpiProgressBar.mount(barHost, {
            min: 0,
            max: totalGb,
            value: 0,
            step: 1,
            interactive: false,
            handle: false,
            variant: 'primary',
            info: '', // inline text beside the bar carries the numbers
        });
        barMax = totalGb;
    }

    function hide() {
        wrap.style.display = 'none';
    }

    async function poll() {
        try {
            const res = await fetch('/remote/pod/disk');
            const data = await res.json();
            if (disposed) return;
            // Need a truthful used AND a total to draw a determinate bar.
            if (!data || !data.success
                || !Number.isFinite(data.used) || !Number.isFinite(data.total) || data.total <= 0) {
                hide();
                return;
            }
            const totalGb = _gb(data.total);
            const usedGb = Math.min(totalGb, _gb(data.used));
            ensureBar(totalGb);
            barInst.el.setValueQuiet(usedGb);
            text.textContent = `${usedGb}GB / ${totalGb}GB`;
            // Near-full → danger colour (swap the variant class).
            const full = usedGb / totalGb >= 0.9;
            barInst.el.classList.toggle('mpi-progress--danger', full);
            barInst.el.classList.toggle('mpi-progress--primary', !full);
            wrap.style.display = '';
        } catch (_) {
            if (!disposed) hide();
        }
    }

    poll(); // immediate first read
    timer = setInterval(poll, POLL_MS);

    return {
        destroy() {
            disposed = true;
            if (timer) { clearInterval(timer); timer = null; }
            barInst?.destroy?.();
            barInst = null;
            wrap.remove();
        },
    };
}
