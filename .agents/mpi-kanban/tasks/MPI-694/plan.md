# MPI-694 — TWO FLOWS, TWO ENGINES, TWO DEP SETS

**The one-flow design was written on 2026-09-05 and REVERSED by Fabio the same day, before a
line of it was built.** Read `brief.md` first (licences + the measured VRAM facts — unchanged
and still binding), and `../MPI-664/research/stable-audio-3-bench.md` for every bench fact.

## Current State — 2026-09-10, FABIO SAYS THIS CARD CAN CLOSE

🟢 **"694 can be closed"** (Fabio, 2026-09-10), and he has cleared the licence gate himself in
another test. Nothing buildable is left.

🔴 **THE TWO RELEASE OBLIGATIONS DO NOT CLOSE WITH THE CARD, and that is consistent rather than
a conflict** — both were always recorded as blocking a RELEASE, not a build:
1. **Registration with Stability** — §III, any Commercial Purpose, NO revenue floor.
2. **The Gemma §3.1 EULA clause** — §3.2's restrictions as an enforceable provision in our own
   terms, not only in the dialog.
They live in the `STABLE_AUDIO_3` comment block in `js/data/modelConstants/licences.js`, which
survives this card. **Whoever closes it must confirm they still do** — a closed card is where an
obligation goes to be forgotten.

🟡 **THIS CARD HAS NO `validation.md`** (MPI-664 has one). Close-out resolves a card against a
validation record, so that wants writing before it moves.

## Current State — 2026-09-09 (later), THE DOCS SHIPPED. Nothing is left but two decisions.

🟢 **BOTH `existing-flows` PAGES ARE WRITTEN** — `song.md` and `sound-and-music.md`, 200 lines
each (the `docs/README.md` budget, so a line has to come out before one goes in). 🔴 **THE
HANDOFF'S PREMISE WAS WRONG:** it called this a rename of
`docs/playbooks/add-flow/existing-flows/minimax-music.md`. That file has never existed in any
commit — MPI-664 shipped the MiniMax flow with no page at all, so this was two new writes.

🟢 **ONE STALE COMMENT FIXED**, and it was this card's own drift: `universal_workflows.js` still
said the Stable Audio graph was `19 nodes` with "the plain/tiled decode pair Music Maker already
uses", both untrue since the Low VRAM removal (`08f8e085`). Now 17, with the reason inline.

🟡 **`js/data/modelConstants/universal_workflows.js` ALSO SAYS "Forty-six nodes" FOR
`flowTextToMusic`, and the graph has 49.** Not this card's drift and NOT touched — flag it to
whoever next opens MPI-664.

Still open, and neither is a build item: the two release blockers (Stability registration §III,
the Gemma §3.1 EULA clause), the three optional experiments, and Fabio's call on the 15.69 GB
`qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`.

## Current State — 2026-09-09, THE GRAPHICS SHIPPED. No build item is left on this card.

`8c4754d1` + `a9efcfa2`, both in `origin/master`. Both flows now carry `preview`/`video`;
neither tile falls back to a gradient any more.

🟢 **SONG — off `flowMusicMaker_013`, a real 120s run already on disk** ("Don't wake the
morning", `<Singer A>` female, 75 BPM). No GPU spent. Both assets lead on the LYRIC-SHEET
grammar (`[Chorus]` in heat, `<Singer A>` in frost) because a line-of-type-over-a-waveform is
already Chatter Box's tile AND Drama Box's, and a third would have been invisible inside the
family. Hero writes the sheet a group at a time, draws the track under a heat playhead, returns
to the bare page. 33,576 B / 111,115 B, 7.2s, loop seam 0.006/255. The band is a 12s excerpt on
purpose — the whole two minutes averages into a flat pink brick at 220px.

🟢 **SOUND & MUSIC — four NEW runs, one per category** (Fabio cleared the GPU 2026-09-09; the
old clips died with the deleted throwaway project and nothing survived on disk). Durations
MEASURED off the files: **10.031 / 10.031 / 4.087 / 2.043s** for 10/10/4/2 asked — the exact-length
claim is verified, not assumed. Both assets are a TIME RULER, not lanes: a row's width IS its
length, frost tick where each stops. That is deliberate distance from Stems, whose tile is five
EQUAL lanes of one track — four labelled lanes here would have been the same picture with
different words. 31,174 B / 74,935 B, 8.0s, loop seam 0.013/255.
Source audio lives in an EPHEMERAL scratchpad project
(`…/998b35a5-…/scratchpad/mpi694-art/MPI-694 Flow Art/Media/flowSoundMusic_00{1..4}.flac`) —
**if the art must ever be rebuilt, that audio has to be re-made or moved somewhere durable
first.** Prompts and settings are in `sam-runs.json` beside it.

🔴 **A PLAYBOOK TRAP WAS FOUND THE HARD WAY and is now in the trap table:** an element bigger
than the viewport screenshots with the unpainted region PURE BLACK, correct dimensions, no
error. It put a tile with a black top third into the live Flow Library before it was caught.
Resize the viewport larger than the element, then assert a known-ground pixel at each edge.

🟡 **`js/data/flowsRegistry.js` WAS CO-EDITED** — a peer's `op: 'promptEnhance'` removals
(MPI-677) sat unstaged in the tree while this card committed. Kept out with content-anchored
hunk staging + `git commit -n`; they have since landed as `2558895c`. `mpi-message`
`40302890-dd95-4cb0-b061-9f85c18f15ed` records it.

Everything below this block is the 2026-09-05 state, kept because its findings still hold.
The delta since: the licence gate SHIPPED, both arms RAN for real in Fabio's own app, three
things Fabio changed after seeing them running, and the weights moved to R2.

🟢 **THE LICENCE GATE SHIPPED (`b246c968`, fix `15143dcc`).** ONE descriptor, not two, and
the architecture forces it: the gate fires per INSTALL KEY and all three weights install
under the single `flow:sound-and-music` dep key (`requiredModels: []`), so a second
descriptor could never be keyed there. Both agreements live in `STABLE_AUDIO_3`, bundled
under `licences/stable-audio-3/` — `LICENSE.txt` byte-identical to what
stabilityai/stable-audio-3-medium serves (11,852 B), `GEMMA-TERMS.txt` the text of
ai.google.dev/gemma/terms (Google publish it as a web page; no repo we pull from carries a
LICENSE file), `NOTICE.txt` carrying both required strings verbatim. `poweredBy` is
"Powered by Stability AI". One new field, `alsoLicensed`, is the only code: a descriptor can
carry a second agreement, rendered as its own link in the gate AND in `flowLicences.js` —
"provide a copy" is not discharged by naming the second one. Fabio saw it fire on his own
install and accepted it.

🟢 **BOTH ARMS VERIFIED LIVE, and the engine log names the checkpoint each one loaded** —
`StableAudio3` staged **875 MB** for SFX (small_sfx) and **2771 MB** for Music (Medium),
with `SAT5GemmaModel` 537 MB shared by both. Durations exact on the app path, not just the
bench: 4 → 4.087s, 10 → 10.031s, 2 → 2.043s. `volumedetect` max −3.5 / −1.5 / −9.1 dB.
Sidecars carry `flowId` + `flowInputs`, so Reuse works. The throwaway project was deleted
at Fabio's word.

🔴 **THREE CHANGES FABIO MADE AFTER SEEING THEM RUN (`08f8e085`) — do not undo any:**
1. **Low VRAM is GONE from Sound & Music**, control and graph. Copied from Music Maker's
   shape, where 13.3 GB of MiniMax weights make it real; here the whole graph stages ~6.5 GB
   and the four-arm bench already found chunked decode saves nothing on peak while costing
   +15s at 60s. `VAEDecodeAudioTiled` and its `MpiIfElse` came out of `raw/`, re-converted:
   19 nodes → 17, plain decode feeds `MpiClearVram` directly. Verified by a real run after.
2. **The Song placeholder names a SUNG song** — the horror-trailer line was an instrumental
   brief, which belongs to the other flow now.
3. **Neither description names the other flow.** Read from inside a flow, "for sung songs,
   use Song" hints songs might be an option here.

🟢 **THE WEIGHTS SERVE FROM R2 (MPI-705, `f66286bb`, card DONE).** HF measured ~1%/min on
Fabio's line — ~100 minutes for the flow whose appeal is being small. All three uploaded to
`cubric-models`, verified byte-exact by `rclone lsl` and a public HEAD, `url` swapped to
`models.cubric.studio` with the Comfy-Org HF urls kept as `mirrorUrl`. `release:deps`: all
305 URLs reachable.

**Next action: `/mpi-flow-graphics` for BOTH flows** — the 4/5 tile and the wide hero clip
each. Neither has `preview`/`video` today; both render sites guard on the key so the tiles
fall back. That is the last build item on this card.

---

## Current State — 2026-09-05, both flows BUILT and every gate green

**Fabio settled the names and the no-enhancer default in one line: "Song and Sound & Music,
no announcer, go."** Both flows exist, `MPI-694` is in `doing`, nothing is committed yet.

Done: Flow A stripped back to lyrics-only and retitled; Flow B's 19-node graph authored in
`raw/`, converted against the live bench and installed; the op registered in all four files;
the `FlowDef` written with no `steps` (intro + run slide is the whole flow); three dep
entries with HF-verified hashes. 23/23 injection guard, 902/902 `npm test`, 13/13 desktop
flow specs.

**THE ONE BUILD ITEM NOT DONE: the licence gate in `licences.js`.** It is not a stub-and-move
job — the pattern is `licences/<id>/LICENSE.txt` + `NOTICE.txt` bundled verbatim plus a
`sections` entry, and a paraphrased licence is worse than none. **A lookup miss is SILENT**,
so until it lands this flow downloads 11.81 GB of licensed weights with no gate shown.

**Next action:** wire the licence gate, then Fabio's first Generate.

🔴 **FABIO CONFIRMED THE GATE, 2026-09-06: *"let's display it just like we're displaying
other licences."*** So it is TWO entries, not one — the **Stability AI Community License**
covers both checkpoints, and the **Gemma Terms of Use** covers `t5gemma_b_b_ul2` (T5Gemma is
named in the Gemma Appendix). Follow `MINIMAX_MUSIC3` in `licences.js` exactly: a `licences/
<id>/` folder holding `LICENSE.txt` + `NOTICE.txt` **verbatim**, a `sections` entry, a
`poweredBy` string, and the map key. Every verbatim string and section is already
transcribed in `brief.md` § GATE 1 — do not re-read the licences.

🟢 **THE GPU IS AVAILABLE (Fabio, 2026-09-06).** That clears the first real Generate on
`Sound & Music`. It does NOT carry past this session — ask again next time.

Three facts found while building that are not obvious from the diff:

1. 🟢 **Flow A needed NO graph edit.** The shipped graph already bakes
   `Input_Instrumental: false` and `Input_Structure: ""`, so removing the two fields leaves
   the false arm running and `Lyrics_Gate` in place. The injection guard runs field → node,
   never node → field, so a graph node with no field is invisible to it.
2. 🟢 **The category dropdown is ONE node.** `MpiTextContains` (whole-word,
   case-insensitive) with `words: "Music, Instrument"` turns the four option strings into
   the checkpoint decision — no switch bank, no index to drift.
3. 🔴 **`tests/flow-output-filename.test.cjs` catches a retitle.** It compacts the title and
   compares it to the file prefix, so `Music Maker` → `Song` forced `filePrefix` AND `label`
   to move, and `Sound & Music` had to be `flowSoundMusic` (the guard drops punctuation, so
   spelling the ampersand out fails). The op KEYS did not move — `flowTextToMusic` is a
   tombstone.

## Plan Drift

**2026-09-05 — the whole "one flow, five outcomes, one 30.92GB gate" design is SUPERSEDED.**

> *"Right now, what we already have built, the flow that we have built for Music Maker, is
> practically minimax… I think this could be two separate models… Let's do one flow that is
> called something like 'lyrical song'… Another flow is called 'Music and SFX'… This way, we
> keep dependencies separate as well, and we avoid complicated UIs. The user might just want to
> do backing tracks and sound effects, and not do any songs… We drop the instrumental case for
> Minimax, considering it's crap anyway."*
> — Fabio, 2026-09-05

Nothing had been built, so this costs nothing but the plan. **Dead on arrival:** stage 0
(`Input_Outcome`), the five-arm dropdown, the `hiddenWhen` cascade across stages, the single
30.92GB `requiredDeps` gate, the fourth `CAPTION` marker in `enhance.to`, and the merged graph.
Do not resurrect any of it.

**What survives, and is not re-derived:** the licence reading (`brief.md` § GATE 1), the
measured VRAM arms, the three new dep ids and sizes, the checkpoint split, `MpiIfElse`'s
laziness, and the bench's KSampler settings.

## The two flows

| | **Flow A — the song flow** | **Flow B — the sound flow** |
|---|---|---|
| card | MPI-664 (shipped, `doing`) | **MPI-694 (this card)** |
| id | `minimax-music` 🔴 UNCHANGED | new |
| title | *TBD — "Song"?* | *TBD — "Music & SFX"?* |
| engine | MiniMax Music 3 | Stable Audio 3 |
| deps | 18.22 GB (3 MiniMax + enhancer) | **11.81 GB** (2 checkpoints + T5Gemma) |
| length | a guillotine, not a control | **exact to ~80 ms** — a real slider |
| stages | 1 step + run slide (shipped) | **intro + 1 step**, and that is all |

🔴 **`minimax-music` STAYS `minimax-music`.** `licences.js` keys `MINIMAX_MUSIC3` on
`flow:minimax-music` and **a lookup miss is SILENT** — a rename installs 13.3 GB of licensed
weights with no gate shown. A retitle is a `title:` edit and nothing else.

🟢 **Separate `requiredDeps` is the whole point of the split.** A user who only wants sound
effects pays 12.68 GB, not 30.92. The enhancer (`qwen3vl-abliterated-clip`) is shared and the
dep system dedupes, so a user with both pays for it once.

## Flow A — drop the instrumental case

Scope on MPI-664, small and subtractive:

1. **`Input_Instrumental` (toggle) and `Input_Structure` (Song structure box) leave the UI.**
2. `enhance.from` drops both ids. `from` is the cache key, so this is a behaviour change, not
   just a list edit.
3. **Retitle** — `title:` only. `id`, `operation`, `workflow`, `filePrefix` all stay.
4. **The graph is left wired.** `Lyrics_Gate`, `Instrumental_Clause`, `Bare_Tags` and the
   `MpiSimpleBoolean Input_Instrumental` node stay in place with the boolean baked `false`;
   with no field to inject, the false arm runs and the lyrics slot passes through.
   🔴 **Do NOT delete `Lyrics_Gate`.** Deleting it on 2026-09-02 is what made a man sing
   Fabio's stage directions. Dead-but-wired costs one unexecuted node; ripping it out costs a
   defect that has already happened once.
   🟢 **Checked: the guard runs field → node, never node → field.** It asserts every declared
   `injectParams` title exists in the graph; a graph node with no field is invisible to it. So
   dropping the two fields cannot break `tests/inject-params-titles.test.cjs`.
5. **Fabio's bench verdict (`../MPI-664/validation.md` § FABIO'S VERDICT) is now moot for the
   instrumental half** — the arm it judged no longer exists. The finding that *bare tags carry
   order and count, and no content* stays true and stays written down; it just stops being a
   thing to act on.
6. The owed live Generate on MiniMax is now a **lyrics** run. Only Fabio can press it
   (`_submitFlow` → `resolveFlowFieldValues` rejects the enhancer targets, so an
   agent-dispatched flow gets an empty caption).

## Flow B — the new flow

**Two stages, and Fabio said so plainly: an intro, then one small step.**

| stage | contents |
|---|---|
| **0 — intro** | the standard step-0 explainer. No input media (text is the whole input) |
| **1 — the step** | the prompt box · a `select` for the category · a **length slider** · `Input_Low_Vram` · Generate |

### The category dropdown → the checkpoint

Stability's own `CustomCombo`, verbatim, minus the arm MiniMax keeps:

| option | checkpoint |
|---|---|
| **Music** (backing tracks, instrumentals) | `stable_audio_3_medium` |
| **Instrument** | `stable_audio_3_medium` 🟡 |
| **Sound effect** | `stable_audio_3_small_sfx` |
| **One-shot** | `stable_audio_3_small_sfx` |

🟡 **`Instrument` on Medium is a guess, not a measurement** — it is there because it is tonal.
`small_sfx` made the three clips Fabio approved first (door slam, 1.5 s dry stick, rain with
thunder); Medium is what he judged music on. One switch arm to change; change it when someone
listens rather than arguing it now.

🟢 **`MpiIfElse` is genuinely lazy** (`if_else.py:18`, both arms `"lazy": True` +
`check_lazy_status`), so **the unpicked checkpoint is never loaded**. Select the MODEL through
`MpiIfElse`, never through `MpiAnySwitch` — a non-lazy switch would load both.
`MpiCompare` takes `*` on `a` and `b`, so a string compare against an `MpiText` constant is the
boolean that drives it.

### The length slider — the control MiniMax cannot have

Measured exact to ~80 ms across a 16× range, three points. Defaults by category are a nicety,
not a requirement: **one slider, default 10 s**, and add per-category defaults only if the
single default annoys someone.

### 🔴 The announcer does NOT ship on Flow B (default, and cheap to reverse)

Stability's blueprint carries a reprompter with 47/80/58/36 worked examples per category. Ours
does not, for now: it would add 4.88 GB to a flow whose whole appeal is being small, and a 4B
rewriting *"door slam"* is more likely to hurt than help. The prompt goes straight to
`CLIPTextEncode`. **Add it when a listen shows the raw prompt falls short** — that is one
`enhance:` block plus one dep line.

🔴 **If it is ever added, it stays a SEPARATE `promptEnhance` dispatch.** Collapsing the
announcer into the audio graph is Stability's single-subgraph shape and it costs **5.9 GB**
(12.35 → 6.4 GB measured across four arms, `../MPI-664/bench/stable_audio_vram.mjs`). Our
architecture already splits them; do not undo that by copying their blueprint.

### The graph

A NEW workflow file — a `FlowDef` has exactly one `operation` and one `workflow`
(`docs/playbooks/add-flow/01-descriptor-and-ops.md`), so Flow B cannot share
`flow_minimax_music.json`. Build it from Stability's blueprint:

`CheckpointLoaderSimple` ×2 behind `MpiIfElse` · `CLIPLoader(t5gemma, type: stable_audio)` ·
`CLIPTextEncode` ×2 (positive + negative) · `EmptyLatentAudio` · `KSampler(8 steps, cfg 1.0,
lcm/simple — copied from their widgets, do not retune)` · `VAEDecodeAudio` /
`VAEDecodeAudioTiled` behind an `MpiIfElse` on `Input_Low_Vram` · `MpiClearVram` ·
`SaveAudioAdvanced` titled `Output_Audio`.

🟢 The local bench (`:48188`) is up and its `CLIPLoader` already offers `type: stable_audio`, so
the graph converts offline — **no GPU needed to build or convert it**.

🔴 Author in `comfy_workflows/raw/`, then
`COMFY_URL=http://127.0.0.1:48188 node scripts/workflow-to-api.mjs <raw>` to stdout, diff,
install. Never hand-edit the built twin.

### Registration

- **The op in 4 files** — `commandRegistry.js` (`mediaType: MEDIA_TYPE.AUDIO`,
  `requiresImages: 0`, `universal: true`, an explicit `filePrefix`), `operationRegistry.js`,
  `operation_registry.json` (hand-maintained superset, NEVER regenerated),
  `universal_workflows.js`.
- **The `FlowDef`** in `flowsRegistry.js` — `requiredModels: []`, the three deps in
  `requiredDeps`, `mediaType: 'audio'`, no `inputSchema.media`.
- **Three dep entries** in `assetDeps.js` — `stable-audio-3-medium` (8.59GB),
  `stable-audio-3-small-sfx` (2.11GB), `t5gemma-b-b-ul2` (1.11GB). From `Comfy-Org`, not
  gated, URLs baked into Stability's own blueprints.
  🟡 **Those are the app's own 1024-based figures**, derived by `computeDepHashes.py`'s
  formatter from the measured `bytes`. HuggingFace displays the same three files as
  9.22 / 2.27 / 1.19 GB decimal, which is where this plan's earlier "12.68 GB" came from.
  Same bytes, different base — **11.81 GB is what the install gate will show.**
  🔴 **Never type the sizes** — `computeDepHashes.py --sizes` (`size` is parsed 1024-based;
  HuggingFace displays decimal). 🔴 **A truncated download exits 0** — verify every one against
  the `lfs.sha256` the HF API exposes. It already bit this card once (2.91 of 4.55 GB).
- **The licence gate** in `licences.js`, keyed on the new flow's `flowDepKey`. A lookup miss is
  silent, so the gate simply never shows.

## Verification

**Verify mode:** `user-ux` — Fabio judges the audio and the two flow tiles.

- `node --test tests/inject-params-titles.test.cjs` — every `Input_*` node has a field.
- 🔴 `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js`
  (13 tests, ~1.4 min) **before any push touching `flowsRegistry.js`**. `npm test` does NOT
  cover `tests/desktop/`, so a collision surfaces as a red master on somebody else's card
  (message `dc6b2779`; it cost four hours on 2026-09-02).
- The smoke runner `--plan` FIRST — it prints the set and its GB and spends nothing. The smoke
  volume has **25.8 GB free** and the new set is 12.68 GB (MPI-695, peer message `65ea3341`).
- 🔴 **ASK FABIO BEFORE ANY GPU WORK.** `gpu_lease.py` is blind to generations he starts
  himself; one measurement was already ruined that way.

## Before release — five licence obligations

Full reading in `brief.md` § GATE 1. None blocks the build; all five block a release: register
with Stability (no revenue floor) · a `Notice` file with both verbatim strings · both licence
copies bundled · **"Powered by Stability AI"** displayed · an enforceable Gemma §3.2 clause in
our terms. End users are covered by us (§III, integrated end user product); neither licence
restricts by territory and neither bars outputs.

## Open

- 🔴 **The two titles.** Fabio offered "Song" / "lyrical song" / "song with lyrics" and
  "Music and SFX" without picking. Flow A's `title` is currently `Music Maker`.
- 🟡 `Instrument` on Medium vs `small_sfx` — one switch arm, untested.
- 🟡 A direct A/B against MiniMax on one instrumental brief.
- 🟡 Does the reprompter beat a hand-written prompt? Every clip judged good so far was made
  with it **off** — which is the evidence behind shipping Flow B without one.
- ✅ ~~Preview graphics for BOTH flows~~ — DONE 2026-09-09, `8c4754d1`.
- 🟡 `docs/playbooks/add-flow/existing-flows/minimax-music.md` needs renaming to match `Song`,
  plus a sibling page for Sound & Music. **The only doc item left on this card.**
- 🟡 An agent-dispatched flow gets no caption (`agentDispatch.js:_submitFlow` vs
  `MpiBaseFlow._run`) — worth its own card.

## Do NOT re-open

Track length, the `@` picker, the MiniMax enhancer recipe, `medium_base` (the fine-tuning base,
not the quality ceiling), or the MiniMax channel hierarchy (Lyrics ≫ Global Metadata ≈ Vocal
Details > Arrangement, measured across seven runs).
