# MPI-129 — Migrate model downloads HF → Cloudflare R2

## Why
HF/Xet long-lived streams **throttle in waves** during big local downloads
(sawtooth 40MB/s ↔ sub-MB/s, observed live on `ltx23-gemma-clip`, MPI-127).
In-app slow-stream watchdog (commit `02ef2c0`) rides out self-recovering dips —
it does **not** fix the throttling. R2 fixes it at the source.

## Why R2 wins
| | R2 Standard |
|---|---|
| Egress (user downloads) | **Free, unlimited** — bill is download-volume-PROOF |
| Storage | $0.015/GB-mo → ~$0.75/mo for ~60GB |
| Throughput | Own CDN, flat, no Xet wave throttling |

- **Use Standard, NOT Infrequent Access** — IA's $0.01/GB retrieval fee re-adds
  the egress cost we're escaping. IA is for cold archives, not user-pulled weights.
- No volume/commitment tiers exist; flat rate. Free tier: 10GB storage +
  1M Class-A + 10M Class-B ops/month.
- More users downloading does **not** raise the bill (egress free; reads are
  Class-B, 10M/mo free, ~$0.36/M after — trivial).

## Work items
- [ ] **1. Update upload scripts** — extend existing rclone→R2 flow
      (`cubric-builds` bucket, see *R2 upload procedure* memory + `mpi-release-shared`)
      to also push model weights to a `models/` prefix. Same rclone connection
      already configured for builds.
- [ ] **2. Upload all files** — `rclone copy` every MPI-owned re-host now on
      `Mad-Pony-Interactive/cubric-studio` → R2 `models/`:
      - LTX-2.3: `gemma-3-12b-it-heretic-fp8-comfy`, LoRAs (soft-enhance,
        transition, talkvid)
      - Prior re-hosts per *dep re-host rule*: Wan, Singularity, gemma-heretic,
        ID-LoRA, lipdub
- [ ] **3. Update dependency + download links** — swap every
      `huggingface.co/Mad-Pony-Interactive/...` URL in
      `js/data/modelConstants/dependencies.js` → R2 custom-domain URL.
      Re-verify sha256 matches post-upload (`mpic-compute-dep-hashes`).

## Scope guard
- **Only MPI-owned re-hosts move.** Upstream files that are NOT ours stay on HF:
  - `Kijai/LTX2.3_comfy` base weights (transformer, video/audio VAE, text-projection)
  - `Lightricks/LTX-2.3` spatial-upscaler
- **Cross-ref MPI-128 item 2** — that card self-hosts those 5 upstream LTX base
  files. When it does, they land on **R2, not HF**. Coordinate so both cards
  converge on R2.

## Release targets — MASTER must carry R2 for the public launch
**Timeline:** tonight = Patreon/Pro pre-release only (0 subscribers → safe even
without R2). **~2 weeks = FIRST PUBLIC GitHub release, ships from `master`.** The
public build MUST have fast downloads → **R2 links MUST be on `master` before it.**

- [ ] **Land R2 dep URLs on `master`** — once R2 uploads exist + `dependencies.js`
      URLs are swapped + sha256 re-verified, get that change onto `master` (this
      work happens on the dev branch first per the branch flow, then promotes).
- [ ] **Watchdog: NO action needed for master** — verified 2026-06-25: the entire
      watchdog (add `02ef2c0` + disable `a780e0a`) is `RunPod`-only; **master
      (1.0.1) NEVER had it, so master never had the crash.** No cherry-pick needed.
      When RunPod promotes to master for 1.0.2, the net (add+disable = no-op) rides
      along harmlessly, or the R2 GC step removes the method entirely. Just CONFIRM
      the public build has no live watchdog (it won't) — do not re-introduce it.
- [ ] **Bump `master` → v1.0.2** for the public release (master is currently
      **1.0.1**). Use the version-bump mechanic (appVersion.js + package.json +
      package-lock.json + registry/notes) — see `mpi-version-bump` /
      `mpi-release-public`. This is the public-launch version.
- [ ] Confirm a fresh PUBLIC build (master, 1.0.2) installs LTX-2.3 from R2 with
      flat throughput and no server crash on a slow stream.

## Garbage collection — remove what HF throttling forced
The slow-download mitigations exist **because** HF/Xet throttles. On R2 (flat,
no waves) some are dead weight. **Review for removal/relaxation — do NOT delete
blind; confirm R2 behaves first, then trim.** All in `routes/downloadManager.js`:
- [ ] **Slow-stream reconnect watchdog** (commit `02ef2c0`:
      `_maybeRecoverSlowStream` / `_recoverSlowStream` + the `SLOW_RECONNECT_*`
      consts). Pure HF-throttle workaround. Likely fully removable once all
      MPI deps are on R2 — BUT keep it as long as ANY dep still fetches from HF
      (upstream Kijai/Lightricks until MPI-128 moves them). Remove only when the
      last HF URL is gone.
- [ ] **Local concurrency cap** `LOCAL_DOWNLOAD_CONCURRENCY = 1` (commit
      `47e924a`). Forced sequential because parallel HF streams competed for
      throttled bandwidth. R2 free egress may let this go back to 2–3 parallel
      for faster installs. Re-test parallel on R2 before bumping; keep at 1 if
      remaining HF deps still suffer.
- [ ] **Speed-display smoothing** (commit `d58eb4b`). KEEP — it smooths progress
      jitter regardless of host; not HF-specific. Listed only so it's not
      mistaken for throttle cruft.
- [ ] If watchdog removed: drop the `_bestSpeed`/`_slowSince`/`_slowReconnect*`
      instance fields too (orphaned by the removal — clean up own mess).

## Billing (confirmed 2026-06-25)
Payment method on file: **PayPal**. **R2 Paid plan = Active** ($0.00/mo + usage).
No free-tier wall — uploads past 10GB won't be refused. Migration won't stall on
billing. Cloudflare bills postpaid monthly; ~$0.75/mo projected for ~60GB.

## Verify (done = all)
- [ ] App fresh-install of LTX-2.3 pulls every MPI dep from R2, no HF URLs in flight
      (check `logs/app.log` download start lines)
- [ ] Throughput flat (no sawtooth) on a previously-degrading file
- [ ] sha256 verify passes on every swapped dep (no mismatch → no re-download loop)
- [ ] Remote/RunPod download path still works (wrapper may fetch its own URLs —
      confirm it reads the same `dependencies.js` or note the divergence)
