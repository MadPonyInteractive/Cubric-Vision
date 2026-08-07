# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.
>
> **The one-master-template migration is DONE** (MPI-365, closed 2026-08-03) — every
> image model, SDXL last. The video models were never part of it: LTX already had the
> shape, and multi-stage/quantisation files are separate for reasons one graph cannot
> absorb. Folded in below: Boogu's localised edit (MPI-428), Chroma's migration, and
> SDXL's. If another model ever joins, EXTEND the model lists in the existing bullets
> (localised edit, Control Strength, styles reaching Detail/Upscale, source
> dimensions); do not add a near-duplicate bullet per model.
>
> **Chroma's four style LoRAs were uploaded to R2 on 2026-08-02, so this block is
> clear.** A fifth style (Cinema) was cut on a licence call before release — if you
> are reading an older draft that lists it, the rack is four.
>
> **Composite (MPI-373) is now listed below** — user-tested in the app 2026-08-04, which
> was the only thing gating these lines. Earlier drafts describing a paste-two-slots flow
> were written and REMOVED before it shipped, because a changelog line for a flow that
> will not ship is worse than no line; the entries below describe what he actually ran.

## whatIsNew

- **The mask tools, rebuilt as a toolkit.** Everything that makes a mask now sits in
  one group and works the same way. Paint one by hand with **ten brushes** — hard and
  soft rounds, feather, airbrush, chisel, calligraphy, spray, charcoal, stipple and a
  dry brush — instead of the single hard circle. Drop a **rectangle, triangle or
  ellipse** on the canvas and **Add** or **Subtract** it: drag the shape or its
  handles to size it, hold **Shift** to resize without squashing it, **Alt** over a
  handle to spin it, and it stays where you put it so stamping the same ellipse three
  times is three drags. **Adjust** the result — grow the whole mask, shrink it, or
  reduce it to a band around its edge — with a live preview and Apply, so you can fix
  the edge of a subject without regenerating the middle of it. **Fill** closes
  enclosed holes in one press, where you can see what is being filled before you
  commit to it. And a finished mask can be **turned into paint** from the right-click
  menu, or paint turned back into a mask, as a copy that leaves the original alone.
  No model runs and nothing downloads for any of it: all instant, all undoable.
- **Detection: one button, one pass, and a way to stop it.** The three detection
  methods — Points, Text and Auto — now open in a small strip beside a single
  **Detect** button instead of taking three toolbar slots. One detection finds every
  match in a single pass, so picking a result, or changing your mind and picking
  another, no longer re-runs it — trying all of them costs what one used to. While it
  works, the status bar reports it with a timer and Detect turns into **Stop**: a slow
  pass over a busy image used to look like the app had frozen, with no way to call it
  off.
- **Localised edit — edit part of an image at full size.** Mask an area before an
  edit and only that area is regenerated. A whole-image edit has to shrink your
  picture to the size the model works at; a masked edit crops to the mask instead,
  so the picture keeps its original resolution and everything outside the mask is
  untouched. It rewards a precise mask — for broad changes like a new pose, leave
  the mask off and let the model rework the whole image. On Krea 2, FLUX.2 Klein,
  Qwen Image Edit and Boogu Image Edit.
- **Control — copy the structure of an image.** One operation that takes a picture,
  reads the structure out of it and paints your prompt into that shape. A Control Type
  picker chooses WHICH structure: Depth keeps volume and framing, Pose keeps only the
  body skeleton, Scribble and Canny keep outlines. SDXL Realistic, SDXL NSFW, ILL Anime
  Beauty, ILL Anime and PONY Mix offer all four; Qwen Image Edit offers Depth and Pose.
  It replaces the old Depth operation everywhere: Krea 2 and FLUX.2 Klein still do depth,
  they just do it under the new name and show no picker, having only the one.
- **Control on Chroma.** Both Chroma models can now follow the depth and composition
  of an input image and paint your prompt into that shape.
- **Four styles on Chroma.** Chroma gains a style rack — B&W Sketch, Lenovo,
  Brushwork and Anime — available on every operation, Detail and Upscale
  included.
- **Control Strength.** Krea 2, FLUX.2 Klein, Chroma and the SDXL family gained a
  slider on Control for how hard the control map pulls. At full strength the
  composition is locked to the source; easing it off lets the model reinterpret the
  framing while keeping
  the pose. Klein bites softer than Krea 2, so it wants a lower setting.
- **Composite — blend two of your images and watch it happen.** Two new tools in a
  Composite group. Right-click the image you want *underneath* and choose **Send to
  Composite**, then open **Paint Comp** on another image and erase — the picture
  underneath shows through live where you erase, and the brush paints the top one back.
  **Mask Comp** does the same cut in one step using the mask already on the image, so
  everything the mask tools can select — brush, detect, points, text, shapes, adjust —
  can drive a blend. Press **Apply** to keep it as a new entry at full resolution; your
  originals are untouched. The old blend asked you to decide before you could see
  anything, which meant running it three or four times to get one result.
- **Paint — draw on your image and let the model take it from there.** A new Paint
  group with a brush, an eraser and a colour picker. A rough scribble tells the model
  *where*, *how big* and *what colour* — something a prompt alone cannot say. Paint a
  shape, then mask it and run Detail over it, and the model works from your sketch
  instead of guessing. It gets **the same ten brushes as the mask** — feather,
  airbrush, chisel, calligraphy, spray, charcoal, stipple, dry brush and the two
  rounds — and the **same rectangle, triangle and ellipse**, committed here as
  **Fill** or **Erase** in the colour you picked. **Adjust** works on paint too, and
  it is how you outline something: grow a scribble and the new edge is filled in your
  colour while what you already painted is left alone, shrink it and the edge is
  eaten inward with every surviving brushstroke keeping its own colour, or reduce it
  to a band and the scribble becomes its own outline. The paint stays on your image
  while you switch to the mask tools, and it keeps itself per image until you close
  the app, so nothing is lost while you work. Undo works on it like anything else on
  the canvas. Press **Apply** to bake it in as a new entry — your original is
  untouched, so deleting the new entry undoes it.
- **Resize — one click back to the original size.** An **Original Size** button under
  the width and height boxes puts both back to the picture's own dimensions, so you
  can try a size, change your mind and start again without looking the numbers up.
- **Hover sound now has a volume, not just an on/off.** A volume slider sits next to
  the gallery size slider, so you set how loud a hovered video or audio card plays
  without leaving the gallery. Sliding it to zero is the mute — which is why the
  "Play audio on hover" switch is gone from Settings; it was the same control, two
  rooms away. At zero an audio card stays silent instead of pretending to play, and
  a video still previews without sound.

## importantChanges

- **LTX 2.3's Balanced tier moved to a better, smaller model file.** The two
  GPU-specific options (RTX 50 Series / RTX 40 & Older) are gone — one file now runs
  on every card, at 20GB instead of 24–25GB, with better detail and sound. If you
  already have LTX Balanced installed, the new file downloads once and the old one is
  cleaned up. Text to Video and Image to Video also share one workflow now, so which
  one you get follows from whether you supply a first or last frame.
- **Wan 2.2 is image-to-video only now.** Its Text to Video operation has been
  retired: LTX 2.3 does that job better, and Wan's text-to-video weights were a
  27GB download that served nothing else. Image to Video is untouched — same
  model, same speed, same results. If you already downloaded the text-to-video
  weights, they are no longer counted as part of Wan 2.2, so the next time you
  uninstall a model they get cleared out with it rather than sitting on your
  drive owned by nothing. Text to video lives on LTX 2.3, MiniMax H3 and
  Wan 2.2 5B.
- **Some models now ask you to accept their licence before they download.** A few
  model licences require us to show you the restrictions and record that you accepted
  them before you receive the weights — MiniMax H3 is the first one we ship. You will
  see the terms, and where a model is not licensed in your region, a link to request
  your own authorization from the licensor. Every other model installs exactly as
  before, with no extra step. The licence and a way to report misuse stay reachable
  from the model's panel afterwards.
- **Your mask reaches the model the way you drew it.** A masked edit used to close
  every hole in your mask and grow it slightly before generating, so a mask drawn as
  a ring around a subject arrived at the model as a solid blob — the shape you wanted
  was impossible to ask for. That no longer happens on any model. If you do want a
  hole closed, the new **Fill** button does it where you can see it.
- **Mask composite follows the mask you drew.** Compositing through a ring or an
  edge-band mask filled in the middle before blending, so the whole enclosed area
  came through instead of just the band you selected — the same thing that used to
  happen inside the generator and was fixed there in this version. It now uses the
  mask as drawn. Use **Fill** if you want a hole closed.
- **The Add / Subtract composite dialog is gone.** Blending two images used to mean
  selecting both, having one of them already carry a mask, and answering Add or Subtract
  in a dialog — with nothing on screen to judge it by. The Composite tools replace it
  entirely: the selected image is always the one on top, and you see the blend while you
  make it. **Two images of different sizes are now cropped to fill rather than stretched**,
  and the preview on the canvas matches the file that gets written.
- **A detection you don't add is a preview.** Detect, Points and Text show their
  result in green as a preview, and it stays a preview: leaving the tool discards
  it, and generating without pressing **Add** no longer sends it. Previously an
  un-added detection was silently used in the next generation. Because of this,
  the operations that need a mask stay unavailable until you press **Add** or
  **Subtract** — a green preview on its own is not a mask yet.
- **Krea 2 and Chroma styles now reach Detail and Upscale.** Every operation on
  these models runs one workflow, so the style you picked stays applied through
  the finishing passes instead of being dropped by them.
- **Krea 2 Control takes a second image.** Image 1 supplies the pose and
  composition, image 2 supplies who is posed into it.
- **On a Mac, install Apple's Command Line Tools before your first setup.** Setting
  up the local engine needs `git`, which on macOS only arrives with the Xcode Command
  Line Tools — and a clean Mac does not have them. The first Install press stops with
  a message naming exactly that. Open Terminal, run `xcode-select --install`, let
  Apple's download finish, then press Retry. This is a known issue, not a fault in
  your download: Windows ships a prebuilt engine and never needs git, while macOS and
  Linux build theirs. Removing the requirement is being worked on separately.
- **Krea 2 and Chroma keep your source dimensions.** On Krea 2, every operation
  except Text to Image and Image to Image now follows the input image's shape
  instead of the ratio picker. On Chroma this applies to Detail and Upscale;
  its Control operation still generates at the size you pick.

## fixes

- **LTX video generation works again.** Every LTX generation has been failing since the
  1.3.0 release — the run stopped at the first sampling step and produced nothing. A
  ComfyUI update changed how one of its components hands over the upscaler model, and the
  node that reads it had not caught up. Both are updated, and LTX runs end to end again.
  If you have been avoiding LTX because it looked broken, it was, and it is not any more.

- **Models you never installed no longer show a half-finished download bar.** Six model
  tiles were showing progress bars — 17%, 22%, 33%, 35%, 36%, 49% — for downloads nobody
  ever started. The bar was counting files that belong to a model you *do* have installed,
  and billing them to its sibling. It now counts only the files that model would actually
  have to fetch.

- **Uninstalling now clears up after itself properly.** Uninstalling a model has always
  kept files that another installed model still needs, which is right. But once that other
  model went away too, its files were left behind for good — owned by nothing, deleted by
  nothing, and invisible in the app because a model you don't have installed offers no
  Uninstall button. On this machine that had quietly accumulated ~16GB. Uninstall now also
  clears out weights that no installed model needs any more. Files shared with something
  still installed are kept, exactly as before. **This works on a cloud Pod's storage volume
  too** — where it matters more, because that volume outlives the Pod and you pay for its
  size every month, so anything stranded on it was costing you until you noticed it.

- **Uninstalling now tells you the truth about what it removed.** On a cloud Pod, the
  confirmation counted every file it asked about as deleted — including files that were
  never on the volume in the first place. One uninstall reported eight files removed when
  exactly one existed. And in the opposite case, a model whose files had already gone
  said "model files kept on disk; still installed" when nothing was kept and nothing was
  left. Both are gone: a file is only reported as removed when it was actually there and
  actually deleted.

- **A hiccup mid-download no longer throws away the download.** A 25GB model that
  stalled for a minute — a router blip, a bad moment on the line — was declared failed
  outright, even though the gigabytes already on disk were perfectly good. It now
  retries on its own and picks up exactly where it left off. It still stops promptly
  and tells you what to do when your network is genuinely blocking the connection,
  rather than sitting there retrying something that will never work.

- **A failed model install now tells you why.** When an install failed after the files
  had downloaded, the error box came up completely empty — no reason, nothing to act on,
  and no hint whether it was worth retrying. The reason was there in the logs the whole
  time; it just never reached the dialog. It does now.

- **A clear message when another program is using Cubric Vision's port.** The app
  serves itself over a local port, and if something else already held it, Vision
  either opened onto whatever that other program was serving or sat on a black
  window with nothing to click — no menu, no refresh, no way out. It now stops and
  tells you which port is taken.

- **The progress bar no longer keeps moving after you press Stop.** Stopping a job
  that reports no percentage — an upscale, a detection — left the bar sweeping away
  under an IDLE label until the next job happened to reset it.

- **Notifications no longer sit on top of what you're working on.** They now appear
  at the top centre of the window, the one strip the interface keeps clear. Every
  corner they lived in before — bottom right, bottom left, top right — covered
  controls or your image.

- **Typing a size in Resize no longer throws an error.** Entering a width or height
  ran the preview again on every single keypress, against the half-finished number
  you were still typing — so the "1" of "1024" was treated as a one-pixel-wide
  image and stopped with a failure dialog. The preview now waits until you finish
  and click away.

- **Resize Video works on a cloud GPU whatever you have installed.** It stopped with
  a missing-node error unless that cloud volume happened to have Wan 2.2 on it —
  the video node it needs only ever arrived as a side effect of installing that
  model, so a volume built up from any other model never got it. The nodes every
  tool relies on are now put in place when you connect, the way they already were
  on your own machine.

- **The mask brush no longer skips on a fast stroke.** The brush placed a dab at
  each position the mouse reported and nothing joined them up, so a quick drag
  left a dotted trail of gaps instead of a solid stroke — worst on a large image
  zoomed out, where the same hand movement covers far more of the picture between
  readings. Strokes are now continuous at any speed.

- **Masked edits no longer fail on large images.** The mask was being sent at a
  smaller size than the picture it belonged to, and any source over roughly 1500
  pixels on its long edge stopped with a dimensions error. Affected FLUX.2
  Klein's masked edit since 1.3.0.
- **Text detect finds things again.** Naming an object found nothing at all
  whenever the result count was 1 — the default, and the setting most runs use.
  The count was written into the prompt in a form the detector read as part of
  the object's name, so it went looking for something that was never there.
  Raising the count to 2 or naming two objects had been dodging it by accident.
  Affected Text detect since 1.3.0.
- **The Qwen Image Edit tier stays put.** Quality/Turbo/Hyper was being remembered
  per operation, so switching between Edit and Control silently changed the
  tier underneath you. It is now one setting for the model.
- **The batch count no longer appears where it did nothing.** On SDXL's Image to
  Image and Control, asking for several images only ever returned one — the setting
  reached a part of the workflow those operations do not use. The control is now hidden
  there rather than lying about it. Text to Image is unaffected.
- **Updating from inside the app reopens it again.** Pressing Update closed the
  app and left it closed, even when the update had applied perfectly — which
  read as a crash. The updater now reopens the app when it finishes, writes a
  log next to the app (update/update.log), and if an update fails it tells you
  why on the next launch instead of vanishing silently. Because the updater that
  runs is the one already installed, this takes effect when updating FROM this
  version — updating TO it still needs you to reopen the app yourself.
- **Ctrl+scroll no longer changes the size of the interface.** macOS sends a
  two-finger trackpad pinch as a Ctrl+scroll, and the app was treating that as the
  shortcut for changing UI size — so on a Mac, trying to zoom into an image blew up
  the entire interface instead. That shortcut is gone on every platform; use **Ctrl** (or **Cmd**) with **+** / **-**, which always did the
  same job. **And the size you pick now survives a restart** — it used to be
  forgotten on every launch, which meant anyone who needs a larger interface set
  it again every single time they opened the app.

- **The live preview now looks like your picture, not a colour blob.** While a
  generation runs, the thumbnail is decoded by a tiny preview model, one per
  model family — and the ones for FLUX.2 Klein were never installed, so it fell
  back to a rough colour projection that told you almost nothing about what you
  were getting. On macOS and Linux *none* of them were installed, so every model
  had the blob. They now install with the engine. A few models still show the
  rough preview on purpose: Krea 2, both Qwen models and Wan 2.2 share a preview
  decoder with a known bug that corrupts the real generation, so the mediocre
  preview is the safe choice until that is fixed upstream.
- **Most model downloads now have a second route when your network blocks the
  first.** Every model file was served from one address, so an ISP filter, a school or
  office network, or antivirus web protection sitting on that one address stopped
  the whole catalogue — nothing would install, and the app looked broken when the
  network was the problem. If the connection to the usual host fails, the download
  now retries the same file from Hugging Face automatically, and anything already
  downloaded is kept rather than started over. It also no longer loses the
  explanation: if both routes fail you still get the "your network blocked this,
  try a VPN" message instead of a bare error code. This helps when a network
  blocks the address; a network that interferes with the transfer itself can still
  break a download. Four files still have a single route — one large model whose
  licence does not allow us to publish a second copy yet, and the three small preview
  decoders, which exist nowhere else in the form the app needs.
- **Setting up the engine downloads less, and stops hiding a step that always
  failed.** The generation engine is built from a set of add-ons, and each one used
  to install its own list of supporting libraries — over a dozen separate passes that
  re-checked the same libraries again and again, sometimes installed a package only
  to replace it moments later, and on some machines pulled in graphics-card libraries
  a computer without that card can never use. The app now installs one list, decided
  and tested in advance, in a single pass: less to download, less to unpack, and the
  same libraries on every machine instead of whichever add-on happened to go last.
  One of those add-ons also had a piece that failed to install on every computer, on
  every platform, on every fresh setup — and reported success anyway. It was never
  used by anything in the app, so it is gone.

- **Running your own ComfyUI no longer breaks the app's.** If you already had
  ComfyUI open, the app quietly used *your* install instead of its own, because
  both were on the same port. Yours does not have the app's custom nodes, so every
  generation stopped with "Node 'Input_Seed' not found. The custom node may not be
  installed." — which read as a broken install, when nothing was wrong with it. The
  app's engine now runs on its own port and stays out of the way of yours, so you
  no longer need to close ComfyUI before opening Cubric Vision. If something else
  is using that port, the app now tells you instead of silently generating on it.

- **The LoRA and upscale pickers in Model Settings open again.** Clicking a LoRA
  slot or the upscale model did nothing — the arrow flipped as if the list were
  opening, but no list ever appeared, so neither a LoRA nor a different upscale
  model could be picked. Affected Model Settings since 1.3.0.

- **The same extra model folder can no longer be added twice.** On Windows, one
  folder can have two spellings — a long one and a short `PROGRA~1`-style one — and
  the app treated them as two different folders, so the same LoRA or upscale folder
  could end up in your list twice. Both spellings now resolve to the same folder.

- **An operation you didn't install no longer fails halfway through generating.**
  Some models let you install one operation without downloading the other. Picking
  the one you skipped started a generation that died on an error report screen,
  which read like a bug in the app. The app now only offers the operations you
  actually installed, and if one slips through it tells you which weights are
  missing and points you at the Model Library instead of asking you to report it.

- **The home screen no longer claims you have no models when it cannot tell.** On a
  cloud-only setup — the local engine install skipped, no Pod connected yet — the
  models count on the home screen read `0 / 18` on a machine whose drive was full of
  weights. Models live in a folder the local engine owns, so with no engine there is
  nowhere to look and nothing to count: the app was showing a zero it had never
  measured. It now shows a dash until an engine, local or cloud, can actually answer.

- **RunPod's "Stage all models on connect" is locked until you save an API key.** The
  panel said the RunPod controls were locked until a key was saved, then let you flip
  that one switch anyway — a setting about connecting to a Pod you had no way to
  connect to yet.

- **The startup splash now covers the whole wait, instead of vanishing on the slow
  starts it exists for.** It was being closed the moment the window had something to
  paint — including the browser's own "cannot connect" page, which is what shows while
  the app's engine is still starting on a cold or slow first run. So the splash
  disappeared early, or on Linux failed to appear at all, and you watched an error page
  until the app arrived. It now stays up until the app itself is loaded.

- **The install screen no longer flickers during the dependency step.** Two things
  report progress at once — the phase the installer is on, and the files it is
  fetching — and they were taking turns overwriting the same line, several times a
  second. Each now has its own place to speak.

- **Installing a model no longer fails after an app update changes a Python package.**
  Once an update moved one of the engine's Python packages, the next model install died
  with **Download Failed** right after the files had downloaded — and every install
  after that failed the same way, so retrying could never work. The engine was running,
  and Windows will not let anything overwrite a file a running program is using. The
  update is now applied while the engine is stopped, on its next start.
