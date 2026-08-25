# Voice Changer (MPI-607) — the first audio-only Flow

> Part of [add-flow/existing-flows](../README.md). Record a performance → pick a target
> voice → `FL_ChatterboxVC` → an audio gallery card. **Audio in, audio out, no picture
> anywhere in the run.** Read this before touching the flow, its graph, or the Chatterbox
> deps.

## Shape

| | |
|---|---|
| id / op | `voice-changer` / `flowVoiceChanger` |
| graph | `comfy_workflows/flow_voice_changer.json` (5 nodes) |
| `requiredModels` | `[]` — no model, no model picker, no diffusion |
| `requiredDeps` | `chatterbox-vc-s3gen`, `chatterbox-vc-conds`, `ComfyUI_Fill-ChatterBox` — **1.057 GB** |
| `mediaType` | `'audio'` — the first flow to use it |
| inputs | `audio1` → `Input_Audio` (performance), `audio2` → `Input_Audio_2` (target voice) |
| output | `SaveAudio` titled `Output_Audio`, flac |

The graph is deliberately tiny: two `MpiLoadAudio` path readers and an `MpiInt`
(`Input_Seed`) into `FL_ChatterboxVC`, out through a native `SaveAudio`. No text node
exists anywhere — see the prompt trap below.

## Why this is a FLOW WITH DEPS, not a model and not a plugin

Chatterbox has no place in the model picker: it is not a checkpoint, it has no ops, and a
`ModelDef` would force a row of dead fields. It is not a Plugin either — by that entity's
own definition a plugin is *not* a tile in the Flow Library, and this must be one.
`head-swap` is the precedent: `requiredModels: []` plus flow-only weights in
`requiredDeps`.

## 🔴 The weights MUST stay `targetPath`

`get_chatterbox_models_dir()` computes `<ComfyUI>/models/chatterbox/` from the pack's own
`__file__` and **never reads `extra_model_paths.yaml`**. Anything missing from there is
`hf_hub_download`ed on first use — outside the download manager, so no progress UI, no
sha check, no GC, and repeated after every engine reinstall. Filing the weights under
`mpi_models/` therefore does not move them, it silently duplicates 4.25 GB. Same class as
RIFE (MPI-222). Verified against a real install: the bench's
`models/chatterbox/chatterbox_vc/` holds `s3gen.pt` at 1,057,165,844 bytes and `conds.pt`
at 107,374 — byte-identical to the `assetDeps.js` entries.

## 🔴 Do NOT declare `ComfyUI-MpiNodes` in `requiredDeps`

The graph runs `MpiLoadAudio` and `MpiInt`, so declaring the pack looks obviously right.
It is wrong twice over, and it cost a red test before it was caught:

1. **`requiredDeps` means "flow-only weights/nodes that NO MODEL requires."** Every model
   in the registry declares `ComfyUI-MpiNodes`, so the declaration does not describe this
   flow at all.
2. **A flow's deps are protected UNCONDITIONALLY.** `_localSharedDepsMap` gates a model's
   deps on that model having a footprint on disk, but a flow is always "present", so
   `_flowRequiredDepIds()` pins whatever it names for every uninstall. Naming a dep the
   whole registry shares pinned it globally and broke the MPI-258 B1 invariant — a tier
   family with neither transformer installed must stay deletable
   (`tests/shared-dep-uninstall-direction.test.cjs` case 4, the one guarding ~19 GB of
   previously-stranded weights).

**It installs anyway, and that is the point.** `getUniversalWorkflowDepIds()`
(`routes/shared.js`) returns *every* dep with `type: 'custom_nodes'`, and the engine boot
gate installs and drift-repairs that whole set independently of any model or flow.
Confirmed empirically: `ComfyUI_Fill-ChatterBox` appeared in the app engine's
`custom_nodes/` after Gate 1 landed, with nothing declaring it and nothing installed.

`ComfyUI_Fill-ChatterBox` IS declared, because no model requires it — the same reason
head-swap declares `comfyui-inpaint-cropandstitch`. That declaration is what puts the
pack on the flow's slide-over required list; it is not what installs it.

## 🔴 Perth marking is opt-in and fails as ONE stdout line

`resemble-perth` is **commented out** of the pack's `requirements.txt`, and `tts.py` /
`vc.py` / `mtl_tts.py` each wrap `import perth` in `try/except`, print one warning, and
then ship UNMARKED audio forever. It is pinned in `dev_configs/python_deps.in` for EU AI
Act Art. 50 (in force 2026-08-02; Vision is the provider).

**"Installed" is not "applied" — prove it on a generated file.** Measured on this flow's
own output:

| file | `PerthImplicitWatermarker.get_watermark` |
|---|---|
| the flow's VC output | **1.0** |
| its source clip (control) | 0.0 |

The control is not optional: without it a detector stuck at 1.0 reads as a pass.

## The prompt node that must NOT exist

`_buildParams` emits `Input_Positive: ''` on **every** run, whether or not the flow
collects a prompt. A graph with a node titled `Input_Positive` therefore gets its baked
instruction wiped. This graph has no text node at all, and the inject test pins that
absence. Outpaint and Head Swap solve the same trap the same way. Do not "fix" it by
adding the title — the empty string is deliberate everywhere else.

## No `fields`, no `steps`, no `result.compare`

- **Seed** is filled by `_buildParams` from the run's own seed via the `Input_Seed`
  `MpiInt` convention — no control needed.
- **`use_cpu` / `keep_model_loaded`** are the only other knobs `FL_ChatterboxVC` exposes,
  and both are engine plumbing, not user choices.
- **`result.compare` is omitted** — the shared before/after surface is a draggable reveal
  bar over two images, and there is nothing to reveal between two waveforms.

What actually decides the result is how the performance is recorded, and that is
guidance, not configuration. See below.

## The four user-guidance rules (all measured, MPI-607 session 13)

1. **Perform, but do not push.** Performance and identity trade against each other, from
   both ends: VC-source `exaggeration` 1.2 holds identity at cosine 0.79–0.87, 1.5 drops
   to 0.70, 2.0 to 0.61 — and by ear a flatter input picks up the target voice better
   while a strong performance bleeds the source through.
2. **Pick a target that sounds nothing like you.** Similar voices make the conversion
   nearly inaudible. This is the likely shape of any "it did nothing" report.
3. **Meet the target's pitch — because VC will not meet you.** This is the rule most
   likely to be misread, so state the mechanism: **VC moves everything only PART of the
   way.** It does not transplant you onto the target's pitch; it drags your pitch a little
   toward it and stops (measured: 101.8 → 94.2 Hz against a 125.7 Hz target; 128.6 →
   115.9 against the same one; 200 → 162 in the worst case). So a large pitch gap yields
   **the target's timbre at a pitch that voice never uses**, which is the unnatural result
   — and at the extreme it is why a pushed high take still sounds like the speaker.
   Closing the gap is your job, not the model's.
4. **Hold that pitch steady** — drift within a take drifts the output.

Rules 2 and 3 only *look* contradictory: distance in **timbre** is what makes the
conversion audible, distance in **pitch** is what you compensate for.

## What comes from you, and what comes from the target (measured, MPI-622)

The split is not "your words in their voice". It is sharper than that, and it decides both
what to promise and what not to:

| channel | comes from |
|---|---|
| timbre / speaker identity | the **target** |
| pitch contour, rhythm, duration | **you** (moved partway toward the target) |
| **accent and articulation** | **you** — and the target's is *overwritten*, not blended |
| non-verbal sound (laugh, breath, cough, shush) | **you** |

The accent row was proven against a target whose own accent had been measured directly: a
character clip that is neutral modern American on the no-VC route came out with the VC
source's accent, and so did a completely different character driven from that same source.

**So the flow's copy is honest exactly as written** — "your laugh, your breath, your timing,
in someone else's voice" — and it is honest *because* those channels stay yours. What must
never be promised is the reverse: **a target voice's accent is not on offer.** Picking a
British-sounding target does not make you sound British; it makes a British-sounding voice
speak with your accent.

One smaller measured note: **VC softens consonant articulation** slightly. The same voice is
crisper on a direct-TTS route than through VC. Not a defect, and not worth a warning — but
it is why a mumbled source gets no clearer on the way through.

## What this flow can do that the TTS flow structurally cannot

**VC passes non-verbal sound through.** A cough, a shush, a laugh, a breath all arrive in
the target voice, because the input is a real recording. Flow B (Text to Speech) generates
its stage-1 audio from TEXT, so it has no mouth sounds to carry. "Your laugh, your breath,
your timing, in someone else's voice" is this flow's copy and Flow B has no answer to it.

This is also why Turbo was dropped rather than shipped: its distinctive feature is nine
paralinguistic tags (`[laugh]`, `[cough]`, `[shush]`…), and VC gets those for free from a
real performance. **Turbo is dropped for REDUNDANCY, not weakness** — it was never
measured fairly, because its node hides `exaggeration` AND `cfg_weight` and runs both at
0.0, and `cfg_weight` is MPI-607's central finding.

## Not in this flow

- **No TTS.** Flow B is separate, needs the other 4.25 GB (`chatterbox-ve` / `-t3` /
  `-s3gen` / `-tokenizer` / `-conds`), and waits on ~5–8 authored performance clips that do
  not exist yet. Those five dep ids are deliberately owned by nobody until it lands.
- **No accent selector.** Accent is a runtime parameter of
  `FL_ChatterboxMultilingualTTS`'s `language` selector, which is a stage-1 concern — this
  flow has no stage 1. Whether an accent SURVIVES the VC stage is still open and gates
  Flow B, not this one.
- **The dialog node is broken** for an unrelated reason: torchaudio 2.11 routes `.save()`
  through torchcodec, which is not installed, so `chatterbox_dialog_node.py:63` dies
  before parsing a single `SPEAKER` line. Our own dialogue splitter would hit this
  identically if it calls `torchaudio.save` — use `soundfile`, or add torchcodec.
