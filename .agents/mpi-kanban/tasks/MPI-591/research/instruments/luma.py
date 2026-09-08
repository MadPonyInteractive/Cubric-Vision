"""The flicker instrument: ABSOLUTE per-frame luma, not the frame-to-frame diff.

flash.py's single join number scores a STALL as a win (validation.md Phase 5d) -
a pinned still moves less than the footage, so the metric that ranked it first
was measuring stillness. The defect left on the clip-guide arm is an EXPOSURE
excursion inside the overlap, which a difference series cannot see at all: a
smooth +5 luma ramp has small frame-to-frame diffs the whole way up.

So read signalstats YAVG WITHOUT tblend (mean luma of each frame) and print the
window around the join, plus the excursion against a baseline taken from the
untouched source half. The tblend diff series is printed alongside, so a fix
that flattens the exposure by freezing the picture cannot pass unnoticed.
"""
import re
import subprocess
import sys
import statistics


def yavg(path, vf):
    out = subprocess.run([
        'ffmpeg', '-v', 'error', '-i', path, '-vf',
        vf + 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
        '-f', 'null', '-',
    ], capture_output=True, text=True).stdout
    return [float(m) for m in re.findall(r'YAVG=([0-9.]+)', out)]


def report(name, path, lo, hi, base_lo=0, base_hi=80):
    y = yavg(path, '')                             # absolute mean luma per frame
    d = yavg(path, 'tblend=all_mode=difference,')  # frame-to-frame motion
    base = y[base_lo:base_hi]
    print('%s  %d frames' % (name, len(y)))
    print('  source-half luma   mean %.2f  drift over %d frames %+.2f'
          % (statistics.mean(base), len(base), base[-1] - base[0]))
    print('  source-half motion mean %.2f' % statistics.mean(d[base_lo:base_hi - 1]))
    print('  frame:   Y      dY(prev)   motion')
    prev = None
    for i in range(lo, min(hi, len(y))):
        dy = '' if prev is None else '%+6.2f' % (y[i] - prev)
        mo = '%6.2f' % d[i - 1] if 0 < i <= len(d) else '     -'
        print('   %4d %7.2f  %8s  %s' % (i, y[i], dy, mo))
        prev = y[i]
    win = y[lo:min(hi, len(y))]
    steps = [abs(win[i + 1] - win[i]) for i in range(len(win) - 1)]
    print('  EXCURSION in window: min %.2f  max %.2f  span %.2f  worst 1-frame step %.2f'
          % (min(win), max(win), max(win) - min(win), max(steps)))
    return y, d


if __name__ == '__main__':
    lo, hi = 84, 128
    rest = []
    for a in sys.argv[1:]:
        if a.startswith('--window='):
            lo, hi = (int(x) for x in a.split('=')[1].split(','))
        else:
            rest.append(a)
    for a in rest:
        name, path = a.split('=', 1)
        report(name, path, lo, hi)
        print()
