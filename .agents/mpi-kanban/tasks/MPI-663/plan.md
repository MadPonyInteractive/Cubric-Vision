# Wire Stems as a Flow — audio in, four stem cards out

## Current State

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

- [ ] Wire the Flow end to end per `docs/playbooks/add-flow/` — `FlowDef` in `flowsRegistry.js`,
      the op in its 4 files, the audio input slot, the runtime workflow + its `raw/` twin, and the
      preview assets. No-model flow, so skip the model-guard sections; follow `02-media-io.md` for
      the audio slot and multi-output capture.
      **Verify:** inject test, `node --check`, then a live run in an isolated app that produces
      four playable stem cards from one gallery audio card.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Wire the Flow end to end (above).

## Plan Drift

- None yet.

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
