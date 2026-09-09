# Sound & Music (MPI-694) — Stable Audio 3, everything except sung vocals

> Part of [add-flow/existing-flows](../README.md). Backing tracks and instrumentals, a single
> instrument, sound effects, one-shot hits — one op, two checkpoints behind a lazy gate, and a
> length slider that is exact. Its twin is [song.md](song.md), which owns the one thing this
> engine does not claim. Read this before touching the flow, its graph, or its licence gate.

## Shape

| | |
|---|---|
| id / op | `sound-and-music` / `flowSoundAndMusic` |
| label / prefix | `Flow: Sound & Music` / **`flowSoundMusic`** — the filename guard compacts the title with punctuation dropped, so spelling the ampersand out FAILS `tests/flow-output-filename.test.cjs` |
| graph | `comfy_workflows/flow_stable_audio.json` — **17 nodes** (19 until the Low VRAM pair came out) |
| `requiredModels` | `[]` — a FLOW WITH DEPS, the same shape as Song and Voice Changer |
| `requiredDeps` | 3 weights, **11.81 GB**: `stable-audio-3-medium` 8.59 + `stable-audio-3-small-sfx` 2.11 + `t5gemma-b-b-ul2` 1.11 |
| licence | `STABLE_AUDIO_3`, keyed `flow:sound-and-music` — 🔴 ONE descriptor carrying TWO agreements |
| `mediaType` | `'audio'`; inputs **none** — no `inputSchema`, so step 0 renders its own "needs no input media" panel |
| shape | **no `steps` at all** — the intro, then the run slide. Fields: `positive`, `Input_Category` (select ×4), `Input_Duration` (slider) |

```
Input_Category -> Is_Tonal (MpiTextContains, "Music, Instrument")
      -> Model_Gate + Vae_Gate (both MpiIfElse, LAZY: the unpicked ckpt never loads)
         over Ckpt_Tonal / Ckpt_Sfx
Input_Positive -> Positive (CLIPTextEncode) <- Load CLIP (t5gemma)
Input_Duration -> Empty Latent Audio
      -> KSampler -> VAEDecodeAudio -> MpiClearVram -> Output_Audio
```

## 🔴 Why two flows and not one

This shipped for one day as a five-outcome dropdown on a single flow with one 30.92 GB install
gate, and Fabio reversed it before a line was built (2026-09-05): *"I think this could be two
separate models… This way, we keep dependencies separate as well, and we avoid complicated UIs.
The user might just want to do backing tracks and sound effects, and not do any songs."*

Someone who never writes a song pays **11.81 GB instead of 30.92**, and neither flow grows a
stage that exists to hide the other. **Do not re-merge them**, and do not resurrect stage 0
(`Input_Outcome`), the five-arm dropdown, the `hiddenWhen` cascade across stages, the single
30.92 GB gate, the fourth `CAPTION` marker in `enhance.to`, or the merged graph.

**The split is by CAPABILITY** — his verdict after hearing all four modes: *"I tried everything.
Instrumental, effects, one-shot, and music: it's very good… We can use it for everything else
but sung songs."* MiniMax keeps VOCALS; this takes the rest, and SFX and one-shots are a
capability Vision had no route to at all. **Neither description names the other flow** (Fabio,
2026-09-07): the user is standing inside Sound & Music, and a sentence about songs there hints
the flow might do them.

## 🔴 The category dropdown IS the checkpoint switch

The four values are Stability's own `CustomCombo`, read out of their blueprint rather than a doc.
In the graph they reach **ONE `MpiTextContains` node** (`Is_Tonal`, whole-word, case-insensitive,
`words: "Music, Instrument"`) whose boolean drives two lazy `MpiIfElse` gates. The option strings
**are** the lookup table: no switch bank, no index to drift, and the unpicked checkpoint never
loads — which keeps this a single op with a single workflow.

| option | checkpoint | staged (engine log, first real run) |
|---|---|---|
| `Music`, `Instrument` | `stable_audio_3_medium` | 2771 MB |
| `SFX`, `One-shot` | `stable_audio_3_small_sfx` | 875 MB |

`SAT5GemmaModel` (537 MB) is shared by both arms.

🟡 **`Instrument` on Medium is a GUESS, not a measurement.** It is there because it is tonal.
`small_sfx` made every effect and one-shot Fabio approved; Medium is what he judged music on.
Nobody has A/B'd a single instrument across the two. Changing it is **one word in the graph's
`words` widget** — change it when someone listens.

## 🔴 The length is REAL, and it is the one control MiniMax cannot have

Measured off the decoded file with `ffprobe`, never trusted from the request — asked
1.5 / 2 / 4 / 10 / 25 s, got **1.486 / 2.043 / 4.087 / 10.031 / 25.078 s**.

**Exact to ~80 ms across a 16× range**, on the app path and not just the bench. Song's
`Input_Duration` is a GUILLOTINE by comparison — the AR decides its own length there and the
cut-off only ever shortens ([song.md](song.md) § Cut off at). A categorical difference between
the flows, not a better number. Default 10 s because that is where the approved clips sit;
`max: 190` is the longest duration this card has actually run, not a spec number; `step: 1`, so
the bench's 1.5 s one-shot rounds to 1 or 2 — drop to 0.5 only if one ever needs the half second.

## 🔴 No enhancer, and that is the point

Stability's blueprint carries one (Qwen3.5-2B, 4.55 GB, with 47/80/58/36 worked examples per
category behind a `JsonExtractString`) and we do not port it: it would add 4.88 GB to the one
flow whose whole appeal is being small, and **every clip judged good so far was made with it
OFF** — the door slam, the 1.5 s dry stick, the rain with two thunder rolls, first seed, no
iteration. Adding it later is one `enhance:` block plus one dep line.

🔴 **IF IT IS EVER ADDED IT STAYS A SEPARATE `promptEnhance` DISPATCH.** Collapsing an enhancer
into the audio graph is Stability's single-subgraph shape, and the bench measured its cost:

| arm | `MpiClearVram` | decode | peak VRAM | wall |
|---|---|---|---|---|
| **A** — the blueprint as shipped | — | plain | **12.35 GB** | 19.0 s |
| **C** — unload only | ✅ | plain | **6.44 / 6.19 / 6.44 GB** | 19.7 / 18.0 / 15.3 s |
| **D** — chunked decode only | — | tiled | **12.16 GB** | 33.2 s |
| **B** — both | ✅ | tiled | **6.33 / 6.35 / 6.35 GB** | 38.7 / 31.9 / 32.6 s |

RTX 4060 Ti 16 GB, peak from ComfyUI's own `/system_stats` (`vram_total − vram_free`) polled at
200 ms — **not** `nvidia-smi`. Runner and raw results:
`.agents/mpi-kanban/tasks/MPI-664/bench/stable_audio_vram.mjs` + `.results.json`.

**−5.9 GB (−48 %) for +0.7 s is the price of a mistake we have not made.** Their reprompter and
audio stage share one subgraph; ours do not — `promptEnhance` is a separate dispatch that
already clears at node 13. Not a fix to port INTO Vision: the measured cost of collapsing the
two.

## No Low VRAM — built, measured, and REMOVED, off that same table

Fabio, 2026-09-07: *"I don't think sound and music need that."* The control was copied from
Song's shape, where 13.3 GB of MiniMax weights make it real. Here the whole graph stages
~6.5 GB (Medium 2771 MB + VAE 3243 MB + the 537 MB encoder), and **arm B shows chunked decode
saving nothing on peak once the unload is in** — 6.35 vs 6.19–6.44 GB, inside the noise — while
costing **+15 s at 60 s, reproduced three times**. At 190 s it saves 0.44 GB for +4.2 s. The
6.49 → 5.14 GB figure Stability publish is real, but measured against an un-chunked decode with
everything else still resident: arm D, at 12.16 GB. **The decode was never what pinned the card.
The reprompter was.**

So `VAEDecodeAudioTiled` and its `MpiIfElse` gate came out of `raw/`, the graph was re-converted
(19 → 17 nodes), and the plain decode now feeds `MpiClearVram` directly. Verified by a real run
after. Wire it back only if a real card is measured falling over.

## The licence gate — ONE descriptor, TWO agreements

🔴 **The architecture forces one descriptor, not two.** The gate fires per INSTALL KEY, and all
three weights install under the single `flow:sound-and-music` dep key (`requiredModels: []`), so
a second descriptor could never be keyed there. Rename the flow's `id` without moving the key and
the lookup misses **SILENTLY**: three licensed weights land with nothing shown. `STABLE_AUDIO_3`
therefore carries both agreements, bundled under `licences/stable-audio-3/`:

| file | what it is |
|---|---|
| `LICENSE.txt` | byte-identical to what `stabilityai/stable-audio-3-medium` serves as LICENSE.md — 11,852 bytes, fetched 2026-09-07 |
| `GEMMA-TERMS.txt` | the text of `ai.google.dev/gemma/terms`. Google publish it as a web page and no repo we pull from carries a LICENSE file, so this is a text rendering, not a byte-identical copy |
| `NOTICE.txt` | both required attribution strings, verbatim |

`poweredBy` is **"Powered by Stability AI"** — §IV(a)(iii)'s exact string, not paraphrasable,
rendered on both Flow surfaces via `buildLicenceRows` (MPI-666), which is where a user of this
flow looks: there is no model card, deliberately. **One new field was the only code:**
`alsoLicensed` carries the second agreement as its own link in the gate AND in
`flowLicences.js` — "provide a copy" is not discharged by naming it.

🟢 **No `territory` block, and that is a finding rather than an omission.** Neither agreement
restricts by territory and neither bars outputs — Stability §IV(c)(iii) gives outputs to the
user outright and §V excludes them from "Derivative Work"; Gemma §3.3 claims no rights in them.
Users need no licence of their own either: §III's last sentence exempts anyone receiving the
Materials *"as part of an integrated end user product"* — exactly what Vision is.

### 🔴 TWO OBLIGATIONS THIS FILE DOES NOT DISCHARGE — both block a RELEASE, not a build

1. **Registration with Stability** — §III, mandatory for any Commercial Purpose and with **no
   revenue floor**: <https://stability.ai/community-license>. Shipping Vision is a Commercial
   Purpose. (Use stays free under USD $1M annual revenue across us and affiliates; crossing it
   terminates the licence on that date.)
2. **The EULA clause** — Gemma §3.1 requires §3.2's use restrictions to appear as an
   **enforceable provision in our own terms**, not only in a dialog. The acknowledgements in
   `licences.js` are the notice half; the terms half is a document edit.

Re-fetch both texts if either licensor revises, and bump `version` — a bump invalidates every
prior receipt, which is how a revised AUP reaches users who installed under the old one.

**The weights serve from R2 (MPI-705)**, because HuggingFace measured ~1 %/min on Fabio's line —
~100 minutes for the flow whose appeal is being small. All three sit in `cubric-models`, verified
byte-exact by `rclone lsl` and a public HEAD, `url` on `models.cubric.studio` with the Comfy-Org
HF urls kept as `mirrorUrl`. Every sha256 was verified against HuggingFace's own `X-Linked-ETag`;
`size` comes from `computeDepHashes.py`'s formatter, never typed (1024-based; HF shows decimal).

## The art

Four NEW runs, one per category (the previously approved clips died with a deleted throwaway
project and nothing survived on disk). Durations MEASURED off the files —
**10.031 / 10.031 / 4.087 / 2.043 s** for 10/10/4/2 asked — so the exact-length claim the art
makes is verified, not assumed. Both assets are a **TIME RULER, not lanes**: a row's width IS
its length, so the 2 s one-shot is a fifth of the 10 s bed, and a frost tick marks where each
actually stops. That is deliberate distance from [Stems](stems.md), whose tile is five EQUAL
lanes of one track — four labelled lanes here would have been the same picture with different
words. The hero draws each row in under a heat playhead that halts on its own mark, teaching the
dropdown and the slider in one pass. 31,174 B / 74,935 B, 8.0 s, loop seam 0.013/255.

🔴 **THE SOURCE AUDIO IS EPHEMERAL.** The four flacs live in a scratchpad project
(`…/scratchpad/mpi694-art/MPI-694 Flow Art/Media/flowSoundMusic_00{1..4}.flac`), with prompts
and settings in `sam-runs.json` beside them. This flow's art audio has already been lost once.
**If the art ever needs rebuilding, that audio must be re-generated (GPU, and Fabio's word) or
moved somewhere durable FIRST.**

🔴 Making it found the **bigger-than-the-viewport screenshot** trap (unpainted region pure black,
right dimensions, no error — it reached the live Library once). Now in
[../06-preview-image.md](../06-preview-image.md)'s trap table.

## Out of scope, and still open

- **A reprompter** (and if ever added, as a separate dispatch), and **`Input_Low_Vram`** — built,
  measured, removed. Do not harmonise this flow with Song by putting either back.
- **Sung vocals** are [Song](song.md)'s, by capability and by Fabio's ear. **A second op or
  workflow for the SFX checkpoint** buys nothing — the lazy `MpiIfElse` pair already keeps the
  unpicked one unloaded.
- 🟡 `Instrument` on Medium vs `small_sfx` — untested, one word to change.
- 🟡 A direct A/B against MiniMax on one instrumental brief, before Stable Audio owns that arm.
- 🟡 An agent-dispatched flow gets no caption (`agentDispatch.js:_submitFlow` vs
  `MpiBaseFlow._run`) — not specific to this flow, and worth its own card.
