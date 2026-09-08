"""Turn one raw bench arm into the two numbers that decide it.

The arm generates 124 frames of which the first 22 are the pinned head - the
model's own reconstruction of the source's tail. That head is BOTH the thing to
throw away (it is not new footage) and the whole seam_probe measurement, so this
takes the untrimmed file and does both:

    seam_probe   untrimmed head vs the source tail   -> is it CONTINUING? (corr)
    level        source ++ trimmed extension         -> is it as LOUD? (dB step)

Baseline to beat: -3.51 dB, and whatever correlation the shipped graph scores.
H3 emits 32 kHz - never hardcode 48000 anywhere near this.
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'instruments'))

import level          # noqa: E402
import seam_probe     # noqa: E402

FPS = 24
PINNED = 22


def run(*args):
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode:
        sys.exit('%s failed:\n%s' % (args[0], p.stderr[-2000:]))
    return p.stdout


def trim_and_join(source, untrimmed, out_dir):
    """Drop the pinned head, picture and sound together, then concatenate."""
    os.makedirs(out_dir, exist_ok=True)
    trimmed = os.path.join(out_dir, 'extension_trimmed.mp4')
    joined = os.path.join(out_dir, 'joined.mp4')
    head = PINNED / FPS

    # one trim for both streams: -ss on the input cuts picture and audio together
    run('ffmpeg', '-v', 'error', '-y', '-ss', '%.6f' % head, '-i', untrimmed,
        '-c:v', 'libx264', '-crf', '12', '-preset', 'medium',
        '-c:a', 'aac', '-b:a', '192k', '-ar', str(level.SR), trimmed)

    # re-encode both sides through one filter graph rather than concat-demuxing:
    # the source is AAC 32 kHz and the generation is not necessarily the same
    # codec parameters, and a stream-copy concat of two different encodes is how
    # a silent audio gap gets into the measurement.
    run('ffmpeg', '-v', 'error', '-y', '-i', source, '-i', trimmed,
        '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]',
        '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '12',
        '-c:a', 'aac', '-b:a', '192k', '-ar', str(level.SR), joined)
    return trimmed, joined


def main(source, untrimmed, out_dir):
    for p in (source, untrimmed):
        if not os.path.exists(p):
            sys.exit('missing: %s' % p)

    print('=' * 70)
    print('SEAM PROBE - is the extension continuing the source, or covering it?')
    print('=' * 70)
    corr = seam_probe.probe(source, untrimmed, frames=PINNED, fps=float(FPS))

    trimmed, joined = trim_and_join(source, untrimmed, out_dir)
    print('\n' + '=' * 70)
    print('LEVEL - is the extension as loud as what it continues?')
    print('=' * 70)
    step = level.report('joined', joined)

    print('=' * 70)
    print('VERDICT  mean corr %.3f   level step %+.2f dB' % (corr, step))
    print('  baseline (shipped flow_h3_extend.json, 8-step): -3.51 dB')
    print('  bench noise floor on the level metric:           0.55 dB')
    print('  trimmed extension: %s' % trimmed)
    print('  joined for level.py: %s' % joined)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit('usage: measure.py SOURCE.mp4 UNTRIMMED_GENERATION.mp4 OUT_DIR')
    main(*sys.argv[1:])
