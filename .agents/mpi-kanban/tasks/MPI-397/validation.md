# MPI-397 Validation

## RE-MEASURE — 2026-07-30 (MPI-385 item 7, Pod qrpnumt8p1rm31, L4 EU-RO-1, wrapper dev 0.2.40)

Every pre-existing number on this card was taken on wrapper 0.2.38, BEFORE MPI-398 moved
`/wrapper/models/status` off the event loop. Re-measured on the same uninstall/install
pair MPI-396's remote leg used (klein-4b, 12.7GB, 14 files):

| Direction | Toast | Card section move |
|---|---|---|
| Uninstall | **no toast shown at all** | **~3s** after click (user stopwatch) |
| Install | fires at completion | **same frame as the toast** (~0s) |

- **Install direction: fixed outright.** Nothing left to do.
- **Uninstall direction: ~3s residual**, down from ~10s. In line with the MPI-398 cold-open
  p50 of 2259ms for the models/status round trip that gates the section move.
- The old "toast ~7s" uninstall symptom is gone in a different way than expected — no
  uninstall toast fired at all this run.

## Standing decision — unchanged

The remaining ~3s is the truthful-install-state round trip (`models/status` is deliberately
UNCACHED — install-state feeds the whole download UI). Closing it needs the optimistic
install-state flip, which relaxes the install-state-IS-files-on-disk invariant — a product
decision, the user's call, not a bug fix. Card stays parked with these numbers. Do NOT "fix"
it by caching models/status.
