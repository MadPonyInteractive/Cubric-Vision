# Validation

## 2026-08-10 — `ltx_v2v_template.json` EXECUTED (first frame produced)

**Result: PASS.** The user ran the single-stage extend workflow on the bench
ComfyUI (127.0.0.1:8188) against a real clip — an H3-generated video — and it
extended it successfully. This closes the one gate the card was sitting behind:
every prior check was structural (class existence, required-input coverage, all
77 links against a re-implementation of `validate_node_input`, a live
`app.loadGraphData`, and `graphToPrompt()` diffed to 0 differences against an
independent API conversion), and none of it proved the graph had ever produced a
frame. It has.

Confirmed by the user, not by an automated check — this is a bench GPU run with
a visual outcome, which is the only kind of evidence that closes it.

**What this proves:** `LTXVAudioVideoMask` with `max_length="pad"` is the whole
extend mechanism, in a graph with zero new node packs. The derived reference
window (`MpiMath floor((a-1)/8)*8+1` → `MpiClamp 1..73`) accepted a real clip's
frame count without rejection, and the joint AV path (2 audio nodes in, 3 out)
survived a real run.

**Still open (not blockers, tuning):**
- Seam quality at `Ref_Frames` → `Ref_Frames+1` not yet judged frame-by-frame.
- The `Ref_Frames` cap sweep (73 → 41 → 25). It also feeds
  `ImageBatchExtendWithOverlap.overlap`, so it moves the crossfade length at the
  same time — that is the decouple decision.
- `upscale_method` on `Resize To Target#28` is `nearest-exact`. Identity when
  the target equals the source, but aliasing/shimmer the moment a clip is
  downsized to fit VRAM. Change to `lanczos` (legal — `device` is `"cpu"`; the
  GPU path raises on lanczos).

## 2026-08-10 — resolution handling settled

The user wired the source video's width/height into `Input_Width`/`Input_Height`
to remove a user input step. Correct value, wrong place, and the reason it looked
risky turned out not to be a risk at all.

**No seam discrepancy is possible.** `Resize To Target#28` feeds BOTH
`Reference Tail#29` (→ `Encode Reference Video#30`) and
`Stitch (crossfade the reference)#43.source_images`. The delivered clip is
entirely at target resolution — the "old" frames in the output are the resized
ones. Any crop or scale applies uniformly to the whole clip, so it can never
read as a zoom or a distortion at the join.

**With target = source dims, the resize is a pure crop with no interpolation.**
Traced through `ImageResizeKJv2` in `comfyui-kjnodes/nodes/image_nodes.py`:
`divisible_by` rounds DOWN (`width - (width % divisible_by)`, L3036-3038), then
the `keep_proportion="crop"` branch (L3076+) center-crops the source to the
target ASPECT and calls `common_upscale` to exactly w×h. For 1920x1080 with
`divisible_by=32` the target is 1920x1056: `old_aspect 1.778 < new_aspect 1.818`
→ `crop_w=1920, crop_h=1056` → the upscale is 1920x1056 → 1920x1056, an
identity. Net cost: ≤31 px trimmed off an axis, once, on the whole clip, with
zero resampling.

**Decision: keep `Input_Width`/`Input_Height` as injectable `MpiInt`, and derive
the default CLIENT-side, not in the graph.** Both are `MpiInt` whose `int` slot
is a widget-with-input. Once a link lands on that slot ComfyUI ignores the
widget, and the app injects by writing `widgets_values` — so an in-graph link
would make the app's injected resolution silently dead: no error, no log line,
the graph just uses the source dims. Defaulting the resolution picker to the
clip's own dimensions gives the same "one less step" and keeps the override, so
a 4K clip can be extended at 1080p on a card that cannot take 4K. LTX's 2K/4K
ceiling stays available rather than being capped in the graph.

**No downscale stage is correct.** The downscale in most LTX workflows is not an
input downscale — it is stage 1 sampling at reduced latent resolution, paired
with `LTXVLatentUpsampler` and a low-denoise stage 2. The pair was dropped
together when this became single-stage; sampling low with nothing to upsample
afterwards would be pure loss.

## 2026-08-10 - fps handling: extend tail now snaps to the 8n lattice

Applied to the bench copy of `ltx_v2v_template.json` in place (surgical link
edit, not a re-author - the user had reworked layout, groups, prompts and added
a TAE preview chain).

**Root cause.** `LTXVAudioVideoMask` computes
`required_latent_frames = (round(end_time*fps) - 1)//8 + 1` - floor division. The
generated tail is therefore `8*floor(D/8)` pixel frames for `D = duration*fps`,
i.e. short by `D mod 8`. Meanwhile `New Audio#44` trimmed to the full requested
seconds and `Output_Video#46` has `truncate_to_audio: false`, so off-lattice fps
produced a file whose audio ran past the last video frame. 16/24/48 fps are
clean (multiples of 8); 25, 30 and 60 are not, and 30 is the most common source
rate there is.

**Fix.** One `MpiMath#51` titled `extend_seconds (snap to 8n)`:
`floor((a*b+0.5)/8)*8/b` with a = `Input_Duration`, b = `Input_Video.fps`. Feeds
BOTH `extend_end#27.b` and `New Audio#44.duration`, so the two tails are equal by
construction at any fps. The `+0.5` is for NTSC: at 23.976fps a bare floor turns
`3*23.976 = 71.928` into 64 frames instead of 72, losing 8 frames on every
extend of any 23.976/29.97/59.94 clip.

**Removed `MpiWanSeconds#22`** - orphaned by the change. It was already dead
weight: `frames` and `fps` outputs unconnected, and `seconds` a literal
pass-through (`return (int((seconds*fps)+1), seconds, fps)`).

**Verified:** the apply script re-implements KJ's own mask arithmetic and
asserts tail-frames/fps == the seconds handed to `New Audio` at 16, 23.976, 24,
25, 29.97, 30, 48 and 60 fps - all OK, and it aborts rather than writing on any
mismatch. After POST, the file was re-read FROM THE BENCH: 47 nodes, 80 links,
`MpiWanSeconds` absent, `#51` wired to both consumers, 0 dangling links, 0
orphaned links. Pre-edit backup kept.

**What was already fps-correct** (no change needed): every fps consumer reads
`Input_Video.fps` (nothing hardcodes 24); `snap to 8n+1` runs on `frame_count`
so the REFERENCE window is exact at any fps; KJ's audio path uses a fixed
`audio_latents_per_second = 16000/160/4 = 25` decoupled from video fps; and
`LTXVConcatAVLatent` builds a `NestedTensor` of two independent streams, so
there is no video:audio ratio for an odd fps to violate.

**Still unknown, needs a run, not code:** whether LTX 2.3's MOTION holds off-24.
`LTXVConditioning` tells the model the frame rate, but told is not trained-on -
a 48fps source asks for 6 latent frames/sec against ~3 at 24. A WAN 16fps test
is queued.

**Bench-only divergence to undo before the repo copy:** `Input_Width` /
`Input_Height` (`MpiInt`) were deleted and `Resize To Target` wired straight off
`MpiLoadVideo:5/:6`. Correct on the bench, but the app injects by writing
`widgets_values`, so with no `MpiInt` there is nothing to inject into and the
resolution picker would be dead. Restore both for the repo version.

## 2026-08-10 - silent-source support + 3s foley (bench)

**Symptom.** A WAN clip (no audio track) first died with
`VAEEncodeAudio: input audio is None`. The user added `LTXVEmptyLatentAudio` behind
an `MpiIfElse` on `has_audio` (correct instinct - `MpiIfElse` marks both branches
`lazy` and `check_lazy_status` returns only the taken one, so the encode never
fires). It then ran, but the reference half played noise and the generated half
was silent.

**Two independent root causes, neither of them the empty latent.**

1. THE OFFSET, which is what was actually heard. `Join Audio#45` is
   `AudioConcat(audio1=Input_Video.audio, audio2=New Audio)`, and core does
   `if audio1 is None: return NodeOutput(audio2)` (`nodes_audio.py` L617-622).
   With no source audio the join collapsed to the TAIL ALONE, muxed from t=0.
   The output video is `full source + tail`, so the generated audio played over
   the reference footage and the tail was left silent. Nothing was lost or
   muted - the tail audio was moved to the front.
2. THE NOISE. `LTXVEmptyLatentAudio` returns `torch.zeros(...)`
   (`comfy_extras/nodes_lt_audio.py` L155). The mask left `[0, ref_seconds*25)`
   UNMASKED = frozen, so the model's audio context was an all-zeros latent - an
   out-of-distribution point that decodes to hiss and gives the generator
   garbage to continue from. Zeros in latent space is not silence.

**Fix, all switched on `MpiLoadVideo.has_audio` (`#17:7`), 6 nodes added:**

| input | has_audio TRUE (unchanged) | has_audio FALSE (new) |
|---|---|---|
| `Extend Mask#33.audio_start_time` | `ref_seconds#25` | `Zero#54` |
| `Join Audio#45.audio1` | `Input_Video:1` | `EmptyAudio#55` |
| `New Audio#44.start_index` | `ref_seconds#25` | `Zero#54` |
| `New Audio#44.duration` | `extend_seconds#51` | `extend_end#27` |

Plus `LTXVEmptyLatentAudio#53.frames_number` moved from `Input_Video.frame_count`
(the WHOLE clip) to `Ref_Frames#24`, so both branches of the latent selector
produce the same length as the encoded path.

**Why this yields foley for free.** `audio_start_time = 0` masks the ENTIRE audio
stream, so LTX generates audio across the reference window as well as the tail,
conditioned on the reference video it can see. Those samples were already being
computed and thrown away; widening `New Audio`'s trim to `extend_end`
(= `ref_seconds + extend_seconds`) keeps them. Zero extra sampler time.

**The offset that makes it line up.** Decoded audio spans
`[0, ref_seconds + extend]`, but its first `ref_seconds` corresponds to output-video
time `[source_duration - ref_seconds, source_duration]`. So the silent pre-roll is
`source_duration - ref_seconds` - which `audio_start = a-b#26` already computed for
`Reference Audio Tail.start_index` and is simply reused. `AudioConcat` calls
`match_audio_sample_rates`, so `EmptyAudio`'s 44100 needs no matching.

**Scope limit (accepted, deliberate).** Foley covers only the reference window
(~3s at the 73-frame cap) because that is all the model ever sees. A longer clip
gets silence, then ~3s of foley, then the extended tail. Full-clip foley is a
DIFFERENT op - freeze all video, mask all audio, generate no new frames - i.e.
the `LTX-2.3 - V2V Foley` workflow already listed in brief.md. That is the next
piece of work, aimed at users extending muted WAN output.

**Verified:** structural validation (link both-way agreement, no dangling in or
out, every `MpiIfElse` input fed - `true`/`false` are `forceInput` so an unfed one
is a hard error, `EmptyAudio` widget/input arity), then read back FROM THE BENCH
after POST: 55 nodes, 100 links, 0 problems, every selector landing where
intended. NOT yet executed - the foley itself is unjudged until a WAN clip runs.

**Authoring note:** every added node except `EmptyAudio` was CLONED from a donor
already in the graph (`MpiIfElse#52`, `MpiMath#27`). `EmptyAudio` was built from
`/object_info` by mimicking the widget-input shape of `TrimAudioDuration#31` -
a converted widget keeps its entry in `widgets_values` AND gains an `inputs` entry
carrying `widget: {name}`, confirmed against `#31` and `#53`.

## 2026-08-10 - preroll floor: the silent path crashed at the mux

First WAN run of the foley wiring reached the LAST node and died:

    Node ID: 45 (AudioConcat) - RuntimeError: cannot reshape tensor of 0
    elements into shape [-1, 0] because the unspecified dimension size -1 can be
    any value and is ambiguous

**Root cause, measured not guessed.** The clip
(`Projects/Wan 5b/Media/t2v_005.mp4`) is 3.0625s at 16fps = 49 frames, and 49 is
exactly 8*6+1 - dead on the LTX lattice. So `snap to 8n+1` returns 49, `Ref_Frames`
clamps to 49 (under the 73 cap), and `ref_seconds = 49/16 = 3.0625` equals the clip
duration EXACTLY. The pre-roll `Input_Video.duration - ref_seconds` is therefore 0,
`EmptyAudio` builds `zeros((1, ch, int(round(0 * 44100))))` = a 0-element tensor
(`nodes_audio.py` L793-796), and `AudioConcat` -> `match_audio_sample_rates` hands
it to `torchaudio.functional.resample` (L585), which cannot reshape 0 elements.
The concat itself was never the problem - `torch.cat` accepts a 0-length tensor;
the RESAMPLE does not, and it only fires because `EmptyAudio`'s 44100 differs from
the LTX audio VAE's output rate.

**Not an edge case.** Any clip whose frame count is 8n+1 and within the
`Ref_Frames` cap makes the whole clip the reference window and drives the pre-roll
to exactly 0 - i.e. most generated clips under ~3s at 24fps or ~4.5s at 16fps.

**Fix.** One cloned `MpiMath#60` titled `preroll (min 1ms)`,
`a if a>0.001 else 0.001`, between `audio_start = a-b#26` and
`EmptyAudio.duration`. 48 samples at 48kHz, inaudible against a 41ms video frame.

**Why not match the sample rate instead.** Setting `EmptyAudio.sample_rate` to the
decoder's rate would skip the resample and let a 0-length concat through, with no
fudge at all - but `LTXVAudioVAEDecode` reads
`audio_vae.first_stage_model.output_sample_rate`, which is derived from the
CHECKPOINT (`vocoder.py` L444-450: absent from recent configs, computed as
`sample_rate * upsample_factor / mel_hop_length`). Hard-coding a number that the
weights can change is the more brittle option, so the floor won.

**Verified:** structural checks pass, the expression was evaluated over six real
clip shapes (16/24/48fps, on and off the lattice) asserting >= 1 sample in every
case, and the file was read back FROM THE BENCH after POST: 56 nodes, 101 links,
0 problems. Still not executed end to end - the re-run should be cheap, since the
only changed inputs are downstream of the sampler and the whole upstream stays
`execution_cached`.

**What this run DID prove:** everything up to the mux works on a silent source -
the `has_audio` selectors, the fully-masked audio stream, the empty audio latent,
the sampler, and both decodes all completed. Only the final audio assembly failed.

## 2026-08-10 - full-clip V2V Foley authored (`ltx_v2v_foley_template.json`)

Landed at `comfy_workflows/raw/ltx_v2v_foley_template.json`, byte-identical to
the copy read back off the bench. 58 nodes, 94 links, single stage.
**NOT YET EXECUTED** - every check below is structural or arithmetic. The foley
itself is unjudged until a muted clip runs on the bench GPU.

**The reference file moved.** The URL in `brief.md` 404s. RuneXX renamed it and
now ships two: `..._Foley-Lora.json` (72 nodes, current) and
`..._old_version.json` (154 nodes, `LTXVAudioVideoMask`-based). The current one
introduces a dedicated weight - see the LoRA section below.

**Third mask polarity, and it is a different node.** Extend uses KJ's
`LTXVAudioVideoMask` with `max_length="pad"`. Foley uses
`LTXVSetAudioVideoMaskByTime` (`ComfyUI-LTXVideo/latents.py:636`), which exposes
`mask_video` / `mask_audio` booleans directly:
`mask_video=false` + `mask_init_value_video=0.0` = every video latent frozen;
`mask_audio=false` + `mask_init_value_audio` = a uniform audio mask. Present on
BOTH the bench (8188) and the app engine (48188) - still zero new node packs.

**The audio-influence pair from the main workflow CANNOT be reused here, and it
would have failed silently.** `ltx_i2v_t2v_template.json` sets audio influence
with `SolidMask` -> `SetLatentNoiseMask` on the audio latent before the concat.
`LTXVSetAudioVideoMaskByTime` **overwrites** `av_latent["noise_mask"]` outright
(`latents.py:826-841`): it builds a fresh audio mask from `mask_init_value_audio`
and only reads a pre-existing mask on the VIDEO side, and even then only for one
degenerate shape. A `SetLatentNoiseMask` upstream is silently discarded - no
error, the influence knob just does nothing. Replaced with
`Audio_Influence` -> `MpiNormalizeValue(inverse)` -> `mask_init_value_audio`.
Same uniform semantics (a `SolidMask` is uniform too), two fewer nodes, and it
cannot be clobbered.

**Influence is forced to 1.0 when input audio is off.** `MpiIfElse#113` selects
`Invert Influence` vs a constant `1.0` on the same `Input_Use_Input_Audio`
boolean. Without it, an unused `LTXVEmptyLatentAudio` (`torch.zeros`,
`nodes_lt_audio.py:155`) would sit at mask 0.1 = 90% frozen, which is the exact
out-of-distribution point that decoded to hiss on the extend build.

**No video decode at all.** The video is frozen, so the generated frames are the
input frames. `MpiSaveVideo` muxes the ORIGINAL, full-resolution trimmed frames
against the decoded audio; only `LTXVSeparateAVLatent:1` is consumed. The encode
resolution (`Input_Width`/`Input_Height`, default 832x480) is therefore a pure
compute knob - it cannot degrade the delivered video.

**Length cap.** `Input_Duration` means *max seconds to process*, matching the
reference's `MAX LENGTH (in seconds)`. Frames =
`min(floor((dur*fps-1)/8+0.5)*8+1, floor((frame_count-1)/8)*8+1)`. A longer clip
is truncated, not rejected.

**Input audio is trimmed to the clip before encoding.** `LTXVConcatAVLatent`
only calls `fit_audio` when the video side is ALREADY an AV latent
(`nodes_lt.py:800-806`) - ours is a plain video latent, so nothing bounds a
supplied audio track. A 3-minute reference against a 5s clip would encode to
~4500 audio latent frames and take the sampler with it. One `TrimAudioDuration`
fed by `clip_seconds` closes it. The `LTXVReferenceAudio` path deliberately gets
the UNtrimmed audio - it wants the whole voice sample.

**Reference audio is switched at the GUIDER, not per-socket.** Copied from
`ltx_i2v_t2v_template.json`: two `MultimodalGuider`s, one fed through
`MpiLoraModel(talkvid ID)` -> `LTXVReferenceAudio`, and `MpiIfElse` picks. Both
`MpiIfElse` branches are lazy (`check_lazy_status`), so the ID LoRA never loads
when the toggle is off.

**`MultimodalGuider` instead of `CFGGuider`, deliberately.** The spine's single
`cfg=1` cannot express what foley wants: the video branch must stay at cfg 1 for
the distilled checkpoint while the audio branch benefits from more. Two chained
`GuiderParameters` carry the reference's own tuned values (AUDIO cfg 6, VIDEO
cfg 1, `modality_scale` 3, `skip_blocks` "29"). If audio comes out broken under
our fully-distilled int8 transformer, AUDIO `cfg` is now a widget sweep rather
than a re-author.

### Verified without spending a generation

- **Class existence, required-input coverage, widget arity, COMBO membership,
  link type compatibility and both-way link agreement** against a live
  `/object_info`: 0 problems on the bench (8188). The 57-node build also passed
  against the app engine (48188); the engine was down when the 58th node
  (`TrimAudioDuration`, core `comfy_extras/nodes_audio`) was added, so re-run
  the validator against 48188 once the app is up.
- **The validator was mutation-tested** - unfed required input, uninstalled
  COMBO value, dangling link id and wrong `widgets_values` arity are each caught.
  A validator that cannot fail proves nothing.
- **Live `app.loadGraphData` in the ComfyUI frontend**: 58 nodes, 0 error nodes,
  0 missing types.
- **`app.graphToPrompt()` diffed against an independent API conversion**
  (`scripts/workflow-to-api.mjs` off the same `/object_info`): **0 differences**
  across all 58 nodes. This is what proves no widget landed in the wrong
  positional slot.
- **Every `MpiMath` expression evaluated with the REAL `safe_math`** imported
  from `ComfyUi-MpiNodes/help_funcs.py`, over 11 clip shapes (16/24/23.976/25/
  29.97/30/48/60 fps, on and off the lattice, 1-frame and 8-frame degenerate
  clips) x 7 duration caps. Every result is an int, >= 1, <= the clip's frame
  count, and exactly on the 8n+1 lattice. **This check is not optional:**
  `MpiMath.doit` catches every exception and returns `0.0` with only a `print`
  (`math.py:28-33`), so a malformed expression is a silent wrong number, never
  an error node.

### Open, and needs the GPU not more code

- The foley itself. Nothing here proves the model makes good sound.
- AUDIO `cfg=6` against our fully-distilled int8 checkpoint. The reference ran
  the DEV transformer with a distill LoRA at 0.4; cfg above 1 is exactly what
  distillation usually breaks. First failure mode to check, one widget to fix.
- `LTXVSetAudioVideoMaskByTime` hard-raises when
  `model.model.diffusion_model.__class__.__name__ != "LTXAVModel"`
  (`latents.py:707-710`). LTX 2.3 22b should satisfy it; unproven on our
  checkpoint.
- `Input_Duration` at a large cap on a 60fps clip is a big latent (473 frames =
  60 latent frames at cap 10). VRAM ceiling unmeasured.

### The Foley LoRA is BLOCKED on a licence click

`ltx-2.3-22b-lora-foley-v2a-1.0.safetensors` (Lightricks, 227 MB, the only new
weight the current reference adds) sits in a `gated: auto` HF repo. Anonymous
gets 401, the Mad-Pony-Interactive write token gets 403 - the account has not
accepted the terms. Accepting a licence is the user's action, not an agent's.
`Foley_Lora#100` is wired as `MpiLoraModel` with `lora_name: "None"`, which is a
pass-through, so the graph runs on base-model foley today and needs one widget
change once the weight lands. Repo:
`https://huggingface.co/Lightricks/LTX-2.3-22b-LoRA-Foley-V2A`

### Noticed, not fixed - `ltx_v2v_template.json` is still missing its MpiInts

The extend section above says "restore `Input_Width`/`Input_Height` for the repo
version". The repo copy still wires `Resize To Target#28` straight off
`MpiLoadVideo:5/:6`, so there is nothing for the app to inject a resolution
into. Left alone deliberately - that file is byte-identical to the copy that
ran, and this is MPI-520's to fix at integration time. The foley file does NOT
share the defect; it carries both `MpiInt`s.

### 2026-08-10 (same day, after the user supplied Lightricks' own reference)

The user saved `ltx-2.3-foley-v2a.json` — the API-format workflow Lightricks
ships **inside the LoRA repo**, and the authority the RuneXX file was ported
from — and downloaded the LoRA to
`G:\CubricModels\loras\ltx-2.3\ltx-2.3-22b-lora-foley-v2a-1.0.safetensors`
(226,709,270 bytes, matches the HF blob size). Both engines already list it in
the `MpiLoraModel` COMBO; no restart was needed.

**The architecture was already right.** Their graph and ours agree node-for-node
on the load-bearing path: `VAEEncode` -> `LTXVEmptyLatentAudio(frames_number=N)`
-> `LTXVConcatAVLatent` -> `LTXVSetAudioVideoMaskByTime(mask_video=false)` ->
`MultimodalGuider` -> `SamplerCustomAdvanced` -> `LTXVSeparateAVLatent:1` ->
`LTXVAudioVAEDecode` -> save the ORIGINAL frames with the generated audio. Their
frame math is `((frame_count-1)//8)*8+1` with a `max(1, n)` floor, which is what
`clip frames (snap 8n+1)#23` already computed.

**19 steering parameters compared and all 19 match** (`compare_to_lightricks.py`):
`mask_video`, `mask_init_value_video`, `slope_len`, every field of both
`GuiderParameters` (AUDIO cfg 6 / VIDEO cfg 1, `stg` 1, `perturb_attn` true,
`rescale` 0, `modality_scale` 3, `skip_step` 0, `cross_attn` true),
`skip_blocks` "29" on both guiders, LoRA strength 1.0, and the negative prompt.
The AUDIO cfg 6 and `modality_scale` 3 guesses carried over from the RuneXX port
are confirmed as Lightricks' own values, not a community invention.

**Changed as a result:**
- `Foley_Lora#100` now loads
  `ltx-2.3\ltx-2.3-22b-lora-foley-v2a-1.0.safetensors` at strength 1.0.
- `Input_Negative` is Lightricks' string verbatim.
- `Input_Positive` follows their prompt shape: name the sources and their sync,
  then rule out the rest ("No speech is present. No music is present.").

**The negative prompt suppresses SPEECH, deliberately — and that collides with
the reference-voice feature.** Their negative carries `speech, dialogue, talking,
narration`. The Foley LoRA is a sound-EFFECTS model; the spoken line the extend
run produced came from the BASE model with no LoRA. So the file now has two
modes that are not simultaneously satisfiable:
- foley (default): LoRA on, speech negated, `Input_Use_Reference_Audio` off.
- voice: strip the speech terms from `Input_Negative`, and consider dropping the
  Foley LoRA to `None`, before turning the reference-voice path on.
Worth an explicit product decision at app-integration time (MPI-520) rather than
leaving a user to discover it.

**Divergences kept, each on purpose:** their DEV checkpoint + `LTXVScheduler` 30
steps + plain `euler` vs our distilled int8 + `ManualSigmas` 8 steps +
`euler_ancestral_cfg_pp`; their native-resolution `VAEEncode` vs our
`ImageResizeKJv2` -> `VAEEncodeTiled`; their `LTXVAudioVAELoader` off the
checkpoint vs our `VAELoaderKJ` off the standalone audio VAE. The last two are
the spine's own proven loaders. The FIRST one is the live risk:

> **The LoRA was tuned against the DEV model at 30 steps with cfg 6.** We run a
> fully distilled checkpoint at 8 steps, where cfg above 1 normally breaks. If
> the audio comes back as noise, that pairing is the cause, and the fix is not
> the graph — it is either AUDIO `cfg` -> 1, or swapping `ManualSigmas` for
> `LTXVScheduler` (30 steps, max_shift 2.05, base_shift 0.95, stretch true,
> terminal 0.1) with `KSamplerSelect` on plain `euler`.

Re-verified after the LoRA and prompt changes: 0 structural problems against
**both** 8188 and 48188, math unchanged (77 combinations), validator still
mutation-proof, 58 nodes and 0 error nodes in the live frontend, and the
`graphToPrompt` diff against an independent conversion is still **0
differences**. Repo copy is byte-identical to the bench copy (95,163 bytes).

## In-place edits ONLY from here (user, 2026-08-10)

The user hand-organises node positions to read the graph. Measured: all 58 nodes
had been repositioned between the commit and the next edit. **Never regenerate
this file from `build_foley.py`** - it rebuilds `pos`/`size`/`groups` and destroys
that work. The method is now: GET the bench copy -> mutate only the nodes involved
-> POST -> assert `pos`/`size` unchanged for every node. `patch_inplace.py` in the
session scratchpad is the shape to copy; `build_foley.py` is a historical record of
how the graph was first derived, NOT a thing to re-run.

## Crash on the reference-audio branch, and why cfg 1 armed it

First ref-audio run died: `UnboundLocalError: cannot access local variable
`noise_pred_neg`` in `SamplerCustomAdvanced` (node 39).

**Upstream bug in ComfyUI-LTXVideo.** `guiders/multimodal_guider.py:157`
initialises `a_noise_pred_neg, v_noise_pred_neg = 0, 0` but never the combined
`noise_pred_neg`. Line 161 binds it only `if any(params.do_uncond())`, and
`do_uncond()` is `not math.isclose(cfg_scale, 1.0)` (`guiders/parameters.py`).
Line 269 then replicates the `sampler_post_cfg_function` hook and reads
`noise_pred_neg` unconditionally. So the crash needs BOTH cfg 1.0 on both
modalities AND some node registering a post-cfg function. Exactly one node in
this graph does: `LTXVReferenceAudio` (`comfy_extras/nodes_lt.py:932`). Dropping
AUDIO cfg 6 -> 1 to fix the distorted audio armed it; turning the ref-audio
toggle on fired it.

**Fix: the ref-audio branch uses core `CFGGuider` at cfg 1, not `MultimodalGuider`.**
Core assigns `uncond_pred = None` under the cfg-1 optimisation
(`comfy/samplers.py:610`) instead of leaving a name unbound, and
`LTXVReferenceAudio` -> `CFGGuider` at cfg 1 is exactly what already ships and
works in `ltx_i2v_t2v_template.json`. The foley branch KEEPS `MultimodalGuider`:
no post-cfg hook is registered there, and at cfg 1 its `stg` and `modality_scale`
terms still contribute (`parameters.py` `calculate()`).

### Correction: the crash is on the FOLEY branch, not the ref-audio branch

The first fix (node 121 -> CFGGuider) was aimed at the wrong node. `/history`
settles it: FOUR failing runs, `Input_Use_Reference_Audio` **false** in every one,
and the last three already carried the 121 patch. So `LTXVReferenceAudio` was
never the registrant.

**The proven invariant: `MultimodalGuider` crashes whenever BOTH modalities sit at
cfg 1.0.** `do_uncond()` is `not math.isclose(cfg_scale, 1.0)`, so neither
modality asks for the uncond pass, `noise_pred_neg` is never bound
(`multimodal_guider.py:157/161`), and line 269 reads it while replicating the
`sampler_post_cfg_function` hook. Everything before line 269 uses the SPLIT
vars (`v_/a_noise_pred_neg`), which ARE initialised - only the combined name is not.

**STILL UNKNOWN, and it does not block the fix:** what registers a post-cfg
function when the ref-audio branch is off. `LTXVReferenceAudio` is ruled out by
the four runs. `LTX2SamplingPreviewOverride` uses `add_wrapper_with_key(OUTER_SAMPLE)`,
not a post-cfg hook, so it is ruled out too. Worth 10 minutes with a print in
that loop if MultimodalGuider is ever wanted back.

**Fix applied: node 118 -> core `CFGGuider` at cfg 1.**
That is the guider the EXTEND workflow used when it produced usable foley audio
by accident, and what every other LTX op in this repo runs on this checkpoint.
It sidesteps the bug entirely rather than tuning around it. `#116`/`#117`
GuiderParameters are left in place but unwired - they are plan B if
MultimodalGuider at AUDIO cfg != 1 is ever worth trying, and cost nothing
unreached. **UNEXECUTED** - reasoned and validated, not yet run.
