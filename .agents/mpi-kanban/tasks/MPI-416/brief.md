# MPI-416 — macOS first run: the CLT requirement (the symlink half has SHIPPED)

MPI-450 Gate C decided to **split this card**. Both halves are recorded here; only
one of them is still open.

## SHIPPED 2026-08-05 — the dangling `@cubric/connector` symlink (absorbed MPI-417)

`package.json` declares `"@cubric/connector": "file:../Cubric-Studio/packages/connector"`,
so npm leaves a symlink in `node_modules`. It dangles on CI (the sibling repo is not
there — `npm ci` still exits 0) and it dangles on a user machine even when it is.
`copyAppTree` in `scripts/build-portable.mjs` faithfully recreates symlinks and macOS
`ditto` preserves them, so a **verified 1.3.0 artifact** shipped a link to
`../../../Cubric-Studio/...`.

Nothing crashed — all three consumers dynamic-import it inside try/catch and run
standalone. The cost was trust: our own documented first-run command,
`xattr -dr com.apple.quarantine <folder>`, printed "No such file" at that path for
every Mac user, who reasonably reads it as a broken download.

**Fixed by excluding the `@cubric` scope from the staged app tree — not by
dereferencing it.** A shipped build has never had the SDK, so copying the real files
in would be a behaviour change nobody asked for.

**And the reason nobody caught it: nothing looked.** MPI-417 noted an earlier
dangling-symlink check that was scoped to `Electron.app` only. `assertNoDanglingSymlinks`
now walks the WHOLE staged app tree and throws. macOS `.framework` links are relative
and resolve, so a reachability test passes them — it does not ban symlinks, which the
`.app` bundle needs.

Verified: two node tests (`tests/portable-win-layout.test.cjs`) with a proven negative
control, plus a REAL local Windows stage (6444 files) where the check ran clean and
`node_modules/@cubric` is absent from the output.

## STILL OPEN — the Xcode Command Line Tools requirement

Unchanged and **deliberately not in 1.4**. `_provisionUvEngine` → `ensureGit()` needs
git, which on macOS only arrives with the Xcode CLT, and a clean Mac has none
(reproduced live on a rented M4, 2026-07-31).

Gate C's decision: ship a **known-issue line** rather than rush the structural change.
Done — `docs/releases/UNRELEASED.md` § importantChanges now tells Mac users to run
`xcode-select --install` before their first setup, and says removing the requirement is
separate work.

**Do not start the structural fix from this brief.** The candidate (fetch the ComfyUI
source tarball per tag instead of cloning) is NOT established to remove the
requirement: the CLT also supplies clang, and any of the universal deps lacking a
prebuilt arm64 wheel would still compile. **Verify that first** — if one dep compiles,
killing git only moves the dialog later. It is a structural change to a shared
provisioner, so brief the user before writing code.
