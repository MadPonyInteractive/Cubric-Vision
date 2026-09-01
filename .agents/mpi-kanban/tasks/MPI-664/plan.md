# MPI-664 — Plan: the MiniMax Music 3 Flow

Design settled with Fabio 2026-08-30. Capability facts live in `research/minimax-music-3.md` —
read it first, and do not re-search it.

## Current State

**Design COMPLETE. The two frame additions are BUILT and green.** The graph, the FlowDef and the
enhancer recipe are still to do.

Settled: hybrid caption approach · the LLM question (Vision already ships `promptEnhance`) · the 18
families as the style dropdown · the caption schema · the licence position · BPM as a 0-means-auto
box capped at 250 · voice as a ROSTER plus a prose box · lyrics stay the user's job ·
instrumental hides the lyrics and voice fields.

**Shipped 2026-08-31 — both frame additions, both portable, both documented:**

- `hiddenFieldIds()` in `declaredFields.js`, painted by `_paintFieldConstraints`.
- `formatDeclaredValue()` + `format: 'duration'` on the slider branch.
- `docs/playbooks/add-flow/ui/carousel-frame/fields.md` carries both.
- Verified: 7/7 in `tests/flow-field-constraints.test.cjs` (2 new), `npm test` 817/817, `npm run lint` clean.

**The field surface CHANGED on 2026-08-31.** Fabio signed off the `Input_Voice` list, then replaced
the single dropdown with a **voice roster + `@` references in the lyrics**, and split the steps into
five. § The field surface has been rewritten to the five-step shape; § The voice roster carries the
reasoning and the bench evidence behind it.

**Bench test PASSED 2026-08-31** — MiniMax honours per-section voice stated in the caption, so the
roster is on. See § The voice roster for the evidence and its one caveat.

**Tier 2 SHIPPED 2026-08-31 (`6836d667`) — the `voices` roster field type.** A branch in
`buildField` composing MpiInput + MpiDropdown + MpiButton; no new Primitive. It is the only field
type whose UI value is not its graph value — it holds `{ name, type }` rows for Reuse, and
`serialiseVoices` (via `mapDeclaredValue`) turns them into one string, which keeps the
one-field-one-param law AND puts the agent connector on the widget's own serialisation call.
819/819, lint clean, documented in `ui/carousel-frame/fields.md`.

**GAP 1 and GAP 2 both CLOSED 2026-08-31.** Three `assetDeps.js` entries (`minimax-music3-dit`,
`minimax-music3-text-encoder`, `vae-minimax-music3-dav`), hashes measured, sizes measured, plus the
`MINIMAX_MUSIC3` descriptor keyed `flow:minimax-music` and the licence bundled at
`licences/minimax-music3/`. 819/819, lint clean. See § GAP 1 and § GAP 2 for what the work changed.

**THE GRAPH IS BUILT, GREEN AND PUSHED (2026-09-01, `be6f9f27`).**
`comfy_workflows/raw/flow_minimax_music.json` (46 nodes) → `comfy_workflows/flow_minimax_music.json`,
converted against the engine, both gates clean, titles pinned, 836/836. § The graph carries the
shape and the three plan corrections it forced.

**Next action: the FlowDef's five steps**, then tier 3's `@` picker. **The FlowDef's `id` MUST be
`minimax-music`** or the licence gate never fires: the descriptor is keyed on `flow:minimax-music`
and a lookup miss is silent.

⚠️ **THREE frame additions are now unproven in the app, not one:** `hiddenWhen`, `format: 'duration'`
and the `voices` roster. All are unit-tested pure halves; no FlowDef declares any of them yet, so no
`wrap.hidden`, no formatted readout and no roster row has ever rendered live. They all close on the
same first live run — do not treat that run as a formality.

🔴 **`Input_Duration` is a CEILING, not a length.** Found on the bench run: `max_duration` was set to
150 and the model returned 80.76s — `MiniMaxMusic3TextEncode` derives the actual `seconds` from the
lyrics and feeds that to the latent. So the run slide's slider must not be labelled "Length" as if it
set one; it caps. Label and `info` change, nothing structural.

## The decision

**Hybrid.** Dropdowns write everything that must be exact; the LLM writes only the prose that
benefits from being prose.

| Half | Owns | Why |
|---|---|---|
| **Template** (graph) | the 3 headings, Basic Attributes (genre/tempo/key), the instrumental clause, vocal gender | must be well-formed every time, and must not be negotiable by a model |
| **LLM** (`promptEnhance`) | Global Emotional Progression, Vocal Style, the Arrangement timeline | 250–450 words of musical prose is what the model rewards and what a template cannot fake |

Rejected: **pure template** (only as good as the phrasebook; the model rewards prose) and
**pure LLM** (no deterministic floor, and it throws away the dropdowns the product wants).

### Where the LLM runs — answered, and it was never blocked

The brief said "Vision ships no LLM today". **That is wrong.** Vision already ships one:

| Piece | Where |
|---|---|
| op `promptEnhance` | `js/data/commandRegistry.js` — `outputKind: 'text'`, universal |
| graph | `comfy_workflows/qwen3vl_4b_prompt_enhancer.json` — `CLIPLoader` → `TextGenerate` → 2× `RegexReplace` → `Output_prompt` |
| weight | `qwen3vl-abliterated-clip`, 4.88 GB, already on disk for Krea2 + the image-describer plugin. **Zero new download** |
| precedent | Character Sheet, `flowsRegistry.js` — the same prompt-pair shape on step and run slide |

The op is deliberately reusable: its recipe and both scrub patterns are **injected by the caller**
(`Input_System_Prompt`, `Input_Scrub_Negation.regex_pattern`, `Input_Tidy.regex_pattern`), and its
own registration comment says a second flow wanting a different rewrite reuses it rather than
registering a twin. So this Flow supplies a music recipe and nothing else.

**This is NOT the Cubric Prompt connector.** That is `MpiPromptBox._runEnhance()` → `/connector/enhance`,
a different system with a different owner, gated on an app that does not exist yet. Do not unify them
(`docs/playbooks/add-flow/ui/prompt-enhance.md` says so explicitly).

## The field surface

**Five steps plus the run slide.** Settled 2026-08-31 — this SUPERSEDES the earlier two-step
"Describe" / "Style & voice" draft, which was written around the single `Input_Voice` dropdown. The
carousel is itself the Simple/Custom split, so no reveal toggle is needed.

**The order is forced, not cosmetic:** the roster must exist before the lyrics box, or `@` has
nothing to offer.

| # | Step | Fields | Hidden when |
|---|---|---|---|
| 1 | **Song** | `positive` (text, 4 rows — the brief) · `Input_Instrumental` (toggle) | — |
| 2 | **Voices** | `Input_Voices` — the roster, a new `voices` field type | instrumental |
| 3 | **Lyrics** | `Input_Lyrics` (text, 10 rows; `@` reaches the roster) | instrumental |
| 4 | **Style** | `Input_Style` (select, the 18 families) · `style_custom` (text, 2) · `Input_Bpm` (number, 0–250, 0 = auto) · `voice_notes` (text, 2 — *hidden when instrumental*) · `Input_Low_Vram` (toggle) · `enhance` (button) · `Input_Caption` (text, 12) | — |
| 5 | **Run slide** | `positive` · `enhance` · `Input_Duration` (slider, `format: 'duration'`) · Generate | — |

The live field JS belongs in `flowsRegistry.js`. **Do not mirror it back into this plan** — a second
copy only drifts, and the earlier two-step draft is exactly what that drift looks like.

What the table cannot carry:

- The lyrics `hint` carries the official tag set verbatim — `[Intro] [Verse] [Pre-Chorus] [Chorus]
  [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]` — **and** says MiniMax treat these as
  generative control, not a guarantee. A user who does not know that reads a loose section as a bug.
- `Input_Low_Vram` sits on step 4, **not** the run slide: it is a set-once machine fact, not a
  per-run tweak.
- `Input_Duration` is the only per-run control on the run slide, and it **caps** rather than sets —
  see the ceiling note in § Current State. Label it accordingly.
- The enhanced caption box is **omitted** from the run slide, exactly as Character Sheet does — the
  run slide generates, it does not read. With the caption hidden, the Enhance button's heat is the
  only signal that the current prompt is un-enhanced.
- Roster copy must say **steer**, never *assign* — the bench test passed but the choir bled into the
  solo material (§ The voice roster).

### Voice is TWO controls, because the schema splits it that way

`Vocal Details` has four sub-labels, and a single gender dropdown only fills part of one. MiniMax's
own reference captions show the split literally:

> `Vocal Gender & Timbre: Singer A (Male). The vocalist possesses a smooth, soulful tenor timbre with
> a slight rasp…`

A **configuration slot**, then **timbre prose**. So:

| User wants | Sub-label it belongs to | Which control |
|---|---|---|
| female / male / child / duet | Vocal Gender & Timbre (the slot) | the `Input_Voices` roster |
| raspy, high-pitched, breathy, warm | Vocal Gender & Timbre (the prose) | `voice_notes` → LLM |
| belted, conversational, rapped | Vocal Style | `voice_notes` → LLM |
| church chorus, layered harmonies | **Harmony/Backing Vocals** — a different sub-label | `voice_notes` → LLM |

Enumerating that in dropdowns is exactly the job the LLM half exists to do. Two controls cover all of
it, and they land on the same template/LLM line everything else does.

`Child` and `Choir` are in-distribution, not guesses — the skill ships `children-s-music-folk-pop`,
`children-s-music-orchestral-pop`, `a-cappella-choral-pop`, `choral-ambient-new-age` and a dozen more
choral families.

### The voice roster — supersedes the single `Input_Voice` dropdown (2026-08-31)

Fabio's call, and it is right: a single dropdown cannot say *male verse, female bridge, choir on the
last chorus*. The replacement is a **cast list plus inline references**, and it lands squarely on the
TEMPLATE half — the roster is structured data, not prose.

- A **voice roster**: a `+` button adds a row, each row picks a voice type. Any length.
- In the lyrics box, **`@` opens a picker** of the voices already defined, and inserts `<Name>`.

**`@`, not `^`** — Fabio's correction, and the reason is the one that matters: `@` is already what
the app teaches for referencing staged references in the video prompting system. Same gesture, learned
once. A voice in a roster IS a staged reference.

🔴 **The markers are STRIPPED AT DISPATCH.** `<Choir>` is not in MiniMax's official tag set (nine
structural tags, `[Intro]`…`[Outro]`), and the lyrics field reaches the model verbatim. So the roster
and its markers build the caption's `Vocal Details`, and the lyrics go to the model CLEAN. Leaving a
marker in would be building on a tag the model was never told about.

**Prior art, and what is actually reusable** (checked 2026-08-31):

| Piece | Where | Reusable? |
|---|---|---|
| `matchRefTagQuery(value, caret, tags)` | `js/data/commandRegistry.js:1687` (MPI-475) | **Verbatim.** Pure, `@` already baked in, and its regex already refuses `foo@bar.com` mid-line — that edge case is its documented reason for existing |
| The picker DOM / keyboard / insert | `MpiPromptBox.js:~1245-1300` | **No.** ~80 lines welded to `textareaEl`, `promptMode`, `_saveDraft`, `emit`. A Flow's `text` field mounts **MpiInput**, a different Primitive |

So tier 3 costs the DOM extraction out of MpiPromptBox — a shared, high-traffic organism — and
nothing else. The insert format is already `<tag>`, which reads as a marker rather than as lyrics.

**Fabio chose tier 3** (roster + picker). Tiers 1 (free-text cast list) and 2 (`voices` field type,
markers typed by hand) remain the fallbacks if the extraction turns out to be a bigger refactor than
it looks — 3 is purely additive on 2, so 2 can ship first without redesign.

✅ **THE BENCH TEST PASSED (2026-08-31). The gate is cleared — build the roster.** One caption with
`Singer A (Male)` alone on both verses *and the first chorus*, a full mixed choir on the final chorus
only; verses and choruses given opposite lyrics ("carry it *alone*" → "carry it *together*") so the
sections are audible without a stopwatch. Fabio listened and confirmed. MiniMax **does** honour
per-section voice stated in the caption's `Vocal Details`.

- Run: bench `audio_minimax_music_3.json` converted to API format, fp16 DiT, pruned-int8 text
  encoder, seed `976866873952`, 30 steps, cfg 1.7, euler/simple, tiled decode. 240s, 80.76s of audio.
  Output `D:\WORK\Images\Outputs\audio\MPI664_voice_bench_00001.flac`; dispatcher kept in the card at
  `bench/voice_bench.py` (encoder + prefix are argv, everything else fixed so an A/B differs by one
  variable). It carries the exact caption and lyrics that passed — reuse them rather than rewriting,
  or the next comparison is against a different question.
- **Not a clean separation.** Fabio's own words: *"I kinda mixed the choir with the singer."* The
  choir arrived where it was asked for, but it bleeds into the solo material rather than switching
  cleanly. Good enough to justify the roster; **not** good enough to promise users exact per-section
  casting. The roster's copy should say *steer*, never *assign*.
🔴 **The bigger text encoder is NOT VIABLE locally — tested and abandoned 2026-08-31. Do not retry
it on a 16 GB card.** Research § "Untested quality leads" called the int8 text encoder the largest
untested knob for prompt adherence, so the same run was dispatched on the **16.71 GB `pruned_bf16`**
(downloaded to `C:\AI\text_encoders\`, which the bench already maps via `extra_model_paths.yaml`).
It ran, but the numbers killed it before any quality judgement was possible:

- ComfyUI logged `MiniMaxMusic3TEModel prepared for dynamic VRAM loading. 15921MB Staged.` — a
  15.9 GB encoder on a 16.0 GB card, leaving nothing for the 4.9 GB DiT. Dedicated VRAM sat at
  14.6/16.0 GB with **15.7 GB of shared** (system RAM over PCIe) also in play.
- AR sampling is autoregressive and reads the whole encoder per token: 3,751 tokens at 1.92 it/s,
  ~33 min for that stage ALONE, against **240s end-to-end** for the whole int8 run. Interrupted at
  38%.
- The GPU was **not** underused — Task Manager's default *3D* graph reads ~40% because CUDA work
  lands on **Compute_0**; `nvidia-smi` read 100% throughout. The ceiling is memory traffic, not
  compute. Worth knowing before anyone "investigates" low utilisation again.

**Why this closes the question rather than deferring it:** 16 GB is both the bench card and the
target user card, so a better-sounding bf16 result would be unshippable anyway. The 18.47 GB
unpruned `bf16` is worse on every axis and is not worth trying. If encoder quality ever matters
enough, it belongs on the remote-engine path (a 48 GB Pod), not in the local Flow — and the weight
is already on disk, so re-testing costs wall-clock only.

The dispatcher takes the encoder as argv precisely so this A/B can be repeated there:
`python voice_bench.py <encoder-filename> <output-prefix>`.

### The steps split — options apart from prompt (2026-08-31)

Fabio's second call. Not only tidiness: **the roster must exist before the lyrics box**, or `@` has
nothing to offer. The dependency forces the order.

1. **Song** — the brief, Instrumental toggle
2. **Voices** — the roster · *hidden when instrumental*
3. **Lyrics** — with `@` reaching the roster · *hidden when instrumental*
4. **Style** — style, own style, BPM, Low VRAM, the caption box
5. **Run slide** — brief · Enhance · Length · Generate. **Minimal, deliberately.**

`Input_Low_Vram` moves OFF the run slide: it is a set-once machine fact, not a per-run tweak. Length
stays — it is the one thing that actually changes between runs.

### BPM is a box, and 0 means auto

MiniMax's Output Contract: *"Use an exact BPM only when explicit or strongly justified; otherwise use
a range or qualitative tempo"*, and *"do not fabricate ... a precise key, BPM"*.

So a BPM box needs an unset state or every single generation ships an invented exact tempo. `0` =
auto: the graph omits the BPM clause from Basic Attributes entirely and the rewriter infers tempo
from the description. Any other value is written literally and the LLM may not contradict it.

This **replaces** the qualitative tempo dropdown that was here — one control, and it is the one that
matches how MiniMax themselves gate the field.

### Why the style dropdown does not carry its own caption text

The dropdown emits an **int** into an `MpiAnySwitch` bank in the graph, and the bank's arms hold the
Global Metadata fragments (`docs/playbooks/add-flow/ui/switch-bank-fields.md`). Values in the graph,
labels in the FlowDef — a raw-graph reader sees what runs.

**Those fragments are ours to write.** MiniMax's 1,000 template captions are unlicensed and their own
skill forbids copying them (see `research/minimax-music-3.md` § LICENCE). We conform to the schema and
write our own prose for 18 families. That is a one-off authoring job, done once, offline.

## The flow's SHAPE — settled against the playbook (2026-08-31)

Step 0 of `docs/playbooks/add-flow/README.md`, answered. None of this was in the plan.

| Fork | Answer |
|---|---|
| Model or no model | **No model.** `requiredModels: []` + `requiredDeps: [...]` — the Voice Changer / head-swap shape |
| Inputs | **Fields only.** No `inputSchema.media` at all — text in, audio out |
| Output | `mediaType: 'audio'` |
| uiComponent | **None.** MPI-572 deleted the per-Flow Organism |

**Why no ModelDef, even though this pulls ~14.3 GB.** Voice Changer settled the precedent for
exactly this case and its comment is explicit: a flow with weights is *"a FLOW WITH DEPS,
deliberately not a ModelDef (which would force dead fields and an entry in the model picker) and
not a Plugin"*. Music 3 is the same animal — nothing about it belongs in the model picker. **So this
card does NOT need `/mpi-add-model`.**

**Media-free means §02 does not apply.** No media slots ⇒ none of the traps that dominate the
playbook's trap table are reachable here: no audio-slot `mediaType`, no `filterMediaInputsForModel`,
no path-reading input nodes. The only §02 rule still live is output capture — `Output_Audio` is the
same title a video's soundtrack side-channel uses, and **`mediaType: 'audio'` is the only thing that
tells them apart** (MPI-573 built that; Voice Changer was its first consumer).

**The roster is confirmed as the sanctioned route, independently of our design.** The playbook's own
rule: *"If a control is not expressible, add a PRIMITIVE plus the FIELD TYPE, never a bare input."*
That is precisely tiers 2 and 3. No exception is being taken.

### ✅ GAP 1 — CLOSED 2026-08-31. The weights are now in the dependency system

`grep` over `dev_configs/` and `js/data/modelConstants/` finds **only MiniMax H3** (the video model).
Music 3 has no entry anywhere. The bench runs because Fabio downloaded the weights by hand. Three
new `assetDeps.js` entries are needed, all from `Comfy-Org/MiniMax-Music-3`:

| Dep | File | Size |
|---|---|---|
| DiT | `diffusion_models/minimax_music3_dit_fp16.safetensors` | 4.91 GB |
| Text encoder | `text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors` | 9.20 GB |
| VAE | `vae/minimax_music3_dav.safetensors` | 0.22 GB |

≈ **14.33 GB total.** Use the int8 text encoder — the bf16 alternative is ruled out (§ The voice
roster). `sha256` for each via `/mpic-compute-dep-hashes`. Sizes above are HF's own figures, taken
from the API rather than guessed.

### ✅ GAP 2 — CLOSED 2026-08-31. The WEIGHTS licence, read whole and wired

§ Current State records the licence position as settled, but that covered MiniMax's 1,000 template
captions. The weights are a separate instrument, and this vendor has form: H3 ships a
territory-restricted CLA (`minimax-h3-cla-2026-08-02`, excluding the EU, UK, Korea and the USA).

Read from `MiniMaxAI/MiniMax-Music3/LICENSE` on 2026-08-31 — the MiniMax-Music3 Community License:

- ✅ **No territory restriction.** Unlike H3. The Outputs bar that makes H3 painful is absent.
- ⚠️ **Attribution is REQUIRED, and it is a UI obligation, not a click-through:** the licence
  requires the name `MiniMax-Music3` to be displayed prominently on the interface of a commercial
  product using it. `licences.js` already models this — its `attribution` field, with FLUX Klein as
  the precedent, so no frame work is needed. **Where it shows is Fabio's call.**
- ⚠️ Clause 4 puts a safeguards obligation on anyone shipping a product that generates outputs.
- The $20M/yr threshold for separate written authorization is not a near-term concern.

Comfy-Org's repackage is tagged `apache-2.0`, but the upstream Community License governs the
weights — do not take the repackage's tag as the answer.

**What shipped, and the three things reading the whole licence changed:**

1. **The gate cost ZERO code, and that was not obvious.** `MODEL_LICENCES` looked model-only, but
   `downloadService.start()` keys the gate on whatever id the caller installs under, and the Flow
   Library installs a flow's own deps under `flowDepKey(id)` = `flow:<id>` (MPI-304). So the
   descriptor is keyed **`flow:minimax-music`** and fires before the 13.3GB moves. `klein-9b` is the
   precedent for landing a descriptor before its consumer exists — the lookup simply misses until
   then. ⚠️ The FlowDef's `id` must therefore be exactly `minimax-music`.
2. **§1 obliges a BUNDLED copy**, not a link — "the above copyright notice and this permission notice
   shall be included in all copies". `licences/minimax-music3/LICENSE.txt` is byte-identical to what
   `MiniMaxAI/MiniMax-Music3` serves (7,373 bytes, fetched 2026-08-31); `NOTICE.txt` beside it
   carries the §1 notice and the §3.1 obligation. `licence-gate.test.cjs` asserts a root-relative
   `licenceUrl` resolves on disk, so that bundle is now pinned by a test.
3. **Why gate it at all**, given there is no §V.2-style "bind each recipient" clause the way H3 has:
   **clause 4** puts a standing obligation on US to implement, maintain, test and periodically review
   safeguards against violating uses in any product that generates outputs. Exhibit A is the list of
   what counts. A consent step showing that list is the cheapest proportionate organizational
   safeguard, and `report` is how a violation reaches us.

✅ **§3.1 ATTRIBUTION LANDS ON THE ABOUT PAGE. Fabio's call, 2026-08-31 — and it rules the Model
Library drawer OUT rather than merely working around it.** `poweredBy` renders only in
`MpiModelManager`'s model detail drawer, keyed by model id (`MpiModelManager.js:954`), and this flow
has no model card. Fabio's reasoning: **a user can install and run this entire flow from the Flow
Library and never open the Model Library at all.** An attribution that user never sees is not
"prominent" under any reading, so the drawer was the worse surface, not the better one that happened
to be unavailable.

What discharges §3.1 is the `credit` block on all three deps. `MpiAbout` derives its Credits list
straight from `DEPS`, so the name renders on a page reachable however the weights arrived, and that
list is already treated as legal surface — its own comment calls a missing credit *"a licence breach,
not a cosmetic bug"*. **Deleting a `credit` block off these three deps breaks the licence, not the
layout.** `poweredBy` is kept as the recorded §3.1 string; it lights up free the day anything renders
licence attribution for a flow.

One copy fix came with it: MpiAbout's intro read *"Style and control models by the community"* over a
list that already held Chroma, Juggernaut XL, LUSTIFY!, Smooth Mix and MiniMax-H3 — base checkpoints,
not styles. Now *"Models and styles by the community"*. Pre-existing drift, but the intro is what a
reader uses to judge whether the list below it is complete, so it matters more now the list is the
attribution surface.

**Redistribution is granted outright** ("distribute, sublicense, and/or provide copies"), so an R2
re-host of these three IS permitted — the exact inverse of the H3 weights, where the publisher URL is
a licence position and R2 is closed forever. They are HF-primary only because the upload has not been
done, which is why they carry no `noMirror` flag: `check-dep-urls.mjs` listing them under "no second
origin" is correct and actionable.

## Frame work this needs (both new, both portable)

### 1. `hiddenWhen`

Cross-field reactive state **already ships** — MPI-663 built it: `disabledFieldIds()`
(`js/utils/declaredFields.js`) evaluates declared rules against current values, and
`_paintFieldConstraints()` (`MpiBaseFlow.js`) re-runs it on every field change.

`hiddenWhen` is one more clause on that proven path, and it is **cheaper than disabling**: the painter
holds `_liveFields`, a map of id → wrapper element, so hiding sets `wrap.hidden` and works for any
field type. Disabling today reaches only `toggle` (in the painter) and `select` (in `declaredFields`) —
a text box cannot currently be greyed at all.

Two rules inherited from the MPI-663 precedent, both non-negotiable:

- **Declarative, never a predicate function.** A function in a FlowDef is something only a first-party
  flow can ship; FlowDefs are data so third parties can express the same constraint.
- **A hidden field keeps its VALUE.** Toggle instrumental off and the lyrics come back as typed. So
  the **graph** must re-check the condition rather than trust the flag, or an instrumental run injects
  lyrics that are merely invisible.

### 2. `format: 'duration'` on `slider`

`MpiProgressBar` has an `info` template with `{value}` plus prefix/suffix — substitution only, no
formatter. Add `format: 'duration'` in the slider branch of `declaredFields.js`: `45` → `45 seconds`,
`62` → `1 minute 2 seconds`, `180` → `3 minutes`.

Seconds → frames is **the graph's job**, not the app's — LTX Extend's `Input_Duration` already does
exactly this (`MpiMath`, `docs/playbooks/add-flow/existing-flows/ltx-extend.md`).

Long durations get a **warning, not a cap**. Never cap work to fit a card.

## 🔴 GAP 3 — the enhancer takes NO recipe from a flow. Found 2026-08-31, blocks the whole LLM half

The plan says the op is *"deliberately reusable: its recipe and both scrub patterns are **injected by
the caller**"*, and `commandRegistry.js`'s own comment says the same: *"A second flow wanting a
different rewrite reuses this op with its own recipe rather than registering a twin."* **That route
does not exist in the flow frame.** Verified by reading the code, not inferred:

- `MpiBaseFlow._runEnhance()` (`MpiBaseFlow.js:1039`) calls `enqueueGeneration` with
  `injectionParams: { Input_Seed }` — **and nothing else.** There is no path for a FlowDef to pass
  `Input_System_Prompt`, either `RegexReplace.regex_pattern`, or `max_length`.
- The `enhance` action's whole declared surface is `op` / `from` / `to` / `model`
  (`flowsRegistry.js:212-236`). There is no field to put a recipe in.
- So the baked value runs. And the baked value is **Character-Sheet-specific**:
  `qwen3vl_4b_prompt_enhancer.json`'s `Input_System_Prompt` opens *"You are a character designer.
  You write the CHARACTER half of a character reference sheet prompt, and nothing else."*
- Character Sheet declares only `op`/`from`/`to` (`flowsRegistry.js:1099` and `:1127`) and is
  therefore running on that baked recipe. Correct for it, which is exactly why the gap never showed.
  The injection was proven at the BENCH (a translator recipe came back in French) — never through a
  flow.

**Consequence: a music caption is unreachable today.** Press Enhance on this flow as the frame
stands and a character designer writes a noun phrase about someone's wardrobe. The checklist's
"music caption recipe written for `Input_System_Prompt`" and "`max_length` raised past 512" are both
blocked on the same missing plumbing.

**The fix is portable and small, and it is the same shape as `hiddenWhen`:** let the `enhance` action
declare `injectionParams`, merged over the driven `Input_Seed` in `_runEnhance`. One object on the
declaration, one spread at the call site. It is not a Music-3 special case — it is the plumbing the
op has claimed to have since MPI-504.

⚠️ **This is the FOURTH frame addition on this card** (`hiddenWhen`, `format: 'duration'`, the
`voices` roster, now this), and the third to touch `MpiBaseFlow` — a shared organism. Worth saying
out loud before adding it.

## ✅ GAP 4 — SETTLED: THE GRAPH ASSEMBLES THE CAPTION (option B). Fabio, 2026-08-31

The plan reads both ways and the code forces a choice:

- § The decision gives the **graph** the 3 headings, Basic Attributes, the instrumental clause and
  vocal gender — the template half.
- § The enhancer recipe has the scrubs *"assert the three headings survived"* — which only makes
  sense if the **LLM** wrote the headings.

`_runEnhance` sends **only `_fieldValues[d.from]`** as the prompt. So the style dropdown, the BPM box
and the voices roster **cannot reach the LLM** through the enhance action as it stands. Two routes:

| | Where the caption is built | Cost | What it means |
|---|---|---|---|
| **A — enhancer builds it** | LLM writes the whole caption; the graph passes `Input_Caption` through | Needs GAP 3's `injectionParams` **plus** a way to feed the dropdown values in as context | The dropdowns become SUGGESTIONS in a prompt. A 4B may round 78 BPM to "around 80" |
| **B — graph builds it** | LLM writes prose only; the graph concatenates style fragment + BPM clause + roster string around it | Needs GAP 3 only (for the recipe). No extra frame work | The deterministic values **cannot be negotiated by the model** — which is § The decision's stated reason the template half exists |

**CHOSEN: B — the graph assembles.** Fabio, 2026-08-31. It is what § The decision table already
said, it is the cheaper frame change, and it keeps the exact values off the model's desk.

What B fixes in the plan, so the next session does not re-derive it:

- The LLM's job **shrinks to the three prose blocks** — Global Emotional Progression, Vocal Style,
  the Arrangement timeline. It does NOT write the headings and does not write Basic Attributes.
- Therefore the scrubs assert **those prose blocks are present**, NOT that "the three headings
  survived" — § The enhancer recipe's wording predates this decision and is now wrong there.
- `Input_Caption` holds the LLM's PROSE, not a finished caption. The graph concatenates the
  deterministic blocks around it, so the box's label/`info` must not promise a full caption.
- The style switch bank, the BPM clause, the instrumental clause and the serialised roster string
  all live in `flow_minimax_music.json`, feeding one `StringConcatenate` chain into
  `MiniMaxMusic3TextEncode`.
- 🔴 The graph must **re-check `Input_Instrumental` itself** rather than trust the field being
  hidden — a hidden field KEEPS ITS VALUE (§ Frame work / `hiddenWhen`), so an instrumental run
  would otherwise splice in lyrics and a roster that are merely invisible.

Still blocked on GAP 3 for the recipe itself: B needs `injectionParams` on the `enhance` action to
deliver the music recipe and the raised `max_length`. B does NOT need anything beyond that — which
is the whole reason it was chosen over A.

## The graph — BUILT 2026-09-01

`raw/flow_minimax_music.json` is the bench graph's 15 nodes plus 31 that assemble the caption.
Converted against **48188**, `verify-workflow.mjs` + `validate-injection-rules.mjs` both green
(the three "weight not installed" notes are the new deps, which the engine has never seen).

**The chain, in one line each:**

| Piece | Nodes |
|---|---|
| Basic Attributes | `Input_Style` + `Input_Style_Custom` → `Cat_Style`; `Input_Bpm` → `Bpm_Is_Auto`/`Bpm_String`/`Bpm_Clause`/`Bpm_Gate` → `Cat_Attrs` |
| The 3 prose blocks | `Input_Caption` → `Prose_Mood` / `Prose_Vocal` / `Prose_Arrangement` (`RegexExtract`, First Group) |
| Vocal Details | `Input_Voices` + `Input_Voice_Notes` → `Cat_Roster` → `Cat_Vocal_Body`; `Vocal_Gate` swaps in `Instrumental_Clause` |
| Lyrics | `Strip_Voice_Markers` → `Lyrics_Gate` (empties them when instrumental) |
| Assembly | `Cat_Global_Metadata*` / `Cat_Vocal_Details` / `Cat_Arrangement` → `Cat_Caption_Head` → `Caption_Final` → `Drop_Empty_Headings` → `Tidy_Caption` → the encoder |

**The marker contract.** The LLM emits `[MOOD]` / `[VOCAL]` / `[ARRANGEMENT]` and nothing else;
the recipe owns that (GAP 3). An **unmarked** caption is not an error — `Prose_Mood`'s pattern
falls through to the whole string, and `Drop_Empty_Headings` removes the two headings left with
nothing under them, so a hand-typed brief still produces a well-formed one-block caption.

**Three things the build corrected in this plan:**

1. **No switch bank for style.** `MpiAnySwitch` holds **5** arms and `MpiAnySwitch10` holds **10**;
   18 families fit neither, and chaining two banks would cost ~21 nodes for one string.
   `Input_Style` is an `MpiText` and the option's `v` IS the genre phrase — the shape
   `serialiseVoices` already established on this card ("an option's `v` IS the caption word, not an
   index … not an `MpiAnySwitch` bank"). § Why the style dropdown does not carry its own caption
   text is therefore wrong about the mechanism; its *reason* survives, and the same guard applies:
   the title is pinned, and a title-miss now shows up as a caption with no genre phrase.
2. **`Input_Duration` needs no seconds→frames conversion.** It is an `MpiFloat` into
   `MiniMaxMusic3TextEncode.max_duration`; the latent's `seconds` comes from the encoder's own
   output. The LTX Extend `MpiMath` pattern does not apply here.
3. **`style_custom` and `voice_notes` had to become `Input_*`.** Both were written as lowercase
   LLM-bound fields under option A. Under B a lowercase field reaches nothing at all, so the graph
   carries `Input_Style_Custom` and `Input_Voice_Notes` and the FlowDef must rename them or ship two
   inert controls. **Worth Fabio's eye** — it is the one place B silently changed what a control
   does, from "context for the model" to "text spliced verbatim into the caption".

**Proven, and not.** `bench/sim_caption.py` walks the REAL converted API graph and executes its
string half with the node semantics copied from the engine sources — four cases: vocal, instrumental
(roster and lyrics still holding their values, which is the `hiddenWhen` trap), BPM-auto with an
unmarked caption, and the baked defaults. The baked defaults reproduce the caption that passed the
voice bench, minus the key clause MiniMax tell us not to fabricate. **ComfyUI has not executed the
chain** — the bench was held by MPI-623's job. That closes on the first real generation.

## The enhancer recipe

Short and single-task — that is what a 4B obeys. It writes prose into a skeleton it does not have to
invent. MiniMax's own "Validate Before Returning" list maps almost line-for-line onto the scrubs:

- `Input_Scrub_Negation` / `Input_Tidy` assert the three headings survived and strip vocal language
  when instrumental is on.
- **`max_length` must be raised past its baked 512** — 250–450 words does not fit. That widget sits on
  an untitled `TextGenerate` node in the *shared* enhancer graph, so it needs titling `Input_*` before
  it can be injected. Additive and safe: Character Sheet simply keeps 512 by not injecting.

### If the 4B cannot hold format

In order, cheapest first:

1. Tighten the recipe.
2. **Split the call** — one block per run instead of all three at once.
3. Only then a bigger model. Note the door is narrow: `TextGenerate` takes a **CLIP**, so a candidate
   must load through `CLIPLoader` as a declared type **and** implement `.generate()`. Not GGUF, not
   sharded. "Use Qwen3-30B" is not a drop-in (see `research/minimax-music-3.md` § `TextGenerate`).

## LoRA — no rack, and no nodes either

⚠️ **Plan correction 2026-08-31: the bench graph does NOT carry `Input_Lora` nodes.** Dumped and
counted — 15 nodes, no loader of any kind. The claim below was wrong on its premise; the conclusion
is unchanged and if LoRA nodes are ever added they arrive with the rack question already answered.

**Do not declare a rack in v1.** A declared rack is the
*model's own* rack, shared with its ordinary generations, and both `flow_ltx_extend` and
`flow_ltx_foley` deliberately carry LoRA nodes while declaring none, precisely to avoid injecting a
user's rack into a flow unasked. Research also grades every published MiniMax music adapter as a
training-tournament experiment. Revisit when a music LoRA is worth using.

## Deliberately not in v1

- **A lyrics generator.** Fabio's call: lyrics are where the user should spend their time and where
  the song becomes theirs. Users who only want a bed can leave it instrumental. If a lyrics model
  later earns it, it lands as its own Flow or a second recipe on the same universal op — either way
  it bolts on without touching this design.
- **Saved custom styles as reusable chips.** Needs a persistent user-styles store and a chip
  Primitive. The custom style box persists per-run through `flowInputs` like any other field, so Reuse
  already brings it back. Revisit if the box gets used.
- **A title field.** The gallery card carries the name.
- **A 645-item sub-style picker.** Placeholder examples plus the free-text box instead.

## Sequencing — clear

MPI-663 (stems Flow) briefly overlapped on six shared files — `flowsRegistry.js`,
`commandRegistry.js`, `universal_workflows.js`, `declaredFields.js`, `MpiBaseFlow.js`,
`inject-params-titles.test.cjs`. **663 shipped (`done`/`complete`), so the claim is released** and
`files.json` now carries this card's full footprint. Nothing is sequenced behind anything.

Worth knowing rather than rediscovering: 663 is what BUILT the `disabledFieldIds` /
`_paintFieldConstraints` path that `hiddenWhen` extends, so its stems work is the reference
implementation to read before touching it.

## Open — needs Fabio

1. Sign-off on the five-step field surface above.
2. ~~Anything missing from the `Input_Voice` list?~~ **Closed** — the list was signed off, then the
   single dropdown was replaced by the roster outright, so the question no longer applies. The voice
   TYPES a roster row can pick are still the same six (Any / Female / Male / Child / Duet / Choir).

**Settled 2026-08-30:** BPM ceiling is **250**, not 220 — Fabio has mastered tracks at that tempo,
so a 220 cap would clip real material. Do not "tidy" it down to a textbook range.

## Plan Drift

**2026-08-31 — three things the frame additions needed that the plan did not name.** All three are
the same shape: the declarative half was easy, the PAINTING half had a hole.

1. **`_paintFieldConstraints` only ever walked `_fields`** — the flow's own fields, never a step's.
   MPI-663's Stems declares its constraints flow-level, so the gap never showed. This card declares
   `hiddenWhen` on `fields` STEPS, where the rule would have been evaluated against a value set the
   Instrumental toggle is not in, and hidden nothing. Fixed with `_allDecls` (flow + every step),
   used for both the evaluation and the paint. Extends disabling to step fields too — additive, no
   flow declares one there today.
   - Value plumbing was already fine and is worth not re-deriving: a `fields`-kind step is a
     FRAME_KIND, so it seeds into `_fieldValues` (the flow store), and it renders through
     `_buildFlowFields` — so `_liveFields` registration and the `_onFlowField` repaint were already
     in place. Only the walk was wrong.
2. **`wrap.hidden` alone hides nothing.** `.mpi-base-flow__field` sets `display: inline-flex`, which
   beats the UA stylesheet's `[hidden]` rule. Needed an explicit
   `.mpi-base-flow__field[hidden] { display: none; }` — the same override `__result-empty` and
   `__pending` already carry in that file. Classic silent no-op: no error, no log, control still there.
3. **A formatted slider must opt out of the progress bar's `info`.** `MpiProgressBar` substitutes
   `{value}` and cannot format, and it rewrites `dataset.info` on every input, so an override from
   outside is clobbered. Passing `info: ''` when `f.format` is set stops the bar hovering
   "Length: 90" over a readout saying "1 minute 30 seconds".

**2026-08-31 — the deps pass, and one number the plan had wrong.**

- **13.34GB, not 14.33GB.** GAP 1's sizes were HuggingFace's DECIMAL display; `size` is parsed
  1024-based by `footprint.js`, the smoke runner's volume preflight and `modelJob.totalBytes`. Both
  fields are now measured by `computeDepHashes.py --sizes` — never type either by hand.
- The `--sizes` pass also regenerated **five unrelated hand-typed `size` strings** it found stale
  (`0.41GB`→`420.45MB`, `0.29GB`→`292.52MB` in loraDeps; three rounding fixes in assetDeps). Every
  `bytes:` was already correct and is untouched — these are string-only. Left in rather than reverted,
  because the next run of the sanctioned command would only re-dirty them.
- 13 deps FAILED to measure (`chatterbox-tokenizer`, the `dramabox-gemma-*` JSON sidecars). Pre-
  existing, unrelated to this card, and their `size` strings are unchanged. Noted, not chased.

**Not proven yet:** the painter's DOM half. Both pure functions are unit-tested, but nothing declares
`hiddenWhen` or `format: 'duration'` yet, so `wrap.hidden` + the CSS override have not run in the app.
That closes with the FlowDef, on the checklist's existing "live run verified" item.
