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

- **Mask toolbar: one Detect button.** The three detection methods (Points, Text,
  Auto) now live in a small strip that opens beside the Detect button instead of
  taking three slots in the toolbar. Same tools, same behaviour — less column.
- **Choosing between detection results is much faster.** One detection now finds
  every match in a single pass, so picking a result — or changing your mind and
  picking another — no longer runs the detection again each time. Trying all of them
  costs what one used to.
- **A detection shows its progress, and can be stopped.** The status bar reports a
  running detection with a timer, and the Detect button turns into Stop while it
  works. A slow pass over a busy image used to look like the app had frozen, with no
  way to call it off.
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
- **Adjust a mask you already have.** A new Adjust tool in the Mask group grows or
  shrinks the whole mask, or reduces it to a band around its edge — so you can fix
  the edge of a subject without regenerating the middle of it. Drag the slider and
  watch the mask change live, then press Apply. Undoable like any other mask edit.
- **Fill.** Closes enclosed holes in a mask in one press, in the app where you can
  see what is being filled before you commit to it.
- **Outline anything you paint.** The Adjust tool now works on the paint layer too —
  grow or shrink a scribble, or reduce it to a band around its edge, which outlines it
  in the colour you pick. Growing fills the new edge in that colour and leaves what you
  already painted untouched; shrinking eats the edge inward and keeps every surviving
  brushstroke its own colour. Live preview and Apply, undoable, same as the mask.
- **Control Strength.** Krea 2, FLUX.2 Klein, Chroma and the SDXL family gained a
  slider on Control for how hard the control map pulls. At full strength the
  composition is locked to the source; easing it off lets the model reinterpret the
  framing while keeping
  the pose. Klein bites softer than Krea 2, so it wants a lower setting.
- **Shapes — drop a rectangle, triangle or ellipse straight onto the canvas.** A
  Shapes tool in BOTH the Mask and Paint groups. Drag the shape or its handles to
  size it, hold **Shift** to resize it without squashing it, **Alt** over a handle
  to spin it around that point, then press
  **Add** or **Subtract** to commit it to the mask — or **Fill** / **Erase** to
  commit it to your paint, in the colour you picked. The shape stays where you put
  it after each press, so stamping the same ellipse in three places is three drags.
  No model runs and nothing downloads: it is instant, and undoable like every other
  canvas edit.
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
  tool with a brush, an eraser and a colour picker. A rough scribble tells the model
  *where*, *how big* and *what colour* — something a prompt alone cannot say. Paint a
  shape, then mask it and run Detail over it, and the model works from your sketch
  instead of guessing. The paint stays on your image while you switch to the mask
  tools, and it keeps itself per image until you close the app, so nothing is lost
  while you work. Undo works on it like anything else on the canvas. Press **Apply**
  to bake it in as a new entry — your original is untouched, so deleting the new
  entry undoes it.
- **Turn a mask into paint, or paint into a mask.** Right-click the image and convert
  either way. A mask becomes a filled shape in the colour you have picked; paint
  becomes a mask of the same shape, ready to run an operation over. Both are copies —
  the layer you converted from stays exactly as it was, so nothing is lost and one
  Ctrl+Z takes it back.
- **Resize — one click back to the original size.** An **Original Size** button under
  the width and height boxes puts both back to the picture's own dimensions, so you
  can try a size, change your mind and start again without looking the numbers up.

## importantChanges

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
- **Krea 2 and Chroma keep your source dimensions.** On Krea 2, every operation
  except Text to Image and Image to Image now follows the input image's shape
  instead of the ratio picker. On Chroma this applies to Detail and Upscale;
  its Control operation still generates at the size you pick.

## fixes

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
- **Pinching on a Mac trackpad no longer resizes the whole interface.** macOS
  sends a two-finger pinch as a Ctrl+scroll, and the app was treating that as the
  shortcut for changing UI size — so trying to zoom into an image blew up the
  entire interface instead. Ctrl+scroll no longer changes UI size on any
  platform; use **Ctrl** (or **Cmd**) with **+** / **-**, which always did the
  same job.
- **Model downloads now have a second route when your network blocks the first.**
  Every model file was served from one address, so an ISP filter, a school or
  office network, or antivirus web protection sitting on that one address stopped
  the whole catalogue — nothing would install, and the app looked broken when the
  network was the problem. If the connection to the usual host fails, the download
  now retries the same file from Hugging Face automatically, and anything already
  downloaded is kept rather than started over. It also no longer loses the
  explanation: if both routes fail you still get the "your network blocked this,
  try a VPN" message instead of a bare error code. This helps when a network
  blocks the address; a network that interferes with the transfer itself can still
  break a download.
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
