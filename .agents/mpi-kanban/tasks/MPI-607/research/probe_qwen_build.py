"""Probe 3: execute qwen_tts's model class bodies against the installed transformers.

Probe 2 could not reach them -- qwen_tts imports librosa at package import time, and
librosa is absent from the bench. Installing it is NOT an option: librosa drags a numpy
downgrade (which is why TTS-Audio-Suite installs it with --no-deps), and the bench's
numpy 2.4.6 is load-bearing for ComfyUI.

So the absent audio libs are STUBBED. transformers, torch and numpy stay real, which
keeps the thing under test honest: every class body, decorator, base-class signature
and registration call runs against the genuine transformers 5.x.

ASCII-only output on purpose (Windows console is cp1252).
"""
import importlib.machinery
import os
import sys
import traceback
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Stub ONLY libs that are absent and irrelevant to the transformers question.
#
# The spec must be a REAL ModuleSpec: torch._dynamo.trace_rules walks every entry in
# sys.modules at import time and reads spec.origin, so a duck-typed stand-in takes
# down torch's import with an AttributeError that looks exactly like a transformers
# incompatibility and is not one.
# soxr is pulled by transformers' OWN audio_utils, not by qwen_tts -- absent here and
# absent from Vision's lock, so it must be added for any transformers-5 audio path.
#
# Dotted entries are submodules imported directly (`from librosa.filters import mel`).
# A MagicMock parent does NOT satisfy those: Python resolves them through sys.modules,
# so each one needs its own entry or the import dies as "not a package".
STUBBED = [
    "librosa", "librosa.filters", "librosa.util",
    "soundfile", "sox", "soxr", "onnxruntime",
]
for name in STUBBED:
    if name not in sys.modules:
        stub = MagicMock()
        stub.__name__ = name
        stub.__spec__ = importlib.machinery.ModuleSpec(name, loader=None, origin="stub")
        sys.modules[name] = stub

TARGETS = [
    "qwen_tts.core.models.configuration_qwen3_tts",
    "qwen_tts.core.models.modeling_qwen3_tts",
    "qwen_tts.core.models.processing_qwen3_tts",
    "qwen_tts.core.tokenizer_12hz.configuration_qwen3_tts_tokenizer_v2",
    "qwen_tts.core.tokenizer_12hz.modeling_qwen3_tts_tokenizer_v2",
]

# Classes that must exist and be instantiable-as-a-type for the model to load at all.
SMOKE = [
    ("qwen_tts.core.models.configuration_qwen3_tts", "Qwen3TTSConfig"),
    ("qwen_tts.core.models.modeling_qwen3_tts", "Qwen3TTSForConditionalGeneration"),
]


def main():
    import transformers
    import torch
    print("transformers  %s" % transformers.__version__)
    print("torch         %s" % torch.__version__)
    print("stubbed       %s" % ", ".join(STUBBED))
    print("=" * 68)

    breaks = 0
    for name in TARGETS:
        try:
            __import__(name)
            print("BUILDS   %s" % name)
        except Exception as exc:  # noqa: BLE001
            breaks += 1
            print("BREAK    %s" % name)
            print("         %s: %s" % (type(exc).__name__, exc))
            traceback.print_exc()

    print("-" * 68)
    for mod_name, cls_name in SMOKE:
        mod = sys.modules.get(mod_name)
        if mod is None:
            print("SKIP     %s.%s (module did not build)" % (mod_name, cls_name))
            continue
        cls = getattr(mod, cls_name, None)
        print("%s %s" % ("CLASS OK" if cls is not None else "CLASS MISSING", cls_name))

    # Config instantiation is the cheapest real exercise of transformers' PretrainedConfig.
    cfg_mod = sys.modules.get("qwen_tts.core.models.configuration_qwen3_tts")
    if cfg_mod is not None:
        cfg_cls = getattr(cfg_mod, "Qwen3TTSConfig", None)
        if cfg_cls is not None:
            try:
                cfg = cfg_cls()
                print("CONFIG OK   instantiated Qwen3TTSConfig (model_type=%s)"
                      % getattr(cfg, "model_type", "?"))
            except Exception as exc:  # noqa: BLE001
                breaks += 1
                print("CONFIG BREAK %s: %s" % (type(exc).__name__, exc))
                traceback.print_exc()

    print("=" * 68)
    print("VERDICT: %s" % ("CLEAN - qwen_tts builds on this transformers"
                           if breaks == 0 else "%d real break(s)" % breaks))


if __name__ == "__main__":
    main()
