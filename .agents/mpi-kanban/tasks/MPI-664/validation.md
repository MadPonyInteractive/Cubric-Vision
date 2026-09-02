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
