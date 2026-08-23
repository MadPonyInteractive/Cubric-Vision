# GC the pre-rename Klein style LoRAs

**Origin:** MPI-609, 2026-08-23. Fabio: run it *"in two or three releases after the next
release, because users don't keep an old release when the new one comes out."*

## Why this was deferred rather than done with the rename

MPI-609 renamed all 15 Klein style weights and split them by size. It did NOT delete the
old copies, on purpose:

- **R2 / HF** — the app released at the time of the rename still ships the OLD dep URLs.
  Deleting the old keys immediately would 404 a style-LoRA install for every user who had
  not yet updated. Copy-then-defer was the only safe order.
- **User disks** — a renamed dep is invisible to the orphan sweep. `_orphanedDepIds`
  (`routes/downloadManager.js`) iterates `Object.keys(DEPS)`, and the old filenames left
  DEPS entirely, so nothing in the app can ever see them again. They are inert bytes, not
  a correctness problem, which is why they can wait.

## Do not start this before

The release carrying MPI-609 is **two-three releases old**. Check `releaseNotes.js` /
the GitHub releases before touching anything. Deleting early is the one way this card
does damage.

## The three legs

### 1. R2 (15 keys) — `cubric-r2:cubric-models/vision/models/loras/flux2-klein/styles/`

Delete only the FLAT keys at that prefix; everything under `4b/` and `9b/` is live.
Old flat basenames:

    Anime_new_mecha_klein4b.safetensors
    DisneyMidCenturyKlein9b.safetensors
    Flux-Klein-4B-Art_10.safetensors
    New_Mecha_Klein9B.safetensors
    PULPKHOR.safetensors
    Real_Vintage_Photo_klein9b.safetensors
    amano_flux_02.safetensors
    flux2-klein-4b-lora-Fluxtoon-Style.safetensors
    flux2-klein-4b-lora-Jojoso-Style_000002000.safetensors
    flux2-klein-4b-lora-muppetshow-style.safetensors
    klein4b-doodle_v1.safetensors
    klein9b-doodle_v1.safetensors
    robloxchibidoll_lora_klein4b_000002200.safetensors
    robloxchibidoll_lora_klein9b.safetensors
    vintage_photo.safetensors

`rclone` needs **`--s3-no-check-bucket`** or every call 403s naming `CreateBucket` while
write access is actually fine (cost MPI-609 one full failed pass). R2 deletion also needs
**explicit Fabio approval** per the capability README - confirm again at the time.

### 2. Hugging Face (7 files) — `Mad-Pony-Interactive/cubric-studio`

The seven flat-root 9B files (`DisneyMidCenturyKlein9b`, `PULPKHOR`, `New_Mecha_Klein9B`,
`robloxchibidoll_lora_klein9b`, `klein9b-doodle_v1`, `Real_Vintage_Photo_klein9b`,
`amano_flux_02`). Their `loras/flux2-klein/styles/9b/<Label>` copies are live.

Load the write token from `C:/Users/Fabio/.secrets/hf.txt` explicitly - the ambient token
is scoped to `MadPonyInteractive`, a different account from `Mad-Pony-Interactive`, and
silently has no write here. Note deleting from HF drops the POINTER, not the LFS object.

### 3. User disks (up to 0.72 GB per 4B user)

Only the **4B** half is ever on a user's disk - 9B had not been released when MPI-609
landed, so no user has the 9B weights under any name. Eight files, flat in
`loras/flux2-klein/styles/`, listed above.

Nothing in the app can see them (they are not in DEPS). Options, in ponytail order:

- **Do nothing** - they are inert. Cheapest, and defensible if disk pressure is not real.
- A one-shot boot delete of exactly those eight basenames, in the local engine gate
  (`routes/engine.js`, where the missing/drifted dep repair already runs). Guard it on the
  new file being present, so it can never delete a weight the user still needs.

Do NOT widen the orphan sweep to delete unknown files - MPI-310 destroyed 5.24 GB that way,
and `_orphanedDepIds`' comment is explicit that a second notion of "orphan" is how it
happened.

## Verify

- `styles/` in R2 lists only `4b/` and `9b/` prefixes, no flat keys.
- All 15 `url` and 7 `mirrorUrl` values in `loraDeps.js` still HEAD 200 afterwards.
- `node --test tests/style-rack-deps-resolve.test.cjs` still green.
