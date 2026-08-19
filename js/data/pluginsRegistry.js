/**
 * Plugin registry — the THIRD entity, alongside MODELS (js/data/models.js) and
 * FLOWS (js/data/flowsRegistry.js).
 *
 * A PLUGIN is a capability other surfaces call, not a thing the user generates
 * with and not a tile in the Flow Library. The image describer is the archetype:
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
 * @property {PluginUpscaleEntry} [upscale]  Contributes an ENTRY to the EXISTING History
 *                                   Upscale dropdown (MPI-580). Omit and the plugin is
 *                                   invisible there, exactly like image-describer.
 *
 * @typedef {Object} PluginUpscaleEntry
 * @property {Array<'image'|'video'>} kinds  Which MpiToolOptionsUpscale `kind` lists it.
 *                                   This is the WHOLE of the both-kinds generalisation:
 *                                   the video upscaler (MPI-579) declares `['video']`, the
 *                                   PiD plugins (MPI-507) declare `['image']`, and neither
 *                                   writes any mechanism.
 * @property {string}   [label]      Dropdown label; falls back to `title`.
 * @property {Object[]} [fields]     Controls revealed when the entry is selected, in the
 *                                   `FlowStepField` vocabulary (flowsRegistry.js, MPI-572)
 *                                   — same shapes, same payload law: a bare id reaches the
 *                                   op as a top-level input, an `Input_`-prefixed id is
 *                                   routed into `injectionParams`. A slider may add
 *                                   `mapTo: [lo, hi]` to show 0–1 while sending the real
 *                                   range; the mechanism owns that primitive, the plugin
 *                                   owns the numbers.
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
const PLUGIN_KEY_PREFIX = 'plugin:';
export const pluginDepKey = (pluginId) => `${PLUGIN_KEY_PREFIX}${pluginId}`;

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

// ── Dropdown contribution (MPI-580) ───────────────────────────────────────────
// The Upscale dropdown already exists (MpiToolOptionsUpscale, shared by the image
// and video tools via `kind`); a plugin contributes an ENTRY to it, never a new
// dropdown. Selection is carried by the plugin's dep key, so a plugin entry can
// never be confused with an upscale-model filename.

/**
 * Installed plugins contributing an entry to one Upscale dropdown kind.
 * NOT installed = absent, matching the describeAction gate: offering a control that
 * fails deep inside ComfyUI with a missing weight is the worse outcome.
 *
 * @param {'image'|'video'} kind
 * @returns {PluginDef[]}
 */
export const upscalePluginsFor = (kind) =>
    PLUGINS.filter(p => p.upscale?.kinds?.includes(kind) && pluginAvailability(p).installed);

/** The dropdown option for a contributing plugin. Its value is the dep key
 *  (`plugin:<id>`), which is also what tells dispatch it is not a model file. */
export const upscalePluginOption = (plugin) => ({
    label: plugin.upscale?.label || plugin.title,
    value: pluginDepKey(plugin.id),
});

/** The plugin behind a dropdown value, or undefined for a model filename / None. */
export const pluginFromDepKey = (value) =>
    (typeof value === 'string' && value.startsWith(PLUGIN_KEY_PREFIX))
        ? getPlugin(value.slice(PLUGIN_KEY_PREFIX.length))
        : undefined;
