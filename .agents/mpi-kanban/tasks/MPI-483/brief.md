# MPI-483 — two space accountings misread the same volume

Both surfaced 2026-08-08 when the smoke fill hit a **false** disk-full. They are separate
bugs that compound, and both read their requirement from the wrong numbers
(**MPI-482** — land that first, or a corrected gate is just precisely wrong).

## Bug 1 — the disk-full gate counts APPARENT bytes

`GET /wrapper/disk` is `du -sb` (`wrapper/wrapper.py:11`). `-b` is `--apparent-size`: it
sums declared file **lengths**, not allocated blocks.

**The mechanism is SPARSENESS, not preallocation** — and the codebase already corrected
this mislabel once, so do not reintroduce it. `wrapper.py:1754` spells it out: aria2
writes `-s 128` segments at scattered offsets with **`--file-allocation=none`**, so a
`.part` file's *logical* size snaps to ~the full total the instant any late segment
writes near EOF, while its allocated blocks are only what has actually arrived. The same
comment notes this was *"mislabeled an 'aria2 preallocation artifact' in MPI-95; there is
no preallocation here."*

That makes the gate's error close to worst-case rather than proportional: an in-flight
21 GB transformer reads as ~21 GB used from its first minutes, not as the 2 GB it holds.

Measured on `aghcuvg7nl`:

| source | reading |
|---|---|
| wrapper (`du -sb`, apparent) | 307.65 GB used |
| RunPod console (real blocks) | 259 GB used |
| phantom | **48.65 GB** of preallocated-but-unwritten partials |

The app subtracts the apparent figure to compute free space, and refused an install with
`47.3 GB needed, 39.4 GB free` while roughly **91 GB was physically free**.

**Why it matters beyond the smoke run:** any user with a part-finished download is told
the disk is full when it is not, and the message they get is the MPI-100 out-of-space
**toast** — which is worded as user-actionable ("free up space and try again") and, in
this case, is a lie. Freeing space is not the remedy; the number is wrong.

Note `wrapper.py:718` records that a `statvfs` block was tried here and **reverted** —
read that comment before reaching for statvfs again.

## Bug 2 — the smoke preflight never checks FREE space

`scripts/smoke-workflows.mjs` prints `weights 300.5 GB · volume 350 GB` and compares its
estimate against the volume's **total size**. It never asks what is free, and never asks
what the volume already holds.

So it passed cleanly against a volume that could not fit the set, rented Pods, spent
~40 minutes filling, and died 8 models in with the GPU leg still unproven.

It should refuse to rent anything unless **measured free bytes** exceed the remaining
requirement with headroom — and say what it measured, not what it estimated.

## Order

MPI-482 → Bug 1 → Bug 2. Fixing Bug 1 alone leaves Bug 2 blind.
