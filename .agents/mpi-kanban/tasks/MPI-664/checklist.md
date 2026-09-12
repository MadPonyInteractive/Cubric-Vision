# MPI-664 Checklist

Design settled 2026-08-30 (hybrid). See `plan.md` for the full field surface and the reasoning.

## Design

- [x] Caption approach chosen — **hybrid**: dropdowns write the deterministic blocks, the LLM writes prose only
- [x] "Where does an LLM run" answered — Vision already ships one (`promptEnhance` op, universal, caller-injects its recipe). Not blocked on Cubric Prompt
- [x] Style taxonomy sourced — MiniMax's own 18 families, from the skill's `genre-router.md`
- [x] Caption schema captured — 3 headings, 11 sub-labels, 250–450 words
- [x] Licence position settled — take the schema and taxonomy, never MiniMax's template prose
- [ ] Field surface reviewed by Fabio (`plan.md` § The five-step field surface)
- [x] **Bench test: does MiniMax honour per-section voice stated in the caption? — PASSED** 2026-08-31.
      Gated the whole roster. Caveat: the choir bleeds into the solo material, so the copy must say
      *steer*, never *assign*
- [x] Bigger text encoder ruled OUT — `pruned_bf16` (16.71 GB) stages 15.9 GB onto a 16 GB card and
      runs ~9× slower; unshippable on the target card regardless of quality. Do not retry

## Frame work (new, portable)

- [x] `hiddenWhen` clause in `declaredFields.js` + `_paintFieldConstraints` — extends the MPI-663 constraint path
- [x] `format: 'duration'` on `slider` — seconds rendered as "1 minute 2 seconds"
- [x] Both promoted into `docs/playbooks/add-flow/ui/carousel-frame/fields.md`
- [ ] The painter's DOM half proven in the app — unit-verified only until a FlowDef declares a rule
- [x] `voices` field type — a new branch in `buildField`, the roster itself (tier 2). Composes
      MpiInput + MpiDropdown + MpiButton, no new Primitive. Serialises through `mapDeclaredValue`
      (`serialiseVoices`), so the agent connector shares the widget's path. 819/819, lint clean.
      **DOM half still unproven in the app** — no FlowDef declares it yet, same caveat as
      `hiddenWhen` and `format: 'duration'`; all three close together on the live run
- [x] `@` picker — BUILT 2026-09-10, but **NOT** the way this line proposed. Onto `MpiInput`
      would have given it to every declared text field in every flow; Fabio's answer was
      *"only the lyrics box gets it"*, so it is opt-in per field (`mentions: 'Input_Voices'`)
      via a new `js/utils/mentionPicker.js`. It inserts a VOICE (`<Singer A>`), not a ref tag.
      `matchRefTagQuery` was indeed reusable verbatim. Checks: 9/9 new + 917/917 + 13 desktop.
      🟢 **VERIFIED IN THE APP** — Fabio, 2026-09-10: *"The @ symbol now works."* Lists
      `man (Male)` / `woman (Female)`, inserts `<man>` on its own line. One bug in between:
      `MpiButton`'s `label` is ICON-mode only, so text-mode rows mounted EMPTY and silent
      (`text` is the prop). 🟡 Cosmetic and open: the popup covers the step title.

## Deps and licence (GAP — not in the original plan)

- [x] Flow shape settled against the playbook: no-model, media-free, `mediaType: 'audio'`, no
      uiComponent. Does NOT need `/mpi-add-model` — the Voice Changer "flow with deps" precedent
- [x] Three `assetDeps.js` entries — `minimax-music3-dit` (4.58GB), `minimax-music3-text-encoder`
      (8.57GB), `vae-minimax-music3-dav` (206.66MB), all from `Comfy-Org/MiniMax-Music-3`.
      **13.34GB total, not 14.33GB** — the plan's figures were HuggingFace's DECIMAL display and
      every consumer here parses `size` as 1024-based. Measured by `--sizes`, never typed
- [x] `sha256` for each (`/mpic-compute-dep-hashes`) — 3/3 written from HF `X-Linked-ETag`
- [x] `requiredDeps` on the FlowDef lists exactly those three
- [x] Licence entry in `licences.js` — `MINIMAX_MUSIC3`, keyed **`flow:minimax-music`**, not a model
      id: the Flow Library installs flow deps under `flowDepKey(id)` and `downloadService.start()`
      keys the gate on whatever it is handed, so gating a no-model flow cost ZERO code. NO territory
      bar (unlike H3), and §1 obliges a bundled copy — `licences/minimax-music3/{LICENSE,NOTICE}.txt`
      (7,373 bytes, byte-identical to HF). The field is `poweredBy`, not `attribution`
- [x] **Fabio's call: WHERE the attribution shows — the About page.** Settled 2026-08-31, and it
      settles the Model Library drawer out too: a user can install and run this whole flow from the
      Flow Library and never open the Model Library, so `poweredBy` there would be the WRONG surface,
      not merely a missing one. The `credit` block on the three deps is what discharges §3.1 —
      MpiAbout derives Credits from DEPS, reachable however the weights arrived. `poweredBy` kept as
      a record. MpiAbout's intro copy corrected: it said "Style and control models" over a list that
      already held Chroma, Juggernaut, MiniMax-H3 and other base checkpoints

## Graph — DONE 2026-09-01

- [x] `comfy_workflows/raw/flow_minimax_music.json` authored from the bench workflow (15 → 46 nodes),
      converted against the **engine** (48188) to `comfy_workflows/flow_minimax_music.json`.
      `verify-workflow.mjs` and `validate-injection-rules.mjs` both green; the only notes are the
      three MiniMax weights not installed on the engine yet, which is expected
- [x] `StringConcatenate` chain assembles the 3 blocks around the LLM's prose (GAP 4 option B)
- [x] ~~Style/tempo/vocal switch banks~~ — **`MpiAnySwitch` holds 5 arms and `MpiAnySwitch10` holds
      10; 18 style families do not fit either.** `Input_Style` is an `MpiText` whose injected value
      IS the genre phrase — the same shape `serialiseVoices` already established on this card for
      the roster ("an option's `v` IS the caption word, not an index"). Plan correction, see
      `plan.md` § The graph
- [x] Instrumental arm writes the instrumental clause, and the graph RE-CHECKS `Input_Instrumental`
      itself on both the lyrics and the Vocal Details block. It cannot name the lead instrument —
      the graph does not know it; the clause states that an instrument carries the lead and the
      recipe must make the LLM name it (GAP 3)
- [x] ~~`Input_Duration` seconds → frames (`MpiMath`, LTX Extend pattern)~~ — **wrong for this
      model.** `Input_Duration` is an `MpiFloat` into `MiniMaxMusic3TextEncode.max_duration`;
      `EmptyMiniMaxMusic3LatentAudio.seconds` is driven from the encoder's own `seconds` output, so
      there is no conversion to do. It is a CAP, exactly as `plan.md` § Current State records
- [x] `Input_Low_Vram` wired to the tiled/plain VAE decode switch — already on the bench, untouched
- [x] ~~LoRA nodes present~~ but NO rack declared — the bench graph has NO LoRA nodes at all
      (verified 2026-08-31, 15 nodes). Nothing to carry over; see `plan.md` § LoRA
- [x] Titles pinned in `tests/inject-params-titles.test.cjs` — all eleven `Input_*`, `Output_Audio`,
      the three always-emitted titles pinned ABSENT, plus the four structural gates that a title
      check alone cannot catch. 836/836, lint clean
- [ ] Live run on the bench — `bench/sim_caption.py` walks the real API graph and executes its
      string half over four cases (vocal / instrumental / BPM-auto+unmarked / baked defaults), but
      ComfyUI itself has not executed the chain: the bench was held by MPI-623's job. Closes on the
      first real generation

## Enhancer recipe

- [x] ✅ **GAP 3 CLOSED 2026-09-01 (Fabio chose "build it").** The `enhance` action now declares
      `injectionParams`, spread in `_runEnhance` BEFORE the driven seed so a declaration cannot
      freeze it. `FlowStepField.injectionParams` documents it. Was:** `_runEnhance` passes only
      `Input_Seed`; the action declares only `op`/`from`/`to`/`model`. The baked recipe is Character
      Sheet's ("You are a character designer"), so Enhance on this flow would write a wardrobe noun
      phrase. Fix = let the action declare `injectionParams`, merged over the driven seed. FOURTH
      frame addition on this card, THIRD touching MpiBaseFlow
- [x] 🔴 **DECISION (GAP 4) SETTLED: the GRAPH assembles the caption** (option B). Fabio,
      2026-08-31. The LLM writes the three PROSE blocks only; the graph writes the headings, Basic
      Attributes, the instrumental clause and the roster string around them. So the scrubs assert the
      prose blocks are present, NOT that "the three headings survived" — that wording in `plan.md`
      § The enhancer recipe predates the decision
- [x] Music caption recipe written for `Input_System_Prompt`, hoisted as
      `MINIMAX_MUSIC_ENHANCE_PARAMS` (declared on BOTH the Style step and the run slide, so one
      object rather than two that drift). **It must emit the three blocks
      prefixed `[MOOD]`, `[VOCAL]` and `[ARRANGEMENT]`** — that is the contract the graph's three
      `RegexExtract` nodes parse. An unmarked caption is not an error: the whole text falls through
      into Global Metadata and the two empty headings are dropped, so a hand-typed brief still runs.
      It must also NAME the lead melodic instrument when instrumental — the graph cannot
- [x] `Input_Scrub_Negation` DISABLED with `(?!)` (its baked pattern would eat "no drums until
      the second verse") and `Input_Tidy` narrowed to `\s+$` (the baked one also eats a closing full
      stop). Both verified against Python `re` with the node's own flags. Originally scoped as (not the
      headings — the graph writes those now, GAP 4 option B)
- [x] `max_length` raised to 1400. The shared enhancer graph's `TextGenerate` was UNTITLED —
      now `Input_Text_Gen`, reconverted against the ENGINE, one line changed in the API file.
      Character Sheet keeps 512 by not injecting
- [ ] Measured: does Qwen3-VL-4B hold the format? If not, escalate per `plan.md` § If the 4B cannot hold format

## Flow

- [x] `FlowDef` restructured into the five steps (Song / Voices / Lyrics / Style / Run)
- [x] `FlowDef` + op registered in the 4 files
- [x] 🔴 **DONE — `Input_Style_Custom` / `Input_Voice_Notes`, and a generic guard now catches the
      whole class** (`inject-params-titles.test.cjs` § "every FlowDef field and enhance recipe
      addresses a real node"). Was:**
      Both were written as lowercase LLM-bound fields under option A. Under B a lowercase field
      reaches NOTHING — `_runEnhance` sends only `from`, and a non-`Input_*` id is not injected — so
      the graph now carries a node for each and both are inert until the FlowDef renames them
- [x] Roster markers STRIPPED at dispatch — done IN THE GRAPH (`Strip_Voice_Markers`, a
      `RegexReplace` on `<[^<>\n]*>[ \t]*` before the encoder), so nothing app-side has to know. The
      `[Section]` tags survive; a marker alone on a line leaves a blank line, which MiniMax ignore
- [x] `Input_Duration` labelled "Maximum length", `format: 'duration'`, 30-240s — the model derives actual seconds from lyrics
- [ ] Preview graphics (`/mpi-flow-graphics`)
- [ ] `docs/playbooks/add-flow/existing-flows/minimax-music.md`
- [ ] Live run verified in the user's own app

## Deferred (recorded, not v1)

- [ ] Lyrics generator — user writes their own; revisit only if a lyrics model earns it
- [ ] Saved custom styles as reusable chips
- [ ] Music style-LoRA system

## FlowDef pass — 2026-09-01

- [x] The 18 style phrases WRITTEN, in our own words. MiniMax's taxonomy is an interface fact and
      fine to conform to; their 1,000 template captions are unlicensed and their own skill forbids
      copying them. Each option's `v` IS the phrase and each ends in a full stop, because
      `Cat_Style` joins it to the custom box with a space and the two must read as two sentences

- [x] 🔴 **A field with NO `default` runs the GRAPH'S BAKED VALUE.** `_seedField` returns undefined
      and both seeding loops skip it, so the id never reaches `injectionParams`. `Input_Lyrics` and
      `Input_Caption` are baked with the BENCH'S OWN DEMO SONG — this would have sung the bench's
      lyrics to anyone who left the box empty, and replaced the brief outright for anyone who
      skipped Enhance. `default: ''` on all four empty-able text fields
- [x] New generic guard: *"every FlowDef field and enhance recipe addresses a real node"*. The THIRD
      injection source, previously unchecked — the existing dotted-key test reads
      `PromptBoxControls.js` only. Proven to bite by breaking one key on each path and watching both
      fail. Found two real things on its first run (`Input_Denoise` is injector-derived; a field id
      can itself be dotted)
- [x] The FlowDef's OWN defaults run through the REAL converted graph via `bench/sim_caption.py`,
      resolved through `mapDeclaredValue` rather than typed by hand — fresh open, enhanced with a
      two-voice roster at 78 BPM, and instrumental with the lyrics and roster still holding values
- [ ] 🔴 **GHOST STEP.** `hiddenWhen` hides a FIELD, and Voices and Lyrics each declare exactly one,
      so an instrumental run shows both steps with a title, a hint and an empty body. Fix is derived,
      not declared (hide a `fields` step whose every field is hidden) but it is a FIFTH frame
      addition. **Probably MOOT** — the five-step shape it belongs to was rejected 2026-09-01
- [x] **TITLE — ANSWERED 2026-09-01: `Music Maker`.** Fabio rejected "Text to Music" as the model's
      task rather than the user's outcome, and chose Music Maker over Music Generator. `title` in
      `flowsRegistry.js`; `label` + `filePrefix: 'flowMusicMaker'` in `commandRegistry.js`; `id`
      stays `minimax-music` and the op key stays `flowTextToMusic`. 870/870, lint clean
- [x] The three weights installed and verified on disk at their declared byte sizes (4,914,197,682 /
      9,196,611,886 / 216,696,128). The stuck-at-100% drawer that hid this is **MPI-681**, a
      pre-existing hole, not this flow's
- [x] 🔴 **THE UI IS REJECTED — Fabio, 2026-09-01, on first sight.** *"way too many steps… it's a
      bad UI."* Closed by the one-box rewrite of 2026-09-02 (`43b4a104`) and signed off on real
      pixels: one Song step plus the run slide, no Enhance button, Mood/Vocal/Arrangement hidden
- [x] THE LIVE RUN — **DONE 2026-09-03, twice.** ComfyUI has executed the caption chain. Closed
      with it: the 4B holds the three-marker format from a labelled block, the enhancer cache skips
      a re-run correctly, `hiddenWhen`, `format: 'duration'` and the `voices` roster all painted,
      and VRAM is already released after the enhance stage
- [x] 🔴 **THE INSTRUMENTAL RUN — CLOSED 2026-09-03 on run 4.** Both GPU runs sang the lyrics box on
      an instrumental track, and the enhancer was writing a rival timed arrangement that outranked
      the user's. Rebuilt 2026-09-03: `Lyrics_Gate` restored (node 103), the box split into
      `Input_Lyrics` / `Input_Structure` on `hiddenWhen`, the structure feeding the ENHANCER rather
      than the graph, the recipe forbidden from inventing a running order, and the choir un-banned
      as an instrument. 878/878 + 13/13 desktop + sim asserts green. Fabio's ears on run 4:
      nothing sung or hummed, choir present as an orchestral texture, arrangement in his order

- [ ] 🔴 **BARE TAGS INTO THE LYRICS SLOT — BUILT 2026-09-03, needs one Generate to judge.**
      `Lyrics_Gate`'s true arm stopped carrying `Empty_String`: graph nodes `Input_Structure`
      (104) → `Bare_Tags` (105) → gate `true`. One regex keeps MiniMax's own nine section tags
      (optional trailing number for `[Verse 2]`) and deletes every other character, so the user's
      running order reaches the model's STRONGEST channel with nothing in it that can be sung.
      882/882 unit, 23/23 injection guard (4 new asserts), 13/13 desktop, eslint clean,
      `bench/sim_caption.py` case B now `'[Intro]\n\n\n\n[Chorus]\n\n'` with `[Drop]` and all
      prose gone. **Needs one Generate with Instrumental ON: still nothing sung, and the
      sections now land where he put them**

- [x] 🟢 **THE ENHANCER READS THE CAST — BUILT 2026-09-11, Fabio: *"you can build it."*** Three
      edits, all committed together. `from` gains `Input_Voices` + `Input_Voice_Notes` (the lyrics
      stay out: `from` is the cache key). `MpiBaseFlow._enhanceSourceLine` serialises every
      source through `mapDeclaredValue` instead of `String(v)` — the root cause one layer below
      the list, since a roster's UI value is ROWS and `String(rows)` is `[object Object]`. The
      recipe gains the closed-cast rule and `[VOCAL]` now covers every voice, worded POSITIVELY
      because teaching by negation is what degenerates the 4B. 923/923 unit (2 new, both proven
      to fail on the pre-fix file), 13/13 desktop flow specs, eslint + lint:components clean.
      **NOT ear-verified: no GPU run has happened. That is the owed song run.**

- [x] 🟢 **TAB BELONGS TO AN OPEN `@` PICKER — FIXED 2026-09-12.** The shell's capture-phase
      `workspace.flip` ate the key before either picker saw it; `allowWhileTyping: false` never
      covered Tab. Gated on `MENTION_PICKER_OPEN_SELECTOR` (exact classes, never a substring —
      the `-item` rows outlive a close). 12/12 in `tests/mention-picker.test.cjs`.

- [x] 🟢 **THE CAST SURVIVES NAVIGATION AND REUSE — FIXED 2026-09-12.** `deserialiseVoices` is
      the missing inverse of `serialiseVoices`; every restore path hands the widget the
      serialised roster and it fell to the declared default, then wrote that default back over
      the user's cast. Reproduced first in `tests/desktop/flow-roster-survives-navigation.spec.js`
      (red before, green after), 15/15 unit in `flow-field-constraints`, 927/927 overall,
      14/14 desktop flow specs.

- [x] 🔵 ~~**THE LYRICS RIDE ALONG ON THE GALLERY CARD**~~ — **SUPERSEDED, AND IT IS MPI-727'S
      NOW** (Fabio, 2026-09-12, hours after asking for it). He replaced his own idea with a
      better one: *"the only way we could make it work is if, when we reuse a flow, it loads in
      the current result until the user presses Generate to replace that with a new result.
      That solves it."* It does — the lyrics are ALREADY in the flow, so reusing a card plays
      the result in MPI-727's floating window while he reads and edits the words that made it.
      No duplicate copy of the lyrics anywhere, and it works for every flow instead of just
      Song. Handed to the MPI-727 session by `mpi-message`
      (`8b3c6f19-42ae-4d70-95c1-0e7f2a6d8b44`) plus a live cross-session message, because that
      session holds a live write claim on its own `brief.md` — it folds the scope in itself.
      Original ask kept above because it explains where the shape came from.

- [x] 🟢 **THE SONG RUN — DONE, FIVE TIMES, 2026-09-11/12.** This line said "still owed" for a
      day after it stopped being true, and this card has now had a checklist item read as a
      record of fact THREE times (the phantom `minimax-music.md` rename, a run credited from
      MPI-694, and this). Corrected at source rather than at close-out. Fabio made five runs;
      the cast reaches the caption every time and the audio delivers one voice in four of the
      five, with the SEED deciding — `82fb50dc` / `99e13587` share a caption hash and gave a
      solo and a duet. The table is in the plan's 2026-09-12 Current State. **Do not re-run it.**

- [x] 🟢 **THE `@` SECTION-TAG PICKER — BUILT 2026-09-12,** and it is the SECOND picker this box
      has had. The first (L30 above) pointed at the voice roster and inserted `<Singer A>`, which
      `Strip_Voice_Markers` cuts before the encoder — a no-op Fabio followed on two live runs.
      This one offers MiniMax's nine SECTION tags, which do execute, in SQUARE brackets on their
      own line. The source is a CLOSED `tags` array on the field, never a `mentions` pointer at a
      sibling field; `spliceMentionTag` gained one optional `wrap` param (angle by default, so
      MpiPromptBox is untouched). The nine are pinned against the graph's own `regex_pattern`, so
      the list offered cannot drift from the list the model accepts — a tenth word would pass the
      bracket split and be SUNG. Checks: 934/934 unit, 16/16 desktop, eslint + lint:components
      clean, including a new `tests/desktop/flow-section-tag-picker.spec.js` that drives the real
      popup and asserts the rows have text AND height (the `label`-vs-`text` bug that shipped
      empty rows last time). 🟢 **VERIFIED IN THE APP** — Fabio, 2026-09-12: *"Looks good, my
      man."* The popup-covers-the-step-title cosmetic from L30 is CLOSED rather than carried:
      Fabio asked for the anchor he expected instead — *"where the cursor is, which is the usual
      behaviour"* — so the picker now measures the caret with a mirror div and opens there,
      flipping above the line against the VIEWPORT when it would run off the bottom. Proven to
      bite: with position() disabled both anchors report y=350, the old pinned corner. 🟡
      MpiPromptBox keeps its own older copy and is still corner-pinned — out of scope.
