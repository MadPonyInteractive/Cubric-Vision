# MPI-661 — validation

Docs-only card. Nothing in the dependency set changed — the floor was already there and
undeclared; this states it.

## What set the floor (measured, not read off release notes)

`uv` resolves against a declared target platform without downloading anything, so the whole
question was answerable from Windows:

```
uv pip install --dry-run --no-deps --python-platform aarch64-apple-darwin -r dev_configs/python_deps.txt
```

| package | only Mac wheel | in the set since |
|---|---|---|
| `bitsandbytes==0.50.2` | `macosx_14_0_arm64` | MPI-607 |
| `embreex==4.4.0` | `macosx_13_0_arm64` | MPI-413 — the original curated set |

`embreex` arrives via `trimesh[easy]`; its `platform_machine != 'aarch64'` marker never
excluded Apple Silicon, because macOS reports `arm64` and `aarch64` is the Linux spelling. So
a Mac floor has existed since the curated file was created, and MPI-607 raised it from 13
to 14.

**Electron's own floor is Ventura (13)** — *"macOS (Ventura and up)"*, electron/electron
README. Ours is one release stricter, and the pip set is the reason. That asymmetry is the
thing most likely to be "corrected" later, so it is written into `python_deps.in` itself.

**A marker bound does not avoid it** — measured, not assumed. With
`(platform_machine == "arm64" and platform_release >= "23") or sys_platform != "darwin"` the
resolve fails on `embreex` instead. Linux stayed at 149 packages.

## Why 14+ is the right call rather than chasing 13

Fabio, 2026-08-30. Every Apple Silicon Mac (M1, Nov 2020 onward) can run macOS 14, 15 and 26,
so no machine that can run Vision at all is stuck below the floor — Vision ships arm64 only.
Adoption backs it: macOS 26 Tahoe was at 86.0% of tracked installs in July 2026 and Sequoia at
12.2%, leaving Sonoma, Ventura and older as a long tail (TelemetryDeck). Supporting 13 would
mean un-pinning `trimesh[easy]`'s extra AND downgrading `bitsandbytes` — two downgrades on
every platform, for a user who declined a free OS update.

## Checks

- `npm test` → **798 pass, 0 fail, 0 skipped**.
- `node scripts/compile-node-deps.mjs --check` → still green; `python_deps.txt` byte-unchanged
  (the edit was a comment).

## Left open, deliberately

- The **docs site** (`docs.cubric.studio/vision/installation/`) still says nothing about a
  floor. It lives in the Cubric Studio (Docs) repo, which is a hard no-push from here, so it
  needs a card in that repo.
- **No code gate.** A user on macOS 13 still discovers this as a failed engine setup rather
  than an upfront message. That is the install-warning/run-toast work on **MPI-249** (Fabio's
  2026-08-27 preference), still unimplemented, and it stays conditional on whether nf4 runs on
  MPS at all — which needs a real Mac.
