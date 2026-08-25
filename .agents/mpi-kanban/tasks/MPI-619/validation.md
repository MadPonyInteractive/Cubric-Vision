# MPI-619 Validation

## What changed

`js/data/modelConstants/models.js` — two `name` literals, plus the comment explaining why
Klein leaves the tier-letter convention that Boogu and LTX stay on.

`tests/flow-model-choice.test.cjs` — the MPI-567 test used Klein as its name-clash fixture and
asserted the two cards shared a name. Its own comment anticipated this exact change:

> *"If someone renames one card this flips and the letter becomes unnecessary — which is a
> deliberate signal, not a failure of the picker."*

Rewritten rather than deleted, because the picker's letter still matters for the siblings that
really are one model at two qualities. It now (a) asserts Klein's names are **distinct** and
carry `4B` / `9B`, and (b) **discovers** a remaining clash group instead of hardcoding one, so
renaming Boogu or LTX later re-points the test rather than silently testing nothing. If no
clash is left anywhere it fails loudly and says the letter is dead code.

## Evidence

| check | command | result |
|---|---|---|
| the two names are distinct and correct | registry read | `FLUX.2 Klein 4B` / `FLUX.2 Klein 9B` |
| the clash-gated letter self-removes | `tierLetterFor('klein-4b'/'klein-9b')` | `''` for both — **no letter** |
| the Flow Library slot reads right | `_label` logic replayed on the blend slot | `FLUX.2 Klein 9B   \|   FLUX.2 Klein 4B` |
| Boogu / LTX keep theirs | `sizeTierLetter` per clash group | `boogu-edit-high=H, -balanced=B`; `ltx-23=H, -balanced=B` |
| the flow-choice suite | `node --test tests/flow-model-choice.test.cjs` | **20/20 pass** |
| full node suite | `npm test` | **729/729 pass** |
| lint | `npx eslint js/ --max-warnings=0` | clean |
| desktop suite | `npx playwright test --config=playwright.desktop.config.js` | **26/26 pass** (1.5m, exit 0) |

No branch was edited to remove the letters — the existing clash gates did it once the names
differed. That is the check worth keeping: it proves the rename reached the real code paths
and not just the data.

## Blast radius swept

- `model.name` is **display-only**. Models resolve by `id` via `getModelById`; a repo-wide
  grep found no name-keyed lookup, so no resolver, project file, sidecar or graph is affected.
- No `tests/desktop/*.spec.js` references the Klein label.
- No remaining `name: 'FLUX.2 Klein'` definition anywhere.
- The one docs hit (`docs/releases/2026-08-10-v1.4.0.md`) is historical release prose about
  the model family and reads correctly unchanged.

## Release note — APPROVED COPY, pending the next version stamp

Fabio approved a single line, 2026-08-25. Paste this into the next version's
`importantChanges` array in `js/data/releaseNotes.js` (and the matching archival
`docs/releases/<date>-v<ver>.md`):

> Due to the introduction of Klein 9B, FLUX.2 Klein is now called FLUX.2 Klein 4B.

**Not written into `releaseNotes.js` here on purpose.** That file is keyed by exact
`APP_VERSION`, notes are authored at stamp time by `/mpi-release` (the `1.4.2` key landed in
its own stamp commit `372c1895`), and the next version number is not decided — master is 280
commits past `v1.4.2` and carries features, so 1.4.3 vs 1.5.0 is a release call. Inventing a
key would put a note under a version that may never exist.

## Not done, deliberately

- **No version bump.** Models are not version-bumped (`docs/playbooks/add-model/`).
- **No live app run.** The change is a data rename proven at the registry and through both
  suites; there is no generation behaviour to exercise.
