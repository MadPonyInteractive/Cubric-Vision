# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## whatIsNew

- **New model: FLUX.2 Klein.** The fastest image model in Cubric Vision, and the
  only one that can take things *out* of a picture — paint over an object, hit
  **Remove**, and it's gone in about four seconds. It covers the full set in one
  model: generate from text, reshape an existing image, follow a depth
  reference, edit with up to three reference images, clean up detail and upscale,
  with eight style looks available on every one of those. Quality is modest next
  to Krea 2 — this one is built for speed and for tidying images up, so reach for
  it when you want an answer now or something removed, and for Krea 2 when you
  want the finished piece.

  > Tip: **Depth** on this model takes *two* images if you give it two. The first
  > supplies the pose, the second supplies who is in it — so you can put your own
  > character into a pose you found, without describing either of them.

- **Krea 2 edits follow your instructions much more closely.** The edit path has
  been rebuilt around the newer Krea 2 edit engine. Your reference image is now
  fitted to the shape of the picture you're making, so asking for a new setting
  actually gives you a new setting instead of quietly keeping pieces of the
  original background. Restaging someone into a new pose, outfit or scene lands
  closer to what you asked for, likeness is better, and references whose shape
  doesn't match your output no longer come out stretched or soft.

  > Tip: the more of your reference frame the character fills, the better the
  > likeness. Crop your reference to the person before using it.

- **Krea 2's quality setting produces far more natural images.** This affects
  everything made at the quality speed, not just edits — the sampler was pushing
  the model too hard, which flattened lighting, over-saturated colour and gave
  skin and surfaces a waxy, plastic look. It is now dialled back, and a second
  detail pass finishes the image. Lighting reads like a real photograph, skin and
  fabric hold real texture, and backgrounds resolve properly instead of going
  soft. It also sticks to your prompt more literally: where it used to quietly
  add flattering or on-theme details you never asked for, it now gives you what
  you actually described. The fast setting is unchanged.

- **Blend two versions of an image together with a mask.** When a re-run fixes
  one part of a picture and ruins another, you no longer have to choose. Paint a
  mask over the area you care about, select that entry and the one you want to
  borrow from, right-click and pick **Mask composite**. **Add** drops the other
  entry's pixels into the masked area; **Subtract** does the reverse, keeping the
  other entry and taking only the masked area from the one you painted. The blend
  lands as a new entry in the strip, so nothing is overwritten and deleting it
  undoes the whole thing. The edge is softened automatically, and a mask drawn as
  an outline fills in, exactly like everywhere else masks are used.

- **Hold Alt to drag a gallery card straight into another app.** Dragging a card
  out to a folder has always worked, but dropping it into Discord, Photoshop or a
  browser upload box did nothing — a plain drag only hands over a *promise* of a
  file, which the file manager understands and other apps ignore. Hold **Alt**
  while you drag and the card leaves as a real file, so any app that accepts a
  dropped file now takes it. You can let go of Alt once the drag is moving. If
  several cards are selected, Alt-dragging one of them drags all of them at once.
  A plain drag is unchanged: onto the prompt to reuse a card, into a folder to
  save it.

- **Image descriptions are sharper and get straight to the point.** Describe an
  image and it no longer starts with "The image shows…" — the description opens
  on the subject itself, so you can paste it straight into a prompt. It is also
  considerably more thorough, covering the subject, clothing, materials,
  lighting, composition and background in enough detail to recreate the shot.

- **Pick what you're making from a strip, not a dropdown.** Every operation your
  model can do now sits above the prompt box as a row of chips, with the current
  one lit. An operation you can't run right now stays visible but dimmed, and
  hovering it says exactly what's missing — *needs 1 image*, *paint a mask
  first*, *takes at most 2 images* — instead of quietly disappearing from a list.
  The same strip appears inside the parameters popup, so you can change operation
  without closing it. Clearing the last image now drops you back to
  text-to-image on its own, and the operation you actually chose comes back the
  moment you add an image again.

- **Every operation now explains how to prompt it.** Operations want completely
  different prompts and nothing in the app said so — Inpaint wants you to
  describe what *should be there* (and erases the masked area entirely if you
  leave the prompt empty), Upscale is usually best with no prompt at all, and
  Edit wants an instruction rather than a description. Open the parameters popup
  and there's now a **?** above the operation strip: it opens a short guide for
  whichever operation you're on — what the prompt is for, a couple of examples,
  and the mistake people usually make. It follows your model too, so the SDXL
  family is pointed at comma-separated tags while the newer models are pointed
  at plain sentences.

- **Choosing a model is a full-screen contact sheet.** The model dropdown is now
  a grid of preview tiles like the Model Library, so you pick by looking at the
  work rather than reading names. Holding **Tab** opens it straight away — the
  gesture is identical every time, instead of a ring that rotated and changed
  size depending on which model you were on. LoRA & Upscale settings open from
  the model's own tile.

## fixes

- **Stopping a generation no longer says it finished.** Pressing Stop could still
  pop a "Generation finished" notification with the completion chime, because the
  engine often completes the step it was already working on and hands back a
  finished image. That result is still kept — it just no longer announces itself
  as a successful run you didn't ask for.

- **Krea 2 upscaling is sharp again.** Upscales came out noisy — bad enough to be
  unusable at full quality, and mediocre on the fast setting. The upscaler now
  finishes with a short refining pass, and full quality no longer borrows the
  fast setting's accelerator, so it actually renders at the quality you picked.
  Both speeds improved; full quality is the bigger jump.

- **Your images no longer carry hidden data.** ComfyUI stamps the entire
  generation graph — your prompt, negative prompt, seed, model names and the
  full node workflow — invisibly inside every PNG it produces. Cubric Vision now
  strips that out as each image is saved, so you can share or publish your work
  without leaking the prompts behind it. Pixels are untouched: the file is
  byte-for-byte the same image, just without the hidden payload. Applies to
  newly generated images; images already in your project keep their original
  metadata.

- **Gallery cards now match the picture inside them.** A card was laid out using
  the size you *asked* for rather than the size that came back, so whenever a
  model produced something a different shape — some of them adjust dimensions to
  suit the picture — the card was cut to the wrong shape and the image sat inside
  it with padding around the edges. Opening the entry always showed it correctly;
  only the grid was wrong. Cards are now measured from the finished image, so the
  grid lays out cleanly and the small padding some models produced is gone.
