# 03 — Storage & Reuse

Where dropped app files go, and how Reuse reopens an app with its inputs restored. Read
[README](README.md) first.

## App input files → `.preview-assets`, NOT the gallery

A file dropped into an app slot is placed in the project's **content-addressed preview-assets
store** (`Media/.preview-assets/<sha256><ext>`, the MPI-227 store), NOT imported as a gallery
card. Rationale (user decision, MPI-259):

- **Clean gallery** — an app input isn't an output; it shouldn't clutter the gallery. If the
  user wants a card, he imports it himself (PromptBox drop still creates cards).
- **Durable + reuse-resolvable** — the file persists in the project, deduped by content hash,
  so a later Reuse can resolve it. Nothing deletes it except the manual Cleanup command.

### The path

- `MpiBaseApp._placePreviewAsset(file, mediaType, project)` reads the file to a data URL and
  POSTs to **`/project-media/:id/place-preview-asset`** (`{dataUrl, ext}`).
- The route (`routes/projects.js`) wraps the shipped `placeContentAsset` → writes to
  `Media/.preview-assets/<sha256><ext>`, dedups identical bytes to one file, returns the
  `/project-file?path=…` URL.
- The slot stores that URL; the injector resolves it at Run (see [02](02-media-io.md)).
- **No `media:imported` event** is emitted (that path creates a gallery card — deliberately NOT
  used for app inputs). Do not re-add it.

Contrast: the PromptBox uses `uploadMediaFile` + emits `media:imported` (a visible Media/ file
+ a gallery card). Apps deliberately diverge — `.preview-assets` + no card.

## Sidecar provenance (Reuse)

App gens add TWO additive top-level fields to the `.meta` sidecar: **`appId`** + **`appInputs`**
(the input snapshot at Run time; media by reference, never base64). Plumbed at the save site
(`generationService` save-generation) AND on the **live in-memory item** (`baseProps` →
`createImageItem`/`createVideoItem`) — **both are required**:

- the **sidecar** survives restart (the reconciler hydrates it on project load),
- the **live item** makes Reuse work in the SAME session before any reload.

Parity `appId:null`/`appInputs:null` defaults exist on every non-app item factory + synthetic/
upload/crop path.

> **Snapshot at Run (dispatch), never at completion.** `appInputs` is frozen when Run is
> pressed (`state.s_appInputs`), so changing an input while the gen runs can't corrupt what
> Reuse restores. This is the same discipline the PromptBox control pipeline now follows
> (MPI-336). If an app ever surfaces a real `PROMPT_BOX_CONTROLS` control (vs its own
> `getInputs`/`stepValues`), its `scope` follows the [shared] contract in
> [../common/prompt-box-controls.md](../common/prompt-box-controls.md).

## Reuse routing — `openAppFromReuse(item)`

Reuse on an app card reopens the **App** with its inputs restored, NOT the PromptBox.
`openAppFromReuse(item)` is shared by Gallery + History `_applyPromptReuse`, called at the TOP
(above the `_pb` guard and History's cross-mediaType reject):

- unknown / no `appId` → returns false, normal reuse continues.
- missing required model → `ui:warning` + `apps:open` (route to Library to install).
- else → seed `state.s_appInputs[appId] = item.appInputs` (BEFORE emit) + emit `app:open` on the
  **next tick** (`setTimeout(…,0)`) — the reuse popup's teardown fires a bare
  `ui:close-all-popups` that would otherwise hide the just-opened App.

`itemHasReusablePrompt` also returns true for `item.appId` so the Reuse button renders on app
cards.
