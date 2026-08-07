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
- [x] `npm test` 492/492.

## Remaining — the Vision half

- [x] **The `@` reference picker.** Typing `@` in a ref2v_ms prompt lists the staged chips
      and inserts the chosen tag at the caret; arrows move, Enter/Tab pick, Escape closes,
      a click picks via mousedown (click would blur the textarea first). Arms only for an op
      whose slots carry tags, so `@` stays an ordinary character everywhere else. The matcher
      is `matchRefTagQuery` in `commandRegistry.js` — pure, so its edge cases are unit-tested
      rather than eyeballed: `fabio@picture` must NOT open a picker, `@ ` closes one, and
      `@pic` finds `Picture 1` despite the space in the tag.
- [x] `progressStages` for `minimax_h3_r2va.json` = `{ single: 2, preview: 1, stage2: 1 }`.
      Not a guess and not a copy-paste: the two graphs share their entire sampler tail —
      node 153 (`Stage1_Bypass`) and 156 are the same two `SamplerCustomAdvanced` nodes
      under the same ids and titles in both files, and only the head differs. A whole run
      is both passes = 2 bars; either half alone is 1. Re-count for real if the tail ever
      stops being shared.
- [ ] **A ref2va preview clip.** The ModelDef currently borrows `minimax_h3_preview.mp4`,
      which is fl2va's. Swap the filename once a run on the CORRECT transformer is judged.
- [ ] Run one generation per op in the real app (`06-verify.md`).
- [ ] `docs/models/h3/README.md` ref2va section — held until a real reference run is judged.

## RESOLVED — audio tag ordinals

Core shares ONE audio sequence between reference videos and standalone clips, emitting a
video's soundtrack BEFORE its `<Video k>`, so a sounded reference video pushes the first
standalone clip to `<Audio 2>`. Whether a video HAS a soundtrack is a property of the FILE —
`MpiLoadVideo` returns the 1-sample sentinel for a track-less one and `MpiH3References` drops
it — so the ordinal moves on a fact nobody knows until decode time. Neither the app nor the
user can label the wells correctly up front.

**Fix: the node translates.** `rewrite_prompt_tags` in `h3.py` takes the prompt addressed by
SLOT (exactly what the chips show) and rewrites it to core's ordinals at execution, where both
numberings are known. A tag naming an empty slot is DROPPED — core presents no such label, so
a dangling one sends the model looking for a reference that is not there. Video soundtracks
stay unaddressable on purpose: they have no well, and `<Video k>` already names the clip.

Chips therefore stay slot-numbered and are always right, and the picker needs no `hasAudio`
probing. Covered by six asserts in `python h3.py`, including the two that pin the shift
(`<Audio 1>` stays `<Audio 1>` behind a silent video, becomes `<Audio 2>` behind a sounded one).

Rejected: always emitting the soundtrack slot. `_encode_ref_audio` resamples then VAE-encodes,
and a 1-sample tensor at `movedim(1, -1)` is a crash or a degenerate latent.

**Unpushed.** `ComfyUi-MpiNodes` is committed locally only, and the ENGINE MUST BE RESTARTED
after it lands or the converter fails with "class not in /object_info".

## Judgement owed before the Vision half

- [ ] **Re-judge every r2va result.** Until the 2026-08-07 re-export, the graph loaded the
      **fl2va** transformer. It does not error — it samples fine and returns a good-looking
      video that ignored the references. So the `match` vs `max` quality comparison and the
      placeholder reel clip were both produced on the wrong DiT.
- [ ] Confirm identity actually follows the reference now. That is the model's entire claim
      and nothing has tested it on the correct weights.
