# MPI-599 Validation

## Automated — PASS

`node --test tests/flow-model-choice.test.cjs` → **14/14**, 2026-08-22. `npx eslint` clean on all
four changed JS files.

Full suite: **671/672**. The one failure is `tests/orphan-sweep.test.cjs` → *"collects a dep no
installed model wants"*, and it is **NOT this card** — see § Pre-existing failure below.

### Mutation-checked (both reversed behaviours, restored in `finally`)

| mutant | assertion that must go red | result |
|---|---|---|
| `flowModelChoices` filters candidates to installed again (the MPI-590 rule) | *the picker offers UNINSTALLED candidates too* | RED ✓ |
| the pick store holds one id per flow again | *picks are PER SLOT — a second pick must not overwrite the first* | RED ✓ |

Source restored byte-identical after each; verified by re-reading the file.

## Live — PASS

Own isolated instance (`npm run app:isolated`, port 51024, own profile — Fabio's `:3000` left
alone and confirmed answering 200 afterwards). `s_installedModelIds` staged to
`['klein-4b','sdxl-realistic']`, i.e. **neither Krea 2 card installed** — the case that used to
show no picker at all.

- Flow Library → Character Sheet drawer renders a field labelled **"Base model"** carrying an
  `MpiDropdown`, above the Required-models list.
- Option list: `Krea 2` with `.mpi-dropdown__option-meta--flag` + an 18x18 sparkle SVG + the word
  **Recommended**, colour `oklch(0.76 0.17 355)` = `--accent-heat` (#FF7EB6), not clipped
  (`scrollWidth === clientWidth`). `Krea 2 NSFW` plain, and **not disabled**.
- Picking `Krea 2 NSFW` re-rendered the drawer: Required-models row became
  **"Krea 2 NSFW — Install"**, footer button **"Install models"**. The pick drives the install,
  which is the whole point of the card.

Screenshot: `.playwright-cli/page-2026-08-22T04-42-36-023Z.png` (untracked, transient).

## Open — needs Fabio's eye, not a test

He asked for **a star icon plus a hover tooltip saying "Recommended"**, in the shape of the Model
Library's flag tooltip (MPI-514, `MpiPopup` off `.mpi-tile__flag`), *or some other way to indicate
it*. Shipped is the second option: the sparkle **and the word**, inline in the row, no hover. The
reasoning is that MPI-514 hides its meaning behind a hover because a TILE has no room for words
and a dropdown row does. **If he wants the literal star-only + tooltip, that is a small change to
`_mountModelChoice` plus the popup wiring — this card stays open until he says.**

## Pre-existing failure, explicitly NOT this card

`tests/orphan-sweep.test.cjs:48` fails on this machine, alone and in the full run.

- Nothing in this card can reach it: `requiredModels` has **no reader in `routes/`** at all
  (grepped), and `downloadManager._flowRequiredDepIds` reads `flow.requiredDeps` only.
- Measured cause: with an EMPTY `CUBRIC_MODELS_ROOT` the protection map still comes back with 79
  entries across 9 models, and `boogu-qwen3vl-8b-clip` is defended by *Boogu Image Edit* — so
  `localModelsCheck` is not honouring the throwaway root the fixture sets, and the test is reading
  real machine state. `routes/downloadManager.js` was last touched by MPI-542/539, not here.
- Belongs to whoever owns the sweep; not fixed under this card, and not swept into its commit.
