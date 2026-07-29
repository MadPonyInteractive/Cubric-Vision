# MPI-394 Validation

## Root cause (traced before any edit)

Two mechanisms, not one — the card had the first, and the second is what turned a
flash into twenty seconds of nothing.

1. **The rebuild destroys the previews.** `renderList()`
   (`MpiModelManager.js`) runs `_destroyAllCards()` + `bodySlot.innerHTML = ''` on any
   *real* state change. MPI-124 / MPI-235 / MPI-317 / MPI-276 each stopped an
   *incidental* rebuild, so what was left was exactly the genuine ones: install
   completes, uninstall, filter, search, draft toggle, engine switch.
2. **The replacements have no pixels, and their load is deferred.** `MpiTileSheet`
   rebuilt each thumb as a fresh `<img loading="lazy">`. A lazy image is not loaded
   until after the next layout establishes viewport intersection — and that queue sits
   behind a main thread busy with `_listSignature()` (which calls `_computePartial` →
   `_sharedOwnedDepIds`, an O(n²) walk of every model's full dep universe, per model)
   plus the `reSyncInstalledModels()` disk stat that triggered the render in the first
   place. The whole grid therefore paints empty and stays empty for as long as that
   takes. Measured by the user at ~20s over 15 models.

Third, independent finding the card did not have: **five models are video, not one**
(`wan22`, `wan22_i2v`, `wan22_5b`, `ltx23_high`, `ltx23_balanced`). LTX high is worst
because `ltx23_high_preview.mp4` is **39.8 MB** — `preload="metadata"` has to pull its
moov atom out of that before it can show any frame at all.

## Fix

Preview **elements** now outlive the rebuild.

- `MpiTileSheet` takes an optional consumer-owned `previewCache` Map. `_previewMedia(item)`
  builds the thumb `<img>`/`<video>` once per id and returns the same element on every
  later render; `appendChild` **moves** it, so an already-decoded element paints in the
  same frame and the grid is never observed blank. An element that fires `error` is
  evicted from the cache so the placeholder gradient still comes back.
- `MpiModelManager` owns the Map (`_previewCache`) and passes it to every
  `MpiTileSheet.mount` — the sheets themselves are re-created each render, so the cache
  cannot live inside them.
- Video previews get a `poster` by filename convention (`foo.mp4` → `foo.webp`). Five
  posters generated with ffmpeg (`-ss 0.5`, 480px wide, libwebp q78; 8–34 KB each,
  ~100 KB total). A missing poster file is a silent no-op.
- Uninstall toast: `download:uninstalled` carries no intent, so the whole-model and
  plugin paths now register their id in `_wholeUninstalls`, which the handler consumes.
  Verb is `uninstalled` for those and stays `updated` for the op/arch-removal half of an
  Update — previously both said "updated".

This covers **every** rebuild path, not only the two reported.

### Deliberately not done

A keyed whole-grid diff (the card's literal "repaints only the affected tile") was
rejected: a section move crosses *sheet instances*, so an honest diff means persisting
four sheets plus their headers and adding per-tile reconcile inside a Primitive shared by
three surfaces (Model Library, App Library, model picker). Much larger blast radius for
the same visible result. `MpiModelPicker` also rebuilds sheets and was left alone — it
opens fresh rather than rebuilding under the user, so it has no cache; it can be given
one with a single prop if that ever changes.

## Verified

- `node --test tests/*.test.cjs` → **289/289 pass, 0 fail** (baseline was 286/286; the
  3 new ones are this card's).
- `npx eslint` clean on `MpiTileSheet.js`, `MpiModelManager.js`, `types.js`.
- **Negative control:** with both source files stashed, `tests/model-library-preview-cache.test.cjs`
  is **0 pass / 3 fail**; restored, 3/3 pass. The guard bites in both directions.
- Posters visually checked (not black frames): `ltx23_high`, `wan22`, `wan22_5b` read
  back as real frames.

## USER-VERIFIED LIVE 2026-07-29 — all five acceptance items

Run on a remote CPU Pod (EU-RO-1, volume `cubric-vision-EU-RO-1`), which is the harshest
case: a remote connect also fires `renderList({ force: true })` + `awaitReSync()`.

1. **Connect + forced re-render** — grid stayed fully painted.
2. **Install SDXL Realistic (9.0GB) to completion** — `4 installed · 14 available` →
   `5 installed · 13 available`, volume 139.4 → 149GB, the model moved Available →
   Installed, and every other tile kept its picture through the rebuild. This is the exact
   `download:complete` → `awaitReSync()` → `renderList()` path that used to blank for ~20s.
3. **Uninstall** — same, no blank.
4. **LTX 2.3 video tile** painted its frame throughout, including across both rebuilds. It
   was previously the last tile to repaint every time.
5. **Toast read "SDXL Realistic uninstalled."** — not "updated".

User's words: *"No flickering and stopping with empty cards anymore."*

Sibling tiles showing a progress bar during the install were checked and are NOT a
regression: that is the MPI-258 shared-dep partial (`_computePartial`), clearing on the
re-sync. The user identified it as expected before it was raised.

### Observed, pre-existing, NOT from this work

The uninstall toast fires on `download:uninstalled` while the header count and the tile
still read installed — `reSyncInstalledModels()` re-stats the dep universe over the network
to the Pod after ~9GB of deletion, so it lands seconds later. **The card did then move to
Available correctly**, so this is latency, not a stuck state. Unchanged behaviour; it was
simply hidden inside the 20s of blank tiles before, which is why it reads as new. Uncarded
pending the user's call.

## Original pre-verification checklist (superseded by the section above)

There is no jsdom in this suite, so the paint behaviour itself cannot be asserted here;
the tests pin the wiring, not the pixels.

1. Open the Model Library, install a small model, let it finish → the grid must **not**
   blank. Only the finishing tile changes (chip → Installed) and it moves to Installed.
2. Uninstall it → same, and the toast must read "… uninstalled", not "… updated".
3. Type in the search box / toggle Image-Video / toggle a model's Operations → previews
   stay put through all of those.
4. First open of the Library → the LTX 2.3 and Wan tiles show a frame immediately
   instead of being the last to fill in.
