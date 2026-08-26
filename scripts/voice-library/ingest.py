"""Voice library import pipeline — MPI-622.

Fetches CC0 voices from kyutai/tts-voices voice-donations/ on HuggingFace,
measures pitch with librosa.pyin, transcodes to Ogg Opus, and writes
voices/manifest.json.

LICENCE SAFETY: Fetches from voice-donations/ ONLY. That subdirectory is the
only CC0 content in the repo. expresso/, ears/, vctk/, cml-tts/, alba-mackenna/
are NOT CC0 — they are hardcoded-absent from the download logic.

Run under the embedded python:
  G:/ComfyUi/python_embeded/python.exe scripts/voice-library/ingest.py [options]

Options:
  --max N      Process at most N voices (default: all 228)
  --force      Re-download and re-measure even if opus already exists
  --cache DIR  Override cache directory (default: APPDATA temp scratchpad)

Idempotence guarantee:
  Re-running produces a byte-identical manifest.json for already-processed
  voices (added_at is preserved from the first run). New voices are appended
  with today's date. Existing opus files are NOT re-downloaded or re-transcoded
  unless --force is passed.

Variant choice: _enhanced.wav (denoised) used consistently across all 228 voices.
  Rationale: cleaner signal → more reliable pyin pitch tracking; fewer noise
  artefacts when used as a VC target_voice. Comparing raw vs enhanced for the
  same voice would vary two things at once — we pick one and hold it constant.
"""

import sys
import os
import re
import json
import argparse
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import librosa
import soundfile as sf

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HF_REPO = "kyutai/tts-voices"
HF_API  = f"https://huggingface.co/api/models/{HF_REPO}/tree/main/voice-donations"
HF_BASE = f"https://huggingface.co/{HF_REPO}/resolve/main/voice-donations"

LICENCE    = "CC0-1.0"
SOURCE_TPL = f"https://huggingface.co/{HF_REPO}/blob/main/voice-donations/{{stem}}_enhanced.wav"

# Default cache: a stable location outside the repo, shared across sessions.
_APPDATA = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
DEFAULT_CACHE = Path(_APPDATA) / "Temp" / "cubric-vision" / "voice-cache"

# Pitch register bands (Hz) — mirrored in js/data/voiceLibrary.js and
# .agents/mpi-kanban/tasks/MPI-622/research/pitch_tools.py
REGISTERS = [
    ("R1", 90,  130),
    ("R2", 130, 190),
    ("R3", 190, 260),
    ("R4", 260, 340),
    ("R5", 340, 10_000),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def register_of(f0_hz):
    for name, lo, hi in REGISTERS:
        if lo <= f0_hz < hi:
            return name
    return None  # out of expected range — caller logs a warning


def measure_f0(wav_path):
    """Return (median_f0, p10, p90) in Hz using librosa.pyin.

    Returns None if no voiced frames are detected.
    Matches the algorithm in pitch_tools.py § measure().
    """
    y, sr = librosa.load(str(wav_path), sr=None, mono=True)
    f0, _voiced, _ = librosa.pyin(y, fmin=60, fmax=500, sr=sr)
    voiced = f0[~np.isnan(f0)]
    if voiced.size == 0:
        return None
    med  = float(np.median(voiced))
    p10, p90 = (float(x) for x in np.percentile(voiced, [10, 90]))
    return round(med, 1), round(p10, 1), round(p90, 1)


def download(url, dest, label=""):
    """Download url → dest, showing a progress dot every 100 KB."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "cubric-voice-ingest/1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    dest.write_bytes(data)
    print(f"  downloaded {label}: {len(data)//1024} KB")


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
        "licence":      LICENCE,
        "source_url":   SOURCE_TPL.format(stem=voice_id),
        "added_at":     added_at,
    }

# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

def fetch_voice_ids():
    """Fetch the list of 228 CC0 voice IDs from the HF API."""
    print(f"Fetching file listing from {HF_API} ...")
    with urllib.request.urlopen(HF_API, timeout=30) as r:
        data = json.load(r)
    # Keep only the raw .wav files (not _enhanced, not .safetensors)
    ids = []
    for entry in data:
        path = entry.get("path", "")
        stem = Path(path).stem  # e.g. '0a67' or '0a67_enhanced'
        if path.endswith(".wav") and not stem.endswith("_enhanced"):
            ids.append(stem)
    ids.sort()
    print(f"  found {len(ids)} voices")
    return ids


def load_existing_manifest(manifest_path):
    """Return {voice_id: entry_dict} for voices already in the manifest."""
    if not manifest_path.exists():
        return {}
    with open(manifest_path, encoding="utf-8") as f:
        data = json.load(f)
    return {v["id"]: v for v in data.get("voices", [])}


def run(voices_dir, cache_dir, max_voices, force):
    manifest_path = voices_dir / "manifest.json"
    existing      = load_existing_manifest(manifest_path)
    today         = date.today().isoformat()

    print(f"voices/ dir : {voices_dir}")
    print(f"cache dir   : {cache_dir}")
    print(f"existing    : {len(existing)} voices already in manifest")

    all_ids = fetch_voice_ids()
    if max_voices:
        all_ids = all_ids[:max_voices]
        print(f"(capped to {max_voices} voices via --max)")

    results = {}  # id → entry dict, in processing order

    for voice_id in all_ids:
        opus_path = voices_dir / f"{voice_id}.opus"

        # Idempotence: if already processed and not forced, reuse existing entry.
        if not force and opus_path.exists() and voice_id in existing:
            print(f"  skip {voice_id} (already processed)")
            results[voice_id] = existing[voice_id]
            continue

        # 1. Download the _enhanced wav to cache if not already there.
        stem     = f"{voice_id}_enhanced"
        wav_path = cache_dir / f"{stem}.wav"
        if force or not wav_path.exists():
            url = f"{HF_BASE}/{stem}.wav"
            print(f"  fetch {voice_id} ...")
            try:
                download(url, wav_path, label=voice_id)
            except Exception as exc:
                print(f"  ERROR downloading {voice_id}: {exc}  (skipping)")
                continue

        # 2. Measure pitch.
        print(f"  measure {voice_id} ...")
        measurement = measure_f0(wav_path)
        if measurement is None:
            print(f"  WARNING: no voiced frames in {voice_id}  (skipping)")
            continue
        median_f0, p10, p90 = measurement

        reg = register_of(median_f0)
        if reg is None:
            print(f"  WARNING: {voice_id} median_f0={median_f0} Hz out of all register bands — assigning R1")
            reg = "R1"

        # 3. Transcode to Ogg Opus.
        if force or not opus_path.exists():
            print(f"  transcode {voice_id} -> {opus_path.name} ...")
            to_opus(wav_path, opus_path)

        # Preserve added_at from existing entry if present.
        added_at = existing.get(voice_id, {}).get("added_at", today)

        results[voice_id] = build_voice_entry(
            voice_id, median_f0, p10, p90, reg, added_at
        )
        print(f"  {voice_id}  {median_f0} Hz  {reg}")

    # Sort by id for stable output.
    voices_list = [results[k] for k in sorted(results)]

    manifest = {
        "version": 1,
        "variant": "enhanced",
        "note": (
            "CC0 voices from kyutai/tts-voices voice-donations/ "
            "(Unmute Voice Donation Project). "
            "_enhanced.wav used consistently for pitch measurement and VC conditioning. "
            "accent is null for all — must be assigned by a human listener, never inferred."
        ),
        "voices":          voices_list,
        "performanceClips": [],
    }

    manifest_json = json.dumps(manifest, indent=2, ensure_ascii=False)
    manifest_path.write_text(manifest_json + "\n", encoding="utf-8")
    print(f"\nWrote {manifest_path}  ({len(voices_list)} voices)")
    return manifest


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max",   type=int, default=0,
                        help="Process at most N voices (0 = all)")
    parser.add_argument("--force", action="store_true",
                        help="Re-download and re-measure even if already done")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE,
                        help="Cache directory for downloaded wavs")
    args = parser.parse_args()

    # Paths are relative to repo root — script is run from that directory.
    repo_root  = Path(__file__).resolve().parent.parent.parent
    voices_dir = repo_root / "voices"
    voices_dir.mkdir(exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)

    run(voices_dir, args.cache, args.max or 0, args.force)


if __name__ == "__main__":
    main()
