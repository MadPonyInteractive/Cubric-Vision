/**
 * routes/gitProvision.js — Ensure a usable `git` for Linux/macOS engine install.
 *
 * comfy-cli (`comfy install`) clones ComfyUI + custom nodes through GitPython,
 * which hard-requires a real `git` binary. The Windows engine path uses a
 * prebuilt archive and never touches git, so this module is Linux/macOS only.
 *
 * Strategy ("use it, or install it" — no bundled git):
 *   1. findGit()     — use host git if present (PATH + common locations).
 *   2. installGit()  — if absent, install via the host package manager,
 *                      elevating with pkexec (a GUI password dialog that works
 *                      even on a no-terminal launch) and falling back to sudo
 *                      only when a TTY is attached. macOS uses Homebrew (no
 *                      sudo) and otherwise points at `xcode-select --install`.
 *   3. ensureGit()   — findGit() || installGit(); throws an actionable error
 *                      when neither works (offline, no package manager, no
 *                      elevation), so the install screen can surface the exact
 *                      manual command instead of a cryptic GitPython dump.
 *
 * The resolved path is wired into the comfy-install env as
 * GIT_PYTHON_GIT_EXECUTABLE so GitPython uses it without needing PATH.
 */

'use strict';

const { spawn, spawnSync } = require('child_process');
const logger = require('./logger');

/** Common absolute git locations to probe when PATH lookup misses. */
const COMMON_GIT_PATHS = [
    '/usr/bin/git',
    '/usr/local/bin/git',
    '/opt/homebrew/bin/git', // Apple Silicon Homebrew
    '/Library/Developer/CommandLineTools/usr/bin/git', // macOS Xcode CLT
];

/**
 * Linux package managers in preference order. Each entry knows how to install
 * git non-interactively; elevation is added separately by installGit().
 */
const LINUX_PACKAGE_MANAGERS = [
    { bin: 'apt-get', install: ['apt-get', 'install', '-y', 'git'] },
    { bin: 'dnf', install: ['dnf', 'install', '-y', 'git'] },
    { bin: 'pacman', install: ['pacman', '-S', '--noconfirm', 'git'] },
    { bin: 'zypper', install: ['zypper', '--non-interactive', 'install', 'git'] },
];

/** True when `bin` resolves on PATH. */
function _hasBinary(bin) {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    const res = spawnSync(probe, [bin], { stdio: 'ignore' });
    return res.status === 0;
}

/**
 * Locate a working git binary. Returns its absolute path, or null.
 * A binary "works" when `<git> --version` exits 0.
 */
function findGit() {
    const candidates = ['git', ...COMMON_GIT_PATHS];
    for (const candidate of candidates) {
        const res = spawnSync(candidate, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
        if (res.status === 0) {
            // Resolve the bare name to an absolute path for GIT_PYTHON_GIT_EXECUTABLE.
            if (candidate === 'git') {
                const probe = process.platform === 'win32' ? 'where' : 'which';
                const found = spawnSync(probe, ['git'], { encoding: 'utf8' });
                const resolved = (found.stdout || '').split(/\r?\n/)[0].trim();
                return resolved || 'git';
            }
            return candidate;
        }
    }
    return null;
}

/**
 * Pick the host package manager. Returns { bin, install } for Linux, the
 * sentinel { bin: 'brew' } / { bin: 'xcode' } for macOS, or null when none.
 */
function detectPackageManager() {
    if (process.platform === 'darwin') {
        if (_hasBinary('brew')) return { bin: 'brew', install: ['brew', 'install', 'git'] };
        return { bin: 'xcode', install: ['xcode-select', '--install'] };
    }
    for (const pm of LINUX_PACKAGE_MANAGERS) {
        if (_hasBinary(pm.bin)) return pm;
    }
    return null;
}

/** Human-facing manual command for the detected (or generic) package manager. */
function manualInstallHint(pm) {
    if (!pm) {
        return process.platform === 'darwin'
            ? 'Install git via Xcode Command Line Tools: xcode-select --install'
            : 'Install git with your distribution package manager, e.g. sudo apt install git';
    }
    if (pm.bin === 'brew') return 'brew install git';
    if (pm.bin === 'xcode') return 'xcode-select --install';
    return `sudo ${pm.install.join(' ')}`;
}

/** Promisified spawn that streams output lines through onStatus + the log. */
function _runInstall(cmd, args, onStatus) {
    return new Promise((resolve, reject) => {
        logger.info('engine', `[git-install] ${cmd} ${args.join(' ')}`);
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const onLine = (level, buf) => {
            for (const raw of buf.toString().split(/\r?\n/)) {
                const line = raw.trim();
                if (!line) continue;
                logger[level === 'err' ? 'warn' : 'info']('engine', `[git-install] ${line}`);
            }
        };
        child.stdout.on('data', (d) => onLine('out', d));
        child.stderr.on('data', (d) => onLine('err', d));
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`git install failed (exit ${code})`))));
    });
}

/**
 * Install git via the host package manager, elevating as needed.
 * Returns the new git path, or throws with an actionable message.
 */
async function installGit({ onStatus = () => {} } = {}) {
    const pm = detectPackageManager();
    if (!pm) {
        throw new Error(`git is required but no supported package manager was found. ${manualInstallHint(null)}`);
    }

    // macOS: brew needs no elevation; xcode-select opens its own GUI installer.
    if (pm.bin === 'brew') {
        onStatus('Installing git via Homebrew…');
        await _runInstall(pm.install[0], pm.install.slice(1), onStatus);
    } else if (pm.bin === 'xcode') {
        // xcode-select --install triggers a system dialog and returns immediately;
        // it cannot be awaited to completion, so we cannot auto-continue here.
        throw new Error(
            'git is provided by the Xcode Command Line Tools, which are not installed. '
            + 'Run "xcode-select --install", complete the dialog, then retry.',
        );
    } else {
        // Linux: prefer pkexec (graphical password prompt — works with no terminal),
        // fall back to sudo only when a TTY is attached.
        if (_hasBinary('pkexec')) {
            onStatus('Installing git (you may be prompted for your password)…');
            await _runInstall('pkexec', pm.install, onStatus);
        } else if (process.stdout.isTTY && _hasBinary('sudo')) {
            onStatus('Installing git (enter your password in the terminal)…');
            await _runInstall('sudo', pm.install, onStatus);
        } else {
            throw new Error(
                `git is required and could not be installed automatically (no graphical elevation available). `
                + `Install it manually: ${manualInstallHint(pm)}, then retry.`,
            );
        }
    }

    const gitPath = findGit();
    if (!gitPath) {
        throw new Error(`git install reported success but git is still not found. Try manually: ${manualInstallHint(pm)}`);
    }
    return gitPath;
}

/**
 * Ensure a usable git and return its absolute path.
 * Windows callers should not use this — the Windows engine path never needs git.
 */
async function ensureGit({ onStatus = () => {} } = {}) {
    const existing = findGit();
    if (existing) {
        logger.info('engine', `[git-install] using host git: ${existing}`);
        return existing;
    }
    onStatus('git not found — installing…');
    return installGit({ onStatus });
}

module.exports = { findGit, detectPackageManager, manualInstallHint, installGit, ensureGit };
