# MPI-433 — re-upload the Krea 2 NSFW weight to HF on/after 2026-08-10

**Date-gated. Nothing here is actionable before 2026-08-10.**

## Why the file is not on HF

`krea2-raw-transformer-nsfw` is coyotte's **LUSTIFY! V10 (Krea 2)**, CivitAI 573152. V10
released 2026-07-10 into **paid early access**, opening to the public **2026-08-10**.
MPI-429's mirror sweep re-hosted it to `Mad-Pony-Interactive/cubric-studio`; the user
deleted that copy on 2026-08-03.

The distinction that drove it: our R2 copy is reachable only through the app's download
manager, a public HF repo is reachable by anyone. Same bytes, different act — and only one
of them needs the paid window to be over. Full reasoning:
`docs/models/krea2/licences.md` § R2-ONLY until 2026-08-10.

The weight itself is **settled and legitimate** — Fabio subscribed to coyotte's paid
channel and deliberately bought three months rather than the one it cost, and the two have
discussed it directly. Do not re-litigate that here; MPI-430's brief holds it.

## What the deletion cost

The dep had **no per-dep `mirrorUrl`** — it was one of the 31 relying on the generic prefix
rewrite (`_mirrorUrlsFor`, `routes/downloadManager.js`). With the HF object gone, that
rewrite hands a network-blocked user a URL that 404s, spending a retry to reach the same
failure. Measured 2026-08-03 by HEAD-ing all 31: **30 × 302, this one × 404.**

Patched with `noMirror: true`. So today the catalogue is 96 deps with two routes and one
with one — this card is what closes that.

## Steps

Full ordered list is in the card's `description`; the two that carry a trap:

- **Upload to the SAME object path** — `vision/models/diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors`.
  That path identity is the entire reason the generic rewrite reaches it with no per-dep
  field. A different path means a hand-written `mirrorUrl`, which the contract forbids
  (`docs/download-manager.md`: generate from the sweep, never hand-write).
- **Verify by HASH.** HF's tree API exposes `lfs.oid`, which IS the sha256. It must equal
  `f165d4db2a4c9a8ce67f88851216ec41ee64ed508f0755de9d4dcd03175bc865`. A matching filename
  proves nothing — a mirror serving different bytes fails the post-download verify and the
  file is deleted.

13.15 GB. `hf_xet` / `hf_transfer` silently bypass any bandwidth cap — memory
`tool_hf_upload_bandwidth_cap` before starting the transfer if the machine must stay usable.

## If the date slipped

Check CivitAI 573152 first. If coyotte has not opened it, **move this card's date and
upload nothing** — the whole point of the deferral is the window, not the calendar.
CivitAI is UK-region-blocked; that check needs Fabio's VPN on (CLAUDE.md § VPN).
