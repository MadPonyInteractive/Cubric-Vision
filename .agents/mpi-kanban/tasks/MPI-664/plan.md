# MPI-664 — Plan: the MiniMax Music 3 Flow

Design settled with Fabio 2026-08-30. Capability facts live in `research/minimax-music-3.md` —
read it first, and do not re-search it.

## Current State

**Design phase COMPLETE. No code written yet.** The whole card so far is design + research.

Settled: hybrid caption approach · the LLM question (Vision already ships `promptEnhance`) · the 18
families as the style dropdown · the caption schema · the licence position · BPM as a 0-means-auto
box capped at 250 · voice as a config dropdown plus a prose box · lyrics stay the user's job ·
instrumental hides the lyrics and voice fields.

Next session starts at the graph and the two frame additions (`hiddenWhen`, `format: 'duration'`).
Nothing is blocked — MPI-663 shipped and released the shared-file claim.

Still unanswered by Fabio: sign-off on the field surface, and whether the `Input_Voice` list is
complete.

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

Draft for review. Two `fields` steps plus the run slide — the carousel IS the Simple/Custom split,
so no reveal-toggle is needed.

### Step 1 — "Describe"

```js
{
    kind: 'fields',
    tickerLabel: 'Describe',
    title: 'Describe your song',
    hint: 'Say what the song is about and how it should feel. Style and voice are on the next step.',
    fields: [
        { id: 'positive', type: 'text', rows: 4, label: 'Your song',
          placeholder: 'A slow sunset track about missing someone, warm and unhurried…' },

        { id: 'Input_Instrumental', type: 'toggle', label: 'Instrumental (no vocals)',
          icon: 'audio', default: false },

        { id: 'Input_Lyrics', type: 'text', rows: 10, label: 'Lyrics',
          placeholder: '[Verse]\nYour words here…',
          hiddenWhen: { field: 'Input_Instrumental', is: true } },
    ],
}
```

The lyrics `hint` carries the official tag set verbatim — `[Intro] [Verse] [Pre-Chorus] [Chorus]
[Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]` — **and** says MiniMax treat these as
generative control, not a guarantee. A user who does not know that reads a loose section as a bug.

### Step 2 — "Style & voice"

```js
{
    kind: 'fields',
    tickerLabel: 'Style',
    title: 'Style and voice',
    hint: 'Pick a family, or describe your own style in your words and press Enhance.',
    fields: [
        { id: 'Input_Style', type: 'select', label: 'Style', default: 15,
          options: [ /* the 18 families, MpiAnySwitch-indexed 1..18 */ ] },

        { id: 'style_custom', type: 'text', rows: 2, label: 'Or your own style',
          placeholder: 'nu-metal with a string section · lo-fi bossa · roots reggae…' },

        { id: 'Input_Bpm', type: 'number', label: 'BPM', min: 0, max: 250, step: 1, default: 0,
          info: '0 = let the model choose the tempo from your description.' },

        { id: 'Input_Voice', type: 'select', label: 'Lead voice', default: 1,
          options: [ { v: 1, label: 'Any' }, { v: 2, label: 'Female' }, { v: 3, label: 'Male' },
                     { v: 4, label: 'Child' }, { v: 5, label: 'Duet' }, { v: 6, label: 'Choir' } ],
          hiddenWhen: { field: 'Input_Instrumental', is: true } },

        { id: 'voice_notes', type: 'text', rows: 2, label: 'Voice notes',
          placeholder: 'raspy and low · high and bright · breathy, close-mic · gospel choir behind the chorus',
          hiddenWhen: { field: 'Input_Instrumental', is: true } },

        { id: 'enhance', type: 'button', label: 'Enhance', icon: 'enhance',
          action: 'enhance', op: 'promptEnhance', from: 'positive', to: 'Input_Caption' },

        { id: 'Input_Caption', type: 'text', rows: 12, label: 'The caption',
          placeholder: 'Press Enhance, or write the three blocks yourself.' },
    ],
}
```

### Run slide

```js
fields: [
    { id: 'positive', type: 'text', rows: 3, label: 'Your song' },
    { id: 'enhance',  type: 'button', label: 'Enhance', icon: 'enhance',
      action: 'enhance', op: 'promptEnhance', from: 'positive', to: 'Input_Caption' },

    { id: 'Input_Duration', type: 'slider', label: 'Length',
      min: 15, max: 300, step: 5, default: 90, format: 'duration' },

    { id: 'Input_Low_Vram', type: 'toggle', label: 'Low VRAM', icon: 'vram', default: false,
      info: 'Decodes in tiles. Slower, but survives a smaller card.' },
]
```

The enhanced caption box is **omitted** on the run slide, exactly as Character Sheet does — the run
slide generates, it does not read. With the caption hidden, the Enhance button's heat is the only
signal that the current prompt is un-enhanced.

### Voice is TWO controls, because the schema splits it that way

`Vocal Details` has four sub-labels, and a single gender dropdown only fills part of one. MiniMax's
own reference captions show the split literally:

> `Vocal Gender & Timbre: Singer A (Male). The vocalist possesses a smooth, soulful tenor timbre with
> a slight rasp…`

A **configuration slot**, then **timbre prose**. So:

| User wants | Sub-label it belongs to | Which control |
|---|---|---|
| female / male / child / duet | Vocal Gender & Timbre (the slot) | `Input_Voice` dropdown |
| raspy, high-pitched, breathy, warm | Vocal Gender & Timbre (the prose) | `voice_notes` → LLM |
| belted, conversational, rapped | Vocal Style | `voice_notes` → LLM |
| church chorus, layered harmonies | **Harmony/Backing Vocals** — a different sub-label | `voice_notes` → LLM |

Enumerating that in dropdowns is exactly the job the LLM half exists to do. Two controls cover all of
it, and they land on the same template/LLM line everything else does.

`Child` and `Choir` are in-distribution, not guesses — the skill ships `children-s-music-folk-pop`,
`children-s-music-orchestral-pop`, `a-cappella-choral-pop`, `choral-ambient-new-age` and a dozen more
choral families.

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

1. Sign-off on the field surface above.
2. Anything missing from the `Input_Voice` list — Any / Female / Male / Child / Duet / Choir?

**Settled 2026-08-30:** BPM ceiling is **250**, not 220 — Fabio has mastered tracks at that tempo,
so a 220 cap would clip real material. Do not "tidy" it down to a textbook range.
