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

## whatIsNew

- **Mask toolbar: one Detect button.** The three detection methods (Points, Text,
  Auto) now live in a small strip that opens beside the Detect button instead of
  taking three slots in the toolbar. Same tools, same behaviour — less column.
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
- **Control Strength.** Krea 2, FLUX.2 Klein, Chroma and the SDXL family gained a
  slider on Control for how hard the control map pulls. At full strength the
  composition is locked to the source; easing it off lets the model reinterpret the
  framing while keeping
  the pose. Klein bites softer than Krea 2, so it wants a lower setting.

## importantChanges

- **Your mask reaches the model the way you drew it.** A masked edit used to close
  every hole in your mask and grow it slightly before generating, so a mask drawn as
  a ring around a subject arrived at the model as a solid blob — the shape you wanted
  was impossible to ask for. That no longer happens on any model. If you do want a
  hole closed, the new **Fill** button does it where you can see it.
- **A detection you don't add is a preview.** Detect, Points and Text show their
  result in green as a preview. Leaving the tool now discards it — press **Add**
  to keep it. Previously an un-added detection followed you to other tools and
  was silently used in the next generation.
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
- **Running your own ComfyUI no longer breaks the app's.** If you already had
  ComfyUI open, the app quietly used *your* install instead of its own, because
  both were on the same port. Yours does not have the app's custom nodes, so every
  generation stopped with "Node 'Input_Seed' not found. The custom node may not be
  installed." — which read as a broken install, when nothing was wrong with it. The
  app's engine now runs on its own port and stays out of the way of yours, so you
  no longer need to close ComfyUI before opening Cubric Vision. If something else
  is using that port, the app now tells you instead of silently generating on it.
