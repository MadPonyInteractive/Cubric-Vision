# MPI-550 - MiniMax H3 non-turbo is undercooked

## Symptom (Fabio, 2026-08-12/13, measured on a rented RunPod RTX 5090)

Non-turbo output on `minimax-h3-ref2va` is **visibly worse than turbo** at the
same width, height, duration and prompt.

This is backwards. Turbo is a speed/quality trade, so turbo winning does not mean
turbo is unusually good, it means the non-turbo path is producing less than it
should.

Measured on two unrelated shots, so it is not subject-specific:

| Clip | Shot | Setting | Result |
|---|---|---|---|
| `ref2v_ms_008` | woman driving the wagon, middle distance | non-turbo, 1344x768 | face broke up |
| `ref2v_ms_009` | same shot, tighter framing | turbo, 1344x768 | better |
| `ref2v_ms_010` | same shot | turbo, 1920x1080 | good, face held |
| `ref2v_ms_011` | lizard on gravel, 100mm macro | non-turbo, 1344x768, 3s | bad |
| `ref2v_ms_012` | same shot | non-turbo, 1344x768, 6s | bad |
| (lizard retry) | same shot | turbo, 3s | **way better** |

All of the above ran with `qualityTier = high`, `Input_Refs.ref_image_size =
match`, 16:9, no LoRAs, `upscaleModel = None`. The only variable that moved
between the good and the bad results was `Input_is_Turbo`.

## Cause, suspected

**Watch the latents. Fabio did, 2026-08-13, and it changes the diagnosis.** The
preview latents come in **fine all the way through sampling** and the result only
degrades at the **last stage, the VAE decode**. That is the strongest evidence
here and it points away from the step count, which was the first guess.

Candidates, reordered on that observation:

1. **The VAE does not decode the non-turbo latents well.** Whichever VAE the H3
   workflows adopted may be matched to the turbo path. Sampling is clean, decode
   is where the image falls apart. Start here.
2. **A node in the non-turbo branch degrading the result.** Diff the turbo and
   non-turbo paths of the graph node by node.
3. **Too few sampling steps on the non-turbo branch.** Was the original guess.
   Demoted, because too few steps would show as bad latents during sampling, and
   the latents are fine.

**Note the overlap with [MPI-549](../MPI-549/brief.md).** That card is also about
the VAE decode stage in the same H3 workflows, from the other direction: decode
runs on the full latent rather than tiled and OOMs at 2K and 4K. Two independent
symptoms landing on the same node is worth treating as a hint. Look at them
together.

## One confound to rule out first

Part of the poor output in the western production was traced to a **soft
reference plate**, not the workflow. `t2i_049` was mushy at 100%, and H3 copies
the character of its reference, so clips built on it came back soft regardless of
turbo. After the plate was sharpened, a **non-turbo** clip (`ref2v_ms_016`) came
back good.

So before spending time in the graph: re-run the turbo/non-turbo comparison with a
**known-sharp plate on both sides**. If non-turbo still lags there, the decode
fault is real and independent. If it does not, this card may be only the plate
problem wearing a workflow costume.

## Also worth knowing

Non-turbo costs **roughly twice the wall clock**: ~7min against ~3min for the
same clip. So the slow path is currently paying double for a worse image, which
is why the western production has switched to turbo for every shot.

## Ask

Find out which of the two causes it is, and fix it so non-turbo is at least as
good as turbo. Until then non-turbo is not usable, and the quality ladder in the
app is misleading: a user reaching for the slow, expensive setting to get a
better result currently gets a worse one.

## Impact

Blocks nothing outright, since turbo is a working route. But it makes the app's
main quality lever backwards, and it cost paid Pod time and several wasted
generations in the western production before it was spotted.

Related: [MPI-549](../MPI-549/brief.md), also H3 workflow work on the same
rented card.
