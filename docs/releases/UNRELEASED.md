# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## whatIsNew

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

- **Image descriptions are sharper and get straight to the point.** Describe an
  image and it no longer starts with "The image shows…" — the description opens
  on the subject itself, so you can paste it straight into a prompt. It is also
  considerably more thorough, covering the subject, clothing, materials,
  lighting, composition and background in enough detail to recreate the shot.

## fixes

- **Your images no longer carry hidden data.** ComfyUI stamps the entire
  generation graph — your prompt, negative prompt, seed, model names and the
  full node workflow — invisibly inside every PNG it produces. Cubric Vision now
  strips that out as each image is saved, so you can share or publish your work
  without leaking the prompts behind it. Pixels are untouched: the file is
  byte-for-byte the same image, just without the hidden payload. Applies to
  newly generated images; images already in your project keep their original
  metadata.
