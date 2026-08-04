# MPI-364 — Model picker: scroll the selected model into view

## Ask (user, 2026-07-27)

> When the user opens the model select gallery, the gallery scrolls to where the
> card is and centres it horizontally.

Today `MpiModelPicker` always opens scrolled to the top. With a long installed
list the currently-active model can be well below the fold, so the overlay opens
showing models the user did not pick and gives no sense of where they are.

## Where

- `js/components/Compounds/MpiModelPicker/MpiModelPicker.js`
  - `el.open({ models, modelId })` (~L123) — rebuilds the body, then shows the
    overlay. The scroll has to happen AFTER the tiles are in the DOM and after
    the overlay is visible (a hidden/zero-size container measures as 0 and any
    scroll silently no-ops).
  - `_mediaBlock` (~L82) mounts ONE `MpiTileSheet` per media type into
    `#picker-body`, so the active model's tile can live in either sheet. Find it
    with `sheet.el.getTile(modelId)` across the mounted sheets, not by assuming
    one grid.
- Scroll container is `.mpi-model-picker__body` (`MpiModelPicker.css` L65 —
  `overflow-y: auto`). It is the ONLY scroller; the root is `overflow: hidden`.

## Note on "centres it horizontally"

The body scrolls **vertically only** — the tile grid wraps to the container
width, so there is no horizontal scroll to centre within. Read as "put the tile
in the middle of the view", the implementation is a vertical centre:
`tile.scrollIntoView({ block: 'center', inline: 'nearest' })`, or set
`body.scrollTop` from the tile's offset if `scrollIntoView` fights the overlay's
entry animation. Confirm with the user if they actually meant something about
horizontal placement within the row.

## Watch for

- `MpiOverlay` animates in (`mpi-overlay-fadein`, 0.3s, `transform: translateY`).
  Scrolling mid-animation can land off-target — measure after the tiles mount,
  and prefer `scrollIntoView` on the tile over hand-computed offsets.
- No selection at all (`modelId` null, or the active model is not in the list
  because the workspace filtered it out): leave the scroll at the top, do not
  throw.
- `behavior: 'smooth'` on an overlay that just appeared reads as jank — the list
  should already BE in position when the user first sees it. Prefer instant.
- Do not reach into `MpiTileSheet` internals; it exposes `getTile(id)` for
  exactly this (see `docs/component-contracts.md` § MpiTileSheet — state-dumb).

## Done when

Opening the picker with a model selected shows that model's tile centred in the
view, in both the image and video sections, with no visible scroll jump.
