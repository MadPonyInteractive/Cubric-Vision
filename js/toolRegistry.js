/**
 * toolRegistry.js — Single source of truth for all tools in MpiAiSuite.
 *
 * RULES FOR AGENTS:
 * - To add a new tool, add ONE entry here. Do not touch shell.js.
 * - Types: 'comfy' | 'llm' | 'standalone' | 'soon'
 * - 'comfy' tools get engine checks, provisioning, and advanced settings.
 * - 'llm' tools get LLM engine checks and provisioning.
 * - 'standalone' tools load directly with no engine dependency.
 * - 'soon' tools show a "Coming Soon" placeholder.
 *
 * comfyType maps to the workflow type in comfy_workflows.json:
 *   'image_generation', 'detailer', 'upscaler', etc.
 *
 * hasAdvancedSettings: controls whether the ⚙ edit button appears in the
 *   workflow selector and whether showAdvancedSettingsScreen() is accessible.
 *
 * skipModelSelector: set true for tools (e.g. promptBuilder) that don't use
 *   the per-tool workflow/model selector injected by injectModelSelector().
 */

export const TOOL_REGISTRY = {
    // ── ComfyUI Tools ──────────────────────────────────────────────────────────
    generator: {
        type: 'comfy',
        comfyType: 'image_generation',
        hasAdvancedSettings: true,
        tplId: 'tpl-generator',
        module: () => import('./tools/generator.js').then(m => m.initGenerator),
    },
    detailer: {
        type: 'comfy',
        comfyType: 'detailer',
        hasAdvancedSettings: true,
        tplId: 'tpl-detailer',
        module: () => import('./tools/detailer.js').then(m => m.initDetailer),
    },
    upscaler: {
        type: 'comfy',
        comfyType: 'upscaler',
        hasAdvancedSettings: true,
        tplId: 'tpl-upscaler',
        module: () => import('./tools/upscaler.js').then(m => m.initUpscaler),
    },

    // ── LLM Tools ─────────────────────────────────────────────────────────────
    llm: {
        type: 'llm',
        tplId: 'tpl-llm',
        module: () => import('./tools/llm.js').then(m => m.initLlm),
    },
    descriptor: {
        type: 'llm',
        tplId: 'tpl-descriptor',
        module: () => import('./tools/descriptor.js').then(m => m.initDescriptor),
    },
    translator: {
        type: 'llm',
        tplId: 'tpl-translator',
        module: () => import('./tools/translator.js').then(m => m.initTranslator),
    },
    jsonFormatter: {
        type: 'llm',
        tplId: 'tpl-jsonFormatter',
        module: () => import('./tools/jsonFormatter.js').then(m => m.initJsonFormatter),
    },

    // ── Standalone Tools ───────────────────────────────────────────────────────
    promptBuilder: {
        type: 'standalone',
        tplId: 'tpl-promptBuilder',
        skipModelSelector: true,
        module: () => import('./tools/promptBuilder.js').then(m => m.initPromptBuilder),
    },
    compare: {
        type: 'standalone',
        tplId: 'tpl-compare',
        module: () => import('./tools/compare.js').then(m => m.initCompare),
    },
    cropExtract: {
        type: 'standalone',
        tplId: 'tpl-cropExtract',
        module: () => import('./tools/cropExtract.js').then(m => m.initCropExtract),
    },

    // ── Coming Soon Stubs ──────────────────────────────────────────────────────
    editor: { type: 'soon', label: 'Editor', icon: '🎨' },
    resizer: { type: 'soon', label: 'Resizer', icon: '📐' },
    videoGenerator: { type: 'soon', label: 'Video Generator', icon: '🎬' },
    videoMotionControl: { type: 'soon', label: 'Motion Control', icon: '🙅' },
    audioGenerator: { type: 'soon', label: 'Audio Generator', icon: '🎵' },
};

// ── Derived helper sets (computed once, referenced everywhere) ─────────────────

/** Set of tool names that drive ComfyUI. Used for engine checks and provisioning. */
export const COMFY_TOOLS = new Set(
    Object.entries(TOOL_REGISTRY)
        .filter(([, t]) => t.type === 'comfy')
        .map(([name]) => name)
);

/** Set of tool names that drive the LLM (llama) engine. */
export const LLM_TOOLS = new Set(
    Object.entries(TOOL_REGISTRY)
        .filter(([, t]) => t.type === 'llm')
        .map(([name]) => name)
);

/** Set of tool names that require any engine (comfy or llm). Useful for persistent overlay logic. */
export const ENGINE_TOOLS = new Set([...COMFY_TOOLS, ...LLM_TOOLS]);

/** Set of tool names showing "Coming Soon" placeholder. */
export const COMING_SOON_TOOLS = new Set(
    Object.entries(TOOL_REGISTRY)
        .filter(([, t]) => t.type === 'soon')
        .map(([name]) => name)
);
