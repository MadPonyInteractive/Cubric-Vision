"""Probe 5: CONSTRUCT the Qwen3-TTS model classes, not just import them.

The earlier probes proved imports and config instantiation, and still missed the break
Fabio hit at runtime:

    AttributeError: 'Qwen3TTSTalkerConfig' object has no attribute 'pad_token_id'

because that access happens inside a model's __init__, which importing never runs.
transformers 5 removed pad_token_id / bos_token_id / eos_token_id from PretrainedConfig
(they live on GenerationConfig now), so any `config.pad_token_id` blows up at build time.

This builds the two affected classes from DELIBERATELY TINY configs -- 1 layer, small
hidden sizes -- so it exercises every __init__ path in about a second without allocating
1.7B parameters or downloading a checkpoint.

ASCII-only output on purpose (Windows console is cp1252).
"""
import sys
import traceback

PACK = "G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-QwenTTS"
sys.path.insert(0, PACK)

TINY = dict(
    hidden_size=64,
    intermediate_size=128,
    num_hidden_layers=1,
    num_attention_heads=4,
    num_key_value_heads=2,
    vocab_size=256,
)

failures = []


def check(label, fn):
    try:
        result = fn()
        print("OK       %s%s" % (label, "" if result is None else "  (%s)" % result))
    except Exception as exc:  # noqa: BLE001 - reporting every failure is the point
        failures.append(label)
        print("FAIL     %s" % label)
        print("         %s: %s" % (type(exc).__name__, exc))
        traceback.print_exc()


def build_talker():
    from qwen_tts.core.models.configuration_qwen3_tts import Qwen3TTSTalkerConfig
    from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSTalkerModel

    cfg = Qwen3TTSTalkerConfig(**TINY, text_vocab_size=256, text_hidden_size=64)
    model = Qwen3TTSTalkerModel(cfg)
    assert model.padding_idx is None or isinstance(model.padding_idx, int)
    return "padding_idx=%r, %d layer(s)" % (model.padding_idx, len(model.layers))


def build_code_predictor():
    from qwen_tts.core.models.configuration_qwen3_tts import (
        Qwen3TTSTalkerCodePredictorConfig)
    from qwen_tts.core.models.modeling_qwen3_tts import (
        Qwen3TTSTalkerCodePredictorModel)

    cfg = Qwen3TTSTalkerCodePredictorConfig(**TINY, num_code_groups=2)
    model = Qwen3TTSTalkerCodePredictorModel(cfg, embedding_dim=64)
    assert model.padding_idx is None or isinstance(model.padding_idx, int)
    return "padding_idx=%r, %d layer(s)" % (model.padding_idx, len(model.layers))


def removed_config_attrs():
    """Name every PretrainedConfig attribute transformers 5 dropped."""
    from transformers import PretrainedConfig

    base = PretrainedConfig()
    gone = [a for a in ("pad_token_id", "bos_token_id", "eos_token_id")
            if not hasattr(base, a)]
    return "dropped by transformers 5: %s" % (", ".join(gone) or "none")


def main():
    import transformers
    print("transformers  %s" % transformers.__version__)
    print("pack          %s" % PACK)
    print("=" * 70)

    check("PretrainedConfig surface", removed_config_attrs)
    check("Qwen3TTSTalkerModel constructs", build_talker)
    check("Qwen3TTSTalkerCodePredictorModel constructs", build_code_predictor)

    print("=" * 70)
    print("VERDICT: %s" % ("CLEAN - __init__ paths build on transformers 5"
                           if not failures else "FAILED: %s" % ", ".join(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
