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
  --max N          Process at most N voices (default: all 228)
  --force          Re-download and re-measure even if opus already exists
  --cache DIR      Override cache directory (default: APPDATA temp scratchpad)
  --measure-only   Measure into <cache>/measurements.json, write nothing to the repo
  --curate         Select ~60 from those measurements -> voices/curated.txt
  --ids-file PATH  Import only the ids listed in PATH (one per line)

Three passes, because ~60 of the 228 ship and the selection needs the measurements
it is selecting on (D2: curated for register spread and clip quality):

  1. ingest.py --measure-only                  -> <cache>/measurements.json, 227 voices
  2. ingest.py --curate                        -> voices/curated.txt (the audit trail)
  3. ingest.py --ids-file voices/curated.txt   -> the shipped bundle

Then prune: a re-curation changes the set, so voices/*.opus dropped by the new
selection stay on disk and ship as dead weight. `node scripts/voice-library/
check_manifest.mjs` names them (check 11) — it is not wired into `npm test`, so
run it after any import.

`--max N` takes the alphabetical first N and is a SMOKE-TEST flag, not the way to
pick 60: the corpus is ordered by hex/name, so the first 10 came back 6xR1/3xR2/1xR3
with no R4 or R5 at all.

One voice of the 228 does not measure: `boom` downloads fine but pyin finds zero
voiced frames in it. It is genuinely unusable as a reference, not a pipeline fault.

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

# Default cache: outside the repo, shared across sessions, and NOT under %TEMP%.
#
# This used to sit in `%LOCALAPPDATA%/Temp/cubric-vision/`, described as "a stable location".
# It is not. Windows temp cleanup DELETED the whole folder mid-session on 2026-08-26 — 145 MB
# of cached wavs and the 227-voice measurements.json, gone with no warning, while the pipeline
# that wrote them was still being used. Nothing shipped was lost (voices/ is in the repo) but
# the measurement pass had to be re-run to rebuild it.
#
# The cache is expensive to rebuild (~139 MB of downloads) and is the input the curation
# selects on, so it does not belong anywhere the OS is entitled to garbage-collect.
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

# The VoiceDesign library that REPLACED the kyutai corpus. Generated locally, so it carries
# no upstream licence and no source URL — see LICENCE/SOURCE_TPL above for the kyutai pair.
VOICEDESIGN_LICENCE = None      # TODO(MPI-622): Fabio to confirm the Qwen3-TTS output licence.

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

    The rest exists for the curation pass. D2 chose ~60 of the 228 voices "for register
    spread and clip quality", and the corpus ships NO metadata to judge quality from — no
    gender, no age, no rating. These four figures are the only quality signal available
    without a human listening to 228 clips, and they cost nothing once the wav is loaded:

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


def read_ids_file(path):
    """Read a curated ID list: one voice id per line, '#' comments and blanks ignored."""
    ids = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            ids.append(line)
    return ids


def fetch_wav(voice_id, cache_dir, force=False):
    """Ensure <cache>/<id>_enhanced.wav exists. Returns the path, or None on failure."""
    stem     = f"{voice_id}_enhanced"
    wav_path = cache_dir / f"{stem}.wav"
    if not force and wav_path.exists():
        return wav_path
    try:
        download(f"{HF_BASE}/{stem}.wav", wav_path, label=voice_id)
    except Exception as exc:
        print(f"  ERROR downloading {voice_id}: {exc}  (skipping)")
        return None
    return wav_path


def run_measure(cache_dir, ids, force):
    """Measure every voice in `ids` and write <cache>/measurements.json. Writes NOTHING
    into the repo — this is the curation input, not an import."""
    out_path = cache_dir / "measurements.json"
    existing = {}
    if out_path.exists() and not force:
        existing = json.loads(out_path.read_text(encoding="utf-8")).get("voices", {})
        print(f"resuming: {len(existing)} voices already measured")

    results = dict(existing)
    for i, voice_id in enumerate(ids, 1):
        if voice_id in results and not force:
            continue
        wav_path = fetch_wav(voice_id, cache_dir, force)
        if wav_path is None:
            continue
        m = measure(wav_path)
        if m is None:
            print(f"  [{i}/{len(ids)}] {voice_id}: WARNING no voiced frames -- excluded")
            continue
        m["register"] = register_of(m["median_f0"])
        results[voice_id] = m
        print(f"  [{i}/{len(ids)}] {voice_id}  {m['median_f0']} Hz  {m['register']}  "
              f"voiced {m['voiced_frac']}  snr~{m['snr_proxy_db']} dB  peak {m['peak_dbfs']}")
        # Checkpoint every 20 so a network drop does not throw the whole pass away.
        if i % 20 == 0:
            out_path.write_text(json.dumps({"voices": results}, indent=1), encoding="utf-8")

    out_path.write_text(json.dumps({"voices": results}, indent=1), encoding="utf-8")
    print(f"\nWrote {out_path}  ({len(results)} voices measured)")
    return results


# ---------------------------------------------------------------------------
# Curation
# ---------------------------------------------------------------------------
#
# D2 ships ~60 of the 228 "curated for register spread and clip quality". Both gates below
# were set FROM the measured distribution of all 227 usable voices, not before it — an
# absolute threshold picked in advance is how this card already produced one false verdict
# (a 3.5 st span gate calibrated on R1's neutral wrongly failed R3).
#
# WHAT THE CORPUS ACTUALLY IS. Measured 2026-08-26, and it decides everything here:
#
#     R1  131      R2  62      R3  17      R4  1      R5  1      below 90 Hz  15
#
# It is overwhelmingly low-male. "Register spread across R1-R5" is not achievable from this
# source — R4 is ONE voice (Aon, 263.2 Hz) and R5 is ONE (Glenn, 365.9 Hz). So the scarce
# registers are taken WHOLE and the quotas deliberately under-represent R1: R1 is 58% of the
# corpus and 43% of what ships, R3 is 7% of the corpus and 28% of what ships. Curating for
# spread means correcting the corpus bias, not reproducing it.
#
# WHY THESE TWO GATES AND NOT THE OTHER THREE:
#   voiced_frac >= 0.35   Cuts the genuinely broken tail (WhisperInEar 0.078, Selfie 0.067).
#                         Under 35% of a 10 s clip is less than 3.5 s of actual voice.
#   snr_proxy  >= 6.0 dB  Same tail from the other side (WhisperInEar -10.1 dB).
#
#   peak_dbfs   NOT a gate. The corpus is already peak-normalised: max -1.0 dBFS, min -6.3,
#               and ZERO voices clip. It discriminates nothing here. Still measured, because
#               it would catch a future corpus that is not normalised.
#   duration_s  NOT a gate. Only 4 voices fall under 10 s and the shortest is 7.08 s, which
#               is ample for a VC reference. It discriminates nothing.
#   span_st     NOT a gate, a RANK PENALTY only. A wide p10-p90 does track worse clips (mean
#               voiced 0.455 vs 0.549 above 16 st) but it is primarily a pyin octave-error /
#               creak tell, and this card has already recorded a 21.4 st span on audio a
#               listener passed. Gating on it would drop 3973 and spanish-limaperu — two of
#               only seventeen R3 voices. It breaks ties where there is a choice; it never
#               excludes a voice from a scarce register.
#
# These reject clips that are measurably broken. None of them is a perceptual verdict, and
# no ranking here claims one good clip beats another good clip.

MIN_VOICED_FRAC = 0.35
MIN_SNR_PROXY_DB = 6.0
WIDE_SPAN_ST = 16.0        # rank penalty threshold, never an exclusion

# id -> how many ship. R3/R4/R5 are "take everything that passes the gates".
QUOTAS = {"R1": 26, "R2": 15, "R3": 999, "R4": 999, "R5": 999}


def _percentile_rank(values):
    """{key: 0..1} — where each value sits within its own pool. Comparing raw voiced_frac
    against raw dB would let whichever has the bigger numeric range dominate the sum."""
    order = sorted(values, key=lambda k: values[k])
    n = max(len(order) - 1, 1)
    return {k: i / n for i, k in enumerate(order)}


def curate(measurements, voices_dir):
    """Select ~60 voices for register spread and clip quality; write voices/curated.txt."""
    passed, rejected = {}, []
    for vid, m in measurements.items():
        reg = m.get("register")
        if reg is None:
            rejected.append((vid, f"{m['median_f0']} Hz is below the {REGISTERS[0][1]} Hz R1 floor — "
                                  f"no register band covers it"))
        elif m["voiced_frac"] < MIN_VOICED_FRAC:
            rejected.append((vid, f"voiced_frac {m['voiced_frac']} < {MIN_VOICED_FRAC}"))
        elif m["snr_proxy_db"] < MIN_SNR_PROXY_DB:
            rejected.append((vid, f"snr_proxy {m['snr_proxy_db']} dB < {MIN_SNR_PROXY_DB}"))
        else:
            passed[vid] = m

    selected, notes = [], {}
    for reg in REGISTERS_ORDER:
        pool = {k: v for k, v in passed.items() if v["register"] == reg}
        quota = QUOTAS.get(reg, 0)
        if not pool:
            continue

        vf   = _percentile_rank({k: v["voiced_frac"] for k, v in pool.items()})
        snr  = _percentile_rank({k: v["snr_proxy_db"] for k, v in pool.items()})
        score = {k: vf[k] + snr[k] - (0.5 if pool[k]["span_st"] > WIDE_SPAN_ST else 0.0)
                 for k in pool}

        if len(pool) <= quota:
            chosen = sorted(pool)
            for k in chosen:
                notes[k] = f"{reg} is scarce ({len(pool)} available) — taken whole"
        else:
            # Spread across the band by f0 quartile, so 26 R1 voices are not 26 voices that
            # all sit at 125 Hz. The picker filters by register, but a user browsing one
            # register still hears the difference between its floor and its ceiling.
            by_f0 = sorted(pool, key=lambda k: pool[k]["median_f0"])
            n = len(by_f0)
            # CONTIGUOUS quarters of the band, not a stride. `by_f0[i::4]` would hand every
            # group a sample of the whole range, which is the opposite of spreading and
            # would make the "f0-quartile" note in curated.txt a claim the code never made.
            quartiles = [by_f0[(n * i) // 4:(n * (i + 1)) // 4] for i in range(4)]
            chosen = []
            for qi, q in enumerate(quartiles):
                take = quota // 4 + (1 if qi < quota % 4 else 0)
                ranked = sorted(q, key=lambda k: -score[k])
                picked = ranked[:take]
                lo_hz, hi_hz = pool[q[0]]["median_f0"], pool[q[-1]]["median_f0"]
                for k in picked:
                    notes[k] = (f"{reg} f0-quartile {qi + 1}/4 ({lo_hz}-{hi_hz} Hz), "
                                f"quality rank {ranked.index(k) + 1}/{len(q)}")
                chosen.extend(picked)
        selected.extend(chosen)

    selected.sort()
    out = voices_dir / "curated.txt"
    lines = [
        "# voices/curated.txt - the ~60 voices that SHIP, of the 228 CC0 kyutai donations.",
        "# Generated by: ingest.py --curate. Regenerate rather than hand-editing;",
        "# then import with: ingest.py --ids-file voices/curated.txt",
        "#",
        f"# Selected {len(selected)} of {len(measurements)} measured "
        f"({len(passed)} passed the gates, {len(rejected)} rejected).",
        f"# Gates: voiced_frac >= {MIN_VOICED_FRAC}, snr_proxy >= {MIN_SNR_PROXY_DB} dB, "
        f"register in R1-R5.",
        "# See ingest.py section 'Curation' for why those two gates and not peak/duration/span.",
        "#",
        "# id  median_f0  register  why",
    ]
    for vid in selected:
        m = measurements[vid]
        lines.append(f"{vid:<32} # {m['median_f0']:>6} Hz  {m['register']}  {notes[vid]}")

    lines += ["", "# --- REJECTED (not shipped) ---"]
    for vid, why in sorted(rejected):
        lines.append(f"# {vid:<30} {why}")

    out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\nSelected {len(selected)} voices -> {out}")
    for reg in REGISTERS_ORDER:
        n_sel = sum(1 for v in selected if measurements[v]["register"] == reg)
        n_all = sum(1 for m in measurements.values() if m.get("register") == reg)
        print(f"  {reg}: {n_sel:>3} of {n_all:>3} available")
    print(f"  rejected: {len(rejected)}")
    return selected


REGISTERS_ORDER = [name for name, _lo, _hi in REGISTERS]


def run(voices_dir, cache_dir, all_ids, force):
    manifest_path = voices_dir / "manifest.json"
    existing      = load_existing_manifest(manifest_path)
    today         = date.today().isoformat()

    print(f"voices/ dir : {voices_dir}")
    print(f"cache dir   : {cache_dir}")
    print(f"existing    : {len(existing)} voices already in manifest")

    results = {}  # id → entry dict, in processing order

    for voice_id in all_ids:
        opus_path = voices_dir / f"{voice_id}.opus"

        # Idempotence: if already processed and not forced, reuse existing entry.
        if not force and opus_path.exists() and voice_id in existing:
            print(f"  skip {voice_id} (already processed)")
            results[voice_id] = existing[voice_id]
            continue

        # 1. Download the _enhanced wav to cache if not already there.
        wav_path = fetch_wav(voice_id, cache_dir, force)
        if wav_path is None:
            continue

        # 2. Measure pitch.
        print(f"  measure {voice_id} ...")
        m = measure(wav_path)
        if m is None:
            print(f"  WARNING: no voiced frames in {voice_id}  (skipping)")
            continue
        median_f0, p10, p90 = m["median_f0"], m["p10"], m["p90"]

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

    # performanceClips are AUTHORED (Phase 2, research/phase2_perf_clips.py), not imported.
    # This script does not own them, so it carries whatever is already on disk through
    # untouched. Writing [] here would silently delete the twelve shipped clips on the
    # next re-run, and the manifest would still look well-formed.
    perf_clips = []
    if manifest_path.exists():
        with open(manifest_path, encoding="utf-8") as f:
            perf_clips = json.load(f).get("performanceClips", [])

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
        "performanceClips": perf_clips,
    }

    manifest_json = json.dumps(manifest, indent=2, ensure_ascii=False)
    manifest_path.write_text(manifest_json + "\n", encoding="utf-8")
    print(f"\nWrote {manifest_path}  ({len(voices_list)} voices)")
    return manifest


# ---------------------------------------------------------------------------
# Entry point
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
            "licence":      VOICEDESIGN_LICENCE,
            "source_url":   None,       # generated locally — there is no upstream to point at
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
    parser.add_argument("--max",   type=int, default=0,
                        help="Process at most N voices (0 = all)")
    parser.add_argument("--force", action="store_true",
                        help="Re-download and re-measure even if already done")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE,
                        help="Cache directory for downloaded wavs")
    parser.add_argument("--measure-only", action="store_true",
                        help="Measure every voice into <cache>/measurements.json and write "
                             "NOTHING into the repo. This is the curation input.")
    parser.add_argument("--curate", action="store_true",
                        help="Select ~60 voices from <cache>/measurements.json for register "
                             "spread and clip quality, and write voices/curated.txt.")
    parser.add_argument("--ids-file", type=Path, default=None,
                        help="Import only the voice ids listed in this file (one per line, "
                             "'#' comments allowed). This is how the curated set is imported.")
    parser.add_argument("--from-dir", type=Path, default=None,
                        help="Import a locally-generated library from this directory (wav + "
                             "matching .txt sidecar per voice). Skips the corpus download "
                             "entirely — this is how the VoiceDesign library is imported.")
    args = parser.parse_args()

    # Paths are relative to repo root — script is run from that directory.
    repo_root  = Path(__file__).resolve().parent.parent.parent
    voices_dir = repo_root / "voices"
    voices_dir.mkdir(exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)

    # Before fetch_voice_ids() — the local path must not touch the network at all.
    if args.from_dir:
        import_local(voices_dir, args.from_dir, args.cache)
        return

    all_ids = fetch_voice_ids()

    if args.ids_file:
        wanted  = read_ids_file(args.ids_file)
        known   = set(all_ids)
        missing = [v for v in wanted if v not in known]
        if missing:
            print(f"  WARNING: {len(missing)} id(s) in {args.ids_file} are not in the "
                  f"corpus listing and will be skipped: {missing[:5]}")
        all_ids = [v for v in wanted if v in known]
        print(f"(restricted to {len(all_ids)} voices via --ids-file {args.ids_file})")

    if args.max:
        all_ids = all_ids[:args.max]
        print(f"(capped to {args.max} voices via --max)")

    if args.measure_only:
        run_measure(args.cache, all_ids, args.force)
        return

    if args.curate:
        path = args.cache / "measurements.json"
        if not path.exists():
            parser.error(f"{path} not found — run `--measure-only` first")
        curate(json.loads(path.read_text(encoding="utf-8"))["voices"], voices_dir)
        return

    run(voices_dir, args.cache, all_ids, args.force)


if __name__ == "__main__":
    main()
