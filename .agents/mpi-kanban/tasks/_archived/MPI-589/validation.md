# MPI-589 Validation

## Automated

- `npm test` — **646/646**
- `npm run test:desktop` — **24/24** (21 before, +3 new in `tests/desktop/flows-tab-ring.spec.js`)
- eslint `--max-warnings=0` on every touched js file — clean, including `MpiProjectName.js`,
  which carried two pre-existing bare-`<button>` warnings before this card
- `npm run release:check` — passed

## Mutation test — the exception is load-bearing and proven

Put the OLD blanket gate back (`!qs('.mpi-overlay--body')`, dropping the
`.mpi-flow-library` exception) and the ring spec goes **red**:

```
1 failed
  tests\desktop\flows-tab-ring.spec.js:50:1 › Tab rings gallery → Flows → last card…
MUTANT CAUGHT
restored: True
```

The mutation script restored the source in `finally` — a mutant that survives a crash
reads afterwards as your own broken edit.

## Live, on my own isolated instance (never :3000)

| check | result |
|---|---|
| Flows button is a real control | `tagName` **BUTTON**, label `Flows` |
| Placement | button centre **640 px**, bar centre **640 px** — dead centre, and unaffected by name length because it is absolutely positioned |
| Button click | opens the Flow Library |
| Tab ring, project WITH a card | `gallery → FLOWS → group-history → gallery → FLOWS` — four presses, Fabio's order |
| Tab ring, project with NO cards | `gallery → FLOWS → gallery` — degrades, never dead-ends |
| Model Library open + Tab | stays on `gallery`, Flow Library never opens — the exclusion holds |
| Breadcrumb after the ghost-button conversion | segment is a **BUTTON**, reads `GALLERY`, click navigates, hides when set to `''` |
| Back link after conversion | **BUTTON**, `←PROJECTS` |

The breadcrumb row is the one that nearly broke silently: `MpiButton` renders the
`.mpi-btn__text` span setLabel writes into ONLY when `props.text` is truthy at mount, and
the gallery segment mounts blank at gallery root. Mounted with a single space instead, so
the span always exists; `_update()` still trims it to zero length and hides the segment.

## Not done here

- ~~The release note is owed and NOT written.~~ **WRITTEN**, at close-out, with Fabio's yes:
  one `What's new` entry in `docs/releases/UNRELEASED.md`. The earlier claim that it had to
  wait for the bump was HALF WRONG and the project close-out steps caught it: `releaseNotes.js`
  IS frozen per shipped version (v1.4.2 is latest), but user-facing work goes to
  `UNRELEASED.md`, which `/mpi-version-bump` folds into the next version. Still a 2nd-digit
  bump. Original wording of this item: `releaseNotes.js` is keyed by `APP_VERSION`
  and the next version does not exist yet — `/mpi-version-bump` mints the entry. Copy it
  must carry: *Flows are out of preview — a Flow Library of five outcome flows (Head Swap,
  Extend Video, Add Foley, Upscale Video, Character Sheet), reachable from the Flows button
  at the top of the gallery, the landing page, or Tab.* This is a **2nd-digit** bump: it is
  the first release in which a user can reach Flows at all.
- `.claude/rules/component-events-blocks.md` and the component maps are NOT updated — rule
  files need Fabio's explicit permission (CLAUDE.md § Documentation Drift). The bar's new
  `flows` emit and `ui:close-flows` belong there once he says so.
