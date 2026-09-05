# MPI-697 Validation

## Method

The matcher is a pure function, so it was driven directly — `offending()` and
`configured_patterns()` imported from the real `guard-gpu.py`, not
re-implemented. No command was fired at the guard and nothing touched a GPU,
which is what let this land with the 1.4.5 release matrix still holding GPU 0.

29 cases: 13 that must block, 16 that must not.

## Result

```
--- CURRENT patterns: 21/29 correct
--- LIVE .local.md: 4 patterns parsed
--- LIVE patterns: 29/29 correct
LIVE patterns are clean on all 29 cases and armed; CURRENT (pre-fix) got 8 wrong.
```

The eight the old patterns got wrong: seven false positives (`grep`, `sed`,
`git diff`, `git commit`, `wc`, `cat`, and `mynode-runner`) and **one genuine
miss** — `node scripts/smoke-workflows.mjs && node other.mjs --self-check`, a
real unleased matrix run that the old lookahead exempted because `--self-check`
appeared anywhere later on the line. That is the defect worth having found; the
false positives were only the symptom that led to it.

## Verified against the LIVE file, not a draft

`configured_patterns()` re-parses `.agents/mpi-kanban.local.md` and asserts four
patterns that all compile. This is the check that mattered: the parser reads raw
frontmatter with no YAML unescape, and the first write of this change landed
`\\w` instead of `\w`. That reaches the regex as a literal backslash, matches
nothing, and **silently disarms the guard** — it looks identical to a working one
until two runs collide. Caught by the re-parse, fixed, re-verified. The rule is
now written into the file's own prose.

## Live confirmation, unplanned

While verifying, the new pattern blocked one of my own commands — a `python -c`
that carried `node scripts/smoke-workflows.mjs --keep-volume` as an inline test
fixture. Correct behaviour: no text matcher can distinguish a quoted fixture from
the real invocation, and it fails in the safe direction. The lesson is to keep
such fixtures in a file run by path, which is what the test does.

## Scope held

The two URL patterns (`127.0.0.1:(8188|48188)/prompt`, `/connector/generate`)
were left broad on purpose — reasoning recorded in `.local.md` and `plan.md`. No
anchor exists for them, and the cost asymmetry favours a false positive over a
missed collision.

Also touched: four label bullets in the prose lost their `scripts/` prefix, so a
future script targeting the pattern block cannot mis-hit them — the first version
of my own rewrite script matched 4 lines instead of 2 and was stopped by its
assert.

## Not verified

Nothing outstanding. `guard-gpu` enforcement is per-repo: a sibling repo with no
`gpu_command_patterns` block still walks onto the card, exactly as before this
card. Unchanged, already recorded in `.local.md`.
