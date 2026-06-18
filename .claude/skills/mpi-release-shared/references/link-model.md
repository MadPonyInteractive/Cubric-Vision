# Cloudflare link model — naming, lifecycle, garbage collection

The single source of truth for **which** Cloudflare R2 link a release uses. The
upload mechanics are in `r2-upload.md`; this file decides the *path*.

## Path shape

```
vision/v<major>.<minor>-<randomhex>/<files>
```

- **Tier-neutral.** No `pro/` segment. The same link serves Pro first and Early
  Access two weeks later — it must not name a tier. (The legacy
  `vision/pro/v1.0.0-…` path is the old shape; new links drop `pro/`.)
- **Minor only — no patch digit.** The 3rd digit (patches) reuses the same link
  and swaps the files behind it, so the path stops at `<major>.<minor>`.
- **`<randomhex>`** is a fresh random obscurity token per new link — pure
  unguessable gate, no meaning (not a commit SHA). Generate ~20 hex chars. The
  link being secret is the access gate, not real auth (per the R2 capability
  doc); never treat it as strong access control.

Public URL: `https://dl.cubric.studio/vision/v<major>.<minor>-<randomhex>/index.html`

## Lifecycle

A link is **born** at a promote (`mpi-merge-branches`) and **dies** at the next
promote. Patches in between reuse it.

```
PROMOTE 1.1   → create vision/v1.1-<hexA>/         (Pro downloads here)
              → GC (delete) the prior minor link    (approval-gated)
patch 1.1.1   → reuse vision/v1.1-<hexA>/, swap files, link unchanged
patch 1.1.2   → reuse vision/v1.1-<hexA>/, swap files, link unchanged
PROMOTE 1.2   → create vision/v1.2-<hexB>/
              → GC vision/v1.1-<hexA>/
```

## Why GC at promote is safe

You delete the prior minor link only at the next promote. By then that prior
version has **already shipped as a public GitHub release** (the
`mpi-release-public` step happens in the ~month between promotes), so Early
Access and everyone else can get it from GitHub. No tier is ever stranded:

- Pro gets the new pre-release link the day of the promote.
- Early Access gets the **same** link announced ~2 weeks later (the link existed
  the whole time; only the announcement is delayed). This is a manual
  Patreon/Discord step the user does — not part of these skills.

## Which skill touches the link

- **`mpi-merge-branches`** — the ONLY skill that creates a new link and deletes
  the prior one. Both are live R2 ops → STOP for user approval (delete is
  double-gated per the R2 capability doc).
- **`mpi-apply-patch`** — reuses the current minor link, swaps files. Never
  creates or deletes a link.
- **`mpi-release-public`** — does not touch Cloudflare at all (GitHub only).

## Finding the current link

The current minor link path is whatever the last promote created. Don't guess
the hex — read it back from R2 before a patch upload:

```
rclone lsf "cubric-r2:cubric-builds/vision/" --dirs-only --s3-no-check-bucket
```

Pick the `v<major>.<minor>-…` dir matching master's current minor. If two minors
both exist (a promote that hasn't GC'd yet), the higher minor is current and the
lower is the GC target.
