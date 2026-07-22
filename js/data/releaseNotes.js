/**
 * js/data/releaseNotes.js — Runtime-readable release notes, keyed by APP_VERSION.
 *
 * This is the SINGLE runtime source the changelog overlay (MpiChangelogDialog)
 * consumes on startup. It is intentionally a JS module, not parsed markdown:
 * the browser never reads `docs/releases/*.md` (those remain archival/user-facing
 * docs). When cutting a release with /mpi-version-bump, add a new entry here for
 * the new APP_VERSION in addition to writing the markdown release note.
 *
 * Payload shape (all section arrays optional; empty/missing = hidden in the UI):
 *   {
 *     version: string,            // matches APP_VERSION
 *     whatIsNew:        string[], // headline features / additions
 *     fixes:            string[], // bug fixes
 *     breakingChanges:  string[], // backward-incompatible changes (prominent)
 *     importantChanges: string[], // non-breaking but notable (prominent)
 *     engineNotes:      string[], // ComfyUI engine / dependency notes
 *   }
 *
 * The changelog overlay describes the already-running app version after a
 * bump/update. It is NOT an updater: do not add network checks, release polling,
 * or update bundles here (that is MPI-8 / portable-distribution scope).
 */

/**
 * @typedef {Object} ReleaseNotes
 * @property {string}   version
 * @property {string[]} whatIsNew
 * @property {string[]} fixes
 * @property {string[]} breakingChanges
 * @property {string[]} importantChanges
 * @property {string[]} engineNotes
 */

/**
 * Release notes by version string. Newest entries can be added on top; lookup is
 * by exact version key, so order does not affect behavior.
 * @type {Record<string, ReleaseNotes>}
 */
export const RELEASE_NOTES = {
  '1.1.0': {
    version: '1.1.0',
    importantChanges: [
      'INSTALL INDIVIDUAL MODEL OPERATIONS — Multi-capability models (for example Wan 2.2 does both text-to-video and image-to-video) let you toggle which operations to download in the detail panel; shared parts like the VAE and text encoder download once. Only the operations you install appear in the prompt box. Image models are unchanged.',
      'PICK WHICH GPU TO INSTALL FOR — Models with separate RTX 50-series and 40-series weights (for example LTX 2.3 Balanced) show a per-GPU toggle so you never fetch the wrong weight. Your GPU is pre-selected; a missing weight is offered on demand.',
    ],
    whatIsNew: [
      'RUNPOD REMOTE ENGINE — run generation on a rented cloud GPU instead of your own machine. Saving a RunPod API key reveals the remote-engine controls; the app then starts, installs models to, and generates on the Pod. Generation stays local until you Connect, and GPU and storage billing happen on your own RunPod account. Includes an optional minimum-system-RAM requirement and a live disk-usage bar showing used and total GB while connected.',
      'KREA 2 — a new high-quality image model with a distinctive photographic look. Ships ten built-in styles you pick from a strip of preview cards (each showing the same scene in that style, plus a None card for the model default look), an in-prompt enhancer, 1K and 2K output, a depth-guided Depth operation that transfers the pose and composition of a subject from a reference image, and an Edit operation that changes only what you ask while preserving the rest. Drop a second reference image to pull from both, for example to place two different characters in one scene. One install, two speeds: a Turbo toggle switches between fast and full-quality rendering.',
      'KREA 2 NSFW — Lustify Krea, an uncensored Krea 2 variant by Coyotte (creator of the Lustify SDXL model). Same photographic look, style LoRAs, Depth and Edit as Krea 2, with the same one-install Turbo toggle. Uses int8 weights: fastest on NVIDIA RTX (20-series and newer).',
      'LTX 2.3 — a video model that generates with sound: produce an audio track or drive it from your own clip. Does text-to-video and image-to-video with first and last-frame guidance, up to 2K and 4K. Quality tier is remembered per model.',
      'CHROMA FLASH — an NSFW image model with exceptionally realistic skin: an 8-step Flux Schnell fine-tune, with standout matching upscale and detail passes.',
      'CHROMA HYPER — a faster, lighter Chroma for lower-VRAM machines: the same high-detail Flux-family image generator distilled to run quicker at a smaller download (about 9GB versus 17GB). Does text-to-image, image-to-image, upscale and detail, and installs alongside Chroma Flash as its Low-tier sibling.',
      'BOOGU IMAGE EDIT — a unified 10B instruction image editor (Apache-2.0). Describe the change you want and it edits the whole image while preserving the rest. Ships in two quality tiers, High and Balanced, that you install separately: High for the best quality with the full-precision weights, Balanced for a fast, lower-VRAM edit that stays consistent across GPUs.',
      'QWEN IMAGE EDIT — a new instruction image editor that takes up to three reference images at once and excels at combining them: place a character, face or garment from one image into another, referring to them by number. Ships seven built-in styles and a per-run speed dial (Quality, Turbo, Hyper).',
      'NVIDIA PiD UPSCALER — a generative 4x image upscaler that adds real detail. Pick a look (Flux, SD3, Qwen, or SDXL), output size (1K, 2K, or 4K), and how much new detail to invent. Works on any aspect ratio.',
      'WAN 2.2 5B — a fast low-tier video model doing both text-to-video and image-to-video in one compact 720p download, with a 4-step Turbo mode for quick drafts.',
      'IMAGE TO IMAGE ON EVERY IMAGE MODEL — the Image to Image operation is now available on all image models. Feed it an input image and a prompt to reshape the image toward your description; the Denoise slider controls how much it changes.',
      'REMOVE BACKGROUND — a new History tool (under Enhance) that cuts the background from any image using BiRefNet. Output a transparent PNG, or fill the background with a color of your choice.',
      'EXPORT GIF — a new History tool (under Export, video only) that turns your clip into an animated GIF. Pick the frame rate, output size (fixed width or height, aspect kept), and loop count, preview the result and its file size, then export it anywhere.',
      'FULL-PAGE MODEL LIBRARY — opening Models brings up a full-screen grid split into Installed/Available and Image/Video, with media, size and search filters, a per-model detail panel, a VRAM table, and fullscreen video previews.',
      'MODEL DOWNLOAD QUEUE — installing several models queues them one at a time; each waiting model shows a cancellable Queued state and the queue advances on its own.',
      'MODEL MEMORY GUIDANCE — each model shows a size tier (Low, Balanced, or High) with a hover table of the VRAM-plus-RAM trade-off, your own GPU row highlighted.',
      'BRING YOUR OWN LoRA AND UPSCALE MODELS — drag a LoRA or upscale file (.safetensors or .pth) straight onto its folder in Settings and Cubric copies it in. You can also point Cubric at more than one LoRA or upscale folder under External Connections: it reads models from all of them (the extra folders are read-only; only your primary folder is managed for installs and removals).',
      'SEARCHABLE LoRA PICKER — LoRA slots open a searchable, collapsible folder tree instead of a flat list, and long or deeply-nested names are no longer clipped.',
      'BYPASS A LoRA WITHOUT REMOVING IT — a per-slot toggle skips a LoRA at zero strength for quick A/B comparisons.',
      'REORDER YOUR PROMPT IMAGES — drag the image chips in the prompt box to change their order, and each one shows its number. Models that refer to images by position (for example place the man from image 2 in the scene from image 1) follow the order you set, so you can rearrange without removing and re-adding chips.',
      'FRAME-ACCURATE VIDEO PLAYBACK — stepping, scrubbing, and trimming a clip land on the exact frame every time. The player shows the true decoded frame when paused or stepping, with colors that match the video, and sub-range loops that play back cleanly.',
      'CROP RATIOS AND DIVISIBLE BY — the Crop tool offers a Ratio or Free choice with a full ratio set including cinema formats (2:1, 1.85:1, 21:9, 2.39:1), plus a Divisible by control (default 16) that snaps crop output to clean multiples. Resize also defaults to 16.',
      'MASK TOOLS — right-click the image viewer to Clear mask without opening the Mask tool first, or to Copy a mask from one History entry and Paste it onto another. A pasted mask carries its paint and eraser strokes separately so you can keep editing it, and warns you first when the target image has a different shape.',
      'REUSE PROMPT, REFRESHED — the Reuse Prompt dialog is now a clean toggle list: each part (prompt, settings, model, images, video, audio) is a full-width switch with a clear on and off state, plus an All or None shortcut. Reusing a prompt can carry over the source video and audio too, not just images and settings. Toggle what gets reused in Settings under Reuse Prompt.',
      'RENAME AND ANNOTATE GALLERY CARDS — right-click a gallery card to rename it or add notes. Select multiple cards to copy them into another project at once. Renames stick across reloads and show on the card, breadcrumb, and prompt-box chip.',
      'OPEN IN FILE SYSTEM — right-click any gallery card or History entry (one or several) and choose Open in file system to reveal the media file in your file browser.',
      'DRAG A CARD ANYWHERE — gallery cards are now proper drags: pull one out to another application to export it, or click-drag it a couple of inches and let go to drop it straight into the prompt box.',
      'PROJECT RIGHT-CLICK MENU — right-click a project on the projects page to add notes, rename it, open its folder, or clean up cached assets. Cleanup frees disk by removing the reuse frames saved for Reuse Prompt (your generated media and history are kept).',
      'GALLERY VIEW REMEMBERS YOUR LAYOUT — the gallery card-size slider and info-mode (card badges) toggle persist across app restarts.',
      'HISTORY CARDS SHOW ASPECT RATIO — each History entry lists its ratio next to the pixel size (768×1280 · 5:8), including imported images.',
      'HISTORY TOOL RAIL TOOLTIPS — hover any tool icon in the History workspace to see its name as a tooltip; the rail icons are also slightly larger for a cleaner layout.',
      'REVERSE VIDEO OR AUDIO SEPARATELY — the video Reverse action is now three: reverse both together, reverse just the video (audio plays forward), or reverse just the audio (video plays forward).',
      'PROMPT DRAFTS SURVIVE NAVIGATION — prompt text and staged input media persist when you switch between the gallery and a card view (session-only, kept separate per surface).',
      'HOVER TO HEAR YOUR CLIPS — hovering a video or audio card plays its sound (one at a time; toggle Play audio on hover in Settings under App Behavior).',
      'VIDEO PLAYER AND CUE QUALITY-OF-LIFE — press M to mute, Q to reach the Cue queue from inside a clip history, and every player button shows its shortcut on hover.',
      'MISSING-MODEL FEEDBACK — a project referencing a missing LoRA or upscale model flags it in red: a missing LoRA blocks generation, and a missing upscale falls back to the default with a warning.',
      'SMARTER, CONFIGURABLE NOTIFICATIONS — OS notifications fire whenever the app is unfocused (including when a download finishes), with independent toggles for generation-complete and download-complete.',
      'NOTIFICATION SOUND — a sound plays when something finishes that you were not watching for: a generation completes, a model finishes installing, the engine restarts. A whole queue plays the sound once, when it finishes, not per item; notifications you triggered yourself (Connect, Install, Cue) stay silent. Toggle it in Settings under Notifications.',
      'POD CONNECTED NOTIFICATION — when a RunPod GPU finishes connecting while you are looking elsewhere, a desktop notification tells you the pod is ready. Toggle it in Settings under Desktop Notifications (on by default).',
      'FLOATING LATENTS WHEN MINIMIZED — minimize the app mid-generation and a small always-on-top window shows your live latents. Running local and remote at the same time shows a tile for each, side by side, and a queue on one engine advances through its single tile item by item. When a generation finishes, its preview stays put with a Done badge so the window waits for you; click a preview to jump straight back to the result. It remembers where you put it and how big you made it. Turn it off in Settings.',
      'MEET THE MASCOT — the mascot keeps you company in more places. While a card is generating it hovers in the center, looking around while it waits, then tucks into the corner with a focused waiting pose once the preview starts coming in. While a model pack sits queued to install in the Model Library, it hovers on the card saying hello so you can see the pack is lined up and about to download.',
      'SETTINGS, REDESIGNED — the Settings panel got a full visual pass: every option is now a clean row with its control on the right and a plain-language description on the left, grouped into clearly-titled sections. On and off options are proper toggle switches that light up when active, and the RunPod, model-folder, and notification areas all read as one consistent system.',
    ],
    fixes: [
      'A generation that uses a LoRA missing from your folders now tells you exactly which one is missing and how to add it, instead of failing with a crash-report dialog and leaving the queue stuck on a card whose Stop button did nothing.',
      'Image to Image now actually uses your input image; it was previously ignored on some models.',
      'Batch now renders the requested number of images instead of a single one.',
      'Reuse Prompt now restores the style, stylization, quality tier and batch, not just the prompt text.',
      'Auto-mask (the Detect button in the Mask tool) no longer fails on Windows with a model-path error, and lets you select multiple detected segments again: picking two or more people, faces or hands no longer clears your whole selection.',
      'First-time engine setup no longer leaves some model components uninstalled when one of them hits a snag mid-install, and no longer leaves behind duplicate download files.',
      'Your chosen operation (Upscale, Depth, and others) is no longer reset back to Image to Image when you switch between the Gallery and History, change models, or reuse a prompt.',
      'After deleting one or more History entries, the remaining entry is now correctly selected and active, and whatever tool you had open (Crop, Mask, and others) stays live.',
      'Reuse Prompt on an app-generated result now offers two choices, Prompt Box or App, instead of always reopening the app.',
      'Connecting to a RunPod GPU is now reliable when you look away mid-connect: switching to the Gallery, another app, or closing the Settings panel no longer makes the progress flicker, stick at 0%, reset, or leave the Pod connected while the app stays stuck on connecting.',
      'Selecting multiple gallery cards is no longer cancelled when a running generation finishes; your selection and select mode survive the gallery refresh.',
      'Re-running a video or image operation that reuses a filename (Combine, Crop, Reverse, Export GIF, and others) no longer plays back a previous, sometimes already-deleted result; the app always shows the freshly-generated media.',
      'The Uninstall dialog no longer shows an Also delete model files from disk checkbox that did nothing when unchecked. Uninstalling a model now always removes its weights, while files shared with other installed models are kept.',
      'Uninstalling a model or plugin no longer deletes weights that another installed model still needs, which could silently break a fully-installed model. When nothing can be freed because every file is shared, the app tells you which models are still using them.',
      'Combining two videos no longer produces a clip with a broken frame rate that could freeze the player on one frame; combined videos now have a clean, constant frame rate.',
      'Running out of disk space when installing a model now shows a clear not-enough-space notice instead of the crash-report dialog.',
      'In the History workspace video Continue section, the operation no longer gets stuck on Select. Extend and New shot now always run as Image to Video (they capture the last frame of the clip themselves), the frame slots are grouped under their own Continue video heading, and Create new is renamed New shot.',
      'The project list on the start screen no longer stalls when you have several large projects; each project thumbnail loads with its own spinner, a few at a time (newest first), so the list appears instantly.',
      'Scrolling a gallery with many images (especially large 4K ones) is now smooth: the gallery shows lightweight thumbnails instead of decoding every full-resolution image at once. Existing projects build the thumbnails in the background the first time you open them.',
      'Scrolling the gallery no longer makes video and audio cards start playing as the cursor passes over them; media plays only when you settle on a card, and anything playing stops the moment you scroll.',
      'A model download interrupted by a dropped connection, a stalled transfer, or quitting the app mid-install now keeps what it already downloaded and picks up from there when you install again, instead of starting over. Pressing Cancel still clears the partial download.',
      'Generated videos no longer carry a duplicate opening frame, so clips have the correct frame count: a 2-second 16fps video is 32 frames (was 33), and a 2-second 24fps LTX video is 48 frames (was 49).',
      'The video player Home and End keys now jump to the first and last frame.',
      'Finishing a queue of generations now shows a single N-generations-finished message instead of one per item, and while the app is minimized those messages no longer pile up and replay when you come back.',
      'A generation or install finishing while you were in another app no longer goes unnoticed: if the desktop notification is missed, the app shows the completion message when you come back to it.',
      'Universal upscale now honors each model native scale, so 1x, 2x and 8x upscalers no longer produce the wrong final size.',
      'A relocated model is no longer shown as missing when the same file is found unambiguously in another of your folders.',
      'Wan 2.2 LoRA settings drop the inert Clip slider; Wan uses Model strength only.',
      'Cancelling a remote download clears the leftover bytes immediately.',
      'The Cue queue panel no longer covers the prompt bar.',
      'The Downloads panel no longer flashes on every refresh; only changed cards redraw.',
      'Looping a trimmed clip no longer stops at the end: when a video had a trim in-point and its out-point at the very end of the clip, enabling loop played once and stopped. It now wraps back to the in-point and keeps playing.',
      'Wan 2.2 now uses all six Low Noise LoRA slots in both image-to-video and text-to-video; previously only the first slot was applied and slots 2 through 6 were silently ignored. The High Noise slots were never affected.',
    ],
    breakingChanges: [],
    engineNotes: [
      'COMFYUI ENGINE UPDATED TO 0.27.0.',
    ],
  },
  '1.0.1': {
    version: '1.0.1',
    whatIsNew: [],
    fixes: [
      'LoRA and upscale models stored in a subfolder failed to load on Windows (a path-separator mismatch made generation fail with "Prompt outputs failed validation"). All subfolder models now load and apply correctly, and projects that already referenced a subfolder model heal automatically.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '1.0.0': {
    version: '1.0.0',
    whatIsNew: [
      'First public release of Cubric Vision — a local, open-source image and video generator powered by ComfyUI, running entirely on your own machine.',
      'Available as portable builds for Windows, Linux, and macOS (Apple Silicon), each with a zero-setup engine bootstrap and resumable model downloads.',
      'Built-in updater: get new versions in place without reinstalling, with your engine, models, projects, and settings preserved.',
    ],
    fixes: [],
    breakingChanges: [],
    importantChanges: [
      'macOS builds are not yet notarized. On first launch, clear the download quarantine once with: xattr -dr com.apple.quarantine "<the Cubric Vision folder>", then double-click start.command.',
    ],
    engineNotes: [],
  },
  '0.0.12': {
    version: '0.0.12',
    whatIsNew: [],
    fixes: [
      'macOS: first-launch is now a one-time setup.command (right-click → Open) that clears the download quarantine, after which start.command launches normally. Replaces the earlier app-bundle launcher, which did not start reliably on Apple Silicon.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.11': {
    version: '0.0.11',
    whatIsNew: [
      'macOS: double-click CubricVision.app to launch with no Terminal window, and Cubric Vision now shows a proper Dock icon. A start-with-terminal.command is included if you want to watch the live log.',
    ],
    fixes: [],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.10': {
    version: '0.0.10',
    whatIsNew: [],
    fixes: [
      'Video zoom now works on macOS and Linux — scroll to zoom and double-click to reset in the video viewer.',
      'History thumbnails for video entries now render correctly (no more "missing video/image link").',
      'Apple Silicon: the memory monitor now shows only RAM (your Mac shares one memory pool — there is no separate VRAM to display).',
      'The status bar now shows generation progress reliably, and each finished generation reports how long it took.',
      'macOS: applying an offline update now works even when Safari has already unzipped the update into a folder.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.8': {
    version: '0.0.8',
    whatIsNew: [
      'First macOS (Apple Silicon) build — Cubric Vision now runs on Windows, Linux, and Mac.',
    ],
    fixes: [
      'macOS: the app now uses your Mac’s GPU (Metal) for generation instead of the CPU.',
      'macOS: bundled tools and launchers keep their permissions so the app starts correctly.',
      'Opening an image or video in the history view no longer fails on Linux.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.7': {
    version: '0.0.7',
    whatIsNew: [
      'Online-update test build — verifies the no-curl online updater end to end. No functional changes.',
    ],
    fixes: [],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.6': {
    version: '0.0.6',
    whatIsNew: [],
    fixes: [
      'Online update (Linux/macOS) no longer requires curl to be installed — it now uses the app’s own bundled runtime, so it works on minimal systems out of the box.',
      'After an update, the launchers stay runnable (“Run as program” / double-click) on Linux and macOS instead of losing their executable flag.',
      'Clearer messages if an update can’t be found or downloaded, instead of the window closing with no explanation.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.5': {
    version: '0.0.5',
    whatIsNew: [
      'Model preview cards now use sharper still images, and video models play a short preview clip when you hover over them.',
    ],
    fixes: [
      'Large model downloads now resume where they left off after you close and reopen the app, instead of starting over. A partially downloaded model is no longer mistaken for a finished one.',
      'Closing the app mid-download now warns you: models in flight will resume on next launch; the engine download restarts.',
      'Linux/macOS: launchers stay executable after applying an update, so "Run as program" and double-click keep working (previously an update could strip the executable bit).',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.4': {
    version: '0.0.4',
    whatIsNew: [],
    fixes: [
      'First-run install now keeps the models folder you pick before pressing Install, instead of silently reverting to the default location.',
      'Linux: the no-terminal launcher (start.sh) now starts the app when run via the file manager’s "Run as program", not only from a terminal.',
      'Engine install no longer shows a Pause/Resume button that could vanish mid-download — the engine download runs straight through (Pause/Resume remains for model downloads).',
      'Gallery cards: the favourite and reuse buttons no longer overlap as the UI is scaled up or in preview state.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.3': {
    version: '0.0.3',
    whatIsNew: [],
    fixes: [
      'Linux: applying an update from a zip now installs the full update correctly instead of stopping partway through.',
      'Linux: the no-terminal launcher (start.sh) now starts the app reliably; previously it could silently fail to launch.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.2': {
    version: '0.0.2',
    whatIsNew: [
      'New keyboard shortcuts to change the UI size: Ctrl and Plus to enlarge, Ctrl and Minus to shrink — matching the existing Ctrl + mouse-wheel control.',
    ],
    fixes: [
      'More reliable ComfyUI engine setup: stale install artifacts are cleared and the Python runtime is verified before continuing, with a smarter Retry.',
      'Engine download Pause/Resume controls no longer disappear or misbehave while background dependencies are installing.',
      'Changing the models folder in Settings no longer leaves a stale "no models installed" message.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '0.0.1': {
    version: '0.0.1',
    whatIsNew: [
      'First alpha build of Cubric Studio Vision for local image and video generation in a desktop project workspace.',
      'Project-based workspace: organize generations, history, and the gallery per project.',
      'Model-aware workflows run through the local ComfyUI engine, with in-app engine setup and model discovery.',
    ],
    fixes: [],
    breakingChanges: [],
    importantChanges: [
      'This is alpha-quality software. Platform validation, portable updates, and project/settings compatibility may change before public release.',
      'Windows is the maintainer-tested path first. Linux and macOS release notes should be checked for the latest validation status before sharing artifacts.',
    ],
    engineNotes: [
      'Generation uses the configured local ComfyUI engine and local model files for this release.',
    ],
  },
};

/**
 * Empty/fallback notes for a version that has no entry. Deterministic so callers
 * can treat "no notes" uniformly. Returned only when `getReleaseNotes` is asked
 * to fall back; `getReleaseNotes` itself returns null for unknown versions so the
 * overlay can be skipped entirely.
 * @param {string} version
 * @returns {ReleaseNotes}
 */
export function emptyReleaseNotes(version) {
  return {
    version: String(version || ''),
    whatIsNew: [],
    fixes: [],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  };
}

/**
 * Look up release notes for a version. Returns the entry for a known version,
 * or null when no notes exist (the overlay should be skipped in that case).
 * @param {string} version - e.g. APP_VERSION ('0.0.1')
 * @returns {ReleaseNotes|null}
 */
export function getReleaseNotes(version) {
  const key = String(version || '').trim();
  return RELEASE_NOTES[key] || null;
}

/**
 * True when a notes payload has at least one non-empty section worth showing.
 * @param {ReleaseNotes|null} notes
 * @returns {boolean}
 */
export function hasReleaseContent(notes) {
  if (!notes) return false;
  return [
    notes.whatIsNew,
    notes.fixes,
    notes.breakingChanges,
    notes.importantChanges,
    notes.engineNotes,
  ].some((arr) => Array.isArray(arr) && arr.length > 0);
}
