# MPI-476 — model card cleanups

Four user-reported drifts on the model surfaces, 2026-08-07. All four shipped;
the card sits in `validating` for the user's own eye test.

Commits: `d2800e4c` (library side), `01014c1e` (prompt-box chips).

---

## 1. The Operations row, and per-op install groups

**Reported:** "When Wan Text-to-Video was deprecated, the model card wasn't updated.
As operations image to video, we shouldn't have that. And since we're moving away
from different operations per model, the code that goes along with this should be
cleaned up as well."

`wan-22` was the last model declaring `commonDeps` + `operations{}` — the MPI-122
shape that let a user install a SUBSET of a model's ops, with one toggle per group
in the Library drawer. MPI-470 deprecated `t2v_ms` and left it rendering a
single toggle that could not be turned off. `models.js` even said the shape was
kept deliberately, as "the last live exemplar of the op-keyed resolver". That
exemplar was costing a real user a control with no meaning.

**Flattened**, to the identical dep set — same ids, same bytes, so an existing
install stays installed. Removed with it: `_buildToggleRow`, `_bundledOps`,
`_hasBaseToggle`, `_draftFor` / `_setDraft`, `_opUninstallDepIds`, the
`#detail-ops` markup, the op halves of `_modelState` / `_applyUpdate` /
`_listSignature`, the `s_modelOpDraftByModel` state key, its `Storage`
accessors and its `storageKeys` entry. GPU-arch (MPI-209) is the only draft axis
left, so Update now means exactly "install or remove an arch weight".

### The guard that had to be ADDED

`isOperationInstalled(model, op)` answered through `installedOps` on an op-keyed
model and through `isModelUsable` — ignoring `op` entirely — on a flat one. So
flattening wan would have made it answer YES for `t2v_ms`, whose graph is
deleted, re-opening MPI-453 for a legacy history item (preview Continue/Finish).
It now requires `op ∈ supportedOps` before asking about weights. That closes the
same latent hole on every flat model, which is all of them.

### What was deliberately NOT removed

The resolver's op axis (`hasOperationGroups`, `selectableOps`,
`expandRequiredOps`, `dependentsOfOp`, the `operations` branches in
`resolveDeps` / `deriveInstalledOps`) and the backend uninstall guard that calls
it. Nothing ships the shape, so those return empty for every real model — but
`routes/downloadManager.js` implements the shape in BOTH engine twins
(MPI-310), and ripping that out is a change to the shared-dep protection with
its own bug history. It is dead-but-correct, and the tests now cover it with
synthetic models instead of a shipped one.

**If a future model brings operation groups back, restore the install UI in the
same change.** Declaring `operations{}` today would silently install every op
with no toggle. `tests/resolve-model-deps.test.cjs` asserts no shipped model
declares it, and the trap that makes the UI non-trivial is written down in
`.claude/rules/downloads.md`: the per-op uninstall subtraction must run
CLIENT-side, because the backend guard excludes the target model and would not
stop you deleting a dep the model's own sibling op still needs.

## 2. The VRAM floor

`footprint.js` derives the floor as `max(8, weights * 0.25)` then rounds it up
onto the 8GB grid. H3's 53.15GB of weights gives 13.3GB, which rounds to a
**16GB minimum** — i.e. "don't bother" for a 12GB card. Users report running H3
on 8GB, almost certainly on community GGUF quants; we ship int8, so 12 is the
honest floor for our weights.

`minVramGb` on a ModelDef now overrides the computed floor. Both H3 cards set
12 and gain a leading `12GB → ~48GB` row with the grid resuming above it
(12 / 16 / 24 / 32 …). K was NOT moved — that would re-floor the whole library.

> The user guessed ~60GB of system RAM at 12GB VRAM; the formula says **48**
> (53.15 + 1.3 overhead − 12 = 42.45, rounded up to the next 8). Stated here
> because the numbers differ and the table is the SoT.

**Only an explicit override draws an off-grid row.** The first cut prepended the
COMPUTED floor too, which put "8.28951171875GB min" on Wan's card — caught by
probing the live drawer, not by a test. The self-check now pins every row to the
8GB grid when no override is set.

## 3. The tier letter

`tierLetterFor` returned H/B/L whenever a model had a `modelFamily`. But
`modelFamily` groups models that are merely related, not models that collide:
Wan-2.2 holds "Wan 2.2 Smooth" and "Wan 2.2 5B", MiniMax-H3 holds "MiniMax H3"
and "MiniMax H3 Reference". Different names — the letter separated nothing and
read as clutter on every gallery card and on the model button.

The letter is a DISAMBIGUATOR, so it now needs another **installed** model
rendering the same `name` in a different tier. Today that is LTX 2.3 (high +
balanced, both literally named "LTX 2.3") and nothing else. It is install-gated
on purpose: with one tier on disk there is nothing to tell apart, so a gallery
card made by that tier shows a bare name.

Also: `minimax-h3` was `sizeTier: 'high'` and is now `'balanced'`, per the user.

**Consequence for the next tier pair:** give the siblings the SAME `name` or
they get no letter. Recorded in `docs/playbooks/add-model/03-model-registry.md`.

## 4. Chips do not follow the model

**Reported:** "If I have H3 selected... I had picture one on the chip. Then I
chose LTX, and I still got picture one instead of start frame."

A chip's badge and its frame-role pill are properties of the OP + MODEL, not of
the chip: which slot a chip fills is re-derived per op, and
`filterMediaInputsForModel` re-filters those slots per model. Only
`_emitMediaChange` repainted the strip, so nothing repainted on a model or op
change. `setOperation` and `setModel` now do.

`_renderStrip`'s reorder fast path had the matching hole. Its invariant is
"same chips ⇒ same chip content", stamped on `dataset.roleKey`; it re-stamps a
badge's TEXT but cannot create a badge element that was never there. Switching
between two ops that both lack a frame-role pill — Wan 5B `i2v` (no badge on a
lone chip) → H3 `ref2v_ms` ("Picture 1") — kept the same roleKey, took the fast
path, and painted no tag at all. The stamp now carries badge PRESENCE. Reorder
is unaffected: presence does not change when chips swap places, only the text,
which the fast path already handled.

---

## How it was verified

`npm test` 492/492, plus live-DOM probes through `playwright-cli` against the
app on :3000 (a fake context proves only inputs — see
`tool_real_pixel_probe_via_playwright_cli`):

- Wan's drawer: **no Operations row**, table unchanged at `16GB min → ~24GB`.
- H3 Reference's drawer: `12GB min → ~48GB`, note reads "min 12GB VRAM".
- Tier letters with all six video models installed: only the two LTX cards
  carry one; with a single LTX tier installed, none do.
- Chips, real component mounted and the DOM read:
  `H3 ref → LTX → Wan 5B → H3 ref` relabels
  `Picture 1 / Start frame / (none) / Picture 1`, and a second image on H3
  lands as `Picture 2`.

**Reload the page before re-probing.** The first drawer probe read a stale ES
module from the page's import cache and reported the bug as still present after
it was fixed.

## Changelog: this card owes NOTHING — settled 2026-08-07

Three lines were drafted and all three were dropped. Do not re-propose them.

- **H3's VRAM floor (16 → 12) and its size tier (High → Balanced).** MiniMax H3
  appears nowhere in `js/data/releaseNotes.js` — it ships for the first time in
  this cycle. Nobody has ever seen H3 at 16GB or under the High filter, so there
  is no delta to report. This is now a rule in `.claude/skills/mpi-end/SKILL.md`
  (`21cc719d`): a change to an unreleased thing owes no entry.
- **The Operations row / per-op install.** The stale `fixes` entry describing it
  was CUT, not rewritten (`ff839a63`) — its one real consequence, Wan
  text-to-video weights already on disk, is covered by "Wan 2.2 is
  image-to-video only now" in `importantChanges`. A header note in
  `UNRELEASED.md` records the cut so an older draft cannot re-add it.
- **The tier letter.** Visible to shipped users (Wan cards lose their `B`), but
  losing a letter confuses nobody — a changelog line explaining an absence costs
  more attention than it returns.

## Not covered

Nothing here has been exercised in the **Electron** app by a human — the probes
ran in the browser build. That is what `validating` is for.
