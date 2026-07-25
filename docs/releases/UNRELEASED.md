# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## whatIsNew

- **Krea 2 holds onto a character far better.** The edit path has been rebuilt
  around the newer Krea 2 edit engine: the model is pushed harder to
  keep the face and features of the person you gave it. Restaging someone into a
  new pose, outfit or scene now comes back recognisably *them*, and references
  whose shape doesn't match your output no longer come out stretched or soft.

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
