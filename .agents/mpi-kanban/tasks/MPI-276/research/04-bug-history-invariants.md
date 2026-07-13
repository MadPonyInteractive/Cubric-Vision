# Scar-tissue dossier — bug history, invariants, recurring patterns

Agent sweep 2026-07-13 (git log + kanban archives + docs + code verify). All listed fixes verified still present in current code unless noted. **This table is the regression-test matrix for MPI-276.**

## Bug table (condensed; full detail in git/kanban archives)

| Bug | Symptom | Root cause | Fix | Present? |
|---|---|---|---|---|
| MPI-54 | partial file read as installed | NDH writes final filename | `.cubricdl` sidecar + `isCompleteOnDisk` (1f21db1f) | YES |
| MPI-95 | bar snapped to 80%/early 100% | denominator missing pending deps; Math.max seed cap | real-total-wins (`totalBytes||seedBytes`) | YES :295 |
| MPI-97/136 | zombie socket, ghost frozen bar | CDN stall, no RST | 90s stall watchdog + aria2 lowest-speed (9cdfc95c) | YES :906 |
| MPI-123 | stale partial bytes after remote cancel | soft-cancel raced status resync | sync `remoteUninstallDep` after cancel (9b55766c) | YES :1720-1727; LOCAL display path never verified (OPEN) |
| MPI-140 | bar capped ~91%; ENOSPC crash | seed overestimate; pre-flight used 0 totalBytes | real total; `totalBytes||seedBytes` in gate (3fc40575) | YES :737 |
| MPI-163 | Pod showed "not installed" w/ GGUF present | engine-agnostic status gate | `engines:{}` block + resolver engine param (546b0f60) | YES |
| MPI-164 | remote bar short + no Verifying sweep | seed inflation; per-dep verifying flipped whole bar | allBytesDone gate (63a9b58e); custom_nodes excluded (445d6470) | YES :381/:1132 |
| MPI-216 | uninstall deleted twin-tier's shared deps; sweep gate local | `m.installed` dead in backend; gate not ported | `_localSharedDepsMap` disk-stat (94d7373c); local allBytesDone (9ecbc47c) | YES |
| MPI-231 | "203MB / 15MB" node bar | GitHub zip no Content-Length | `_byteRatioExcludingNodes` both engines (94a518e7) | YES :306/:837/:1085 |
| MPI-241 | Install button reverted mid-download | SSE-open `/status` clobbered live client job | merge-not-clobber (9565876c) + `_recentlyCancelled` | YES (heuristic — refactor replaces with register-before-respond) |
| MPI-254 | remote hung at 100% | aria2 `--enable-rpc` never exits | wrapper 0.2.36 RPC poll+shutdown | YES (pod-side) |
| MPI-255 | requirements-only install hung; watchdog false-fire | terminal SSE emitted before app stream attached | `_reconcileOutstandingRemoteDeps` 15s poll (708e3847/a0abef8b) | YES :913-1004 |
| MPI-258 B1 | tier-family circular shared-dep stranding (~19GB undeletable) | per-dep on-disk protection circular | whole-model-installed gate (69a6302f) | YES :153-170 |
| MPI-258 B2 | 25GB SHA mismatch on resume | R2 200-not-206 → append corruption | pause/resume DELETED (c7313dff), cancel-only | YES |
| MPI-258 B4 | cancel no-op w/ stacked refCount; re-press 404 | refCount leak + `refCount<=0` gate | `_otherActiveModelUsesDep` + idempotent 200 (8e99fd37) | YES :1703/:1715 |
| MPI-258 A | uninstall silent no-op >bin-quota | windows-trash exit 255 | trash→`fs.remove` fallback (8e99fd37) | YES :1947-1952 |

## Invariants (enforce in the new store; violations = test cases)

1. `MODELS[].installed` is renderer-only — backend NEVER reads it.
2. Dep liveness = job STATUS, never refCount (refCount to be deleted entirely).
3. Every job must reach a terminal state — missed events are healed by reconcile, not hangs.
4. `Verifying…` sweep only when allBytesDone across non-custom_nodes deps — BOTH engines.
5. Uninstall protects: universal set, whole-model-installed sharers, in-flight deps (BOTH engines).
6. `.cubricdl` present = partial; complete = exists && no sidecar.
7. Progress: real-total-wins, nodes excluded from byte ratio, installed deps credited, seed only pre-first-tick, model totalBytes SET not accumulated.
8. Cancel idempotent (unknown job → 200 + broadcast).
9. Engine resolved ONCE per operation, threaded (never two independent `isRemote()` reads).
10. Shared-dep protection resolves FULL UNIVERSE per model (`resolveFullUniverse`), never `.dependencies`.
11. Windows trash has quota → permanent-delete fallback.
12. custom_nodes deps: no sha256 pins; not byte-rated; zip deleted after extract — uninstall must target the FOLDER.

## Recurring patterns (the refactor's raison d'être)

- **A. Fix one engine, forget twin** — 4+ hits (MPI-122→216, 164→216, 231, 258-B1). Cure: one pipeline + engine adapters.
- **B. Gate on refCount, refCount lies** — 3 hits. Cure: delete refCount.
- **C. Reactive-event correctness, missing proactive truth-check** — 3 hits. Cure: reconciler loop on disk/volume truth.
- **D. SSE-open race / missed terminal** — 2 hits (241, 255). Cure: register-before-respond + snapshot protocol + reconcile-on-connect.
- **E. Progress numerator/denominator mismatch** — 5+ hits. Cure: single `computeProgress()` with the rules above as unit tests.

## Open items folded into or noted by this refactor

- OPEN-1 (MPI-258 B3): active-job vs `_computePartial` denominator mismatch — cure via single computeProgress.
- OPEN-2 (MPI-123 local): partial-bytes display after LOCAL cancel unverified — add to verification matrix.
- OPEN-5: refCount vestigial decrement at uninstall :1960 — dies with refCount.
- OPEN-6: `ResumableDownloader` misleading name — rename during adapter extraction.
- OPEN-7: 90s stall watchdog never live-verified — keep logic, port into reconciler, still hard to force live.
