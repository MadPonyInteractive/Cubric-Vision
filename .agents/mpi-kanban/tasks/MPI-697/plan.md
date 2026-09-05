# MPI-697 Plan — guard-gpu matches command text, not invocations

## Two defects, opposite directions

`guard-gpu.py` does `re.search(pattern, command)` against the raw command string.
The two file-path patterns in `.agents/mpi-kanban.local.md` are bare paths:

```
- "scripts/pre_release_test\.py"
- "scripts/smoke-workflows\.mjs(?!.*(--plan|--self-check))"
```

**Over-match.** Any command *mentioning* the path is refused. Hit four times in
one session on `grep`, `sed`, `git diff` and `git commit` — none of which use a
GPU. The hook's remedy is to wrap the command in `gpu_lease.py run`, i.e. take a
real machine-global GPU lease to run a `grep`, blocking behind whatever holds it.

**Under-match — the serious one.** The exemption lookahead `(?!.*(--plan|--self-check))`
scans the *entire remaining command*, not the invocation's own arguments. So

```
node scripts/smoke-workflows.mjs && node other.mjs --self-check
```

is a genuine unleased matrix run that the guard **exempts**. A hole, not an
annoyance. (This session tripped the same mechanism benignly: mutation-test
commands passed the guard only because `--self-check` appeared later in them.)

## Fix — anchor on the interpreter, scope the lookahead

```
- "(?<![\w-])py(?:thon)?\S*(?:\s+-\S+)*\s+\S*scripts/pre_release_test\.py"
- "(?<![\w-])node\S*(?:\s+-\S+)*\s+\S*scripts/smoke-workflows\.mjs(?![^&|;\n]*(?:--plan|--self-check))"
```

- interpreter required — a `.mjs`/`.py` cannot execute without one, so read-only
  tooling naming the path stops matching;
- `\S*` after `node`/`python` covers `node.exe`, `python3`, `py`, and a full
  interpreter path;
- `(?<![\w-])` stops `mynode-runner` arming it;
- `[^&|;\n]*` confines the exemption to the current command segment.

**The two URL patterns are deliberately left alone.** `127.0.0.1:(8188|48188)/prompt`
and `/connector/generate` have the same over-match in principle — a doc or code
mention trips them — but no reliable invocation anchor: curl, wget,
Invoke-RestMethod, httpie, python requests and node fetch all reach them. The
asymmetry decides it. A false positive costs an agent one retry; a false negative
costs a collided paid run whose wrongness is invisible in the output. Narrowing
those without an anchor would be trading a cheap failure for an expensive one.

## Verification

**Verify mode:** auto

The matcher is a pure function, so it is driven directly — no command has to be
fired at it, and nothing touches a GPU. `offending()` is imported from the real
`guard-gpu.py` (not re-implemented) and run over a 29-case table: 13 that must
block, 16 that must not, including every false positive hit this session, the
`&&` hole, interpreter-by-path forms, and the already-leased bypass.

Result: PROPOSED 29/29, CURRENT 21/29.

After the edit the same table is re-run against the patterns parsed back out of
the real `.local.md` by `configured_patterns()` — because malformed frontmatter
makes that function return `[]`, which silently disables the guard for every
session on this machine. That check is the point, not a formality.

## Current State

Implemented and verified against the live file; see `validation.md`.

## Completed

- both file-path patterns anchored and the lookahead scoped
- the `## gpu_command_patterns — why these four` prose updated to record the
  anchor rule and why the URL patterns stay broad
- 29-case table green against the patterns as the hook actually parses them

## Remaining Work

None.

## Plan Drift

- 2026-09-05: this was first triaged as "wait for the release matrix to finish —
  testing a guard means firing the command it guards". That was wrong. The
  matcher is pure and can be driven directly, so the change is verifiable with
  the lease still held. The two real constraints — don't touch the plugin cache,
  don't leave the frontmatter unparseable — are both handled above.
