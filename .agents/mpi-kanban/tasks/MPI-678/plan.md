# Gallery archive scope — archive a card out of the gallery without deleting it

## Current State

Project mode: scalable-foundation. Design approved in brainstorm (2026-09-01) — do not re-open it.

The gallery pollutes: generations and imports pile up, and the only way out today is Delete.
There is no "put this away but keep it".

Facts established at planning time, each read from the code:

- **Filters are a single-select facet row.** `state.gallerySort` is `{ order, filter }`
  (`js/state.js:93`); the predicate is one switch at `MpiGalleryGrid.js:1825`.
  `gallerySort` is **in-memory only** — never written to `Storage`.
- **`favorites` is ADDITIVE** (a fav still shows under All/Images/Videos). Archive must be
  **SUBTRACTIVE** — hidden from every other tab. That is why Archive is a *scope*, not a
  seventh facet chip. This distinction is the whole design; a 7th tab was considered and
  rejected because it costs you the type filters inside the archive, which is the one bucket
  big enough to need them.
- **`g.favourite` is the precedent for a group-level flag**: declared at
  `js/data/projectModel.js:172,191`, defaulted at `routes/projects.js:2320`, serialized at
  `js/services/projectService.js:509`, persisted by the `grid.on('favourite') → updateGroup(group)`
  handler at `MpiGalleryBlock.js:440`. `archived` rides all of it. **No new route.**
- **The toolbar centre zone is over-stuffed.** `grid-template-columns: auto minmax(0, 19rem) auto`
  (`MpiGalleryGrid.css:16`) caps the centre at 19rem while its contents want ~25rem: 2 icons
  (~2rem) + 2 sliders (7rem max each) + Record icon+label (~6rem) + 4 × 0.75rem gaps. Only the
  sliders carry `flex: 1 1 0`, so **they absorb the entire ~6rem overflow** and render at ~4rem
  against a 7rem `max-width`. Record (MPI-573) is the cause. Moving it out is what unsquashes them.
- **`MpiButton` already supports `toggleable: true`** — the info button uses it
  (`MpiGalleryGrid.js:2111`). The Archive toggle needs no new component.
- **There is no `archive` icon** in `js/utils/icons.js` — the registry has 100+ names and none
  of them fit. One must be added there (raw SVG at the call site is banned).
- **`recordAudioIntoProject()` is fully self-contained** and already has two callers: it shows
  the recorder, uploads, and emits `media:imported` itself (`MpiAudioRecorder.js:380`).
  `MpiMediaPicker` imports and calls it directly. So the shell can too — the emitter can move
  without the recorder moving.

### The correction the brainstorm got wrong

Brainstorm asserted Record needs **no** per-page gating because it is project-level and valid
from group-history. **That is wrong, and the plan reflects the corrected version.**

`media:imported` is what *builds the ItemGroup* — the only listener is inside `MpiGalleryBlock`
(`MpiGalleryBlock.js:1702`), and navigation destroys the outgoing block before mounting the next
(`await block.el.destroy()` then `_toolContainer.innerHTML = ''`, `js/shell/navigation.js:198,225`).
One block is mounted at a time. **Recording from group-history would write the file and its
sidecar to disk and never create the group** — a silent orphan, exactly the class of bug this
repo calls a false done.

So Record **is** gated to the gallery page. Reuse the branch that already distinguishes the two
pages: `navigation.js:257` vs `:267`, which sets `setStats({ label: 'ASSETS' })` for the gallery
and `'ENTRIES'` for group-history.

Making Record work from both pages means moving group-creation out of the gallery block. That is
a larger refactor and **not** in this card.

## Implementation

- [ ] **Archive scope, end to end.** `archived: false` on the group model (`projectModel.js`
      typedef + default, `routes/projects.js:2320`, `projectService.js:509` serializer).
      `gallerySort` gains `scope: 'active'|'archived'`; being in-memory, it resets to `active`
      every launch — nobody relaunches into a gallery that looks wiped. The predicate at
      `MpiGalleryGrid.js:1825` gains a scope gate as its **first** line
      (`if (!!g.archived !== wantArchived) return false;`) so type tabs, Favs, Previews and sort
      all keep working inside the archive. An `archive`-icon `toggleable` `MpiButton` in
      `mpi-gallery-grid__zone--right`, after the `favorites` slot and before the info button,
      with a divider + distinct treatment so it does not read as a 7th facet chip, and an active
      state loud enough that the emptied grid reads as *"you are in Archive"* and not *"my cards
      are gone"*. Context-menu entry after `card-notes` (~line 1436) labelled off the card's own
      state — `group.archived ? 'Return to gallery' : 'Archive'` — emitting `archive`, which
      `MpiGalleryBlock` handles with the same `updateGroup(group)` the favourite handler calls.
      Multi-select comes free via the existing `targetIds`, and the scope gate means a visible
      selection is always homogeneous, so there is no mixed-state case.
      `MpiMediaPicker._collect()` gains `if (group.archived) continue;` so archived media is
      hidden from Flow slot pickers too.
      **Verify:** archive a card → it leaves the grid; toggle scope → it is there, and the
      Images/Videos tabs still narrow it; Return to gallery → it comes back; the same card is
      absent from a Flow's media picker while archived; reload the app → still archived, and the
      scope is back to `active`.

- [ ] **Record moves to the project bar, gated to the gallery.** Delete the
      `mpi-gallery-grid__record-slot` markup, its `MpiButton.mount` (~line 485) and its CSS
      block; the centre zone drops to 2 icons + 14rem of slider + 3 gaps ≈ 18.25rem and fits
      inside 19rem. Mount Record in `MpiProjectName` beside Flows. `.mpi-project-name__flows` is
      `position: absolute; left: 50%` (`MpiProjectName.css:22`) — deliberately, so a long project
      name cannot shove it off-centre — so **wrap Flows + Record in one absolutely-centred flex
      group**; the group becomes dead-centre and Flows shifts left by half a Record button. That
      is accepted, and it is a visible change to a placement Fabio specified in MPI-589, so it
      wants his eyes.
      The bar **emits**; `navigation.js` binds `on('record')` and calls the exported
      `recordAudioIntoProject()` directly, the way `MpiMediaPicker` already does — which lets
      `MpiGalleryBlock` drop its `grid.on('record')` handler and its `MpiAudioRecorder` import
      (orphans created by this change, so they go). Show/hide Record from the `ASSETS`/`ENTRIES`
      branch in `navigation.js`, per the correction above.
      **Verify:** in the gallery both sliders render at full width and Record records into the
      project as before; in group-history the Record button is absent.

- [ ] **Regression spec** `tests/desktop/gallery-archive.spec.js`: archive → gone from the active
      grid → present under the archive scope → restored. Assert on the flag surviving a project
      reload, since the persist path is the part with a server round trip.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Archive scope end to end (flag, state, predicate, toggle, context menu, picker).
- Record relocation + gallery-only gating.
- Regression spec.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Two things need Fabio's eyes and cannot be settled by a passing test:

1. **The archive scope must not read as data loss.** An emptied grid is the failure mode. The
   toggle's active state and whatever empty-state copy the archive shows have to be judged on
   screen.
2. **The re-centred project bar.** Flows moves off true centre by half a Record button, against a
   placement he specified in MPI-589.

Machine-checkable legs, run before handing it over: `npm run lint`, `npm run lint:components`,
and `npx playwright test tests/desktop/gallery-archive.spec.js` (desktop specs need their own
profile + port — never `:3000`, see `docs/testing.md`).

## Preservation Notes

- **`docs/gallery.md`** gains the archive contract: `archived` is a group flag, the scope is a
  third `gallerySort` key that is deliberately NOT persisted, and archive is a flag flip — no
  file move, nothing for the GC or the orphan sweep to see.
- **Not touched, deliberately**: files on disk, sidecars, the GC, the orphan sweep, and the
  `N ASSETS` project-bar count. The bytes are still spent, so counting archived assets is the
  honest number.
- MPI-573's comment block at `MpiGalleryGrid.js:481-486` explains why Record sits in the centre
  zone. It is being disproved by this card — replace it, don't leave it lying.
- Pre-existing board drift, NOT this card's: `tasks/MPI-664/events.jsonl:7` and the mirrored
  `.agents/mpi-kanban/events.jsonl:3701` were written with `"task":` instead of `"id":` and no
  `schema` field. `validate_board.py --fix` clears them; MPI-664's owner should do it.
