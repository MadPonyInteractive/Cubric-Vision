"""Derive the CUT-BACK arm from the speech arm Fabio approved.

Question: can the extension cut BACK to the wide POV shot that 062 left at 3.200 s?
Fabio's point is that the wide shot cannot be re-invented from prose - horses, the
lady, the road, the light, the time of day - so the model has to be SHOWN it.

THE CEILING THAT SHAPES THIS ARM: context_length is a combo, not a number.

    context_length: ["22", "5", "39", "56"]
    "Only these lengths are whole numbers of latent steps, so only these are offered."

56 frames = 2.333 s is the maximum, reaching back to 2.833 s of a clip whose cut is
at 3.200 s. So only 9 frames - 0.375 s - of the wide shot are reachable, and "supply
2 seconds of the previous scene" is NOT achievable on this source at any setting.

What 56 does buy is better than 9 frames sounds: the pinned window STRADDLES THE CUT,
so the model's context is wide -> hard cut -> eyes. It sees the scene AND an example
of the exact edit being asked for. That is the strongest form of this test the pixel
context path can run.

Three edits off arm_speech_c2_10step.json:

  #601 context_length  22 -> "56"
  #605 'a + 22/24' -> 'a + 56/24'   keeps NEW footage at 102 frames, so this arm is
                                    directly comparable to the approved one. a=4 gives
                                    6.333 s = 152 frames, and MpiH3Length rounds UP to
                                    the next 17k+5 grid point = 158. 158 - 56 = 102.
  #232 prompt          three shots that mirror what the pin will replay, then the cut

Everything else - 10 steps, shift_audio 1, turbo LoRA on, seed, 1152x480 - untouched.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'arm_speech_c2_10step.json')
DST = os.path.join(HERE, 'arm_cutback_c2_10step.json')

LINE = "Rein 'em in! Rein 'em in now!"

# The pinned 56 frames replay wide -> cut -> eyes, so the prompt describes exactly
# that and then asks for a THIRD shot. The wide-shot wording is lifted from 062's own
# generation prompt so the model is asked for the scene it is being shown, in the
# language that produced it. The cut timestamp is in the GENERATED clip's timeline,
# where the pinned head occupies 0 - 2.333 s.
PROMPT = (
    "Live-action American West of the early 1880s on colour negative film with a warm "
    "cast, low early-morning sun from frame left, 35mm lens, shot at normal speed. This "
    "is a three-shot sequence with hard cuts and no dissolve, no fade and no transition "
    "effect of any kind.\n"
    "[Shot 1] A first-person point-of-view shot from the eyes of the woman driving the "
    "wagon, high above the road on the driving box and angled down and to the right, one "
    "dark liver chestnut draft horse in black leather harness running flat out in its "
    "traces at the far left edge of frame, and the man riding level with the wagon in the "
    "right half of the frame.\n"
    "[Shot 2] At 00:00.375 the shot cuts hard to an extreme close-up of the eyes of a "
    "lean hollow-cheeked man in his late forties, cropped tight above the eyebrows and "
    "below the bridge of the nose, the shadow of a hat brim across the top of the frame, "
    "his eyes locked on the lens and narrowed hard in a squint.\n"
    "[Shot 3] At 00:02.500 the shot cuts hard BACK to the first-person point-of-view "
    "shot of Shot 1, the same high downward angle from the wagon's driving box, the same "
    "draft horse flat out at the far left edge of the frame in its black leather harness, "
    "the same dusty desert road ripping past far below in heavy motion blur, the same low "
    "warm morning light. In the right half of the frame, below the camera and riding level "
    "with the wagon, the same lean hollow-cheeked man rides a lean rangy dapple grey horse "
    "at a flat gallop in a short black wool coat, brown tweed waistcoat and scarlet "
    "neckerchief, his right arm locked out straight toward the lens with a Navy revolver, "
    "the round black bore of the barrel pointing into the lens. Across the bottom right "
    "corner of the frame and close to the lens, one bare forearm and one hand of a young "
    "woman closed hard on a leather driving rein running forward out of frame. He turns "
    "his head to the camera and shouts, <d>[English] %s</d> The camera holds the high "
    "downward angle, jolting with the wagon, dust rolling across the frame.\n"
    "Hooves hammering flat out, iron tyres roaring on gravel, harness and trace chains "
    "rattling hard, wind tearing past the camera, loud and continuous throughout." % LINE
)


def main():
    if not os.path.exists(SRC):
        sys.exit('missing %s - run make_speech_arm.py first' % SRC)

    g = json.load(open(SRC))
    g['601']['inputs']['context_length'] = '56'
    g['605']['inputs']['math_expression'] = 'a + 56/24'
    g['232']['inputs']['string'] = PROMPT
    g['207']['inputs']['filename_prefix'] = 'MPI591_cutback_c2_10step'

    json.dump(g, open(DST, 'w'), indent=1)
    print('wrote %s' % DST)
    print('  #601 context_length = %s   (%.3f s of picture context)'
          % (g['601']['inputs']['context_length'],
             int(g['601']['inputs']['context_length']) / 24))
    print('  #605 %s  -> 6.333 s = 152 frames -> grid 158'
          % g['605']['inputs']['math_expression'])
    print('  new footage = 158 - 56 = 102 frames = %.2f s  (same as the approved arm)'
          % (102 / 24))
    print('  carried: steps=%s shift_audio=%s seed=%s  %sx%s'
          % (g['338']['inputs']['steps'], g['516']['inputs']['shift_audio'],
             g['195']['inputs']['int'], g['167']['inputs']['int'],
             g['168']['inputs']['int']))

    # the pinned window straddles 062's cut - the whole point of going to 56
    cut_frame = 3.200 * 24
    start = 124 - 56
    print('\n  pinned window = frames %d-123 of 062 (%.3f-%.3f s)'
          % (start, start / 24, 123 / 24))
    print('  062 cut at frame %.1f -> %d pinned frames are WIDE, %d are the eyes ECU'
          % (cut_frame, int(cut_frame) - start + 1, 123 - int(cut_frame)))


if __name__ == '__main__':
    main()
