// Holds all mutable application state, shared globally 
// across modules via a single exported object.
export const state = {
    // ── Existing prompt-builder state ──────────────────────────────────────────
    g_currentGuide: null,
    g_promptEN: "",
    g_promptCN: "",
    g_promptEN_JSON: "",
    g_promptCN_JSON: "",
    g_currentTab: "en",
    g_originalText: "",
    g_wizardStep: 1,
    g_images: [],
    g_imageContext: "",
    g_isAnalyzing: false,
    g_selectedModel: null,
    g_imagesDirty: false,
    g_currentGenFolder: null,
    g_formValues: {},
    g_isFirstLoad: true,
    g_abortControllers: {},
    g_selectedModelType: 'image',

    // ── Stage 1: App shell / project system ───────────────────────────────────
    currentProject: null,       // Active project object (from project.json)
    currentPage: 'landing',     // 'landing' | 'project' | 'tool' | 'media' | 'settings' | 'about'
    currentParams: {},          // Extra router params
    previousPage: null,         // For "Back" navigation
    previousParams: {},         // For "Back" navigation
    currentTool: 'promptBuilder', // Active tool name
    generatorPrompt: '',        // Prompt to pre-fill in the Generator tool
    generatorSeed: null,        // Seed to pre-fill in the Generator tool
    pendingImageUrl: null,      // Image URL to inject into the next tool's image input
    allModels: [],              // Currently available local models and their status
    allComfyWorkflows: [],      // Currently available ComfyUI workflows (SDXL, etc.)
    toolModelIds: {},           // Selected model ID per tool (e.g. {'descriptor': 'qwen3...'})
    currentLoadedModel: null,   // Model currently resident in VRAM
    descriptorImages: [],       // Persistent images for the Descriptor tool
    comfyRootPath: null,        // Custom path to an external ComfyUI installation
    activeSubPage: null,        // { toolName, isManual } if a subpage (provisioning/advanced) is open
    defaultComfySettings: {     // Template for per-tool Advanced Settings overlay
        model: null,
        modelStrength: 1.0,
        clipStrength: 1.0,
        loras: [
            { name: null, modelStrength: 1.0, clipStrength: 1.0 },
            { name: null, modelStrength: 1.0, clipStrength: 1.0 },
            { name: null, modelStrength: 1.0, clipStrength: 1.0 },
            { name: null, modelStrength: 1.0, clipStrength: 1.0 },
            { name: null, modelStrength: 1.0, clipStrength: 1.0 },
            { name: null, modelStrength: 1.0, clipStrength: 1.0 }
        ],
        upscaleModel: null 
    },
    toolComfySettings: {},      // Persistent selections per tool (e.g. {'generator': {...}, 'detailer': {...}})
    upscaleModels: [],          // Shared list of available upscalers
    detailerInputImage: null,   // Image to Detail (URL or base64)
    detailerInputMask: null,    // Mask for Detailer (base64 data URL)
    detailerMaskMode: 'manual', // 'auto' | 'manual'
    detailerSelectedMasks: '',  // Comma-separated string of indices for Auto Masking (e.g. "1,3,5")
    detailerDetectionMode: 'box', // 'box' | 'segment'
    upscalerInputImage: null,
    upscalerAutoGrid: false,
    upscalerGridH: 1,
    upscalerGridV: 1,
    upscalerCreative: true,
    downloadingWorkflows: {},   // Tracks ongoing downloads: { workflowId: { msg, current, total } }
    isLightMode: false,         // Modern theme persistence
    
    // ── Crop & Extract persistent state ───────────────────────────────
    cropExtractVideoUrl: null,
    cropExtractTime: 0,
    cropExtractVolume: 1.0,
    cropExtractMuted: false,
    cropExtractRatio: null,

    // ── Running tool tracking (for sidebar indicator + Ctrl+Enter guard) ──
    // Set to the tool's name string while a run is active; null when idle.
    runningComfyTool: null,  // e.g. 'generator' | 'detailer' | 'upscaler'
    runningLlmTool: null,    // e.g. 'llm' | 'translator' | 'descriptor' | 'jsonFormatter'
};

/**
 * Helper to get or initialize per-tool Comfy settings
 */
export function getToolComfySettings(toolName) {
    if (!state.toolComfySettings[toolName]) {
        // Deep clone the template
        state.toolComfySettings[toolName] = JSON.parse(JSON.stringify(state.defaultComfySettings));
    }
    return state.toolComfySettings[toolName];
}
