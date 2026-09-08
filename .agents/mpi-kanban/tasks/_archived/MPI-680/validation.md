# MPI-680 - validation

Measured 2026-09-01. `npm run release:deps` **exits 0**, `All 290 URLs reachable`, and no
Klein dep appears in the single-route list any more.

## 1. Nothing was broken for users at any point

All nine primaries HEAD 200 on R2 with a content-length exactly equal to the dep's `bytes`:
`klein-9b-lora-nsfw` 318,784,864; muppets 92,426,832; cartoon 92,426,824; anime 92,426,264;
jojo 92,426,808; chibi 92,426,632; doodle 23,122,832; vintage 92,427,896; aesthetic
192,702,824. The gap was the **failover copy only** - the app downloaded these fine
throughout, it simply had nowhere to fall back to if R2 blipped.

## 2. What shipped

1.09 GB mirrored to `Mad-Pony-Interactive/cubric-studio`, one file at a time (peak local
disk = one weight, staged in the session scratchpad - never inside the app's models root,
where the orphan sweep can delete an in-flight upload source).

Each mirror path was derived by calling the **real** `_mirrorUrlsFor` from
`routes/downloadManager.js`, not hand-written, so what was uploaded is by construction the
exact URL the failover will ask for. The script asserted one mirror per dep under the
expected prefix and would have aborted otherwise.

Each file was hash-checked on both sides: sha256 of the bytes pulled from R2 compared to the
dep's recorded `sha256` **before** uploading (a mismatch aborts), then the repo's
`lfs.sha256` and `size` compared to the dep entry after. **9/9 OK, ALL VERIFIED.**

**No code change.** The generic HF prefix rewrite already emitted these URLs; they had
nothing behind them.

## 3. Licences

Not touched, and nothing was outstanding. The CivitAI flags were cleared in
`docs/models/klein/licences.md`, the attribution-requiring weights carry `credit` blocks
that MpiAbout renders as the Credits list, and MPI-358 covered that sweep. Re-hosting
cleared by Fabio 2026-09-01. This card's original description called it a per-dep licence
call; that was wrong and was corrected when the card was claimed.

## 4. Result

`release:deps` exit 0. 0 UNREACHABLE, down from 9. Forty deps still carry no second origin -
the `noMirror` set and the H3/MiniMax weights whose publisher URL is a licence position -
which the script reports as information, not failure, and which is the correct resting state.
