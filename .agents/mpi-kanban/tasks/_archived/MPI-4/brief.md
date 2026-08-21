# MPI-4 — LTX 2.3 video model integration

> **SESSION HELPER / CONTINUE CARD.** This card drives the LTX-2.3 work. The
> sequencing lock ("post-release only") is LIFTED — v1.0.0 shipped (2026-06-10),
> we're post-release. Read this whole file to resume in a fresh session.

## Inherited from MPI-128 (2026-06-27) — deferred LTX scope

MPI-128 (app integration) shipped its core (dual-latent stage-2 staging + the
`_ms`→`isMultiStage` refactor) and closed. Two of its items are AUTHORING/branch
work that belongs here:

- **Multimodal input UI (5+ images).** LTX upstream will accept 5+ input images
  (+ audio, video on some ops). The `{key, mediaType, min, max}` media-slot seam
  is already in place from MPI-127; `max` reads from model capacity. **Blocked on
  LTX upstream** — when it lands, bump the data + build the multi-image UI. No
  op/executor rewrite (data + UI only).
- **Deferred LTX branch workflows** (each its own `LTX_*_template.json`, fanned by
  `generate_ltx.py`): lipdub v2v (LoadVideoUpload-split bug), lipsync-v2v-2, video
  extend, CTRL/pose (IC-LoRA union + SDPose wholebody), head-swap (BFS nodes —
  `ComfyUI-BFSNodes`, dropped from MPI-127 ship set). Most reuse the existing
  handler once authored.

## Reference — external workflow library (2026-07-07)

- **Official Lightricks ComfyUI-LTXVideo** (node repo + example workflows):
  https://github.com/Lightricks/ComfyUI-LTXVideo
- **RuneXX LTX-2.3 workflow collection** (many workflows to mine/port):
  https://huggingface.co/RuneXX/LTX-2.3-Workflows/tree/main
- **V2V Foley (add sound to any video)** — the old URL 404s, RuneXX renamed it
  and now ships two. Current (needs a 227 MB Foley IC-LoRA):
  `Video-2-Video/LTX-2.3_-_V2V_Foley_Add_Sound_To_Any_Video_Foley-Lora.json`
  Previous (no LoRA, `LTXVAudioVideoMask`-based):
  `..._Foley_Add_Sound_To_Any_Video_old_version.json`
  List a folder with `https://huggingface.co/api/models/RuneXX/LTX-2.3-Workflows/tree/main/<dir>`
  rather than guessing a filename.

## Session note (2026-06-21) — PARKED mid-deconstruction

Started deconstructing the NerdyRodent monolith into per-op app workflows. Two
decisions LOCKED this session before parking:

1. **i2v/t2v ship as SEPARATE files, NOT one boolean-switched workflow.** Reason:
   app maps op→workflow file 1:1 (`model.workflows[op]`, `supportedOps`), and
   Comfy `/prompt` has no runtime node-bypass, so a single boolean-branched file
   still executes both branches' graph. Two files = zero new app plumbing, matches
   WAN. Confirmed against `commandRegistry.js` (`t2v`/`i2v`/`_ms` ops) + `models.js`
   (WAN i2v/t2v each declare one workflow per op).
2. **LTX is multi-stage `_ms`** → 4 files total: `LTX23_i2v.json` +
   `LTX23_i2v_stage2.json` + `LTX23_t2v.json` + `LTX23_t2v_stage2.json`. Every
   NEW app-read/write node carries `Input_*`/`Output_*` prefix (Tier-1 reserved
   titles stay bare — `Preview_Only`, `SaveLatent`, `LoadLatent`, `Seed`,
   `Positive`, `Negative`, `Duration`, `Motion_Intensity`, `Start_Frame`,
   `End_Frame`, `Lora_*`, `Output`, `Output_Video`, `Output_Audio`, `Preview`).
   `allowsBranchingContinue = false` (no per-stage LoRA variance) → Finish-only.

**Why parked:** the manual ComfyUI steps to derive the `_stage2` API file (bypass
stage-1 KSampler, set `Is_Continue`, re-export) are error-prone and forgettable.
Pivoted to building a **workflow-generation orchestrator** first (separate effort,
own card if it grows) so stage-2 derivation is mechanical. Once that exists, come
back here and author the 4 LTX files through it. The rgthree strip (item 2 below)
is still the gate before app integration.

## Where we are (as of 2026-06-19)

LTX-2.3 (NerdyRodent) ComfyUI video workflow is being **authored + validated on the
RunPod Builder Pod + the local rig**, not yet integrated into the app. This session
locked the **model precision decisions** and got the Builder image + scripts to a
clean, reproducible state. The big remaining piece is **stripping the workflow down
to app-compatible nodes** (remove rgthree, replace with vanilla + MpiNodes), then the
actual **app integration** per the original scope (bottom of this file).

### Done this session
- Builder image **`v0.1.6-cu130`** built + pushed (GHCR digest `sha256:e08c4f41…`).
  Template `2brluktxb4` → user bumping to v0.1.6. Validated on a real RTX 3090 (drv 580).
- Builder fixes: Jupyter terminal+upload, example.png seed, KJNodes load-after-boot,
  rgthree added, **kornia==0.8.2 pin** (LTXVideo `pad` import — kornia 0.8.3 removed it).
- **Model precision LOCKED** (post A/B on 3090 + local RTX 4060 Ti 16GB):
  - diffusion = **full bf16 ONLY** (fp8 rejected "quality is crap"; mxfp8 Blackwell-only)
  - gemma = **fp8_scaled ONLY** for video AND audio (fp4 degrades, full over-influences)
  - abliterated LoRA = the **heretic** variant (node wanted it; script had wrong name)
  - min spec: **16GB+ VRAM + ~32GB+ system RAM** (full bf16 runs via RAM offload)
  - timings: 5090 ~20-30s / 3090·4090 ~60s / 4060Ti ~175s per 2s video
- Local authoring rig (G:\ComfyUi) has the COMPLETE final model set + all nodes +
  kornia 0.8.2; the full workflow runs locally.
- `install_nodes.sh` + `install_models_ltx23.sh` trimmed to the final ~68GB set,
  committed to **mpi-ci main** (`2324adc`, on top of `83e2964`).
- Workflow JSON saved by the user (the authored `LTX-2.3_nerdyRodent.json`).

### NOT done yet (next sessions)
1. **Test the remaining workflow branches** — face-swap (BFS LoRAs) + ControlNet
   (IC-LoRA union). Validate BEFORE stripping (a node removed might be load-bearing for
   an untested branch). User does this locally first; remote only when speed is needed.
2. **rgthree strip** (the big one) — replace rgthree's Power Lora Loader + Set/Get
   virtual reroutes + on/off switches with **vanilla ComfyUI + MpiNodes**, so the app
   workflow has ZERO rgthree dependency (rgthree is Builder-authoring-only, never an app
   dep). Big workflow, full evaluation needed. Claude can do/assist the strip from the
   saved JSON — work on the NORMAL export (not API export); node positions may shift,
   that's fine (user follows the wires). One swap at a time, keep links valid,
   verify-able chunks.
3. **App integration** (the ORIGINAL MPI-4 scope, still valid — see bottom).

## Files to read first (fresh session)
- This brief.
- Memory (`C:\Users\Fabio\.claude\projects\c--AI-Mpi-Cubric-Vision\memory\`):
  - `project_ltx23_model_precision_choice.md` — ALL A/B findings, timings, min spec,
    final keep-set + WHY. **Read before touching the model list.**
  - `project_ltxvideo_kornia_pad.md` — the kornia==0.8.2 fix + the two wrong fixes
    never to repeat.
  - `project_builder_image_flow.md` — Builder image (v0.1.6, thin-base cu130, Jupyter,
    pkill-cascade warning, KJNodes stale-boot, example.png).
  - `project_builder_install_scripts.md` — canonical script location + update procedure.
- Scripts (canonical, in the SEPARATE mpi-ci repo):
  - `c:\AI\Mpi\mpi-ci\cubric-vision-builder\install_nodes.sh`
  - `c:\AI\Mpi\mpi-ci\cubric-vision-builder\install_models_ltx23.sh`
  - `c:\AI\Mpi\mpi-ci\cubric-vision-builder\README.md`
- App injection contract: `.claude/rules/comfy_injection.md` § "Multi-stage video workflows".
- Saved workflow JSON: `LTX-2.3_nerdyRodent.json` (user has it locally; needed for the strip).

## Related cards
- **MPI-117** (doing) — node version-lock for local + RunPod installs. ANOTHER agent is
  on this (RunPod branch only). The Builder's per-node pins (RES4LYF SHA, kornia 0.8.2,
  rgthree) feed into 117's lock design. Coordinate; don't double-edit install scripts.
- **MPI-118** — app ComfyUI bump to v0.25.1 (the core the Builder already pins).

## Constraints (carry forward)
- Live Pod create/delete/deploy = **USER-only**; image build/push is fine for Claude.
- All RunPod work lands on the **RunPod branch** (Cubric-Vision), never master. The
  Builder scripts live in the **mpi-ci** repo (separate; commit by explicit pathspec).
- Builder = cu130, product Pod = cu128 — CUDA differing is fine (workflows port by
  ComfyUI+node version, not CUDA).
- Next Pod: **80GB volume** is enough for the ~68GB final set (user: no separate network
  volume, to avoid data-center lock-in; terminate-on-delete). **Enable Global
  Networking = OFF** (pod-to-pod feature, not needed for a single authoring Builder).

---

## Original scope (still valid — the app-integration target)

Register LTX 2.3 as a video model once `comfy_workflows/LTX23_t2v.json` (+
`LTX23_t2v_stage2.json`) and `LTX23_i2v.json` (+ `LTX23_i2v_stage2.json`) exist.

> **GENERATE these 4 files via the workflow-generation system — do NOT hand-author
> the stage-2 siblings.** (Built 2026-06-21 for WAN; see
> `comfy_workflows/scripts/workflow_generation/README.md`.) The system already turns a
> stage-1 API export into stage-1 + derived stage-2 mechanically (bypass the
> `Stage1_Bypass` node, flip `Is_Continue`), title-keyed, never by node ID.
> **LTX task for the agent:** add a `generate_ltx.py` handler (model it on
> `generate_wan.py`) that converts the user's LTX template(s) into the 4 files, then
> register `("LTX23_", "ltx")` in `registry.py`. Decide whether LTX's stage-2 is the
> same single-sampler bypass (reuse the WAN splice) or a different graph (encode a new
> `SLOT_TO_INPUT` table + assert on surprise). Verify the handler output against ONE
> hand-authored stage-2 (semantic node-set + per-node `inputs`/`_meta` equality) before
> trusting it — that byte-equivalence check is how WAN was proven. See the README's
> "Adding a new model family" section for the full checklist.

- Two-file multi-stage contract: stage-1 file contains
  `Preview_Only` + `SaveLatent` + `Preview` + `Output`; stage-2 sibling is **derived
  by the generator** (was: hand-authored by bypassing the stage-1 KSampler in ComfyUI
  and Save (API)). See `.claude/rules/comfy_injection.md` § "Multi-stage video workflows".
- Standard flat LoRA shape (not staged WAN-style). stage-2 LoRAs don't vary the result
  for LTX → set `commands[op].allowsBranchingContinue = false` so preview cards expose
  only Discard + Finish (no Continue). Finish replaces the preview with the final video
  via `replaceItemId`.
- When LTX-class image models are added (future, lower-grade-GPU image ops), they get
  the same treatment: two-file `_ms` workflow, Finish-only preview card.
- New nodes must obey the two-tier naming law (Input_*/Output_* for non-Tier-1) — see
  memory `feedback_comfy_node_naming_law`.

(Originally deferred from the WAN dual-model + 12 LoRAs plan; sequencing lock 2026-05-21
"post-release only" is now LIFTED — v1.0.0 public release shipped 2026-06-10.)


## Session 2026-08-10 — video EXTEND authored on the bench (single stage)

**The whole mechanism is one node.** `LTXVAudioVideoMask` (KJNodes,
`nodes/ltxv_nodes.py`) with `max_length="pad"`: it takes an ENCODED reference latent,
zero-pads it along time out to `video_end_time`, and writes `noise_mask=1` on the
padding only. The sampler then denoises just the new tail and leaves the reference
frozen. No `LTXVAddGuide`, no `EmptyLTXVLatentVideo` — the latent IS the guide.

**Zero new node packs.** Every load-bearing class is core or `comfyui-kjnodes`, both
already pinned; verified present on the app engine (48188), not just the bench. Three
nodes in the donor graph are installed NOWHERE and must not be copied: `TrimAudio`
(use core `TrimAudioDuration`), `NormalizeAudioLoudness` (drop), `easy showAnything`.

**Decision: a SEPARATE v2v file, not a branch inside `ltx_i2v_t2v.json`.** The two
front ends are mutually exclusive at the latent (empty+guide vs encode+mask), and the
audio sockets mean opposite things (conditioning vs encoded source). Extend and lipsync
were ASSUMED to be the same skeleton with the mask polarity flipped — lipsync freezing
audio and masking video (`max_length="partial"`). **That assumption is WRONG; corrected
2026-08-10 against the bench's own `LTX_lipdub_v2v_template.json`** (see the lipsync
section at the end of this brief). Extend and foley do share a skeleton, so both point
at one `ltx_v2v.json`, exactly as
`t2v_ms`/`i2v_ms` already share a file in `models.js`. Lipsync is NOT wired yet; the
seam is the mask's time-range inputs. The bench already holds an
`LTX_lipdub_v2v_template.json` worth reading before that step.

**Where it is:** `ltx_v2v_template.json` in the BENCH workflow list (userdata), not yet
in the repo. 46 nodes, 77 links, single stage — no `MpiStageLatents`, no latent
upscaler, no TAE preview, no NAG, no transition/ID LoRA, no audio features. Keeps the
6 user LoRA slots + `Merged Loras`, the `Input_*` node naming, `MpiLoadVideo` and
`MpiSaveVideo`.

**The 5 audio nodes are structural, not a feature.** LTX 2.3 samples a joint AV latent,
so `LTXVConcatAVLatent` needs both sides and the audio tail must span the same seconds
as the video tail. 2 in (trim + encode), 3 out (decode + trim + concat) so the extended
clip keeps its soundtrack.

**Reference window is derived, so no clip can be rejected.**
`MpiMath floor((a-1)/8)*8+1` on `MpiLoadVideo.frame_count` → `MpiClamp` (min 1, max 73,
titled `Input_Ref_Frames`). Snaps DOWN to the 8n+1 lattice the LTX latent grid needs
(`((N-1)//8)+1`, `nodes_lt.py:79`), then caps. 1s→17, 2s→41, 3.04s+→73, garbage→1.
`MpiMath` allows `math.*` only — no `min`/`max` builtins — but `floor` and ternaries
work, and `MpiClamp` mirrors INT in → INT out.

**Costs and open knobs:**
- 73 ref frames = 10 of the 25 latent frames in a 5s extend at 24fps — ~40% of every
  sampler step re-generates footage that the crossfade then discards. First sweep once
  it runs: cap 73 → 41 → 25.
- The cap also feeds `ImageBatchExtendWithOverlap.overlap`, so it sets the crossfade
  length too. On a very short clip that is a 1-frame blend (hard cut). Decouple with a
  second clamp if it shows.
- Stage 2 (when it returns) has NO mask — `LTXVLatentUpsampler` emits a fresh latent —
  so the reference tail gets re-sampled and the crossfade is mandatory, not polish.
- Swapped `LTXVNormalizingSampler` for plain `SamplerCustomAdvanced` (what the donor
  extend graph uses). If the audio comes out hot, that is the node to put back.

**Verified without spending a generation:** class existence, required-input coverage,
COMBO membership, widget arity; all 77 links against a re-implementation of ComfyUI's
`validate_node_input`; a live `app.loadGraphData` in the frontend (0 missing types, 0
error nodes, 0 dangling links); and `app.graphToPrompt()` diffed against an independent
API conversion — 0 differences. **NOT executed** — needs a real video path and the GPU.


## Session 2026-08-10 (cont.) — the extend workflow RUNS; foley discovered

`ltx_v2v_template.json` executed end to end on the bench against an H3 clip (with
audio) and a WAN 16fps clip (silent). Landed at
`comfy_workflows/raw/ltx_v2v_template.json`, byte-identical to the copy that ran.
Every root cause and the code line proving it is in `validation.md` — read that,
not this summary. App integration is **MPI-520**, blocked on the 1.4 release.

**Foley fell out of the silent-source fix, unplanned.** Masking the whole audio
stream when the source has no audio (rather than freezing an all-zeros latent
that decodes to hiss) means LTX generates audio across the reference window too,
conditioned on video it did not make. Confirmed working on a WAN clip: the whole
3.06s got sound, including a spoken line, at zero extra sampler cost — those
samples were already being computed and discarded.

### Full-clip V2V Foley as its own op — BUILT 2026-08-10, awaiting the GPU

Add sound to any muted video (the WAN use case). Same spine as `ltx_v2v`, third
mask polarity: **freeze all video, mask all audio, generate no new frames.**
Extend pads, lipsync does `partial`, foley freezes the video side. Reference:
`LTX-2.3 - V2V Foley (Add Sound To Any Video)` in the RuneXX collection (linked
at the top of this brief), and the bench's own `LTX_lipdub_v2v_template.json`.

**Design decision (user, 2026-08-10): the foley workflow gets the SAME audio input
and audio reference the main workflow has**, so a user can supply a reference
voice, or part of the real audio, from the start. `ltx_i2v_t2v_template.json`
already carries the parts to copy: `MpiLoadAudio | Input_Audio`,
`LTXVReferenceAudio` (ID-LoRA speaker identity, `identity_guidance_scale`),
`Input_Use_Input_Audio` / `Input_Use_Reference_Audio` (`MpiSimpleBoolean` →
`MpiIfElse`), and the `SolidMask` → `SetLatentNoiseMask` audio-mask pair.

Open question that motivated it: on the extend run the model generated a spoken
line with NO voice reference at all. If timbre turns out unstable across clips,
the reference-audio hook is the answer rather than a bigger model.

**Scope note:** foley on the extend workflow covers only the reference window
(~3s at the 73 cap) because that is all the model sees. Widening it means raising
`Ref_Frames`, which is the cost the cap exists to avoid — hence a separate op.

## Session 2026-08-10 (cont.) — foley workflow BUILT, unexecuted

`comfy_workflows/raw/ltx_v2v_foley_template.json` (58 nodes, 94 links) is on the
bench as `ltx_v2v_foley_template.json` and byte-identical in the repo. Read
`validation.md` for every root cause with its code line — do not re-derive them
from this summary.

Shape: freeze all video (`LTXVSetAudioVideoMaskByTime`, `mask_video=false`),
generate the whole audio stream, decode **audio only**, mux against the original
full-resolution frames. Carries `Input_Audio` + `Input_Use_Input_Audio` +
`Audio_Influence`, and reference-voice via `talkvid ID LoRA` ->
`LTXVReferenceAudio` behind `Input_Use_Reference_Audio`, as decided.

**THE NEXT ACTION IS A BENCH RUN, NOT CODE.** Open `ltx_v2v_foley_template.json`,
point `Input_Video` at a muted clip (`Projects/Wan 5b/Media/t2v_005.mp4` is the
one the extend build used), leave both audio toggles off, run.

Failure modes, in the order they are likely to fire:
1. `LTXVSetAudioVideoMaskByTime` raises `ValueError` if our checkpoint's
   diffusion model is not `LTXAVModel`. Unproven on the distilled int8 weights.
2. **The sampler pairing.** Lightricks tuned this LoRA on the `ltx-2.3-22b-dev`
   checkpoint with `LTXVScheduler` at 30 steps, plain `euler`, AUDIO cfg 6. We
   run the fully distilled int8 transformer at 8 `ManualSigmas` steps with
   `euler_ancestral_cfg_pp`, and cfg above 1 is exactly what distillation
   normally breaks. If the audio is noise, this is why. Fix in order: AUDIO
   `cfg` -> 1, then swap `ManualSigmas` for `LTXVScheduler` (30 steps,
   max_shift 2.05, base_shift 0.95, stretch true, terminal 0.1) + `euler`.
3. VRAM at a large `Input_Duration` cap. 60fps x cap 10 = 473 frames.

Then the knobs, in order: AUDIO cfg, `modality_scale` (3, from the reference),
`Input_Width`/`Input_Height` (encode-only, cannot hurt output quality),
`Audio_Influence` with a real input-audio clip.

**Foley LoRA: RESOLVED.** The user accepted the HF gate and downloaded it to
`G:\CubricModels\loras\ltx-2.3\ltx-2.3-22b-lora-foley-v2a-1.0.safetensors`.
`Foley_Lora#100` loads it at strength 1.0; both engines list it.

**Lightricks' own reference is archived at
`research/lightricks-foley-v2a-reference.json`** (the API workflow shipped
inside the LoRA repo — the authority the RuneXX file was ported from). Our build
agrees with it node-for-node and on all 19 steering parameters. Read it before
changing any guider or mask value.

**Product decision owed at MPI-520:** their negative prompt suppresses
`speech, dialogue, talking, narration` — the Foley LoRA is a sound-EFFECTS
model, and the spoken line the extend run produced came from the BASE model. So
foley mode and the reference-voice mode want different negatives and probably a
different LoRA state. Do not ship both toggles as if they compose.

Still open from the extend build, unchanged: the `Ref_Frames` 73 -> 41 -> 25
sweep (decouple `ImageBatchExtendWithOverlap.overlap` first), and whether LTX
2.3's motion holds off-24fps.

## Lipsync is NOT a third mask polarity — corrected 2026-08-10

Read from the bench's `LTX_lipdub_v2v_template.json` (36 nodes), not assumed.
The earlier claim in this brief — that lipsync is `ltx_v2v` with
`max_length="partial"` freezing audio and masking video — is **wrong**. Lipdub
uses a different front end entirely, and none of the foley/extend mask machinery
appears in it:

| | extend / foley | lipdub |
|---|---|---|
| video latent | encoded source, frozen by a noise mask | `EmptyLTXVLatentVideo` — fully generated |
| source video enters as | the latent itself | `LTXAddVideoICLoRAGuide` in-context guide |
| audio enters as | an encoded latent in the AV pair | `LTXVSetAudioRefTokens` on the CONDITIONING |
| LoRA | none (foley: `LoRA-Foley-V2A`) | `LTXICLoRALoaderModelOnly` + `ic-lora-lipdub-0.9` |
| after sampling | separate AV, decode | `LTXVCropGuides` strips the guide frames first |

So the video is **re-synthesised**, not preserved. That is what lets a closed or
still mouth start moving — but identity, lighting and background are regenerated
from the guide, so drift is the quality risk, and `LTXVCropGuides` is mandatory.

**The template drives it from the source video's OWN audio**
(`GetVideoComponents:1` -> `LTXVAudioVAEEncode`). Supplying a different track is
a one-socket swap to an audio loader — that is the dubbing case, and it is what
makes "supply audio, get lipsync" work.

**Everything needed is already installed.** `LTXAddVideoICLoRAGuide`,
`LTXICLoRALoaderModelOnly`, `LTXVSetAudioRefTokens`, `LTXVTiledVAEDecode`
(ComfyUI-LTXVideo) and `LTXVCropGuides` / `EmptyLTXVLatentVideo` /
`GetVideoComponents` (core) are present on BOTH 8188 and 48188, and
`ltx-2.3-22b-ic-lora-lipdub-0.9.safetensors` is on disk at
`C:\AI\loras\LTX2.3\` (the bench's other lora root, not CubricModels).

**Four ready references** in the RuneXX collection under
`Video-2-Video/Just-Talk_add_voice_to_silent_video/`:
`..._custom_audio_lip-synced_to_any_video`, `..._dub_any_silent_video_multilanguage`,
`..._prompt_lip-synced-voice_to_any_video`, and a `..._Sam3` variant (SAM3 gives
it a spatial mask, presumably to confine the regeneration to a face region).

**Consequence for the op plan:** lipsync does NOT share `ltx_v2v.json`. It is its
own workflow file and its own op, closer to a fourth front end than a third mask.
The `models.js` "two ops, one file" trick still applies to extend + foley only.

## Reference audio STAYS in the foley file (user, 2026-08-10)

Asked whether the talkvid ID-LoRA was dead weight; answer is it drives
`LTXVReferenceAudio` speaker-identity transfer (voice consistency) and the user
wants it kept. It costs nothing when off - `MpiIfElse.check_lazy_status`
(`if_else.py:33`) returns only the taken branch, so the LoRA never loads.

**Foley mode and voice mode are still mutually exclusive settings in one file.**
Voice test needs: a real path in `Input_Audio#106` (it is `block_if_empty=true`,
so an empty string BLOCKS once the toggle executes it), the speech terms removed
from `Input_Negative#13`, and `Foley_Lora#100` set to `None` so the SFX LoRA and
the ID LoRA are not stacked. `identity_guidance_scale` 1.5 runs an extra forward
pass per step; reference clips should be ~5s (the trained duration).

**Fixed after the first run came back loud and distorted:** AUDIO cfg 6 -> 1
(every LTX guider in this repo runs cfg 1 on the distilled checkpoint; 6 is
Lightricks number for the DEV model at 30 steps with plain euler, and it was
being fed into euler_ancestral_cfg_pp which expects ~1). Next lever if still
hot: LTXVNormalizingSampler, audio_normalization_factors 1,1,0.25,1,1,0.25,1,1.
Also changed Resize To Target keep_proportion crop -> resize: crop discards
frame content, and that encode exists only so the model can SEE the scene.
