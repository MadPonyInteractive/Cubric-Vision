/**
 * engineGate.js — "is there anything to generate WITH?" (MPI-390)
 *
 * The RunPod escape hatch on the install modal makes "no local engine at all" a
 * reachable state for the first time. With no Pod connected, dispatch falls back
 * to local (`forceLocal ? 'local' : isRemote() ? 'remote' : 'local'`), so every
 * graph op dies on the engine guard in routes/comfy.js with "Provision engine
 * first" — the opposite of the advice a deliberate skipper needs.
 *
 * Gated at the THREE doors out of the landing page — opening a project, the
 * Model Library, and the App Library — rather than at each thing that would
 * fail inside them. The fine-grained alternative was counted and rejected: it
 * needs a guard on Gallery card open, App Generate, PromptBox Run, right-click
 * Describe, and one more for every tool added later. Five and growing, each one
 * a chance to miss one. Three doors cannot be forgotten.
 *
 * This costs the user nothing, because "Open in file system" lives on the
 * landing-page project right-click: every image and video stays reachable
 * without opening a project at all.
 *
 * The ladder is cheapest-first so the common path does no I/O at all.
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { remoteEngineClient } from './remoteEngineClient.js';
import { clientLogger } from './clientLogger.js';

const NO_ENGINE_MESSAGE =
    'No engine to generate with. Connect a Pod in Settings → RunPod, or turn off '
    + '"Skip the local engine install" there to install ComfyUI locally.';

/**
 * True when there is no engine available to dispatch to.
 *
 * 1. `skipLocalEngine` off → the boot gate guaranteed a local engine. Allow.
 * 2. Pod connected         → everything routes remote. Allow.
 * 3. A local engine exists anyway — the user toggled the skip ON while already
 *    having one installed. The skip means "don't install", not "don't use". Allow.
 * 4. Otherwise             → no engine.
 *
 * Fails OPEN (returns false) when the version check errors: blocking a user
 * because a health check hiccuped is worse than letting them meet the engine
 * error they would have met anyway.
 *
 * @returns {Promise<boolean>}
 */
export async function hasNoEngine() {
    if (!(state.runpodConfig || {}).skipLocalEngine) return false;

    try {
        await remoteEngineClient.refresh();
    } catch (_) { /* refresh failed — fall through; isRemote() uses last state */ }
    if (remoteEngineClient.isRemote()) return false;

    try {
        const res = await fetch('/engine/version-check');
        const data = await res.json();
        return data.needsInstall === true;
    } catch (err) {
        clientLogger.warn('engineGate', 'version-check failed — allowing through', err);
        return false;
    }
}

/**
 * `hasNoEngine()` plus the user-facing warning. Call sites read as a guard:
 * `if (await blockedByNoEngine()) return;`
 *
 * @returns {Promise<boolean>} true when the caller should abort.
 */
export async function blockedByNoEngine() {
    if (!(await hasNoEngine())) return false;
    Events.emit('ui:warning', { message: NO_ENGINE_MESSAGE });
    return true;
}
