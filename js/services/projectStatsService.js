/**
 * projectStatsService — fetches asset count + bytes-on-disk for the current
 * project (and optionally a single group's history items).
 *
 * Listens to media add/delete events and refreshes automatically. Writes
 * results to `state.projectStats` / `state.historyStats`.
 *
 * Public API:
 *   refreshProject()         — refetch whole-project stats (uses state.currentProject)
 *   refreshGroup(group)      — refetch a group's stats (sums its history items)
 *   start()                  — wire event listeners (call once at app boot)
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { clientLogger } from './clientLogger.js';

let _started = false;
let _projectInflight = null;
let _groupInflight = new Map(); // groupId → AbortController

/**
 * Fetch raw stats for a project (or one of its groups) from the backend.
 * No state writes — caller decides what to do with the result.
 *
 * @param {Object} opts
 * @param {string} opts.projectId
 * @param {string} opts.folderPath
 * @param {string} [opts.groupId]
 * @param {string[]} [opts.itemIds]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{count:number, bytes:number}>}
 */
export async function fetchStats({ projectId, folderPath, groupId, itemIds, signal } = {}) {
    if (!projectId || !folderPath) return { count: 0, bytes: 0 };
    const params = new URLSearchParams({ folderPath });
    if (groupId) params.set('groupId', groupId);
    if (itemIds && itemIds.length) params.set('itemIds', itemIds.join(','));
    const url = `/project-stats/${encodeURIComponent(projectId)}?${params.toString()}`;
    const r = await fetch(url, { signal });
    const data = await r.json();
    if (!data?.success) return { count: 0, bytes: 0 };
    return { count: data.count || 0, bytes: data.bytes || 0 };
}

export async function refreshProject() {
    const project = state.currentProject;
    if (!project?.id || !project?.folderPath) {
        state.projectStats = { count: 0, bytes: 0 };
        return;
    }
    if (_projectInflight) _projectInflight.abort();
    const ac = new AbortController();
    _projectInflight = ac;
    try {
        const stats = await fetchStats({
            projectId: project.id,
            folderPath: project.folderPath,
            signal: ac.signal,
        });
        state.projectStats = stats;
    } catch (e) {
        if (e.name !== 'AbortError') clientLogger.warn('projectStatsService', 'refreshProject failed:', e);
    } finally {
        if (_projectInflight === ac) _projectInflight = null;
    }
}

export async function refreshGroup(group) {
    const project = state.currentProject;
    if (!project?.id || !project?.folderPath || !group?.id) {
        state.historyStats = { groupId: null, count: 0, bytes: 0 };
        return;
    }
    const ids = (group.history || []).map(h => h.id).filter(Boolean);
    if (!ids.length) {
        state.historyStats = { groupId: group.id, count: 0, bytes: 0 };
        return;
    }
    const prev = _groupInflight.get(group.id);
    if (prev) prev.abort();
    const ac = new AbortController();
    _groupInflight.set(group.id, ac);
    try {
        const stats = await fetchStats({
            projectId: project.id,
            folderPath: project.folderPath,
            groupId: group.id,
            itemIds: ids,
            signal: ac.signal,
        });
        state.historyStats = { groupId: group.id, count: stats.count, bytes: stats.bytes };
    } catch (e) {
        if (e.name !== 'AbortError') clientLogger.warn('projectStatsService', 'refreshGroup failed:', e);
    } finally {
        if (_groupInflight.get(group.id) === ac) _groupInflight.delete(group.id);
    }
}

export function start() {
    if (_started) return;
    _started = true;

    // Refetch project stats whenever media changes.
    /* eslint-disable mpi/require-destroy-on-events -- app-lifetime listeners; service starts once at boot */
    Events.on('project:stats-dirty', () => refreshProject());
    Events.on('media:imported', () => refreshProject());
    Events.on('generation:complete', () => refreshProject());
    Events.on('media:deleted', () => refreshProject());

    // Refetch group stats when its history changes (caller emits with group).
    Events.on('history:stats-dirty', ({ group } = {}) => {
        if (group) refreshGroup(group);
    });

    // Reset stats on project switch.
    Events.on('project:changed', () => {
        state.projectStats = { count: 0, bytes: 0 };
        state.historyStats = { groupId: null, count: 0, bytes: 0 };
        refreshProject();
    });
    /* eslint-enable mpi/require-destroy-on-events */
}
