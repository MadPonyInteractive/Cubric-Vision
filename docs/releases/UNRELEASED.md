# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## whatIsNew

- **Krea 2 Turbo** — a new high-quality image model with a distinctive photographic look. Ships nine built-in style LoRAs, an in-prompt enhancer, 1K/2K output, and a depth-guided **Pose Reference** operation that transfers a subject's pose from a reference image.

## fixes

- Fixed a missing LoRA (its folder removed from Settings) showing the crash-report dialog instead of a clear "not found in your LoRA folders" notice, and no longer leaving the queue stuck with an unresponsive Stop button.
- Image to Image now actually uses your input image — it was previously ignored on some models.
- Batch now renders the requested number of images instead of a single one.
- Reuse Prompt now restores the style, stylization, quality tier and batch, not just the prompt text.
- New projects open Krea 2 on the 1K quality tier instead of 2K.
- Auto-mask (the Detect button in the Mask tool) no longer fails on Windows with a model-path error.
