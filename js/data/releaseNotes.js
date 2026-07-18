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
  '1.2.0': {
    version: '1.2.0',
    whatIsNew: [
      'NEW MODEL: CHROMA HYPER — A faster, lighter Chroma for lower-VRAM machines: the same high-detail Flux-family image generator distilled to run quicker at a smaller download (~9GB vs 17GB). Does text-to-image, image-to-image, upscale and detail, and installs alongside Chroma Flash as its Low-tier sibling.',
      'CHROMA FLASH IS FASTER AND BETTER — Chroma Flash now runs quicker and produces higher-quality results, with matching improvements to its upscale and detail passes.',
    ],
    fixes: [
      'LOOPING A TRIMMED CLIP NO LONGER STOPS AT THE END — When a video had a trim in-point and its out-point at the very end of the clip, enabling loop would play once and stop instead of looping. It now wraps back to the in-point and keeps playing.',
      'WAN 2.2 NOW USES ALL SIX LOW-NOISE LORA SLOTS — In both image-to-video and text-to-video, only the first Low Noise LoRA slot was being applied; LoRAs placed in slots 2 through 6 were silently ignored, so their style or motion never reached the result. All six slots now take effect. The High Noise slots were never affected.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '1.1.0': {
    version: '1.1.0',
    importantChanges: [
      'INSTALL INDIVIDUAL MODEL OPERATIONS — Multi-capability models (e.g. Wan 2.2 does both text-to-video and image-to-video) now let you toggle which operations to download in the detail panel; shared parts like the VAE and text encoder download once. Only the operations you install appear in the prompt box. Image models are unchanged.',
      'PICK WHICH GPU TO INSTALL FOR — Models with separate RTX 50-series and 40-series weights (e.g. LTX 2.3 Balanced) show a per-GPU toggle so you never fetch the wrong weight. Your GPU is pre-selected; a missing weight is offered on demand.',
      'REMOVED THE DEAD "COMFYUI API URL" FIELD — In Settings → External Connections. It was never wired: generation always used the built-in engine. Pointing Cubric at a separately running ComfyUI instance is not supported.',
    ],
    whatIsNew: [
      'RUNPOD REMOTE ENGINE — Run generation on a rented cloud GPU instead of your own machine. Connect in Settings → RunPod and the app starts, installs models to, and generates on the Pod. Includes an optional minimum-system-RAM requirement and a live disk-usage bar showing used and total GB while connected.',
      'FULL-PAGE MODEL LIBRARY — Opening Models now brings up a full-screen grid split into Installed/Available and Image/Video, with media, size and search filters, a per-model detail panel, a VRAM table, and fullscreen video previews.',
      'NEW VIDEO MODEL: LTX 2.3 — A fast video model that generates with sound: produce an audio track or drive it from your own clip. Does text-to-video and image-to-video with first/last-frame guidance, up to 2K and 4K. Quality tier is now remembered per model.',
      'NEW MODEL: NVIDIA PiD UPSCALER — A generative 4x image upscaler that adds real detail. Pick a look (Flux, SD3, Qwen, or SDXL), output size (1K/2K/4K), and how much new detail to invent. Works on any aspect ratio.',
      'NEW MODEL: WAN 2.2 5B — A fast low-tier video model doing both text-to-video and image-to-video in one compact 720p download, with a 4-step Turbo mode for quick drafts.',
      'NEW MODEL: CHROMA FLASH — An NSFW image model with exceptionally realistic skin: an 8-step Flux Schnell fine-tune, with standout matching upscale and detail passes.',
      'WAN 2.2 SMOOTH QUALITY BOOST — Reworked the two-stage sampling so the motion preview matches the final result and stage-2 resolves more real detail.',
      'SEARCHABLE LoRA PICKER — LoRA slots open a searchable, collapsible folder tree instead of a flat list, and long or deeply-nested names are no longer clipped.',
      'MODEL MEMORY GUIDANCE — Each model shows a size tier (Low/Balanced/High) with a hover table of the VRAM-plus-RAM trade-off, your own GPU row highlighted.',
      'DRAG-AND-DROP MODEL IMPORT — Drop a .safetensors/.ckpt/.pt/.bin/.pth onto one of your model folders in Settings and Cubric copies it in.',
      'MODEL DOWNLOAD QUEUE — Installing several models queues them one at a time; each waiting model shows a cancellable Queued state and the queue advances on its own.',
      'PROMPT DRAFTS SURVIVE NAVIGATION — Prompt text and staged input media persist when you switch between the gallery and a card view (session-only, kept separate per surface).',
      'PROJECT RIGHT-CLICK MENU — Right-click a project on the projects page to add notes, rename it, open its folder, or clean up cached assets. Cleanup frees disk by removing the reuse frames the system saved for Reuse Prompt (your generated media and history are kept).',
      'REUSE PROMPT NOW COVERS VIDEO AND AUDIO — Reusing a prompt can now carry over the source video and audio too, not just images and settings. Toggle what gets reused in Settings → Reuse Prompt.',
      'RENAME AND ANNOTATE GALLERY CARDS — Right-click a gallery card to rename it or add notes. Select multiple cards to copy them into another project at once. Renames stick across reloads and show on the card, breadcrumb, and prompt-box chip.',
      'MULTIPLE MODEL FOLDERS — Add more than one LoRA or upscale folder in Settings → External Connections. Cubric reads models from all of them (extra folders are read-only; only your primary folder is managed for installs and removals).',
      'BYPASS A LoRA WITHOUT REMOVING IT — A per-slot toggle skips a LoRA at zero strength for quick A/B comparisons.',
      'HOVER TO HEAR YOUR CLIPS — Hovering a video or audio card plays its sound (one at a time; toggle "Play audio on hover" in Settings → App Behavior).',
      'SMARTER, CONFIGURABLE NOTIFICATIONS — OS notifications now fire whenever the app is unfocused (including when a download finishes), with independent toggles for generation-complete and download-complete.',
      'VIDEO PLAYER AND CUE QUALITY-OF-LIFE — Press M to mute, Q to reach the Cue queue from inside a clip history, and every player button shows its shortcut on hover.',
      'MISSING-MODEL FEEDBACK — A project referencing a missing LoRA or upscale model flags it in red: a missing LoRA blocks generation, a missing upscale falls back to the default with a warning.',
    ],
    fixes: [
      'UNIVERSAL UPSCALE HONORS EACH MODEL NATIVE SCALE — So 1x/2x/8x upscalers no longer produce the wrong final size.',
      'RELOCATED MODELS NO LONGER SHOW AS MISSING — When the same file is found unambiguously in another of your folders.',
      'FASTER MODEL INSTALLS — From a faster download network.',
      'WAN 2.2 LoRA SETTINGS DROP THE INERT CLIP SLIDER — Wan uses Model strength only.',
      'REMOTE DOWNLOAD CANCEL CLEARS LEFTOVER BYTES IMMEDIATELY.',
      'CUE QUEUE PANEL NO LONGER COVERS THE PROMPT BAR.',
      'DOWNLOADS PANEL NO LONGER FLASHES ON EVERY REFRESH — Only changed cards redraw.',
      'CARDS STOP PLAYING WHEN THEY SCROLL OFF-SCREEN.',
      'WAN 2.2 SMOOTH LOW-TIER DRAFT RESOLUTION RAISED — For sharper quick drafts.',
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
