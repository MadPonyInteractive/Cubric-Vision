# MPI-645 — checklist

- [x] **Confirm the cause in the installed pack, not from the brief.**
      `DramaBoxSampler.generate` takes `duration_seconds` RAW whenever it is non-zero and
      there is one chunk, so `sampling.estimate_duration`'s `max(3.0, …)` floor and its
      ×1.1 pad are both skipped. Verified in
      `engine/ComfyUI_windows_portable/ComfyUI/custom_nodes/ComfyUI-MelodramaBox/`.

- [x] **Explain the requested-vs-delivered gap.** It is NOT a second bug.
      `generate_audio_latent` sizes the latent from the duration and then snaps it to the
      patchifier's 8n+1 grid at `AUDIO_LATENT_FPS = 25`:
      `n = round(d*25) + 1; n = ((n - 1 + 4) // 8) * 8 + 1`, and the decode loses a further
      constant 0.03 s — `delivered = n / 25 − 0.03`.

      **Measured, not derived.** `ffprobe` over all nine `flowDramaBox_*.flac` in the
      user's `TTS` project, each read against the `Input_Duration` in its `.meta` sidecar:

      | asked | frames | delivered | gap |
      |---|---|---|---|
      | 3 s | 73 | 2.89 s | −0.11 s |
      | 4 s | 105 | 4.17 s | +0.17 s |
      | 4.5 s | 113 | 4.49 s | −0.01 s |
      | 5 s | 129 | 5.13 s | +0.13 s |
      | 10 s | 249 | 9.93 s | −0.07 s |

      The gap runs −0.11 s to +0.17 s, **goes both ways**, and is never a whole second, so
      it is not a trim. Corroborated by `%APPDATA%\Cubric Vision\logs\app.log` 14:28–14:30:
      `Sampling 3.0s` → `Decoded 2.9s`, `Sampling 4.0s` → `Decoded 4.2s`.

- [x] **CORRECTION — "the cut is the whole story" was wrong, and Fabio was right to push
      back.** File length is not what an ear calls the length. `silencedetect` at −45 dB on
      the same clips: every one opens with **model-generated lead-in silence of 0.13–1.47 s**,
      and short windows also come back with holes in the middle. `_001` (asked 3 s) is
      0.75 s of lead, a 0.71 s gap at 1.08–1.79 and 0.28 s trailing — **1.15 s of audible
      speech in a 2.89 s file.** "A two-second output" was generous, not a rounding.

      The truncation is proven on the samples too: `_007` has NO trailing silence and its
      last 100 ms peaks at **−8.0 dB**, i.e. loud at the final sample. Every clip that
      finished ends at −47 dB or below.

      `_007` vs `_008` settles the product question: **same prompt**, 3 s truncates
      mid-word (2.54 s speech), 4 s completes it with 0.39 s spare (3.61 s speech). More
      window does buy more line — the lead-in does not grow to eat it.

- [x] **Floor the slider at the model author's own floor** — drama-box `Input_Duration`
      `min: 1` → `min: 3`. Below 3 s upstream never asks the model to speak at all.
      Proven live: the mounted range input reads `min=3 max=30 step=1 value=5`.

- [x] **Make the hard window legible.** `min: 3` alone does not help the reported case
      (Fabio asked for exactly 3). The field now carries a `note`:
      *"A hard window — the line is cut off when it runs past this. Give a long line more
      seconds."* Screenshotted on the real run slide, under the slider, in the stacked
      column.

- [x] **Root cause, one pass:** a slider COULD NOT carry a note. `buildField` rendered
      `f.note` inside the `select` branch only, so four already-declared slider notes were
      silently dropped — `Input_Denoise` and `Input_Prompt_Strength` in both
      `flowsRegistry.js` (LTX Upscale) and `pluginsRegistry.js` (its tool-options twin).
      The block moved to the shared tail past every branch, so it is a property of the
      FIELD rather than of one widget. Proven in the page for the upscale block's own BEM
      namespace (`mpi-tool-options-upscale__field-note`).

- [x] **A moved floor must not show one number and send another.** `min`/`max` were only
      ever enforced by the widget, which clamps what the user DRAGS — a value seeded from
      a persisted card or a Reuse never meets the control. `mapDeclaredValue` now clamps
      every numeric field, mapped or not; it is the one choke point both payload paths
      (`_collectInputs` and `splitDeclaredValues`) already pass through. A stale
      `Input_Duration: 1` returns 3.

- [x] `npm test` 773/773. `npm run test:desktop` 39 passed, 1 environmental failure
      (`model-settings-popup.spec.js` — a `ERR_CACHE_READ_FAILURE` on a video and a 500
      from `/update-project-settings`, both from running beside the user's live app);
      re-run alone it passes.

- [x] `drama-box.md` § "The duration slider is the single biggest quality control" carries
      the floor, the measured grid table and the fact that `duration_multiplier` stays
      dead.

## Open question for Fabio — the card sits in `validating` on this

The ×1.1 pad is **deliberately not** copied over. Upstream applies it to its own ESTIMATE
of the text; applying it to a number the user typed does not restore that protection, it
just makes the readout lie by 10 % (3 → 3.3 → 3.24 s delivered) and still cuts a line that
needed 5 s. So the fix is floor + honest copy, not floor + pad.

What needs an ear rather than a test: **is `min: 3` the right floor, and does the note read
right on the slide?** 3 s is the model author's floor, not a measured one of ours — if a
one-word line at 2 s is something you want back, that is a different call and it comes with
no upstream support.

And the one the envelope measurement opened: **trim the lead-in silence off the output?**
`audio_prep.py` carries a `_trim_silence` helper but MelodramaBox exposes **no trim node**,
and core's `TrimAudioDuration` cuts at fixed times rather than at silence — so it needs an
MpiNodes node plus a graph re-export, which is a card of its own, not this one. Trimming
adds no speech; it only stops a 3 s ask returning a file that is a quarter silence at the
front. The thing that actually buys a complete line is more window, which is what the note
now tells the user.
