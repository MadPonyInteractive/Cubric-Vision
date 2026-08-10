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
