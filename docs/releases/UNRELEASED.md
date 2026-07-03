# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## importantChanges

- **Models can now install individual operations.** Some models can do more than
  one thing (e.g. Wan 2.2 does both **text-to-video** and **image-to-video**), and
  each capability has its own large weights. Instead of forcing you to download
  everything, the Models page now shows a toggle per operation inside the model
  card — pick only the ones you want. **Wan 2.2 Smooth** is a single model again
  (no more separate T2V/I2V packs): install just Text-to-Video, just Image-to-Video,
  or both. The shared parts (VAE, text encoder) download once and are reused. The
  download size on the card updates live as you toggle operations.
  - The button reads **Install** when nothing's installed, **Update** when you've
    changed your selection on an already-installed model, and **Uninstall** to
    remove the whole model. Updating to add an operation downloads only the new
    weights; removing one (after a confirm) deletes only that operation's files and
    keeps everything the rest still needs.
  - Operations you didn't install simply don't appear as options in the prompt box,
    so you never pick something that isn't downloaded. Install one later and it
    shows up automatically.
  - Image models (SDXL, etc.) are unchanged — their operations all ship together,
    so they have no toggles and install/uninstall exactly as before.

- Removed the Settings → External Connections "ComfyUI API URL" field. It was
  non-functional dead config: the app never read it, and generation always used
  the built-in engine address. The 1.0.0 tutorial mentions this field — call
  out explicitly that it is gone and was never wired. Pointing Cubric Vision at
  a separately running ComfyUI instance is not supported.

## whatIsNew

- **New model: NVIDIA PiD Upscaler.** A generative 4× image upscaler that adds real
  detail instead of just resizing. Pick the look with one control — **Flux** (faithful,
  natural colour), **SD3** (sharp), **Qwen** (natural all-rounder), or **SDXL**
  (crisp, punchy) — set the output size (1K / 2K / 4K), and use the denoise slider to
  dial how much new detail it invents. Feed it any image (reuse a prompt to guide the
  result) and it upscales any aspect ratio, not just squares. Image-only.

- **New model: Wan 2.2 5B.** A fast, low-tier video model that does both
  **text-to-video** and **image-to-video** in one compact download (720p). It ships
  with a 4-step Turbo mode for quick drafts — ideal for iterating on a shot before
  committing to a heavier model. Image-to-video is its strong suit.

- **Wan 2.2 Smooth video quality boost.** Reworked the two-stage sampling schedule
  for **text-to-video** and **image-to-video**. Stage-1 (motion preview) now closely
  matches the final result instead of regenerating it, and stage-2 resolves more real
  detail — sharper output, more consistent character/composition between the preview
  and the final. Image-to-video runs best at 720×1280.

- (RunPod Remote Engine — add the full feature notes here when MPI-64 ships.
  Session additions to fold into that writeup: **Minimum system RAM** — optionally
  require the Pod host to have at least N GB of system RAM (Settings → RunPod), useful
  for heavy models that offload weights to RAM; and a **live volume disk-usage bar** in
  Settings showing used / total GB while connected to a Pod.)

- **New video model: LTX 2.3.** A fast video model that generates **with sound** —
  give it a reference clip to guide the voice, or feed in your own audio to drive
  the result. Does both **text-to-video** and **image-to-video**, and supports
  **first-frame / last-frame** guidance: drop a start image, optionally an end
  image, and it animates between them. Pick the quality you want from the tier
  selector, now including **2K and 4K** for LTX. The **Generate Audio** toggle
  controls whether the model produces its own audio track; attach an audio clip and
  the **Reference / Original** options take over to guide it from your file.
  - **Quality is now remembered per model.** Each video model keeps its own quality
    tier — switching between Wan and LTX (or reusing a prompt across them) no longer
    carries one model's setting onto another. Reusing an LTX 2K/4K result onto a
    model that doesn't go that high lands at that model's top quality instead.
  - LTX previews are **Finish-only**: preview a clip, then Finish to render it at
    full quality. There's no "generate from" branch (that's a Wan-only option,
    where a separate second-stage LoRA varies the result) — on LTX the second
    stage matches the preview, so you continue it in place.

- **See how much memory a model needs before you install it.** Each model on the
  Models page now shows a size tier — **Low**, **Balanced**, or **High** — and you
  can filter the list by tier. Hover a model's tier badge for a **memory table**
  that spells out the real trade-off: a model doesn't need one fixed amount of VRAM,
  it needs *some VRAM plus system RAM to cover the rest*, and the table shows how
  much RAM you'd need at each VRAM level. Your own GPU's row is highlighted — your
  local card when running on your machine, or the connected Pod's GPU when you're on
  a RunPod remote engine. The prompt-box model dropdown also tags entries **L / B /
  H** when you have two tiers of the same model family installed, so you can tell
  them apart at a glance. (Estimated model need; excludes normal OS usage.)

- **Hover to hear your clips.** Hovering a video card in the gallery now plays its
  audio; hovering an audio card plays it too (the stop button shows while it plays,
  and clicking still stops it). Only one card plays at a time, so sounds never
  overlap. Toggle it in **Settings → App Behavior → "Play audio on hover"** (on by
  default).

- **Your prompt drafts now survive navigation.** Prompt text (positive + negative)
  and staged input media (start/end frames, input video) typed into a prompt box no
  longer vanish when you switch between the gallery and a card's history view — come
  back and your draft is still there. Drafts are kept separate per surface: what you
  compose in the **gallery** stays in the gallery, and what you set up against a
  **card** stays with that card. Opening a different card shows a clean prompt box,
  never the previous card's text or images. (Drafts are session-only and clear on app
  restart; dragged-in files that weren't saved into the project can't be restored.)

- **Rename your gallery cards.** Right-click any gallery card for a new **Rename**
  option — give a result your own name (e.g. "hero shot", "client pick") instead of
  the auto-generated label. Type inline on the card, press Enter to save or Escape to
  cancel; clear the name and press Enter to go back to the original. The custom name
  shows on the card, in the history breadcrumb, and on the prompt-box chip when you
  drag the card in — and it sticks across navigation and project reloads. Works for
  image, video, and audio cards.

- **Smarter OS notifications.** Desktop notifications now fire whenever the app is
  not focused — not just when it's minimized — so a generation that finishes while
  Cubric is sitting behind another window still pops a notification. New: when a
  model finishes downloading and the app isn't focused, you get a `"<model>
  installed."` notification too. When the app is focused, you still get the in-app
  toast only (no OS notification).

- **Choose which desktop notifications you get.** Settings → App Behavior → Desktop
  Notifications now has two toggles — **Generation complete** and **Download
  complete** — so you can turn off the OS notification for either independently
  (both on by default). Handy when you queue a batch of fast generations and don't
  want a pile-up of system notifications. In-app messages are unaffected — this only
  controls the OS-level notifications that pop while Cubric is in the background.

- **Drag-and-drop model import (LoRA & upscale).** Settings → External Connections
  and the Model Settings picker now show each of your configured model folders as a
  drop zone — drag a `.safetensors` / `.ckpt` / `.pt` / `.bin` / `.pth` onto the
  folder you want and Cubric copies it there (the original stays put). The picker
  list refreshes immediately so the model is ready to select. Dropping a file that
  already exists asks before replacing.

- **Missing-model feedback.** If a project references a LoRA or upscale model whose
  file is no longer in any of your model folders, the Model Settings dropdown now
  flags it in red as `(missing)`. Trying to generate with a missing **LoRA** is
  blocked with a clear toast (so a missing LoRA can't be silently dropped from your
  result); a missing **upscale** model automatically falls back to the built-in
  default and warns, so the generation still runs.

## fixes

- **Wan 2.2 Smooth — sharper draft tier.** The lowest quality tier's resolution was
  raised (it was too small to be useful), so quick low-tier drafts now look much
  better.

- **Model installs are much faster.** Model downloads now come from a faster
  network, so installing a model takes a fraction of the time it used to.

- **Cards no longer keep playing after you scroll away.** Scrolling the gallery
  could leave a card's audio or video still playing off-screen, because moving the
  card out from under a still cursor doesn't register as "stopped hovering". Hover
  sound now stops correctly when a card scrolls out of view.

- **The model-downloads panel no longer flashes on every refresh.** Opening the
  panel, finishing or cancelling a download, or toggling a model's operations
  rebuilt the whole list each time, so it visibly flickered — even when nothing had
  actually changed. The list now only redraws the cards that genuinely changed, so
  it stays steady through refreshes and download activity.

- **Cancelling a remote download now clears its leftover bytes immediately.** When
  running on a RunPod remote engine, cancelling an in-progress model download left
  the card showing the pre-cancel "partially installed" size until you triggered
  another refresh, making it look like the cancel hadn't cleaned anything up. The
  partial files are now deleted on the Pod as part of the cancel, so the card
  updates to the correct size right away.

- **Stop now works from a card's prompt box.** Running an op (e.g. Extend) against a
  card in the history view left the prompt box's **Stop** button greyed out, forcing
  you to go back to the gallery and stop from the queue panel. The history prompt box
  now enables inline Stop while one of its jobs is running, so you can cancel right
  where you started it.

- **Universal upscale workflows now honor each model's native scale.** `image_upscale`
  and `video_upscale` previously assumed every upscale model was 4x, so 1x/2x/8x
  models produced output at the wrong final size even when the requested upscale
  factor was correct. The workflows now read the loaded upscale model's actual
  multiplier and divide the requested factor by that value before the final
  lanczos resize, so the result matches the requested upscale amount regardless
  of which compatible upscale model is selected.

- **LoRA/upscale models in subfolders failed to load on Windows.** Models stored in
  a subfolder (e.g. `loras\SDXL\name.safetensors`) were sent to the engine with the
  wrong path separator and rejected with "Prompt outputs failed validation". The
  model list now uses the engine's native path format, so subfolder models load
  correctly. (Also shipping as a 1.0.1 hotfix.)

- **Relocated models no longer show as missing.** If a model file moves between your
  configured folders (e.g. you remove an extra folder but the same file still lives
  in your primary folder), Cubric now finds it by name and updates the saved path
  automatically instead of flagging it as missing — as long as the match is
  unambiguous. If two different folders contain a same-named file, it stays flagged
  so you can pick the one you mean.

- **Project & card notes.** Right-click a project on the Stage picker for two new
  options: **Project notes** (in-app editor backed by the project's `project.md`
  file) and **Open project folder** (reveals the project in your OS file
  browser). Right-click any gallery card for a new **Card notes** option — jot
  notes against an individual result; they're saved into the card's metadata and
  travel with the project. Notes editing uses a new lightweight overlay
  (text area + Save/Cancel).

- **Wan LoRA settings no longer show an inert Clip slider.** The Model Manager
  LoRA slots for **Wan 2.2** showed both **Model** and **Clip** strength — but Wan
  only uses Model strength, so the Clip value did nothing. Wan now shows just the
  Model strength (other models still show both where they apply). Also fixed the
  strength value clipping inside its input box.
