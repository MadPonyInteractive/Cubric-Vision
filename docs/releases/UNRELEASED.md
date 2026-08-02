# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.
>
> **Still accumulating.** The one-master-template migration is not finished — Boogu
> Image Edit gains localised edit next and SDXL follows with more. When it lands,
> EXTEND the model lists in the bullets below (localised edit, Depth Strength);
> do not add a second near-duplicate bullet per model.

## whatIsNew

- **Mask toolbar: one Detect button.** The three detection methods (Points, Text,
  Auto) now live in a small strip that opens beside the Detect button instead of
  taking three slots in the toolbar. Same tools, same behaviour — less column.
- **Localised edit — edit part of an image at full size.** Mask an area before an
  edit and only that area is regenerated. A whole-image edit has to shrink your
  picture to the size the model works at; a masked edit crops to the mask instead,
  so the picture keeps its original resolution and everything outside the mask is
  untouched. It rewards a precise mask — for broad changes like a new pose, leave
  the mask off and let the model rework the whole image. On Krea 2, FLUX.2 Klein
  and Qwen Image Edit.
- **Pose and Depth on Qwen Image Edit.** Copy the pose of one image, or its depth
  and composition, and paint your prompt into it.
- **Depth Strength.** Krea 2 and FLUX.2 Klein's Depth op gained a slider for how
  hard the depth map pulls. At full strength the composition is locked to the
  source; easing it off lets the model reinterpret the framing while keeping the
  pose. Klein bites softer than Krea 2, so it wants a lower setting.

## importantChanges

- **Krea 2 styles now reach Detail and Upscale.** Every Krea 2 operation runs one
  workflow, so the style you picked stays applied through the finishing passes
  instead of being dropped by them.
- **Krea 2 Depth takes a second image.** Image 1 supplies the pose and
  composition, image 2 supplies who is posed into it.
- **Krea 2 keeps your source dimensions.** Every operation except Text to Image
  and Image to Image now follows the input image's shape instead of the ratio
  picker.

## fixes

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
  per operation, so switching between Edit, Depth and Pose silently changed the
  tier underneath you. It is now one setting for the model.
