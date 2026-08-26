"""MPI-622 Phase 3: build the review page for Fabio's ear.

Two asks on one page, because they are the two things measurement cannot settle:

  1. THE AUDITIONS. Per voice, three players side by side: the raw sample, the narration
     audition, the character audition. The character one MUST NOT sound like the sample -
     that mismatch is the entire reason auditions are generated rather than reusing the
     clip. The narration one MUST.
  2. THE 18 NEW PERFORMANCE CLIPS (R2/R4/R5 x six emotions). Do the six reads in each
     register read as their labels? VoiceDesign's prompt label is not a promise of the
     delivered emotion - a labelled-angry clip once read as "upset" on this card.

Audio is embedded as base64, matching the house pattern of the earlier audition pages: a
file:// page loading file:// media is blocked or flaky depending on the browser, and a
review that silently plays nothing is worse than a large file.

    G:/ComfyUi/python_embeded/python.exe phase3_review_page.py [out.html]
"""
import base64
import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
VOICES = REPO / "voices"
DEFAULT_OUT = Path(r"C:\Users\Fabio\AppData\Local\cubric-vision\mpi622\phase3-review.html")

EMOTION_ORDER = ["flat", "neutral", "angry", "sad", "cheerful", "whisper"]
BANDS = {"R1": "70-130 Hz", "R2": "130-190", "R3": "190-260", "R4": "260-340", "R5": "340+"}

CSS = """
:root{--bg:#14151a;--fg:#e8e8ee;--mut:#9aa;--card:#1e2029;--line:#2c2f3a;--hot:#ff7eb6;--ok:#7ee787}
:root[data-theme=light]{--bg:#f7f7fa;--fg:#1a1a20;--mut:#666;--card:#fff;--line:#e2e2ea}
@media(prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#f7f7fa;--fg:#1a1a20;--mut:#666;--card:#fff;--line:#e2e2ea}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0;padding:28px}
h1{font-size:20px;margin:0 0 6px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:30px 0 10px;border-top:1px solid var(--line);padding-top:16px}
h3{font-size:13px;letter-spacing:.04em;color:var(--fg);margin:18px 0 8px}
.lede{color:var(--mut);max-width:64em;margin:0 0 10px}
.row{display:grid;grid-template-columns:190px repeat(3,1fr);gap:10px;align-items:center;
     background:var(--card);border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin-bottom:7px}
.row.hdr{background:none;border:none;padding-bottom:0;margin-bottom:2px}
.row.hdr div{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--mut)}
.n{font-weight:600}
.hz{font-weight:400;font-variant-numeric:tabular-nums;color:var(--mut);font-size:12px;display:block}
audio{width:100%;height:32px}
.flag{color:var(--hot);font-size:12px}
.pill{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:1px 8px;
      font-size:11px;color:var(--mut);margin-left:6px;font-variant-numeric:tabular-nums}
"""


def b64(path):
    return ("data:audio/ogg;base64,"
            + base64.b64encode(Path(path).read_bytes()).decode())


def player(path):
    p = Path(path)
    if not p.exists():
        return '<span class="flag">missing</span>'
    return f'<audio controls preload="none" src="{b64(p)}"></audio>'


def cell(rel):
    """A player for a manifest-relative clip, or a visible gap when it was never made."""
    if not rel:
        return '<span class="flag">not generated</span>'
    return player(VOICES / rel)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    m = json.loads((VOICES / "manifest.json").read_text(encoding="utf-8"))
    text = m.get("auditionText", "(not recorded)")

    parts = [f"<title>MPI-622 &mdash; Phase 3 review</title><style>{CSS}</style>",
             "<h1>Phase 3 &mdash; auditions, and the three new performance grids</h1>",
             '<p class="lede">Two asks. Everything is level-matched to &minus;20&nbsp;dBFS '
             'rms_active, so nothing here is decided by loudness.</p>',
             f'<p class="lede"><b>Ask 1 &mdash; the auditions.</b> Audition line is '
             f'&ldquo;{html.escape(text)}&rdquo;, deliberately not the sample text. '
             'The <b>character</b> audition must <b>not</b> sound like the raw sample &mdash; '
             'that mismatch is the whole reason auditions are generated instead of playing '
             'the clip. The <b>narration</b> one must. If character ever sounds identical to '
             'sample, the VC route is not doing its job.</p>',
             '<p class="lede"><b>Ask 2 &mdash; the 18 new clips</b> (bottom of the page). Do '
             'the six reads in each register read as their labels? The prompt label is not a '
             'promise of the delivered emotion. Note <b>R5 neutral is only 50.5% voiced</b>, '
             'the lowest in the set &mdash; worth a listen for breathiness.</p>']

    # --- auditions, grouped by category ---------------------------------------------
    parts.append("<h2>1 &mdash; auditions (60 voices)</h2>")
    cats = {}
    for v in m["voices"]:
        cats.setdefault((v.get("tags") or ["?"])[0], []).append(v)
    for cat in sorted(cats):
        parts.append(f"<h3>{html.escape(cat)}</h3>")
        parts.append('<div class="row hdr"><div>voice</div><div>sample (raw)</div>'
                     '<div>narration audition</div><div>character audition</div></div>')
        for v in cats[cat]:
            n = (f'<span class="n">{html.escape(v["display_name"])}</span>'
                 f'<span class="hz">{v["register"]} &middot; {v["median_f0"]} Hz</span>')
            parts.append(
                f'<div class="row"><div>{n}</div>'
                f'<div>{player(VOICES / v["sample"])}</div>'
                f'<div>{cell(v.get("audition_narration"))}</div>'
                f'<div>{cell(v.get("audition_character"))}</div>'
                "</div>")

    # --- the three new grids ---------------------------------------------------------
    parts.append("<h2>2 &mdash; new performance grids (R2 / R4 / R5)</h2>")
    parts.append('<p class="lede">R1 and R3 shipped in Phase 2 and are shown for reference '
                 'at the bottom &mdash; they are the yardstick for what an accepted grid '
                 'sounds like. Only NEUTRAL is expected to sit on its band; an emotion cell '
                 'measuring outside is correct, the pitch lift <i>is</i> the emotion.</p>')
    clips = {(c["register"], c["emotion"]): c for c in m["performanceClips"]}
    for reg in ("R2", "R4", "R5", "R1", "R3"):
        present = [e for e in EMOTION_ORDER if (reg, e) in clips]
        if not present:
            continue
        tag = "NEW" if reg in ("R2", "R4", "R5") else "shipped Phase 2, reference"
        parts.append(f"<h3>{reg} <span class='pill'>{BANDS[reg]}</span>"
                     f"<span class='pill'>{tag}</span></h3>")
        for e in present:
            c = clips[(reg, e)]
            band_note = ""
            if e == "neutral" and c.get("measured_register") != reg:
                band_note = ' <span class="flag">off baseline</span>'
            cal = c.get("calibration_st")
            cal_note = f'<span class="pill">calib {cal:+} st</span>' if cal else ""
            n = (f'<span class="n">{e}</span>{band_note}'
                 f'<span class="hz">{c["median_f0"]} Hz &middot; span '
                 f'{c.get("pitch_span_st")} st {cal_note}</span>')
            parts.append(f'<div class="row"><div>{n}</div>'
                         f'<div>{player(VOICES / c["clip"])}</div><div></div><div></div></div>')

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(parts), encoding="utf-8")
    print(f"wrote {out}  ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
