/**
 * updateChecker.js — MPI-334 in-app update prompt (PORTABLE builds only).
 *
 * On boot (called from init.js) we ask main whether a newer GitHub release exists.
 * Main gates on the portable root and does the fetch; here we do the semver compare
 * (reusing compareSemVer), honour the mute, and drive the MpiOkCancel dialog.
 * OK → main launches the existing updater script + quits.
 *
 * MPI-629 changed WHAT mutes it. It used to count dismissals and go quiet after 3,
 * which left a user who pressed Later three times with no route back to that update
 * at all — the popup was the only route. Now the popup is one of two routes: it
 * offers every boot until the user explicitly ticks "Don't ask again", and Settings
 * carries an Update section whenever an update is due. The tick silences the POPUP;
 * it never hides the Settings route, which is the whole point of an explicit opt-out.
 *
 * Ordering is load-bearing: the failed-update report comes first (see below), and a
 * boot that reported a failure does not then stack an update prompt on top of it.
 * The result of the check is cached so Settings can ask what is due without a second
 * fetch — see getPendingUpdate().
 *
 * Dev note: in a dev/browser build the portable gate returns portable:false, so
 * nothing is ever due. Set localStorage 'mpi_dev_force_update' to a fake latest
 * version (e.g. "9.9.9") to drive both surfaces — the updater itself will report
 * that it is not available rather than silently doing nothing.
 */
import { compareSemVer } from '../managers/versioningManager.js';
import { APP_VERSION } from '../core/appVersion.js';
import { Storage } from '../core/storage.js';
import { MpiOkCancel } from '../components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { clientLogger } from './clientLogger.js';

/** Promise<{current, latest}|null> — the boot check, resolved once and shared. */
let _pending = null;

function getIpc() {
    try {
        if (typeof window.require === 'function') {
            return window.require('electron')?.ipcRenderer || null;
        }
    } catch { /* not electron */ }
    return null;
}

export function checkForUpdate() {
    _pending = _checkForUpdate().catch((err) => {
        clientLogger.warn('update', `update check failed: ${err?.message || err}`);
        return null;
    });
    return _pending;
}

/**
 * What the boot check found, without re-fetching. Resolves to `{current, latest}`
 * when a newer version exists, `null` otherwise (up to date, non-portable, or the
 * fetch failed). Answers regardless of the mute — a muted popup is still an
 * available update, and Settings is where a muted user goes to get it.
 */
export function getPendingUpdate() {
    return _pending || Promise.resolve(null);
}

async function _checkForUpdate() {
    const ipc = getIpc();

    // A failed run means the newer version is still out there, so the prompt below
    // would fire straight after the failure dialog. One message per boot — but the
    // update stays "due", so Settings still offers the retry.
    const failed = await reportFailedUpdate(ipc);

    const info = await _resolveUpdate(ipc);
    if (!info || failed) return info || null;

    const dismissed = Storage.getUpdateDismissed();
    if (dismissed.version === info.latest && dismissed.muted) {
        clientLogger.info('update', `v${info.latest} available but muted — offered in Settings only`);
        return info;
    }

    clientLogger.info('update', `update available: v${info.current} -> v${info.latest}, prompting`);
    promptUpdate(info.current, info.latest);
    return info;
}

/** The fetch + semver compare. `{current, latest}` when newer, else null. */
async function _resolveUpdate(ipc) {
    // ponytail: dev-only escape hatch to exercise the real dialog + mute in a build
    // where the portable gate would skip the fetch. Never set in prod. It flows through
    // the SAME compare + mute below, so it faithfully tests both surfaces.
    let devForce = null;
    try { devForce = localStorage.getItem('mpi_dev_force_update'); } catch { /* ignore */ }

    let current, latest;
    if (devForce) {
        current = APP_VERSION;
        latest = devForce;
        clientLogger.info('update', `DEV force-update flag set — simulating latest=${latest}`);
    } else {
        if (!ipc) { clientLogger.info('update', 'no IPC (browser) — update check skipped'); return null; }
        let result;
        try {
            result = await ipc.invoke('check-for-update');
        } catch (err) {
            clientLogger.warn('update', `check-for-update IPC failed: ${err.message}`);
            return null;
        }
        if (!result?.portable) return null;          // dev/non-portable — main already logged
        if (!result.ok || !result.latest) return null; // fetch failed — main already logged
        current = result.current;
        latest = result.latest;
    }

    if (compareSemVer(latest, current) <= 0) {
        clientLogger.info('update', `up to date (current=${current} latest=${latest})`);
        return null;
    }
    return { current, latest };
}

// MPI-422: an update runs with the app closed, so a failure has no window to land in.
// The updater relaunches us either way and leaves update/update-result.json behind on
// failure; main reads-and-deletes it. Without this the user presses Update, waits, and
// gets a silent no-op with nothing to report.
async function reportFailedUpdate(ipc) {
    if (!ipc) return false;
    let result;
    try {
        result = await ipc.invoke('update-last-result');
    } catch (err) {
        clientLogger.warn('update', `update-last-result IPC failed: ${err.message}`);
        return false;
    }
    if (!result || result.ok) return false;

    clientLogger.warn('update', `previous update failed: ${result.error || 'unknown'}`);
    await showUpdateError(
        'Update failed',
        `The last update did not complete, so you are still on v${APP_VERSION}.\n\n`
        + `${result.error || 'No reason was recorded.'}\n\n`
        + `Full details are in update/update.log next to the app. You can try again from `
        + `Settings, or download the latest build manually.`,
    );
    return true;
}

/**
 * Launch the updater. Shared by the boot popup and the Settings row so there is one
 * path, and so a failure is reported the same way from both. On success the app
 * closes — nothing after this runs.
 *
 * The dismissal record is deliberately NOT cleared here: it is keyed by version, so
 * once the update lands it no longer matches anything and is inert.
 */
export async function runUpdate(latest) {
    clientLogger.info('update', `user accepted update to v${latest} — launching updater`);
    const ipc = getIpc();
    if (!ipc) {
        await showUpdateError('Update unavailable',
            'This build cannot update itself — the in-app updater only runs in the portable desktop build. '
            + 'Download the latest build from GitHub instead.');
        return false;
    }
    try {
        const r = await ipc.invoke('run-update');
        if (r?.ok) return true;
        clientLogger.warn('update', `run-update failed: ${r?.error || 'unknown'}`);
        await showUpdateError('Update could not start', r?.error || 'No reason was recorded.');
    } catch (err) {
        clientLogger.warn('update', `run-update IPC failed: ${err.message}`);
        await showUpdateError('Update could not start', err.message);
    }
    return false;
}

// shell.js is imported lazily: it pulls in the whole component tree, and this module
// is loaded from init.js before the shell is up.
async function showUpdateError(title, text) {
    const { showError } = await import('../shell.js');
    showError(title, text);
}

function promptUpdate(current, latest) {
    const dialog = MpiOkCancel.mount(document.createElement('div'), {
        title: 'Update available',
        text: `A new version of Cubric Vision is available.\n\n`
            + `You have v${current}. Latest is v${latest}.\n\n`
            + `Update now? The app will close, update, and reopen. `
            + `You can also update later from Settings, where an available update is `
            + `always listed at the top.`,
        okLabel: 'Update now',
        cancelLabel: 'Later',
        checkbox: { label: "Don't ask again", checked: false },
    });

    dialog.on('ok', () => runUpdate(latest));

    dialog.on('cancel', ({ checkboxChecked }) => {
        const muted = checkboxChecked === true;
        Storage.setUpdateDismissed({ version: latest, muted });
        clientLogger.info('update', muted
            ? `user muted v${latest} — Settings still offers it`
            : `user deferred v${latest} — will ask again next boot`);
    });

    dialog.el.show();
}
