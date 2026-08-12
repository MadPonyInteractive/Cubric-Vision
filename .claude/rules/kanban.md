# Kanban & Agent Coordination Rules

Rules for editing the MPI Kanban board (`.agents/mpi-kanban/`) and agent-to-agent messages.
Board mutation mechanics live in `<mpi-lib>/task-board-ops/` (`_schema.md`, `mutate.md`,
`validate.md`) — read the schema FIRST for any card/board write. This file holds the traps
that schema doc doesn't.

**`<mpi-lib>` = `${CLAUDE_PLUGIN_ROOT}/skills/mpi-lib/`** — the installed Mpi-Kanban
plugin, on this machine `~/.claude/plugins/cache/mad-pony-interactive/mpi-kanban/<version>/`.
The validator is `<mpi-lib>/scripts/validate_board.py` — in `scripts/`, **not** in
`task-board-ops/` alongside the docs this file already points you at. Run it as
`python <that path> .` from the repo root; resting state on this board is 0 violations,
exit 0 (measured 2026-08-09), so any violation is yours.

**Never edit the plugin.** A `/plugin update` overwrites it. A needed pack change is a
kanban card, filed as an issue on `MadPonyInteractive/mpi-kanban`.

> Until 2026-08-09 this section described a pre-1.0 skills PACK at
> `~/.agents/skills/mpi-lib/` with a symlinked twin under `~/.claude/skills/` that `find`
> would not traverse. Both are gone — the pack is a plugin now. Do not reinstate that trap.

## The board is PUBLIC — writing a card is publishing it

`.agents/mpi-kanban/` is **tracked**, and `origin` is the public
`github.com/MadPonyInteractive/Cubric-Vision`. Board writes need no permission to make;
that says nothing about privacy.
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

## `validating` is NOT a parking space — move it, or ASK

Measured 2026-08-08: the board held **19 cards in `doing`, 16 of them
`validating`**. Twelve closed in a single pass the moment the user was asked.
Every one already had its evidence on the card; they sat there because no agent
ever came back to ask, and the user's reaction to finding them was not a mild
one.

The maturity means "the work shipped and one check remains". It does **not** mean
"awaiting rubber stamp". Two outcomes, no third:

| the remaining check is… | do this |
|---|---|
| anything an agent can verify — tests, a live probe, a log line, a graph diff, an offline harness | **move to `done`.** No permission needed. Agent evidence is sufficient evidence. |
| a judgement only a human can make — does it LOOK right, SOUND right, is this copy good, is this the product call | **ASK, in that session, in one line.** Name the card and the single thing needed. |

**A card left in `validating` with no question asked is the defect.** It reads as
progress and is indistinguishable from abandonment — that is exactly how twelve
accumulated. If a session ends before the user answers, say so in the close-out;
an unanswered question is visible, a silent park is not.

`/mpi-end-session` enforces this — see the plugin skill § 6, "`validating` is not a
parking space".

## Card shape rules

When creating or editing cards (`.agents/mpi-kanban/tasks/<id>/task.json`):

1. `status` is NOT free-form — canonical values are `active`/`accepted`; put blocking info in `description` or `brief.md`. **A `done` move must ALSO move `status` off `active`** — `mutate.md`'s `moveTask` recipe only names `column`/`maturity`/`updated_at`, so following it literally hand-authors a validator violation. Upstream plugin defect (still present in 1.0.1, re-checked 2026-08-09) — file it on `MadPonyInteractive/mpi-kanban`, never patch the installed plugin.
   **What the validator actually enforces is narrower than it reads** (`validate_board.py:175`, read 2026-08-11): the only rejected combination is `column: "done"` + `status: "active"` — *"is done but still has status active"*. There is no allow-list for `status` on a card, so `done`/`completed`/`accepted` all pass. Do not go hunting for the One True Value when a close-out bounces; the message names the whole rule.
2. `links`: **OMIT a key you have no file for — never write `null`.** `validate_board.py`
   rejects every null with *"link '<key>' must be a relative path inside the task folder"*
   (one violation per key; a new card with five nulls adds five). The full 8-key set is for
   the board's TASK WORKSPACE panel, but it is only correct when the files exist — healthy
   cards carry what they have (`MPI-426`: `brief`/`events`/`reference`/`depends_on`) and add
   keys as files appear. `reference` and `depends_on` are legal extra keys. Bit MPI-429's
   creation, 2026-08-02.
3. `description` is a SHORT one-line card summary — long-form goes in `brief.md`.
4. The `schema` VALUE is validated, not just JSON syntax — copy it VERBATIM from the templates: `task.json` → `mpi-kanban/task-card/v1` (NOT `mpi-kanban/task/v1` — a hand-authored MPI-256 dropped the `-card` and the whole board view wedged while every file still parsed), `board.json` → `mpi-kanban/board/v1`, every `events.jsonl` line → `mpi-kanban/event/v1` keyed `at` (not `ts`). **An event line needs `schema` + `id` + `type` + `at`** — the legacy `{at, event, …}` shape parses fine and fails the validator on all three of `schema`/`type`/`id` (2026-08-09). "Valid JSON" ≠ "valid card"; board-blank-after-a-new-card → suspect a wrong `schema` value FIRST, before reading any reader code.
5. `maturity` is a fixed enum owned by the skill pack, NOT this file — read `<mpi-lib>/task-board-ops/_schema.md` § Canonical `maturity` values before any card write, and derive it from the destination column. It grew from 5 values to 10 on 2026-07-31 (`todo` gained `research`/`needs-decision`/`blocked`/`deferred`, `done` gained `rejected`); never trust a cached list, here or in memory.
   **Nor a neighbouring card.** Live cards carry `maturity: "seed"`, which is NOT in the enum and never was — copying the card next to yours is how it spreads. The enum is also gated PER COLUMN (`TASK_MATURITY_BY_COLUMN`), so a legal value can still be illegal where the card sits: `todo` takes only `idea`/`planned`/`research`/`needs-decision`/`blocked`/`deferred`, `doing` only `in-progress`/`validating`, `done` only `complete`/`rejected`. Two separate error messages, and the second one fires on a value you just read off a healthy-looking card. (Cost three validator round-trips, 2026-08-11.)
6. LIFECYCLE: every card with real work passes `todo → doing → done`. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in BOTH event logs. The live board is `board.json` with `todo`/`doing`/`done` columns.
   **"BOTH event logs" = `tasks/<id>/events.jsonl` + `.agents/mpi-kanban/events.jsonl`.** `board.json` ALSO carries an embedded `events` array, and it is neither of them — it is a stale partial mirror (258 entries against the canonical log's 2311, measured 2026-08-06; 181 of its entries appear nowhere else). Writing a card event there instead of the global `.jsonl` looks right, validates clean, and silently keeps the event out of board-wide history. Append to the two `.jsonl` files; leave the array alone.

7. **A move must CREATE the file its DESTINATION COLUMN requires.** `mutate.md` writes the link, not the file. A card closed WITHOUT being built still needs its `validation.md`; "not applicable, merged into MPI-nnn, never built" is the correct content. (Bit 7 card moves in one close-out, 2026-08-01.)
   **Exactly three files are enforced, and only these** (`validate_board.py:193-204`, read 2026-08-11):
   - `column: "doing"` → `checklist.md` must exist
   - `column: "done"` → `validation.md` must exist
   - `attention.state: "required"` → `brief.md` must exist

   **Every OTHER declared link may dangle.** This entry used to say a dangling link fails outright, which is wrong and costs real work: MPI-506 carried dangling `plan` / `research` / `validation` links for days and validated clean the whole time. What the validator checks for the rest is only that the value is a relative path INSIDE the task folder (a `null` is what fails — see rule 2), plus JSON / event-schema validity of any link target that happens to exist. So do not write a `plan.md` or a `research/` to satisfy a link nothing asks for — either write the file because the card needs it, or drop the key.
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
   Caught only at close-out when `git diff` showed a title changing under us. Before
   creating a card, re-read `board.json` fresh **and** `git show HEAD:.agents/mpi-kanban/tasks/MPI-<n>/task.json`;
   a committed card at that id (especially `done`) means the counter is stale — take a
   higher free id. At close-out, `git diff` the kanban BEFORE committing: an unexpected
   title/column change on a card you did not touch is a collision to reconcile, not a
   change to commit. Restore a clobbered card with `git checkout HEAD -- <path>`, never by
   hand-retyping.

   **Make the collision LOUD instead of remembering to check.** The pre-check above is
   correct and it still failed three times on 2026-08-08 — twice by me, once by a peer
   against me — because it is a manual step that is easy to skip under load, and the write
   that follows is silent: plain `open(..., 'w')` truncates the peer's card with no error
   and no diff to notice. So claim the id structurally: create the task directory with
   `os.mkdir` (raises `FileExistsError` if a peer already took it) and write `task.json` /
   `events.jsonl` with exclusive-create mode `'x'`. On a raise, walk to the next free id and
   carry on. That turns a silent clobber into a caught exception, and it costs one line:

   ```python
   n = board['next_id']
   while True:
       try: os.mkdir(f'.agents/mpi-kanban/tasks/MPI-{n}'); break
       except FileExistsError: n += 1
   ```

   All three of 2026-08-08's collisions were recoverable ONLY because the loser had already
   committed. An uncommitted card would simply be gone. Card: MPI-488.

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

## File claims

Claims are how concurrent sessions avoid overwriting each other. They live in
`.agents/mpi-kanban/state/`, NOT on the board.

**The plugin's `guard-claim` hook enforces them on every write** — Edit, Write and Bash —
whether or not a skill was invoked. It blocks a write to a path an `active_file_claims`
record holds with status `claimed`, owned by a session that is live (`active`, heartbeat
inside the index timeout) and is not yours. A stale, closed or unattributable claim allows
the write, so the claim you take is what protects you; the hook is what stops the peer.

That enforcement is why this section stopped being an outage report. For six weeks —
2026-06-16 to 2026-08-08 — `state/files/` held 0 live records and `active_file_claims` was
`[]` in every commit while 3-5 sessions ran concurrently, because claiming was prose inside
the `mpi-*` skills that an agent doing ordinary work never loaded. MPI-451 and MPI-452
negotiated `models.js` / `licences.js` ownership by hand in `mpi-message` bodies on
2026-08-06 for that reason. Take the claim anyway: the hook cannot protect a path nobody
declared, and across two independently launched Claude Code windows claims stay advisory —
no platform has a cross-session file lock.

### Before your first edit

1. Read `.agents/mpi-kanban/state/index.json`. Two arrays matter:
   - `active_file_claims` — **write locks**. Another session's fresh record on a path means
     do not edit that path. Choose: wait, split ownership, `mpi-message` the owner, or ask.
   - `pending_file_states` — **provenance, not locks**. Read them before editing; someone
     finished work there that is not yet reviewed/verified/integrated.
2. Fresh = `heartbeat_at` inside `heartbeat_timeout_minutes` (120). Only an orchestrator or
   integrator reclaims a stale claim, and only when intent is clear — otherwise ask the user.

**Every array in `index.json` holds a repo-relative PATH, never a card id.** `validate_board.py`
resolves each `active_tasks` entry as a path and fails the **WHOLE BOARD** when it does not
exist — `.agents/mpi-kanban/state/index.json active task is missing: MPI-467`. So `active_tasks`
wants `.agents/mpi-kanban/state/tasks/<uuid>.json`, a coordination record you create via
`<mpi-lib>/coordination-ops/lifecycle.md` § Create Or Attach Task (`status: "in_progress"`,
`task_card: "MPI-nnn"`, `owner_session`). **`state/tasks/` may not exist yet — create it.**
A bare `"MPI-467"` was written on 2026-08-09 by copying the shape a previous session had left
in the file, and it reddened the entire board; the bad example is still in git history, so
match this rule, not the neighbours.
3. Write one `state/files/<uuid>.json` per path you are about to edit, and add its path to
   `active_file_claims`:

```json
{
  "schema": "mpi-kanban/file-claim/v1",
  "id": "<uuid>",
  "path": "js/data/models.js",
  "owner_session": ".agents/mpi-kanban/state/sessions/<uuid>.json",
  "owner_role": "implementer",
  "task": ".agents/mpi-kanban/state/tasks/<uuid>.json",
  "status": "claimed",
  "claim_kind": "write",
  "heartbeat_at": "<ISO-8601>",
  "allowed_actions": ["edit", "verify"],
  "recent_events": [{ "at": "<ISO-8601>", "event": "claimed_for_write" }]
}
```

4. At close, set `status` to `released` (nothing changed), `complete`, `needs_review`,
   `needs_verification`, `needs_integration`, or `verified`, drop it from
   `active_file_claims`, and add it to `pending_file_states` for the four middle states.
   **A released claim is not commit permission** — see `.claude/rules/git.md`.

### Generating the uuid

`python <mpi-lib>/scripts/new_uuid.py`, or equivalently:

```bash
python -c "import uuid; print(uuid.uuid4())"
```

The path in the skill docs is relative, so run it by its absolute plugin path.

> This section claimed until 2026-08-09, "verified 2026-08-08", that the script did not
> exist anywhere. That was true of the pre-1.0 skills pack and is false of the plugin —
> it ships at `<mpi-lib>/scripts/new_uuid.py`. Do not reinstate the claim.

### Card ownership — `files.json`, written by the agent taking the card

A file claim says "I am editing this right now". `tasks/<id>/files.json` says "this card owns
these paths" — it is what `mpi-execute-parallel` reads to decide whether two cards can run in
parallel at all, and it is the thing a peer greps to find out who holds a file.

**Write it as part of the `todo -> doing` move**, alongside the `board.json` + `task.json` +
event-log updates:

```json
{ "schema": "mpi-kanban/files/v1", "files": ["js/data/modelConstants/models.js", "docs/models/krea2/injection.md"] }
```

**Only the agent taking the card can write it.** `mpi-execute-parallel` forbids inferring
ownership from card text, title, or a diff — so an unowned card cannot be backfilled by
anyone later, including a cleanup pass. It is declare-at-move or never.

Measured 2026-08-08: **0 of 83 cards declared ownership.** Two `files.json` existed
(`MPI-4`, `MPI-322`); both had an empty file list and `MPI-4` used a bare `[]` instead of the
schema object. A card with no derivable ownership is not selectable, so the board-dispatch
path has never had a card to dispatch — which is exactly why parallel work here gets
hand-rolled through raw sub-agent dispatch, where nothing claims anything.

### Claims do NOT protect against a peer's git command

A claim stops another agent's *editor*. It does not stop `git checkout -- <pathspec>`,
`git restore`, `git stash`, `git reset --hard`, or `git clean` — those restore from HEAD and
take every uncommitted byte in the pathspec, yours and every peer's, with a clean exit and a
clean `git status` afterwards. Reported 2026-08-08: one such command took a peer's
`todo -> doing` board move, their line in `.agents/mpi-kanban/events.jsonl`, and their code
and doc edits together. Rules and recovery: `.claude/rules/git.md` § MPI-365.

## Sub-Agent Briefing

Paste verbatim into any sub-agent that will edit files in this repo.

> **This repo is a SHARED tree with live peer agents. Assume every file you touch may be
> open in another session right now.**
>
> **Your ownership is the exact file list given to you above. Edit nothing else.** If you
> need a file outside it, do not edit it and do not negotiate: write one message record
> under `.agents/mpi-kanban/state/messages/<uuid>.json` naming the path and why, then stop
> that line of work and finish the rest of your owned work.
>
> **Claim before editing.** Read `.agents/mpi-kanban/state/index.json` first. If
> `active_file_claims` holds a record for one of your paths whose `heartbeat_at` is under 2
> hours old and whose `owner_session` is not yours, do not edit that path — report it as
> blocked. Otherwise write a `mpi-kanban/file-claim/v1` record per owned path, add it to
> `active_file_claims`, and release it (`complete` / `verified` / `released`) in your final
> report. Generate uuids with `python -c "import uuid; print(uuid.uuid4())"`. `guard-claim`
> blocks the write if you skip this and a live peer holds the path.
>
> **NEVER run `git checkout --`, `git restore`, `git stash`, `git reset --hard`, or
> `git clean`.** They restore from HEAD and destroy peers' uncommitted work silently, exit 0,
> with a clean `git status` afterwards. Undo a probe by re-applying its inverse edit with the
> same tool that made it. Take a baseline with `git show HEAD:<path> > /tmp/base` — never by
> stashing. Back up with `cp` before any mutation test, and after any revert grep for a
> distinctive token of your own work rather than trusting `git status`.
>
> **Other agents are editing this repo while you run. Never revert, "clean up", or
> "fix" a change you did not make** — an unfamiliar diff is a peer's in-flight work, not
> drift.
>
> **Board writes:** only if `board.json` / `tasks/<id>/` is in your ownership. Kanban writes
> are pre-authorized but not conflict-free.
