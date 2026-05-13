# Continue From Last Frame — Plan

> Video continuation + combine. Adds context-menu actions on the video viewer
> + history/gallery cards, a new PromptBox toolbar organism in the history
> workspace, server-side ffmpeg concat for Extend/Combine, and selection-order
> badges on cards.
>
> Scope source: kanban entry "Continue from last frame." (BACKLOG → PLANNING).
> Full design captured in the kanban body.
>
> 6 large testable phases. Each phase is independently shippable and
> verifiable.

---

## Phase 1 — Foundations: selection-order, role-aware injectMedia, history-context multi-stage gate

**Goal:** Building blocks that unblock every later phase. Cards expose
chronological selection order. PromptBox accepts an explicit `role` on
inject. PromptBox in history workspace forces `Preview_Only=false` and hides
the multi-stage toggle. No new UI shown yet — verify via console.

- [x] **1.1 — Selection-order tracking on history + gallery**

    Both selection stores are `Set`-based today and lose chronological click
    order across mixed Ctrl/Shift mutations. Convert to insertion-stable
    structures and expose an ordered getter.

    1. `js/components/Compounds/MpiHistoryList/MpiHistoryList.js:60` — keep
       `_selection: Set<number>` as the source of truth (Sets preserve
       insertion order on `.add()`, but Shift-range adds bulk-rebuild; the
       fix is to rebuild via append, not via spread of a fresh Set).
       - On Ctrl+click: keep current `.add()` / `.delete()` calls.
       - On Shift+range: clear once, then `add()` each index in range order
         (do NOT use `new Set([...range])` — that's fine for order but make
         it explicit and add a comment).
       - On right-click auto-add (line 159): unchanged.
       - Add `el.getSelectionOrder()` instance API returning `[...this._selection]`
         (Array, chronological). Document in `js/components/types.js`.
    2. `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js:118` — same
       treatment on `_selectedIds: Set<string>`. Add
       `el.getSelectionOrder()` returning `[...this._selectedIds]`.
    3. Re-emit existing events unchanged (no payload break):
       - History: `selection-changed { indices, anchor }`. Note in code
         comment that `indices` order is chronological.
       - Gallery: `selection-start` / `selection-end` fire as today.

    **Verify:** Open browser dev tools. Multi-select 3 history cards in
    order C, A, B. In console:
    `gid('history-list').el.getSelectionOrder()` → `[indexOfC, indexOfA, indexOfB]`.
    Repeat in gallery: select 3 cards in non-sequential order. Console:
    `qs('.mpi-gallery-grid').el.getSelectionOrder()` → array in click order.

- [x] **1.2 — Role-aware `injectMedia` in MpiPromptBox**

    Today `injectMedia({ url, mediaType })` ignores role. `_withAssignedRoles`
    already prefers explicit `item.role` matches — we just need to plumb it
    through.

    1. `js/components/Organisms/MpiPromptBox/MpiPromptBox.js:457` —
       extend signature to `injectMedia({ url, mediaType, role })`.
       Pass `role` into `_tryAddMedia` (line 218 area) so the new chip is
       stored with the role field.
    2. Confirm `_withAssignedRoles` (line ~131) honors `item.role` before
       falling back to type-order matching. If not, fix it to.
    3. `js/components/types.js` — document the new optional `role` field.

    **Verify:** With PromptBox mounted in any workspace, in console:
    `qs('.mpi-prompt-box').el.injectMedia({ url: '/test-image.png', mediaType: 'image', role: 'endFrame' })`.
    Inspect `qs('.mpi-prompt-box').el._media` — the new chip should have
    `role: 'endFrame'`. Drop a second image (no role). Then inspect
    `_withAssignedRoles()` output — the role-tagged chip should map to
    the `endFrame` slot regardless of insertion order.

- [x] **1.3 — History-workspace context gate: force `Preview_Only=false` + hide multi-stage toggle**

    History workspace must never produce preview cards. Multi-stage models
    (WAN `i2v_ms`) still run, but stage-1 preview is suppressed.

    1. `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — pass a new
       context flag through `updateContext`: `historyMode: true` (set by
       `MpiGroupHistoryBlock` when mounting PromptBox).
    2. `js/components/Organisms/MpiPromptBox/PromptBoxControls.js` — when
       `_context.historyMode === true`, hide+disable the `previewStage`
       control entry (don't render it; persist any prior value untouched
       so non-history contexts keep their toggle state).
    3. `js/services/commandExecutor.js:208` — extend the `Preview_Only`
       gate. Today: injects when `operation.endsWith('_ms')`. New: also
       check `payload.historyMode === true` → force `false` regardless of
       previewStage toggle. Plumb `historyMode` through
       `runCommand`/`startGeneration` payload (one new optional field).
    4. `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` —
       at the mount site (line ~503), pass `historyMode: true` in the
       context. At the generation submit site (line ~599-610), pass
       `historyMode: true` in opts.
    5. `js/services/generationService.js` — propagate `historyMode` into
       the payload built for the executor.

    **Verify:** In history workspace with a WAN video item:
    1. Open PromptBox. Confirm the multi-stage "Preview initial stage"
       toggle is NOT rendered in the settings popup.
    2. In console, add a `clientLogger.info` (temporarily) at
       `commandExecutor._buildParams` showing the resolved `Preview_Only`
       value. Trigger a t2v/i2v generation. Confirm log shows
       `Preview_Only: false`. Open same workspace in gallery context →
       toggle present, log honors toggle.

---

## Phase 2 — Video-viewer context menu: "Set as start frame" / "Set as end frame"

**Goal:** Right-click on the playing video in `MpiVideoPlayer` opens
`MpiContextMenu` with two items. Items capture current frame (respects
active crop), upload as image, inject into PromptBox with the right role,
and auto-switch the model selector to an I2V-capable model if the current
model lacks I2V. Items are disabled if no installed model supports I2V.

- [x] **2.1 — Wire video-viewer right-click → MpiContextMenu with two items**

    Attach a `contextmenu` handler to the video element. Suppress native
    menu. Open `MpiContextMenu` with the two new items.

    1. `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js` — in
       `setup`, attach `on(videoEl, 'contextmenu', e => { e.preventDefault();
       emit('video-viewer:context-menu', { x: e.clientX, y: e.clientY }) })`.
       Use the existing `on()` shorthand. Push the cleanup into `_unsubs`.
    2. `MpiGroupHistoryBlock.js` — listen for `video-viewer:context-menu`.
       Build the menu items array:
       - `{ key: 'set-start', label: 'Set as start frame', disabled: <no I2V model>, onClick }`
       - `{ key: 'set-end',   label: 'Set as end frame',   disabled: <no I2V model>, onClick }`
       The `disabled` check is a helper `_anyInstalledModelHasI2V()` —
       scans `state.installedModels` for any with `i2v` or `i2v_ms` in
       `supportedOps`.
    3. Open via `MpiContextMenu.show({ x, y, items })`. Reuse the singleton.

    **Verify:** Open history workspace for a video item. Right-click the
    video. Menu opens with both items. If no I2V model installed (e.g.
    test by clearing `state.installedModels` via console), both items
    show greyed-out. Native browser menu does NOT show.

- [x] **2.2 — Set-as-start/end onClick: snapshot → upload → inject → model auto-switch**

    Wire the click handlers. Reuses `viewer.el.captureSnapshot()` (already
    respects active crop) and the existing crop-snapshot upload path.

    1. `MpiGroupHistoryBlock.js` — add `_setFrame(role)` helper:
       ```js
       async _setFrame(role) {
           const { blob, dataUrl } = await viewer.el.captureSnapshot();
           // Upload via the same path _handleCropSnapshot uses (lines ~673-705).
           // Extract the upload step into a small private helper if not already.
           const { filePath } = await uploadMediaFile(blob, /* ... */);
           // Auto-switch model if current lacks I2V.
           const currentModel = state.selectedModelIdByType.video;
           const model = getModel(currentModel);
           if (!model.supportedOps.some(op => op.startsWith('i2v'))) {
               const fallback = findFirstI2VCapableModel(state.installedModels);
               if (fallback) state.selectedModelByType = { ...state.selectedModelByType, video: fallback.id };
           }
           // Inject with role.
           this._pb.el.injectMedia({ url: filePath, mediaType: 'image', role });
           // Switch to prompt mode if not already.
           this.mountOptions('prompt');
       }
       ```
    2. Hook both `set-start` and `set-end` items in the menu items array
       to call `this._setFrame('startFrame')` / `'endFrame'`.
    3. Status bar feedback: `clientLogger.info('Captured frame as ' + role)`.

    **Verify:** Open history workspace for a video item generated by a
    model that supports I2V (e.g. WAN). Scrub video to mid-point.
    Right-click → "Set as end frame". Confirm:
    - PromptBox flips to prompt mode (visible).
    - Media strip shows ONE chip, mapped to the end frame slot
      (`_withAssignedRoles()` should put it in the endFrame slot).
    - Repeat with "Set as start frame" while still at a different frame —
      second chip appears, role startFrame.
    - Test with active crop box: confirm the captured image is the
      cropped region (smaller dims).
    - Test with a T2V-only model active: confirm the model selector
      auto-flips to an I2V-capable installed model (toast or
      clientLogger entry should confirm).

---

## Phase 3 — PromptBox toolbar organism (`MpiToolOptionsPrompt`)

**Goal:** New organism that mounts in `#right-top-slot` whenever the
history-workspace PromptBox is in prompt mode (video workspace only for
v1). Shows two thumb slots with a swap button between them and two action
buttons below. Thumbnails sync from PromptBox `_media[]` via the
`media-change` event. Drop on a thumb role-tags inject. Action buttons
emit semantic events that Phase 4 will wire to the server.

- [x] **3.0 — Hide PromptBox media strip in history workspace**

    Once the toolbar organism (3.1) renders Start/End frame thumbs, the
    PromptBox media-strip chips become redundant AND visually overlap the
    video player (see 2026-05-12 retest screenshot). Hide the strip
    whenever `_context.historyMode === true`.

    1. `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — add a
       root modifier class `mpi-prompt-box--history-mode` toggled from
       `updateContext` whenever `historyMode` changes (existing
       `prevHistoryMode` diff already in place from 1.3).
    2. `MpiPromptBox.css` — under `.mpi-prompt-box--history-mode
       .mpi-prompt-box-media-strip { display: none; }`. The chips still
       exist in `_mediaItems`; only their rendering in the strip is
       suppressed. Drop overlay + role-aware inject still function.
    3. Verify by entering history workspace on a video item, dropping
       an image, and confirming no chip appears below the prompt
       textarea. Re-enter gallery workspace → strip returns.

- [x] **3.1 — Build `MpiToolOptionsPrompt` organism + mount in `#right-top-slot`**

    One new component, one new CSS file, one new mount path. Keep it
    coarse — the whole organism is small enough that splitting into more
    todos creates forward-dependency risks.

    1. Create `js/components/Organisms/MpiToolOptionsPrompt/MpiToolOptionsPrompt.js`
       and `.css`. Mirror sibling layout in `MpiToolOptionsCrop` and
       `MpiToolOptionsMask`. Register in `js/shell/preloadStyles.js` per
       the Critical Rules Snapshot. Document props in
       `js/components/types.js`. Use `ComponentFactory.create()`.
    2. Template:
       ```
       .mpi-tool-options-prompt
         .mpi-tool-options-prompt__frames
           .mpi-tool-options-prompt__slot--start
             label "Start frame"
             .thumb (empty placeholder OR <img> from chip url)
             button.clear-slot (icon x, only when filled)
           button.swap (icon, no bg, vertically centered)
           .mpi-tool-options-prompt__slot--end
             label "End frame"
             .thumb
             button.clear-slot
         .mpi-tool-options-prompt__actions
           button.extend      "Extend"
           button.create-new  "Create new"
       ```
       Use icons from `js/utils/icons.js` (add `frameSlotPlaceholder` if
       absent, plus the swap icon).
    3. Setup:
       - Accept `promptBoxEl` prop (the live PromptBox instance).
       - Subscribe to PromptBox `media-change` via `Events.on` — payload
         carries the chip list. Re-render thumbs from the role-mapped
         list (call `promptBoxEl.el._withAssignedRoles()` or, cleaner,
         a new public `getMediaByRole(role)` accessor on PromptBox).
       - Hover on empty thumb: emit `status-bar:hint` with long copy
         ("Right-click a video frame → Set as start frame, or drop an
         image here.").
       - Drop on a thumb: read file from dataTransfer, upload via the
         shared upload helper (extracted in Phase 2), then call
         `promptBoxEl.el.injectMedia({ url, mediaType: 'image', role })`.
       - Click `x` on a filled thumb: call new `promptBoxEl.el.removeMediaByRole(role)`
         (add this helper if missing — small method that filters
         `_media[]`).
       - Swap button click: call new `promptBoxEl.el.swapMediaRoles('startFrame', 'endFrame')`
         (small method that flips role tags on existing chips, no
         re-upload).
       - Extend button click: emit
         `Events.emit('prompt-box-tools:extend')`.
       - Create-new button click: emit
         `Events.emit('prompt-box-tools:create-new')`.
       - Standard `destroy()` cleanup contract per Critical Rules Snapshot.
    4. `MpiGroupHistoryBlock.js` — in `mountOptions('prompt')`, mount
       `MpiToolOptionsPrompt` into `#right-top-slot` when current item is
       video AND `_hasPromptOps()` returned true. Pass the PromptBox
       instance. Push instance + unsubscribe into the block's cleanup
       list. Unmount on mode change.

    **Verify:** Open history workspace for a video item with a video
    model that has I2V. PromptBox tool button → prompt mode. Toolbar
    appears in the top-right slot with two empty thumbs + swap icon
    centered + two action buttons below. Drop an image from filesystem
    onto the START thumb: thumb fills, PromptBox media strip shows the
    same image as a chip with `role: 'startFrame'`. Drop another onto
    END: same. Click swap — both chips' roles flip; toolbar thumbs
    swap; PromptBox strip mirrors. Click `x` on START: chip removed
    from both views. Hover empty thumb: status bar shows the long
    hint copy. Click `Extend` and `Create new`: Events emitter (console
    listener temporarily) shows both events fire.

> **Phase 3 wrap-up notes (2026-05-12):**
> - Toolbar mount gate uses `isVideo && activeModel.supportedOps.some(op => op.startsWith('i2v'))` — NOT `_hasPromptOps()`, which requires imageCount>=1 and would hide the toolbar before any frame is injected. Force-mounts PromptBox in this case.
> - `.mpi-group-history-block__right-top` visibility rule switched from unconditional `display:none` on `--prompt-active` to `:empty`-scoped, so the slot stays visible when the toolbar mounts a child.
> - Status-bar hint event for empty-thumb hover is NOT wired — no consumer exists. Deferred.
> - Thumb sizing uses CSS only (`min-height: 5rem; max-height: 10rem; object-fit: contain;`). No aspect-ratio prop, no JS measurement — img drives its own ratio.
>
> **Phase 3 — Docs / Rules / Memory impact (defer to Phase 6.2 sync step):**
> - `.claude/rules/component-mounts.md` — register new organism mount: `MpiToolOptionsPrompt` into `#right-top-slot` (only when `isVideo && activeModel.supportedOps.some(op => op.startsWith('i2v'))`). Required props: `{ promptBox, project }`.
> - `.claude/rules/component-events.md` — list new MpiPromptBox instance APIs: `getMediaByRole(role)`, `removeMediaByRole(role)`, `swapMediaRoles(roleA, roleB)`. List new Events-bus emits: `prompt-box-tools:extend`, `prompt-box-tools:create-new`.
> - `.claude/rules/component-state.md` — note `mpi-prompt-box--history-mode` root modifier is toggled from `_context.historyMode` (no new state key).
> - `.claude/rules/components.md` — add note under "Stage design baseline" about the new `MpiToolOptionsPrompt` organism and the right-top slot `:empty`-scoped visibility rule.
> - `js/utils/icons.js` — new `swap` icon registered (already shipped — document if rule files index icons).
> - `js/shell/preloadStyles.js` — entry added (already shipped — no separate documentation needed).
> - Memory candidates (under `C:\Users\Fabio\.claude\projects\c--AI-Mpi-CubricStudio\memory\`):
>   - `feedback_history_toolbar_i2v_gate.md` — mount gate is `supportedOps.startsWith('i2v')`, not `_hasPromptOps()`. Reason: capacity-based gate hides the toolbar before user can inject the frame that unblocks it. Force-mount PromptBox in this branch.
>   - `feedback_right_top_slot_empty_visibility.md` — `.mpi-group-history-block__right-top` uses `:empty`-scoped hide under `--prompt-active`, so per-mode toolbars decide visibility by presence. Reason: image-history prompt mode keeps slot empty + hidden; video-history reveals when toolbar mounts.
>   - `feedback_thumb_css_only_aspect.md` — frame-slot thumbs use `max-height` + `object-fit: contain` only. No aspect-ratio prop or JS measurement. Reason: img element drives its own ratio; props/measurements were unnecessary.

---

## Convention — Per-phase "Docs / Rules / Memory impact" block

> **For every future Phase wrap-up note (and retroactively when a phase
> closes), include a block titled "Phase N — Docs / Rules / Memory impact"**
> listing exactly what the final phase-6 sync step (or end-of-plan close-out)
> must touch in:
>
> - `.claude/rules/*.md` (component-mounts, component-events, component-state,
>   component-comfy, components, dos_and_donts)
> - `docs/*.md` (PROJECT.md, comfy.md, shell.md, project-integrity.md,
>   versioning.md, any other affected subsystem doc)
> - Memory files under `C:\Users\Fabio\.claude\projects\c--AI-Mpi-CubricStudio\memory\`
>   (feedback / reference / project entries)
>
> Each entry MUST name the target file + a one-line description of the
> change/new content. This lets the final sync agent (or any new session
> picking up the plan) execute the docs/rules/memory step without having to
> re-derive what changed from git diffs. Treat it as the closeout checklist
> for the phase.

---

## Phase 4 — Server: ffmpeg concat route + extend post-process + sidecar fields

**Goal:** Two server entry points. `/extend-video` runs after a normal I2V
save-generation and concats `<source.mp4> + <new.mp4>` into a single
`extended_NNN.mp4`, writes the sidecar with `extendedFrom`. `/combine-videos`
takes a list of source item IDs in order and produces `combined_NNN.mp4`.
Both use concat-demuxer when ffprobe says codecs match; fall back to concat
filter (re-encode) otherwise. Progress streams to status bar.

- [x] **4.1 — Extend `ffprobeVideo` + add `routes/videoConcat.js`**

    1. `services/ffprobeVideo.js:45-52` — extend the parsed output to
       include `codec_name`, `pix_fmt`, `r_frame_rate`. Update the JSDoc
       return shape.
    2. Create `services/videoConcat.js`:
       - `async concatVideos(inputPaths, outputPath, { onProgress } = {})`.
       - Probes all inputs via `ffprobeVideo`. If `codec_name + pix_fmt + width + height + r_frame_rate` match across all inputs → concat-demuxer path:
         write a temp `concat.txt` with `file '<abs path>'` lines, run
         `ffmpeg -f concat -safe 0 -i concat.txt -c copy -y <output>`.
       - Else → concat-filter path:
         `ffmpeg -i a.mp4 -i b.mp4 -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -y <output>`.
         Handle the audio absence case (some videos lack audio — drop the
         `[0:a]` etc and `:a=1` accordingly).
       - Use `child_process.spawn` (NOT `execFile`) so we can parse
         stderr line-by-line for `time=HH:MM:SS.MS` progress. Estimate
         total duration as sum of input durations; emit
         `onProgress(0..1)` per line.
       - Reuse `services/ffmpegBinary.js` for the path.
    3. Create `routes/videoConcat.js`:
       - `POST /combine-videos { projectFolder, itemIds: [...] }` → resolves
         file paths, computes next `combined_NNN.mp4` filename via the same
         scan pattern used in `routes/projects.js:1133-1148`, runs
         `concatVideos`, writes sidecar (no `combinedFrom` field per kanban
         body — Combine has no source links), creates the gallery item via
         the same path used by save-generation, returns the new item.
       - `POST /extend-video { projectFolder, sourceItemId, generatedFilePath, op, frozenParams }`:
         resolves source path, runs `concatVideos([source, generated], <extended_NNN>.mp4)`,
         writes sidecar with `extendedFrom: { id: sourceItemId, displayName }`,
         attaches into the current history group. Returns the new item.
       - Both routes report progress via `clients` SSE channel (existing
         pattern from `routes/comfy.js`). Use a new event family
         `concat:progress { jobId, ratio }` / `concat:done { jobId, item }`.
    4. Register the routes in `server.js`.
    5. `js/services/clientLogger.js` ← no change. Add a tiny client-side
       progress consumer in `js/services/concatProgress.js` that listens on
       the SSE channel and bridges to `StatusBar.progress.*`.

    **Verify:** With the server running, POST manually via curl/dev tools:
    `curl -X POST http://127.0.0.1:3000/combine-videos -H "Content-Type: application/json" -d '{"projectFolder":"<abs>","itemIds":["id1","id2"]}'`.
    Observe in `logs/app.log` the ffmpeg invocation, codec-match decision
    (`clientLogger.info` lines added during dev), and final output file
    appearing in `<projectFolder>/Media/combined_001.mp4`. Open it in any
    video player — confirms the concat worked. Same for `/extend-video`
    with two known IDs. Check sidecar for the extend output contains
    `extendedFrom`.

---

## Phase 5 — Wire toolbar Extend/Create new + card context-menu items (Combine, Add to gallery)

**Goal:** Front-end paths into the server work added in Phase 4. PromptBox
toolbar's Extend/Create new buttons run the generation and (for Extend)
trigger the concat post-step. History + gallery card context menus get
Combine (multi-select) and Add to gallery (single item). Status bar shows
progress; toast on completion.

- [x] **5.1 — Toolbar Extend / Create new submit paths**

    1. `MpiGroupHistoryBlock.js` — listen for both events emitted by the
       toolbar in Phase 3:
       - `prompt-box-tools:create-new`: call `this._pb.el.run()` (or the
         existing internal submit path). Standard I2V save. No
         `replaceItemId`. No post-step. Lands as a normal new history
         entry. Naming follows existing pattern (`i2v_001` etc).
       - `prompt-box-tools:extend`: same submit path with an opts flag
         `extend: true` and `sourceItemId: <current viewer item id>`.
         Plumb through `generationService.startGeneration`.
    2. `js/services/generationService.js` — when `opts.extend === true`,
       after the normal I2V save-generation returns the generated file
       path, POST to `/extend-video` with `{ sourceItemId, generatedFilePath, frozenParams, op }`.
       Replace the just-saved gallery/history entry with the
       extend-output entry returned from the route (use the existing
       `replaceItemId` plumbing — pass the new item under the originally
       saved item's slot). Delete the intermediate generated file (the
       one passed to the concat) so disk doesn't bloat.
    3. Both buttons are disabled by the toolbar when at least one thumb
       is empty AND the active op has `requiresImages > 0` for that role
       (i.e. startFrame required). Toolbar reads PromptBox validity via
       a new `promptBoxEl.el.canSubmit()` accessor (likely already
       exists — verify).

    **Verify:** Open history workspace for a WAN video item. Drop an
    image into START thumb. Click "Create new":
    - Generation kicks off (mascot, status bar timer per existing flow).
    - On finish, new entry appears in same history group named
      `i2v_001` (or similar). Plays standalone.
    Repeat, click "Extend" instead:
    - Generation kicks off.
    - On generation finish, status bar transitions to "Concatenating
      videos…" with progress. Eventually a single new entry appears
      named `extended_001`. Plays back showing source video followed
      by new video, seamlessly. Sidecar (inspect via Files or dev
      tools) contains `extendedFrom: { id, displayName }`.

- [x] **5.2 — Card context menus: Combine + Add to gallery**

    Two additions to existing menus. Both surfaces (history + gallery)
    need the new items wired with the same shared handlers.

    1. `MpiHistoryList.js:167` — extend the items array:
       - Insert `{ key: 'combine', label: 'Combine', disabled: <_selection.size < 2> }`.
       - Insert `{ key: 'add-to-gallery', label: 'Add to gallery', disabled: <_selection.size !== 1> }`.
       Wire onClick to emit `history-list:combine-requested { indices }`
       and `history-list:add-to-gallery { index }`.
    2. `MpiGalleryGrid.js:664` — same items, but Combine disabled rule:
       `_selectedIds.size < 2 OR any selected group has non-video type`.
       Hide Add-to-gallery entirely (gallery → gallery is a no-op).
       Emit `gallery:combine-requested { groups }` and use selection-order
       Array from `getSelectionOrder()` (Phase 1.1) for sequencing.
    3. `MpiGroupHistoryBlock.js` + the higher block that owns gallery
       events — listen, resolve selected items to file paths + item IDs,
       POST `/combine-videos` with ordered IDs. On success the SSE
       channel adds the new entry to gallery (or current history group
       in history-workspace case).
    4. `Add to gallery` handler: call the same upload helper used by
       `_handleCropSnapshot` (extracted in Phase 2) with the source item's
       file. Lands a new gallery entry. Show toast "Added to gallery".

    **Verify:** History workspace, ≥2 video entries visible.
    Ctrl-click 3 cards in order #3, #1, #2. Right-click any selected
    card → menu shows Combine ENABLED. Click Combine:
    - Status bar progress "Combining 3 videos…".
    - On done, toast "Videos combined". New entry `combined_001`
      appears. Play it: video order is #3 → #1 → #2 (verifies
      chronological selection-order tracking from Phase 1.1).
    - Gallery: select a video + an image. Right-click → Combine
      DISABLED (status-bar hint or tooltip-equivalent shows reason).
    - History card with single video selected → right-click → "Add to
      gallery" → new gallery entry appears under the Image (or All)
      filter.

---

> **Phase 4 + 5 wrap-up notes (2026-05-13):**
>
> Implementation details NOT captured in original plan text — Phase 6.2
> must reflect these in rules/docs/memory.
>
> - `services/videoConcat.js` ships crop-zoom (scale-increase + center crop),
>   NOT pad. Per ComfyUI Combine node parity + user preference. Target dims
>   derive from first input (W/H/fps).
> - Audio-aware: all-silent → `-an`; any audio → AAC stereo 48kHz unified
>   output, silent inputs synthesized via `anullsrc` trimmed to probed duration.
> - SSE channel is its own stream `/concat/events/stream`, NOT piggy-backed
>   on `/comfy/events/stream`. Single EventSource opened eagerly on import
>   of `js/services/concatProgress.js`. Events: `concat:progress`,
>   `concat:done`, `concat:error` — all keyed by `jobId`.
> - `trackConcatJob({ jobId, label })` wraps StatusBar.progress + Promise.
> - generationService.startGeneration extended with `config.extend +
>   config.sourceItemId`. Extend post-step: POST `/extend-video`, await
>   concat, DELETE intermediate sidecar via `/project-media/...?itemId=`,
>   swap `builtItems[0]` to extended item. Failure path keeps intermediate
>   as regular new history entry — no work lost.
> - `_applyPreview` in MpiGroupHistoryBlock short-circuits for `isVideo`.
>   Player stays free during generation for parallel ops; mascot + StatusBar
>   drive feedback. Latent previews intentionally skipped — they're static
>   PNGs that can't be loaded into `<video>`.
> - Three-layer ffmpeg stderr truncation prevents the multi-paragraph filter
>   trace from reaching user toasts. Full stderr stays in `logs/app.log`.
> - Concat-demuxer fast path uses audio-shape gate too: `hasAudio` parity
>   AND (when audio present) `audioCodecName + audioSampleRate +
>   audioChannels` parity. Otherwise filter-path re-encode.
> - `ffprobeVideo` extended with `codecName, pixFmt, rFrameRate,
>   audioCodecName, audioSampleRate, audioChannels, audioChannelLayout`.
> - New `merge` icon added to `js/utils/icons.js` for Combine menu items.
> - Toolbar emits semantic events on Events bus only: `prompt-box-tools:extend`,
>   `prompt-box-tools:create-new`. Single listener in MpiGroupHistoryBlock
>   (video-only mount). Do not pre-wire elsewhere.
> - History list new emits: `combine-requested { indices }` (chronological),
>   `add-to-gallery { index }`. Gallery grid new emits: `combine { groups }`
>   (click order via Set insertion).
> - Future "real extend" video ops (VACE / multi-frame temporal context)
>   will supersede concat-based extend. Captured in memory entry
>   `feedback_real_extend_op_future.md` so a future session doesn't
>   redesign without context.

---

## Phase 6 — Visual polish: selection-order numeric badges + history "Extended from" badge + docs/rules sync

**Goal:** Numeric `1`, `2`, `3`... badges on cards during multi-select drive
visual confirmation of Combine order. History cards grow a row to show
"Extended from <name>" when sidecar contains `extendedFrom`. Docs + rule
files updated.

- [x] **6.1 — Numeric selection-order badges (history + gallery)**

    Visual layer over the chronological order already exposed in Phase 1.1.

    1. `MpiHistoryList.js` + `.css` — when `_selection.size >= 2`, render
       a small numeric badge on each selected card in the position
       already used by the existing `__status` cell (or a sibling). Show
       `#N` where N is the 1-based index in `getSelectionOrder()`. Hide
       when selection size drops below 2. Re-render the badges whenever
       `_selection` mutates.
    2. `MpiGalleryGrid.js` + `.css` — same, but badge at **top-center**
       per the kanban body. Position: `top: 0.6rem; left: 50%; transform: translateX(-50%)`.
       Z-index above thumb, below queued-preview center slot if any
       collision arises. Use `--accent-heat` background, rounded.
    3. Both should use a single small badge component or shared CSS
       class — they have identical content, only position differs.
    4. Ensure preview cards (which already have an `xN pending` center
       indicator) DO NOT collide. Per kanban: gallery numeric badge is
       "top-center, avoids queued preview center slot" — preview
       indicator is dead-center, our badge is at top edge. Visual test
       this case.

    **Verify:** Multi-select 3 history cards in order A, B, C. Badges
    show `#1, #2, #3` on those cards respectively. Re-click in
    different order — badges renumber. Same for gallery. Queue a
    preview-card generation, then multi-select including the queued
    preview card — badge sits at top while the pending counter stays
    centered, no overlap.

- [x] **6.2 — History card "Extended from <name>" row + docs/rules sync**

    Final visual + documentation.

    1. `MpiHistoryList.js:103-128` — when the entry's sidecar has
       `extendedFrom`, render a 4th meta row "Extended from <displayName>".
       Card auto-grows (grid is flex-y). Text uses a `--muted` ink token.
       Optional: small chain icon prefix from `js/utils/icons.js`.
    2. `.claude/rules/components.md` — append a short note under
       "Stage design baseline" about the new `MpiToolOptionsPrompt`
       organism and the multi-stage `historyMode` gate.
    3. `.claude/rules/component-mounts.md` — add the new organism's mount
       location.
    4. `.claude/rules/component-events.md` — list the new events:
       `video-viewer:context-menu`, `prompt-box-tools:extend`,
       `prompt-box-tools:create-new`, `history-list:combine-requested`,
       `history-list:add-to-gallery`,
       `gallery:combine-requested` (gallery grid emits `combine` →
       MpiGalleryBlock handles),
       `concat:progress`, `concat:done`, `concat:error`.
       Also: MpiPromptBox new instance APIs `getMediaByRole(role)`,
       `removeMediaByRole(role)`, `swapMediaRoles(roleA, roleB)`,
       `getRunPayload()` (already shipped; document for future callers).
    5. `.claude/rules/component-state.md` — note: `historyMode` context
       flag on PromptBox; no new state keys.
    6. `.claude/rules/component-comfy.md` — note: `historyMode` forces
       `Preview_Only=false` for `_ms` ops AND latent-preview painting
       is short-circuited for video workspace (`_applyPreview` early-
       returns when `isVideo`). Mascot + StatusBar still drive feedback.
    7. `.claude/rules/component-mounts.md` — also add the new SSE
       channel: `/concat/events/stream` (server) + single-stream
       EventSource opened on import of `js/services/concatProgress.js`.
    8. `docs/PROJECT.md` — one-line pointer to the new flows.
    9. New server route docs in `docs/comfy.md` or sibling: document
       `POST /combine-videos`, `POST /extend-video`, `GET /concat/events/stream`,
       and the shared `services/videoConcat.js` (crop-zoom filter path,
       audio-aware unification, demuxer fast-path conditions).
    10. Memory entries (under `C:\Users\Fabio\.claude\projects\c--AI-Mpi-CubricStudio\memory\`):
       - `feedback_history_no_multistage.md` — history workspace always
         forces `Preview_Only=false`.
       - `feedback_selection_order_chronological.md` — `getSelectionOrder()`
         is the canonical chronological accessor; Set insertion order
         alone is fragile across Shift-range rebuilds.
       - `feedback_ffmpeg_concat_strategy.md` — concat-demuxer when
         codec/pix_fmt/fps/dims/audio-shape match across all inputs;
         fall back to filter (re-encode) otherwise; spawn (not execFile)
         for stderr `time=` progress parsing.
       - `feedback_concat_crop_zoom.md` — concat-filter normalizes per-
         input with `scale=W:H:force_original_aspect_ratio=increase` +
         `crop=W:H` (center). Matches ComfyUI Combine nodes. Do NOT
         switch back to scale-decrease + pad; user wants crop-zoom.
         Target W/H/fps derive from first input.
       - `feedback_concat_audio_strategy.md` — audio-aware: all-silent
         inputs → `-an`; any audio → output has audio, silent inputs
         padded via `anullsrc` AAC stereo 48kHz `atrim=duration=<probed>`.
         Real audio resampled to same AAC stereo 48kHz. Future-proof
         for LTX audio output + imported videos with audio.
       - `feedback_video_workspace_no_latents.md` — `_applyPreview` in
         MpiGroupHistoryBlock short-circuits when `isVideo`. Latent
         previews are PNG/JPG frames, not playable in `<video>`, and
         the user wants the viewer free for parallel ops during gen.
       - `feedback_ffmpeg_stderr_truncate.md` — three-layer truncation
         to keep user-visible toasts short: server route response
         (first line, 200 char), `generationService` extend catch
         (160 char), Block combine catches (160 char). Full stderr
         stays in `logs/app.log` via clientLogger + server logger.
       - `feedback_extend_intermediate_cleanup.md` — `/extend-video`
         server route deletes the intermediate `.mp4`; client side
         `generationService` DELETEs the intermediate sidecar via
         `/project-media/...?itemId=...`. Both must run for the
         intermediate to disappear from history.
       - `feedback_concat_dim_mismatch_eviction.md` — concat-filter
         rejects mismatched input dims with EINVAL (exit 4294967274
         on win32). Must always normalize via scale+crop per input
         even when probes appear identical, because aspect/SAR can
         still differ. Don't try to skip the chain on "same dims".
       - `feedback_real_extend_op_future.md` — future video models
         with multi-frame temporal context (VACE etc.) will supersede
         the current concat-based Extend. They'll write `extendedFrom`
         themselves via save-generation; `/extend-video` becomes a
         fallback path OR is deleted. Out of scope for this plan.

    **Verify:**
    - In history workspace, find or generate an extend output (Phase 5).
      Confirm the card shows "Extended from <source name>" as a 4th
      meta row. Card height has grown to accommodate. Source name is
      legible.
    - Open each rule file and confirm the new sections are present and
      coherent. Open each memory file and confirm content.

---

## Cross-cutting risks (handle while executing)

- **R1: ffmpeg-static Linux arm64.** `electron-builder.yml` ships only
  `linux-x64`. If the team plans an arm64 Linux build, add the arm64
  binary or document the gap. Out of scope for this plan but call it
  out in Phase 4 review.
- **R2: Audio handling.** WAN outputs are likely silent. If concat-filter
  fallback ever runs against one-with-audio and one-without, the filter
  must adapt. `concatVideos` should probe `hasAudio` per input and pick
  filter shape accordingly.
- **R3: replaceItemId in extend.** Phase 5.1 reuses `replaceItemId` for
  the post-concat swap. Confirm during execution that history-workspace
  appends honor this without leaving the intermediate file in the gallery.
- **R4: Preview-card center collision in gallery.** Per Phase 6.1 final
  check — visually confirm with an actually queued preview card.
- **R5: Selection-order rebuild on filter/sort in gallery.** Gallery
  `_renderedOrder` rebuilds on filter changes. If a user multi-selects
  → changes filter → fires Combine, the order may scramble. Decide in
  Phase 1.1 implementation: either (a) preserve `_selectedIds` Set
  iteration order across filter rebuilds (already the case for click
  order, just verify), or (b) drop selection on filter change.

---

## Execution

Run `/mpi-kanban:mpi-execute-next` to start Phase 1.1. Each to-do briefs
before any code, waits for the user "go" gate, then implements and asks
the user to run the Verify step.
