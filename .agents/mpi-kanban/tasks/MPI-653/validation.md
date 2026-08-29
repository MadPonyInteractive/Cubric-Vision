# MPI-653 — validation

## 1. The upload landed, and the bytes are ours

| check | result |
|---|---|
| `rclone copyto` exit | `0`, `Copied (new)` |
| rclone post-transfer md5 (src vs dst) | **passed** — this is the check that failed on the first attempt |
| `rclone lsl` | `26363476151` bytes |
| public `HEAD https://models.cubric.studio/.../qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors` | `200 OK`, `Content-Length: 26363476151` |
| orphaned multipart sessions | `0` |
| local source sha256 | `d84547412144b7c50a6ec77437a889b869d3ace88da77ef1775d3d2a4901c192` = the pinned value |

`bytes` / `sha256` / `size` were not touched by this card; the re-host is byte-identical.

## 2. It is actually fast now — the point of the card

Cold ranged reads at offsets the CDN had never served, compared against the same
method used to measure the HF baseline:

| origin | offset | throughput |
|---|---|---|
| HF `/resolve/main` (Xet bridge) | 20 GB | **0.66 MB/s** |
| R2 | 12 GB | **35.7 MB/s** |
| R2 | 20 GB | **37.4 MB/s** |

~55x. Both R2 ranges were byte-compared against the local sha256-verified copy:
`bytes_match_local=True` at both offsets, so R2 serves *our* bytes, not merely the
right byte count.

## 3. Both origins answer

`npm run release:deps`: `h3-qwen3vl-32b-clip` appears in neither the UNREACHABLE
list nor the "no second origin" list. Direct HEADs: R2 `200` and HF `200`, both
`Content-Length: 26363476151`. The 10 unreachable mirrors in that run are
pre-existing Klein/LTX-foley entries unrelated to this card.

## 4. Attribution is discharged by data

`MpiAbout._credits()` reads `Object.values(DEPS)` directly, so `credit` needs no
`_createDepJob` whitelist entry. Evaluated live: `ethanfel` is present with work
`Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot` among 14 credited authors.

## 5. Licence gate, checked BEFORE the upload

Uploading is the act the licence governs, so this ran first. HF model API,
2026-08-29: all three repos in the chain `apache-2.0`, `gated: False`,
`private: False` — ethanfel/…-INT8-ConvRot ← llmfan46/…-heretic ←
Qwen/Qwen3-VL-32B-Instruct. Neither the ethanfel repo nor Qwen's ships a
`LICENSE` or `NOTICE`, so Apache-2.0 §4(c) does not bite and attribution is what
remains.

## 6. Step 5 — a real install, not a synthetic probe

Fabio placed the encoder in the models root and pressed Install. The app did
**not** re-download the encoder (its last attempt was 07:27Z; it went straight to
the transformer), and `minimax-h3-ref2va-transformer` completed at exactly
`20970379616` bytes with zero `.cubricdl` markers left. The encoder copy in
`G:/CubricModels/text_encoders/` then verified **SHA_OK** against the pinned hash
on an idle disk.

So the dep was exercised end-to-end by a genuine install.

## Tests

`node --test` on `download-retry`, `licence-gate`, `resolve-model-deps`,
`download-completion`, `install-path-depth`: **14 pass, 0 fail**.

## Not done

The literal "clean models root" variant of step 5 was not run — the install used
Fabio's existing root. Everything step 5 existed to prove was proven above.
