export const PROMPT_CONTROL_DEFAULTS = Object.freeze({
    qualityTier: 'medium',
    ratio: '1:1',
    orientation: 'portrait',
    batch: 1,
    previewStage: false,
    duration: 5,
    motionIntensity: 0,
    useGrid: false,
    upscaleFactor: 2,
    denoise: 0.2,
    // PiD upscaler (Input_Type MpiAnySwitch, 1-indexed): 1=flux, 2=sd3, 3=qwen, 4=sdxl.
    // Default 1 (flux) matches the workflow's baked select.
    pidVariant: 1,
    // PiD output size (Input_Resolution MpiAnySwitch, 1-indexed): 1=1K, 2=2K, 3=4K.
    // Default 3 (4K = native PiD, no downscale) matches the workflow's baked select.
    pidResolution: 3,
    // LTX audio mode: 'reference' = voice-ID from a reference clip,
    // 'original' = use the input audio directly. Default reference (headline mode).
    audioMode: 'reference',
    // LTX "generate audio" toggle (Input_Use_Audio). ON = the model generates
    // its own audio track from the prompt. Disabled when an audio clip is present
    // (the audioMode radio drives audio then). Default ON to match the baked gate.
    useAudio: true,
    // Style-LoRA set (Input_Style MpiInt, 0-indexed): 0 = No Style, 1..N select a
    // mutually-exclusive style LoRA and its trigger phrase. Default 0 matches the
    // workflow's baked value and keeps a fresh prompt unstyled.
    styleSelect: 0,
    // Style strength (Input_Stylization MpiFloat) — fed to the selected slot's
    // MpiMath gate. Inert at styleSelect 0 (the slider is disabled there).
    stylization: 1.0,
    // Prompt enhancer (Input_Enhance_Prompt MpiIfElse). OFF by default: it costs a
    // full autoregressive pass through the text encoder's LM head before sampling.
    enhancePrompt: false,
});

