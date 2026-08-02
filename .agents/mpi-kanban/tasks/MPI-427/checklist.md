# MPI-427 checklist

## Shipped in 1.3.1 (code complete, 71/71 suites green)

- [x] **Classify transport failures.** `_describeTransportError(err, url)` in
      `routes/downloadManager.js` — TLS-answered-by-non-TLS, intercepting-proxy cert
      errors, and never-resolved/refused/black-holed. Returns null for everything else.
- [x] **Name the host + carry a remedy** in the user-facing string; the raw driver text
      still goes to the log at `warn` so a real diagnosis stays possible.
- [x] **Route it to a warning toast, not the Report-on-GitHub dialog.** `networkBlocked`
      flag on both the dep-level and model-level `download:failed` broadcasts;
      `js/services/downloadService.js` handles it beside the existing out-of-space case.
- [x] **UW failures carry their reason** — the wait loop rejected with only dep IDs
      (`UW deps install failed: rife47`), discarding the cause.
- [x] **Explicit retry requeue.** `store.requeueDep()` — the one legitimate way out of a
      dep's terminal state. The transition TABLE is deliberately NOT widened, so the
      reconciler still cannot resurrect (invariant #3). All four requeue call sites route
      through the single `_setDepStatus` branch.
- [x] **Progress no longer runs backwards on retry.** Local requeues credit the resumable
      partial via the existing `getPartialBytes()`; `requeueDep` no longer touches byte
      counters (status function — `syncProgress` owns numbers). Remote/Pod requeues still
      zero, correctly: there is no local partial there.
- [x] **`app.getPath('documents')` boot guard** in `main.js` `startServer()`.
- [x] **Mirror failover mechanism**, inert by default: `_MODEL_MIRRORS` +
      `_mirrorUrlsFor()` + `_isSameObjectUrl()`, retrying the identical object path
      against alternate origins on a transport error only.
- [x] **Partial survives a mirror swap.** MPI-317 compared marker url by string equality
      and DELETED the partial on mismatch — a host swap would have scrapped exactly the
      bytes failover exists to preserve. Now path-equal; SHA256 verify stays the net.
- [x] Tests: `tests/transport-error-message.test.cjs` (8, incl. the verbatim report error
      and negative controls) + 4 new in `tests/install-store.test.cjs` (29 total).
- [x] Version stamped 1.3.1 across `appVersion.js` / `package.json` / `package-lock.json`;
      `releaseNotes.js` 1.3.1 entry; `docs/releases/2026-08-02-v1.3.1.md`;
      `UNRELEASED.md` folded + cleared; `release:check` passed; notes approved
      (`.approved-1.3.1.json`).

## NOT done — why this card is not closed

- [ ] **No second origin exists.** `_MODEL_MIRRORS` ships EMPTY, so the failover it
      contains cannot fire for anyone. Enabling it is an approval-gated Cloudflare change
      only Fabio can make (`MadPony-Identity/capabilities/cloudflare-r2/README.md`
      § Approval Gates) — add the custom domain to the `cubric-models` bucket, then add
      the origin to the constant. Free: one bucket, no duplicate storage, R2 egress is
      free, custom domains carry no per-domain charge.
- [ ] **A same-provider mirror is UNPROVEN against this user's failure mode.** He
      confirmed by test that a plain DNS switch is not enough and that only a tunnel
      works, and the stream died at ~20% rather than at handshake — deep-packet
      interference, not hostname blocking. A second `cubric.studio` hostname defeats the
      hostname-keyed class for certain; whether it survives DPI is unknown until tested.
      If it does not, the fallback is an off-Cloudflare origin (GitHub Releases — proven
      to reach this exact user, 2 GB per-asset cap forces splitting the big transformers;
      Hugging Face; Backblaze B2).
- [ ] **1.3.1 is not released.** `mpi-release` owns build + tag + publish.
- [ ] **Nothing here is verified in a running app.** Every claim above rests on unit
      tests and code reading. The transport classifier has never been seen firing against
      a real blocked host, and the mirror failover has never executed at all.
