# MPI-648 — validation

Doc-only card. No app code, no test code, no config touched — so there is no suite result
to quote, and none was run.

## Where it landed

`docs/testing.md` was 289 lines against the ≤200-line rule (`docs/README.md` § MPI-170)
and is not on the exempt list, so appending a fifth trap was not available. The
spec-AUTHORING half split out:

| file | lines | holds |
|---|---|---|
| `docs/testing.md` | 189 | both suites, the release gate, CI, the unit suite, and the desktop suite's RUNNING mechanics (config, port, off-screen window, `shellWindow`, the single-instance lock) |
| `docs/testing-desktop-specs.md` | 134 | the spec catalogue (UI smoke, flow overlay) and the **five** traps, including the new one |

Nothing was dropped: 185 kept + 104 moved = the original 289. The moved `###` headings were
promoted to `##`; the only text edit inside them was the section title, *Four* → *Five*.

## The entry

Trap 5, written as the SHAPE the card asked for rather than as one spec's story: **a
`state.*` key + its one app-side writer + a read that happens a tick later.** Both durable
rules are in it —

- **suppress, don't outrun** — re-stub from a listener registered after the app's, because
  `Events` fans out over an insertion-ordered `Set` synchronously, so the refresh is
  overwritten inside its own emit; widening the sleep only moves the flake;
- **provoke, don't wait** — emit the app's own event with the CI payload, because a dev box
  has the weights and can never reproduce the empty refresh.

It carries MPI-647's evidence (red with the re-stub disabled, green enabled, green at
`--repeat-each=5`), names `tests/desktop/flow-reuse-opens-without-model.spec.js` as the
worked example, and cross-references flow-overlay item 4, which stubs the same key for the
other half of the same answer.

## Checked

- Every symbol the entry cites still exists: `_initDataRegistries` (`js/shell.js`, the sole
  writer, `Events.on('models:checked', …)` as its first statement), the synchronous `Set`
  fan-out (`js/events.js`), `openFlowFromReuse`'s `setTimeout(…, 0)` (`js/services/flowService.js`),
  `flowAvailability` (`js/data/flowsRegistry.js`), and both MPI-647 comment blocks in the spec.
- `wc -l` — 189 and 134, both under 200.
- Every relative link in both files resolves on disk (4 targets, 0 missing).
- Pointers updated: `docs/README.md` map row split into two, `docs/DEVELOPMENT.md`'s
  "spec-authoring traps" sentence re-aimed. `docs/testing-harnesses.md`'s three refs and
  `CLAUDE.md`'s `app:isolated` ref still point at content that stayed in `testing.md`;
  `.claude/skills/cubric-vision/SKILL.md` only lists the filename.
- `validate_board.py .` from the repo root — `Board validation passed`, exit 0.
