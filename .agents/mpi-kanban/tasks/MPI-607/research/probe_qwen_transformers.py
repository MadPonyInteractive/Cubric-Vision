"""Probe: does qwen-tts 0.1.1's transformers surface exist on the installed transformers?

qwen-tts pins transformers==4.57.3. Vision's engine is on 5.13.0, the bench on 5.9.0.
This checks every symbol qwen_tts imports, without downloading a single weight.
ASCII-only output on purpose (Windows console is cp1252).
"""
import importlib
import sys

# module -> symbols qwen_tts imports from it (harvested from the 0.1.1 wheel)
SURFACE = {
    "transformers": [
        "MimiConfig", "MimiModel", "AutoConfig", "AutoFeatureExtractor",
        "AutoModel", "AutoProcessor",
    ],
    "transformers.configuration_utils": ["PretrainedConfig", "layer_type_validation"],
    "transformers.feature_extraction_utils": ["BatchFeature"],
    "transformers.modeling_rope_utils": [
        "rope_config_validation", "ROPE_INIT_FUNCTIONS", "dynamic_rope_update",
    ],
    "transformers.processing_utils": ["ProcessingKwargs", "ProcessorMixin", "Unpack"],
    "transformers.utils": ["logging", "ModelOutput", "auto_docstring", "can_return_tuple"],
    "transformers.utils.hub": ["cached_file"],
    "transformers.utils.deprecation": ["deprecate_kwarg"],
    "transformers.utils.generic": ["check_model_inputs"],
    "transformers.modeling_utils": ["ALL_ATTENTION_FUNCTIONS", "PreTrainedModel"],
    "transformers.modeling_layers": ["GradientCheckpointingLayer"],
    "transformers.modeling_outputs": [
        "BaseModelOutputWithPast", "CausalLMOutputWithPast", "ModelOutput",
    ],
    "transformers.modeling_flash_attention_utils": ["FlashAttentionKwargs"],
    "transformers.masking_utils": ["create_causal_mask", "create_sliding_window_causal_mask"],
    "transformers.activations": ["ACT2FN"],
    "transformers.cache_utils": ["Cache", "DynamicCache"],
    "transformers.integrations": ["use_kernel_forward_from_hub"],
    "transformers.generation": ["GenerationMixin"],
}


def main():
    import transformers
    print("transformers  %s" % transformers.__version__)
    print("python        %s" % sys.version.split()[0])
    print("-" * 58)

    missing_mod, missing_sym, ok = [], [], 0
    for mod_name, symbols in SURFACE.items():
        try:
            mod = importlib.import_module(mod_name)
        except Exception as exc:
            missing_mod.append(mod_name)
            print("MODULE GONE  %-46s %s" % (mod_name, type(exc).__name__))
            continue
        for sym in symbols:
            if hasattr(mod, sym):
                ok += 1
            else:
                missing_sym.append("%s.%s" % (mod_name, sym))
                print("SYMBOL GONE  %s.%s" % (mod_name, sym))

    print("-" * 58)
    total = sum(len(v) for v in SURFACE.values())
    print("resolved %d/%d symbols | %d modules gone | %d symbols gone"
          % (ok, total, len(missing_mod), len(missing_sym)))
    print("VERDICT: %s" % ("CLEAN - import surface intact"
                           if not missing_mod and not missing_sym
                           else "BROKEN - see above"))


if __name__ == "__main__":
    main()
