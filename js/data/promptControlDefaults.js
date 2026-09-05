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
    // MiniMax H3 turbo toggle (Input_is_Turbo, MPI-505): OFF = 25 steps (res_multistep,
    // simple) with the turbo-distill LoRA held at 0.2, ON = 6 steps (euler, beta) with it
    // raised to 0.75. 204s -> 96s at 864x480 warm. Stored perModel, same reasoning as
    // krea2Turbo. (Steps and the 0.2 non-turbo strength are MPI-550; the 6-step/0.75 turbo
    // weight is MPI-508.)
    //
    // Default OFF, the OPPOSITE of krea2Turbo, and deliberately so: turbo quality here
    // sits slightly BELOW the 25-step path (the user's own judgement), so the default
    // has to be the good one and speed is the opt-in. Krea2's turbo is a wash on
    // quality, which is why that one defaults ON.
    h3Turbo: false,
    // Control adherence (Input_Control_strength MpiFloat). What it lands on differs by
    // model — a control-LoRA's `strength` on Krea2/Klein, a ControlNet's on Chroma/SDXL —
    // but the meaning is the same everywhere: 1.0 = full (what each graph bakes and what
    // the op shipped with), lower = the control map guides more loosely, 0 = the control
    // stops applying at all and the op degenerates into a plain generate.
    controlStrength: 1.0,
    // Which structure the `control` op copies — a CONTROL_TYPES id, not an index (the
    // graph index comes from that map). 'depth' is every control-capable model's first
    // declared type, so this default is always in range; a model that somehow lacks it
    // falls back to its own first entry when the picker mounts.
    controlType: 'depth',
    // refImageSize (MiniMax H3 ref2va, Input_Refs.ref_image_size) was REMOVED in MPI-687
    // along with its "Reference detail" radio. Both values are still real and still baked
    // — 'match' on stage 1, 'max' on the two-pass refine encoder — the app just no longer
    // asks. The cost measurement that justified the default stands: reference tokens ride
    // EVERY sampling step, so 'max' on stage 1 scales badly with nine references, while on
    // the refine's 3 steps it costs +13% once and fixes reference colour and identity.
    // Removed rather than defaulted because a control with one good answer is noise.
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

