# MPI-671 — an import must show up the moment it starts

## Why

A 474 MiB clip dropped on the gallery shows **nothing at all** until the whole
import finishes — the copy, the ffprobe, the first-frame poster and a 720p proxy
transcode of a 91 s 4K120 HEVC 10-bit source, all inside one HTTP request that
reports no progress and logs nothing.

The user read that as a hang and closed the app. It was not a hang: the copy had
completed (`Media/imported_015.mp4`, 497,657,819 bytes, exact), the poster was
written, and the proxy was 41% done (3,145,776 of 7,673,004 bytes) when the
process died. The route writes the sidecar **last**, after the derivatives, so
no sidecar was written, no card appeared, and ~500 MB was left orphaned —
invisible even to `/backfill-media-derivatives`, which iterates sidecars.

A second, patient attempt worked (`imported_016`, 2160x3840, 91 s). The import
is correct; it is just silent. The user reports the same complaint for a 10 GB
LoRA drop, which at least raises a toast.

## Shape

**Reuse the placeholder the gallery already renders for a generation.** A
placeholder group is a plain object the grid understands —
`{ id, type, name, history, selectedIndex, width, height, isGenerating: true }`
(`MpiGalleryBlock.js` `mkPlaceholder`) — and `isGenerating` is what puts
`.mpi-group-card__spinner` on the card. An empty `history` is already a
supported case: a t2i run with no start frame mounts exactly that. So there is
no new component and no new grid code here.

**Emit from the service, not the drop handler.** `uploadMediaFile`
(`js/services/mediaUploadService.js`) is the single ingest path — the gallery
drop, the PromptBox drop, snapshots and the recorder all go through it. Putting
the two events there means every surface gets the placeholder; putting them in
the gallery's `onDrop` would fix one of four.

- `media:import-started` — `{ tempId, filename, mediaType }`, before the upload.
- `media:import-settled` — `{ tempId }`, in a `finally`, so a failure clears the
  card rather than leaving it spinning beside MPI-670's `ui:danger` toast.

**One prefix helper.** `MpiGalleryBlock` keeps `_importPlaceholders`
(tempId → group) and a `_leadingGroups()` that concatenates it with the existing
`_placeholdersForFirst()`. All 8 `setGroups` call sites go through it, so a
future call site cannot quietly drop the placeholders — today six of them
already have to remember `..._placeholdersForFirst()` by hand.

## Deliberately not in scope

- **Real progress (a percentage or a bar).** That needs the route to stream
  state back for a copy and an ffmpeg run; a spinner is what was asked for and
  it is what removes the ambiguity.
- **Surviving a restart.** "Persistent" here means the card stays for the life
  of the import, not that it is resumable across a relaunch — that would need
  server-side job state.
- **A size threshold before showing the card.** A fast import will flash a
  spinner card for a moment. Marked with a `ponytail:` comment naming the
  threshold as the upgrade path if the flicker turns out to annoy.
- **The orphan already on disk** (`imported_015.mp4` + its two derivatives) and
  whether an aborted import should clean up after itself. Separate concern —
  this card stops the user aborting, it does not make aborting tidy.
