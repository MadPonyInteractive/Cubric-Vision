# Kanban & Agent Coordination Rules

Rules for editing the MPI Kanban board (`.agents/mpi-kanban/`) and agent-to-agent messages.
Board mutation mechanics live in `<mpi-lib>/task-board-ops/` (`_schema.md`, `mutate.md`,
`validate.md`) — read the schema FIRST for any card/board write. This file holds the traps
that schema doc doesn't. **`<mpi-lib>` lives at BOTH `C:\Users\Fabio\.agents\skills\mpi-lib\`
and `C:\Users\Fabio\.claude\skills\mpi-lib\` — verified byte-identical 2026-08-03, so read
whichever you reach first.** (This line claimed until 2026-08-03 that `~/.claude/skills/`
"comes up empty". It does not, and the false warning cost a detour; do not reinstate it.
The plugins cache genuinely has no copy.) **The never-edit rule applies to BOTH** — they are
user-scope pack files and a pack update overwrites them.

**`find` will NOT traverse the `.claude` copy** — it is a SYMLINK to the `.agents` one
(`mpi-lib -> /c/Users/Fabio/.agents/skills/mpi-lib/`), and `find` does not follow symlinks
by default. So `find ~/.claude/skills/mpi-lib -name validate_board.py` returns **0 hits**
while `find -L` on the same path returns 1 — it reads as "the file does not exist" when it
does. Search the `.agents` path, or pass `-L`. The validator is
`~/.agents/skills/mpi-lib/scripts/validate_board.py` — in `scripts/`, **not** in
`task-board-ops/` alongside the docs this file already points you at. (Measured both
directions 2026-08-04.)

## The board is PUBLIC — writing a card is publishing it

`.agents/mpi-kanban/` is **tracked**, and `origin` is the public
`github.com/MadPonyInteractive/Cubric-Vision`. CLAUDE.md's "Kanban writes are
pre-authorized — never ask" grants permission to EDIT; it says nothing about privacy.
Before writing a card, brief, `research.md` or an event `summary`, ask whether it would be
fine on a web page. If not, it goes in one of two homes — **never in the card** — and the
card carries only a path pointer:

| Ask | Home |
|---|---|
| Leaking it would be **embarrassing** — operational notes, hosts and endpoints, draft correspondence | `.agents/mpi-kanban/private/` — gitignored (`.gitignore:38`), its `README.md` the only tracked file |
| Leaking it would be a **breach** — confidentiality undertakings, third-party legal correspondence, credentials, someone else's personal data | `C:/AI/Mpi/_private/<topic>/` — **outside every git root**, so nothing there can be staged at all |

A `.gitignore` is one `git add -f`, one misconfigured tool or one `git clean -x` from
failing, which is why the second tier exists and is not optional for breach-grade material.
The MiniMax H3 licence request and authorization live there (`minimax-h3-licence/`, MPI-449).

Caught 2026-08-05 on MPI-449: a licence request carrying a full legal name, email and terms
agreed under a confidentiality undertaking was written into `tasks/MPI-449/` and was one
`git add` from being pushed; the tracked `events.jsonl` summaries leaked the same details
and had to be rewritten. It reads as scratch space because it is a dotfolder written
constantly without ceremony — that is exactly why the check has to be deliberate.

**This already happened without anyone noticing.** `state/archive/handoffs/` and
`tasks/MPI-370/validation.md` carry live-at-the-time SSH endpoints for rented
infrastructure (`rentamac@gate1.rentamac.io -p 27847`, a RunPod proxy id). No keys leaked
and both hosts are long gone, but handoffs and validation notes accumulate operational
detail nobody writes for publication. Sweep `.agents/` for email patterns and `ssh ` before
committing a session that touched anything sensitive.

## Card shape rules

When creating or editing cards (`.agents/mpi-kanban/tasks/<id>/task.json`):

1. `status` is NOT free-form — canonical values are `active`/`accepted`; put blocking info in `description` or `brief.md`. **A `done` move must ALSO set `status: "done"`** — `validate.md` § and `validate_board.py` reject a `done` card still reading `status: "active"`, but `mutate.md`'s `moveTask` recipe only names `column`/`maturity`/`updated_at`, so following it literally hand-authors a validator violation. Upstream pack defect — file it there, never patch `~/.claude/skills/`.
2. `links`: **OMIT a key you have no file for — never write `null`.** `validate_board.py`
   rejects every null with *"link '<key>' must be a relative path inside the task folder"*
   (one violation per key; a new card with five nulls adds five). The full 8-key set is for
   the board's TASK WORKSPACE panel, but it is only correct when the files exist — healthy
   cards carry what they have (`MPI-426`: `brief`/`events`/`reference`/`depends_on`) and add
   keys as files appear. `reference` and `depends_on` are legal extra keys. Bit MPI-429's
   creation, 2026-08-02.
3. `description` is a SHORT one-line card summary — long-form goes in `brief.md`.
4. The `schema` VALUE is validated, not just JSON syntax — copy it VERBATIM from the templates: `task.json` → `mpi-kanban/task-card/v1` (NOT `mpi-kanban/task/v1` — a hand-authored MPI-256 dropped the `-card` and the whole board view wedged while every file still parsed), `board.json` → `mpi-kanban/board/v1`, every `events.jsonl` line → `mpi-kanban/event/v1` keyed `at` (not `ts`). "Valid JSON" ≠ "valid card"; board-blank-after-a-new-card → suspect a wrong `schema` value FIRST, before reading any reader code.
5. `maturity` is a fixed enum owned by the skill pack, NOT this file — read `<mpi-lib>/task-board-ops/_schema.md` § Canonical `maturity` values before any card write, and derive it from the destination column. It grew from 5 values to 10 on 2026-07-31 (`todo` gained `research`/`needs-decision`/`blocked`/`deferred`, `done` gained `rejected`); never trust a cached list, here or in memory.
6. LIFECYCLE: every card with real work passes `todo → doing → done`. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in BOTH event logs. The live board is `board.json` with `todo`/`doing`/`done` columns — NOT the legacy `kanban-ops/` Markdown board doc (5-column BACKLOG/PLANNING/… board that does NOT exist).
   **"BOTH event logs" = `tasks/<id>/events.jsonl` + `.agents/mpi-kanban/events.jsonl`.** `board.json` ALSO carries an embedded `events` array, and it is neither of them — it is a stale partial mirror (258 entries against the canonical log's 2311, measured 2026-08-06; 181 of its entries appear nowhere else). Writing a card event there instead of the global `.jsonl` looks right, validates clean, and silently keeps the event out of board-wide history. Append to the two `.jsonl` files; leave the array alone.

7. **A move must CREATE the files its `links` declare.** `mutate.md` writes the link, not the file — so a `done` card whose `links.validation` names `validation.md`, or a `doing` card missing its `checklist.md`, fails `validate_board.py` on a dangling link. A card closed WITHOUT being built still needs one; "not applicable, merged into MPI-nnn, never built" is the correct content. (Bit 7 card moves in one close-out, 2026-08-01.)
8. **`validate_board.py` PASSES now — exit 0 is the resting state.** The 416-violation
   backlog measured 2026-08-01 (legacy `events.jsonl` lines keyed `ts:`/`event:`, cards
   with `null` links or `status: "active"` while in `done`) was cleared 2026-08-04;
   measured again 2026-08-05, four runs, all `Board validation passed`. So a non-zero
   exit is YOUR violation — read the lines, do not go hunting for a baseline. (This entry
   claimed the opposite until 2026-08-05: "has never exited 0 in this repo". It has.
   Do not reinstate that, and do not reintroduce the delta-counting ritual it justified.)
   Two ways it still lies at exit 0:
   - **The argument is the REPO ROOT, not the kanban dir.** `validate_board.py .agents/mpi-kanban`
     prints `No .agents/mpi-kanban/board.json; nothing to validate.` and exits **0** — a
     false pass that reads exactly like a clean board. Pass `.` from the repo root.
   - **Never read it through a pipe** — `$?` becomes `tail`'s and a failing board reads as
     a pass. Redirect to a file, then check the exit code and grep the ids you touched.

9. **`next_id` is a shared counter — a stale read OVERWRITES a real card.** MPI-244
   (2026-07-11) read `board.json` `next_id`, used it, and a concurrent peer had already
   consumed that id for a finished card — the allocation overwrote MPI-253's `task.json`.
   Caught only at `mpi-end` when `git diff` showed a title changing under us. Before
   creating a card, re-read `board.json` fresh **and** `git show HEAD:.agents/mpi-kanban/tasks/MPI-<n>/task.json`;
   a committed card at that id (especially `done`) means the counter is stale — take a
   higher free id. At close-out, `git diff` the kanban BEFORE committing: an unexpected
   title/column change on a card you did not touch is a collision to reconcile, not a
   change to commit. Restore a clobbered card with `git checkout HEAD -- <path>`, never by
   hand-retyping.

## Timestamps across sessions are NOT comparable — the VPN skews clocks

Concurrent sessions in this tree stamp kanban times **hours** apart (seen 2026-07-29: one
session at `07:10Z` while a peer wrote `08:25Z` and `14:47Z`). The cause is the CivitAI VPN's
exit node — CLAUDE.md § "VPN + the skewed clock" has the offset-derivation recipe. Three
consequences, each of which cost real time before the cause was known:

1. **Do not "correct" a peer's timestamp.** It is not corruption; their clock reads differently.
2. **Do not regress `board.json` `updated_at`.** A blind write can push it hours backwards past
   a peer's value — when building a `board.json` blob, keep the LATER timestamp, not yours.
3. **Event logs are not ordered by `at`.** Append order is truth. Never sort or dedupe an
   `events.jsonl` on that field.

Distinct from a genuine read race, which shows as two reads of the same file disagreeing about
column CONTENTS and is settled by re-reading (`git.md` § "A READ can race a write too"). A pure
timestamp spread with consistent contents is this, not that.

## The backslash trap — a single stray `\` takes the WHOLE BOARD DOWN

Card/event text is markdown inside a JSON string, so describing a Windows path or a separator heal (`` `\` `` , `` `/`->`\` ``) writes a lone backslash. `\`` is not a valid JSON escape → the board fails to render with *"Bad escaped character in JSON at position N"* and every card disappears, not just the bad one. Write `\\` in the raw JSON (renders as one `\`). Prefer the word "backslash" over the character in card prose. Before finishing any card/event write, validate: `python -c "import json;[json.loads(l) for l in open(P,encoding='utf-8') if l.strip()]"` for `.jsonl`, `json.load` for `.json`. Repair is escape-only — after fixing, assert the raw line differs from the original ONLY by backslashes so no wording drifts. (Bit us 4× across `events.jsonl`, `MPI-67`, `MPI-118`, `MPI-246`.)

## Coordination messages — ASCII only, no emoji

`.agents/mpi-kanban/state/messages/*.json` bodies must be plain ASCII. On Windows, Python's
default stdout/file codec is cp1252, which throws `UnicodeDecodeError`/`UnicodeEncodeError` on
emoji when an agent reads or re-emits a message. An emoji in a message body silently breaks the
`mpi-message` read path. Keep bodies ASCII; put personality in the chat, not the JSON.

## Full-file JSON rewrites — pass `encoding='utf-8'` to read AND write (Windows)

When a script REWRITES `board.json`/`task.json` (not appends), `json.load(open(P))` +
`json.dump(b, open(P,'w'))` corrupts existing non-ASCII in OTHER cards: Windows' default codec
is cp1252 and `json.dump` defaults to `ensure_ascii=True`, so a real em-dash `—` round-trips to
mojibake `â€”` across every note the file already had. Pass `encoding='utf-8'` to BOTH the
read `open()` and the write `open()` (and prefer `ensure_ascii=False`); after any rewrite,
`git diff` the file and grep for `u00e2`/`u20ac` before staging — nonzero = you corrupted it.
Appends (`open(P,'a',encoding='utf-8')`) never touch existing lines, so they're safe; the trap
is the read→rewrite cycle. (Bit MPI-344: a board move mojibake'd MPI-337/314/315 notes.)

## Detect INDENT as well as line endings, and load every file before writing any

The serialisation varies **per file**, and indent varies too — not just CRLF vs LF. Measured
2026-07-31, re-measured 2026-08-06: `board.json` = 2-space **LF** (it read CRLF on 2026-07-31
and this line said so until the re-measure — a round-trip guard caught the drift, which is
the entire argument for measuring); `MPI-419`/`407`/`408`/`415` `task.json` = 2-space LF;
`MPI-411`/`198` = 2-space **CRLF**; `MPI-370` = **1-space** LF (all three still true on
2026-08-06). A round-trip guard that varies
the line ending but hardcodes `indent=2` still fails on the 1-space card — and if it aborts
*mid-loop*, the cards it already wrote say `done` while `board.json` still lists them in
`doing`, which is a silently incoherent board. So: **load and format-detect EVERY file first,
then write** — never detect-and-write one card at a time. (Bit MPI-419's close-out; the
half-moved board had to be repaired by hand.)

### Do not hand-detect the format — use a ROUND-TRIP GUARD

Serialise the parsed object with your candidate format and compare it to the ORIGINAL TEXT
before writing. Not byte-identical → abort. This replaces every per-file guess above, and on
a shared tree it doubles as your concurrency check: an abort means a peer rewrote the file
since you read it, which is the right outcome.

```js
const txt = fs.readFileSync(P, 'utf8');
const crlf = txt.includes('\r\n'), trail = txt.endsWith('\n');
const obj = JSON.parse(txt);
const ser = o => { let s = JSON.stringify(o, null, 2);        // indent per file
                   if (crlf) s = s.replace(/\n/g, '\r\n');
                   if (trail) s += crlf ? '\r\n' : '\n';
                   return s; };
if (ser(obj) !== txt) { console.error('ABORT: would reformat'); process.exit(1); }
obj.field = 'new value';
fs.writeFileSync(P, ser(obj));
```

Python needs the same shape plus `newline='\n'` — `io.open(P,'w',encoding='utf-8')` is text
mode with `newline=None`, which translates `\n` → `os.linesep` = CRLF on Windows. That one
default turned a 70-line card move into a **1404-line** whole-file rewrite (MPI-364). It never
reproduces on mac/Linux, so it lands only from Windows sessions. `git diff --stat` after any
programmatic rewrite: a card move is ~10–70 lines; whole-file churn means you reformatted it.

**The MEASUREMENT can lie too — `grep -c $'\r' <file>` is not a CRLF test.** In Git Bash the
shell eats the CR, leaving `grep -c ''`, which counts every line — exactly the number a fully
CRLF file would give. Measured 2026-08-04 (MPI-373): it reported `board.json`, two `task.json`s
and `state/index.json` as CRLF; all four were LF, and only the round-trip guard caught it
(aborting on a 1820-byte overshoot that equalled the line count). Count bytes, never grep them:

```js
let crlf = 0, lf = 0;
for (let i = 0; i < b.length; i++)
    if (b[i] === 0x0a) { if (i > 0 && b[i-1] === 0x0d) crlf++; else lf++; }
```

A file can also be MIXED: `.agents/mpi-kanban/events.jsonl` measured 2018 CRLF and 84 bare-LF
terminators, last line LF — different sessions appending differently. For a JSONL append match
the most recent writer (`\r` is whitespace to `JSON.parse`, so either parses) and do **not**
normalise the log to "fix" it — one such pass rewrote 592 of another session's lines. A
`json.dumps` append also defaults to `"id": "X"` while existing lines are compact `"id":"X"`;
match it with `separators=(',',':')`.

When you only need to change one field, prefer the Edit tool (exact-string match) over any
scripted rewrite — it cannot reformat what it does not serialise.
