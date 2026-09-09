# Song (MPI-664, split by MPI-694) — MiniMax Music 3, and it only makes SUNG songs

> Part of [add-flow/existing-flows](../README.md). A brief in, a finished song out: lyrics,
> a cast of voices, one of eighteen style families. Its twin is
> [sound-and-music.md](sound-and-music.md), which owns everything this flow does not sing.
> Read this before touching the flow, its graph, or its enhancer recipe.

## Shape

| | |
|---|---|
| id / op | `minimax-music` / `flowTextToMusic` — 🔴 **neither ever moves**, see below |
| title | **`Song`** — renamed twice (`Text to Music` → `Music Maker` → `Song`) |
| label / prefix | `Flow: Song` / `flowSong`; files land `flowSong_001.wav` |
| graph | `comfy_workflows/flow_minimax_music.json` — 49 nodes, 31 of them assembling the caption |
| `requiredModels` | `[]` — a FLOW WITH DEPS, not a ModelDef (nothing musical belongs in the image/video model picker) |
| `requiredDeps` | 4 weights, **18.22 GB**: DiT 4.58 GB + text encoder 8.57 GB + DAV VAE 206.66 MB + `qwen3vl-abliterated-clip` 4.88 GB |
| licence | `MINIMAX_MUSIC3`, keyed `flow:minimax-music` |
| `mediaType` | `'audio'` |
| inputs | **none** — no `inputSchema` at all. Text is the whole input, so step 0 renders its own "needs no input media" panel |
| shape | ONE step (`kind: 'fields'`) + the run slide |

```
Input_Voices / Input_Voice_Notes / Input_Style / Input_Style_Custom / Input_Bpm
Input_Mood / Input_Vocal / Input_Arrangement   (the enhancer's three prose blocks)
   -> 31 StringConcatenate / RegexReplace / MpiIfElse nodes write the headings, Basic
      Attributes, the BPM clause, the instrumental clause and the roster around them
   -> Caption_Final -> Tidy_Caption -> Drop_Empty_Headings ─┐
Input_Lyrics -> Strip_Voice_Markers -> Lyrics_Gate ─────────┤
                            MiniMaxMusic3TextEncode <───────┘ -> KSampler
                              -> VAEDecodeAudio | VAEDecodeAudioTiled  (Input_Low_Vram)
                              -> MpiClearVram -> Output_Audio
```

## 🔴 The `id` and the op key are BOTH frozen, for two different reasons

`licences.js` keys `MINIMAX_MUSIC3` on `flow:minimax-music` (= `flowDepKey(id)`), and **a
lookup miss is SILENT** — rename the `id` and 13.3 GB of licensed weights install with no gate
shown at all. `flowTextToMusic` was coined when the flow was called "Text to Music"; a renamed
op id is a tombstone problem (MPI-533), not a rename, and the key is referenced in four
registries plus `operation_registry.json`.

**What DOES track the title is `label` and `filePrefix`**, and
`tests/flow-output-filename.test.cjs` enforces it: it compacts the title and compares it to the
prefix, so a card saved under a name the user cannot find in the Library fails there.

## What MPI-694 took away

The instrumental half left for [Sound & Music](sound-and-music.md) on 2026-09-05: *"We drop the
instrumental case for Minimax, considering it's crap anyway."* (Fabio)

- `Input_Instrumental` and `Input_Structure` left the UI, **and left `enhance.from` with them**
  — `from` is also the cache key, so that is a behaviour change, not a list edit.
- The enhancer recipe lost its two Instrumental rules and its song-structure branch. The
  never-invent-a-running-order rule was **kept** (below).
- The `Your song` placeholder had to name a **sung** song. Its predecessor was a horror-trailer
  instrumental brief: fine while this flow owned instrumentals, wrong the moment they left.
- No "for instrumentals, use Sound & Music" tail was added (Fabio, 2026-09-07): read from
  inside a flow, naming the other one reads as an option on **this** one. Each description says
  what its own flow makes; the Flow Library is where the choice is made.

🔴 **THE GRAPH WAS LEFT WIRED.** `Lyrics_Gate`, `Instrumental_Clause`, `Bare_Tags` and the
`MpiSimpleBoolean Input_Instrumental` node stay, with the boolean baked `false` and
`Input_Structure` baked `""` — with no field to inject, the false arm runs and the lyrics slot
passes through. **Do NOT delete `Lyrics_Gate`:** deleting it on 2026-09-02 is what made a man
sing Fabio's stage directions. Dead-but-wired costs one unexecuted node; ripping it out costs a
defect that has already happened once.

🟢 **The injection guard runs field → node, never node → field**
(`tests/inject-params-titles.test.cjs`), so a graph node with no field is invisible to it —
which is why dropping two fields was safe, and why a stale node raises nothing.

## The caption is written by the GRAPH, not by the model

GAP 4 option B (Fabio, 2026-08-31). The enhancer writes only three PROSE blocks; the graph
writes the headings, Basic Attributes, the instrumental clause and the serialised roster around
them. So the style phrase, the BPM and the cast reach the encoder **exactly as chosen** — a 4B
asked to hold "78 BPM" in prose rounds it to "around 80".

Which is why two option lists carry caption WORDS rather than indices:

- **`Input_Style`** — 18 families, each option's `v` **is the genre phrase**. Not an int into a
  switch bank: `MpiAnySwitch` holds 5 arms and `MpiAnySwitch10` holds 10, so 18 fit neither and
  chaining two banks would cost ~21 nodes for one string. The phrases are **ours** — MiniMax's
  1,000 template captions are unlicensed and their own skill forbids copying them, so we conform
  to their taxonomy and write our own prose. Each ends in a full stop, because `Cat_Style` joins
  it to the custom box with a space and the two must read as two sentences.
- **`Custom` has `v: ''`**, and that is the whole trick: "no preset phrase" IS the empty string,
  so the user's own sentence arrives alone. A sentinel word would need stripping in a node that
  can drift. `Input_Style_Custom` is revealed by `hiddenWhen: { field: 'Input_Style', isNot: ''
  }` — one clause, not seventeen `is` clauses needing an eighteenth the day the list grows.
- **`Input_Voices`** — `serialiseVoices` writes `Name (Type)` straight into Vocal Details, no
  lookup table to drift. `Any` emits the bare NAME: "Ana (Any)" would state a vocal quality the
  user never chose.

## The enhancer has no button, and runs inside Generate

Fabio, 2026-09-02: *"the enhancer runs silently, but it only runs if the user has changed the
prompt."* It is declared as `flow.enhance`, not on a `button` field — with the button gone, a
hidden control would be a dead `<button>` in the DOM purely holding data; the frame reads
`action` and `auto` as implied. `from: ['positive', 'Input_Style', 'Input_Style_Custom']` **is
the cache key** — exactly the fields whose change makes the previous answer stale. Tempo is not
in it (the graph states the BPM verbatim); lyrics and the roster reach the caption on their own
wires, never through the rewriter.

🔴 **That is why `qwen3vl-abliterated-clip` is a `requiredDep`.** While Enhance was a button, an
install without it lost a button that warned. Now it loses Generate. The weight also arrives via
Krea2, Qwen or the Image Describer plugin and the dep system dedupes.

🔴 **THE ONE RECIPE RULE THAT MUST SURVIVE ANY EDIT: never invent a running order, a section
list or a timing.** The first two live runs had the 4B writing a complete TIMED plan nobody
asked for — *"At 1:20, the strings enter… By 2:15, the full orchestra erupts"* — while the
user's own sections sat in the lyrics slot. **The caption OUTRANKS the lyrics slot**, so the
model played the 4B's song: Fabio asked for a single orchestral drum in the intro and got a
drone and muted brass. It was not disobeying; it was obeying the other plan in the same caption.
Recipe: `MINIMAX_MUSIC_ENHANCE_PARAMS` in `flowsRegistry.js`.

## 🔴 Every line outside a tag is SUNG

Two live runs on Fabio's own GPU bought this. `normalize_lyrics` keeps `[section]` tags
verbatim, so the Lyrics box reads as a place to describe a track. It is not: the tags survive,
and the prose **between** them is a lyric line the model sings.

| run | what was written | what happened |
|---|---|---|
| 1 | bare tags, prose underneath | a man sang the stage directions |
| 2 | directions folded INSIDE the brackets, Suno-style | sung too — `_LYRIC_TAG_RE` is `\[[^\]]+\]`, so any bracketed run is a legal tag |

The step's `hint` exists for exactly this; nothing on screen implies it. Voice markers
(`<Singer A>`) are **stripped in the graph** by `Strip_Voice_Markers` — `<Name>` is not in
MiniMax's tag set and the lyrics reach the model verbatim.

🔴 **`default: ''` on `Input_Lyrics` is load-bearing.** `_seedField` returns undefined for a
field with no `default`, the seeding loops skip it, the id never reaches `injectionParams`, and
**the graph's baked value runs** — that node holds the bench's demo song, so a user who leaves
the lyrics empty would hear its words. Same for the three `hidden: true` enhancer targets.

## 🔴 `Cut off at` is a GUILLOTINE, not a length

Measured 2026-09-02. `seconds` is **not** derived from the lyrics: the AR text encoder generates
autoregressively and ends where it wants, on `<|audio_end|>`; `max_duration` only sets
`decode_limit`, the frame at which an unfinished track is cut off mid-phrase. One caption at
four seeds returned **33.84 / 53.24 / 38.64 / 90.0 (capped)**.

Nor is it steerable by asking — naming a duration in the prose produced no ordering at all
(20 s → 35.48, 45 s → 52.20, 75 s → 32.12). Describing MORE music does nudge it longer (~30 s
median sparse vs ~55 s dense), which the enhancer now does as a side effect of writing an
arrangement, but it is a nudge and cannot be sold as a length control. Table:
`.agents/mpi-kanban/tasks/MPI-664/plan.md` § 3. So the honest control is a ceiling high enough
never to fire by accident: **default 300 s against a measured 33–90 s of real output**.
`max: 360` is the MODEL'S own ceiling — `MAX_AUDIO_FRAMES / FRAMES_PER_SECOND` = 9000 / 25
(`comfy/ldm/minimax_music/ar.py:21`) — and the node clamps to it anyway.

**This is the sharpest line between the two flows.** Sound & Music's slider is exact to ~80 ms
across a 16× range: a categorical difference, not a better number.

## What the caption channels carry (seven runs, MPI-664)

**Lyrics ≫ Global Metadata ≈ Vocal Details > Arrangement.**

🔴 **Bare tags carry ORDER and COUNT, and NO CONTENT.** `[Intro]` `[Verse]` `[Chorus]` `[Outro]`
tells the model there are four sections in that order, but not *what plays in section 2* —
MiniMax's tag set is nine fixed words, with no room for an instrument. Per-section instructions
therefore travel `[ARRANGEMENT]`, the **weakest** channel. In the one measured run only the
section whose position is unambiguous landed: **last**. The choir entered at the end; the solo
viola never happened, and a drum kick nobody asked for ran start to finish. A fix would have to
put instrument words back into the lyrics slot — the change that made a man sing the stage
directions. Weigh it accordingly (ONE seed, hand-written caption):
`.agents/mpi-kanban/tasks/MPI-664/validation.md` § FABIO'S VERDICT.

## Deps, and Low VRAM

- **The text encoder is the pruned int8, 8.57 GB.** The bf16 twin was tested and abandoned:
  15.9 GB staged on a 16 GB card, ~33 min for the AR stage alone against 240 s end to end. **Do
  not retry it.**
- **`ComfyUI-MpiNodes` is deliberately NOT declared**, though the graph runs MpiText / MpiIfElse
  / MpiInt: every model in the registry declares it, so listing it here pins it for every
  uninstall. Same reasoning as `voice-changer`. Sizes are never typed —
  `computeDepHashes.py --sizes` (`size` parses 1024-based; HF displays decimal).
- **`Input_Low_Vram` stays HERE** and was removed from the twin. Measured, not stylistic:
  13.3 GB of MiniMax weights make the toggle real here, ~6.5 GB of Stable Audio weights do not
  make it real there. See [sound-and-music.md](sound-and-music.md) § No Low VRAM.

## The art

Cut from `flowMusicMaker_013` — a real 120 s run already on disk ("Don't wake the morning",
`<Singer A>` female, 75 BPM), so it cost no GPU. Both assets lead on the **lyric-sheet grammar**
(`[Chorus]` in heat, `<Singer A>` in frost) rather than a line of type over a waveform, which is
already Chatter Box's tile AND Drama Box's — a third would be invisible inside the family. The
band is a 12 s excerpt on purpose: the whole two minutes averages into a flat pink brick at
220 px. 33,576 B / 111,115 B, 7.2 s, loop seam 0.006/255.

## Deliberately out of scope

- **A real length control**, and **a fade at the cap** — see the guillotine section; nothing
  observed has reached the cap, so add the fade the first time a run is audibly truncated.
- **A seconds → frames conversion.** `Input_Duration` is an `MpiFloat` straight into the
  encoder, so the LTX Extend `MpiMath` pattern does not apply.
- **Instrumentals.** [Sound & Music](sound-and-music.md)'s, and re-adding them here re-opens a
  split Fabio made deliberately.
