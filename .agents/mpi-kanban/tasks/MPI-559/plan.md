# MPI-559 — Cross-platform first run: the verification trip and the Xcode CLT stop

Umbrella created by the consolidation sweep, 2026-08-14. Two `todo` cards, one trip:
**what a real Linux and macOS desktop does with a portable build, and the hard stop macOS
hits before the first generation.** Both cards already name the other as SIBLING.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-249 | Verify a portable build on Linux + macOS (LOCAL engine) — deferred, batch across the next few releases |
| MPI-416 | macOS first run is blocked — missing Xcode Command Line Tools (the dangling-symlink half is already SHIPPED) |

## Current State

**Do not let this umbrella re-block the Linux leg.** MPI-249 is `blocked` and MPI-416 is
`deferred`, but only the macOS halves are actually blocked — a Linux desktop has been on
hand since 2026-07-30, and it is reachable over SSH. MPI-249's own card says this
explicitly, and pairing it with a macOS card must not quietly undo that.

MPI-416's dangling `@cubric/connector` symlink half is FIXED AND SHIPPED
(`build-portable.mjs` excludes the `@cubric` scope from the staged app tree, and
`assertNoDanglingSymlinks` now walks the WHOLE staged tree). Only the Xcode CLT half is
open, and 1.4 ships a known-issue line instead, telling Mac users to run
`xcode-select --install` first.

MPI-249's actual work is also carried by MPI-391 sections C and D, which now name MPI-249
explicitly. Check there before re-deriving the test list.

## Why one card and not two

They are the same trip. MPI-416's CLT failure is literally the first thing a macOS
verification run hits — the very first Install press dies at
`ensureGit()` (`routes/gitProvision.js:172`) with "git is provided by the Xcode Command
Line Tools, which are not installed". Verifying macOS without fixing that means paying for
a Mac to rediscover a known error; fixing it without the trip means shipping an unverified
provisioner. One Mac, both answers.

The asymmetry behind both: Windows ships a PREBUILT ComfyUI portable archive and never
needs git, while macOS/Linux provision via uv/comfy-cli which git-clones ComfyUI
(`routes/engine.js _provisionUvEngine`). A RunPod run does NOT substitute — it never
exercises the local engine.

## Phase 1: Linux, now, no hardware spend

MPI-249's Linux leg. Extract the real `CubricVision-linux-x64-vX.Y.Z.tar.gz` on the Linux
desktop, let the LOCAL uv engine provision, install the 11 UW nodes, generate with at least
one model per family. This is the half nothing blocks.

Two standing constraints from the box itself: it has **no AVX2**, so it verifies INSTALLS
and never RUNTIME performance, and it has failed an engine install twice on thermal
shutdown where the retry RESTARTS rather than resumes. Budget for that. The box is
disposable — delete what a test does not need.

This phase also unblocks MPI-198 (the backslash loader-path heal needs a Linux/mac LOCAL
engine plus a subfoldered LoRA to close).

## Phase 2: Settle the CLT question BEFORE renting a Mac

MPI-416, desk work only. The candidate fix — fetch the ComfyUI source tarball over HTTPS
per tag instead of cloning — is **NOT established to remove the requirement**, because the
CLT also supplies clang, and any of the 23 universal deps lacking a prebuilt arm64 wheel
would still need to compile. Establish that first: if some dep compiles, killing git only
moves the dialog later and the Mac trip finds the same wall.

This is a structural change to a shared provisioner — **brief the user before writing
code.**

## Phase 3: The Mac trip

Both macOS halves in one sitting, on one rented machine. MPI-416's fix verified on a clean
Mac (first Install press, no manual `xcode-select`), then MPI-249's macOS leg: extract
`CubricVision-macos-arm64-vX.Y.Z.zip`, provision the LOCAL engine, install the 11 UW
nodes, generate one model per family.

Known trap from the 2026-07-31 rental: a box advertising "Xcode pre-installed" did not have
it. Verify, do not trust the listing.

## Verification

Phase 1: a real generation off the LOCAL engine on the Linux desktop, one model per family.
Phase 3: the same on macOS arm64, from a clean machine, with no manual CLT install. Close
MPI-249 only when BOTH halves pass — if macOS slips, keep it open on the macOS half alone
rather than closing it green.

## Parallel Batch

Phase 1 is independent and can run alone today. Phases 2 and 3 are strictly ordered and
share `routes/engine.js` / `routes/gitProvision.js`. Derive ownership from each member's
`files.json` at dispatch time, not from this list.

## Plan Drift

(none yet)
