# MPI-475 — checklist

## Done — the ComfyUI half

- [x] **`MpiH3References` written** (`c:\AI\Mpi\ComfyUi-MpiNodes\h3.py`). 18 flat optional
      slots, empties dropped by the loaders' sentinel, survivors renumbered from 0 so core's
      index-based soundtrack pairing holds. Delegates the conditioning to core's own
      `MiniMaxH3ReferenceToVideo` rather than copying its tensor maths.
- [x] Registered in `__init__.py` (import + class map + display map), README row, changelog
      entry — the `new-node` command's steps 5-7.
- [x] Self-check: `python h3.py` asserts the renumbering, pairing across a gap, and both
      sentinels (a 1x512 strip and a real silent clip must NOT read as empty).
- [x] **Proved by output** — bench prompt `8da14ac3`, one reference image, 14 empty slots
      dropped, `Output_Video` written. Covers the one thing the self-check cannot: calling
      core's V3 `execute()` classmethod directly.
- [x] Committed and pushed (`ComfyUi-MpiNodes` `a603fc4`, main). No registry publish fired —
      `publish_action.yml` filters on `pyproject.toml`, which the commit does not touch.
- [x] **`generate_h3.py` handles both variants** (`8e40d43b`). `VARIANT_SPECS` carries the
      per-variant transformer, media titles, branch class and count; prune/bake/stage asserts
      stay shared. fl2va output byte-identical after the refactor.
- [x] `comfy_workflows/minimax_h3_r2va.json` baked — 49 nodes, correct ref2va transformer,
      `Input_Refs` titled, `ref_image_size` baked to `match`, zero leftover bench paths, all
      15 loaders `block_if_empty: false`.
- [x] Passes `validate-injection-rules.mjs`.

## Done — the Vision half (registry + controls)

- [x] Dep `minimax-h3-ref2va-transformer` at the **publisher's** URL, never R2. 20.97 GB,
      sha256 `9255f52b…` off the local `G:\CubricModels` copy — and it differs from fl2va's
      `e889202c…` despite the two files being byte-for-byte the same SIZE, which is why the
      wrong-transformer bug was invisible.
- [x] **NEW OP `ref2v_ms`** rather than riding `t2v_ms`. Three reasons, in `commandRegistry.js`:
      `mediaInputs` lives on the OP so 15 slots would land in front of LTX/WAN; `t2v_ms`
      already declares an audio slot titled `Input_audio` where this graph has `Input_Audio`,
      which injection would silently skip; and "Text to Video" is the wrong label. Registered
      in BOTH mirrors (`operationRegistry.js` + `operation_registry.json`),
      `appVersionIntroduced: 1.4.0` to match `control`.
- [x] `OP_ORDER` gains `ref2v` (between `i2v` and `extend`) — an unlisted `short` sorts to the
      end of the strip, and `op-strip-availability.test.cjs` fails on it.
- [x] `models.js` ModelDef `minimax-h3-ref2va`. `type: 'h3'` reuses the ratio ladder → no
      type-consumer sweep owed. Resolves to 54.91 GB, of which 33.94 GB is already shared with
      fl2va, so the real cost on top of fl2va is the 20.97 GB transformer alone.
- [x] `capabilities: { multiStage, singleFileStages, audio: true, negativePrompt: false }`.
      `audio: true` is load-bearing — `filterMediaInputsForModel` hard-drops every audio slot
      from a model without it. `negativePrompt: false` is what keeps that honest: the audio
      capability also arms the MPI-474 audio-negative stop, and this graph has neither an
      `Input_Negative_Audio` nor an `Input_Negative` node. Full consumer sweep of
      `capabilities.audio` done — the only other reader is the audioMode/useAudio gate, and
      neither control is in this op's `components`.
- [x] Media-slot declarations: 9 image / 3 video / 3 audio, all `ordinal`, none required
      (a reference-less run is legal, and requiring an IMAGE would block a video-only run).
- [x] The `refImageSize` control → `params['Input_Refs.ref_image_size']` via the MPI-359
      dotted form, default `match`, persisted per-op.
- [x] **Chips wear their prompt tag.** Slots carry a `tag` (`Picture 1` … `Audio 3`) and the
      chip badge renders it instead of its strip position — the two diverge as soon as types
      are mixed, because the tag ordinal counts WITHIN a type.
- [x] **Chip strip scrolls** — `max-height: 13rem` + `overflow-y: auto`. Wrap, FLIP and
      pointer reorder untouched; 15 chips would otherwise climb the viewport (the strip is
      anchored `bottom: 100%`).
- [x] **New guard**: `every media slot a model can actually see exists in that model's
      workflow`. Nothing swept `mediaInputs` titles before — only `injectParams` — so 15 slots
      were 15 silent-skip chances. Mutation-tested (a bogus `Input_Image_77` fails it).
      Its gating mirrors `filterMediaInputsForModel` so it does not demand Klein's
      depthSubject slots of Krea2 or LTX's audio slot of WAN.
- [x] Reworked `every dotted injection key…` (was `every MpiStyleSelector is titled…`). It
      asserted all dotted keys addressed ONE node — true only while the style rack was the
      sole user. Now grouped by title, and it additionally proves each dotted title exists
      in some workflow.
- [x] `npm test` 483/483.

## Not started — the Vision half (remainder)

- [ ] **The `+` reference picker.** Typing a trigger character pops a list of the staged
      chips and inserts the chosen tag. Blocked on the audio-ordinal decision below.
- [ ] `progressStages` for `minimax_h3_r2va.json` — needs a LIVE run to count bars. fl2va is
      `{ single: 2, preview: 1, stage2: 1 }`; not guessed.
- [ ] **A ref2va preview clip.** The ModelDef currently borrows `minimax_h3_preview.mp4`,
      which is fl2va's. Swap the filename once a run on the CORRECT transformer is judged.
- [ ] Run one generation per op in the real app (`06-verify.md`).
- [ ] `docs/models/h3/README.md` ref2va section — held until a real reference run is judged.

## The open decision — audio tag ordinals

Core shares ONE audio sequence between reference videos and standalone audio clips, and emits
a video's soundtrack BEFORE its `<Video k>`. So a sounded reference video pushes the first
standalone clip to `<Audio 2>`. The app cannot know which staged videos carry audio at
prompt-writing time: `MpiLoadVideo` emits the 1-sample silent sentinel for a track-less file,
`MpiH3References` drops it, and the ordinals shift. `Picture N` / `Video N` are exact
regardless; only the three `Audio N` tags are affected.

Two ways out, both the user's call:

1. **Unwire the three `ref_video_audio_*` links** in the template. Reference videos then
   contribute motion only, standalone audio is always `<Audio 1..3>`, and the whole UI is
   deterministic with zero extra logic. Cost: a reference video's soundtrack no longer
   conditions the result (the user can stage that audio separately).
2. **Keep them** and accept that the audio tags can be off by the number of sounded reference
   videos. Would need the picker to resolve `hasAudio` per chip — the project `.meta/` sidecar
   already carries `hasAudio` for project videos (`routes/projects.js`), but not for a file
   dragged straight in.

Not viable: always emitting the soundtrack slot. `_encode_ref_audio` resamples and VAE-encodes
the waveform, and a 1-sample tensor through an audio VAE is untested at best.

## Judgement owed before the Vision half

- [ ] **Re-judge every r2va result.** Until the 2026-08-07 re-export, the graph loaded the
      **fl2va** transformer. It does not error — it samples fine and returns a good-looking
      video that ignored the references. So the `match` vs `max` quality comparison and the
      placeholder reel clip were both produced on the wrong DiT.
- [ ] Confirm identity actually follows the reference now. That is the model's entire claim
      and nothing has tested it on the correct weights.
