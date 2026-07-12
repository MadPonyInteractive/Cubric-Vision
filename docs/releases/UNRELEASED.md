# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## whatIsNew

- **Krea 2 Turbo** — a new high-quality image model with a distinctive photographic look. Ships nine built-in style LoRAs, an in-prompt enhancer, 1K/2K output, and a depth-guided **Pose Reference** operation that transfers a subject's pose from a reference image.
- **Krea 2 Turbo NSFW** — Lustify Krea, an uncensored Krea 2 variant by Coyotte (creator of the Lustify SDXL model). Same photographic look, style LoRAs and Pose Reference as Krea 2 Turbo, as a separate installable model. Runs fastest on NVIDIA RTX (20-series and newer).
- **Image to Image on every image model** — the Image to Image operation is now available on all image models. Feed it an input image and a prompt to reshape the image toward your description; the Denoise slider controls how much it changes.
- **Open in file system** — right-click any gallery card (or multiple) and choose the new "Open in file system" option to reveal the media file in your file browser.
- **Crop ratios + Divisible by** — the Crop tool now offers a Ratio / Free choice with a full ratio set including cinema formats (2:1, 1.85:1, 21:9, 2.39:1), plus a "Divisible by" control (default 16) that snaps crop output to clean multiples. Resize also defaults to 16.
- **Clear mask from any tool** — right-click the image viewer to open a context menu with a "Clear mask" entry, so you can wipe the painted mask without opening the Mask tool first.

## fixes

- Fixed a missing LoRA (its folder removed from Settings) showing the crash-report dialog instead of a clear "not found in your LoRA folders" notice, and no longer leaving the queue stuck with an unresponsive Stop button.
- Image to Image now actually uses your input image — it was previously ignored on some models.
- Batch now renders the requested number of images instead of a single one.
- Reuse Prompt now restores the style, stylization, quality tier and batch, not just the prompt text.
- New projects open Krea 2 on the 1K quality tier instead of 2K.
- Auto-mask (the Detect button in the Mask tool) no longer fails on Windows with a model-path error.
- First-time engine setup no longer leaves some model components uninstalled when one of them hits a snag mid-install, and no longer leaves behind duplicate download files.
- Your chosen operation (Upscale, Pose Reference, etc.) is no longer reset back to Image to Image when you switch between the Gallery and History, change models, or reuse a prompt.
- In image models, the Upscale operation's denoise parameter sensitivity was changed to match ComfyUI.
- In the Resize tool, the padding-color picker now appears only for the solid **pad** fit mode, where it actually applies — it no longer shows for the edge-fill modes (pad edge, pad edge pixel, pillarbox blur), which ignore it. New resizes also default **Divisible by** to 16.
- After deleting one or more history entries, the remaining entry is now correctly selected and active, and whatever tool you had open (Crop, Mask, etc.) stays live — previously the active tool would drop out and you had to re-select the entry to get it back.
- Reuse Prompt on an app-generated result now offers two choices — **Prompt Box** (drop the prompt and images straight into the prompt box, honoring the Use checkboxes) or **App** (reopen the app with its saved inputs) — instead of always reopening the app.
