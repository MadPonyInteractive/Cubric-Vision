"""Derive the speech arm from arm_shift1_10step.json - the standing recommendation.

Four edits and no others, so this arm stays one-variable against the ladder in every
respect the second corpus allows:

  #600  source        -> the PRE-RESIZED 062 copy (1152x480)
  #167/#168 size      -> 1152 x 480, because neither MpiLoadVideo nor
                         MiniMaxH3MotionContext resizes and the pinned latent must
                         agree with the generation latent.

THE PLAN'S 960x400 IS WRONG AND COST A DISPATCH. MpiH3ImageToVideo declares
step: 32 on width and height, and feeding them from MpiInt LINKS bypasses the
widget that would have enforced it. 400 is not a multiple of 32: 400/16 = 25, an
ODD latent grid, and the DiT's 2x2 patchify reshapes to an EVEN one - it asked for
[.. 12, 2, 30, 2] = 34560 and got 24*25*60 = 36000. Exact 2.4 aspect on a 32-grid
leaves only 768x320 and 1152x480; 1152x480 keeps corpus 1's height and gives the
eyes ECU the detail it needs, at 1.33x A1's pixel count. validate.py now checks
this - see check_int_widget_limits there.
  #232  prompt        -> the 062 scene (an eyes ECU) plus a shouted line
  #207  prefix        -> a name that cannot collide with the first corpus

Everything else - 10 steps, shift_audio 1, turbo LoRA on, seed 591000591, beta/euler -
is carried over untouched.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'arm_shift1_10step.json')
DST = os.path.join(HERE, 'arm_speech_c2_10step.json')

CORPUS2 = os.path.join(HERE, 'out', 'corpus2', 'ref2v_ms_062_1152x480.mp4')

# The source's last shot is an EXTREME CLOSE-UP of the man's eyes, cropped above the
# brows and below the bridge of the nose - no mouth in frame. The extension continues
# that framing, so the shouted line is judged on VOICE alone with no lip-sync confound.
# <d>[English] ...</d> is Fabio's own tag from the 062 generation prompt; it drove
# speech through the same Qwen3-VL encoder this bench loads.
LINE = "Rein 'em in! Rein 'em in now!"

PROMPT = (
    "Extreme close-up on the eyes of a lean hollow-cheeked man in his late forties, "
    "cropped tight above the eyebrows and below the bridge of the nose, the shadow of a "
    "hat brim across the top of the frame, his eyes locked on the lens and narrowed hard "
    "in a squint. He holds the squint and shouts, <d>[English] %s</d> "
    "Hooves hammering flat out, iron tyres roaring on gravel, harness and trace chains "
    "rattling hard, wind tearing past the camera." % LINE
)


def main():
    if not os.path.exists(CORPUS2):
        sys.exit('missing the pre-resized corpus: %s' % CORPUS2)

    g = json.load(open(SRC))
    g['600']['inputs']['string'] = CORPUS2
    g['167']['inputs']['int'] = 1152
    g['168']['inputs']['int'] = 480
    g['232']['inputs']['string'] = PROMPT
    g['207']['inputs']['filename_prefix'] = 'MPI591_speech_c2_10step'

    json.dump(g, open(DST, 'w'), indent=1)
    print('wrote %s' % DST)
    for nid in ('600', '167', '168', '207', '232'):
        v = g[nid]['inputs']
        k = 'string' if 'string' in v else ('int' if 'int' in v else 'filename_prefix')
        print('  #%-4s %-24s %s' % (nid, g[nid]['class_type'], str(v[k])[:110]))

    # the four that must NOT have moved
    print('\ncarried over: steps=%s shift_audio=%s lora=%s seed=%s' % (
        g['338']['inputs']['steps'], g['516']['inputs']['shift_audio'],
        os.path.basename(g['455']['inputs']['lora_name']), g['195']['inputs']['int']))


if __name__ == '__main__':
    main()
