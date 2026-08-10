# MPI-517 — validation

Status: code complete and locally verified. **Merge is gated on the engine bump**, and one
live check remains that can only run on core v0.31.x.

## Proven (commands run, output seen — 2026-08-10)

### The bytes are the ones Fabio validated

| where | sha256 |
|---|---|
| local `G:/CubricModels/vae/...int8_convrot.safetensors` | `9bb2d96f218c76babd85e0611b85ca8fb330a90546c01a0005e8a58a59593410` |
| `Kijai/MiniMax-H3-experimental` HF LFS oid | `9bb2d96f218c76babd85e0611b85ca8fb330a90546c01a0005e8a58a59593410` |

Identical, so the dep points at exactly the file that was measured on the bench.

### The core support is really in the tag

Bench upgraded 0.30.2 -> v0.31.0. Both commits confirmed ancestors of HEAD:

```
git merge-base --is-ancestor 344b4398... HEAD   -> IN v0.31.0   (PR #15308, w4a8)
git merge-base --is-ancestor bbda8364... HEAD   -> IN v0.31.0   (PR #15334, int8_convrot VAE)
```

Live server on v0.31.0: 0 import failures across all 22 custom nodes, and
`/object_info/VAELoader` enumerates `minimax_h3_video_vae_int8_convrot.safetensors`.

### R2 object

```
rclone lsf --format sp  -> 3171670912;minimax_h3_video_vae_int8_convrot.safetensors
HTTP HEAD               -> 200, Content-Length: 3171670912
```

Upload log: 0 errors, 0 retries, "Multi-thread Copied (new)" at 100%. Byte count matches
the dep's `bytes` and the local file. A ranged GET of the first 8 bytes gives safetensors
header length 99672, identical to the local file — so R2 is serving the real object, not an
error page or a truncated part.

### The registry is coherent

```
vae-minimax-h3-video      PRESENT  vae/minimax_h3_video_vae_fp16.safetensors
vae-minimax-h3-video-int8 PRESENT  vae/minimax_h3_video_vae_int8_convrot.safetensors
MODEL 16 -> vae-minimax-h3-video-int8, vae-minimax-h3-audio
MODEL 17 -> vae-minimax-h3-video-int8, vae-minimax-h3-audio
models still on fp16 dep: 0
```

Zero models reference the fp16 dep while its entry stays in `DEPS` — which IS the orphan
condition `_orphanedDepIds` tests for, so the 4.85GB is reclaimed on the next uninstall
sweep rather than stranded.

Every `unet_name`/`clip_name`/`vae_name` in both runtime graphs resolves to a real dep
filename ("NOT BACKED BY A DEP: none" for both).

### Tests

`node --test` over `orphan-sweep`, `resolve-model-deps`, `shared-dep-uninstall-direction`,
`extra-model-folders`: **11 pass, 0 fail.**

## NOT yet proven — do not close on this

1. **A real H3 generation through the app on core v0.31.x.** Everything above is static
   wiring plus a bench-side node probe; no generation has run through Vision's own
   injection path with the new dep. This is the one check that needs the engine bump to
   have landed.
2. **A clean install from R2 end to end** — download, sha256 verify, ComfyUI loads it.
   The download path is unexercised for this object; only HEAD and a ranged GET have run.

## Merge gate

The int8_convrot VAE does not load on core v0.30.x. `dev_configs/node_lock.json` still pins
`v0.30.0`. **If this merges before the engine bump, H3 breaks for every user.** The gate is
recorded in three places so it cannot be missed: this card's brief, the dep entry in
`assetDeps.js`, and `docs/models/h3/README.md`.

Failure mode if R2 ever serves bad bytes is safe by construction: `_verifySha256` rejects
the download and the `mirrorUrl` (Kijai HF) is the fallback.

## Not carried by this card

- `docs/releases/UNRELEASED.md` — claimed by MPI-450. The release-notes line for the
  smaller H3 download goes through that card or at close-out.
- The w4a8 DiTs for a low H3 tier — same repo, same licence position, unblocked by the same
  engine bump. Deferred by Fabio to a separate card pending quality evaluation.
