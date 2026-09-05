# MPI-694 — ONE FLOW, TWO MODELS, ONE ANNOUNCER, FIVE OUTCOMES

**The design is settled with Fabio, 2026-09-05.** Read `brief.md` first (licences + the
measured VRAM fix), and `../MPI-664/research/stable-audio-3-bench.md` for every bench fact.
Nothing here re-derives either.

## The decision

> *"Music with lyrics · Instrumentals · Instrument · One-shot · Sound effects. That's five."*
> — Fabio, 2026-09-05, naming the two bullets he had left blank
>
> *"we could perhaps, in stage 0, have a dropdown for the user to select what he wants to do,
> and that will determine the other stages"*
>
> *"all in one, bro, all in one. All weights, one flow."*

**Music Maker grows a stage 0 and a second engine. It does not become two flows, and it does
not become two installs.**

## 🟢 Four of the five ARE Stability's own selector

Their blueprint carries a `CustomCombo` — `Music` · `Instrument` · `SFX` · `One-shot` — with a
worked recipe per category baked into its `JsonExtractString`. Fabio's list is that combo plus a
fifth arm for the one thing Stable Audio does not claim. **Stage 0 is their category selector
with vocals bolted on the front.**

| stage 0 | engine | checkpoint | their category |
|---|---|---|---|
| **Music with lyrics** | MiniMax Music 3 | minimax-music3-dit | — |
| **Instrumentals** | Stable Audio 3 | `stable_audio_3_medium` | `Music` |
| **Instrument** | Stable Audio 3 | `stable_audio_3_medium` | `Instrument` |
| **One-shot** | Stable Audio 3 | `stable_audio_3_small_sfx` | `One-shot` |
| **Sound effects** | Stable Audio 3 | `stable_audio_3_small_sfx` | `SFX` |

🟡 **The checkpoint split is a recommendation, not a measurement.** `small_sfx` made the three
clips Fabio approved first (door slam, 1.5 s dry stick, rain with thunder); Medium is what he
judged the music on. **`Instrument` has not been A/B'd on either weight** — it is on Medium
because it is tonal, and that is a guess. It is one switch-bank arm to change, so change it when
someone listens rather than arguing it now.

## Stage 0 costs ZERO new frame work

A **step** takes the same `hiddenWhen` clause a field does, and MPI-664 shipped it. A hidden
step is not an empty slide: *"it is not in the flow at all — the ticker never lists it, `›` never
lands on it, and the numbering closes up behind it"*
(`docs/playbooks/add-flow/ui/carousel-frame/steps.md` § A step may declare that it does not apply).

So stage 0 is one `select` field, `Input_Outcome`, and every later step carries a clause:

```js
{ kind: 'fields', tickerLabel: 'Lyrics', title: 'Write the lyrics',
  hiddenWhen: { field: 'Input_Outcome', isNot: 'lyrics' }, fields: [ … ] }
```

🔴 **A skipped step KEEPS ITS VALUES.** The graph must re-test `Input_Outcome` itself rather
than trusting a stage to be gone — the same rule `Input_Instrumental` already lives under, and
the same trap that would otherwise splice a cast into a sound effect.

### The stage map

| stage | shown for | notes |
|---|---|---|
| **0 — What do you want to make?** | always | `Input_Outcome`, 5 options |
| **1 — Describe it** | always | the prompt box. Its label and hint change per outcome |
| **2 — Lyrics / Song structure** | `lyrics` only | already built (MPI-664); `Input_Instrumental` folds INTO stage 0 — an instrumental MiniMax run is now "Instrumentals" and goes to Stable Audio |
| **3 — Cast the voices** | `lyrics` only | already built |
| **4 — Style & tempo** | `lyrics`, `instrumentals` | style + BPM. Not for instrument/one-shot/SFX |
| **run slide** | always | length slider for the four Stable Audio arms; `Input_Low_Vram`; Generate |

🔴 **`Input_Instrumental` DIES as a control.** It is stage 0's `instrumentals` arm now. That
retires `Lyrics_Gate`'s reason for existing on the MiniMax side too — but **do not delete
`Lyrics_Gate`**: deleting it on 2026-09-02 was the defect that made a man sing Fabio's stage
directions, and the MiniMax arm still needs an empty lyrics slot when nothing was written.
Re-point it at `Input_Outcome`, do not remove it.

### The control MiniMax cannot have

Stable Audio's `duration` is **exact to ~80 ms across a 16× range** (measured, three points).
MiniMax's AR decides its own length and the cut-off only ever shortens. So the four Stable Audio
arms get a real length slider (`slider`, `format: 'duration'` — MPI-664 built that too) and the
lyrics arm gets none. **This is a categorical difference, not a better number**, and it is the
single most visible reason the two engines are not interchangeable.

Sensible defaults per arm: one-shot ~2 s, SFX ~10 s, instrument ~15 s, instrumentals ~60 s.

## The graph — ONE workflow, and the idle model never loads

A `FlowDef` has exactly one `operation` and one `workflow`
(`docs/playbooks/add-flow/01-descriptor-and-ops.md`), so one flow is one graph. Both engines
live in `flow_minimax_music.json`, gated on `Input_Outcome`.

🟢 **`MpiIfElse` is genuinely lazy** — `if_else.py:18` declares both arms `"lazy": True` and
implements `check_lazy_status`. The untaken branch's loaders never execute, so **the unused
checkpoint is never allocated**. Same guarantee Stability lean on with `ComfySwitchNode`, and
the same node `Lyrics_Gate` / `Bpm_Gate` / `Vocal_Gate` already use in this graph.

Three things the shipped graph ALREADY has, which the merge inherits rather than adds:

1. 🟢 **VISION NEVER HAS THE ANNOUNCER AND THE AUDIO MODEL CO-RESIDENT — the architecture
   already prevents it, and this is the real reason the fix is free.** The announcer is NOT in
   the music graph. `enhance.op` is `promptEnhance`, a **separate dispatch** running
   `qwen3vl_4b_prompt_enhancer.json`, which carries its own `MpiClearVram` (node 13) after its
   `TextGenerate`. The music graph's own `MpiClearVram` (node 60) sits after the DECODE, before
   `SaveAudio` — it is not the same node doing the same job.

   So the **12.35 → 6.4 GB** measured on the bench is a fix for **Stability's single-subgraph
   blueprint**, where the reprompter and the audio stage share one graph. Ours splits them
   already. **The measurement's value here is a warning, not a patch: do NOT port their
   subgraph shape.** If the Stable Audio arm is ever collapsed into one graph with the
   announcer, it costs 5.9 GB — and the only reason it does not today is that nobody did.
2. 🟢 **Both decoders are already in the graph** — `VAEDecodeAudio` (50) and
   `VAEDecodeAudioTiled` (51), gated by `MpiIfElse` node 66, **`Input_Low_Vram`**. That is
   exactly the "long-duration / small-card fallback, not the default" the measurement argued
   for, and it already exists as a user-facing toggle. **The Stable Audio arm reuses the same
   gate.** No new field, no new decision, and the +15 s tiled-decode cost is only ever paid by
   someone who asked for it.
3. 🟢 `MpiText` title-injection, the `Input_*` convention and the injection guard.

New in the graph: a `CheckpointLoaderSimple` + `CLIPLoader(t5gemma, stable_audio)` +
two `CLIPTextEncode` + `EmptyLatentAudio` + `KSampler(8, cfg 1.0, lcm/simple)` behind the
outcome gate, and a switch bank selecting the checkpoint and the length. Settings are copied
from Stability's own KSampler widgets — do not retune them.

🔴 **NEVER hand-edit `comfy_workflows/flow_minimax_music.json`.** Edit `raw/`, re-convert with
`COMFY_URL=http://127.0.0.1:48188 node scripts/workflow-to-api.mjs <raw>` to stdout, diff,
install.

## The announcer — ONE LLM, ONE recipe, zero app code

Fabio's constraint: do **not** ship two prompt-enhancer LLMs. Keep ours
(`qwen3vl-abliterated-clip`, 4.88 GB, already shipped, already shared with the Image Describer
plugin at `pluginsRegistry.js:66`) and port Stability's four category recipes onto it. Theirs
(`qwen3.5_2b_bf16`) is 4.55 GB — **330 MB apart, so this was never a VRAM decision**; the cost
of two is users downloading both, 9.43 GB, and ours arrives free with Krea2/Qwen/Image Describer.

`flow.enhance` is one object per flow with a fixed `to:` marker map, so five outcomes are served
by **one recipe that branches**, exactly as `Input_Instrumental` already makes it branch:

- **`Input_Outcome` joins `enhance.from`.** `from` is also the cache key, and the outcome is
  precisely the field whose change makes a previous answer stale.
- **Add a fourth marker** to `to:` — `CAPTION: 'Input_Caption'` — carrying the single prose
  caption the Stable Audio arms want. The MiniMax arm ignores it; the Stable Audio arms ignore
  MOOD/VOCAL/ARRANGEMENT. Extra markers cost nothing when the graph does not read them.
- `Input_Instrumental` leaves `from` with the control.

🟡 **Stability's recipes are example-dense — 47/80/58/36 worked examples per category, every one
naming literal instruments.** This card banned examples after ONE leaked a lo-fi kit into
Fabio's intro. It suggests the rule is about **salience, not presence**: one example is a
template to copy, forty-seven are a distribution. **Test it before porting them wholesale** —
and note this is a structural question, NOT permission to reopen recipe tuning.

## The install gate — 30.92 GB, one list, decided

`requiredDeps` is one flat list per flow and the gate is all-or-nothing
(`MpiFlowLibrary.js:222`). Fabio chose that knowingly: **all weights, one flow, no per-outcome
dep gating.**

| dep | GB |
|---|---|
| `minimax-music3-dit` | 4.58 |
| `minimax-music3-text-encoder` | 8.57 |
| `vae-minimax-music3-dav` | 0.21 |
| `stable-audio-3-medium` *(new)* | 9.22 |
| `stable-audio-3-small-sfx` *(new)* | 2.27 |
| `t5gemma-b-b-ul2` *(new)* | 1.19 |
| `qwen3vl-abliterated-clip` | 4.88 |
| **total** | **30.92** |

Up from 18.22 GB. 🟡 **The smoke volume fits this, but only just.** MPI-695 measured
`cubric-smoke` (uebvm3350f, EU-RO-1) at **314.2 of 340.0 GB used — 25.8 GB free**, and
`ensureVolume` refuses a run that does not fit with 5% headroom *after* the CPU Pod is already
up. The three new deps are **12.68 GB** (9.22 + 2.27 + 1.19), so they fit — with ~13 GB to
spare, and nothing else may land first. **Run `--plan` before renting anything; it prints the
set and its GB and spends nothing.** Peer message `65ea3341`.

**Never type these sizes** — `computeDepHashes.py --sizes`, because `size` is
parsed 1024-based while HuggingFace displays decimal. The three new deps come from `Comfy-Org`
(not gated), URLs baked into Stability's own blueprints, and **every one is sha256-verified
against the `lfs.sha256` the HF API exposes** — a truncated download exits 0, and it already
bit this card once.

## Before release — five licence obligations

Full reading in `brief.md` § GATE 1. None blocks the build; all five block a release:

1. **Register with Stability** — mandatory for commercial use, **no revenue floor**.
2. A `Notice` file with both verbatim strings (Stability's and Gemma's).
3. Both licence copies bundled for recipients.
4. **"Powered by Stability AI"** displayed in the UI, docs or about page.
5. An **enforceable** Gemma §3.2 clause in our own terms, with notice to users.

Our end users need no licence of their own — §III exempts anyone receiving the weights as part
of an integrated end user product. Outputs are the user's under both agreements, and neither
licence restricts by territory. `flowLicences.js` / `licences.js` is the surface; `licences.js`
keys `MINIMAX_MUSIC3` on `flow:minimax-music` and **a lookup miss is SILENT**.

## Still open

- 🔴 **The owed MiniMax Generate** — one run with Instrumental ON to judge whether bare tags put
  the sections where Fabio asked. Only he can run it, and stage 0 changes where that control
  lives, so do it before the merge or accept it moves.
- 🟡 `Instrument` on Medium vs `small_sfx` — untested, one switch arm.
- 🟡 The example-density question above.
- 🟡 A direct A/B against MiniMax on one instrumental brief, before Stable Audio takes that arm
  for good.
- 🟡 Does the reprompter beat a hand-written prompt? Every clip judged good so far was made with
  it **off**.
- 🟡 Preview graphics (`/mpi-flow-graphics`) and
  `docs/playbooks/add-flow/existing-flows/minimax-music.md`, which will need renaming.
- 🟡 **An agent-dispatched flow gets no caption** — `agentDispatch.js:_submitFlow` calls
  `submitFlowGeneration` directly while `_autoEnhance` lives in `MpiBaseFlow._run`, so
  `/connector/generate` sends the enhancer fields EMPTY. Worth its own card; it is why the owed
  run cannot be done by an agent.

## Do NOT re-open

Track length, the UI shape, the `@` picker, the enhancer recipe (Fabio's raw-ComfyUI control run
proved the pipeline is not the ceiling), `medium_base` (it is the fine-tuning base, not the
quality ceiling), or the MiniMax channel hierarchy (Lyrics ≫ Global Metadata ≈ Vocal Details >
Arrangement, measured across seven runs).
