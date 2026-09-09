"""Source vs extension DYNAMIC RANGE, for the stage where level.py stops working.

Once a shouted line is in the extension prompt, `level.py`'s single steady-state
step is meaningless: it averages a shout together with whatever bed is under it and
reports the sum as "louder". That number cannot tell these two apart:

  * the extension continues the bed AND adds a shout   -> good
  * the extension DROPS the bed and emits only a shout -> bad, and it is the failure
    the ear reports as "it goes dead between the words"

The separator is the FLOOR, not the mean. A continued bed puts a hard lower bound on
every window; a dropped bed lets the quiet windows fall to the model's own noise
floor. So compare the two sides' percentiles, not their averages.

Windows are the same 250 ms level.py uses, and the same 800 ms splice guard is
excluded either side of the join so no window straddles it.

    python dynamics.py JOINED.mp4 [JOIN_SECONDS]
"""
import subprocess
import sys

import numpy as np

SR = 32000
WIN = 0.25
GUARD = 0.8


def load(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-acodec', 'pcm_s16le',
         '-ac', '1', '-ar', str(SR), '-'],
        capture_output=True).stdout
    if not raw:
        sys.exit('no audio decoded from %s' % path)
    return np.frombuffer(raw, '<i2').astype(np.float64) / 32768.0


def windows(a):
    n = int(WIN * SR)
    k = len(a) // n
    b = a[:k * n].reshape(k, n)
    rms = np.sqrt((b ** 2).mean(axis=1))
    return np.arange(k) * WIN, 20 * np.log10(np.maximum(rms, 1e-9))


def side(t, db, lo, hi):
    m = (t >= lo) & (t < hi)
    return db[m]


def describe(name, d):
    print('  %-10s n=%-3d  floor(min) %7.2f   p10 %7.2f   median %7.2f   '
          'p90 %7.2f   peak %7.2f   range(p90-p10) %5.2f dB'
          % (name, len(d), d.min(), np.percentile(d, 10), np.median(d),
             np.percentile(d, 90), d.max(), np.percentile(d, 90) - np.percentile(d, 10)))
    return d


def main(joined, join):
    a = load(joined)
    t, db = windows(a)
    src = side(t, db, 1.0, join - GUARD + 0.3)
    ext = side(t, db, join + GUARD + 0.1, t[-1])
    if len(src) < 4 or len(ext) < 4:
        sys.exit('not enough windows either side of the join')

    print('join %.3f s   file %.2f s   window %d ms' % (join, t[-1] + WIN, WIN * 1000))
    describe('source', src)
    describe('extension', ext)

    d_floor = ext.min() - src.min()
    d_range = ((np.percentile(ext, 90) - np.percentile(ext, 10))
               - (np.percentile(src, 90) - np.percentile(src, 10)))
    print('\n  FLOOR  %+6.2f dB   (extension floor vs source floor)' % d_floor)
    print('  RANGE  %+6.2f dB   (extension p90-p10 vs source p90-p10)' % d_range)
    print('\n  reading: a floor that DROPS and a range that WIDENS = the bed was not')
    print('  continued, only the shout was generated. A floor that holds = the bed')
    print('  survived and the level step is just the added voice.')
    return d_floor, d_range


def self_check():
    """A bed that continues must read ~0; a bed replaced by bursts must read very negative.

    A shout is CONTIGUOUS IN TIME - it fills a couple of windows and leaves the rest
    alone. The first version of this check sprayed the shout randomly across every
    sample, so it landed in every window, lifted the floor in BOTH cases and made the
    two indistinguishable (+15.15 vs +13.48). That is the mistake the instrument is
    built to detect, so getting it wrong here first was the check doing its job.
    """
    rng = np.random.default_rng(0)
    n = int(5.0 * SR)

    def shout_into(sig):
        for lo, hi in ((6.0, 6.8), (8.0, 8.9)):           # two contiguous shouts
            i, j = round(lo * SR), round(hi * SR)         # round, not int: 6.8*32000
            sig[i:j] += rng.normal(0, 0.4, j - i)         # floors to 217599, not 217600

    bed = rng.normal(0, 0.05, n * 2)                      # continuous bed, both sides
    kept_sig = bed.copy()
    shout_into(kept_sig)
    t, db = windows(kept_sig)
    kept = side(t, db, 5.9, 10.0).min() - side(t, db, 1.0, 4.3).min()

    lost_sig = bed.copy()
    lost_sig[n:] = rng.normal(0, 0.0005, n)               # bed GONE on the second half
    shout_into(lost_sig)
    t2, db2 = windows(lost_sig)
    lost = side(t2, db2, 5.9, 10.0).min() - side(t2, db2, 1.0, 4.3).min()

    print('self-check  bed CONTINUED + shout : floor %+6.2f dB  (must be near 0)' % kept)
    print('self-check  bed DROPPED, shout only: floor %+6.2f dB  (must be very negative)' % lost)
    assert abs(kept) < 3.0, kept
    assert lost < -15.0, lost
    print('PASS - the floor separates the two cases the level step cannot.')


if __name__ == '__main__':
    if '--self-check' in sys.argv:
        self_check()
    else:
        main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 5.167)
