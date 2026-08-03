# MPI-429 — plan

Goal: a blocked user's download succeeds from a second origin. Approach pivoted
2026-08-03 from a second Cloudflare hostname to **Hugging Face** — see `brief.md`
§ Decision. R2 stays primary on both engines; the mirror is local-only by
construction and cannot regress Pod speed.

## Phase 1 — classify all 97 R2-hosted deps (BLOCKS everything else)

The output is the number that decides HF free vs PRO, and the input to phases 2-4.
Nothing else starts until this table exists.

**The gate is SHA256, not "does an upstream repo exist".** Every dep carries a
`sha256` the downloader verifies after the bytes land; a mirror serving different
bytes fails the verify and the file is deleted. So a dep is externally mirrorable
ONLY if the upstream blob is byte-identical to our R2 object. Anything we
repacked, re-quantised or renamed is almost certainly NOT.

Cheap exact check, no blob download: HF serves the LFS pointer at
`https://huggingface.co/<repo>/raw/<rev>/<path>`, and the pointer carries
`oid sha256:<hash>` + `size`. Compare that oid to the dep's recorded `sha256`.

- [ ] 1.1 Build the dep inventory. `origin` is prose attribution in many cards,
      not a repo id — resolve each to a real `<repo>/<path>` or mark it unknown.
- [ ] 1.2 For every candidate, fetch the `/raw/` LFS pointer and compare
      `oid sha256` to our `sha256`. Record: match / mismatch / 404 / not-LFS.
- [ ] 1.3 Emit the classification table: dep id, size, verdict, upstream URL.
- [ ] 1.4 Total the **re-host remainder** in GB. That number picks the HF tier.
- [ ] 1.5 Licence pass over the re-host set ONLY — we redistribute those bytes.
      `controlnet-union-flux` is already barred and stays off R2 and off HF.

### What phase 1 starts from (measured 2026-08-03)

97 R2-hosted deps, **400.8 GB**. 84 carry an `origin` (379.2 GB); 13 carry none
(21.5 GB) and need a lookup.

Likely-external, by declared origin — **all unverified until 1.2**:

| Origin | Deps | GB |
| --- | --- | --- |
| `Kijai/LTX2.3_comfy` | 6 | 94.4 |
| `Boogu/Boogu-Image-0.1-Edit` (+ Turbo) | 3 | 42.6 |
| `Comfy-Org/Krea-2` | 12 | 30.8 |
| `lodestone-rock/Chroma` | 2 | 26.2 |
| `Comfy-Org/Qwen-Image-Edit-2511` | 1 | 19.0 |
| `Comfy-Org/PixelDiT` | 5 | 16.1 |
| `Wan-AI/Wan2.2-TI2V-5B` | 2 | 10.6 |
| `Comfy-Org/Qwen-Image_ComfyUI` | 2 | 9.0 |
| smaller (huihui-ai, wraps, lightx2v, Lightricks, Comfy-Org VAEs/BiRefNet) | ~12 | ~13 |

Near-certain re-host, ~127 GB before the 1.2 sweep trims or grows it:

- `Mad-Pony-Interactive/cubric-studio` — 4 deps, 14.8 GB. Ours.
- 4x `smoothMixWan22...` — 53.8 GB. Community merges.
- 5 SDXL/Pony/Illustrious checkpoints — ~32.7 GB. Community merges.
- ~20 CivitAI / CivArchive LoRAs — ~4 GB. **CivitAI is region-blocked from this
  machine and from agent fetches** (CLAUDE.md § VPN), so these cannot be mirrored
  upstream at all and cannot be verified without the VPN.
- The 13 no-origin deps — 21.5 GB. Several are well-known (t5xxl, umt5, SAM,
  yolov8, RIFE, NMKD/AnimeSharp upscalers) and may resolve external in 1.2.

## Phase 2 — HF account + repo (needs Fabio)

- [ ] 2.1 Pick the tier from 1.4. Free public storage is **"best-effort"** with an
      explicit usefulness/abuse clause — not a quota to plan against. PRO includes
      up to 10 TB public.
- [ ] 2.2 Restructure the existing v1 repo to mirror the R2 layout
      (`vision/models/<comfy-type>/<file>`) so the mirror stays a path rewrite,
      not a per-dep map. v1 files are droppable — user confirmed.
- [ ] 2.3 Upload the re-host set. HF structural limits are all clear at our scale
      (file <200 GB, <100k files/repo, <10k per folder; our max file is 41 GB).

## Phase 3 — wire the mirror

- [ ] 3.1 Path rewrite in `_mirrorUrlsFor` for the HF-shaped origin
      (`/<repo>/resolve/main/<path>` vs our `/vision/models/<type>/<file>`).
- [ ] 3.2 Optional per-dep mirror URL for the externally-mirrored set — their
      upstream paths and FILENAMES differ from ours, so an origin swap alone
      cannot reach them. Only the subset needs it; the rest fall through.
- [ ] 3.3 Populate `_MODEL_MIRRORS` and **update the test that pins it to `[]`** —
      `tests/transport-error-message.test.cjs` asserts the shipped default is
      empty on purpose, so it MUST fail when the mirror lands.

## Phase 4 — prove it

- [ ] 4.1 `CUBRIC_MODEL_MIRRORS` needs no rebuild: point a dep at a dead origin,
      confirm a live download completes from HF and passes the SHA256 verify.
- [ ] 4.2 Confirm the Pod path is untouched — the wrapper's aria2c downloader
      never consults `_mirrorUrlsFor`, so R2 stays primary there.
- [ ] 4.3 State plainly in the close-out that this is **unproven against micha's
      transfer-stage DPI** — he is unreachable. It defeats host/provider-keyed
      blocking; it is not a proven fix for him.

## Done already (2026-08-03, `94b13361`)

The failover retry had never executed for anyone. Driving it with a synthetic
`ECONNREFUSED` found a real defect — the handler read the MUTATED `depJob.url`, so
after exhausting mirrors the user-facing error named the last mirror tried instead
of `models.cubric.studio`. Fixed via `this._originUrl`; test added covering the
retry end to end. Suite 318/318.

---

# Phase 1 RESULTS (2026-08-03)

Method: HF's tree API (`/api/models/<repo>/tree/main?recursive=true`) returns every file's
`lfs.oid`, which IS the sha256. So the sweep matched **by hash, not by path** — a
byte-identical upstream is found regardless of what it is named there. 29 repos probed.
Script: scratchpad `classify.mjs`.

## Verdict — 97 R2 deps, 400.8 GB

| Class | Deps | GB |
| --- | --- | --- |
| Third-party upstream, sha256 VERIFIED identical | 41 | 172.1 |
| Already on OUR HF repo (`Mad-Pony-Interactive/cubric-studio`) | 9 | 86.4 |
| Must upload — no upstream match | 47 | 142.3 |

**HF footprint = 228.7 GB** (86.4 already there + 142.3 new). Not 400.8 — the sweep
removed 172 GB of third-party weights we never needed to host.

The 9 already-on-HF files are the four Wan 2.2 t2v/i2v pairs and the five SDXL/Pony/
Illustrious checkpoints. The v1 restructure is a MOVE for those, not a re-upload.

## Biggest verified-external wins

`ltx23-transformer-bf16` 41 GB, `-fp8` 25.2, `-mxfp8` 24.1 (all `Kijai/LTX2.3_comfy`);
`wan22-5b-model` 9.31 and `t5xxl-fp16` 9.20 and `qwen-edit-qwen25vl-7b-clip` 8.74
(Comfy-Org); all 5 PixelDiT models + gemma 16.1; 9 Krea-2 style LoRAs; the 3 adetailer
yolov8 files; `4x-NMKD-Siax`; both Qwen-Edit Lightning LoRAs.

## Must re-host — the pattern is OUR bakes

`boogu-edit-transformer-high` 20.6, `qwen-edit-transformer` 19.0, `chroma1-hd-flash` 17.0,
`krea2-raw-transformer-nsfw` 13.2, `boogu-edit-transformer-balanced` 11.4,
`boogu-qwen3vl-8b-clip` 10.6, `ltx23-gemma-clip` 9.45, `chroma1-hd-hyper` 9.2,
`qwen3-4b-clip` 8.04, `qwen3vl-abliterated-clip` 5.24, `klein-4b-transformer` 4.07,
`ltx23-lora-merged` 3.87, then ~20 CivitAI/CivArchive LoRAs and the LTX LoRAs.

Note `krea2-raw-transformer` MATCHES Comfy-Org/Krea-2 while `-nsfw` does not — the split
is exactly repack-vs-verbatim, as predicted.

- [x] 1.1 inventory built
- [x] 1.2 sha256 compared against upstream LFS oids — **except 4 gated repos, see below**
- [x] 1.3 classification table (above)
- [x] 1.4 re-host total = **142.3 GB**; full HF footprint **228.7 GB**
- [ ] 1.5 licence pass over the 47-dep re-host set — NOT started

## 1.2 remainder — 4 repos returned 401 (gated), ~49 GB unresolved

`Comfy-Org/Qwen-Image-Edit-2511`, `lodestone-rock/Chroma`, `Comfy-Org/FLUX.2-klein`,
`Comfy-Org/Lumina_Image_2.0`. A 401 is gated-repo / licence-acceptance, NOT proof the blob
is absent — so `qwen-edit-transformer` (19.0), `chroma1-hd-flash` (17.0), `chroma1-hd-hyper`
(9.2) and `klein-4b-transformer` (4.07) are currently counted as re-host but may be
external. Re-run the sweep with an `HF_TOKEN` on an account that has accepted those
licences; if they match, the upload drops from 142.3 GB to ~93 GB.

## Tier implication

228.7 GB sits well past HF free public storage ("best-effort", explicit abuse clause).
PRO (up to 10 TB public) covers it with room. Even the optimistic ~93 GB upload still
leaves 180 GB total on the account, so PRO is the answer either way unless the gated-repo
recheck plus a prune changes the picture a lot.
