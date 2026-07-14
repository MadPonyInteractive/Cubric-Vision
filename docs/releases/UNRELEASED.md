# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## whatIsNew

- **Remove Background** — a new History tool (under Enhance) that cuts the background from any image using BiRefNet. Output a transparent PNG, or fill the background with a color of your choice.
- **Krea 2 Turbo** — a new high-quality image model with a distinctive photographic look. Ships nine built-in style LoRAs, an in-prompt enhancer, 1K/2K output, and a depth-guided **Pose Reference** operation that transfers a subject's pose from a reference image.
- **Krea 2 Turbo NSFW** — Lustify Krea, an uncensored Krea 2 variant by Coyotte (creator of the Lustify SDXL model). Same photographic look, style LoRAs and Pose Reference as Krea 2 Turbo, as a separate installable model. Runs fastest on NVIDIA RTX (20-series and newer).
- **Image to Image on every image model** — the Image to Image operation is now available on all image models. Feed it an input image and a prompt to reshape the image toward your description; the Denoise slider controls how much it changes.
- **Open in file system** — right-click any gallery card or History entry (one or several) and choose the new "Open in file system" option to reveal the media file in your file browser.
- **Crop ratios + Divisible by** — the Crop tool now offers a Ratio / Free choice with a full ratio set including cinema formats (2:1, 1.85:1, 21:9, 2.39:1), plus a "Divisible by" control (default 16) that snaps crop output to clean multiples. Resize also defaults to 16.
- **Clear mask from any tool** — right-click the image viewer to open a context menu with a "Clear mask" entry, so you can wipe the painted mask without opening the Mask tool first.
- **History tool rail tooltips** — hover any tool icon in the History workspace to see its name as a tooltip; the rail icons are also slightly larger for a cleaner layout.
- **Boogu Image Edit** — a unified 10B instruction image editor (Apache-2.0). Describe the change you want and it edits the whole image while preserving the rest. Ships in two quality tiers (High / Balanced) you install separately: High for the best quality with the full-precision weights, Balanced for a fast, lower-VRAM edit that stays consistent across GPUs.
- **Gallery view remembers your layout** — the gallery card-size slider and info-mode (card badges) toggle now persist across app restarts.
- **Meet the mascot** — while a card is generating, our mascot now keeps you company: it hovers in the center looking around while it waits, then tucks into the corner with a focused "waiting" pose once the preview starts coming in.
- **Export GIF** — a new History tool (under Export, video only) that turns your clip into an animated GIF. Pick the frame rate, output size (fixed width or height, aspect kept), and loop count, hit Generate preview to see the result and its file size, then Export to save it anywhere.
- **Floating latents when minimized** — minimize the app mid-generation and a small always-on-top window shows your live latents, side by side for multiple generations. Close it with the X or click a preview to jump back to the app. When a generation finishes, its preview stays put — showing the final result with a friendly "Done" badge — so the window waits for you instead of vanishing; click it to jump straight to the result. It remembers where you put it and how big you made it. Turn it off in Settings.
- **Reuse Prompt, refreshed** — the Reuse Prompt dialog is now a cleaner toggle list: each part (prompt, settings, model, images…) is a full-width switch with a clear on / off state, and an All / None shortcut to set them in one click.
- **Notification sound** — a sound now plays when something finishes that you weren't watching for — a generation completes, a model finishes installing, the engine restarts. A whole batch plays the sound once, at the start, not per item; notifications you triggered yourself (Connect, Install, Cue) stay silent. Toggle it in Settings under Notifications.
- **Settings, redesigned** — the Settings panel got a full visual pass: every option is now a clean row with its control on the right and a plain-language description on the left, grouped into clearly-titled sections. On/off options are proper toggle switches that light up when active, and the RunPod, model-folder, and notification areas all read as one consistent system instead of a wall of checkboxes.
- **Drag a card anywhere** — gallery cards are now proper drags: pull one out to another application to export it, or just click-drag it a couple of inches and let go — it drops straight into the prompt box, no careful aiming at the box required.
- **RunPod unlocks with your API key** — the separate "Enable RunPod remote engine" switch is gone. Saving a RunPod API key now reveals the remote-engine controls directly, so there's one less toggle to find. The Account section explains up front that generation stays local until you Connect and that GPU and storage billing happen on your own RunPod account.

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
- Connecting to a RunPod GPU is now reliable when you look away mid-connect: switching to the Gallery, another app, or focus — or closing the Settings panel — no longer makes the progress flicker, stick at 0%, reset, or (in one case) leave the Pod connected while the app stayed stuck on "connecting". The percentage climbs smoothly to ready no matter what you do while it connects.
- Selecting multiple gallery cards is no longer cancelled when a running generation finishes — your selection (and select mode) now survives the gallery refresh.
- Re-running a video or image operation that reuses a filename (Combine, Crop, Reverse, Export GIF, and others) no longer plays back a previous — sometimes already-deleted — result; the app now always shows the freshly-generated media.
- The Uninstall dialog no longer shows an "Also delete model files from disk" checkbox that did nothing when unchecked (the model stayed installed with no way to reinstall). Uninstalling a model now always removes its weights, while files shared with other installed models are still kept.
