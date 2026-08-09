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

## Date gate CHECKED 2026-08-05 (MPI-450 Gate C) — do not upload

1.4 is being cut BEFORE 2026-08-10, so this card does not run: coyotte's public
release of LUSTIFY V10 has not happened yet and nothing may be uploaded. The card
keeps its date and stays in `todo`.

What the gate actually decided, per MPI-450's brief: since we ship before the date,
the release note must not claim the catalogue is universally two-route. Done — the
`UNRELEASED.md` bullet now reads "**Most** model downloads now have a second route"
and names what does not.

**The audit found three MORE single-route deps than this card knew about.**
`taesdxl-decoder`, `taef1-decoder` and `taef2-decoder` (added by MPI-420 in this same
cycle) all carry `noMirror: true`. They are NOT this card's problem and must not be
folded into it: no HF repo serves those bytes in the split/strict-load form ComfyUI's
TAESD needs, so they are permanently single-route by nature, not by licence timing.
`docs/download-manager.md`'s mirror table was stale on this and now says so.

So step 5 of this card's rollback plan is now wrong in one detail: after the upload,
the mirror table goes to **31 / 66 / 0 of the 97 model deps**, and the three decoders
stay listed separately as permanent `noMirror` engineAssets. Do not "restore" a line
claiming zero single-route deps overall.


## 2026-08-09 21:35Z - Fabio: this is going ahead, and it is THIS card

Asked for the Krea 2 NSFW upload + fallback restore to be tracked; no new card was
created because this one already covers it exactly (re-upload the weight, drop
`noMirror`, restore the second route). Recorded rather than started, for one reason:

**The card's own gate says 2026-08-10 and today is 2026-08-09** (GitHub ground truth
`Sun, 09 Aug 2026 07:31:02 GMT`, local clock verified equal). Fabio's message says "today
is the 9th of August, which means we will upload" - so either he means tomorrow, or he
has confirmed coyotte's window is already open. **Step 1 of this card decides it and has
not been run:** confirm CivitAI 573152 is actually public. That check needs the VPN
(CivitAI region-blocks the UK and agent WebFetch can never reach it), and per MPI-430 the
whole point of deferring was not to redistribute a weight while it is still inside a paid
early-access window. One day early is exactly the case that rule exists for.

So: gate stays. Nothing here changes `maturity: blocked` until step 1 passes - but the
moment it does, steps 2-5 are unchanged and ready to run.

**Release-note consequence, already checked.** `UNRELEASED.md:423` reads "Four files
still have a single route". Restoring this one makes it three, so that line needs a
one-word edit when the upload lands. It does NOT gate the cut either way: the bullet was
deliberately reworded during Gate C to be true on both sides of this date, which is what
settled MPI-450's ON-PICKUP step 2.
