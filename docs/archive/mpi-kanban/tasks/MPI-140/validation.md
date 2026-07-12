# MPI-140 Validation — download progress bar lie + adjacent download bugs

## Resolution (2026-06-29)
The carded core ("progress bar snaps to ~85% in <1s then crawls") is RESOLVED.
Root insight: the lie was an **HF/Xet pathology** — on a throttled HF stream the
real bytes lagged far behind the bar's apparent value. The **R2 migration
(MPI-129)** fixed it at the source: R2 serves flat ~200MB/s–2GB/s over 16 aria2c
connections, so apparent-size and real-size converge in <1s and the bar tracks
honestly. User confirmed live (remote CPU Pod): "with R2 it's not lying anymore."

The session also found + fixed the DENOMINATOR snap (real bytes outrunning a
rounded declared total) on BOTH paths, plus 8 adjacent download bugs surfaced
during testing.

## Fixes shipped (9 commits, RunPod branch)
| Commit | Fix | Verified |
|---|---|---|
| 53e5984 | Local bar capped ~91-95% then jumped → hits 100% (real-byte denominator) | live |
| 167740a | Local "hang at 100%" → "Verifying…" sweep during sha256 | live |
| 891450b | Declared dep sizes corrected to real bytes (card label + bar agree) | live |
| 113d605 | Local concurrency 1→3 (R2 has no HF throttle to fight) | live |
| 0c54469 | Failed install → "Partially Installed" not "Not Installed"; toast mascot onerror fallback | live |
| 3fc4057 | Disk-full during install crashed the SERVER + froze bar at 0B → preflight uses seedBytes, unhandledRejection guard, cancel{all} clears UI | live (recovered) |
| 0af8b45 | Hide Pause button on cloud downloads (remote has no pause/resume API) | live (remote, Cancel-only) |
| 0bb786b | CPU download Pod failed to start — v0.10.3-cpu image tag 404'd; pin CPU image to v0.10.2-cpu (decoupled from GPU version) | live (Pod connected) |
| 4804c76 | Remote install shows "Verifying…" at 100% too (match local) | live (remote screenshot) |

## Live verification (remote CPU Pod, ILL Anime install)
- Bar reached 100%, showed "Verifying…" ~20s, then complete. No 85% snap.
- No Pause button (Cancel only) — remote pause-hidden fix confirmed.
- Hero-stats updated 2/7 → 3/7 on install.

## Caveat — wrapper still reads getsize, not completedLength (latent)
The wrapper's `_download_aria2` still emits progress from `os.path.getsize(.part)`
(wrapper.py ~1193), which is the sparse-file APPARENT size (highest 16-conn piece
offset), not aria2c's true `completedLength`. On R2 (fast) this is cosmetically
invisible. On a SLOW host it could resurface as a mild snap. NOT fixed (would
need a wrapper rebuild + Pod image push for an R2-invisible improvement). If a
future slow-host report shows the snap, the fix is aria2c RPC `completedLength`.

## "Verifying…" history (why it was removed, why it's back)
MPI-95 (dc27f33) dropped the remote "Verifying…" sweep because pre-R2 the bar
parked at a BROKEN ~80% (denominator snap) — verifying there was nonsensical.
That was a UX band-aid for an unfixed snap, not a fix. R2 + the real denominator
makes the bar genuinely reach 100%, so "Verifying…" at 100% now makes sense and
is restored (4804c76), consistent local+remote. The MPI-95 snap-fix (re-derive
denominator) is preserved.

## NOT carded follow-ups (user reducing card count)
- Hero-stats "MODELS X/7" undercounts partial installs — see NOTES-model-count-partial.md
- EXITED-on-boot handler advises "pick another GPU" even for CPU/missing-image — wrong message
- Version-bump flow should rebuild ALL image profiles (incl -cpu) or app should verify tag exists
- Wrapper completedLength purity (above)

## NOT pushed
9 commits local on RunPod branch. Push is user-gated.
