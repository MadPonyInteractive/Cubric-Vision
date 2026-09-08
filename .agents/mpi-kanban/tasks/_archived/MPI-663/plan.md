# Wire Stems as a Flow — audio in, four stem cards out

## Current State

**LIVE RUN DONE (2026-08-30, agent instance on :55689 under a GPU lease).** Four cards land
named per stem and play; a drums+vocals combine run lands ONE `flowStems_001` card with the
clip trim firing for real (+0.71 dB measured, `volume=-0.705dB` written); the last stem
toggle locks and Combine greys below two; the Flow Library opens with zero console errors.
**ART DONE TOO** — `flow-stems.webp` + `.mp4` built, declared, committed and pushed
(`a74b5cd6`); tile and hero both verified serving 200 with the right byte counts and the
hero proven playing at 444 px in a live instance. Only the user's own listen remains.
Evidence and the two screenshots: `validation.md`. **One thing the handoff did not know:
the separation node pack was never in the APP engine, only on the bench** — boot's UW deps
repair installed it, but an attached instance cannot restart an engine it did not spawn, so
the restart goes through `POST /comfy/start {"isUserRestart": true}`. Next: the flow art,
then declare `preview`/`video`.

**SHIPPED AND PUSHED (2026-08-30).** Code, tests and docs are on master, CI green:
`6ceaf661` (the flow), `8fbfb185` (icons), `b3266f65` (red-CI fix), `ebe929cb` (clip trim).
815 tests pass, lint clean. What remains is a live app run and the flow's art.

The graph was RE-EXPORTED after the notes below were written: four `MpiBlocker` gates titled
`Input_Get_<Stem>` now sit between the separator and each save, so the user picks which stems
he wants. Everything from "Proven graph" down describes the FIRST version and is kept only for
the constraint table, which still holds.

What the flow does now:

- Four stem toggles (`Input_Get_*`, graph) + `combine` (unprefixed, APP-side).
- `Output_Audio_1..4`, each landing its own gallery card. Card names come from each save's
  `filename_prefix` (`stems/Bass` -> `Bass_00001.flac` -> a card called "Bass").
- Combine sums the selected stems into ONE card, server-side, via `save-generation`'s new
  `mixViewUrls` -> `mixAudioFiles`.

The three things that needed building rather than wiring, all documented in
`docs/playbooks/add-flow/existing-flows/stems.md`:

1. **Multi-audio capture never existed.** MPI-259 built multi-output for image and video and
   explicitly excluded audio (`if (t === 'output_audio') return false`), because at that point
   audio was only the video mux side-channel. Added `outputAudioMultiNodeIds`.
2. **App-side combine.** A subset combine is not expressible in the graph: a blocked
   `MpiBlocker` cannot feed an `AudioCombine` (it blocks the combine too).
3. **Cross-field constraints** (`group`/`minActive`, `enabledWhen`) so the last stem cannot be
   turned off and Combine is dead below two. Declarative, so a third-party Flow can use them.

Proven on the user's own track (`D:\WORK\Images\Outputs\audio\audio_minimax_music3_00008.mp3`),
bench run under a GPU lease, 10s for 40s of audio. The user has heard the four stems and the
combined files and signed off: "They sound good. I'm happy."

## Plan Drift

- **The graph gained per-stem gates and the outputs were renumbered.** `Output_Bass/Drums/...`
  capture NOTHING (the executor matches `output_image*` / `output_video*` / `output_audio*`), and
  the bare `Output_Audio` is the mux side-channel, so they are `Output_Audio_1..4`, numbered from
  `_1`. **The BENCH canvas still has the old titles and the author's test scene** — the repo raw
  is the corrected copy. Re-exporting from ComfyUI without retitling re-breaks capture.
- **Combining moved OUT of the graph**, reversing the usual "express it in the graph" rule, for
  the `MpiBlocker`/`AudioCombine` reason above.
- **A subset stem sum CLIPS**, which the code originally asserted was impossible. Stems sum back
  to the original only when ALL are present; drop one and you remove what was pulling the
  waveform down. Measured drums+vocals at +0.63 dB over full scale on a track mastered to 0 dBFS.
  `mixAudioFiles` now measures in float and applies one static trim.
- **I turned master red once**: declared `preview: 'flow-stems.webp'` before the art existed, so
  the Flow Library 404'd. Fixed, plus a guard so it now fails in `npm test` rather than in CI.
- Preview art is deliberately NOT declared until it exists.


Project mode: scalable-foundation.

The graph is **prototyped and accepted on the bench** (127.0.0.1:8188, `G:\ComfyUi\ComfyUI`,
workflow tab `flow_stems`). The user has run it on a real MiniMax Music 3 track and signed off:
"it comes out nicely, bleeds can be fixed in the mix, we can go with this version for now."

Proven graph:

```
Input_Audio (MpiLoadAudio, block_if_empty true)
  -> AudioSeparation  (chunk_fade_shape half_sine, chunk_length 16.0, chunk_overlap 0.1)
       -> Bass   -> Mpi Clear Vram (passthrough) -> Output_Bass    (SaveAudio, flac, stems/Bass)
       -> Drums                                  -> Output_Drums   (SaveAudio, flac, stems/Drums)
       -> Other                                  -> Output_Other   (SaveAudio, flac, stems/Other)
       -> Vocals                                 -> Output_Vocals  (SaveAudio, flac, stems/Vocals)
```

Node pack: [christian-byrne/audio-separation-nodes-comfyui](https://github.com/christian-byrne/audio-separation-nodes-comfyui),
MIT, installed on the bench at commit `ac33956`. Ships 7 nodes; **6 register** — `AudioVideoCombine`
needs `moviepy`, which is deliberately not installed and not wanted. Every import in its
`__init__.py` is individually try/except-wrapped, so the missing dep costs only that one node.

Why this is a separate Flow from music generation (MPI-664): one Flow is one dispatch through the
generation queue. There is no second Run button. The split is also the better product shape — the
user generates several songs, listens, and stems only the keeper.

## Implementation

- [x] Wire the Flow end to end per `docs/playbooks/add-flow/`.
- [ ] Live run in the app, then the flow's preview art.

## Completed

- [x] Raw + runtime workflow (`comfy_workflows/raw/flow_stems.json` -> `flow_stems.json`), with
      the author's test scene scrubbed.
- [x] Op in the 4 files; `FlowDef` with the audio slot, four stem toggles and `combine`.
- [x] Multi-audio capture (`outputAudioMultiNodeIds`) + per-card naming from `filename_prefix`.
- [x] App-side combine: `mixViewUrls` on `save-generation` -> `mixAudioFiles`, with a clip trim.
- [x] Cross-field constraints in `declaredFields` + the frame paint.
- [x] Node pack pinned, `installRequirements: false`, `compile-node-deps --check` green.
- [x] Three stem icons + guards for icon names and preview assets.
- [x] Tests (815 pass) and docs. Bench run proven on a real track; user signed off on the audio.

## Remaining Work

1. **Live app run** — nothing has ever exercised this in a running app. Everything so far is
   bench dispatch + offline tests, so the UI is UNVERIFIED: the four toggles, the last-stem lock,
   Combine greying below two stems, and whether four cards actually land in the gallery.
   Needs the GPU, which is shared — take the lease.
2. **Flow graphics** (`/mpi-flow-graphics`) — the user's brief: five waveforms, the input plus
   the four stems, "something simple". Done from scratch like the other audio flows. The four
   real stems are on disk (see the handoff). Then declare `preview`/`video` on the FlowDef,
   which the guard currently keeps honest.

## Verification

**Verify mode:** user-ux

The four stems must be listened to in the running app — separation quality is a judgement only the
user can make, and the Flow overlay's audio result pane needs eyes on it. Everything mechanical
(inject test, `node --check`, four cards appearing, files landing as flac) is agent-verifiable and
should be green before asking.

## Preservation Notes

**Shape decisions already taken — do not relitigate:**

- Input slot is `audio1`, `MEDIA_TYPE.AUDIO` (the enum member, never the bare string `'audio'`),
  node `MpiLoadAudio` titled `Input_Audio`. **No injector change is needed** — the title pattern
  `/^input_audio(_\d+)?$/i` already tags the kind and resolves the path. See
  `docs/playbooks/add-flow/02-media-io.md` § "The two audio traps (MPI-259)"; both traps are
  already fixed upstream, but re-read them before wiring.
- Multi-output capture: every `Output_<Type>*` node lands as its own gallery card. Four outputs =
  four stem cards.
- **Deliberately out of scope:** a 5th "instrumental" output (bass+drums+other summed via
  `AudioCombine`), and any better separation model. The user's call is ship this, improve later.

**Constraints to carry into implementation:**

| Constraint | Detail |
|---|---|
| Output rate is hardcoded | `sources_to_tuple` stamps `self.model_sample_rate` — always **44100**, whatever went in. MiniMax is 32 kHz, so it is upsampled in and never brought back down. |
| VRAM contention | `bundle.get_model()` runs fresh every execution and is **never registered with `comfy.model_management`**, so ComfyUI will not unload a music model to make room. The `Mpi Clear Vram` node in the graph is the mitigation — keep it. |
| Whole-track GPU buffer | `torch.zeros(batch, 4, channels, length)` fp32 — ~423 MB for a 5-minute track, scaling with length, not chunk size. |
| First run downloads | ~320 MB `hdemucs_high_trained.pt` into the torch hub cache. An interrupted download raises `BadZipFile`; the node's own error names the cache dir to delete. |
| Quality ceiling | `HDEMUCS_HIGH_MUSDB_PLUS` = Hybrid Demucs **v3**, a generation behind `htdemucs_ft` / BS-Roformer. Expect vocal bleed into **Other** and reverb tails following the vocal. Accepted. |
| `AudioCombine` weighting | If an instrumental output is ever added: `method` must be **`add`** at every stage. Chained `mean` silently weights bass 0.25 / drums 0.25 / other 0.5. |

**Shipping means pinning.** `dev_configs/node_lock.json` goes 16 -> 17 upstream nodes. The pack's
`requirements.txt` carries a stale `librosa>=0.10.2,<1` cap and the bench runs **librosa 1.0.0** —
installing its requirements would *downgrade* librosa and risk the CUDA torch build. Both librosa
calls the pack makes (`onset_strength`, `beat_track` in `src/utils.py:77,83`) were tested on 1.0.0
and work, and **separation itself never touches librosa** — only `AudioGetTempo` / `AudioTempoMatch`
do. There is no source-patch mechanism (`routes/engine.js` "patching" only rewrites `.bat` flags),
so the answer is pin-around, not patch. Also run `node scripts/compile-node-deps.mjs --check` —
mandatory when adding a custom node with `installRequirements: true` (MPI-413).

Sibling card: **MPI-664** (MiniMax Music 3 flow). These two are the pair — generate, then stem.
