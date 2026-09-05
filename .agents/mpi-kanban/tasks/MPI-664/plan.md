# MPI-664 — Plan: the MiniMax Music 3 Flow

Design settled with Fabio 2026-08-30. Capability facts live in `research/minimax-music-3.md` —
read it first, and do not re-search it.

## Current State

🟢 **2026-09-03, fifth session — THE LYRICS GATE IS PROVEN ON THE LIVE GPU, AND REUSE WAS WELDING
THE ENHANCER SHUT.**

**Run 3 (Fabio, Instrumental ON) read off the live graph via `GET :48188/queue`:**

- 🟢 **CHECK 1 PASSES — `Lyrics_Gate` holds.** Node 103's `boolean` ← node 73 `Input_Instrumental`
  = `true` → takes the `true` arm → node 75 `Empty_String` = `""`, and encoder node 54's `lyrics`
  ← 103. His section plan sat in `Input_Lyrics` (node 46) and never reached the model. The
  instrumental path's lyrics half is CLOSED.
- 🔴 **CHECK 2 COULD NOT RUN — the enhancer never fired.** `Input_Arrangement` came back carrying
  yesterday's rival plan verbatim, clock times and all (*"At 1:20, the strings enter… By 2:15"*).
  GPU went straight to 12.1/16GB with no ~4GB stage, `/history` was empty after the restart, and
  only one prompt was queued. The caption was the PRE-FIX recipe's output, restored, not written.

**🔴 THE DEFECT — REUSE RESTORES THE TEXT BUT NOT ITS OWNERSHIP.** Fabio opened the card with
Reuse. `seeded` refills `_fieldValues` from the sidecar, but `_enhanceWrote` was rebuilt EMPTY at
mount, so the three restored blocks looked hand-typed — and the 🔴 "Enhance must never destroy the
user's writing" rule then defended them from the enhancer that wrote them:

1. He edited the Song structure (a real source). `_setFlowField`'s loop hit
   `if (!_fieldValues[t] || !_enhanceWrote.has(t)) return;` and cleared nothing.
2. `_autoEnhance` saw a full target set → `continue` → no pass.
3. `_mayEnhanceWrite` would have refused the button too.

**After one Reuse, that flow instance could never enhance again.** Not a cache miss — a weld.
Fabio called it: *"I changed the instructions… it shouldn't have used it. It should have enhanced
again."* He was right, and he found it.

**FIXED — ownership rides the snapshot.** `_collectInputs` emits `enhanceWrote: [...]` beside
`stepValues` (frame bookkeeping, no op mapping), and `_enhanceWrote` seeds from
`seeded.enhanceWrote`. One read covers both restore paths, because `seeded` is
`s_flowInputs || props.initialInputs`. An older sidecar has no key, seeds empty, and behaves
exactly as before — ownership cannot be inferred after the fact, and guessing it would wipe prose
the user really did type.

**Verified:** 881/881 unit (3 new in `tests/flow-enhance-ownership.test.cjs`), 13/13 desktop flow
specs, eslint clean.

🟡 **A WRONG STEER THIS SESSION, recorded so it is not repeated: "type into Song structure and the
cache busts" is FALSE on a reused card.** A source edit only clears text the enhancer owns, so on
a Reuse it clears nothing. Before the fix the only escape was opening the flow fresh (no Reuse),
where every field falls to `f.default` and the boxes come up empty.

🟢 **RUN 4 CLOSED THE CARD'S HEADLINE DEFECT.** Fresh open, Instrumental ON, structure typed:
**nothing was sung or hummed** (Fabio's ears), choir present as an orchestral texture, arrangement
in his order with no clock times, caption 329 words, `lyrics` `''`. Three sessions of singing
stage directions — done.

🔴 **WHAT REPLACED IT IS A QUALITY PROBLEM: instrument adherence.** Flutes, a distant drum, no
violas. **The recipe asked for the wrong REGISTER** — MiniMax's own template caption is an
equipment list in fragments with literal section labels, and ours said "three prose blocks" plus
*"never an equipment list"*. Rewritten: caption register, no metaphor, instruments named literally
and repeated per section, `[ARRANGEMENT]` leads with the bed then one labelled line per section,
key/scale allowed. eslint + 881/881 + 13/13 green; **audio effect UNMEASURED**.

🟢 **THE VOCAL PATH IS STRONG AND FABIO LIKES THE OUTPUT.** First vocal run ever attempted:
every lyric line delivered, sections right, mood and voice right, 1:55, ended on its own.
*"Catchy tune."* Lyrics reach the encoder intact, `<Singer A>` markers stripped, roster in Vocal
Details — all first-time verifications.

🔴 **AND IT REWRITES WHY THE INSTRUMENTAL RUNS FAILED.** Channel strength measured across seven
runs: **Lyrics ≫ Global Metadata ≈ Vocal Details > Arrangement**. An instrumental run puts 100% of
the user's intent into `Arrangement`, the weakest, while the strong channel sits EMPTY — so the
model fills it from its prior, which is an orchestral bed and a singer. That is the flute, the
missing 808 and the unrequested vocalising, all of it. Not a bad model, and not the caption
register. Fabio's own raw-ComfyUI control run (hand-written template caption, none of our code)
failed the same way, which is what exonerated the pipeline.

**FOUR FIXES SHIPPED TODAY**, all green (eslint · 881/881 · 13/13 desktop): the Reuse ownership
weld; the recipe's register (caption not prose); the few-shot example that leaked a hip-hop kit
into the user's intro; and hidden fields leaking into the enhancer's input (a hidden
`Input_Structure` put a horror-trailer arrangement into a ballad, with no way to clear it from the
UI). Both graph-visible fixes verified in the app on real runs.

---

🟢 **2026-09-03, sixth session — BARE TAGS ARE BUILT. Code green, one Generate owed.**

`Lyrics_Gate`'s true arm no longer carries `Empty_String`. New graph nodes **`Input_Structure`
(104)** and **`Bare_Tags` (105)**: the Song structure box now reaches the graph, and one
`RegexReplace` strips it down to section tags alone before the gate's true arm hands them to the
encoder.

```
Input_Structure ──▶ Bare_Tags ──▶ Lyrics_Gate.true ──▶ encoder.lyrics
                                  Lyrics_Gate.false ◀── Strip_Voice_Markers
```

**The pattern, and why it is a WHITELIST:**

```
(\[(?:intro|verse|pre-chorus|chorus|post-chorus|bridge|instrumental|solo|outro)(?: *\d+)?\])|[^\[]+|\[
```
replaced with `\1\n` (`case_insensitive` is the node's default, so it matches any casing).

🔴 **"Bracketed" was never the safety property — WORDLESS is.** Run 2 folded every stage direction
INSIDE brackets, Suno-style, and the model sang those too. So the pattern keeps only MiniMax's own
nine tags and collapses everything else — prose, `[Drop]`, a dangling `[` — to whitespace, which
`normalize_lyrics` then discards when it splits on `\s*(\[[^\]]+\])\s*`. A structure with no
brackets at all degrades to exactly today's behaviour (`"[start]\n"`).

**Verified against the engine's own source**, not assumed: `comfy/ldm/minimax_music/prompt.py:49`
lowercases tags, drops empty parts and joins with `\n`, so the blank lines between the bare tags
never reach the model. `RegexReplace` is a plain `re.sub` with `case_insensitive=True` by default
(`comfy_extras/nodes_string.py`), so `\1` is a real backreference and an unmatched group
substitutes empty.

**Green:** 882/882 unit · 23/23 injection guard (4 new asserts pinning the pattern's BEHAVIOUR,
the wiring of both ends, and the no-word-outside-a-tag invariant) · 13/13 desktop flow specs ·
eslint clean · `bench/sim_caption.py` case B now yields `'[Intro]\n\n\n\n[Chorus]\n\n'` from a
structure containing `[Drop]` and three lines of prose.

`minimax-music:Input_Structure` is **out of `INJECTOR_DERIVED`** — it addresses a node now, so the
guard checks its wiring instead of skipping it. The old allow-list reason (a rival plan in the
caption) still holds for the CAPTION and only the caption: the prose still reaches `[ARRANGEMENT]`
through the enhancer, and only wordless tags reach the encoder. Two destinations, no rivalry.

**NEXT: one Generate with Instrumental ON, on Fabio's GPU.** Nothing sung (unchanged from run 4),
and the sections should now land where he put them.

---

🟢 **2026-09-05, eighth session — THE THREE APPROVED JOBS ARE DONE. One of them came back with
the opposite answer.**

1. 🟢 **BOTH LICENCES READ WHOLE** — Stability Community License + Core Models list + AUP, and
   the Gemma Terms + Prohibited Use Policy. Not a summary; the incorporated-by-reference policies
   too. **Both weights are in scope, neither licence restricts by territory, and neither puts a
   bar on Outputs.** Five obligations block a RELEASE (Stability registration, a `Notice` file,
   bundled licence copies, a "Powered by Stability AI" string, a Gemma §3.2 clause in our terms);
   none blocks the build. Full findings: `../MPI-694/brief.md` § GATE 1.
2. 🔴 **THE "TWO-NODE VRAM FIX" IS A ONE-NODE FIX. Measured, four arms, on the bench.**
   `MpiClearVram` is the entire win — **12.35 GB → 6.4 GB, −48%, for +0.7 s**. `VAEDecodeAudioTiled`
   saves nothing once the unload is in and costs **+15 s at 60 s, reproduced three times**;
   chunking alone still peaks at 12.16 GB, which proves **the reprompter was pinning the card, not
   the decode**. Ship node 1; hold node 2 as a long-duration/small-card fallback. Runner and raw
   numbers: `bench/stable_audio_vram.mjs` + `.results.json`.
3. 🟢 **MPI-694 CREATED** — "Stable Audio 3: SFX, one-shots, instruments, instrumental music",
   `todo`/`planned`. Board validator exit 0.

**NEXT: the two blank bullets.** Fabio has been asked what outcomes 4 and 5 are. The one-flow
design does not start until he names them.

---

🟢 **2026-09-05, seventh session — STABLE AUDIO 3 IS EVALUATED AND IN. The card's shape changed.**

Shipped: bare tags (`7b7c3545`), and three research commits (`2c18c0f4`, `ca7fae10`, `ef95173d`).
Full bench facts in `research/stable-audio-3-bench.md` — read it, do not re-derive it.

**FABIO'S VERDICT, all four modes in the bench:** *"instrumental, effects, one-shot, and music:
it's very good… We can use it for everything else but sung songs."*

🔴 **THE ARCHITECTURE HE ASKED FOR — ONE FLOW, TWO MODELS, ONE ANNOUNCER.** Not two flows and not
a second engine bolted behind Music Maker. One flow where the user does everything:

- music **with lyrics** → MiniMax (the only one that sings)
- music **as effects** → Stable Audio 3
- **one-shots and instruments** → Stable Audio 3
- 🔴 **TWO MORE OUTCOMES FABIO LISTED AS BLANK BULLETS AND HAS NOT NAMED YET — ASK HIM FIRST.**

**ONE ANNOUNCER, his explicit constraint.** Do NOT ship two prompt-enhancer LLMs.
**Consolidation is not a VRAM win** — ours (`qwen3vl-abliterated-clip`) is 4.88GB, theirs
(`qwen3.5_2b_bf16`) 4.55GB, 330MB apart. The cost of two is that users download **both, 9.43GB**.
RECOMMENDATION, not a decision: keep ours and port Stability's four category recipes onto it —
ours is already shipped and shared with the Image Describer plugin
(`pluginsRegistry.js:66`), so switching to theirs would ADD 4.55GB for anyone holding both.

**The three jobs Fabio approved for the next session:** read both licences whole; apply the
two-node VRAM fix in the bench workflow; create the Stable Audio card.

---

🔴 **2026-09-03, fourth session — THE FLOW RAN TWICE ON THE GPU AND THE INSTRUMENTAL PATH WAS
WRONG. It is rebuilt and needs one more press to confirm.**

**What the two runs proved, in the order it was learned:**

1. 🟢 **The 4B holds the three-marker format** under a labelled block. `[MOOD]` / `[VOCAL]` /
   `[ARRANGEMENT]` all present, each landing in its own box. The silent-fallback failure did not
   happen. Item 4 of validation.md's "STILL UNPROVEN" list is CLOSED.
2. 🟢 **The enhancer cache works.** Second Generate with only the Lyrics changed produced ONE
   prompt — `got prompt` → `Requested to load MiniMaxMusic3TEModel` 30ms later, no token pass.
3. 🟢 **VRAM is already released after the enhance stage** — `MpiClearVram` sits after
   `TextGenerate` and calls `unload_all_models()`. Asked and answered; no work needed. Note for
   next time: `unload_all_models()` LOGS NOTHING (the `"N models unloaded."` line lives in
   `load_models_gpu`, `model_management.py:981`), so silence is not evidence it did not run.
4. 🔴 **A man sang Fabio's stage directions.** Instrumental on, and the model sang the lyrics box.
5. 🔴 **Suno-style bracketing did NOT fix it.** `_LYRIC_TAG_RE` is `\[[^\]]+\]`, so any bracketed
   run is a legal tag and the shape was accepted — the model sang them anyway from the verse on.
6. 🔴 **THE HEADLINE: the enhancer was writing a rival song.** Its `[ARRANGEMENT]` was a fully
   timed plan nobody asked for — *"opens with a single, pulsing sub-bass drone… At 1:20, the
   strings enter… By 2:15, the full orchestra erupts"* — while Fabio's own plan sat in the lyrics
   slot. The caption outranks the lyrics slot, so the model played the 4B's song: he asked for a
   single orchestral drum in the intro and got a drone and muted brass. **It was not disobeying.
   It was obeying the other plan in the same caption.** `[MOOD]` carried a third timeline.
7. 🔴 **The choir was banned outright.** `Instrumental_Clause` said "no vocoder or choir pads"
   while he asked for a choir in the outro.

**What was built in response (all green, unpushed at the time of writing):**

- **`Lyrics_Gate` IS BACK** — graph node 103, `MpiIfElse(Input_Instrumental, true: Empty_String,
  false: Strip_Voice_Markers)` into the encoder. Deleting it on 2026-09-02 was the defect, and it
  was deleted against this card's OWN research file, which said all along: *"empty Lyrics AND an
  explicit 'instrumental, no vocals' in the caption, or the model sneaks in humming and vocoder
  pads."* `inject-params-titles.test.cjs` asserted ONE gate and demanded the lyrics one stay
  deleted; that assertion is reversed with the two runs written into it.
- **The box splits in two.** `Input_Lyrics` (`hiddenWhen` Instrumental `is: true`) and
  **`Input_Structure`** — label "Song structure" — (`hiddenWhen` Instrumental `isNot: true`). Two
  fields rather than a `labelWhen` clause, because that would be new frame work in
  `MpiBaseFlow.js`, which MPI-666 holds. Each mode keeps its own text across a toggle.
- **`Input_Structure` REACHES NO GRAPH NODE, deliberately.** It is in `flow.enhance.from`, so the
  frame sends it as a `Song structure:` line and the recipe expands it into `[ARRANGEMENT]`.
  Allow-listed in the injection guard with the reason. A verbatim splice was rejected: the user
  writes ~40 words, MiniMax ask for 250–450 weighted to Arrangement.
  — **SUPERSEDED 2026-09-03 (sixth session), and only halfway.** It reaches a node now, but not
  with its words: `Input_Structure` → `Bare_Tags` → `Lyrics_Gate.true`. The rejection of a
  verbatim splice still stands for the CAPTION; what changed is that the tags alone go somewhere
  the caption never did.
- **The recipe stops sequencing.** New rules: never invent a running order or a clock time in any
  block; where a `Song structure:` section is given it is FINAL — keep its order, keep each
  instrument in its own section, add only texture. `[MOOD]` no longer describes the running order.
- **`Instrumental_Clause` narrowed** — a choir is allowed as an orchestral texture, still banned
  as a lead or a wordless stand-in.

**Verified:** 878/878 unit, 13/13 desktop flow specs, eslint clean, `verify-workflow` +
`validate-injection-rules` ✓ against the engine at 48188, and `bench/sim_caption.py` asserting
that an instrumental run's lyrics slot comes through EMPTY while a vocal run keeps its tags.

🟡 **`bench/sim_caption.py` had been broken since 2026-09-02** — it walked hardcoded node `"78"`,
which WAS the old `Lyrics_Gate`, so it raised `KeyError` on every run after the deletion. The
lyrics half of validation.md's evidence was therefore carried forward, not re-measured. It now
derives both node ids off the encoder and asserts instead of only printing.

**NEXT ACTION: one Generate in Fabio's app with Instrumental ON and a section plan in the Song
structure box.** Nothing may be sung or hummed, and the arrangement must follow HIS order. The
enhancer WILL re-run (the structure is a cache source) — expect the 1400-token pass first.

---

🟢 **2026-09-02, third session — A, B AND C ARE ANSWERED AND THE ONE-BOX REWRITE IS BUILT.**
Everything below in this section is Fabio's own instruction, given in two messages.

**A — the brief goes into `Global Metadata`** (A1, the in-schema option). The graph now carries
`Input_Positive` → `Cat_Brief` → `Cat_Global_Metadata`, so the user's sentence is the FIRST thing
the caption says. The node is titled `Input_Positive` and not `Input_Brief` for one reason:
`_buildParams` writes that title on every run, so it is the delivery mechanism — a bespoke title
would need bespoke plumbing. `inject-params-titles.test.cjs` asserted the exact opposite until
today; that assertion is now reversed with the reasoning attached.

**B — the one-box rewrite, and it went further than an Advanced disclosure.** Fabio: *"if we're
not going to show Mood, Vocal, and Arrangement to the user, then might as well change and simplify
all this"*, then: *"the announce button, the mood, the vocal, and the arrangement all go away"*
(*announce* = Enhance, speech-to-text). So they are not hidden behind a disclosure — they are gone
from the surface entirely, kept only as `hidden: true` declarations because the graph still needs
them seeded. The enhancer runs as **step one of Generate**: *"the enhancer runs silently, but it
only runs if the user has changed the prompt… we get a snapshot of what the enhancer did so that it
doesn't need to run again."*

**THE SNAPSHOT NEEDED NO CACHE.** `_enhanceWrote` already recorded who wrote each box and
`_setFlowField` already emptied the enhancer's own output when its source changed. Widening that
from one `from` id to a LIST made the same bookkeeping the cache: a full target set means the
answer still matches its inputs, an empty one means re-run. `from` is `['positive',
'Input_Style', 'Input_Style_Custom', 'Input_Instrumental']` — Style because the enhancer writes an
arrangement and cannot write one without the genre, Instrumental because otherwise it writes vocal
prose for a track the caption elsewhere forbids vocals on.

**D FOLLOWS FROM B AND IS DONE:** `qwen3vl-abliterated-clip` (4.88GB) is now in `requiredDeps`,
taking the flow 13.34GB → 18.22GB. It had to: inside Generate, an undeclared enhancer is a Generate
that dies on a clean install. 🟡 Side effect worth knowing — a flow's deps are protected
UNCONDITIONALLY, so uninstalling the Image Describer plugin can no longer reclaim that weight;
`shared-dep-uninstall-direction.test.cjs` case (3) now asserts the flow is its only defender.

**THE NEW SURFACE — one step, then the run slide:**

| surface | left | right |
|---|---|---|
| **Song** (step 1) | Voices roster · Voice notes · **Instrumental** | Lyrics |
| **Generate** (run slide) | Your song · Style ▾ · (Your own style) · Tempo · Cut off at · Low VRAM | — |

**Instrumental GREYS the voice controls rather than hiding them** (*"when pressed, it greys out all
the voice controls"*), which needed a new `disabledWhen` clause AND a wider reach for disabling:
it used to land on the primitive's `setDisabled`, so a `text` box could not be greyed at all. It is
`inert` on the field wrapper now — the platform's own answer, one line, every field type.

🔴 **AND THE LYRICS BOX IS NOW LIVE ON AN INSTRUMENTAL RUN — `Lyrics_Gate` is deleted.** Fabio
asked whether lyrics do anything when instrumental is on; the answer is yes and the graph was
throwing it away. `build_prompt` always wraps the lyrics slot in `<|lyrics_start|>` /
`<|lyrics_end|>` whatever the caption says, and `normalize_lyrics` keeps `[section]` tags verbatim
(`comfy/ldm/minimax_music/prompt.py`). Instrumental is a CAPTION clause and nothing else, so the
box is where an instrumental track's sections get described — "[Intro] solo piano, [Chorus] full
strings". The Vocal gate stays; only the lyrics one went.

**C — "Maximum length" is now "Cut off at", default 5:00, range 30–360s.** 360 is the model's own
ceiling (`MAX_AUDIO_FRAMES / AUDIO_FRAMES_PER_SECOND` = 9000 / 25), not a round number. No fade:
nothing measured has ever reached the cap, so a fade would be machinery for an event that has not
happened. Marked `ponytail:` in the FlowDef for the first time a real run is audibly truncated.

**One un-asked fix, disclosed:** the `Cinematic epic` style phrase lost `with percussion and
choir`. The graph was building a self-contradicting caption on any instrumental run — that phrase
plus `no vocoder or choir pads` from `Instrumental_Clause`, in the same caption, with nothing to
arbitrate. No prompt wording avoided it; the style phrase had to yield.

**Verified without spending a single GPU-second.** The caption chain is pure string ops, so it was
evaluated directly from the API graph: with vocals the caption opens `Global Metadata: Dark heavy
soundtrack for a horror movie trailer. Cinematic orchestral epic…`; with Instrumental on the cast
is replaced by the clause and the lyrics still pass through. Real pixels checked in an isolated app
on `:52799` (his `:3000` untouched, killed by its ROOT pid): the greying, the three hidden fields,
zero Enhance buttons, `Cut off at 5:00`. 876/876 unit, eslint clean.

🔴 **NOT YET RUN ON A GPU.** The auto-enhance path enqueues a real `promptEnhance` op and then the
music graph; that is Fabio's card and his call. Nothing here proves the 4B holds the marker format
when its input is a labelled block rather than a bare sentence.

🟡 **THIS CARD REDDED MASTER FOR ~55 MINUTES AND A PEER FIXED IT.** The push at 10:20
(`33618991865`) failed CI: the fourth `requiredDep` moved the uninstall dialog's total 13.4GB →
18.2GB, and MPI-682's desktop spec had 13.4 TYPED IN. `npm test` does NOT cover `tests/desktop/` —
Playwright desktop runs in CI only — so the three `.cjs` uninstall tests updated in the same commit
reported green while the desktop half only spoke up minutes later, on someone else's card. MPI-682
fixed both ends (`4c9a359b` derives the figure; `5440cd34` stops a docs-only push being collateral)
and wrote the rule into `docs/playbooks/add-flow/05-verify.md`:

    npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js

**Run that before ANY push touching `js/data/flowsRegistry.js`.** ~10s each, own port, leaves a dev
app on `:3000` alone. Run here after the fact: **12/12 pass** on this tree, so nothing of this
card's is still red. Master is green.

🟢 **The length question is CLOSED and needs no code** — see § 3 below. Measured over 8 encode-only
runs: the prose lever does nothing, the AR picks its own length (33.84 → 90.0+ on ONE caption across
four seeds), and `max_duration` is a guillotine. What remains there is a labelling decision, also
Fabio's.

🟢 **THE REDESIGN IS BUILT AND PUSHED — `cbe49ed0`, 2026-09-02.** Fabio gave his direction and the
UI is now his shape, not the rejected one. 874/874, eslint clean, `flow_minimax_music.json`
validates against the engine, `sync-raw-workflows` clean.

**Two stages, each two columns — exact controls left, the writing right:**

| stage | left | right |
|---|---|---|
| **Song** | Style ▾ (18 + `Custom`) · Your own style *(only on Custom)* · Tempo *(inline, 120)* · Instrumental · Low VRAM | Your song · **Enhance** · Mood · Vocal · Arrangement |
| **Lyrics** | Voices roster · Voice notes | Lyrics |

**Stage 2 does not exist at all on an instrumental run** — a step-level skip, not three hidden
fields. That also KILLED THE GHOST STEP: it was a defect of hiding a step's every field, and there
is no longer a step that can be emptied.

**His five notes, and what each became:**

1. *"Voices and lyrics should be in the same stage… voice UI on the left and the lyrics on the right"* → the Lyrics stage.
2. *"If in stage two the user selects Instrumental… Stage 3 should be bypassed"* → step-level `hiddenWhen`.
3. *"The song stage should have style included with it… on the right, the prompt"* → the Song stage.
4. *"Style should have an option named Custom"* → the reveal clause `isNot`, with `Custom`'s value being the EMPTY STRING (every other value is a genre phrase the graph concatenates, so "no preset phrase" genuinely IS the empty one).
5. *"Tempo starts at 120… inline, not a giant input"* → `inline: true`, `default: 120`, **plus the note he asked for on the follow-up**: *"if TEMPO_0 means AUTO, then it should say that somewhere, a small note below it"*.

**The Enhance button and the caption box were the real finding.** *"Mood, vocal, and arrangement:
as much as I read it, I still don't know what it is or how to use it… there are no examples… and
what is he now going to do? Replace my prompt?"* — and, on the button, *"no idea what that does"*
(he confirmed the "playing house button" was a speech-to-text typo for **Enhance**). One 12-row box
became **three labelled boxes, each carrying a worked example as its placeholder**, and Enhance
fills all three at once — which is the only thing that shows it never touches the brief.

**Five frame additions carry it, all declarative, all available to every flow:**
`hiddenWhen: { isNot }` · a step-level `hiddenWhen` · `inline` on a field · `col: 'right'` for a
two-column `fields` step · `to` as a marker→field map on an enhance button. Documented in
`ui/carousel-frame/fields.md`, `steps.md` and `ui/prompt-enhance.md`.

**The graph lost three nodes.** `Input_Caption` + `Prose_Mood`/`Prose_Vocal`/`Prose_Arrangement`
(three `RegexExtract`) became `Input_Mood`/`Input_Vocal`/`Input_Arrangement` wired straight to their
headings. The app splits the enhancer's marked answer now, so joining three boxes back into one
marked string for the graph to re-split was a round trip for nothing.

**The claim was taken from MPI-591.** `0928f1f4` held `flowsRegistry.js`, `declaredFields.js`,
`MpiBaseFlow.js` and `tests/inject-params-titles.test.cjs`, but that session is CLOSED
(`session_closed` 2026-09-01T20:46:42Z), its record never reached `status: "claimed"` so
`guard-claim` never honoured it, and its work is already on origin (`1144f138`). Nothing of it was
reverted. This card's claim is `b7f21c04`.

## 🔴 THE FIRST REAL GENERATION RAN — 2026-09-02 — AND IT FAILED HARD

Fabio ran it: brief *"Dark heavy soundtrack for a horror movie trailer."*, style **Cinematic
epic**, tempo 120, Instrumental **OFF**, roster left at `Singer A (Any)`, length **45s**. He wrote
his OWN mood/vocal/arrangement, then pressed Enhance.

**What he got:** *"hopeful"* music, a drop at ~38s, a hard cut at 45s. Verbatim: *"it failed very
hard."*

**Three separate causes, and only the first is fixed.**

### 1. Enhance ate his writing — FIXED (`3769f8c9`)

He wrote *"Starting with a single drum hit"*; Enhance replaced it with *"The track opens with a
single dissonant chord."* Same for his mood and his church-chorus vocal. Enhance now writes only
into a box that is EMPTY or that it wrote itself, and editing the brief clears only its own output.

### 2. 🔴 THE BRIEF NEVER REACHES THE MODEL — NOT FIXED, AND IT IS THE LIKELY HEADLINE CAUSE

`positive` is the ENHANCER'S INPUT ONLY. No graph node carries it — `inject-params-titles.test.cjs`
actively asserts there is no `input_positive`, because `_buildParams` would overwrite it. So
*"Dark heavy soundtrack for a horror movie trailer"* — the single sentence that carries his whole
intent — is read by a 4B, paraphrased, and then **thrown away**. Only the paraphrase reaches
MiniMax.

**And the no-clobber fix makes this WORSE, not better:** a user who writes all three boxes himself
now gets no enhancement at all, so his brief reaches nothing whatsoever. The brief is dead weight
on both paths.

The caption also fought him: `Cinematic orchestral epic, full symphonic scoring with percussion and
choir.` is a HEROIC phrase, and it is stated verbatim next to prose about dread — the style
dropdown and the brief can contradict each other with nothing to arbitrate. Vocals were on
(Instrumental off, roster `Any`) for a trailer cue that wanted none.

🔴 **And on an INSTRUMENTAL run that same phrase contradicts the graph's own clause outright**
(found 2026-09-02 while building the length bench). The caption then carries both
`...percussion and choir.` (from `flowsRegistry.js:2222`) and `Instrumental. No vocals of any kind:
… no vocoder or choir pads.` (`Instrumental_Clause`). The graph builds that collision itself, in
one caption, with nothing to arbitrate — it is not a user error and no prompt wording avoids it.
Same edit as the brief plumbing if the style phrase is made to yield.

**Decision needed before the next attempt** — do NOT implement unilaterally, it changes the caption
contract: does the brief get its own heading in the caption, or get prepended to Global Metadata?
Either is a new `Input_Brief` MpiText node plus one `StringConcatenate` in `raw/`.

### 3. ✅ MEASURED 2026-09-02 — length CANNOT be asked for at all, by any means we have

He asked for 45s and reads the cut at 45s as the model obeying badly. It is not obeying at all —
but the mechanism in this plan was **wrong**, and the fix it implied does not exist.

**What the source actually does** (`comfy_extras/nodes_minimax_music.py:34-41`,
`comfy/text_encoders/minimax_music.py:50-58`, `comfy/ldm/minimax_music/prompt.py:56`,
`comfy/ldm/minimax_music/ar.py:281-294`): `seconds` is NOT derived from the lyrics. The AR
text encoder **generates the acoustic sequence autoregressively and decides its own length**,
stopping when it emits `<|audio_end|>` or when it is guillotined at
`decode_limit = round(max_duration * 25)`. `build_prompt` feeds it caption AND lyrics, so the
caption IS in its context — which is why the prose lever was worth testing.

**Tested, encode-stage only (`PreviewAny` on the encoder's `seconds`, no DiT, no VAE — ~50s a
run instead of a full generation). Eight runs, `max_duration` 90 throughout.**

| caption | asks for | seed 12345 | other seeds |
|---|---|---|---|
| control, no duration language | — | **33.84** | 53.24 · 38.64 · **90.0 (capped)** |
| lever prose | 20 s | 35.48 | — |
| lever prose | 45 s | 52.20 | **90.0 (capped)** |
| lever prose | 75 s | 32.12 | — |

**The number in the prose does nothing.** Ask for 20 → longer than control. Ask for 75 → shorter
than control. No ordering. And the control caption ALONE spans 33.84 → 90.0+ across four seeds, so
the whole spread is seed noise; the 52.2 that first looked like obedience reproduced as 90.0 on a
second seed.

**Second test — Fabio's own hypothesis, and it is the one that moves the needle (2026-09-02).**
His argument: a stated number is not what a track's length follows; the amount of music DESCRIBED
is — *"if I want a one-minute track, I need to provide information for a one-minute track… very
similar to text-to-speech."* Tested sparse (one-line arrangement) vs dense (five-stage arrangement,
~4× the words), 4 seeds each, `max_duration` 150:

| seed | sparse | dense |
|---|---|---|
| 12345 | **73.80** | 54.92 |
| 999 | 33.40 | 56.08 |
| 4242 | 25.84 | 29.92 |
| 777 | 24.92 | 54.56 |
| **median** | **~29.6** | **~54.7** |

**He is directionally right, and it is the only thing that moved anything.** Dense is longer on 3
of 4 seed-matched pairs, the medians are nearly 2× apart, and the dense spread is far tighter
(29.9–56.1 vs 24.9–73.8). Contrast the stated-number test above, which produced no ordering at all.
**But it is a nudge, not a dial** — n=4 a side, the ranges overlap, and one sparse run came back
the longest of all eight. You cannot promise "60 seconds" with it.

So the enhancer SHOULD size its arrangement prose to whatever length the user asks for — it is
writing that prose anyway, so the nudge is free — but the UI must not sell it as a length control,
and deterministic length still needs trim+fade after decode.

**What this means for the product — there is no exact length control to ship, only a nudge and
honest labelling:**
- `max_duration` is a **guillotine**, not a length. It is the only thing in the graph that touches
  duration, and all it can do is cut mid-phrase.
- Fabio's cut was **not bad luck**. At a 45s cap, 4 of these 8 runs would have been truncated.
  A low cap makes the mid-phrase cut the DEFAULT outcome, not the edge case.
- Options, all labelling/post, none a new lever: rename it to what it is ("Cut off after") and add
  a fade so the cut is not a cliff; drop it from the creative step and cap high; or keep the number,
  cap high, and trim+fade to the asked length after decode. **Fabio's call.**

**Bench payloads kept** — `scratchpad/len_{A,B,C,D}.json` + the seed variants are throwaway, but the
recipe is worth reusing: a 3-node graph (`CLIPLoader` → `MiniMaxMusic3TextEncode` → `PreviewAny` on
output 1) answers any "what length / does the caption reach the model" question for ~50s of GPU,
because the AR runs at ENCODE time and the expensive DiT never has to.

🔴 **STILL UNPROVEN, and it is the same gap as before: NOBODY HAS LOOKED AT IT RUNNING.** No
ComfyUI execution has touched the new caption chain, and the two-column split, the reveal, the
inline tempo, the step skip and the three-box Enhance have never rendered. The last UI was rejected
*on sight* — do not call this done on a green test run.

**Everything below in § The field surface, § The steps split and § The voice roster describes the
REJECTED five-step surface.** It is HISTORY. The roster's own reasoning and bench evidence still
hold; its placement does not.

**What IS settled and green — 870/870, lint clean, both workflow gates green:**
- The FlowDef, the op in all four files, GAP 3, the enhancer recipe, the new injection guard.
- The three weights, installed and verified on disk at their declared byte sizes.
- **The title: `Music Maker`** (Fabio, 2026-09-01 — see § Open item 0). `id` stays
  `minimax-music`, op key stays `flowTextToMusic`, `filePrefix: 'flowMusicMaker'`.

**Still never proven, and now blocked behind the redesign:** the live run. `hiddenWhen`,
`format: 'duration'` and the `voices` roster have still never rendered in a shape anyone accepts,
and nothing has measured whether Qwen3-VL-4B holds the three-marker format. ComfyUI has still
never EXECUTED the caption chain.

⚠️ **`js/utils/declaredFields.js`, `MpiBaseFlow.js` and `tests/inject-params-titles.test.cjs` are
under a live MPI-591 write claim (`0928f1f4`).** Any UI change that reaches the frame lands in
files this card does not own — message or wait, do not edit.

**2026-09-02 — the rename is on origin as `3b9dcee4`, and the tree moved on while this session was
paused.** Nothing of this card's is uncommitted. Two peer commits matter to the next session:

- **MPI-681 is FIXED AND CLOSED** (`8c5290f8`, a peer, ~10 minutes after this session carded it).
  `syncModelInstalled` now keys its gate on a third key built from the flow AND plugin dep slices,
  so a deps-only install fans out. Both twins, one primitive, `tests/deps-only-install-fanout.test.cjs`
  proven to fail without the fix. **The app no longer needs a restart to unstick the drawer** — do
  not repeat that workaround, and do not re-diagnose it.
- **MPI-682 shipped flow uninstall** (`7dd159da`) and touched `MpiFlowLibrary`'s `openDetail` footer
  block. Any drawer work reads that file as it is now, not as this plan described it.

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

## ✅ GAP 3 — CLOSED 2026-09-01. The enhance action carries its own recipe

Fabio chose **A: build it** (2026-09-01), over deferring the Enhance button entirely.

`FlowStepField.injectionParams` — one object on the `enhance` declaration, spread in
`_runEnhance`. Two lines of behaviour change in `MpiBaseFlow`, and it is the plumbing
`commandRegistry.js`' own comment has promised since MPI-504.

**One deliberate deviation from the plan's wording.** The plan said the declaration is *"merged
over the driven `Input_Seed`"*. It is spread **before** it instead, so a declaration cannot reach
the seed. The same file's existing comment is the reason: the seed is driven precisely because a
fixed one returns the same phrase on every press, and the Enhance → Generate → Enhance loop is the
whole point. Letting a FlowDef freeze it would be a footgun with no use case.

**What rides on it, all in `MINIMAX_MUSIC_ENHANCE_PARAMS`** (hoisted above `FLOWS`, because the
`enhance` pair is declared on both the Style step and the run slide and two copies of a recipe is
two recipes that drift):

- The music recipe. Emits `[MOOD]` / `[VOCAL]` / `[ARRANGEMENT]` and nothing else; never names the
  genre, BPM or key, because the graph writes those and a 4B rounds "78 BPM" to "around 80".
- `Input_Scrub_Negation` DISABLED with `(?!)` — a pattern that can never match. The baked one
  strips negation clauses and would eat *"no drums until the second verse"*.
- `Input_Tidy` narrowed to `\s+$`. The baked `[\s,.]+$` also eats a closing full stop.
- `Input_Text_Gen.max_length: 1400`. The shared enhancer graph's `TextGenerate` was UNTITLED —
  titling it was purely additive, and Character Sheet keeps 512 by not injecting.

**Not a concern, though it reads like one:** the enhancer's `StringReplace` flattens its output to
one line. The blocks are delimited by their MARKERS, not by newlines, so the parse is unaffected —
and one line per block is the shape a caption paragraph wants anyway.

## 🔴 A step whose only field is hidden leaves a GHOST STEP — found 2026-09-01, needs Fabio

`hiddenWhen` sets `wrap.hidden` on a FIELD wrapper (`_paintFieldConstraints`). There is no
step-level equivalent, and **Voices and Lyrics each declare exactly one field**. So an instrumental
run still shows both steps in the carousel and in the ticker, each with its title and hint above an
empty body.

Shipped as declared rather than fixed, because a fix is a FIFTH frame addition on this card and the
fourth to touch `MpiBaseFlow` — the same reason GAP 3 was raised rather than folded in.

The fix, if Fabio wants it, is DERIVED rather than declared — no new vocabulary, and it cannot be
declared wrong: hide a `fields` step whose every declared field is currently hidden. `_allDecls` and
`hiddenFieldIds` already hold everything it needs.

## Open — needs Fabio

A. ✅ **ANSWERED 2026-09-02 — A1, into `Global Metadata`.** Shipped: `Input_Positive` + `Cat_Brief`.

B. ✅ **ANSWERED 2026-09-02 — and harder than the question asked.** Not an Advanced disclosure:
   Mood/Vocal/Arrangement are OFF the surface entirely, the Enhance button is gone, and the
   enhancer runs inside Generate cached on its own source list. Shipped.

C. ✅ **ANSWERED 2026-09-02 — "Cut off at", default 5:00, 30–360s.** No fade (nothing has ever
   reached the cap); the upgrade path is marked `ponytail:` on the field.

D. ✅ **ANSWERED BY B — `qwen3vl-abliterated-clip` is now a `requiredDep`,** 13.34GB → 18.22GB.
   🟡 Residual: a flow's deps are protected unconditionally, so the Image Describer plugin's
   uninstall can no longer reclaim that weight. Making flow protection conditional on the flow
   being installed is MPI-682's territory, not this card's.

D2. 🔴 **THE GPU RUN HAS NOT HAPPENED.** Everything above is verified by pure evaluation and real
   pixels; nothing proves the 4B still emits `[MOOD]`/`[VOCAL]`/`[ARRANGEMENT]` now that its input
   is a labelled block rather than one sentence. If it stops marking, `_writeEnhanced`'s unmarked
   fallback drops the whole answer into Mood and the caption loses two headings — quietly.

E. 🟡 **`MpiInput` and `MpiDropdown` do not agree on control height — a PRIMITIVE-level mismatch,
   not this flow's.** Measured in the running app: input `padding: 9.6px`, `border-radius: 4px`,
   **h=38**; dropdown trigger `padding: 10px`, `border-radius: 0`, **h=39**. Same `font-size: 13px`.
   Fabio (2026-09-02): *"it should have the exact same height"*. The big half of that complaint is
   FIXED — the name box was mounted `size: 'sm'`, which on `MpiInput` means the NUMERIC size
   (`width: 6ch`, centred, `--t-xs`), while `MpiDropdown` has no `sm` at all and silently ignored
   it. That is gone. The residual 1px and the radius are the two primitives disagreeing app-wide,
   and the fix belongs in `MpiInput.css` / `MpiDropdown.css`, NOT in a consumer override — a
   `.mpi-base-flow__` height rule here would be exactly the chrome-restating the rules forbid.
   **Deliberately left alone: it changes every input and dropdown in the app.**

0. ~~**The title is "Text to Music", not "MiniMax Music 3".**~~ **ANSWERED 2026-09-01 — and the
   answer was NEITHER.** Fabio: *"Text to Music is not a good name for this. It should be called
   Music Maker or Music Generator"*, then chose **Music Maker**. The reasoning the plan had was
   half right — outcome naming, yes, but "Text to Music" names the MODEL'S TASK, not the thing the
   user walks away with, and it only looked right because it rhymed with "Text to Speech". "Music
   Maker" sits in the register Voice Changer and Head Swap already set.
   **SHIPPED, two files, one line each:**
   - `js/data/flowsRegistry.js` — `title: 'Music Maker'`. The `id` is UNCHANGED and stays
     `minimax-music`: `licences.js` keys `MINIMAX_MUSIC3` on `flow:minimax-music` and a lookup
     miss is silent.
   - `js/data/commandRegistry.js` — `label: 'Flow: Music Maker'` **plus** `filePrefix:
     'flowMusicMaker'`. The op KEY stays `flowTextToMusic`: it is referenced in four registries
     plus `operation_registry.json`, and a renamed op id is a tombstone problem (MPI-533), not a
     rename. That is exactly the `flowExtendVideo` / `flowAddFoley` / `flowTTS` pattern — key says
     one thing, `filePrefix` carries the title. Files land as `flowMusicMaker_001.wav`.
   - Verified: 870/870, eslint clean on both files. No other reference to the old title exists in
     `js/`, `tests/`, `docs/` or `operation_registry.json`.
   - 🔴 `js/data/flowsRegistry.js` was under a FRESH MPI-591 write claim (`0928f1f4`) when this
     landed. Not a takeover — the edit is four comment lines plus one string inside the
     `minimax-music` FlowDef, several hundred lines below MPI-591's `ltx-extend` work, and it is
     disclosed to their session as message `c27b08f5`. MPI-664 claims `commandRegistry.js`
     (`54cfe83f`); it claims nothing else.
1. Sign-off on the five-step field surface above.
2. ~~Anything missing from the `Input_Voice` list?~~ **Closed** — the list was signed off, then the
   single dropdown was replaced by the roster outright, so the question no longer applies. The voice
   TYPES a roster row can pick are still the same six (Any / Female / Male / Child / Duet / Choir).

**Settled 2026-08-30:** BPM ceiling is **250**, not 220 — Fabio has mastered tracks at that tempo,
so a 220 cap would clip real material. Do not "tidy" it down to a textbook range.

## Plan Drift

**2026-09-03 — "an instrumental run must send NO lyrics" was one word too strong, and that word
cost the model's strongest channel.** The plan, the injection guard and `sim_caption.py` all
encoded the rule as an EMPTY lyrics slot, because that is how MiniMax's own guidance reads and
because two runs of prose-in-the-lyrics-box had just been sung. What runs 1 and 2 actually proved
is narrower: WORDS get sung, brackets or no brackets. A bare `[intro]` has none. So the true arm
carries wordless tags now, the guard asserts *no word outside a tag* rather than *no lyrics*, and
the bench asserts the same. The old rule is kept in the guard's comment, because reading it as "no
lyrics" is the trap.

**2026-09-02 — this plan's account of how the length is decided was WRONG, and the fix it pointed
at does not exist.** It said `MiniMaxMusic3TextEncode` "derives the real `seconds` from the LYRICS"
and that naming the length in prose was "the only lever that exists". Neither holds: the AR decides
its own length autoregressively and the caption cannot steer it (measured, § 3). The mistake was
reading `seconds` as an input-derived number instead of reading the node source — 40 lines of
`nodes_minimax_music.py` + `ar.py` would have caught it before the plan ever proposed the lever.
Corrected in § 3, with the eight measurements.

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

**2026-09-01 — the FlowDef pass, and the one real bug it turned up.**

1. 🔴 **A declared field with NO `default` is never seeded, so the GRAPH'S BAKED VALUE RUNS.**
   `_seedField` returns `undefined` and both seeding loops skip an undefined, so the id never
   reaches `injectionParams` at all. `Input_Lyrics` and `Input_Caption` are baked with the BENCH'S
   OWN DEMO SONG — a full lo-fi track and its caption — so a user who left the lyrics box empty
   would have heard the bench's words, and one who skipped Enhance would have had their brief
   silently replaced by the bench's caption. Fixed by declaring `default: ''` on all four
   empty-able text fields. The class is general and the fix is one word; the guard below is what
   stops it coming back.
2. **A new generic guard** in `inject-params-titles.test.cjs` — *"every FlowDef field and enhance
   recipe addresses a real node"*. It was the THIRD injection source and nothing checked it: the
   existing dotted-key test reads `PromptBoxControls.js` only. It covers all three failure modes at
   once — a lowercase id that reaches nothing (the `style_custom` class), an `injectionParams` key
   naming a node or widget that does not exist (which would leave Character Sheet's baked recipe
   running), and a missing `default` over a baked value. Derived from the declarations, so a new
   flow is covered by existing. Proven to bite by breaking two keys and watching both fail.
   It found two real things on its first run: `Input_Denoise` is consumed by `ltxSigmasInjector`
   rather than by a node (documented exception, one-entry allow-list) and `Input_Language.language`
   showed field ids can be dotted too.
3. **`Input_Positive` / `Input_Negative` are exempt from the default check** — `_buildParams` writes
   both on every run whatever the flow declares, which is why Character Sheet's undefaulted
   `Input_Positive` is safe and this flow's `Input_Caption` was not.
4. **The FlowDef's own defaults were run through the REAL converted graph** (`bench/sim_caption.py`
   driven by `mapDeclaredValue`'s output, not by hand-typed values). Three cases — fresh open,
   enhanced with a two-voice roster at 78 BPM, and instrumental with the lyrics and roster STILL
   HOLDING their values. All three assemble a well-formed caption, the markers strip out of the
   lyrics, and the instrumental clause swaps in with the lyrics emptied.
