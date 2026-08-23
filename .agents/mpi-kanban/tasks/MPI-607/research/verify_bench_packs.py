"""Verify the two TTS packs installed on the bench actually build on transformers 5.13.

Unlike the earlier probes this uses the REAL librosa/soundfile/soxr now present, no
stubs -- so a pass here means the model code genuinely loads, not that a mock absorbed
the failure. The thin ComfyUI node wrappers are skipped on purpose: they import `comfy`,
which only exists inside a running server.

ASCII-only output on purpose (Windows console is cp1252).
"""
import sys
import traceback

CUSTOM_NODES = "G:/ComfyUi/ComfyUI/custom_nodes"
QWEN_PACK = CUSTOM_NODES + "/ComfyUI-QwenTTS"
CHAT_PACK = CUSTOM_NODES + "/ComfyUI_Fill-ChatterBox"

failures = []


def check(label, fn):
    try:
        fn()
        print("OK       %s" % label)
    except Exception as exc:  # noqa: BLE001 - reporting every failure is the point
        failures.append(label)
        print("FAIL     %s" % label)
        print("         %s: %s" % (type(exc).__name__, exc))
        traceback.print_exc()


def qwen():
    sys.path.insert(0, QWEN_PACK)
    from qwen_tts.core.models import (Qwen3TTSConfig,
                                      Qwen3TTSForConditionalGeneration)
    cfg = Qwen3TTSConfig()
    assert cfg.model_type == "qwen3_tts", cfg.model_type
    assert Qwen3TTSForConditionalGeneration is not None


def chatterbox():
    sys.path.insert(0, CHAT_PACK)
    from local_chatterbox.chatterbox.tts import ChatterboxTTS
    from local_chatterbox.chatterbox.tts_turbo import ChatterboxTurboTTS
    from local_chatterbox.chatterbox.mtl_tts import ChatterboxMultilingualTTS
    assert all([ChatterboxTTS, ChatterboxTurboTTS, ChatterboxMultilingualTTS])


def watermark():
    """Fabio wants the watermark ON, so its absence is a finding, not a nicety."""
    import numpy as np
    import perth
    wm = perth.PerthImplicitWatermarker()
    sr = 22050
    tone = (0.1 * np.sin(2 * np.pi * 220 * np.arange(sr) / sr)).astype("float32")
    out = wm.apply_watermark(tone, sample_rate=sr)
    assert out is not None and len(out) == len(tone), "watermarked length changed"


def real_audio_libs():
    import librosa, soundfile, soxr  # noqa: F401
    print("         librosa=%s soundfile=%s soxr=%s"
          % (librosa.__version__, soundfile.__version__, soxr.__version__))


def main():
    import transformers
    import torch
    print("transformers  %s" % transformers.__version__)
    print("torch         %s" % torch.__version__)
    print("=" * 66)

    check("real audio libs importable (no stubs)", real_audio_libs)
    check("ComfyUI-QwenTTS  -> qwen_tts model classes build", qwen)
    check("Fill-ChatterBox  -> all 3 Chatterbox engines build", chatterbox)
    check("Perth watermarker applies to a real buffer", watermark)

    print("=" * 66)
    print("VERDICT: %s" % ("ALL GREEN - restart the bench and load the workflows"
                           if not failures else "FAILED: %s" % ", ".join(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
