# MPI-429 — a second download origin for blocked users

Split off MPI-427 on 2026-08-02, when 1.3.1 shipped. MPI-427 fixed the app side: a blocked
model host is now a readable error, it no longer destroys a working set of custom nodes,
and it can no longer lock the user out of the app. What it does NOT do is get the bytes
past the block. That is this card.

## What already ships (1.3.1) — code only, never executed

- `_MODEL_MIRRORS` in `routes/downloadManager.js` — **empty**, so the failover it guards
  cannot fire for anyone. Failing over to a host that does not exist would turn one clean
  error into two slow ones.
- `_mirrorUrlsFor()` retries the identical object path against alternate origins, on a
  transport error only.
- `_isSameObjectUrl()` makes the MPI-317 partial-file marker PATH-equal instead of
  string-equal, so a host swap resumes the partial instead of scrapping exactly the bytes
  failover exists to preserve.
- `CUBRIC_MODEL_MIRRORS` (comma-separated origins) overrides the constant for testing.
- Object layout must match across origins: `<origin>/vision/models/<comfy-type>/<file>`.

## The work

1. **Approval-gated Cloudflare change — only Fabio can make it.** Add a custom domain to
   the `cubric-models` bucket
   (`c:/AI/Mpi/MadPony-Identity/capabilities/cloudflare-r2/README.md` § Approval Gates).
   Free: one bucket, no duplicate storage, R2 egress is free, custom domains carry no
   per-domain charge.
2. Add the origin to `_MODEL_MIRRORS` and ship it.
3. **Prove it against the actual failure mode** — see below.

## The open question this card exists to answer

**A same-provider mirror is UNPROVEN against the reporting user's block.** He confirmed by
test that a plain DNS switch was not enough, and only a tunnel worked. His stream died at
~20% rather than at handshake — deep-packet interference on the sustained transfer, not
hostname blocking. A second `cubric.studio` hostname defeats the hostname-keyed class for
certain; whether it survives DPI is unknown until it is tested against a real blocked
connection.

If it does not survive, the fallback is an **off-Cloudflare** origin:

- **GitHub Releases** — proven to reach this exact user (his github.com downloads all
  succeeded while the model host failed). 2 GB per-asset cap forces splitting the big
  transformer files.
- Hugging Face.
- Backblaze B2.

## Why this is not an app bug

Infrastructure, not code. The 1.3.1 fix deliberately unblocks the user WITHOUT any
Cloudflare change — that was the whole point of MPI-427 round 2. This card is the
durable fix for the class, not the rescue.

---

## Decision (2026-08-03) — Hugging Face, NOT a second Cloudflare hostname

**The plan is in `checklist.md`.** This section records why it is what it is.

A second Cloudflare custom domain was chosen first, then dropped the same day. It only
dodges a filter keyed on the exact FQDN — `models2.cubric.studio` is still
`cubric.studio`, and MPI-427 names the likely trigger as *"`cubric.studio` is a young
domain (many filters block uncategorised domains)"*. Category and reputation filters block
the **registrable domain**, so the most plausible mechanism is the one a second subdomain
does not touch. `madponyinteractive.com` was considered and dropped for the same reason —
also young, also uncategorised.

Hugging Face beats all three keying levels: different company, different CDN, different
IPs, and a domain nobody's filter blocks.

The reporting user is **not reachable**, so the DPI question above cannot be answered and
the mirror ships without that proof. State it plainly wherever this card is summarised.
Do not let a later reader read "shipped" as "proved".

### R2 stays primary — the mirror is local-only by construction

MPI-140's validation records that HF/Xet throttling was what the R2 migration (MPI-129)
fixed, so pointing primary URLs back at HF looked like a regression. It is not, because
the throttle is **multi-connection**: `aria2c` lives only in the Pod wrapper
(`wrapper.py` — *"aria2c gives multi-connection downloads (~10-40x the single-stream httpx
path)"*), and the LOCAL path uses `DownloaderHelper`, a single stream. MPI-140's lying
progress bar was measured on a remote CPU Pod, which fits.

`_mirrorUrlsFor` lives in `downloadManager.js`'s `FileDownloader`. The Pod downloads
through the wrapper's own aria2c path and never consults it. So the HF mirror **cannot**
regress Pod speed and needs no engine-split sweep — the one time a dual-engine change
does not need both twins touched.

### The SHA256 gate — why "an upstream repo exists" is not enough

Every dep carries a `sha256` verified after download. A mirror serving different bytes
fails the verify and the file is deleted, so an upstream copy qualifies ONLY if it is
byte-identical to our R2 object. Anything we repacked, re-quantised or renamed will not
be. Checkable without downloading the blob: HF's `/raw/` endpoint returns the LFS pointer,
which carries `oid sha256:` and `size`.

**GitHub Releases is ruled out**, not deferred. Measured 2026-08-03: **36 of the 96
R2-hosted deps exceed its 2 GB per-asset cap** — `ltx-2.3-22b ... bf16` 41 GB, `fp8_scaled`
25.2, `mxfp8` 24.1, `boogu_image_edit_bf16` 20.6, `qwen_image_edit_2511_int8` 19.0,
`Chroma1-HD-Flash` 17.0, both Wan 2.2 pairs 13.3-13.6 each. Mirroring the catalogue there
means a chunk-and-reassemble subsystem in the downloader, not a second origin.

**Hugging Face is the fallback if the Cloudflare mirror fails in the wild.** No size cap,
different provider. It needs a small code change first: `_mirrorUrlsFor` swaps the origin
but **preserves the pathname**, and HF serves `/<repo>/resolve/main/<path>` — already noted
as a limitation at `js/data/modelConstants/assetDeps.js` (the ControlNet-Union dep).

## Done on this card — the failover retry now actually runs (94b13361)

`_MODEL_MIRRORS` being empty meant the retry at `downloadManager.js` had **never executed**;
the 1.3.1 tests covered only the URL math. Driving the `error` handler with a synthetic
`ECONNREFUSED` found a real defect: the handler read `this.depJob.url`, which the failover
**mutates**, so after exhausting every mirror the user-facing error named the last mirror
tried instead of `models.cubric.studio`. A hostname the user has never seen is exactly the
confusion MPI-427 exists to prevent. Fixed by capturing the url at construction
(`this._originUrl`). Test added to `tests/transport-error-message.test.cjs`: every mirror
walked once, no origin revisited, exhaustion fails rather than loops, `networkBlocked`
survives. Full suite 318/318.

## What is left

**See `checklist.md`** — four phases, phase 1 (classify all 97 deps by SHA256 against
their upstream) blocks the rest and is the only one not needing Fabio.

Measured inputs already in hand (2026-08-03): 97 R2-hosted deps, **400.8 GB**; 84 declare
an `origin`, 13 do not. HF free public storage is **"best-effort"** with an explicit
abuse/usefulness clause, not a plannable quota; PRO includes up to 10 TB public. Every HF
structural limit is clear at our scale (file <200 GB vs our 41 GB max; <100k files/repo vs
our 97).
