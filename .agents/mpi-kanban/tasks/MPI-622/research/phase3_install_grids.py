"""MPI-622 Phase 3: calibrate, measure and install the R2/R4/R5 performance grids.

Reads the raw VoiceDesign takes from `phase3_perf_r245.py`, applies the per-register
baseline calibration (the same shift to all six cells, so each emotion's pitch delta
survives exactly), levels, encodes to Ogg Opus and registers the clips in
`voices/manifest.json`.

Run with no `--install` to see every number without writing anything. That is the default
on purpose: the calibration is the one step that can quietly ruin a grid, and this card
has lost to an ear seven times when a measurement was trusted on its own.

    G:/ComfyUi/python_embeded/python.exe phase3_install_grids.py <raw_dir> [--install]

No GPU. `pitch_tools.shift` is offline and formant-preserving (Phase 0, validated to
+/-19 st with emotion intact).
"""
import json
import shutil
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]        # research -> MPI-622 -> tasks -> mpi-kanban -> .agents -> repo
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "scripts" / "voice-library"))

import numpy as np  # noqa: E402
import librosa  # noqa: E402
import soundfile as sf  # noqa: E402

import pitch_tools  # noqa: E402
from ingest import level_rms, sustained_trim, to_opus  # noqa: E402
from phase3_perf_r245 import GRID, PERSONAS  # noqa: E402
from phase2_perf_clips import EMOTIONS, PERF_TEXT  # noqa: E402

BANDS = {"R2": (130, 190), "R4": (260, 340), "R5": (340, 10_000)}


def semitone_span(p10, p90):
    """Pitch span in semitones — the same number Phase 2 recorded as `pitch_span_st`."""
    return round(12.0 * float(np.log2(p90 / p10)), 1) if p10 and p90 else None


def main():
    raw_dir = Path(sys.argv[1])
    install = "--install" in sys.argv
    voices = REPO / "voices"
    perf_dir = voices / "performance"
    work = raw_dir / "calibrated"
    work.mkdir(parents=True, exist_ok=True)

    added_at = date.today().isoformat()
    rows, entries = [], []

    for reg, emo in GRID:
        src = raw_dir / f"perf_{reg}_{emo}.wav"
        if not src.exists():
            print(f"MISSING {src.name}")
            continue
        _, calib = PERSONAS[reg]

        staged = work / f"perf_{reg}_{emo}.wav"
        if calib:
            pitch_tools.shift(str(src), str(staged), calib)
        else:
            shutil.copy2(src, staged)

        # Trim then level, the same order the shipping sample pipeline uses.
        y, sr = librosa.load(str(staged), sr=None, mono=True)
        y = level_rms(sustained_trim(y, sr))
        sf.write(str(staged), y, sr)

        m = pitch_tools.measure(str(staged))
        lo, hi = BANDS[reg]
        in_band = lo <= m["median_f0"] <= hi
        # Only NEUTRAL is expected on baseline. An emotion cell off band is correct —
        # `register` names the performer, not the clip.
        flag = "" if (in_band or emo != "neutral") else "  <-- NEUTRAL OFF BASELINE"
        rows.append((f"perf_{reg}_{emo}", m["median_f0"], m["p10"], m["p90"],
                     m["voiced_pct"], m["register"], in_band, flag))

        entries.append({
            "id": f"perf_{reg}_{emo}",
            "register": reg,
            "emotion": emo,
            "clip": f"performance/perf_{reg}_{emo}.opus",
            "median_f0": round(m["median_f0"], 1),
            "f0_p10_p90": [round(m["p10"], 1), round(m["p90"], 1)],
            "pitch_span_st": semitone_span(m["p10"], m["p90"]),
            "measured_register": m["register"],
            "source": "qwen3-tts-voicedesign",
            "seed": 2100 + GRID.index((reg, emo)),
            "added_at": added_at,
        })
        if calib:
            entries[-1]["calibration_st"] = calib

    print(f"{'clip':<22} {'f0':>7} {'p10':>7} {'p90':>7} {'voiced':>7}  meas  band")
    for cid, f0, p10, p90, vp, mreg, ok, flag in rows:
        print(f"{cid:<22} {f0:7.1f} {p10:7.1f} {p90:7.1f} {vp:6.1f}%  {mreg or '--':<4}"
              f"  {'in' if ok else 'out':<4}{flag}")

    if not install:
        print(f"\n{len(entries)} clips calibrated in {work} — nothing written. "
              f"Re-run with --install to encode and register them.")
        return

    for reg, emo in GRID:
        staged = work / f"perf_{reg}_{emo}.wav"
        if staged.exists():
            to_opus(staged, perf_dir / f"perf_{reg}_{emo}.opus")

    mpath = voices / "manifest.json"
    manifest = json.loads(mpath.read_text(encoding="utf-8"))
    keep = [c for c in manifest["performanceClips"] if c["register"] not in PERSONAS]
    manifest["performanceClips"] = keep + entries
    mpath.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
                     encoding="utf-8", newline="\n")

    by_reg = {}
    for c in manifest["performanceClips"]:
        by_reg.setdefault(c["register"], []).append(c["emotion"])
    print(f"\ninstalled — grid is now "
          + " + ".join(f"{r} x{len(e)}" for r, e in sorted(by_reg.items()))
          + f"  ({len(manifest['performanceClips'])} clips)")
    missing = {r: sorted(set(EMOTIONS) - set(e)) for r, e in by_reg.items()}
    for r, miss in missing.items():
        if miss:
            print(f"  {r} INCOMPLETE, missing {', '.join(miss)}")
    assert PERF_TEXT, "perf text sanity"


if __name__ == "__main__":
    main()
