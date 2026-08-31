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
roster is on. See § The voice roster for the evidence and its one caveat. Next action: the stage
restructure, then the graph.

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

## LoRA — nodes yes, rack no

The bench graph carries `Input_Lora` nodes. **Do not declare a rack in v1.** A declared rack is the
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

**Not proven yet:** the painter's DOM half. Both pure functions are unit-tested, but nothing declares
`hiddenWhen` or `format: 'duration'` yet, so `wrap.hidden` + the CSS override have not run in the app.
That closes with the FlowDef, on the checklist's existing "live run verified" item.
