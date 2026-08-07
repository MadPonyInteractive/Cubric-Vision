# MiniMax H3 Reference (ref2va) — what it actually does

The reference half of H3: ModelDef `minimax-h3-ref2va`, one op `ref2v_ms`, graph
`comfy_workflows/minimax_h3_r2va.json`, transformer `MiniMaxH3ReferenceToVideo`.
Wiring card MPI-475; the hub is [README.md](README.md) and the licence constraint
there governs this card too (same `MODEL_LICENCES` descriptor, so no second dialog).

Installing it on top of fl2va downloads only the 20.97GB transformer — the Qwen3-VL
encoder and both VAEs are the same dep ids.

## Judged 2026-08-07 — on the correct transformer

Read § "Why a plausible result was not evidence" before treating any EARLIER ref2va
result as data. These four are the first judged on the right DiT.

| Run | Result |
|---|---|
| Character reference **sheet**, several clips | Identity holds **well** — this is the model's whole claim and it lands |
| Character sheet **+ reference audio** | The generated woman's **voice matches the audio reference**; resemblance to the sheet good |
| One **image** + one **video** reference | The woman from the image performed the **dance from the video** — motion transfers off a reference video |
| Character sheet + a **dragon video**, multi-stage | "The woman from `<Picture 1>` riding the dragon from `<Video 1>` over the battlefield" — both held, and the two references composed into one scene rather than one winning |
| **No references at all**, prompt only | Works. The ref2va graph handles a bare text-to-video run |

That last row is why `ref2v_ms` is one op with no t2v/i2v split: references never
become frames, so the presence of chips is the only variable and an empty strip is a
valid run, not an error state.

### Lip-sync is NOT established either way

In the sheet+audio clip the subject **did not move her lips**. She was looking at her
phone, so it read as an internal thought rather than a failure — plausible, and the
user accepted it. But that is **one sample with a confound**, so nothing here says
whether ref2va drives mouth motion from a reference audio track. If it matters, test
it deliberately: a subject facing camera, an audio reference that is clearly speech.

## Why a plausible result was not evidence

Both H3 transformers load through the same graph shape. The **fl2va** DiT does not
error when handed references — it samples fine and returns a good-looking video that
**ignored every reference**. Every ref2va result before the 2026-08-07 re-export came
off it, which is exactly how the bug survived: nothing on screen said anything was
wrong. A ref2va run is only evidence if the identity demonstrably follows the
reference.

## Prompt tags are SLOT numbers, rewritten inside the node

The prompt is written against slot numbers — `<Picture 1>` is whatever is wired into
`ref_image_1` — and `MpiH3References` (ComfyUi-MpiNodes `238f056`) rewrites them to
the ordinals core presents, dropping any tag naming an empty slot.

Two consequences worth knowing:

- A tag for a slot you did not fill is **removed** from the prompt, not passed through.
  Core presents no such label, and a dangling tag sends the model looking for a
  reference that is not there.
- Core shares ONE audio sequence between reference videos and standalone clips, and
  emits a video's soundtrack BEFORE its `<Video k>`. So behind a **sounded** reference
  video, a standalone clip whose chip says `Audio 1` is `<Audio 2>` to core. That is
  the rewrite working. Whether a video HAS a soundtrack is a property of the file and
  is unknown until decode time, which is why the translation lives in the node and
  cannot be done by the app or the user.

**Verifying the node is live:** presence in `/object_info` proves nothing — `a603fc4`
registers the same node name, and a running ComfyUI keeps the old module across a repo
pull. The `prompt` tooltip separates them:

```
curl -s http://127.0.0.1:48188/object_info/MpiH3References   # engine; :8188 is the bench
# 238f056 → "Address references by their SLOT number here: …"
# a603fc4 → "Address references by the tags in the ref_tags output: …"
```

## What it costs — measured on a 4060 Ti 16GB, 2026-08-07

A **video reference is the expensive input**, and the cost is not a one-off: reference
tokens ride EVERY sampling step, so a clip's worth of frames multiplies every step.

| Run | Stage 1 | s/step |
|---|---|---|
| Bench, ONE image reference, `match` | — | **11–12** |
| Bench, ONE image reference, `max` | — | 14 |
| 1 image + 1 **video** ref, 1152×640, 2s | 8m38s | **~52** |
| 1 image + 1 **video** ref, 1152×640, 3s | 7m23s | ~44 |

Stage 1 is **10 steps**, not 20: `BasicScheduler` makes 20 sigmas and `SplitSigmas`
cuts at 10, so each stage samples half. Divide a stage's wall time by 10, not 20.

**Do not read a slow run as a memory problem without checking GPU utilisation first.**
On the 8m38s run: dedicated VRAM 13.3/16GB, shared 24.1GB, system RAM 60.6/63.8 —
which looks like thrashing, and is not. GPU utilisation was **98%**, so the card was
compute-bound, not starved by streaming. Those memory figures are simply what 53GB of
weights on a 16GB card looks like: the log stages 25140MB of text encoder and 19995MB
of transformer, and the app's own trade table already says 12GB VRAM → ~48GB RAM.

13.3/16 dedicated is the practical ceiling, not a cap: ComfyUI reserves ~600MB on
Windows (`EXTRA_RESERVED_VRAM`) plus a 0.8GB inference minimum, and the desktop holds
the rest. `--lowvram` in the engine's launch line is a **no-op** here — its own
`cli_args.py` says "Doesn't do anything if dynamic vram is enabled", and
`enables_dynamic_vram()` is true unless `--highvram/--gpu-only/--novram/--cpu/
--disable-dynamic-vram` is passed, none of which the app passes.

## Controls

- **Reference detail** (`ref_image_size`) — `match` is the default and the baked
  value; `max` should raise s/step noticeably (11–12 → 14 s/step with ONE reference on
  the bench, and reference tokens ride every sampling step, so more references is
  steeper). **If `max` costs nothing, the control is not reaching the node** — check
  the injected `Input_Refs.ref_image_size` key.
- **No negative prompt.** `negativePrompt: false`, because the graph carries no
  `Input_Negative` and no `Input_Negative_Audio` — dropping the toggle removes both
  fields at once rather than shipping two that inject nowhere.

## Still unchecked

Not defects, just untested as of 2026-08-07: the `max` vs `match` cost on this card,
the `<Audio 2>` shift in a live run (only visible via `ref_tags` on the node output),
the 15-chip strip scroll, and the status bar reading `1/2` then `2/2` across a run.

The ModelDef still borrows fl2va's `minimax_h3_preview.mp4` as its card video, and
that **stays** — the user's call on 2026-08-07, after the judged clips existed. Do not
re-raise it as an open item; it is a decision, not a leftover.
