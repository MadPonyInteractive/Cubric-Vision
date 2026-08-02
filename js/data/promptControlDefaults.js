export const PROMPT_CONTROL_DEFAULTS = Object.freeze({
    qualityTier: 'medium',
    ratio: '1:1',
    orientation: 'portrait',
    batch: 1,
    previewStage: false,
    duration: 5,
    motionIntensity: 0,
    useGrid: false,
    upscaleFactor: 1.5,
    denoise: 0.2,
    // PiD upscaler (Input_Type MpiAnySwitch, 1-indexed): 1=flux, 2=sd3, 3=qwen, 4=sdxl.
    // Default 1 (flux) matches the workflow's baked select.
    pidVariant: 1,
    // PiD output size (Input_Resolution MpiAnySwitch, 1-indexed): 1=1K, 2=2K, 3=4K.
    // Default 3 (4K = native PiD, no downscale) matches the workflow's baked select.
    pidResolution: 3,
    // Qwen-Edit tier (Input_Tier MpiInt, 1-indexed): 1=Quality (raw ~20-step, no
    // accelerator), 2=Turbo (8-step Lightning LoRA), 3=Hyper (4-step Lightning LoRA).
    // Default 1 (Quality) matches the workflow's baked Input_Tier value.
    qwenTier: 1,
    // Krea2 turbo toggle (Input_is_Turbo, a BOOLEAN since MPI-365 — it was the
    // 1-indexed Input_Tier int until the master template dropped the High/Balanced
    // sampler chains): OFF = quality (25 steps @ cfg 3.5 + a 3-step accelerator pass),
    // ON = fast (8 steps + the same 3-step pass, the accelerator LoRA reconstructing
    // Turbo at cfg 1). Boolean here AND at injection now — no int mapping left. Stored
    // perModel (a MODE, not a per-op parameter) so it holds across every Krea2 op.
    //
    // Default ON: fast is the better first impression — a new user's first generation
    // should not be the slowest one the model offers, and the quality tier is one click
    // away. The template bakes a safe default; the injected value always wins, so the
    // bake only shows through if this control fails to mount. (MPI-316, MPI-365)
    krea2Turbo: true,
    // LTX audio mode: 'reference' = voice-ID from a reference clip,
    // 'original' = use the input audio directly. Default reference (headline mode).
    audioMode: 'reference',
    // LTX "generate audio" toggle (Input_Use_Audio). ON = the model generates
    // its own audio track from the prompt. Disabled when an audio clip is present
    // (the audioMode radio drives audio then). Default ON to match the baked gate.
    useAudio: true,
    // Style-LoRA set (Input_Style_Selector.selector, 0-indexed): 0 = No Style, 1..N select a
    // mutually-exclusive style LoRA and its trigger phrase. Default 0 matches the
    // workflow's baked value and keeps a fresh prompt unstyled.
    styleSelect: 0,
    // Style strength (Input_Style_Selector.strength_model) — fed to the selected slot's
    // MpiMath gate. Inert at styleSelect 0 (the slider is disabled there).
    stylization: 1.0,
    // Prompt enhancer (Input_Enhance_Prompt MpiIfElse). OFF by default: it costs a
    // full autoregressive pass through the text encoder's LM head before sampling.
    enhancePrompt: false,
});

