"""LEVEL continuity across the join - the thing dropouts.py cannot see.

dropouts.py scores every window against its own LOCAL median, so a smooth level
offset that persists across the boundary reads as normal on both sides: the same
blind spot flash.py has on a smooth luma ramp. It finds holes and clicks. It does
not find "the continuation is quieter than the source it continues".

So print a plain RMS series either side of the join and the step across it.
"""
import subprocess
import sys

import numpy as np

SR = 32000
JOIN = 5.167


def load(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-acodec', 'pcm_s16le',
         '-ac', '2', '-ar', str(SR), '-'],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype='<i2').astype(np.float32).reshape(-1, 2).mean(axis=1) / 32768.0


def db(x):
    return 20 * np.log10(x + 1e-9)


def report(name, path, win=0.25):
    a = load(path)
    w = int(win * SR)
    n = len(a) // w
    rms = np.sqrt((a[:n * w].reshape(n, w) ** 2).mean(axis=1))
    print('%s  %.3f s' % (name, len(a) / SR))
    print('   t(s)    RMS dB')
    for i in range(n):
        t = i * win
        mark = '  <-- JOIN' if t <= JOIN < t + win else ''
        print('  %5.2f   %7.2f%s' % (t, db(rms[i]), mark))

    # steady level either side, skipping the 0.8 s splice crossfade around the join
    pre = rms[int(1.0 / win):int((JOIN - 0.5) / win)]
    post = rms[int((JOIN + 0.9) / win):]
    print('  source-side steady RMS  %7.2f dB  (1.0 s -> join-0.5)' % db(pre.mean()))
    print('  extension steady RMS    %7.2f dB  (join+0.9 -> end)' % db(post.mean()))
    print('  STEP ACROSS THE JOIN    %+7.2f dB' % (db(post.mean()) - db(pre.mean())))
    return db(post.mean()) - db(pre.mean())


if __name__ == '__main__':
    for x in sys.argv[1:]:
        name, path = x.split('=', 1)
        report(name, path)
        print()
