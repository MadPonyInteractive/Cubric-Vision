# MPI-664 — Validation

## 2026-09-01 — the FlowDef, the op and GAP 3

**Verify mode:** `user-ux` for the flow itself (a carousel nobody has seen), `auto` for everything
below. The automated half is green; the UI half is the one remaining gate.

### Automated — PASSED

| Check | Result |
|---|---|
| `npm test` | **852/852**, 0 fail |
| `npx eslint` on every file this card owns | clean, `--max-warnings=0` |
| `node scripts/verify-workflow.mjs` on `flow_minimax_music.json` + `qwen3vl_4b_prompt_enhancer.json` | both ✓ against the ENGINE (48188). The only notes are the three MiniMax weights not installed on that engine, which is expected |
| `node scripts/validate-injection-rules.mjs` on both | both ✓ |

⚠️ `npm run lint` over the whole tree reports ONE error — `MpiSettings.js:67 Parsing error`. It is
**MPI-674's in-flight edit** in this shared tree, not this card's: that file is untouched here and
`eslint` over this card's own files is clean.

### The new guard, proven to bite

`tests/inject-params-titles.test.cjs` → *"every FlowDef field and enhance recipe addresses a real
node (MPI-664)"*. Not trusted because it passed — it was **deliberately broken and watched fail**:
renaming `Input_Text_Gen.max_length` → `Input_Text_Genn.max_length` and `Input_Bpm` → `Input_Bpmm`
produced exactly the two expected failures, one per injection path, and both cleared on restore.

It also caught two real things on its first honest run, before any deliberate break:
- `ltx-upscale: Input_Denoise names no node` — correct and documented; `ltxSigmasInjector` derives
  the schedule from it. Now a one-entry allow-list with the reason attached.
- `chatter-box: Input_Language.language` — a field id may itself be dotted. The guard was wrong, not
  the flow.

### The real bug it prevented

A declared field with no `default` is never seeded, so the GRAPH'S BAKED VALUE runs. `Input_Lyrics`
and `Input_Caption` are baked with the bench's own demo song and caption, so this shipped would have
sung the bench's lyrics to any user who left the box empty, and replaced the brief outright for any
user who skipped Enhance. Fixed with `default: ''` on all four empty-able text fields, and pinned by
the guard above.

### End-to-end, without the app

`bench/sim_caption.py` walks the REAL converted API graph. Driven this time by the FlowDef's OWN
declared defaults, resolved through `mapDeclaredValue` — the same call the widget and the agent
connector both make — rather than by hand-typed values, so the descriptor and the graph are proven
to agree rather than assumed to.

Three cases, all assembling a well-formed caption:
1. **Fresh open** — genre phrase and the default roster only, empty headings dropped.
2. **Enhanced, two-voice roster, BPM 78, custom style** — every fragment lands under the right
   heading, and `<Singer A>` / `<The Choir>` are stripped out of the lyrics while `[Verse]` and
   `[Chorus]` survive.
3. **Instrumental with the lyrics and roster STILL HOLDING their values** — the `hiddenWhen` trap.
   The instrumental clause replaces Vocal Details and the lyrics come through empty, proving the
   graph re-checks the flag rather than trusting the fields to have been hidden.

## STILL UNPROVEN — the live run

Not a formality. Four things close on it and only on it:

1. `hiddenWhen` — `wrap.hidden` plus the CSS override have never run in the app.
2. `format: 'duration'` — no slider has ever rendered a formatted readout.
3. The `voices` roster — no row has ever been added, named or removed live.
4. **Does Qwen3-VL-4B hold the three-marker format?** Nothing has measured it. If it does not, the
   escalation is written down and ordered: tighten the recipe, then split the call one block per
   run, then a bigger model — and that door is narrow (`TextGenerate` takes a CLIP).

ComfyUI has also still never EXECUTED the caption chain — the string half is proven in Python
against the real graph, and structurally by both gates, but no engine has run it.

## 2026-09-02, third session — what the one-box rewrite closed, and what it did not

**Closed on real pixels** (isolated app `:52799`, his `:3000` untouched, killed by ROOT pid):

- `disabledWhen` + `inert` — Instrumental ON leaves Voices and Voice notes `inert: true` and
  `--disabled`, with Instrumental and Lyrics live. Item 3 above is closed with it: the roster
  rendered, and its greyed state is what was observed.
- `hidden: true` — the run slide reports Mood / Vocal / Arrangement `hidden: true` and **zero**
  buttons matching /enhance/. Item 1 is closed by the same paint pass.
- `format: 'duration'` — the slider reads **5:00**. Item 2 closed.

**Closed by pure evaluation of the API graph** (every node between the `Input_*` text nodes and the
encoder is a string op, so the caption is computable without a GPU):

- The brief lands FIRST: `Global Metadata: Dark heavy soundtrack for a horror movie trailer.
  Cinematic orchestral epic, full symphonic scoring. …`
- Instrumental ON replaces the cast with `Instrumental_Clause` **and the lyrics still pass**, which
  is the whole point of deleting `Lyrics_Gate`.
- No caption now contradicts itself — the `choir` phrase is gone from the Cinematic epic style.

🔴 **STILL NOT MEASURED, and it is item 4 above, now sharper.** The 4B's input is no longer one
sentence — it is a labelled block (`Your song:` / `Style:` / `Instrumental`). Nothing proves it
still emits `[MOOD]` / `[VOCAL]` / `[ARRANGEMENT]` under that shape, and the failure is QUIET:
`_writeEnhanced`'s unmarked fallback drops the entire answer into Mood, and the caption ships with
two empty headings the graph strips. **One Generate press in Fabio's own app answers it.**

ComfyUI has still never EXECUTED the caption chain end to end.

## Open decisions carried to Fabio

- ~~The flow is titled "Text to Music"~~ — **closed**, it is **Music Maker**.
- ~~A step whose only field is hidden leaves a ghost step~~ — moot: no step is gated any more.
  🟡 What remains is a different empty slide — `01 Inputs` renders "This flow needs no input media"
  on a flow that declares no `inputSchema`. Pre-existing, not introduced here.
- No preview graphics yet (`/mpi-flow-graphics`), and no `existing-flows/minimax-music.md` — held
  deliberately until the live run, so the page documents what actually happened.

## 2026-09-03, fourth session — THE FLOW RAN ON THE GPU. Two runs, both on Fabio's own card.

### What the runs closed 🟢

| Question | Answer | Evidence |
|---|---|---|
| Does the 4B still emit `[MOOD]`/`[VOCAL]`/`[ARRANGEMENT]` from a labelled block? | **Yes** | engine `/history`, run 1: all three markers, each landing in its own node |
| Does the status go "Writing the description…" → "Generating…"? | **Yes** | 1400-token pass, then `AR sampling 7501` |
| Does the brief reach the model? | **Yes** | `Input_Positive` = the typed sentence |
| Does a second Generate skip the enhancer? | **Yes** | `09:10:39.230 got prompt` → `09:10:39.260 Requested to load MiniMaxMusic3TEModel`, 30ms, no token pass |
| Is VRAM released after the enhance stage? | **Yes, already** | `MpiClearVram` after `TextGenerate` calls `unload_all_models()`; the music TE loaded 1s later evicting nothing |

Items 1–4 of "STILL UNPROVEN" above are all closed. ComfyUI has now EXECUTED the caption chain.

> 🟡 **`unload_all_models()` logs nothing.** The `"N models unloaded."` line is in `load_models_gpu`
> (`model_management.py:981`) and only fires when it must EVICT. Absence of that line is not
> evidence the clear did not run — read the next load's eviction count instead.

### What the runs BROKE OPEN 🔴 — the instrumental path was wrong

**Run 1** — Instrumental on, section tags with prose beneath them. A man sang the stage
directions. **Run 2** — every direction folded INSIDE the brackets, Suno-style. `_LYRIC_TAG_RE` is
`\[[^\]]+\]`, so the shape is legal and the normalizer accepted it — **the model sang those too**
from the verse onward.

**And the deeper cause, which is not the lyrics slot at all.** The enhancer had written a fully
timed rival plan into `[ARRANGEMENT]`:

| Fabio wrote (lyrics slot) | the 4B wrote (caption `Arrangement`) | what played |
|---|---|---|
| intro: single orchestral drum, large reverb tail | *"opens with a single, pulsing sub-bass drone, followed by… muted brass"* | drone + brass |
| verse: drum loses reverb, viola section enters | *"At 1:20, the strings enter in a slow, descending chromatic line"* | strings |
| outro: choir and piano, fading out | *"the strings dissolve… the brass retreats"* | no choir |

**The model was not ignoring instructions — it was obeying the other plan in the same caption**,
and the caption outranks the lyrics slot. `[MOOD]` carried a third timeline of its own. Separately,
`Instrumental_Clause` banned "choir pads" outright while the user asked for a choir.

### The rebuild, and how it was checked

| Check | Result |
|---|---|
| `npm test` | **878/878** |
| `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js` | **13/13** (runner: *"a dev app on 3000 is left alone"*) |
| `eslint` on `flowsRegistry.js` + `inject-params-titles.test.cjs` | clean, `--max-warnings=0` |
| `verify-workflow.mjs` against the engine (48188) | ✓ 47 nodes |
| `validate-injection-rules.mjs` | ✓ |
| `bench/sim_caption.py` | 4/4 cases **asserting**: instrumental → lyrics slot `''`; vocal → tags kept, `<Singer A>` stripped |
| `hiddenFieldIds` off the real `FLOWS` export | exactly one box visible per mode, both directions |

**The guard was reversed, not deleted.** `inject-params-titles.test.cjs` asserted `gates.length === 1`
with the message *"a second gate is the lyrics one coming back, which silently drops the section
prose an instrumental track is steered with"*. That reasoning is what the two runs disproved, so it
now asserts `=== 2` with the disproof written into it. It failed first, on the real change, before
being touched.

🟡 **`bench/sim_caption.py` had been broken since 2026-09-02.** It walked hardcoded node `"78"` —
which WAS the first `Lyrics_Gate` — so it raised `KeyError` on every run after that gate was
deleted. **The "lyrics come through empty" line in the 2026-09-01 section above was therefore never
re-measured after the deletion; it described the pre-deletion graph.** The bench now derives both
the caption and lyrics node ids off the encoder and asserts rather than printing, so it fails loudly
instead of going stale.

### STILL UNPROVEN — the instrumental run

One press answers it, and nothing here can: Instrumental ON, a section plan in the **Song structure**
box. Nothing may be sung or hummed, and the arrangement must follow the user's order rather than
inventing one. The enhancer WILL re-run this time — `Input_Structure` is a cache source — so expect
the 1400-token pass before `AR sampling`.

Read back from engine `/history`: `Input_Arrangement` must contain the user's sections in the user's
order, with **no clock times**, and the music prompt's `lyrics` input must resolve through node 103
to the empty string.

### 🟢 RUN 3, 2026-09-03 — HALF OF THAT IS NOW MEASURED

Instrumental ON, read off the LIVE graph with `GET :48188/queue` while it sampled (`/history` is
empty after an engine restart; `/queue` is how to read a graph still running).

**CLOSED — the lyrics slot comes through empty on a real run.** Node 73 `Input_Instrumental` =
`true` → node 103 `Lyrics_Gate` takes its `true` arm → node 75 `Empty_String` = `""`, and encoder
node 54's `lyrics` is wired to 103. The user's section plan was sitting in `Input_Lyrics` (node 46)
and did not reach the model. This is the first time it has been measured on the GPU rather than in
the bench.

**NOT CLOSED — the arrangement, because the enhancer never ran.** `Input_Arrangement` came back
carrying the previous run's rival plan verbatim, clock times included. The GPU went straight to
12.1/16GB with no ~4GB enhancer stage; one prompt queued since the restart.

**WHY, and it is a REAL DEFECT now fixed:** the card was opened with **Reuse**. `seeded` refills
`_fieldValues` from the sidecar, but `_enhanceWrote` was rebuilt empty at mount — so the three
restored blocks read as the user's own prose, and the "Enhance must never destroy the user's
writing" rule defended them from the enhancer that wrote them. A source edit cleared nothing
(`_setFlowField` skips text it does not own), `_autoEnhance` saw a full target set and skipped, and
`_mayEnhanceWrite` would have refused the button. **After one Reuse the flow could never enhance
again.** Ownership now rides the snapshot: `_collectInputs` emits `enhanceWrote`, `_enhanceWrote`
seeds from `seeded.enhanceWrote`.

**Evidence:** 881/881 unit — 3 new in `tests/flow-enhance-ownership.test.cjs`, pinned as source
contracts because `MpiBaseFlow.setup`'s closure has no DOM to mount in bare Node, the same
constraint `flow-frame.test.cjs` states — 13/13 `tests/desktop/flow-*.spec.js`, eslint clean.

**A sidecar written BEFORE this fix carries no ownership**, so a card reused from one is still
welded. The confirmation run must therefore open Music Maker **fresh**, where every field falls to
`f.default` and the three boxes come up empty.

### 🟢 RUN 4 — THE INSTRUMENTAL PATH IS CLOSED. Fabio, 2026-09-03

Fresh open, Instrumental ON, section plan typed into Song structure. The enhancer re-ran (~4GB
stage, then `MpiClearVram` released it before the music model loaded at 11.9GB).

- **NOTHING WAS SUNG OR HUMMED.** Fabio's own ears, on the finished audio: *"no, it didn't sing."*
  This is what two previous runs failed. **The defect this card spent three sessions on is closed.**
- **The choir appeared as an orchestral texture**, which is what the narrowed `Instrumental_Clause`
  permits and what the old one banned outright. Piano present too.
- **`Input_Arrangement` carried his five sections in his order with no clock times** — verified by
  executing the dispatched graph's string half against `/history`. Caption 329 words, inside
  MiniMax's 250–450 band, three headings, `lyrics` `''`.

**STILL OPEN, and it is a QUALITY problem, not a correctness one: instrument adherence.** He asked
for a viola section, an orchestral drum, a piano and a choir; the model played flutes, a distant
drum, and little else. Two runs (preset style, then custom style) agreed.

**ROOT CAUSE — the recipe asked for the wrong REGISTER.** MiniMax's shipped ComfyUI template
caption is an equipment list in comma-separated fragments, with `Intro:` / `Verses:` / `Bridge:` /
`Outro:` as literal labels and "Rhodes" named in five separate sections. Our recipe opened with
"three prose blocks" and carried the rule *"write musical changes, never an equipment list"* — the
exact opposite of the register the model was trained on. Each instrument therefore reached the
model as ~3 literal tokens inside twenty of metaphor, and it fell back on its orchestral prior.

**RECIPE REWRITTEN** (`MINIMAX_MUSIC_ENHANCE_PARAMS`): caption register not prose, no similes or
metaphors, every instrument named literally and re-named in each section it plays, `[ARRANGEMENT]`
leads with the instrument bed then one labelled line per section, `[MOOD]` carries production
texture, and the model may now name a key and scale (the template has one; no control sets it).
Everything already proven is untouched — the gate, the structure binding, no clock times, no
invented running order.

**Verified:** eslint clean, 881/881 unit, 13/13 desktop flow specs. **Effect on the audio is
UNMEASURED** — it needs one Generate after a reload.

### 🔴 RUN 5 — THE REGISTER FLIPPED, AND "NOTHING IS SUNG" IS NOT DURABLY CLOSED

Same brief and settings as run 4, so a clean A/B. Caption measured off the dispatched graph:
**0 similes** (run 4 had many), "drum" 4× / "piano" 4× / "choir" 4× / "viola" 2× (run 4 named each
once then dissolved it into metaphor), and `Intro:` `Verse:` `Pre-Chorus:` `Chorus:` `Outro:` as
literal labels in the user's own order. 238 words — just under MiniMax's 250 floor.

**🔴 THE CLAUSE DID NOT HOLD.** Fabio: an **opera singer vocalising** — wordless, no words — over
the choir. `Instrumental_Clause` forbids exactly that ("no humming or wordless vocal line standing
in for one"). Run 4's silence was therefore not proof: **the instrumental guarantee is
caption-dependent, and the RUN 4 ENTRY ABOVE OVERSTATED IT.** The suspect is the new register
itself — naming the choir four times with soloist-shaped qualities (`unison, high-pitched, slightly
out-of-tune, harmonic counterpoint`) reads as a lead-vocal instruction competing with the clause.

**🔴 A FEW-SHOT LEAK, and it was in the recipe as written.** The REGISTER rule illustrated itself
with a literal string — *"cracked snare with lazy swing, brushed hi-hats, low round sub bass"* —
and the 4B copied it straight into the Intro, putting a lo-fi hip-hop kit on top of the user's
single orchestral drum. **Never put a copyable instrument name in this recipe.**

**Fixed in three rules:** the example is gone (abstract description of the register instead) plus
*every instrument must come from the user*; on an Instrumental brief a choir is an ensemble texture
described by register and blend, never with soloist qualities; and where a Song structure is given
**the instrument list is CLOSED** — no instrument the structure does not name, in any block. That
last one also targets the standing complaint across runs 3–5: the model keeps adding a flute.

eslint clean, 881/881. **Unmeasured on audio.**

### 🔴 THE CEILING IS THE MODEL, AND FABIO PROVED IT WITHOUT OUR CODE — 2026-09-03

**The caption is no longer the variable.** After four recipe iterations the enhancer's output passes
every check this card set: sections in the user's own order and names, per-section lines all
different, instrument list closed to the four he named (no flute, no synth pads, no harp, no
timpani), choir described as texture, `[MOOD]` free of instrument names, zero similes, `lyrics` `''`.
Verified by executing the dispatched graph's string half, and the recipe version that ran was
verified by reading `Input_System_Prompt` out of the enhancer's OWN dispatched graph rather than
assumed — **that read is the way to prove a reload took**; three runs today were wasted judging a
recipe the renderer had not picked up.

**The audio still does not follow it.** That run: a woman vocalising on an INSTRUMENTAL brief (the
clause has now failed 2 of 3 instrumental runs), one drum, some percussion, 51s.

**THE CONTROL EXPERIMENT — Fabio's, in raw ComfyUI, none of our code in the path.** He hand-wrote a
caption in MiniMax's own template shape (`140 bpm A minor psychedelic EDM trance`, tribal
percussion, 303 lead, native American singing in the bridge) and ran it directly against the node.
He got: no native American singing, no vocal percussion, a different synth, and a cheesy EDM build.
**Same adherence failure, no enhancer involved.** Our pipeline is exonerated; further prompt tuning
is bargaining with a model that is not listening.

**This is NOT the escalation validation.md ordered** (tighten → split the call → bigger model). That
was aimed at the 4B enhancer, and the 4B is now performing. The remaining failure is MiniMax Music 3
itself.

**Candidate raised by Fabio: Stable Audio 3** (`docs.comfy.org/tutorials/audio/stable-audio/`).
From the doc: three variants (Small-SFX, Small-Music, Medium), **Small up to 2 min and Medium
~6:20** — both beyond anything MiniMax has given us; **an explicit duration parameter**, which is
the length control § 3 measured as unobtainable here; **licensed for commercial use, trained on
fully licensed music data**. No lyrics/vocals documented, so it is INSTRUMENTAL-ONLY on the
evidence — it would not replace Music Maker's singing, it would sit beside it. **Next step costs
nothing: run the same brief in raw ComfyUI and judge adherence before any wiring.**

### 🟢 THE FIRST VOCAL RUN EVER — AND IT REWRITES THE DIAGNOSIS. 2026-09-03

Instrumental OFF, roster `Singer A (Female)`, voice notes, five tagged sections with real words,
cut-off 2:00. **Fabio: "spot on. It did not miss a single line that we asked. It did the chorus
properly."** It added an unrequested intro and was moving into a saxophone solo when the cut-off
fired at 1:59 — **the guillotine binding exactly as § 3 measured**; 2:30 would likely have let it
finish. Mood and voice both correct.

**Plumbing verified on this run, all first-time:** the lyrics reach the encoder intact with every
section tag, `<Singer A>` markers are stripped by `Strip_Voice_Markers`, and `Singer A (Female)`
plus the voice notes land in Vocal Details through the roster path.

**🔴 THE FINDING, AND IT REFRAMES EVERY INSTRUMENTAL FAILURE ON THIS CARD.** That run sang over a
caption whose `Arrangement` was the previous INSTRUMENTAL brief's horror-trailer plan — orchestral
drum, viola section, choir — leaked in through `Input_Structure` (hidden but still an enhancer
source; fixed the same day, and the fix is UNTESTED because this run predates it). The caption also
said `no soloist, no lead voice`. **The model delivered a lead female ballad with a saxophone and
none of the horror instrumentation.** So, per block:

| Block | Honoured |
|---|---|
| `Global Metadata` — genre, mood, BPM | **yes** |
| `Vocal Details` — voice type, timbre, delivery | **yes** |
| `Arrangement` — per-section instrumentation | **NO** |
| Lyrics field | **yes, precisely** |

**On an instrumental run, 100% of the user's intent is in `Arrangement`** — Vocal Details is
boilerplate and Lyrics is empty by design. Every instrumental failure this card chased (flutes, no
808, missing violas, unrequested vocalising) is that: the intent was posted through the one channel
this model discounts, while the two strong channels sat empty or generic. It is NOT "the model is
bad at instrumentals" and it is NOT a caption-register problem — the register work was still worth
doing, but it was tuning the wrong door.

**This makes the bare-tags proposal the load-bearing change**, not a nicety: put the user's section
names into the LYRICS slot as wordless tags (`[Intro]`, `[Verse]`, …, `[Instrumental]`, all in
MiniMax's official set) on an instrumental run, so the structure travels the channel the model
actually follows. Nothing there can be sung — there are no words. Mood and style keep working where
they already work, in `Global Metadata`.

### 🟢 BOTH FIXES VERIFIED IN THE APP, AND THE FLOW PRODUCED A TRACK FABIO LIKES — 2026-09-03

Same vocal brief, cut-off raised to 2:30, run after a reload. Caption read off the dispatched graph:
`Arrangement: piano: legato, low register, muted tone… strings: low register, sustained, bowed,
barely audible…` — **piano and strings only. Zero drum, viola or choir.** The hidden-source leak is
closed, and no section lines were invented because no structure was given. 88 words.

**Fabio on the audio: "drum kit, piano, and her voice, slow, jazzy, dark… She said everything. The
song finished… Catchy tune."** Every lyric line delivered. `flowMusicMaker_014.flac`, **1:55**.

**LENGTH, CONFIRMED TWICE OVER.** The previous run ended at **119.99s against a 2:00 cap** — the
guillotine landing on the frame. This one had 2:30 of headroom and stopped at **115.8s by itself**.
The control behaves exactly as § 3 measured; raising the cap is the whole answer.

**REFINEMENT of the block table above: `Arrangement` is LOOSELY honoured, not ignored.** What it
names tends to appear — the piano did, and the strings were *"so sub I barely noticed"* against a
caption that said `barely audible` — but the model adds freely: a drum kit arrived that appears
nowhere in the caption. So the ranking is Lyrics ≫ Global Metadata ≈ Vocal Details > Arrangement,
and an instrumental run still puts all its intent in the weakest of the four.
