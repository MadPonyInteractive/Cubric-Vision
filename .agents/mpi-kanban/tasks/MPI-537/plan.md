# MPI-537 Plan — LTX 2.3 lipdub: author and prove the graph on the bench

**Scope:** bench authoring only. Author the graph, run it on 8188, prove it.
App integration is a later card and follows `/mpi-add-flow`.

**Ownership:** `comfy_workflows/raw/ltx_v2v_lipdub_template.json` (new) and this
card's workspace. Nothing in `js/`, `routes/` or `dev_configs/` — this card ships
no app wiring.

**Verify mode:** user-ux — the pass/fail judgement is identity, lighting and
background drift, which only Fabio's eye can call.

## Current State

Phases 1–4 done. The graph is authored, proven on the bench, and now carries the
`Input_*`/`Output_*` title law: **35 nodes / 48 links**, converting to **33 API
nodes** with 0 unknown, 0 missing-required, 0 dangling and nothing unreachable, one
output node (`Output_Video`). Bench and repo copies are byte-identical.

Six injectable titles: `Input_Video`, `Input_Audio`, `Input_Positive`,
`Input_Negative`, `Input_Seed`, `Output_Video`.

**All five phases complete.** Fabio judged the retitled graph working ("the phase4
generation works well"), which satisfies this card's `user-ux` verify mode. Two-stage
is OUT for v1. The i2v thread is retired here: image-to-video with an audio track
already works in the shipped app across multiple characters, so the missing piece was
always the **video-in** front end — which is this graph.

## Plan Drift

- **2026-08-11 — the audio front end is not what `brief.md` § Work item 3 says.**
  The brief reads as if the source audio drives the lip sync and swapping it to an
  audio loader gives "supply audio, get lipsync". Traced from the graph, that is
  wrong in one direction. `#3980 LTXVEmptyLatentAudio` feeds
  `#4528 LTXVConcatAVLatent.audio_latent`, so **the audio is generated too**: the
  *words come from the prompt text* (`#2483`; note `#5020` states the model will
  not translate for you), and the source audio enters only through
  `LTXVSetAudioRefTokens` as **speaker-identity context** — `iclora.py:534`,
  patchified and prepended with negative temporal positions "so they serve as
  identity context without being part of the generated output". Swapping that
  socket to an audio loader therefore swaps the **voice**, not the spoken content.
  What makes the graph audio-*driven* is the node's unused third output,
  `frozen_audio` (`noise_mask=0`, "fully frozen during denoising"): linking it into
  `#4528.audio_latent` in place of the empty latent preserves the supplied track
  and leaves only the video to generate. That is a **one-link swap**, and it is why
  the RuneXX collection carries both a `_custom_audio_…` and a
  `_prompt_lip-synced-voice_…` variant. Both modes therefore live in one file.

- **2026-08-11 — Phase 4 is two node SWAPS, not two renames, and it bakes the
  loaders.** `MpiLoadVideo` emits `images`/`audio`/`fps` directly and has no `VIDEO`
  output, so it replaces **both** `#5002 LoadVideo` **and** `#5010 GetVideoComponents`
  — its slots 0/1/2 land on exactly the consumers `GetVideoComponents` fed.
  Symmetrically `MpiSaveVideo` takes `images`/`audio`/`fps`, so it replaces **both**
  `#4849 CreateVideo` **and** `#4852 SaveVideo`. Net −7/+6 nodes. Separately, the
  template still named `…_transformer_only_bf16` and `gemma-3-12b-it-heretic-fp8-comfy`
  — the weights this install does not have — so the first Phase 4 queue attempt
  returned the same 400 `prompt_outputs_failed_validation` Phase 1 documented. The
  substitution is now **baked into the template** (the values `ltx_v2v_foley_template.json`
  already ships) rather than re-applied by hand on every run. A template that cannot
  queue on our own install is broken, and the app card would have inherited that too.

## Phases

### Phase 1: Sync the bench template into the repo and prove it converts

Copy the bench copy into `comfy_workflows/raw/ltx_v2v_lipdub_template.json`
byte-identical, then convert it with
`node scripts/workflow-to-api.mjs comfy_workflows/raw/ltx_v2v_lipdub_template.json`
(single-file mode → stdout, writes nothing) against **8188** and assert 0
missing-required inputs and 0 dangling links. The two dead `GemmaAPITextEncode`
nodes (`#4980`, `#4981`) are unwired downstream and need an LTX API key; note them
for the Phase 4 prune, do not remove them yet.

**Verify:** repo copy sha256 == bench copy sha256; conversion reports 0 missing
required and 0 dangling.

### Phase 2: Pick a source clip and run the rephrase baseline

`#5002 LoadVideo` points at `lipdub_input.mp4`, which **does not exist** in the
bench input dir — the graph cannot run as shipped. Pick a talking-head clip with
speech (the voice reference is what the ref tokens clone), confirm the choice with
Fabio before spending GPU, and run the template's own rephrase mode API-only via
`POST /api/prompt`. Do not touch the saved workflow.

**Verify:** `/history` shows `status success`, 0 `node_errors`, and an output video
that decodes with both streams.

### Phase 3: Wire the frozen-audio mode and run it

Relink `#4528 LTXVConcatAVLatent.audio_latent` from `#3980 LTXVEmptyLatentAudio:0`
to `#5006 LTXVSetAudioRefTokens:2` (`frozen_audio`) and run again on the same
source. This is the "custom audio, lips follow it" case. Decide from the two runs
whether v1 ships one mode, both behind a toggle, or two files — and record which,
with the reason.

**Verify:** the run passes, and its output audio is measurably the supplied track
rather than a regenerated one.

### Phase 4: Rename to the `Input_*` / `Output_*` title law and prune

Retitle the injectable nodes so the later app card inherits an injectable file
rather than a rename pass — the injector **silently skips** a title with no
matching node. Swap core `LoadVideo` for `MpiLoadVideo` titled `Input_Video`, as
foley does. Drop the two dead `GemmaAPITextEncode` nodes and `#4979 PrimitiveString`
if nothing else reaches them. Every edit is applied to the **bench copy in place**,
asserting `pos`/`size` unchanged on every surviving node, then read back **from the
bench** and synced to the repo.

**Verify:** re-convert clean; bench copy and repo copy byte-identical; a run still
passes after the rename.

### Phase 5: Judge drift with the user and record evidence

Identity, lighting and background are all regenerated from the IC-LoRA guide. A run
that syncs the lips perfectly and changes the person's face is a **failure**. Put
the outputs in front of Fabio, take his call, and write the runs, the settings and
the verdict into `validation.md`.

**Verify:** Fabio's own confirmation, recorded in `validation.md` with the prompt
ids and the settings that produced it.

## Remaining Work

None on this card. Close it.

**The app-side Flow card DOES NOT EXIST YET — create it.** Its two siblings do:
MPI-536 (foley) and MPI-520 (v2v extend), both `todo`/blocked on **MPI-531**
(`FlowStepField` is `select|button|toggle` only, so authoring any of them today
needs a JS `uiComponent` that MPI-531 item 4 must then port). MPI-520's own
description already points at "lipsync MPI-537". Mirror those two, carry the
constraints below, and block it on MPI-531 like the others.

Carried to that card (NOT this card's work): what happens when the user's clip is a
wide shot (auto-crop / warn / refuse), and how the UI relates line length to clip
duration. Still untested anywhere: clips over 3s, multiple speakers, non-English, and
whether a ~5s voice reference clones better than a 3s one.

## Verification

**Verify mode:** user-ux

Phases 1, 3 and 4 self-verify (conversion checks, sha compare, run status). Phases 2
and 5 end on Fabio's eye — the drift judgement is the card's real pass/fail and no
metric substitutes for it.

## House rules that are not optional here

Carried from MPI-4, where they were learned the expensive way:

- Edit the bench copy **in place**. Never regenerate a workflow file — Fabio
  hand-organises node positions and a rebuild destroys that work.
- Assert `pos`/`size` unchanged on every surviving node after each write, then read
  the file back **from the bench**, not from what was posted.
- **The modified dot is the tell:** re-fetch after Fabio touches the tab, and ask
  him to save or discard before writing.
- Run every experiment API-only (`workflow-to-api.mjs` → `POST /api/prompt`) so the
  saved workflow is never touched.
- Convert against **48188** for anything the app will ship; 8188 is the bench. Both
  are on ComfyUI 0.31.0 today, but the bench has silently run ahead before.
