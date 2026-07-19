/**
 * Plugin registry — the THIRD entity, alongside MODELS (js/data/models.js) and
 * APPS (js/data/appsRegistry.js).
 *
 * A PLUGIN is a capability other surfaces call, not a thing the user generates
 * with and not a tile in the App Library. The image describer is the archetype:
 * it owns a 5.24GB encoder, is triggered from a gallery/history context menu,
 * and produces text rather than media.
 *
 * Why not a ModelDef with an `isPlugin` flag: a ModelDef forces dead fields
 * (workflows / qualityTiers / mediaType / gen_speed / ratio tables) AND every
 * existing model consumer would have to learn to skip flagged entries.
 * Why not an app: apps are App-Library tiles with an inputSchema and a
 * uiComponent; a right-click action has neither.
 *
 * The one thing a plugin MUST share with an app is GC protection — see
 * `pluginRequiredDepIds()` and its two call sites in routes/downloadManager.js.
 * A dep owned by neither a model nor an app is invisible to both uninstall
 * guards and dies on the next unrelated model uninstall.
 *
 * @typedef {Object} PluginDef
 * @property {string}   id            Stable id, used for dep-queue keys.
 * @property {string}   title         Human label (context menus, install prompts).
 * @property {string}   description   One line, shown under the title in the Library row.
 * @property {string[]} requiredDeps  assetDeps ids this plugin owns.
 * @property {string}   operation     commandRegistry op key this plugin runs.
 */

/** @type {PluginDef[]} */
export const PLUGINS = [
    {
        id: 'image-describer',
        title: 'Image Describer',
        description: 'Unlocks "Describe image" on the gallery and history right-click menus.',
        requiredDeps: ['qwen3vl-abliterated-clip'],
        operation: 'imageDescribe',
    },
];

/** Namespaces download-queue / dep-status keys so they cannot collide with
 *  model ids or the app registry's `app:<id>` keys. */
export const pluginDepKey = (pluginId) => `plugin:${pluginId}`;

/** Flat union of every plugin's deps. Unconditional, exactly like the app twin:
 *  a plugin has no install state of its own — its deps ARE its install state,
 *  so gating protection on their presence would be circular. */
export const pluginRequiredDepIds = () =>
    new Set(PLUGINS.flatMap(p => p.requiredDeps || []));

/** @param {string} id @returns {PluginDef|undefined} */
export const getPlugin = (id) => PLUGINS.find(p => p.id === id);

// ── Install state ─────────────────────────────────────────────────────────────
// Mirrors the app dep-status cache. A plugin has no `installed` flag of its own:
// its deps ARE its install state, so availability is derived, never stored.
// Populated by syncModelInstalled() in modelRegistry.js, which rides the same
// id-agnostic /comfy/models/check the models and apps use.

/** @type {Map<string, Map<string, boolean>>} pluginId → (depId → onDisk) */
const _pluginDepStatus = new Map();

/** @param {string} pluginId @param {Map<string, boolean>} depMap */
export const setPluginDepStatus = (pluginId, depMap) =>
    _pluginDepStatus.set(pluginId, depMap);

/** @param {string} pluginId @returns {Map<string, boolean>|null} */
export const getPluginDepStatus = (pluginId) =>
    _pluginDepStatus.get(pluginId) ?? null;

/** The `{id, deps}` slices to fold into the /comfy/models/check payload. */
export const pluginDepUniverse = () =>
    PLUGINS.filter(p => (p.requiredDeps || []).length).map(p => ({
        id: pluginDepKey(p.id),
        pluginId: p.id,
        depIds: p.requiredDeps || [],
    }));

/**
 * Is every required dep on disk?
 * Unknown status (no check has run yet) reads as NOT installed — the safe
 * default: offering Install for something already present is recoverable,
 * silently running a workflow whose weight is missing is not.
 *
 * @param {string|PluginDef} pluginOrId
 * @returns {{ installed: boolean, missing: string[] }}
 */
export function pluginAvailability(pluginOrId) {
    const plugin = typeof pluginOrId === 'string' ? getPlugin(pluginOrId) : pluginOrId;
    if (!plugin) return { installed: false, missing: [] };
    const status = getPluginDepStatus(plugin.id);
    const missing = (plugin.requiredDeps || []).filter(id => status?.get(id) !== true);
    return { installed: missing.length === 0, missing };
}

/** The plugin that owns an op, if any. Lets a context-menu action find its
 *  deps without hardcoding the plugin id at the call site. */
export const pluginForOperation = (operation) =>
    PLUGINS.find(p => p.operation === operation);
