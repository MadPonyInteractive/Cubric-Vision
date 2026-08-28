# Text to Speech (MPI-607) — Chatterbox, two language arms

> Part of [add-flow/existing-flows](../README.md). Type a line, give it a voice to speak
> in, pick a language. **The TTS half that [Voice Changer](voice-changer.md) deliberately
> left unowned**, and the third audio-only Flow. Read this before touching the flow, its
> graph, or the Chatterbox deps.

## Shape

| | |
|---|---|
| id / op | `chatter-box` / `flowChatterBox` |
| graph | `comfy_workflows/flow_chatter_box.json` (12 nodes) |
| `requiredModels` | `[]` |
| `requiredDeps` | 13 weights + `ComfyUI_Fill-ChatterBox` — **6.95 GB** |
| `mediaType` | `'audio'` |
| inputs | prompt, `Input_Language.language`, `audio1` (required by the graph). `Input_Is_Multilingual` is DERIVED, never a control |
| output | `SaveAudioAdvanced` titled `Output_Audio`, flac |

## Two arms, one picked per run — and MpiIfElse is LAZY

`Input_Is_Multilingual` (`MpiIfElse#52`) selects between `FL_ChatterboxTTS` (English only,
node 43) and `FL_ChatterboxMultilingualTTS` (23 languages, node 33).

**`MpiIfElse` declares `lazy: True` on both inputs and its `check_lazy_status` returns only
the taken branch**, so exactly one TTS model loads per run and the other arm's weights are
never touched. This is worth stating plainly because the obvious assumption — that a graph
containing two TTS nodes runs both — is wrong, and an earlier note on this card said so.

Both weight sets are still declared, because either arm can be the one a given user runs.

## 🔴 THERE IS NO VC STAGE, and this is not an open question

The flow declares **one** media slot — `audio1` → `Input_Audio`, the voice the line is
spoken in, which `MpiLoadAudio#54` marks `block_if_empty` so the graph blocks without it.
The op maps that role and **nothing else**.

`Input_Audio_2` is the only thing `MpiAnyChecker#57` reads to flip `MpiIfElse#53` onto
`FL_ChatterboxVC`, so **leaving the `audio2` role unmapped is what keeps this flow on TTS
alone**. Re-adding a slot, or a run-time deriver that fills the role, puts the whole VC arm
back. `tests/flow-derived-fields.test.cjs` asserts both halves — one declared role, one
mapped `mediaInput`.

The dead nodes (`Input_Audio_2`, `MpiAnyChecker#57`, `MpiIfElse#53`, `#56`,
`FL_ChatterboxVC#31`) come out of `raw/` on Fabio's next re-export.

### Why it went, measured — this is the whole justification

The VC arm's only real job was **emotion**. Text cannot select emotion (MPI-622 measured a
neutral reference plus angry words as soulless at exaggeration 0.5 and the *wrong* emotion
at 1.0), so emotion arrived as one of the voice library's 30 performance clips — and that
clip is the VC `target_voice`.

`FL_ChatterboxVC` takes **timbre from the target**, so the output is the clip's speaker and
the chosen voice is overwritten. And the 30 clips carry **30 distinct seeds**
(`qwen3-tts-voicedesign`), so they are 30 different people rather than 6 emotions from 5
speakers. Young Male (R3, 201-250 Hz) plus `perf_R3_cheerful` (seed 2010, 272.5 Hz) came
out a **child**, as it must: register matching bounds PITCH, never identity — a register is
a band, not a person.

A role swap (emotion clip → TTS `audio_prompt`, chosen voice → VC target) was offered and
**rejected** on the grounds that it would still be inconsistent. Fabio, 2026-08-28: *"let's
ship something that works, not something that may work sometimes."* Do not re-propose it.

One thing from the VC era survives and is still load-bearing: `cfg_weight` stays at **0.5**
on the TTS nodes. The 0.3 an earlier session baked was compensating for a VC → TTS chain
order that was itself wrong, so it is void twice over.

## 🟢 All 23 languages are ONE model — there is no list to trim

`t3_mtl23ls_v2.safetensors` is "multilingual, **23** languages" in a single checkpoint.
Shipping every language costs exactly what shipping one would, so the flow offers the
node's full list. Six files, 2.99 GB.

Two of those six are **byte-identical** to their `chatterbox_vc` twins (`s3gen.pt`
sha `9b9ff07e…`, `conds.pt` sha `6552d705…`) and are deliberately **not** deduped — the
pack expects each model to find its own copy beside it and the two loaders read two paths,
the same call already recorded against `conds.pt`. It costs a duplicated 1 GB for `s3gen`.

`ve.pt` here is **not** `chatterbox-ve` — that one is `ve.safetensors` at 5,695,784 bytes,
this is `ve.pt` at 5,698,626. Different files, near-identical size, easy to mistake for a
duplicate.

## The language field needs the DOTTED key

`language` is **not** in the injector's spray list, so a plain `Input_Language` would match
the node by title and then write nothing. The field uses `Input_Language.language` — the
`Title.widget` form (MPI-359, `comfyController.js` §3) that addresses one widget directly.

By contrast `Input_Is_Multilingual` uses a **plain** key, because `boolean` **is** in the
spray list and the node's `true`/`false` inputs are links, which `_isLink` skips. It is not
a field at all — see the next section.

**The MPI-359 dotted-key sweep does not cover this.** That test reads
`PromptBoxControls.js` only, so it passes whether or not a *flow's* declared dotted field
resolves. This flow's own test case carries the assertion instead — without it, a renamed
widget here is a dead control no test notices.

The option values are the node's **exact** combo labels (ComfyUI rejects anything else with
"Value not in list") and were generated from the live `/object_info` rather than typed, so
they cannot drift.

## The arm is DERIVED, because the toggle had one unwinnable state

There used to be an "Other languages" toggle beside the select, and the pair had exactly
one state a user could get wrong: **toggle off + a non-English language → English output**,
silently. `showWhen` was rejected (MPI-620: one boolean with one meaning, against a
predicate language the frame would own forever) and `blankOnly` is step-fields-only, so the
mitigation was copy — the toggle declared first, plus 21 `info` hovers saying to turn it on.

Fabio removed the class of error instead (2026-08-28): *"If English is selected, then we
ourselves inject false into the other languages boolean."* The FlowDef now carries a
`derived[]` entry — read `from`, compare to `equals`, send `then`/`else` to `id`:

```js
derived: [
    { id: 'Input_Is_Multilingual', from: 'Input_Language.language',
      equals: 'English (en)', then: false, else: true },
],
```

`MpiBaseFlow._collectInputs` evaluates it. **One shape, no predicate language** — that was
the condition for accepting it at all. The broken state is now unreachable rather than
warned about, and the 21 dead hovers went with the toggle.

English still takes the English-only arm, which is where every measurement on this card was
made.

> **Open, and Fabio is the one who can close it:** whether the multilingual model's English
> is as good as the English-only model's. If it is, the whole 3.19 GB English arm collapses
> into the language select and this flow gets simpler and smaller. It is an
> English-vs-English comparison, so it is judgeable by ear.

## Portuguese is BRAZILIAN

Confirmed by ear; the node's own label just says "Portuguese (pt)". That option's `info`
says so. **The other 22 are unverified** — nobody on the project speaks them — and that is
an accepted state rather than a blocker: they come from one checkpoint that either works or
does not, and shipping a language nobody can audit is the same bet upstream already made.

## 🔴 It produced SILENCE until setuptools was pinned

Before doing anything else with this flow, know the failure it shipped behind. Every run —
both arms, and the shipped Voice Changer too — wrote a real `.flac` of **zero duration at
−91 dB while ComfyUI reported success**. Three swallowed failures stacked:

1. `setuptools` resolved to 83 transitively (via torch); setuptools removed
   `pkg_resources` in 81, and `resemble-perth` imports it.
2. perth's `__init__` swallows that and sets `PerthImplicitWatermarker = None`, but
   `import perth` still succeeds — so the pack's `PERTH_AVAILABLE` guard reads as fine.
3. `ChatterboxTTS.__init__` calls the `None`; `FL_Chatterbox*` catches the `TypeError`
   into its `message` STRING output, which no graph wires, and returns its pre-initialised
   `{"waveform": zeros((1,2,1)), "sample_rate": 16000}`.

Fixed by `setuptools<81` in `dev_configs/python_deps.in`. **The tell is the output file:**
16 kHz stereo with one sample is that placeholder, not audio. If this flow ever goes quiet
again, check `pkg_resources` before suspecting the model.

## Verified

- **Both arms produce real speech**, measured after the fix: English arm 2.88 s / −22.1 dB,
  multilingual Chinese 2.91 s / −22.4 dB, Japanese 2.67 s / −20.9 dB — from a shipped
  library voice as the reference.
- The graph validates against the live engine: 12 nodes, 0 unknown class_types, 0 missing
  required inputs, 0 dangling links, 0 widget shifts.
- All 13 weights install through the app's own download manager onto their `targetPath`s.

## Not done yet

- **No run through the Flow overlay.** Every generation above was dispatched straight to
  the engine, which exercises the graph but not the flow's media routing, `.preview-assets`
  storage or reuse.
- **The dead VC nodes are still in the graph.** Unreachable, since nothing fills
  `Input_Audio_2`, but not yet deleted — that is Fabio's re-export from `raw/`.
- **Which languages are worth promising** is unmeasured beyond Portuguese.
