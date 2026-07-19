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
 * @property {string[]} requiredDeps  assetDeps ids this plugin owns.
 * @property {string}   operation     commandRegistry op key this plugin runs.
 */

/** @type {PluginDef[]} */
export const PLUGINS = [
    {
        id: 'image-describer',
        title: 'Image Describer',
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

/** The plugin that owns an op, if any. Lets a context-menu action find its
 *  deps without hardcoding the plugin id at the call site. */
export const pluginForOperation = (operation) =>
    PLUGINS.find(p => p.operation === operation);
