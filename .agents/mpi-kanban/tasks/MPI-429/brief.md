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
