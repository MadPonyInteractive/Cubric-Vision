/**
 * updateChecker.js — MPI-334 in-app update prompt (PORTABLE builds only).
 *
 * On boot (called from init.js) we ask main whether a newer GitHub release exists.
 * Main gates on the portable root and does the fetch; here we do the semver compare
 * (reusing compareSemVer), honour the dismiss-mute, and drive the MpiOkCancel dialog.
 * OK → main launches the existing updater script + quits. Cancel → count it; after
 * 3 dismissals of the same version we stay quiet until a newer one lands.
 *
 * Dev note: in a dev/browser build the portable gate returns portable:false, so no
 * popup ever shows. Set localStorage 'mpi_dev_force_update' to a fake latest version
 * (e.g. "9.9.9") to force the dialog for UI testing — OK will no-op (not portable).
 */
import { compareSemVer } from '../managers/versioningManager.js';
import { APP_VERSION } from '../core/appVersion.js';
import { Storage } from '../core/storage.js';
import { MpiOkCancel } from '../components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { clientLogger } from './clientLogger.js';

const DISMISS_LIMIT = 3;

function getIpc() {
    try {
        if (typeof window.require === 'function') {
            return window.require('electron')?.ipcRenderer || null;
        }
    } catch { /* not electron */ }
    return null;
}

export async function checkForUpdate() {
    const ipc = getIpc();

    let current, latest;

    // ponytail: dev-only escape hatch to exercise the real dialog + mute in a build
    // where the portable gate would skip the fetch. Never set in prod. It flows through
    // the SAME compare + dismiss-mute below, so it faithfully tests the 3x mute.
    let devForce = null;
    try { devForce = localStorage.getItem('mpi_dev_force_update'); } catch { /* ignore */ }
    if (devForce) {
        current = APP_VERSION;
        latest = devForce;
        clientLogger.info('update', `DEV force-update flag set — simulating latest=${latest}`);
    } else {
        if (!ipc) { clientLogger.info('update', 'no IPC (browser) — update check skipped'); return; }
        let result;
        try {
            result = await ipc.invoke('check-for-update');
        } catch (err) {
            clientLogger.warn('update', `check-for-update IPC failed: ${err.message}`);
            return;
        }
        if (!result?.portable) return;          // dev/non-portable — main already logged
        if (!result.ok || !result.latest) return; // fetch failed — main already logged
        current = result.current;
        latest = result.latest;
    }

    if (compareSemVer(latest, current) <= 0) {
        clientLogger.info('update', `up to date (current=${current} latest=${latest})`);
        return;
    }

    const dismissed = Storage.getUpdateDismissed();
    if (dismissed.version === latest && dismissed.count >= DISMISS_LIMIT) {
        clientLogger.info('update', `v${latest} available but muted (dismissed ${dismissed.count}x)`);
        return;
    }

    clientLogger.info('update', `update available: v${current} -> v${latest}, prompting`);
    promptUpdate(current, latest, ipc);
}

function promptUpdate(current, latest, ipc) {
    const dialog = MpiOkCancel.mount(document.createElement('div'), {
        title: 'Update available',
        text: `A new version of Cubric Vision is available.\n\n`
            + `You have v${current}. Latest is v${latest}.\n\n`
            + `Update now? The app will close, update, and reopen.`,
        okLabel: 'Update now',
        cancelLabel: 'Later',
    });

    dialog.on('ok', async () => {
        clientLogger.info('update', `user accepted update to v${latest} — launching updater`);
        if (!ipc) { clientLogger.warn('update', 'no IPC — cannot launch updater'); return; }
        try {
            const r = await ipc.invoke('run-update');
            if (!r?.ok) clientLogger.warn('update', `run-update failed: ${r?.error || 'unknown'}`);
        } catch (err) {
            clientLogger.warn('update', `run-update IPC failed: ${err.message}`);
        }
    });

    dialog.on('cancel', () => {
        const prev = Storage.getUpdateDismissed();
        const count = prev.version === latest ? (prev.count || 0) + 1 : 1;
        Storage.setUpdateDismissed({ version: latest, count });
        clientLogger.info('update', `user dismissed v${latest} (${count}/${DISMISS_LIMIT})`);
    });

    dialog.el.show();
}
