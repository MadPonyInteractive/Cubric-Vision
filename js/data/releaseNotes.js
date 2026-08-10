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
  '1.4.0': {
    version: '1.4.0',
    whatIsNew: [
      'Animate towards an image, not just away from one. Drop a single image into the prompt box on a video model and it has always become the first frame. Now the label along the bottom of the thumbnail is a button: click it and it reads Last frame, so the clip ends on that image instead of starting from it — the model invents everything leading up to it. Drop two images and you get both ends, first and last, in strip order. Useful for closing a loop, landing on a specific pose, or joining two shots you already have. Both LTX 2.3 and Wan 2.2 take it, including the end-frame-only case where the single image you give is the one the clip finishes on.',
      'The mask tools, rebuilt as a toolkit. Everything that makes a mask now sits in one group and works the same way. Paint one by hand with ten brushes — hard and soft rounds, feather, airbrush, chisel, calligraphy, spray, charcoal, stipple and a dry brush — instead of the single hard circle. Drop a rectangle, triangle or ellipse on the canvas and Add or Subtract it: drag the shape or its handles to size it, hold Shift to resize without squashing it, Alt over a handle to spin it, and it stays where you put it so stamping the same ellipse three times is three drags. Adjust the result — grow the whole mask, shrink it, or reduce it to a band around its edge — with a live preview and Apply, so you can fix the edge of a subject without regenerating the middle of it. Fill closes enclosed holes in one press, where you can see what is being filled before you commit to it. And a finished mask can be turned into paint from the right-click menu, or paint turned back into a mask, as a copy that leaves the original alone. No model runs and nothing downloads for any of it: all instant, all undoable.',
      'Detection: one button, one pass, and a way to stop it. The three detection methods — Points, Text and Auto — now open in a small strip beside a single Detect button instead of taking three toolbar slots. One detection finds every match in a single pass, so picking a result, or changing your mind and picking another, no longer re-runs it — trying all of them costs what one used to. While it works, the status bar reports it with a timer and Detect turns into Stop: a slow pass over a busy image used to look like the app had frozen, with no way to call it off.',
      'Localised edit — edit part of an image at full size. Mask an area before an edit and only that area is regenerated. A whole-image edit has to shrink your picture to the size the model works at; a masked edit crops to the mask instead, so the picture keeps its original resolution and everything outside the mask is untouched. It rewards a precise mask — for broad changes like a new pose, leave the mask off and let the model rework the whole image. On Krea 2, FLUX.2 Klein, Qwen Image Edit and Boogu Image Edit.',
      'Control — copy the structure of an image. One operation that takes a picture, reads the structure out of it and paints your prompt into that shape. A Control Type picker chooses WHICH structure: Depth keeps volume and framing, Pose keeps only the body skeleton, Scribble and Canny keep outlines. SDXL Realistic, SDXL NSFW, ILL Anime Beauty, ILL Anime and PONY Mix offer all four; Qwen Image Edit offers Depth and Pose. It replaces the old Depth operation everywhere: Krea 2 and FLUX.2 Klein still do depth, they just do it under the new name and show no picker, having only the one.',
      'Control on Chroma. Both Chroma models can now follow the depth and composition of an input image and paint your prompt into that shape.',
      'Four styles on Chroma. Chroma gains a style rack — B&W Sketch, Lenovo, Brushwork and Anime — available on every operation, Detail and Upscale included.',
      'Control Strength. Krea 2, FLUX.2 Klein, Chroma and the SDXL family gained a slider on Control for how hard the control map pulls. At full strength the composition is locked to the source; easing it off lets the model reinterpret the framing while keeping the pose. Klein bites softer than Krea 2, so it wants a lower setting.',
      'Composite — blend two of your images and watch it happen. Two new tools in a Composite group. Right-click the image you want underneath and choose Send to Composite, then open Paint Comp on another image and erase — the picture underneath shows through live where you erase, and the brush paints the top one back. Mask Comp does the same cut in one step using the mask already on the image, so everything the mask tools can select — brush, detect, points, text, shapes, adjust — can drive a blend. Press Apply to keep it as a new entry at full resolution; your originals are untouched. The old blend asked you to decide before you could see anything, which meant running it three or four times to get one result.',
      'Paint — draw on your image and let the model take it from there. A new Paint group with a brush, an eraser and a colour picker. A rough scribble tells the model where, how big and what colour — something a prompt alone cannot say. Paint a shape, then mask it and run Detail over it, and the model works from your sketch instead of guessing. It gets the same ten brushes as the mask — feather, airbrush, chisel, calligraphy, spray, charcoal, stipple, dry brush and the two rounds — and the same rectangle, triangle and ellipse, committed here as Fill or Erase in the colour you picked. Adjust works on paint too, and it is how you outline something: grow a scribble and the new edge is filled in your colour while what you already painted is left alone, shrink it and the edge is eaten inward with every surviving brushstroke keeping its own colour, or reduce it to a band and the scribble becomes its own outline. The paint stays on your image while you switch to the mask tools, and it keeps itself per image until you close the app, so nothing is lost while you work. Undo works on it like anything else on the canvas. Press Apply to bake it in as a new entry — your original is untouched, so deleting the new entry undoes it.',
      'Resize — one click back to the original size. An Original Size button under the width and height boxes puts both back to the picture\'s own dimensions, so you can try a size, change your mind and start again without looking the numbers up.',
      'Hover sound now has a volume, not just an on/off. A volume slider sits next to the gallery size slider, so you set how loud a hovered video or audio card plays without leaving the gallery. Sliding it to zero is the mute — which is why the "Play audio on hover" switch is gone from Settings; it was the same control, two rooms away. At zero an audio card stays silent instead of pretending to play, and a video still previews without sound.',
      'MiniMax H3 — video that comes with its own sound. A new video model that generates the picture and synchronized stereo audio in a single pass, instead of handing you a silent clip to score afterwards. The sound belongs to the scene because it was made with it, not added over the top. It does Text to Video and Image to Video, and like LTX 2.3 it takes a first frame, a last frame, or both. Resolutions run up to 4K, though the sizes above its native canvas are final-render territory rather than something to iterate at: twice the pixels costs a little over three times the time, so the top of that ladder is for a card that can carry it, not somewhere to work. It is a big model — 50GB of weights, a slow generator, and a 12GB graphics card at the minimum — and it asks you to accept its licence before it downloads, which is covered further down. If what you want is the same character, place or voice across several clips, reach for its sibling below instead.',
      'MiniMax H3 Reference — the same character, place or voice in every clip, with no training. A new video model that works from references instead of a first frame. Give it a face, a character sheet, a location, a clip whose camera move you want, or a voice, and it generates a new video that keeps them — up to nine images, three videos and three audio clips at once. Nothing you give it appears in the output as-is: these are references, not frames, so the model is free to put your character somewhere new rather than animating away from a picture. Point at a specific one in the prompt by typing @, which lists what you have staged and drops in its tag — "the woman from <Picture 1> walking through <Picture 2>". Each thumbnail wears the tag it became, so there is nothing to memorise. Reference detail decides how much of each reference it reads: Match is the fast default, Max keeps more and is the one to use for a character sheet, where it costs time on every step. It outputs video with synchronized audio like the rest of H3, and it installs alongside the existing MiniMax H3 sharing its text encoder and both VAEs, so it is one extra model file rather than a second full model.',
      'Turbo on MiniMax H3 — one click for a quicker clip. Both H3 models now carry the same Turbo button the image models have. On, it takes far fewer sampling steps, so the wait comes down. It is off by default. What changes is not only detail — movement comes out slower, closer to slight slow motion, and holds together better at small sizes, where the full path can smear faces and shapes as they move. Speed is something you can fix afterwards in an editor; smearing is not. So it is worth trying on small, quick clips rather than saving it purely for drafts. The choice sticks with the model, so it holds while you work and does not follow you to a different one. It adds a 1.82GB file to the H3 download, shared by both H3 models. The saving grows with the clip: on a very short one most of the time goes on loading the model and writing the video out, neither of which turbo touches, so it is worth far less there than on a long one.',
      'MiniMax H3 stopped doing work it only needed for a preview. H3 used to render in two passes whether or not you asked to see the first one. It now runs straight through in a single pass unless you turn Preview initial stage on, which is the only thing the split was ever for. Same settings, same number of sampling steps, one less setup to pay for — and the progress bar says "1" instead of counting to two. Turn the preview back on and it behaves exactly as before, first pass to look at, second to finish.',
      'Video previews in real colour, playing as a clip. While MiniMax H3 or LTX 2.3 generates, the card no longer shows the blocky coloured blobs every video model used to give you — it shows the actual clip, in real colour, looping as it refines. You can see the framing, the colour grade and the movement while there is still time to stop and change the prompt, instead of waiting out the whole render to find out the shot was wrong. Nothing to turn on. It needs a small preview decoder that comes with the model — around twenty megabytes, so if you already have MiniMax H3 or LTX 2.3 installed, that one piece downloads the first time you update.',
      'Engine updates now apply in place — seconds, not a fresh download. Updating the generation engine used to delete the whole thing and download it again from scratch: around eleven gigabytes of engine, every add-on and every Python package, even when the actual change was tiny. It now updates just the parts that moved, so a typical update finishes in seconds and costs you almost no bandwidth. The full reinstall is still there and still runs by itself whenever the update genuinely needs one — an add-on that was retired, a change to the engine\'s own Python, or anything that does not go cleanly — so you never end up on a half-updated engine.',
    ],
    fixes: [
      'The NVIDIA PiD upscaler now actually upscales. PiD has never worked. Since the release that introduced it, running it gave you back the picture you put in — unchanged, at its original size, in a few seconds, with no error and no warning. It looked like a finished upscale because the app had genuinely received an image back: the one it had just handed over. One setting the upscaler needs had gone missing from its recipe, so the engine refused to run the part that does the work and quietly ran only the part that loads your picture. The setting is back, and the same gap has been swept for across every model. If you tried PiD before and concluded it did nothing, you were right — try it again.',
      'Reuse Prompt now brings back settings you never touched. Reusing an older generation restored the controls you had changed, but silently skipped any control you had left alone — so a setting you had since nudged upwards stayed where it was instead of dropping back to what that run actually used. The app was only recording the settings you edited, and read a missing one as "leave it as it is". Every control a generation used is now recorded, whether you touched it or not. Older generations cannot be repaired — those values were never written down — but everything from this version on reuses exactly.',
      'A generation that fails before it starts now tells you why. Some failures happened before anything reached the engine, and said nothing at all: no message, no error, and the card simply sat on QUEUED while the queue counter climbed. Worse, that failed generation kept its slot, so every generation after it queued behind one that had already given up — the app looked frozen, and only restarting it cleared the queue. Those failures now release the slot and say what went wrong.',
      'Installing to a cloud Pod that is still waking up no longer looks like a crash. Start a model install in the first seconds after a cloud engine comes up and every file could fail at once, behind a Download Failed box asking you to report it on GitHub — for something that fixes itself. The engine\'s storage service takes a few seconds longer to answer than the engine does, and the app was reading that gap as a real error. It now tells you the engine is not ready yet and to try the install again in a moment. Genuine failures — a bad file, for instance — still report exactly as before.',
      'A cloud generation no longer disappears when a model adds new tools. Some models bring their own add-on packs, and the cloud engine has to restart to pick them up. It did that immediately — including while something else of yours was still generating. Whatever was running was killed mid-render and simply vanished: no error, no message, nothing in the queue, and the picture you were waiting for never arrived. Queue a batch, start one of those models, and the work already in flight was gone. The engine now waits for the work in progress to finish before it restarts, and if it cannot, it says so and leaves your generation alone instead of throwing it away.',
      'A cloud install that was interrupted can be started again. If your cloud engine went away in the middle of a model install — stopped, deleted, or restarted — pressing Install again did nothing at all: no error, no progress, just a bar sitting where it stopped, and the only way out was restarting the app. The app was still treating that abandoned download as if it were running. It now checks with the engine first and restarts anything the engine is no longer working on.',
      'Your cloud drive is no longer reported as full when it is not. If you had a download that was interrupted part-way, the app counted that half-finished file at its full final size — so a 21GB model that had only fetched 2GB was counted as all 21. The more unfinished downloads you had, the further out the number drifted, and the space bar in Settings read high for the same reason. Then the next install was refused for lack of room that was actually there: in one measured case the app said 39GB free and stopped an install while about 91GB was genuinely free. The message you got made it worse, because it told you to free up space — which was not the problem and would not have fixed it. The app now measures what the files really occupy on the drive rather than what they will occupy once finished.',
      'Updating the engine no longer leaves tools quietly missing. After an engine update, five add-on packs could come back without the Python packages they need — the masking detectors, the pose and depth guides, several samplers and part of LTX. Nothing warned you. The tools simply were not there, and the first sign was a generation failing on a feature that had worked the day before. The engine now reinstalls those packages whenever it replaces itself, and a check was added so a future update cannot skip them the same way.',
      'The negative prompt now does something on LTX. Anything you typed into the negative box on an LTX video was being ignored. The usual mechanism for it only applies at a guidance strength LTX does not run at, and the one part that can carry a negative at LTX\'s settings had been pointed at your positive prompt by mistake — so it was nudging the video towards what you asked for instead of away from what you didn\'t want. It is wired correctly now, and leaving the box empty switches it off cleanly instead of leaving it half-applied.',
      'Models you never installed no longer show a half-finished download bar. Six model tiles were showing progress bars — 17%, 22%, 33%, 35%, 36%, 49% — for downloads nobody ever started, for two different reasons. Two of them were counting files that belong to a model you do have installed and billing them to its sibling; the other four were counting leftovers from models you had removed earlier, which nothing was clearing up. Both are fixed, and a bar now counts only the files that model would actually have to fetch.',
      'A model that is part-way onto your disk no longer looks like it is downloading right now. A model whose files are partly present showed the same filling progress bar as a live download, so a library with a few of those read as several models installing at once — which never happens, since installs run one at a time. It now reads plainly as 98% ON DISK, beside the Install and Installed labels. A moving bar in the Model Library means one thing only: something is downloading this second.',
      'Uninstalling now clears up after itself properly. Uninstalling a model has always kept files that another installed model still needs, which is right. But once that other model went away too, its files were left behind for good — owned by nothing, deleted by nothing, and invisible in the app because a model you don\'t have installed offers no Uninstall button. On this machine that had quietly accumulated ~16GB. Uninstall now also clears out weights that no installed model needs any more. Files shared with something still installed are kept, exactly as before. This works on a cloud Pod\'s storage volume too — where it matters more, because that volume outlives the Pod and you pay for its size every month, so anything stranded on it was costing you until you noticed it.',
      'Uninstalling now tells you the truth about what it removed. On a cloud Pod, the confirmation counted every file it asked about as deleted — including files that were never on the volume in the first place. One uninstall reported eight files removed when exactly one existed. And in the opposite case, a model whose files had already gone said "model files kept on disk; still installed" when nothing was kept and nothing was left. Both are gone: a file is only reported as removed when it was actually there and actually deleted.',
      'A hiccup mid-download no longer throws away the download. A 25GB model that stalled for a minute — a router blip, a bad moment on the line — was declared failed outright, even though the gigabytes already on disk were perfectly good. It now retries on its own and picks up exactly where it left off. It still stops promptly and tells you what to do when your network is genuinely blocking the connection, rather than sitting there retrying something that will never work.',
      'A failed model install now tells you why. When an install failed after the files had downloaded, the error box came up completely empty — no reason, nothing to act on, and no hint whether it was worth retrying. The reason was there in the logs the whole time; it just never reached the dialog. It does now.',
      'A clear message when another program is using Cubric Vision\'s port. The app serves itself over a local port, and if something else already held it, Vision either opened onto whatever that other program was serving or sat on a black window with nothing to click — no menu, no refresh, no way out. It now stops and tells you which port is taken.',
      'The progress bar no longer keeps moving after you press Stop. Stopping a job that reports no percentage — an upscale, a detection — left the bar sweeping away under an IDLE label until the next job happened to reset it.',
      'Notifications no longer sit on top of what you\'re working on. They now appear at the top centre of the window, the one strip the interface keeps clear. Every corner they lived in before — bottom right, bottom left, top right — covered controls or your image.',
      'Typing a size in Resize no longer throws an error. Entering a width or height ran the preview again on every single keypress, against the half-finished number you were still typing — so the "1" of "1024" was treated as a one-pixel-wide image and stopped with a failure dialog. The preview now waits until you finish and click away.',
      'Resize Video works on a cloud GPU whatever you have installed. It stopped with a missing-node error unless that cloud volume happened to have Wan 2.2 on it — the video node it needs only ever arrived as a side effect of installing that model, so a volume built up from any other model never got it. The nodes every tool relies on are now put in place when you connect, the way they already were on your own machine.',
      'The mask brush no longer skips on a fast stroke. The brush placed a dab at each position the mouse reported and nothing joined them up, so a quick drag left a dotted trail of gaps instead of a solid stroke — worst on a large image zoomed out, where the same hand movement covers far more of the picture between readings. Strokes are now continuous at any speed.',
      'Masked edits no longer fail on large images. The mask was being sent at a smaller size than the picture it belonged to, and any source over roughly 1500 pixels on its long edge stopped with a dimensions error. Affected FLUX.2 Klein\'s masked edit since 1.3.0.',
      'Text detect finds things again. Naming an object found nothing at all whenever the result count was 1 — the default, and the setting most runs use. The count was written into the prompt in a form the detector read as part of the object\'s name, so it went looking for something that was never there. Raising the count to 2 or naming two objects had been dodging it by accident. Affected Text detect since 1.3.0.',
      'The Qwen Image Edit tier stays put. Quality/Turbo/Hyper was being remembered per operation, so switching between Edit and Control silently changed the tier underneath you. It is now one setting for the model.',
      'The batch count no longer appears where it did nothing. On SDXL\'s Image to Image and Control, asking for several images only ever returned one — the setting reached a part of the workflow those operations do not use. The control is now hidden there rather than lying about it. Text to Image is unaffected.',
      'Updating from inside the app reopens it again. Pressing Update closed the app and left it closed, even when the update had applied perfectly — which read as a crash. The updater now reopens the app when it finishes, writes a log next to the app (update/update.log), and if an update fails it tells you why on the next launch instead of vanishing silently. Because the updater that runs is the one already installed, this takes effect when updating FROM this version — updating TO it still needs you to reopen the app yourself.',
      'Ctrl+scroll no longer changes the size of the interface. macOS sends a two-finger trackpad pinch as a Ctrl+scroll, and the app was treating that as the shortcut for changing UI size — so on a Mac, trying to zoom into an image blew up the entire interface instead. That shortcut is gone on every platform; use Ctrl (or Cmd) with + / -, which always did the same job. And the size you pick now survives a restart — it used to be forgotten on every launch, which meant anyone who needs a larger interface set it again every single time they opened the app.',
      'The live preview now looks like your picture, not a colour blob. While a generation runs, the thumbnail is decoded by a tiny preview model, one per model family — and the ones for FLUX.2 Klein were never installed, so it fell back to a rough colour projection that told you almost nothing about what you were getting. On macOS and Linux none of them were installed, so every model had the blob. They now install with the engine. A few models still show the rough preview on purpose: Krea 2, Qwen and Wan 2.2 share a preview decoder with a known bug that corrupts the real generation, so the mediocre preview is the safe choice until that is fixed upstream.',
      'Most model downloads now have a second route when your network blocks the first. Every model file was served from one address, so an ISP filter, a school or office network, or antivirus web protection sitting on that one address stopped the whole catalogue — nothing would install, and the app looked broken when the network was the problem. If the connection to the usual host fails, the download now retries the same file from Hugging Face automatically, and anything already downloaded is kept rather than started over. It also no longer loses the explanation: if both routes fail you still get the "your network blocked this, try a VPN" message instead of a bare error code. This helps when a network blocks the address; a network that interferes with the transfer itself can still break a download. A handful of files still have a single route: the three small preview decoders, which exist nowhere else in the form the app needs, and a few of the largest model files, which we serve straight from the host that publishes them.',
      'Setting up the engine downloads less, and stops hiding a step that always failed. The generation engine is built from a set of add-ons, and each one used to install its own list of supporting libraries — over a dozen separate passes that re-checked the same libraries again and again, sometimes installed a package only to replace it moments later, and on some machines pulled in graphics-card libraries a computer without that card can never use. The app now installs one list, decided and tested in advance, in a single pass: less to download, less to unpack, and the same libraries on every machine instead of whichever add-on happened to go last. One of those add-ons also had a piece that failed to install on every computer, on every platform, on every fresh setup — and reported success anyway. It was never used by anything in the app, so it is gone.',
      'Running your own ComfyUI no longer breaks the app\'s. If you already had ComfyUI open, the app quietly used your install instead of its own, because both were on the same port. Yours does not have the app\'s custom nodes, so every generation stopped with "Node \'Input_Seed\' not found. The custom node may not be installed." — which read as a broken install, when nothing was wrong with it. The app\'s engine now runs on its own port and stays out of the way of yours, so you no longer need to close ComfyUI before opening Cubric Vision. If something else is using that port, the app now tells you instead of silently generating on it.',
      'The LoRA and upscale pickers in Model Settings open again. Clicking a LoRA slot or the upscale model did nothing — the arrow flipped as if the list were opening, but no list ever appeared, so neither a LoRA nor a different upscale model could be picked. Affected Model Settings since 1.3.0.',
      'The same extra model folder can no longer be added twice. On Windows, one folder can have two spellings — a long one and a short PROGRA~1-style one — and the app treated them as two different folders, so the same LoRA or upscale folder could end up in your list twice. Both spellings now resolve to the same folder.',
      'The home screen no longer claims you have no models when it cannot tell. On a cloud-only setup — the local engine install skipped, no Pod connected yet — the models count on the home screen read 0 / 18 on a machine whose drive was full of weights. Models live in a folder the local engine owns, so with no engine there is nowhere to look and nothing to count: the app was showing a zero it had never measured. It now shows a dash until an engine, local or cloud, can actually answer.',
      'RunPod\'s "Stage all models on connect" is locked until you save an API key. The panel said the RunPod controls were locked until a key was saved, then let you flip that one switch anyway — a setting about connecting to a Pod you had no way to connect to yet.',
      'The startup splash now covers the whole wait, instead of vanishing on the slow starts it exists for. It was being closed the moment the window had something to paint — including the browser\'s own "cannot connect" page, which is what shows while the app\'s engine is still starting on a cold or slow first run. So the splash disappeared early, or on Linux failed to appear at all, and you watched an error page until the app arrived. It now stays up until the app itself is loaded.',
      'The install screen no longer flickers during the dependency step. Two things report progress at once — the phase the installer is on, and the files it is fetching — and they were taking turns overwriting the same line, several times a second. Each now has its own place to speak.',
      'Installing a model no longer fails after an app update changes a Python package. Once an update moved one of the engine\'s Python packages, the next model install died with Download Failed right after the files had downloaded — and every install after that failed the same way, so retrying could never work. The engine was running, and Windows will not let anything overwrite a file a running program is using. The update is now applied while the engine is stopped, on its next start.',
    ],
    breakingChanges: [],
    importantChanges: [
      'LTX 2.3\'s Balanced tier moved to a better, smaller model file. The two GPU-specific options (RTX 50 Series / RTX 40 & Older) are gone — one file now runs on every card, at 20GB instead of 22–23.5GB, with better detail and sound. If you already have LTX Balanced installed, the new file downloads once and the old one is cleaned up. Text to Video and Image to Video also share one workflow now, so which one you get follows from whether you supply a first or last frame.',
      "MiniMax H3's video decoder moved to a smaller, faster file. The part that turns a finished generation back into pictures is now a compressed build: 3.2GB instead of 5.2GB, and quicker, with no loss of quality. If you already have MiniMax H3 installed, the app will show it as needing that one file and download it once. The old file is no longer part of the model, so the next time you uninstall a model and let it delete its files, it gets cleared out with it rather than sitting on your drive owned by nothing. It needs the newer engine, which this version installs for you.",
      'Wan 2.2 is image-to-video only now. Its Text to Video operation has been retired: LTX 2.3 does that job better, and Wan\'s text-to-video weights were a 27GB download that served nothing else. Image to Video is untouched — same model, same speed, same results. If you already downloaded the text-to-video weights, they are no longer counted as part of Wan 2.2, so the next time you uninstall a model they get cleared out with it rather than sitting on your drive owned by nothing. Text to video lives on LTX 2.3, MiniMax H3 and Wan 2.2 5B.',
      'Some models now ask you to accept their licence before they download. A few model licences require us to show you the restrictions and record that you accepted them before you receive the weights — MiniMax H3 is the first one we ship. You will see the terms, and where a model is not licensed in your region, a link to request your own authorization from the licensor. Every other model installs exactly as before, with no extra step. The licence and a way to report misuse stay reachable from the model\'s panel afterwards.',
      'Your mask reaches the model the way you drew it. A masked edit used to close every hole in your mask and grow it slightly before generating, so a mask drawn as a ring around a subject arrived at the model as a solid blob — the shape you wanted was impossible to ask for. That no longer happens on any model. If you do want a hole closed, the new Fill button does it where you can see it.',
      'Mask composite follows the mask you drew. Compositing through a ring or an edge-band mask filled in the middle before blending, so the whole enclosed area came through instead of just the band you selected — the same thing that used to happen inside the generator and was fixed there in this version. It now uses the mask as drawn. Use Fill if you want a hole closed.',
      'The Add / Subtract composite dialog is gone. Blending two images used to mean selecting both, having one of them already carry a mask, and answering Add or Subtract in a dialog — with nothing on screen to judge it by. The Composite tools replace it entirely: the selected image is always the one on top, and you see the blend while you make it. Two images of different sizes are now cropped to fill rather than stretched, and the preview on the canvas matches the file that gets written.',
      'A detection you don\'t add is a preview. Detect, Points and Text show their result in green as a preview, and it stays a preview: leaving the tool discards it, and generating without pressing Add no longer sends it. Previously an un-added detection was silently used in the next generation. Because of this, the operations that need a mask stay unavailable until you press Add or Subtract — a green preview on its own is not a mask yet.',
      'Krea 2 and Chroma styles now reach Detail and Upscale. Every operation on these models runs one workflow, so the style you picked stays applied through the finishing passes instead of being dropped by them.',
      'Krea 2 Control takes a second image. Image 1 supplies the pose and composition, image 2 supplies who is posed into it.',
      'On a Mac, install Apple\'s Command Line Tools before your first setup. Setting up the local engine needs git, which on macOS only arrives with the Xcode Command Line Tools — and a clean Mac does not have them. The first Install press stops with a message naming exactly that. Open Terminal, run xcode-select --install, let Apple\'s download finish, then press Retry. This is a known issue, not a fault in your download: Windows ships a prebuilt engine and never needs git, while macOS and Linux build theirs. Removing the requirement is being worked on separately.',
      'Krea 2 and Chroma keep your source dimensions. On Krea 2, every operation except Text to Image and Image to Image now follows the input image\'s shape instead of the ratio picker. On Chroma it applies to Control, Detail and Upscale.',
    ],
    engineNotes: [
      'COMFYUI ENGINE UPDATED TO 0.31.0 - from 0.29.2, two upstream releases in one step. It is a small update to install: the engine itself moves, but nothing in the heavy machine-learning runtime does, so there is no multi-gigabyte re-download.',
      'MiniMax H3 generates faster on the new engine, and so do LTX 2.3 and Wan 2.2 - the work upstream did on H3 sped up the other two as well. Everything else runs as it did.',
      'Every shipped model was re-swept after the update by executing a real generation for each of its operations on a GPU, and all of them passed.',
    ],
  },
  '1.3.1': {
    version: '1.3.1',
    // Bug-fix release cut directly off 1.3.0. In-flight work (the masking system, the
    // workflows still being verified) stays in docs/releases/UNRELEASED.md until it
    // actually ships — do not fold that scratchpad in here.
    whatIsNew: [],
    fixes: [
      'A download blocked by your network now tells you so, in plain English. If your internet provider, router, DNS or antivirus blocks the connection to our model server, the app used to show a wall of raw technical text and offer to file a bug report — so it read like the app was broken, when nothing was wrong with it or your computer. It now names the server that could not be reached, explains that it is a network restriction rather than a fault, and suggests what to try. It also no longer nudges you to report it as a bug, because it is not one.',
      'Retrying a download no longer looks like it lost your progress. A download that failed part-way through kept its file on disk and picked up from where it stopped — but the progress bar reset that part to zero first, so a retry could visibly jump backwards, from twenty percent down to eight, as though the work had been thrown away. Nothing was ever lost; the bar was simply not counting what was already downloaded. It now does.',
      'When engine setup fails, it says why. A failed component used to report only its name — "install failed: rife47" — with the actual reason discarded, which left nothing to act on and nothing useful to send in a report. The real cause now travels with the message.',
      'The app no longer refuses to start when Windows cannot find your Documents folder. On some setups — a redirected or cloud-managed Documents folder, or one that is not ready yet at startup — the app closed immediately with an error and no window, then often started fine on the next attempt, which made it look randomly broken. It now carries on starting instead of giving up.',
      'The engine now keeps whichever parts it can actually download. Its building blocks come from two different places — the node packs from GitHub, the model files from our own server — but they were set up as a single all-or-nothing batch. If your network could reach only one of the two, the pieces that had downloaded perfectly were thrown away along with the ones that failed, and the same thing happened again on every launch. That left an engine with none of its nodes installed, so generating failed no matter what you had already downloaded. Each half now stands on its own: whatever arrives gets installed.',
      'A failed setup no longer locks you out of the app. If those components could not be installed at startup, the screen offered a single Retry button — and when the cause was your network, Retry failed in exactly the same way every time, with no way through to the app, or even to Settings to switch to a cloud GPU. If the essential parts are in place the app now simply continues; if they are not, there is a way past the screen.',
    ],
    breakingChanges: [],
    importantChanges: [],
    engineNotes: [],
  },
  '1.3.0': {
    version: '1.3.0',
    importantChanges: [
      'WINDOWS NOW STARTS FROM CubricVision.exe — start.vbs and start-with-terminal.bat are gone; double-click CubricVision.exe in the folder instead. On a clean Windows 11 machine, Smart App Control blocks .vbs and .bat files outright with no way to allow them, so every way we shipped to start the app was blocked and double-clicking did nothing at all. An executable does not get that treatment. Windows may still warn you the first time with a blue "Windows protected your PC" box because the app is not code-signed yet — click More info, then Run anyway. You only do that once.',
      'ALREADY ON WINDOWS? Updating from inside the app is now the recommended way, and Smart App Control no longer blocks it. If you update in place, an old app folder is left behind in your Cubric Vision folder — nothing uses it any more and it is safe to delete, about a gigabyte back. Your projects live in Documents and are untouched either way.',
    ],
    whatIsNew: [
      'NO GPU? SKIP THE INSTALL AND RUN IN THE CLOUD — setting up Cubric used to mean installing the ComfyUI engine first, even on a machine that could never use it. The install screen now offers a way straight past it, with a link to the setup video; Cubric then runs entirely on a cloud GPU. Turn it back off in Settings → RunPod whenever you want the local engine after all.',
      'NEW MODEL: FLUX.2 KLEIN — the fastest image model in Cubric Vision, and the only one that can take things out of a picture: mask an object, run Inpaint with the prompt left empty, and it is gone in about four seconds. It covers the full set in one model — generate from text, reshape an existing image, follow a depth reference, edit with up to three reference images, clean up detail and upscale — with eight style looks available on every one of those. Quality is modest next to Krea 2: reach for Klein when you want an answer now or something removed, and for Krea 2 when you want the finished piece. Tip: Depth on this model takes two images if you give it two — the first supplies the pose, the second supplies who is in it.',
      'KREA 2 EDITS FOLLOW YOUR INSTRUCTIONS MUCH MORE CLOSELY — the edit path has been rebuilt around the newer Krea 2 edit engine. Your reference image is now fitted to the shape of the picture you are making, so asking for a new setting actually gives you a new setting instead of quietly keeping pieces of the original background. Restaging someone into a new pose, outfit or scene lands closer to what you asked for, likeness is better, and references whose shape does not match your output no longer come out stretched or soft. Tip: the more of your reference frame the character fills, the better the likeness — crop your reference to the person before using it.',
      'KREA 2 QUALITY SETTING PRODUCES FAR MORE NATURAL IMAGES — everything made at the quality speed, not just edits. The sampler was pushing the model too hard, which flattened lighting, over-saturated colour and gave skin and surfaces a waxy, plastic look. It is now dialled back and a second detail pass finishes the image: lighting reads like a real photograph, skin and fabric hold real texture, and backgrounds resolve properly instead of going soft. It also sticks to your prompt more literally instead of quietly adding flattering details you never asked for. The fast setting is unchanged.',
      'BLEND TWO VERSIONS OF AN IMAGE WITH A MASK — when a re-run fixes one part of a picture and ruins another, you no longer have to choose. Paint a mask over the area you care about, select that entry and the one you want to borrow from, right-click and pick Mask composite. Add drops the other entry\'s pixels into the masked area; Subtract keeps the other entry and takes only the masked area from the one you painted. The blend lands as a new entry in the strip so nothing is overwritten, the edge is softened automatically, and a mask drawn as an outline fills in.',
      'HOLD ALT TO DRAG A GALLERY CARD STRAIGHT INTO ANOTHER APP — dropping a card into Discord, Photoshop or a browser upload box used to do nothing, because a plain drag only hands over a promise of a file that other apps ignore. Hold Alt while you drag and the card leaves as a real file, so any app that accepts a dropped file now takes it; you can let go of Alt once the drag is moving, and with several cards selected, Alt-dragging one drags them all. A plain drag is unchanged: onto the prompt to reuse a card, into a folder to save it.',
      'IMAGE DESCRIPTIONS ARE SHARPER AND GET STRAIGHT TO THE POINT — Describe an image no longer starts with "The image shows…"; the description opens on the subject itself so you can paste it straight into a prompt, and it is considerably more thorough, covering subject, clothing, materials, lighting, composition and background in enough detail to recreate the shot.',
      'PICK WHAT YOU\'RE MAKING FROM A STRIP, NOT A DROPDOWN — every operation your model can do now sits above the prompt box as a row of chips with the current one lit. An operation you cannot run right now stays visible but dimmed, and hovering it says exactly what is missing — needs 1 image, paint a mask first, takes at most 2 images — instead of quietly disappearing from a list. The same strip appears inside the parameters popup, clearing the last image drops you back to text-to-image on its own, and the operation you actually chose comes back the moment you add an image again.',
      'EVERY OPERATION NOW EXPLAINS HOW TO PROMPT IT — operations want completely different prompts and nothing in the app said so. Open the parameters popup and there is now a ? above the operation strip: a short guide for whichever operation you are on — what the prompt is for, a couple of examples, and the mistake people usually make. It follows your model too: the SDXL family is pointed at comma-separated tags while the newer models are pointed at plain sentences.',
      'CHOOSING A MODEL IS A FULL-SCREEN CONTACT SHEET — the model dropdown is now a grid of preview tiles like the Model Library, so you pick by looking at the work rather than reading names — click the model button above the prompt and it opens the same way every time. LoRA & Upscale settings open from the model\'s own tile.',
      'TAB JUMPS BETWEEN THE GALLERY AND THE CARD YOU WERE WORKING ON — one key, both directions: from the gallery it opens the last card you had open in that project, and from inside a card it drops you back to the gallery. It remembers per project and after you close the app. If a project has no cards yet, Tab does nothing at all — and if you delete the card it was holding on to, it forgets rather than sending you somewhere you did not ask for.',
      'CROP OUTSIDE THE PICTURE — the crop box no longer stops at the edge of your image: drag it past any side and the new area fills with a colour you pick. That flat colour is what you hand to a model next — switch to an edit-capable model, do not mask anything, and just describe what should be there; it paints into the coloured area. Good for turning a portrait into a landscape. The box now also snaps to your image edges when it gets close, and there is a third Resolution mode beside Ratio and Free where you type an exact width and height and the result comes out at exactly those pixels. Images only; video crop is unchanged.',
      'MASKING IS REBUILT: FOUR TOOLS, AND IT CAN NOW FIND ANYTHING YOU CAN POINT AT OR NAME — Brush is painting, plain and simple. Points is new: click anywhere on the image and the mask snaps to whatever you clicked — a face, a pair of headphones, the coffee cup on the table; right-click to push the selection back off something it grabbed by mistake. Name lets you type what you want instead — hair, or cup and earring — say how many of each to find, and every one comes back as its own thumbnail to pick from. Detect is the face / hand / person finder you already had, unchanged. Everything adds on top of whatever you have painted, so all four mix freely. Anything a detector found now draws green, a new black-and-white view in the strip shows the mask exactly as it is handed to the model, the eraser\'s ring is visible against dark images, and the prompt box now stays open while you mask. Points and Name run on a new model that installs alongside the engine — expect a one-off download of about 1.7GB after you update. Tip: dots are cumulative, but they describe one region per run — click, hit Add, then start on the next part.',
      'CTRL+Z ON THE CANVAS — every mask edit can now be taken back — a brush stroke, a Clear, committing a detection — with Ctrl+Shift+Z to put it back again. The history follows you between mask tools, and starts fresh when you open a different image.',
    ],
    fixes: [
      'The app is no longer slow while connected to a cloud Pod. Opening your model library could leave the grid blank for ten to fifteen seconds, and Settings would sit there before showing how full your volume was or letting you press Disconnect. The cause was on the Pod, not in the app: measuring the volume\'s space and checking which models are installed were done in a way that made the Pod stop answering anything else until they finished, and each new request started a fresh measurement on top of the last. Both jobs now run out of the way of everything else, the volume measurement is taken once and shared, and it refreshes immediately whenever you install or remove a model. The library and Settings now open straight away — it lands the next time your Pod starts, no action needed.',
      'If the app fails to start, it now says so instead of vanishing. A crash during startup used to close the window with nothing left behind — no message and nothing in the log. Startup failures now show what went wrong and write the same detail to the log file, so a report has something in it. The update download also names itself honestly: unzipping it gives you a folder marked update-only, which is a patch to apply over your existing copy, not a second copy of the app.',
      'The log file you send with a bug report is now complete, and it keeps its history. Errors raised by the app itself were being written to a second log file that nothing ever collects, so the one you could actually send was missing exactly the messages a report needs — a failed startup could look like nothing had happened at all. Everything now goes to one file. That file also used to keep only a single old copy, and setting up the engine alone could fill it twice over and push the whole setup out of reach; it now keeps the last twenty, so what happened yesterday is still there today.',
      'Editing an image in the strip now always uses the image you are looking at. A picture dropped or reused into the prompt box while working inside a history strip used to quietly become the input for everything you ran afterwards, no matter which entry you had selected — so an upscale or an edit could come back looking like a completely different picture, and a lower Denoise would not help. The strip now always works from the entry you have open; choosing a multi-image operation inside the strip simply runs it on the selected image. Video is unchanged.',
      'Stopping a generation no longer says it finished. Pressing Stop could still pop a "Generation finished" notification with the completion chime, because the engine often completes the step it was already working on and hands back a finished image. That result is still kept — it just no longer announces itself as a successful run you did not ask for.',
      'Krea 2 upscaling is sharp again. Upscales came out noisy — bad enough to be unusable at full quality, and mediocre on the fast setting. The upscaler now finishes with a short refining pass, and full quality no longer borrows the fast setting\'s accelerator, so it actually renders at the quality you picked. Both speeds improved; full quality is the bigger jump.',
      'Your images no longer carry hidden data. ComfyUI stamps the entire generation graph — your prompt, negative prompt, seed, model names and the full node workflow — invisibly inside every PNG it produces. Cubric Vision now strips that out as each image is saved, so you can share or publish your work without leaking the prompts behind it. Pixels are untouched: the file is byte-for-byte the same image, just without the hidden payload. Applies to newly generated images.',
      'Mac and Linux: video generation with LTX works again. Cubric Vision was installing whatever version of the ComfyUI engine happened to be newest that day instead of the version it was built and tested against, and a recent engine release removed something the video component depends on — so LTX video quietly stopped working, and the app could not even tell the two versions apart to offer you a repair. It now installs exactly the tested version and records what actually landed. Windows was never affected.',
      'Mac: pictures come out as pictures again, not grey mush. Engine setup on Apple Silicon was installing a development snapshot of PyTorch — an unreleased daily build — instead of a finished release, so the engine you ended up with depended on the day you happened to install it. One of those daily builds rendered every SDXL image as flat grey noise, and it did so silently: no error, a normal generation time, and a normal-looking result in your gallery until you opened it. Mac now installs the same tested, stable PyTorch that Windows and Linux have always used. If you set up the engine on a Mac and your images came out grey, reinstall the engine from Settings and they will be fine.',
      'macOS: installing a model no longer fails partway through. Setting up any model that uses depth stopped with "Installation Failed" and a Retry that could never succeed — one of the components it downloads asked for a piece of software that is only published for Windows and Linux graphics cards. Cubric Vision now skips that piece on Mac, where it was never usable in the first place. Windows and Linux are untouched.',
      'Cloud Pods can no longer report a model as installed when nothing downloaded. While a Pod was still starting up, it could answer the "what is on this volume?" question with only part of the picture — and anything missing from that answer was taken as installed, so models you never touched ticked over to installed with nothing on the volume, and the next generation failed on files that were never there. An incomplete answer is now treated as "don\'t know yet": those models keep whatever state they already had and settle on the next check a few seconds later.',
      'Gallery cards now match the picture inside them. A card was laid out using the size you asked for rather than the size that came back, so whenever a model produced something a different shape, the card was cut wrong and the image sat inside it with padding. Cards are now measured from the finished image, so the grid lays out cleanly.',
      'Windows: setting up on a fresh machine now finishes. On a clean Windows 11 laptop the setup ran for an hour, then stopped with "Installation Failed", and Retry re-downloaded everything and failed the same way. Three things were behind it: the download folder ended up with the app\'s long name written twice, pushing some files past the length Windows allows a path to be; one component asked for a developer tool most people do not have; and the error message blamed the wrong step. All three are fixed — the Windows download unpacks into a single short folder, the unnecessary component is gone, and if anything does go wrong the message names the exact part that failed. Setup also checks up front whether the folder you unpacked into is too deep for Windows and tells you to move it before downloading several gigabytes, instead of after.',
      'The startup window no longer flashes white. On slower machines the loading window appeared as a blank white box for a few seconds before the logo showed up. It now waits until it has something to show.',
      'Connecting to a cloud Pod no longer downloads models you never asked for. When Cubric reconnects and finds a Pod component sitting at an out-of-date version, it repairs it — and that repair used to re-run the entire install for every model the component belonged to, quietly pulling down gigabytes that were never on your Pod. On a fresh Pod that could fill a 150GB volume in about a minute, and it took back any space you tried to free. The repair now updates only the component that actually drifted, which is a few hundred kilobytes, and it says what it is doing in the log instead of running silently.',
      'Installing a model after connecting to a cloud Pod no longer does nothing. The first model you installed after connecting could sit on "Queued…" indefinitely — the app was waiting on a job that had already finished before it started listening, which happened on almost every connect once your models were already on the volume. Installs now start immediately, and if the queue is ever held up for any other reason it says so in the log. Connecting is also quieter: it no longer pops an "engine:assets installed" message every single time.',
      'The Model Library no longer goes blank when an install or uninstall finishes. The library was rebuilding the whole grid from scratch, throwing away every preview it had already loaded and asking for them all again. Previews are now kept and reused, so the grid updates in place and never blanks — the same when you filter, search, or change a model\'s options. Video previews show their first frame straight away, and an uninstall now says "uninstalled" rather than "updated".',
      'An uninstalled model no longer shows a full progress bar where its Install button belongs. The app was still holding the finished install job for a model it had just deleted, so the model looked like it was still there. It now lets go of the job the moment you uninstall, on both your own machine and a cloud Pod.',
      'Settings no longer forgets where your models are. If your models folder had "temp" or "tmp" anywhere in its path — even a Windows account name that happens to contain those letters — then simply opening Settings quietly pointed Cubric back at its own default folder, and the whole library read as if nothing was installed. That check is gone. Cubric also writes every change of models folder to its log now, so if the folder ever does move unexpectedly, there is a trail.',
      'The app no longer opens to a black window on a slow machine. Cubric waits for its own background service to come up before showing the window, and after five seconds it stopped waiting and opened anyway — on older hardware, or on a first run from a cold disk, the service was often still starting, so the window asked for a page that was not being served yet and simply never asked again. You were left with a black window and no way out of it, since the app has no reload shortcut. It now keeps asking until the service answers, so the app appears as soon as it is ready however long that takes.',
      'Linux and Mac: Retry now recovers an interrupted engine setup. The first engine install is several gigabytes, so stopping partway through is easy to do — a dropped connection, a power cut, a full disk, or simply quitting and coming back later. Retry failed to recover from that in two different ways. It used to fail instantly, every time, because the setup tool refuses to reuse either leftover from the first attempt: the Python environment it had created, or the engine folder it had already downloaded. Then it did the opposite — it finished in seconds, announced success, and left an engine that could not start, because it judged whether the install was already done from a file that exists from the very first moment of setup, so a half-finished install looked complete and only the extras were reinstalled. Either way there was no way forward from inside the app; the only fix was deleting folders by hand that nobody would think to look for. Setup now replaces the Python environment cleanly, picks up the existing engine folder where it left off, and checks whether the install genuinely finished before deciding what to repair — so Retry does what it says, and keeps what you already downloaded. Windows was never affected.',
    ],
    breakingChanges: [],
    engineNotes: [],
  },
  '1.2.0': {
    version: '1.2.0',
    importantChanges: [],
    whatIsNew: [
      'DEPTH CONTROL FOR SDXL — the five SDXL generators (SDXL Realistic, SDXL NSFW, ILL Anime Beauty, ILL Anime, PONY Mix) can now follow the pose and composition of a reference image using a depth ControlNet. Pick the Depth operation, drop in an image, and the result keeps its structure while your prompt drives the content.',
      'STAGE ALL MODELS ON CONNECT — we found that copying your installed models onto the Pod fast local disk ahead of time makes the first generation start much sooner, so there is now a RunPod setting (off by default) that stages every installed model the moment the Pod connects. Off keeps the default, staging each model on first use.',
    ],
    fixes: [
      'Switching between image models on a RunPod engine no longer re-reads the weights from the slow network volume every time; they are staged to the Pod fast local disk, cutting a cold switch from about 2 minutes to a few seconds. The Pod disk now auto-sizes to your network volume so the whole model set fits. Video models (LTX) that stream by design are unaffected.',
      'After a model downloads to a RunPod engine, the app no longer re-reads every weight back off the slow network volume to checksum it; a completed multi-connection download is trusted directly, so the Verifying step that could run longer than the download itself (about 3 minutes on a 2GB file) is now near-instant.',
      'Dragging a gallery card out into a folder now saves it with its real filename from the project Media folder (for example t2i_001.png) instead of a generic project-file.png, which also collided into an already-exists prompt when you dragged out more than one. Dragging cards onto the prompt to reuse them is unchanged.',
      'Copy mask now carries the auto-detected regions too: it previously only carried your brushed and erased strokes, so the auto-detected selection was lost on paste, and a mask made purely from auto-detect copied as nothing. It now matches what Download mask already exported.',
      'A single generation finishing while the app is focused now shows the Generation finished toast; previously only multi-generation batches did. Notifications are quieter overall: routine confirmations (importing a model, uninstalling, adding cards to a project, switching models to continue a preview) no longer play a sound, and returning to the app after a download finished no longer replays a duplicate toast.',
      'Toast notifications no longer cover your prompt text: the toast stack now stacks up from the bottom-right corner instead of the bottom-left, keeping the prompt box clear.',
    ],
    breakingChanges: [],
    engineNotes: [
      'COMFYUI ENGINE UPDATED TO 0.28.0 — from 0.27. Brings a text-model sampling speedup and int8/int4 optimizations that mainly help local Turing and 16-series GPUs. No workflow or behavior changes; every shipped model was re-swept and passed.',
    ],
  },
  '1.1.0': {
    version: '1.1.0',
    importantChanges: [
      'INSTALL INDIVIDUAL MODEL OPERATIONS — Multi-capability models (for example Wan 2.2 does both text-to-video and image-to-video) let you toggle which operations to download in the detail panel; shared parts like the VAE and text encoder download once. Only the operations you install appear in the prompt box. Image models are unchanged.',
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
      'AUTOMATIC UPDATE CHECK — Cubric checks for a newer version on startup and, when one is available, offers to update in one click: it closes, downloads and installs the new version, then reopens. Not now? It waits, and stops asking for that version after you decline a few times, until a newer one arrives.',
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
