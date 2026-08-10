# MPI-517 - Swap the H3 video VAE to the int8_convrot build, R2-primary

## What

The two MiniMax H3 ModelDefs (`minimax-h3-fl2va`, `minimax-h3-ref2va`) share one video
VAE dep. Move them off Comfy-Org's fp16 build onto Kijai's int8_convrot build.

| | fp16 (current) | int8_convrot (new) |
|---|---|---|
| bytes | 5207808496 (4.85GB) | 3171670912 (3.17GB) |
| source | Comfy-Org/MiniMax-H3 | Kijai/MiniMax-H3-experimental (repo root) |
| sha256 | 7c1f1314...ce5e522 | 9bb2d96f218c76babd85e0611b85ca8fb330a90546c01a0005e8a58a59593410 |

Fabio measured it on the local bench on 2026-08-10: "just faster and there is no quality
loss there". The local file was hashed and matches the HF object byte for byte, so the
dep points at exactly the bytes that were validated.

## THE BLOCKER - this cannot merge before the engine bump

The int8_convrot VAE needs ComfyUI core >= v0.31.0. Two PRs, both merged AFTER v0.30.0
was cut (2026-08-03):

- #15334 `Support int8_convrot VAE for MiniMax-H3` - merged 2026-08-06 (`bbda8364`)
- #15308 `Support asym w4a8_int` - merged 2026-08-07 (`344b4398`, the w4a8 DiTs, not this card)

The shipped engine is pinned at v0.30.0 in `dev_configs/node_lock.json`. Merging this dep
swap on that pin breaks H3 for every user. Fabio is bumping the engine to 0.31 before 1.4
ships, in a separate session. **This card lands after that bump, or in the same release.**

Verified on the bench after upgrading it to v0.31.0: both commits are ancestors of the
tag, and `VAELoader` enumerates the int8 file.

## Why R2-primary, and why that is a change of position

MPI-449 section 0 decided H3 weights are never re-hosted - all five H3 deps point straight
at huggingface.co, because pointing at the publisher "kills the section III redistribution
claim outright". That decision is reversed here, for this dep, by Fabio on 2026-08-10.

Two risks were weighed:

1. **Licence.** Kijai's re-quant is squarely "MiniMax H3 Works": section I.11 catches "any
   modification of MiniMax H3 or any Model Derivative thereof", section I.7 folds Model
   Derivatives and "all derivatives thereof" into the Works. There is no third-party
   carve-out, and section III forbids Kijai from relicensing it looser. So hosting it on
   R2 is a section III distribution by us, identical in kind to hosting the DiT.
   Fabio's call: accepted. Reasoning recorded verbatim - "we're nobody at the moment. By
   the time that we become somebody, h3 has been released to the public"; and R2 is our own
   unlisted bucket rather than HF, which is where licence scanning actually looks.
2. **Supply.** `Kijai/MiniMax-H3-experimental` was created 2026-08-05, is named
   "experimental", and is the ONLY source of this file - Comfy-Org publishes int8_convrot
   for both DiTs and the text encoder but ships the video VAE fp16-only (checked
   2026-08-10). A delete gives a 404; a silent re-export under the same filename fails
   closed on the sha256 check at routes/downloadManager.js `_verifySha256`. Either way
   every NEW H3 install breaks, and these deps generate no mirrors (`_mirrorUrlsFor` only
   rewrites URLs under the R2 prefix).

R2-as-primary resolves risk 2 outright, which is the actual reason it is worth doing:
once we hold the bytes, what Kijai does to the repo stops mattering. Kijai HF stays as
`mirrorUrl` fallback.

## Why a NEW dep id, not an edit in place

`_orphanedDepIds` (routes/downloadManager.js:269) walks `Object.keys(DEPS)` and resolves
each entry's `filename`. A file on disk whose filename no longer appears in ANY DEPS entry
is invisible to the sweep - permanently. Mutating `vae-minimax-h3-video` in place would
strand 4.85GB on every existing H3 user's disk forever.

That function's own comment is the precedent: "19 days later a different model family
stranded a fresh 15.91GB, so that verdict was wrong and this is the missing collector."

So: add `vae-minimax-h3-video-int8`, repoint both ModelDefs, and KEEP the fp16 entry
present but referenced by nobody. That makes it an orphan by the sweep's own definition
and the 4.85GB is reclaimed automatically on the next uninstall sweep. Same rule as
docs/playbooks/add-model section "Removing or re-tiering a model".

## Out of scope

- The w4a8 DiTs (12.5GB fl2va / 11.8GB ref2va) for a low H3 tier. Same repo, same licence
  position, and now unblocked by the same engine bump - but Fabio deferred it to card
  separately after this. It needs quality evaluation first.
- `docs/releases/UNRELEASED.md` is claimed by MPI-450; the release-notes line for this
  goes through that card or at close-out.
