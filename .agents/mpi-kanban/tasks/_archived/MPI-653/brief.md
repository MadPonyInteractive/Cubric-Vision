# MPI-653 — Serve the H3 Qwen3-VL encoder from R2, ethanfel HF as the fallback

## The dep

**`h3-qwen3vl-32b-clip`** — `js/data/modelConstants/assetDeps.js`, currently HF-primary
with no mirror.

- File: `qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors`
- Repo: `ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot`
- **INT8 convrot** — the 26,363,476,151-byte (24.55 GB) file, not the bf16 sibling and not
  the `generation_tail` files in the same repo. Repo carries eight safetensors; only this
  one is ours.
- sha256 `d84547412144b7c50a6ec77437a889b869d3ace88da77ef1775d3d2a4901c192` — unchanged by
  this card, the re-host is byte-identical.

Shared by **both** H3 cards (`minimax-h3` fl2va and `minimax-h3-ref2va`), so the fix lands
for both.

## Why — measured 2026-08-29

`huggingface.co/…/resolve/main` 302s to `us.aws.cdn.hf.co/xet-bridge-us/…` behind
CloudFront. Xet CAS storage: on a cache miss the bridge reconstructs the file from
content-defined chunks before it can stream. Same file, same minute, plain `curl`:

| Test | Throughput |
|---|---|
| Cold offset (15 GB in), 1 stream | **1.2 MB/s** |
| Warm offset (region the app had already pulled → CloudFront edge hit) | **32 MB/s** |
| Cold, 8 parallel ranges | **5 MB/s** aggregate |
| Cold, 16 parallel ranges | **5 MB/s** — no further gain |
| App's observed rate (partial file growth over 20 s) | **2.8 MB/s** |
| G: raw sequential write (`dd`, 1 GB) | 5.2 GB/s |

Ruled out: disk, Windows Defender, Node, `node-downloader-helper`, ISP/DNS/VPN. A
different client (curl) hits the identical floor on cold bytes, and a browser would too —
single stream is single stream.

The 5 MB/s ceiling is **per-client-per-file aggregate**, not per-connection: a background
curl running alongside the parallel tests was starved to 328 KB/s while the total across
all streams stayed ~5 MB/s. Corollary — `LOCAL_DOWNLOAD_CONCURRENCY = 3` splits one budget
three ways on HF-Xet deps, which is what
[downloadManager.js:558](../../../../routes/downloadManager.js) retired on the premise that
"all MPI weights are on R2". H3 breaks that premise.

Caveat on the numbers: the curl probes ran while the app was mid-download and warmed some
edges. Ratios are the signal; absolute figures are a floor, not a ceiling.

## Licence — clear, this is not a MiniMax work

Chain walked 2026-08-29, all three links **apache-2.0 and ungated** (HF model API
`cardData.license`):

| Repo | Licence |
|---|---|
| `ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot` | apache-2.0 |
| ← `llmfan46/Qwen3-VL-32B-Instruct-ultra-uncensored-heretic` | apache-2.0 |
| ← `Qwen/Qwen3-VL-32B-Instruct` | apache-2.0 |

The MiniMax H3 CLA does not reach it. Read against the bundled text
(`licences/minimax-h3/LICENSE.txt`):

- **§I.11 "Model Derivatives"** requires (i) a modification of MiniMax H3, (ii) a work
  based on MiniMax H3, or (iii) a model made by transferring H3's weights, parameters,
  operational patterns or Outputs. The encoder is none of the three: it is Alibaba's
  Qwen3-VL-32B-Instruct, trimmed to embedding + language layers 0–49 and int8-quantised.
  No MiniMax weights, no MiniMax outputs, no H3-like behaviour — it is an encoder, not a
  video model.
- **§I.10 "Materials"** = MiniMax H3 + Documentation *as made available by MiniMax*. The
  encoder never was; MiniMax's repo ships the DiT.

H3-*shaped* is not H3-*derived*. The no-R2 position recorded on
`minimax-h3-fl2va-transformer` (`js/data/modelConstants/modelDeps.js`) is about §III
redistribution of MiniMax's own weights and stands untouched for the transformers.

**§III.1 is unaffected.** The licence gate (`licences.js`, keyed `minimax-h3`) fires per
install, not per dep, so it already covers every user regardless of where this file is
served from.

### Precedent already in the tree, both directions

- `minimax-h3-turbo-lora` (`loraDeps.js`) is **already R2-primary** — *"Apache-2.0
  upstream, so no licences.js record"*. A LoRA trained for H3 is a closer §I.11(ii) call
  than a Qwen encoder.
- `qwen3vl-abliterated-clip` (`assetDeps.js`) is **already R2-primary** — abliterated
  Qwen3-VL-4B. So hosting an uncensored Qwen derivative is not a new posture.

### Apache-2.0 obligations taken on

Light. Neither the ethanfel repo nor `Qwen/Qwen3-VL-32B-Instruct` ships a `LICENSE` or
`NOTICE` file (checked both repos' file lists), so §4(c) does not bite. What remains is
attribution: put `(Apache-2.0)` in `origin:` and add a `credit` block, matching how the
taehv and klein deps do it. **No `licences/` folder and no consent gate** — this is not a
gated model.

## The change

Invert to the pattern `vae-minimax-h3-video-int8` already uses (MPI-517): R2 primary,
publisher as mirror. Explicitly **not** a re-host into `Mad-Pony-Interactive/cubric-studio`
— the fallback points straight at ethanfel.

```js
url:       'https://models.cubric.studio/vision/models/text_encoders/qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors',
mirrorUrl: 'https://huggingface.co/ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot/resolve/main/qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors',
```

An explicit `mirrorUrl` is what we want here: `_mirrorUrlsFor` treats it as the **only**
alternate and suppresses the generic `/vision/models/` → our-HF rewrite, so no second
re-host is implied.

## Steps

1. Upload the file to R2 at `vision/models/text_encoders/<filename>` — procedure in
   `docs/playbooks/add-model/02-dependencies-r2.md`. **VPN off**: it throttles R2 ~15x
   (MPI-354, noted at `assetDeps.js:424`). 24.55 GB.
2. Edit the `h3-qwen3vl-32b-clip` entry: `url` → R2, add `mirrorUrl` → ethanfel, append
   `(Apache-2.0)` to `origin`, add a `credit` block. `bytes` / `sha256` / `size` unchanged.
3. Amend the section header comment above the entry (`assetDeps.js`, "MiniMax H3 support
   weights"). It currently says these are publisher-hosted for the licence reason and names
   **one** exception. There are now two, and this one is a *different kind* — MPI-517 was a
   supply-risk decision that outranked the licence position; this one is out of the CLA's
   scope entirely. Say so, or the next reader will read it as the position softening.
4. Run `scripts/check-dep-urls.mjs` — both origins must answer.
5. Verify: fresh install of MiniMax H3 Reference on a clean models root, confirm the
   encoder now streams at R2 speed and the sha256 verify passes.

## What this does NOT fix

An H3 Reference install pulls ~49.4 GB. This moves 24.55 GB of it. Still on the Xet bridge
at ~1.2 MB/s:

- `minimax-h3-ref2va-transformer` — 19.53 GB, genuine MiniMax work, correctly not on R2
- `minimax-h3-fl2va-transformer` — 19.53 GB, same
- `vae-minimax-h3-audio` — 577 MB, Comfy-Org, same

Roughly 4.5 h of transformer download survives this card. The only lever left for those is
**segmented (multi-range) downloads** in `routes/downloadManager.js` — measured 4x on cold
Xet content (1.2 → 5 MB/s), ceiling 5 MB/s, 8 connections is the whole prize. Costs: breaks
the MPI-296 streaming SHA256 (out-of-order chunks → full disk re-read on verify) and turns
the MPI-317 resume contract into per-segment bookkeeping. Not in this card's scope; file
separately if wanted.

Also spotted in passing, not this card's job: `js/services/downloadService.js:227` claims a
30-minute ceiling is *"longer than any single model download"*. False for a 26 GB Xet dep
(2.5–6 h) — it already fired on `minimax-h3-ref2va` at 07:57 on 2026-08-29 and released the
install queue. Should be size-derived.
