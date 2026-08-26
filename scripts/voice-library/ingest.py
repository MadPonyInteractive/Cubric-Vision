"""Voice library import pipeline — MPI-622.

Imports a locally-generated voice library into voices/: trims each clip to its
sustained speech, levels it, measures pitch with librosa.pyin, transcodes to Ogg
Opus, and writes voices/manifest.json.

  G:/ComfyUi/python_embeded/python.exe scripts/voice-library/ingest.py \\
      --from-dir %LOCALAPPDATA%/cubric-vision/mpi622/lib_v2

Each voice is a `<id>.wav` with a matching `<id>.txt` sidecar carrying a
`CATEGORY:` line; the category supplies gender/age from CATEGORY_META, while
`register` comes from the MEASURED f0 and never from the prompt-time target — a
category may legitimately span two registers.

This script USED to download and curate the 228 CC0 kyutai/tts-voices donations.
That corpus was auditioned in full and rejected in full on 2026-08-26 (accents
unintelligible, poor mic quality, R4/R5 one voice each), so the download half —
fetch_voice_ids/download/run_measure/curate and the --max/--force/--measure-only/
--curate/--ids-file flags — was deleted rather than left to rot. Recover it from
git history if a corpus import is ever needed again.

`check_manifest.mjs` is NOT wired into `npm test`. Run it after any import:
  node scripts/voice-library/check_manifest.mjs
"""

import os
import re
import json
import argparse
from datetime import date
from pathlib import Path

import numpy as np
import librosa
import soundfile as sf

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


# Default cache: outside the repo, shared across sessions, and NOT under %TEMP%.
#
# This used to sit in `%LOCALAPPDATA%/Temp/cubric-vision/`, described as "a stable location".
# It is not. Windows temp cleanup DELETED the whole folder mid-session on 2026-08-26 — 145 MB
# of cached wavs and the 227-voice measurements.json, gone with no warning, while the pipeline
# that wrote them was still being used. Nothing shipped was lost (voices/ is in the repo) but
# the measurement pass had to be re-run to rebuild it.
#
# It now only holds the trimmed/levelled wavs on their way to opus, which are cheap to
# rebuild — but the rule stands: nothing this pipeline needs goes anywhere the OS is
# entitled to garbage-collect.
_APPDATA = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
DEFAULT_CACHE = Path(_APPDATA) / "cubric-vision" / "voice-cache"

# Pitch register bands (Hz) — mirrored in js/data/voiceLibrary.js and
# .agents/mpi-kanban/tasks/MPI-622/research/pitch_tools.py
#
# R1's floor was 90 until 2026-08-26. The kyutai corpus had nothing below it, but the
# VoiceDesign library deliberately generates deeper voices and SIX of its 60 measured
# 79.2–89.4 Hz — four of them the whole `narrator_trailer` category, which is supposed to
# be that deep. At 90 they were unclassifiable and the import silently dropped them.
# Lowered to 70 rather than adding an R0 band: R0 would have no performance grid, so those
# six would ship unable to do emotions. Do not raise it back without regenerating the grid.
REGISTERS = [
    ("R1", 70,  130),
    ("R2", 130, 190),
    ("R3", 190, 260),
    ("R4", 260, 340),
    ("R5", 340, 10_000),
]

# Every voice is generated in-house, so there is no upstream licence and no source URL — the
# kyutai entries this replaced carried "CC0-1.0" and a HuggingFace blob link.
#
# Checked on disk 2026-08-26, because a model licence CAN bind outputs (MiniMax H3 restricts
# them by territory): the Qwen3-TTS-12Hz-1.7B-VoiceDesign model card declares
# `license: apache-2.0`, which governs weights and code and makes no claim on what the model
# produces. The wrapper licences (ComfyUI-QwenTTS is GPL-3.0, the _qwen_tts_rt pack Apache-2.0)
# bind the CODE, not the audio. Two voices are Fabio's own recording, and two more are that
# recording through Chatterbox (node MIT; the weights' own licence is not present on this
# machine and was NOT verified). Nothing found claims the outputs.
VOICEDESIGN_LICENCE = "proprietary"

# Gender and age are DECLARED by the taxonomy, not inferred from the audio — the category name
# is the statement. Categories that deliberately mix (villain ships 2 male + 2 female variants;
# critter and trailer were never gendered) stay null rather than guessing. `accent` is null for
# every voice without exception — brief rule 1, enforced by check_manifest.mjs check 3.
CATEGORY_META = {
    "child":            (None,     "child"),
    "young_male":       ("male",   "young"),
    "standard_male":    ("male",   "adult"),
    "deep_male":        ("male",   "adult"),
    "elderly_male":     ("male",   "elderly"),
    "young_female":     ("female", "young"),
    "standard_female":  ("female", "adult"),
    "mature_female":    ("female", "mature"),
    "elderly_female":   ("female", "elderly"),
    "narrator_trailer": (None,     None),
    "cartoon_critter":  (None,     None),
    "villain_menacing": (None,     None),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sustained_trim(y, sr, frame=2048, hop=512, rel_db=35.0, min_ms=120):
    """Trim to the first and last SUSTAINED loud region, in preference to librosa's trim().

    librosa.effects.trim(top_db=35) anchors on a single transient, so one click or lip-smack
    holds the start open — on MPI-622 it left 4 s of audible dead air in a clip it declared
    trimmed at 1.11 s. Requiring `min_ms` of CONTINUOUS above-threshold energy ignores the
    transient and finds the speech. Proven across the whole audition set before shipping here.
    """
    rms = librosa.feature.rms(y=y, frame_length=frame, hop_length=hop)[0]
    thr = rms.max() * (10 ** (-rel_db / 20))
    loud = rms > thr
    need = max(1, int(min_ms / 1000 * sr / hop))
    run, first, last = 0, None, None
    for i, v in enumerate(loud):
        run = run + 1 if v else 0
        if run >= need:
            if first is None:
                first = i - need + 1
            last = i
    if first is None:
        return y
    return y[first * hop:min(len(y), (last + 1) * hop)]


def level_rms(y, target_dbfs=-20.0, floor_db=-40.0):
    """Normalise to `target_dbfs` RMS over ACTIVE frames only, then guard the peak.

    Plain full-signal RMS is dragged down by pauses, so a clip with long gaps comes back
    louder than one without. Measuring only samples above `floor_db` of peak makes two clips
    match by perceived loudness, which is what a picker audition needs.
    """
    a = np.abs(y)
    active = y[a > 10 ** (floor_db / 20.0) * max(float(np.max(a)), 1e-9)]
    cur = float(np.sqrt(np.mean(active ** 2))) if active.size else 0.0
    if cur > 0:
        y = y * (10 ** (target_dbfs / 20.0) / cur)
    peak = float(np.max(np.abs(y)))
    return y / (peak * 1.01) if peak >= 1.0 else y


def register_of(f0_hz):
    for name, lo, hi in REGISTERS:
        if lo <= f0_hz < hi:
            return name
    return None  # out of expected range — caller logs a warning


def measure(wav_path):
    """Return a dict of pitch AND clip-quality figures, or None if unvoiced.

    Pitch (median_f0 / p10 / p90) matches the algorithm in pitch_tools.py § measure()
    and is what `register` is assigned from.

    The four clip-quality figures are VESTIGIAL — they were the gates the deleted kyutai
    curation selected on. Kept because they cost nothing once the wav is loaded and would be
    the first thing wanted if another unvetted corpus ever needs triage. Nothing reads them
    today; the library they replaced was chosen by ear, not by threshold:

      voiced_frac   fraction of frames pyin called voiced. A low value means little usable
                    voice in a 10 s clip — breath, silence or noise the denoiser left behind.
      snr_proxy_db  voiced-frame RMS minus unvoiced-frame RMS. On a clean clip the unvoiced
                    frames are near-silent, so the gap is wide; a noisy one narrows it.
      peak_dbfs     catches clipping. A clip pinned at 0.0 dBFS is already damaged.
      span_st       p10..p90 in semitones. An absurd span is the pyin OCTAVE-ERROR tell, and
                    an octave error would put the voice in the wrong register — which is the
                    one field the whole selection turns on.

    None of these is a perceptual verdict. They reject clips that are measurably broken;
    they cannot rank two good clips against each other.
    """
    y, sr = librosa.load(str(wav_path), sr=None, mono=True)
    f0, voiced_flag, _ = librosa.pyin(y, fmin=60, fmax=500, sr=sr)
    voiced = f0[~np.isnan(f0)]
    if voiced.size == 0:
        return None

    med = float(np.median(voiced))
    p10, p90 = (float(x) for x in np.percentile(voiced, [10, 90]))

    # Frame RMS on the same grid pyin used (frame_length 2048 / hop 512, both centred),
    # so voiced_flag indexes it directly.
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    n = min(len(rms), len(voiced_flag))
    rms, vflag = rms[:n], voiced_flag[:n]

    def _db(x):
        return round(float(20 * np.log10(max(float(x), 1e-10))), 1)

    v_rms = _db(np.mean(rms[vflag])) if vflag.any() else -100.0
    u_rms = _db(np.mean(rms[~vflag])) if (~vflag).any() else -100.0

    return {
        "median_f0":    round(med, 1),
        "p10":          round(p10, 1),
        "p90":          round(p90, 1),
        "span_st":      round(float(12 * np.log2(p90 / p10)), 1) if p10 > 0 else 0.0,
        "duration_s":   round(len(y) / sr, 2),
        "voiced_frac":  round(float(np.mean(vflag)), 3),
        "peak_dbfs":    _db(np.max(np.abs(y))),
        "snr_proxy_db": round(v_rms - u_rms, 1),
    }


# Opus accepts only 8/12/16/24/48 kHz. The `_enhanced` source clips are 32 kHz, which is
# not one of them, so a resample is unavoidable -- but the target is 24 kHz, NOT 48 kHz.
#
# 24 kHz is the rate the plain (non-enhanced) kyutai clips already ship at, and the rate
# the TTS/VC stack runs at, so nothing downstream gains from 48 kHz. Measured on one 10 s
# clip: 48 kHz = 77283 B (61.8 kbps), 24 kHz = 40225 B (32.2 kbps) -- 52% of the size for
# a mono speech reference, which is 8.4 MB saved across the full 228.
#
# Do NOT reach for `compression_level` to shrink this further. It DOES bind (contrary to
# an earlier report that soundfile exposes no such knob), but the libsndfile default
# already sits near 0.9, and 1.0 collapses to 6.5 kbps -- which would wreck a clip whose
# entire job is to carry a voice's identity.
OPUS_SR = 24_000


def to_opus(wav_path, opus_path):
    """Read wav_path, resample to OPUS_SR, write Ogg Opus. See OPUS_SR for why 24 kHz."""
    y, sr = librosa.load(str(wav_path), sr=None, mono=True)
    if sr != OPUS_SR:
        y = librosa.resample(y, orig_sr=sr, target_sr=OPUS_SR)
    sf.write(str(opus_path), y, OPUS_SR, subtype="OPUS", format="OGG")


def display_name_of(voice_id):
    """Human-readable label from the voice ID (filename stem)."""
    # Named voices: 'Alejandro_espanol_latino' → 'Alejandro espanol latino'
    # Hex IDs: '0a67' → 'Voice 0a67'
    if re.match(r"^[0-9a-f]{4}$", voice_id):
        return f"Voice {voice_id}"
    return voice_id.replace("_", " ").strip()


def build_voice_entry(voice_id, median_f0, p10, p90, reg, added_at):
    """Return an ordered dict matching the brief.md § 3 field list."""
    # Key order is fixed so json.dumps(sort_keys=False) is byte-stable.
    return {
        "id":           voice_id,
        "display_name": display_name_of(voice_id),
        "gender":       None,
        "age":          None,
        "accent":       None,   # MUST be null — brief rule 1, never inferred
        "language":     None,
        "style":        None,
        "tags":         None,
        "kind":         "both",     # sample works for both narration and VC
        "register":     reg,
        "median_f0":    median_f0,
        "f0_p10_p90":   [p10, p90],
        "sample":       f"{voice_id}.opus",
        "audition_narration":  None,  # generated in Phase 3
        "audition_character":  None,  # generated in Phase 3
        "licence":      VOICEDESIGN_LICENCE,
        "source_url":   None,       # generated in-house - there is no upstream to point at
        "added_at":     added_at,
    }

# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

def import_local(voices_dir, src_dir, cache_dir):
    """Import a locally-GENERATED library (lib_v2) — no download, no curation gates.

    The kyutai path above selects from a corpus it cannot control. This one imports a set that
    was already approved by ear, so every clip ships and the only work is trim -> level ->
    measure -> opus. Category comes from the `.txt` sidecar each generator writes beside its
    wav; `register` is derived from the MEASURED f0, never from the category's prompt-time
    target, which is why a category may legitimately span two registers.
    """
    work = cache_dir / "local"
    work.mkdir(parents=True, exist_ok=True)
    wavs = sorted(src_dir.glob("*.wav"))
    if not wavs:
        raise SystemExit(f"no wav files in {src_dir}")

    added_at = date.today().isoformat()
    entries, counts, skipped = [], {}, []

    for wav in wavs:
        voice_id = wav.stem
        sidecar = wav.with_suffix(".txt")
        category = None
        if sidecar.exists():
            for line in sidecar.read_text(encoding="utf-8").splitlines():
                if line.startswith("CATEGORY:"):
                    category = line.split(":", 1)[1].strip()
                    break
        if category not in CATEGORY_META:
            skipped.append(f"{voice_id}: category {category!r} is not in CATEGORY_META")
            continue

        y, sr = librosa.load(str(wav), sr=None, mono=True)
        y = level_rms(sustained_trim(y, sr))
        staged = work / f"{voice_id}.wav"
        sf.write(str(staged), y, sr)

        m = measure(staged)
        if not m:
            skipped.append(f"{voice_id}: unvoiced, pyin found no f0")
            continue
        reg = register_of(m["median_f0"])
        if not reg:
            skipped.append(f"{voice_id}: {m['median_f0']:.1f} Hz is outside R1-R5")
            continue

        to_opus(staged, voices_dir / f"{voice_id}.opus")
        gender, age = CATEGORY_META[category]
        entry = build_voice_entry(voice_id, m["median_f0"], m["p10"], m["p90"], reg, added_at)
        entry.update({
            "display_name": voice_id.replace("_", " ").title(),
            "gender":       gender,
            "age":          age,
            "tags":         [category],
        })
        entries.append(entry)
        counts[category] = counts.get(category, 0) + 1
        print(f"  {voice_id:<22} {m['median_f0']:6.1f} Hz  {reg}  {category}")

    manifest_path = voices_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["variant"] = "voicedesign"
    manifest["voices"] = entries
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8", newline="\n")

    print(f"\n{len(entries)} voices imported from {src_dir}")
    for cat in sorted(counts):
        flag = "" if counts[cat] == 5 else f"   <-- expected 5, got {counts[cat]}"
        print(f"  {cat:<20} {counts[cat]}{flag}")
    if skipped:
        print(f"\n{len(skipped)} SKIPPED:")
        for s in skipped:
            print(f"  - {s}")
    print(f"\nperformance grid left intact: {len(manifest.get('performanceClips', []))} clips")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from-dir", type=Path, required=True,
                        help="Directory holding the generated library — one wav plus a "
                             "matching .txt sidecar per voice.")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE,
                        help="Scratch directory for the trimmed/levelled wavs.")
    args = parser.parse_args()

    # Paths are relative to repo root — script is run from that directory.
    repo_root  = Path(__file__).resolve().parent.parent.parent
    voices_dir = repo_root / "voices"
    voices_dir.mkdir(exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)

    import_local(voices_dir, args.from_dir, args.cache)


if __name__ == "__main__":
    main()
