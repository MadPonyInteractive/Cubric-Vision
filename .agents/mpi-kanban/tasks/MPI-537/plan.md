# MPI-537 Plan — LTX 2.3 lipdub: author and prove the graph on the bench

**Scope:** bench authoring only. Author the graph, run it on 8188, prove it.
App integration is a later card and follows `/mpi-add-flow`.

**Ownership:** `comfy_workflows/raw/ltx_v2v_lipdub_template.json` (new) and this
card's workspace. Nothing in `js/`, `routes/` or `dev_configs/` — this card ships
no app wiring.

**Verify mode:** user-ux — the pass/fail judgement is identity, lighting and
background drift, which only Fabio's eye can call.

## Current State

Bench `LTX_lipdub_v2v_template.json` read in full: 36 nodes, 49 links. Every node
type and `LTX2.3\ltx-2.3-22b-ic-lora-lipdub-0.9.safetensors` are present on both
8188 and 48188 (`/object_info`, 2026-08-11). Nothing in `comfy_workflows/raw/` yet.

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

All five phases.

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
