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

- [x] 2.1 **Stay on FREE.** Reversed the same day: an earlier pass said PRO off a
      228.7 GB estimate, but the authenticated sweep put the upload at 37.8 GB and
      the account footprint at 124.2 GB — and the account already carries 86.4 GB on
      free. See § Phase 1 FINAL. Revisit only if HF actually pushes back.
- [x] 2.2 ADD the R2 layout (`vision/models/<comfy-type>/<file>`) to the repo.
      **Do NOT relocate the 9 v1.0.1 files at root** — shipped v1.0.1 hardcodes those
      flat resolve URLs, so moving them breaks it in the wild exactly as deleting
      would. See § Phase 1 FINAL, "PHASE 2 TRAP". The new files go in the new layout;
      the 9 stay put and are already externally located anyway.
- [x] 2.3 Upload the re-host set. HF structural limits are all clear at our scale
      (file <200 GB, <100k files/repo, <10k per folder; our max file is 41 GB).
      **DONE 2026-08-03 12:39** — 31 of 32 up, oids verified, 0 failures.
      `qwen-lora-headswap` HOLD (source unidentified). See § Phase 2 RUN below.

## Phase 3 — wire the mirror

- [x] 3.1 Path rewrite in `_mirrorUrlsFor` for the HF-shaped origin
      (`/<repo>/resolve/main/<path>` vs our `/vision/models/<type>/<file>`).
- [x] 3.2 Optional per-dep mirror URL for the externally-mirrored set — their
      upstream paths and FILENAMES differ from ours, so an origin swap alone
      cannot reach them. Only the subset needs it; the rest fall through.
- [x] 3.3 Populate `_MODEL_MIRRORS` and **update the test that pins it to `[]`** —
      `tests/transport-error-message.test.cjs` asserts the shipped default is
      empty on purpose, so it MUST fail when the mirror lands.

## Phase 4 — prove it

- [x] 4.1 `CUBRIC_MODEL_MIRRORS` needs no rebuild: point a dep at a dead origin,
      confirm a live download completes from HF and passes the SHA256 verify.
- [x] 4.2 Confirm the Pod path is untouched — the wrapper's aria2c downloader
      never consults `_mirrorUrlsFor`, so R2 stays primary there.
- [x] 4.3 State plainly in the close-out that this is **unproven against micha's
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

---

# Phase 1 FINAL (2026-08-03, authenticated sweep)

**Supersedes every earlier number on this card.** The declared-origin sweep was the wrong
instrument: `origin` records where a weight CAME FROM, not where a copy SITS. Widening to
"every repo these authors publish", authenticated with the HF token, moved the re-host
total 142.3 -> 55.4 -> **37.8 GB**. Same method throughout (match by LFS oid = sha256);
only the candidate set grew.

| Class | Deps | GB |
| --- | --- | --- |
| Hosted by others, sha256 VERIFIED identical | 56 | 276.5 |
| Already on `Mad-Pony-Interactive/cubric-studio` (the 9 v1.0.1 files) | 9 | 86.4 |
| **NEW upload** | **32** | **37.8** |

968 repos treed across 20 authors, 1 error. Script: scratchpad `sweep5.mjs`.

## Tier — PRO NOT needed. 2.1 REVERSED.

Account footprint after upload = 86.4 (already stored) + 37.8 = **124.2 GB**. The account
sits at 86.4 GB on free today with no issue, so +38 GB is not a "best-effort" cliff.
`whoami` confirms `isPro: False` and that is fine. Revisit only if HF pushes back.

## The re-host 32 — 83% is four files

`krea2-raw-transformer-nsfw` 13.15 (our NSFW bake), `chroma1-hd-hyper` 9.20 (our int8
convrot), `qwen3vl-abliterated-clip` 5.24 (our repack), `ltx23-lora-merged` 3.87 (our
merge) = 31.5 GB. Remainder: 20 CivitAI/CivArchive LoRAs 4.4 GB, `qwen-lora-headswap` 1.20,
`ltx23-lora-transition` 0.36, `krea2-style-midjourney` 0.21, `klein-lora-refcontrol-depth`
0.09, `klein-lora-outpaint` 0.07, `4x-AnimeSharp` 0.06, `rife47` 0.02,
`krea2-lora-filterbypass` ~0.

## Finds that overturned the earlier list

`chroma1-hd-flash` 17.0 -> `lodestones/Chroma1-Flash` (the author is **`lodestones`**, not
`lodestone-rock` — that misname is why it 401'd every earlier pass);
`boogu-edit-transformer-high` 20.59 + `-balanced` 11.37 -> `Comfy-Org/Boogu-Image`;
`qwen-edit-transformer` 19.0 -> `Comfy-Org/Qwen-Image-Edit_ComfyUI`;
`boogu-qwen3vl-8b-clip` 10.59 -> `Comfy-Org/Ideogram-4`; `ltx23-gemma-clip` 9.45 ->
`Comfy-Org/ltx-2`; `t5xxl-fp16` 9.20 -> `lodestones/stable-diffusion-3-medium`;
`qwen3-4b-clip` 8.04 -> `Comfy-Org/z_image_turbo`; `klein-4b-transformer` 4.07 ->
`wraps/FLUX.2-klein-4B-INT8-ConvRot-ComfyUI`; `sam3-multiplex` 1.75 -> `Comfy-Org/sam3.1`;
`ltx23-lora-talkvid` 1.10 -> `Comfy-Org/ltx-2.3`; `sam-vit-b` 0.36 ->
`ybelkada/segment-anything`; `vae-flux2` 0.33 -> `Comfy-Org/flux2-dev`; `vae-flux-ae` 0.33
-> `lodestones/Chroma`; `wan22-5b-turbo-lora` 0.31 -> `Kijai/WanVideo_comfy`; `vae-sd3`
0.16 -> `silveroxides/SD3-PonyCLIP-forfun`.

## HF access — already documented, do not re-derive

Token: `C:\Users\Fabio\.secrets\hf.txt`, account `Mad-Pony-Interactive`. Full contract in
`c:/AI/Mpi/MadPony-Identity/capabilities/huggingface/README.md` (token-type trap, R2->HF
per-file streaming recipe). CivitAI key is at `.secrets\civit.txt` for the licence pass,
though the block is network-level so it still needs the VPN.

## PHASE 2 TRAP — do NOT relocate the 9 v1.0.1 files

The capability README is explicit: those 9 sit at repo **root** (flat filenames) because
shipped v1.0.1 has those HF resolve URLs hardcoded in its bundled `dependencies.js`.
**Moving** them into `vision/models/<type>/` breaks v1.0.1 in the wild exactly as deleting
would. Phase 2.2 must ADD the new layout alongside and leave the 9 at root. Amends the
earlier "v1 files are droppable" note, which was taken from chat before this doc was read.

---

# Phase 2 RUN (2026-08-03)

`push.py` on this card. Detached process, resumable — a re-run skips anything whose
HF LFS oid already matches the dep sha256, so it can be killed and restarted freely.

**Bandwidth is capped by request** — Fabio needs ~1 MB/s of the link left for the
machine to work while this runs all day. HF upload is paced to **3 MiB/s**, the R2
pull to **6 MiB/s** (`UP_MB` / `DOWN_MB` env override both). Two traps that would
have silently uploaded at full speed: **`hf_xet` is installed**, and the Xet client
uploads through its own Rust transport that never touches our file object — set
`HF_HUB_DISABLE_XET=1` to force the classic LFS path. Same for `hf_transfer`.
The pacing wrapper is a `io.BufferedIOBase` subclass (huggingface_hub type-checks
`path_or_fileobj`) and is **off during the local hash pass**, on for the upload.

**No R2 -> HF server-side copy exists.** HF has no fetch-from-URL ingest; every
upload is a client PUT, so the bytes transit this machine either way.

**The download half is mostly skippable.** `G:/CubricModels` is the app's shared
model store (it is the `cubric_models` root in the bench `extra_model_paths.yaml`),
so most of the set is already on disk — including the two biggest, `krea2-raw-
transformer-nsfw` 13.15 GB and `chroma1-hd-hyper` 9.20 GB, i.e. 22 of 37.8 GB.
push.py prefers the local copy and only rclones from R2 when it is absent or its
sha256 does not match.

**The sha256 gate is free.** `CommitOperationAdd` hashes the file to build the LFS
pointer, so `op.upload_info.sha256` IS the check — compare it to the dep's recorded
sha256 before committing, then read the oid back off the hub as independent proof.

- `rehost.json` — the 32-dep upload set (id, url, sha256, size, filename).
- `located.json` — the 65 deps found byte-identical elsewhere, each with its
  `{repo, path}`. **This is phase 3.2's input** — do not regenerate it, the sweep
  is ~1000 HF API calls against a 1k/5-min limit. Script: scratchpad `sweep6.mjs`.

HF path == R2 path (`vision/models/<comfy-type>/<file>`), so phase 3's mirror is a
host swap for the re-hosted set. The 9 v1.0.1 files at repo root are untouched.

## Phase 2 RESULT — 2026-08-03 08:57 -> 12:39 (3h42m)

`uploaded=28 skipped=4 failed=0` (the 4 = 3 from the smoke test already on the hub
+ the HOLD). Independent re-check against the hub tree: **31/32 present, 31/31 oids
match the recorded sha256, 0 mismatched.** The 9 v1.0.1 root files are all still at
root, untouched. HTTP proof on the largest: `resolve/main/vision/models/
diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors` -> 302 -> 200,
`X-Linked-Size: 13148974712` = the R2 object byte for byte, `X-Linked-ETag` = the
dep sha256.

Only 2 of 31 needed an R2 pull (`ltx23-lora-transition`, `ltx23-lora-merged`) —
everything else was already on `G:/CubricModels`. The cap held exactly: 13.15 GB in
4592s = 2.86 MiB/s against a 3 MiB/s target.

**Still open:** `qwen-lora-headswap` (1.20 GB). No `origin` recorded, sha256 404s on
CivitAI by-hash, absent from all 968 repos swept. Source it before re-hosting — it is
the one dep with no mirror and no provenance.

---

# Phases 3 + 4 DONE (2026-08-03)

Suite 318/318. Full write-up now lives in `docs/download-manager.md` § "The second
origin" — read the DOC, not this card. What is worth keeping here is what the work
CHANGED about the plan:

**3.1 grew a path prefix.** The plan said "path rewrite for the HF-shaped origin"; the
shipped shape is that a mirror BASE may carry a path prefix and the object path is
appended. One base covers all 31 re-hosted deps with zero per-dep data.

**3.2 was not optional.** All 65 third-party copies needed an explicit `mirrorUrl`
(generated by scratchpad `gen-mirrors.mjs` from `located.json`, 65 pure insertions).

**3.3 keyed the resume on sha256, not the URL.** Extracted as `_shouldResumePartial` so
it is unit-testable. This is the MPI-317 guard re-armed: no URL comparison can survive a
mirror that changes the prefix AND the filename.

**Three defects the work surfaced that the plan did not predict:**

1. `_mirrorUrlsFor` was being called with the MUTATED `depJob.url`. With a prefixed
   mirror that double-prefixes the path on the second hop, and it broke the multi-mirror
   walk outright — caught by the existing MPI-427 test, which is why that test exists.
   Now always derived from `_originUrl`.
2. **A failing mirror COST the user his diagnosis.** R2 blocked (transport error, remedy
   = tunnel) then mirror 404 (not a transport error) overwrote the message with
   "status code 404" and cleared `networkBlocked`. The failover made the error WORSE than
   no failover. Fixed by remembering `_blockedMsg`.
3. The engine archive and custom-node zips also go through `FileDownloader`, from
   github.com. The generic rewrite would have handed them an HF URL that 404s. Gated on
   the object PATH (`/vision/models/`), not the host — the host is what a failover
   changes, so a host-keyed gate breaks the second hop.

**Proof (not "should work"):**
- All 96 mirrors HEAD-checked live; `X-Linked-ETag` (the LFS oid) == the recorded sha256
  on every one. 0 wrong, 0 unreachable. Script: scratchpad `verify-mirrors.mjs`.
- End-to-end: a dep pointed at a dead origin completed off huggingface.co and passed the
  SHA256 verify, with the SHIPPED default and no env override. Script: scratchpad
  `prove-failover.cjs`.
- Pod untouched: `_mirrorUrlsFor` / `mirrorUrl` appear nowhere outside
  `downloadManager.js` and the dep data; the wrapper has no mirror path at all.

**4.3, stated plainly:** this defeats FQDN-, domain- and provider-keyed blocking. It is
**NOT proven against the original reporter's transfer-stage DPI** — he is unreachable.

**CLOSED same day.** Fabio named the repo: `Alissonerdx/BFS-Best-Face-Swap`, licence MIT.
Confirmed BY HASH — that blob's oid is `0a137e61…07cd10`, identical to the dep's recorded
sha256, same filename. So no re-host was needed at all; it took a `mirrorUrl` and dropped
`noMirror`. **All 97 R2 deps now have a second route, 97/97 HEAD-verified byte-identical.**

The sweep missed it for one reason: the dep had **no `origin` recorded**, so its author was
never a sweep candidate. That is now written up as a rule where deps get authored —
`docs/playbooks/add-model/02-dependencies-r2.md` § `origin` is LOAD-BEARING (its template
used to call the field "informational"), with pointers from `add-app/01-descriptor-and-ops.md`
and the `head-swap.md` app doc, whose Dependency section was also stale (it still said the
LoRA was local-only awaiting an R2 upload, and that the fp16 A/B was live — both settled).
