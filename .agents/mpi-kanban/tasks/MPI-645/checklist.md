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

- [x] **Floor the slider** — drama-box `Input_Duration` `min: 1` → `min: 4`.
      Shipped at 3 (the model author's own floor: below it upstream never asks the model
      to speak at all) and Fabio raised it to **4** on 2026-08-28 after the envelope
      numbers: a 3 s ask is a 2.89 s file with 0.13–1.47 s of lead-in silence, and
      `_007` vs `_008` shows the same prompt truncating at 3 s and completing with 0.39 s
      spare at 4 s. 4 is the floor at which the flow stops handing back a clip that is a
      quarter silence at the front. Proven live at 3: `min=3 max=30 step=1 value=5`.

- [x] **Make the hard window legible.** The floor alone does not help the reported case
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
      `Input_Duration: 1` returns 4.

- [x] `npm test` 773/773. `npm run test:desktop` 39 passed, 1 environmental failure
      (`model-settings-popup.spec.js` — a `ERR_CACHE_READ_FAILURE` on a video and a 500
      from `/update-project-settings`, both from running beside the user's live app);
      re-run alone it passes.

- [x] `drama-box.md` § "The duration slider is the single biggest quality control" carries
      the floor, the measured grid table and the fact that `duration_multiplier` stays
      dead.

## Answered by Fabio — 2026-08-28

**The floor is 4, not upstream's 3.** "4 seconds the minimum. I think it solves
everything." It does: 4 s is the shortest window the samples show delivering a complete
line (`_007` truncates at 3 s, `_008` completes with 0.39 s spare on the same prompt), and
it clears the lead-in silence that made a 3 s ask sound like a two-second clip. Shipped as
`min: 4` in `flowsRegistry.js`, with the comment and `drama-box.md` carrying the reason so
nobody "restores" the model author's 3. `npm test` 773/773 after the move.

**The note reads right** and stays as written: *"A hard window — the line is cut off when
it runs past this. Give a long line more seconds."*

The ×1.1 pad stays **deliberately not** copied over. Upstream applies it to its own
ESTIMATE of the text; applied to a number the user typed it restores no protection — it
only makes the readout lie by 10 % and still cuts a line that needed longer. Floor +
honest copy, not floor + pad.

## Closed too — no trim card

**Trimming the lead-in silence: NOT doing it** (Fabio, 2026-08-28). The floor is the whole
fix — 4 s comes back as a usable 4 s of line, which is what his tests showed, so there is
nothing left for a trim to buy. It would have cost an MpiNodes node plus a graph re-export
(`_trim_silence` is not exposed, core's `TrimAudioDuration` cuts at fixed times). Recorded
in `drama-box.md` so it does not come back as "the other half of MPI-645".
