# MPI-505 Validation

## Proven at the bench (2026-08-09)

Turbo, 864x480, 2s clip, warm, 4 runs: 91.59 / 90.07 / 96 / 91s against a 204.02s
two-stage non-turbo baseline. The 96 was a first-run warm-up artefact, confirmed by
two repeats. Quality: user judged turbo slightly below the 20-step path but acceptable
as an explicit opt-in trade.

R2 object verified three ways: rclone's own exit 0, byte-for-byte size match
(620,285,592), and HTTP 200 with matching Content-Length on the public URL.

## NOT yet verified

- The exported raw templates have NOT been through `sync-raw-workflows.mjs`.
- No app-side run exists - the toggle is not wired into the UI yet.
- `NOT LOADED` has not been checked for the EMA weight, so full key binding is assumed.
- i2v / fl2v / r2va turbo output has not been quality-reviewed (t2v only, and upstream
  documents t2v only).
- The 204.02s baseline is n=1 and gates the single-pass decision.
