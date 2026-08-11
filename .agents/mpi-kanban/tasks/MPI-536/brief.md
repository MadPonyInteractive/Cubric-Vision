# MPI-536 — LTX 2.3 foley: wire the proven bench workflow into the app as a Flow

**BLOCKED on MPI-531** (authoring shape), not on research. The workflow itself is
finished, executed and approved by ear. Nothing here is investigation.

## What already exists

`comfy_workflows/raw/ltx_v2v_foley_template.json` — **53 nodes, 86 links**, sha
`e947b371e3611748`, byte-identical to the copy that executes on the bench
(127.0.0.1:8188). The full authoring history, every root cause and the code lines
that prove them are in `tasks/MPI-4/validation.md` — **read that before touching
this card.**

Proven behaviours:

- **Full-clip by construction.** `#23 clip frames` (`floor((a-1)/8)*8+1` off
  `Input_Video.frame_count`) drives the foley window, the audio latent length and
  the mask end time from one place. The old `Input_Duration` knob was deleted
  because `min(requested, clip)` silently truncated the delivered **video** on any
  clip longer than its 5s default.
- **The delivered pixels are the source's, never the encode's.** `#46
  Output_Video.images` comes off `#105 Foley Window` off the raw `#17
  Input_Video`. Verified: a 1280x704 input returns 1280x704 while the model
  encodes at 832x480.
- **Audio level settled at `#118 CFGGuider.cfg = 3.0`**, chosen on the user's ear
  over a measured sweep. Mean -33.2 dB / max -1.5 dB.
- **The negative prompt only works because of that cfg.** At cfg 1 core
  `CFGGuider` sets `uncond_pred = None` (`comfy/samplers.py:610`), so no uncond
  pass runs and `Input_Negative` is inert. Do not "optimise" this back to cfg 1.
- **`LTX2_NAG` was tried and rejected on evidence** — wired, run, measured, no
  audible gain, reverted. Full reasoning in `MPI-4/validation.md`; do not re-try
  it while cfg is 3.0.

## Why this is BLOCKED on MPI-531

MPI-531 is the 1.5 authoring-shape card. Today `FlowStepField`
(`MpiBaseFlow/stepKinds.js` + the `FlowDef` typedef in `js/data/flowsRegistry.js`)
is one row of `select | button | toggle`. This flow's controls are not expressible
in that set, so authoring it now means writing a **new JS `uiComponent`** — and
MPI-531 item 4 would then have to port it back to declarative steps. MPI-531 item 1
(extend `FlowStepField` with slider / number / text) is the specific dependency.

Start this card when MPI-531's item 1 has landed, then author declaratively via
`steps` + `fields` with **no new `uiComponent`**.

## Work

1. **Follow `/mpi-add-flow`.** `docs/playbooks/add-flow/` — README hub, then
   `01-descriptor-and-ops.md` for the `FlowDef` and the op's 4 files, `02-media-io.md`
   for the media slots. This is a **Flow**, so there is no `ModelDef`, no
   `supportedOps`/`workflows` entry in `models.js`, and no `dependencies.js` entry —
   it runs on the already-wired LTX 2.3 checkpoint.
2. **Shape** (playbook step 0): single model (LTX 2.3), video in → video out,
   `mediaType: 'video'`. Inputs: the source video, a positive prompt, a negative
   prompt. Foley generates no new frames, so there is no resolution or duration
   control to expose — see the deliberate omissions below.
3. **Fan to API format** and convert **against the app engine (48188), not the
   bench (8188)** — the bench runs ahead and has silently shifted a widget before.
4. **Check the injectable node titles** against the `Input_*` / `Output_*` title
   law before the first inject test. The injector **silently skips** a title with
   no matching node, so a mis-titled node fails as a mystery rather than an error.

## Deliberately NOT exposed, and why

- **No resolution control.** `Input_Width` / `Input_Height` were deleted from this
  graph because they fed only the encode and never the delivered pixels. 832x480
  now lives in `#28 Resize To Target`'s own widgets. **This is the opposite of
  MPI-520/extend**, where `#28`'s output IS the delivered clip and the inputs must
  be restored — do not carry the decision across.
- **No duration control.** Foley is whole-clip by design.
- **No length cap yet, and long clips will OOM.** Chunking was considered and
  rejected: each chunk re-rolls its own noise, so the ambience jumps at every
  seam. A cap with a real user-facing message belongs here, in the app, once the
  ceiling has been measured on a target card. Note the cost: with resolution gone,
  this graph has no VRAM lever left.

## The product decision this card owns

**Foley mode and voice mode are mutually exclusive settings in one file, and must
not ship as two toggles that look composable.** The MPI-4 handoff parked this "at
MPI-520" — the wrong card, since MPI-520 explicitly excludes foley. It lives here.

- Voice mode needs a real path in `Input_Audio#106` (`block_if_empty=true`, so an
  empty string **blocks** once the toggle executes it), the speech terms removed
  from `Input_Negative#13`, and `Foley_Lora#100` set to `None` so the SFX LoRA and
  the ID LoRA are not stacked.
- `Audio_Influence#110` is **dead in foley mode** — it reaches `#115` only through
  `#113`'s TRUE branch and `#113`'s boolean is `Input_Use_Input_Audio`. Do not
  surface it as a foley control.
- Voice mode has **never been run**. It is untested configuration, not a shipped
  feature, and the decision may well be to ship foley alone in v1.

## Related

- `MPI-4` — the LTX umbrella. Brief + validation carry everything above in full.
- `MPI-531` — the blocker. `MPI-529` (Flow Library v2), `MPI-332` (rips the three
  test flows) sit upstream of it.
- `MPI-520` — the extend twin. Same playbook, opposite resolution decision.
- `MPI-537` — lipsync, the third front end.
