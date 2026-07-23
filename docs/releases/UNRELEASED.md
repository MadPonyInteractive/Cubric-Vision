# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.

## Engine

- **ComfyUI engine updated to 0.28.0** (from 0.27.0). Brings Qwen3-VL tokenizer
  fixes (image describer + Krea2 edit CLIP), a text-model sampling speedup, and
  int8/int4 optimizations that mainly help local Turing/16xx-series GPUs. No
  workflow or behaviour changes — every shipped model was re-swept and passed.
