# MPI-642 validation

Two close-out proposals Fabio accepted on 2026-08-28.

## 1. `scripts/mutate-check.mjs`

Breaks one file, runs a command, restores in `finally` with a byte-identical check.

- **Exit 0 = KILLED, 1 = SURVIVED, 2 = the harness could not run.** Three outcomes, because
  "the harness broke" must never be readable as a verdict.
- **Refuses when the target text is absent.** A stale snippet would otherwise run the check
  against *unmutated* code and print green — the precise failure this tool exists to catch.
- **`--to` omitted deletes the snippet**, which is the commonest mutation: drop the guard and
  see whether anything notices.
- **`--from-file` / `--to-file`** because Git Bash on Windows mangles backticks and quotes in
  inline arguments and this repo's guard hooks block the heredoc workaround — that combination
  blocked this session three times.
- **`--self-check`** so the harness is not the untested thing.

### Proven twice, not once

`--self-check` builds a temp file and runs BOTH verdicts against it: a check that greps the
file (must kill) and a check that ignores it (must survive), asserting the restore after each.
All four pass.

Then against a **real** mutation from the session that motivated it — deleting
`line-height: normal` from `MpiBaseFlow.css` and running the MPI-641 spec:

```
MUTANT KILLED — the check fails when js/components/Organisms/MpiBaseFlow/MpiBaseFlow.css is broken
exit=0        # and `git status` on that file came back clean
```

`npx eslint scripts/mutate-check.mjs` clean.

## 2. `docs/testing.md` § Specs that drive a FLOW overlay

Two traps added as items 4 and 5, and the header now says what makes them different from items
1-3: **the spec goes green and the code is wrong.**

- **4 — `s_installedModelIds` is only half of `flowAvailability`.** The dep half is
  disk-derived, so a spec stubbing the model set alone is Ready on a dev box and Get-models on
  a bare runner. Cost one red CI run (33153649907) on a spec that was green locally.
- **5 — the overlay has no geometry, only styles.** Every `getBoundingClientRect()` inside the
  frame is `0` while `getComputedStyle` reads normally, so `height === height` is `0 === 0` and
  passes against anything. Cost a passing assertion against a visibly 4px-too-tall box.
  Carries the rule: assert non-degenerate BEFORE comparing, and when the harness cannot measure
  at all, delete the assertion and pin the property that decides the outcome instead.

The existing "mutation-test the guard" paragraph now points at the script rather than
describing a discipline with no tool behind it, with the usage and the three exit codes.

`npm test` — 773 pass, 0 fail. (773 not 774: a live peer renamed `flow-voice-emotion.test.cjs`
to `flow-derived-fields.test.cjs` mid-session. Not this card's.)

## Noted, not actioned

`docs/testing.md` is now **289 lines** against the 200-line budget — but it was already **256**
before this card, and it is not on the exempt list in `docs/README.md`. Splitting it is the
same class of work Fabio reserved for himself on `ui/carousel-frame.md` (496 lines), so it is
flagged rather than done. Both are candidates for one pass; `testing-harnesses.md` is already
exempted on the reasoning that a numbered catalogue should not be mechanically split, and
`testing.md` has the same shape.
