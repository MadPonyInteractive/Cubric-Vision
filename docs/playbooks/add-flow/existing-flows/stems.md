# Stems (MPI-663) — the first MULTI-OUTPUT flow

> Part of [add-flow/existing-flows](../README.md). One audio file in, four stem files out
> as four separate gallery cards. No model, no prompt, no controls. Read this before
> touching the flow, its graph, or the separation node pack.

## Shape

| | |
|---|---|
| id / op | `stems` / `flowStems` |
| graph | `comfy_workflows/flow_stems.json` (7 nodes) |
| `requiredModels` | `[]` — no model, no diffusion, no install gate |
| `requiredDeps` | `audio-separation-nodes-comfyui` — **1.6 MB** of code, and ~320 MB it fetches itself (below) |
| `mediaType` | `'audio'` |
| inputs | `audio1` → `Input_Audio` (`MpiLoadAudio`, `block_if_empty: true`, `required: true`) |
| controls | four stem toggles (`Input_Get_*`, graph) + `combine` (app-side, unprefixed) |
| outputs | four `SaveAudioAdvanced`, titled `Output_Audio_1..4`, flac, prefixed `stems/Bass` … `stems/Vocals` |

```
Input_Audio (MpiLoadAudio)
  -> AudioSeparation (half_sine, chunk_length 16.0, chunk_overlap 0.1)
       -> Bass   -> Input_Get_Bass   -> Mpi Clear Vram -> Output_Audio_1  (stems/Bass)
       -> Drums  -> Input_Get_Drums  -> Mpi Clear Vram -> Output_Audio_2  (stems/Drums)
       -> Other  -> Input_Get_Other  -> Mpi Clear Vram -> Output_Audio_3  (stems/Other)
       -> Vocals -> Input_Get_Vocals -> Mpi Clear Vram -> Output_Audio_4  (stems/Vocals)
```

Each `Input_Get_*` is an `MpiBlocker`. Its `input` is **lazy**, so an off gate skips the work
feeding it — an all-off run would not even load the separator. That cuts both ways, and the
cost model is the thing to say out loud: **any single stem selected runs the full separation**,
so picking fewer saves save-time, not GPU.

## The controls, and why `combine` has no `Input_` prefix

Four toggles name the gates and route into `injectionParams` like any `Input_*` id. `combine`
names no node and stays unprefixed, so it lands in `flowInputs` where `generationService` reads
it. **A prefixed id would be silently skipped at injection and the toggle would do nothing.**

Combining happens APP-SIDE, and that is a deliberate reversal of the usual "express it in the
graph" rule, because combining a SUBSET is not expressible there: a blocked `MpiBlocker` branch
cannot feed an `AudioCombine` — it blocks the combine too — so the graph would need a silence
source, three chained combines and a separated/combined switch. App-side, the graph stays
exactly what the bench proved and the app sums whatever landed.

The two cross-field rules (**at least one stem**, **combine needs two**) are declared, not coded:
`{ group: 'stems', minActive: 1 }` on each toggle and `{ enabledWhen: { group: 'stems', atLeast:
2 } }` on combine. Contract in [../ui/carousel-frame/fields.md](../ui/carousel-frame/fields.md)
§ Fields that constrain each other. The floor is load-bearing: with every stem off the run
blocks every branch, reports SUCCESS, and lands nothing at all.

## The combine path

`generationService` collapses the N urls to one and hands the rest to `save-generation` as
`mixViewUrls`; the route downloads them and calls `mixAudioFiles`
(`services/ffmpegMux.js`). It goes through that route rather than one of its own because
everything after the bytes arrive is identical — the monotonic sequence, the sidecar, the flow
provenance, the project.json write. Only where the file comes from differs.

🔴 **`amix` needs `normalize=0`.** Its default divides every input by N, so drums+vocals would
come back at half the level they had in the track and all four at a quarter — no error, nothing
logged, and the file plays. Pinned by `tests/audio-mix-levels.test.cjs`, which asserts that
mixing a tone with a copy of itself is **+6.02 dB** (measured, not assumed).

🔴 **A SUBSET SUM CLIPS, and the obvious reasoning says it cannot.** "These stems came out of
one file, so they cannot exceed it" holds only for ALL of them. Drop one and you remove whatever
was pulling the waveform DOWN at some peaks. Measured on a real MiniMax track — they arrive
mastered to 0 dBFS, and Drums alone is already there:

| combination | true peak before the trim |
|---|---|
| all four | +0.01 dB |
| instrumental (no vocals) | +0.03 dB |
| **drums + vocals** | **+0.63 dB** |

FLAC hard-clips that, in a file whose entire purpose is to be opened in a DAW. So `mixAudioFiles`
runs **two passes**: `astats` after `aformat=fltp` to see the overshoot (`volumedetect` reads the
CLAMPED integer and reports a tidy 0.0 dB for a file being destroyed — the reading that would let
this regress unseen), then one static `volume=-Xdb` on the write. Waveform and inter-stem balance
untouched; the file is quieter by under a decibel instead of clipped. **No limiter** — this flow
hands over material to be processed, and dynamics are the user's to decide. The measurement fails
OPEN: unparseable means write untrimmed, because a possibly-clipping file beats no file.

A mix failure FAILS THE SAVE. It is not the video mux, where keeping a silent video beats losing
the generation — here the combined file is the entire product, and quietly landing one stem
under a name that says "combined" would be worse than an error.

The combine is re-checked against what actually LANDED, never against the toggle alone: a
disabled control keeps its value, so a one-stem run combines nothing and is a normal single card
— which is also what makes its NAME right, since the per-stem label only applies to a multi-card
run.

## 🔴 Why the captures are numbered from `_1`

`Output_Audio` — the bare title — is the **video mux side-channel**, matched EXACTLY by
`commandExecutor` and collected into `audioOutputUrl` rather than into `outputUrls`. A stem
carrying it would be swallowed by that path and never become a card. Numbering from `_1`
keeps the graph clear of it entirely. The general rule now lives in
[../02-media-io.md](../02-media-io.md) § Multi-output capture, along with the second half:
`collectComfyOutputUrls` reads images/gifs/videos and nothing else, so multi-audio needed its
own node set and the audio reader.

**And the card NAMES come from the graph.** Four cards, one op, one `getFilePrefix` — without
`filename_prefix: stems/<Stem>` on each save they all arrive called the same thing and the user
opens four files to find the vocal. `labelFromComfyOutputUrl` reads the label back off the
/view filename. Changing a `filename_prefix` here renames a card; it is not cosmetic.

## Why this is a separate Flow from music generation (MPI-664)

One Flow is one dispatch through the generation queue — there is no second Run button. It is
also the better product shape: generate several songs, listen, stem only the keeper. Stemming
every candidate would spend GPU on tracks that get binned.

It is **not** limited to Cubric-generated audio. The input is a normal audio slot, so anything
staged into the project can be stemmed, and that is probably the wider use.

## The node pack, and why its requirements are NOT installed

[christian-byrne/audio-separation-nodes-comfyui](https://github.com/christian-byrne/audio-separation-nodes-comfyui),
MIT, pinned at `ac33956`. Ships 7 nodes; **6 register** — `AudioVideoCombine` needs `moviepy`,
which we deliberately do not install. Every import in its `__init__.py` is individually
try/except-wrapped, so the missing dep costs that one node and nothing else.

`installRequirements: false`, and all four requirement lines are the reason:

| line | why not |
|---|---|
| `librosa>=0.10.2,<1` | a stale cap. The engine runs librosa 1.0.0 (curated), so installing this **downgrades** it for every other pack. Separation never touches librosa — only `AudioGetTempo` / `AudioTempoMatch` do (`src/utils.py:77,83`), and both work on 1.0.0 |
| `torchaudio>=2.3.0` | engine-owned, never ours to move |
| `numpy` | already curated (2.5.1) |
| `moviepy` | dropped on purpose; declared in `compile-node-deps.mjs` § DROPPED |

There is no source-patch mechanism (`routes/engine.js` "patching" only rewrites `.bat` flags),
so the answer is pin-around, not patch.

## 🔴 First run downloads ~320 MB outside the download manager

`torchaudio` fetches `hdemucs_high_trained.pt` into the **torch hub cache** on first use — no
progress UI, no sha check, no GC, and repeated after anything that clears that cache. Same
class as RIFE (MPI-222) and Chatterbox, but **not fixable with `targetPath`**: the path comes
from `torch.hub`, which reads no ComfyUI config. An interrupted download raises `BadZipFile`,
and the node's own error names the cache dir to delete.

## Constraints carried from the prototype

| Constraint | Detail |
|---|---|
| Output rate is hardcoded | `sources_to_tuple` stamps `self.model_sample_rate` — always **44100**, whatever went in. MiniMax is 32 kHz, so it is upsampled in and never brought back down |
| VRAM contention | `bundle.get_model()` runs fresh every execution and is **never registered with `comfy.model_management`**, so ComfyUI will not unload a music model to make room. The `Mpi Clear Vram` node in the graph is the mitigation — **keep it** |
| Whole-track GPU buffer | `torch.zeros(batch, 4, channels, length)` fp32 — ~423 MB for a 5-minute track, scaling with LENGTH, not chunk size |
| Quality ceiling | `HDEMUCS_HIGH_MUSDB_PLUS` = Hybrid Demucs **v3**, a generation behind `htdemucs_ft` / BS-Roformer. Expect vocal bleed into **Other** and reverb tails following the vocal. Accepted by the user: "bleeds can be fixed in the mix" |

## Deliberately out of scope

- **An instrumental preset.** `combine` with vocals deselected already IS one; a named button
  for it would be a second way to say the same thing. (If one is ever added IN THE GRAPH,
  `AudioCombine`'s `method` must be **`add`** at every stage — chained `mean` silently weights
  bass 0.25 / drums 0.25 / other 0.5.)
- **Stems AND their combination in one run.** Combine replaces the separate cards rather than
  adding a fifth. Two runs is the answer, and the second is cheap only in wall-clock terms —
  see the cost note above.
- **A better separator.** `htdemucs_ft`, BS-Roformer and the `set-soft/AudioSeparation` pack
  (MDX + 6-stem models) all beat this. Revisit only if the bleed bites in practice.
- **MP3 out.** The source is already lossy; separate → re-encode → master stacks artifacts
  three deep.
- **Controls.** `AudioSeparation`'s three knobs are chunking plumbing, not choices about the
  result; the graph bakes the values proven on the bench.
