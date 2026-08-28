# MPI-645 — validation

## What shipped

| change | file |
|---|---|
| drama-box `Input_Duration` `min: 1` → **`min: 4`** (shipped at 3, raised to 4 by Fabio) | `js/data/flowsRegistry.js` |
| field `note`: *"A hard window — the line is cut off when it runs past this. Give a long line more seconds."* | `js/data/flowsRegistry.js` |
| `buildField`'s `f.note` moved past every branch — it rendered inside the `select` branch only | `js/utils/declaredFields.js:162` |
| `mapDeclaredValue` clamps every numeric field, so a moved floor cannot render one number and send another | `js/utils/declaredFields.js` |

## Evidence

- **Cause**, read in the installed pack rather than the brief:
  `DramaBoxSampler.generate` takes `duration_seconds` RAW, skipping
  `sampling.estimate_duration`'s `max(3.0, …)` floor and its ×1.1 pad.
- **Requested vs delivered is not a second bug.** `ffprobe` over all nine
  `flowDramaBox_*.flac` against their `.meta` sidecars: gap −0.11 s…+0.17 s, both
  directions, never a whole second — the `8n+1` latent grid at 25 fps minus a constant
  0.03 s. Table in `checklist.md` and in `drama-box.md`.
- **The envelope, not the file** (`silencedetect` −45 dB, same clips): every clip opens
  with 0.13–1.47 s of model lead-in silence; `_001` is 1.15 s of audible speech in a
  2.89 s file. `_007` ends at −8.0 dB on its last 100 ms = cut mid-sound.
- **Why the floor is 4:** `_007` vs `_008`, same prompt — 3 s truncates mid-word (2.54 s
  speech), 4 s completes with 0.39 s spare (3.61 s speech).
- **Live**, on an isolated instance (measured at the shipped 3): the mounted range input
  read `min=3 max=30 step=1 value=5`, the note rendered under the slider on the run slide,
  and the upscale block's own field-note BEM namespace proved the shared tail. The move to
  4 is a literal in the same declaration — not re-driven.
- `npm test` **773/773** after the move to 4. `npm run test:desktop` 39 passed + 1
  environmental failure (`model-settings-popup.spec.js`, from running beside the user's
  live app) that passes when run alone.

## Answered

Fabio, 2026-08-28: **4 s is the minimum.** The note reads right and stays as written.

## Deliberately not done

- The ×1.1 pad is **not** copied over with the floor — it is headroom over upstream's own
  ESTIMATE of the text; over a typed number it only makes the readout lie by 10 %.
- `duration_seconds: 0` (the estimator) stays banned — MPI-607 removed it because the
  estimate makes the model read the prompt aloud.
- Trimming the lead-in silence — **decided against, no card** (Fabio, 2026-08-28). The
  floor is the fix: 4 s comes back as a usable 4 s of line, so a trim buys nothing, and it
  would cost an MpiNodes node plus a graph re-export.
