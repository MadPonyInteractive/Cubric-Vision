# Text to Speech (MPI-607) — Chatterbox, two arms and an optional VC stage

> Part of [add-flow/existing-flows](../README.md). Type a line, give it a voice to speak
> in, optionally convert the result onto a second voice. **The TTS half that
> [Voice Changer](voice-changer.md) deliberately left unowned**, and the third audio-only
> Flow. Read this before touching the flow, its graph, or the Chatterbox deps.

## Shape

| | |
|---|---|
| id / op | `chatter-box` / `flowChatterBox` |
| graph | `comfy_workflows/flow_chatter_box.json` (12 nodes) |
| `requiredModels` | `[]` |
| `requiredDeps` | 13 weights + `ComfyUI_Fill-ChatterBox` — **6.95 GB** |
| `mediaType` | `'audio'` |
| inputs | prompt, `Input_Is_Multilingual`, `Input_Language.language`, `audio1` (required by the graph), `audio2` (optional) |
| output | `SaveAudioAdvanced` titled `Output_Audio`, flac |

## Two arms, one picked per run — and MpiIfElse is LAZY

`Input_Is_Multilingual` (`MpiIfElse#52`) selects between `FL_ChatterboxTTS` (English only,
node 43) and `FL_ChatterboxMultilingualTTS` (23 languages, node 33).

**`MpiIfElse` declares `lazy: True` on both inputs and its `check_lazy_status` returns only
the taken branch**, so exactly one TTS model loads per run and the other arm's weights are
never touched. This is worth stating plainly because the obvious assumption — that a graph
containing two TTS nodes runs both — is wrong, and an earlier note on this card said so.

Both weight sets are still declared, because either arm can be the one a given user runs.

## 🔴 FL_ChatterboxVC must read from the SELECTOR, not from one TTS arm

`FL_ChatterboxVC#31.input_audio` was wired straight to the English TTS (#43). The effect was
narrow and silent:

- **With** a target voice, `MpiIfElse#53` takes its `true` arm → the VC → which needed #43.
  Laziness meant the selector `#52` was **never evaluated**, so whatever language the user
  picked, the output was English. Nothing errored; audio came out.
- **Without** a target voice, #53 takes `false` → #52 → the language worked correctly.

So the language control was dead on exactly the TTS → VC route the card's settled
architecture is built around, and working on the other one — which is why it survived
review. Fixed on the raw graph (link 77 re-originated from #52) and re-baked.
`tests/inject-params-titles.test.cjs` asserts the wiring, and that assertion has been
mutation-checked: reintroducing the old link fails it.

## The two audio slots do different jobs

| slot | role | job |
|---|---|---|
| 0 | `audio1` → `Input_Audio` | the voice the line is **spoken in**. `MpiLoadAudio#54` carries `block_if_empty`, so the graph blocks without it |
| 1 | `audio2` → `Input_Audio_2` | an **optional** second voice. Present → `MpiAnyChecker#57` flips `MpiIfElse#53` and the run goes TTS → VC |

Both offer the shipped voice library, unlike Voice Changer where slot 0 must be the user's
own take — nothing here passes a real performance through, so neither slot has to be theirs.

TTS → VC is the settled chain order. It was proven the wrong way round in an earlier
session, which is also why `cfg_weight` is back at **0.5**: the 0.3 was compensating for
the reversed order and is void.

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
spray list and the node's `true`/`false` inputs are links, which `_isLink` skips.

**The MPI-359 dotted-key sweep does not cover this.** That test reads
`PromptBoxControls.js` only, so it passes whether or not a *flow's* declared dotted field
resolves. This flow's own test case carries the assertion instead — without it, a renamed
widget here is a dead control no test notices.

The option values are the node's **exact** combo labels (ComfyUI rejects anything else with
"Value not in list") and were generated from the live `/object_info` rather than typed, so
they cannot drift.

## The one state a user can get wrong

**"Other languages" off + a non-English language selected → English output.** The toggle
gates the arm; the select only means anything once it is on.

This is not hidden behind a conditional because `showWhen` was explicitly rejected
(MPI-620: one boolean with one meaning, against a predicate language the frame would then
own forever), and `blankOnly` is step-fields-only and keys off a media role. So the
mitigation is the existing machinery: the toggle is declared **first** so it reads as the
gate, and every non-English option carries an `info` hover saying it needs the toggle on.

`Input_Is_Multilingual` defaults to **false** — the English-only arm. Every measurement on
this card was made there, so the untouched default is the measured configuration rather
than a second model's take on English.

> **Open, and Fabio is the one who can close it:** whether the multilingual model's English
> is as good as the English-only model's. If it is, the toggle and the whole 3.19 GB English
> arm collapse into the language select and this flow gets simpler and smaller. It is an
> English-vs-English comparison, so it is judgeable by ear.

## Portuguese is BRAZILIAN

Confirmed by ear; the node's own label just says "Portuguese (pt)". That option's `info`
says so. **The other 22 are unverified** — nobody on the project speaks them — and that is
an accepted state rather than a blocker: they come from one checkpoint that either works or
does not, and shipping a language nobody can audit is the same bet upstream already made.

## Not done yet

- **No `preview` / `video`** — `/mpi-flow-graphics` work; the keys are absent rather than
  pointing at art that does not exist.
- **No live in-app run.** The graph is validated against the live engine (12 nodes,
  0 unknown class_types, 0 missing required inputs, 0 dangling links, 0 widget shifts) but
  no generation has gone through the Flow overlay, and none of the 13 weights is installed
  on the dev engine yet — only `chatterbox_vc/` exists on disk.
- **Which languages are worth promising** is still unmeasured beyond Portuguese.
