# MPI-97 Brief — Parallel model installs (no shared-dep collision)

**Origin:** explicit user request 2026-06-15, found while live-testing MPI-81's remote ComfyUI-restart on an L4 Pod. The user wants to **queue several models to install at once** with no conflicts.

## The problem (observed live)

While T2V's shared deps (`umt5_xxl_fp8_e4m3fn_scaled`, `wan_2.1_vae`) were mid-download, pressing **Install** on I2V (which shares those deps) produced:

```
[ERROR] [download] remote install trigger failed for umt5_xxl_fp8_e4m3fn_scaled: this model is already downloading
```

surfaced to the user as a **"Download Failed" dialog with a "Report on GitHub" button** — for a benign collision, not a real failure. The second model install was rejected WHOLE.

## Root cause

The per-dep download guard is **coarse + not refcounted across concurrent model jobs**. A dep already downloading for model A rejects model B's whole install instead of letting B **share / await** that same in-flight download. (`routes/downloadManager.js` already has a `refCount` on dep jobs — the gap is in how a second model's `start` reacts to an in-flight dep + how the UI/collision is surfaced.)

## Fix direction (app-side, remote + local — NO image rebuild)

1. **Dep sharing:** when model B requests a dep already downloading (for A), ATTACH B's job to the running download — B's dep completes when the shared download lands. Refcount so neither A nor B's uninstall removes it while the other needs it (ties to the MPI-81 shared-dep volume-truth fix, commit `1c6b800`).
2. **Concurrent independent deps:** B's NON-shared deps download in parallel with A's (respect a sane max-concurrency, but don't reject).
3. **UX:** the collision is never an error+GitHub dialog — at most a quiet toast, ideally silent (the dep is being fetched, the user's intent is satisfied).

## Related / pairs with

- **MPI-81 #9** — a collided/cancelled install leaves orphan `.part` files that confuse `models/status` (UI desync). The wrapper should clean `.part` on abort + `models/status` should ignore `.part`. (Wrapper-side; future build.)
- **SSE-recover gap** — the remote install event stream (`/wrapper/events/stream`) can drop mid-install (`remote install SSE closed` seen live) and HANG the card at 100% with no completion event. The app should reconnect the SSE or poll `/wrapper/models/install/active` to recover. (App-side.)
- **MPI-94 G1 / MPI-81 #6** — same "benign transient shown as scary error+GitHub dialog" UX family.

App-side only. No image rebuild. Verify by queuing 3+ models (incl. ones sharing deps) and confirming all install with no collision dialog + correct final state.
