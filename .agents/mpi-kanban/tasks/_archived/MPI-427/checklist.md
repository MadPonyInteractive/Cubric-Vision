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

## Moved off this card — now MPI-429

- [x] **1.3.1 IS released** (2026-08-02). Built from branch `1.3.1` @ `5328c033` via mpi-ci
      run 30755518372, published at
      <https://github.com/MadPonyInteractive/Cubric-Vision/releases/tag/v1.3.1> with the
      full builds and all three delta bundles (`1.3.0 -> 1.3.1`, 21 changed / 0 deleted).
      `git rev-parse 'v1.3.1^{}'` == the SHA CI built. Baselines restamped post-publish.
      Evidence: `validation.md`.
- [→] **The mirror is MPI-429.** `_MODEL_MIRRORS` still ships EMPTY and that mechanism has
      still never executed — by design. The second origin is an approval-gated Cloudflare
      change, and whether a same-provider mirror survives this user's DPI is still unknown
      (he proved a plain DNS switch was not enough; his stream died at ~20%, not at
      handshake). All of that, plus the off-Cloudflare fallbacks, moved to
      `tasks/MPI-429/brief.md`. The whole point of round 2 is that the app-side fix
      unblocks him WITHOUT it, so it no longer holds this card open.

## Round 2 — why he still could not GENERATE (2026-08-02, master `0a1d2325`)

Everything above makes the failure readable. It does not install his nodes. Root cause of
that, found and fixed this session:

- [x] **The UW dep set spans two hosts and was installed all-or-nothing.** Every
      `type:'custom_nodes'` dep is a github.com zip; every `engineAsset` weight is on
      `models.cubric.studio`. `startUniversalWorkflowInstall` rejected as soon as any dep
      failed, and the reject sat ABOVE the custom-node extract/pip/`.mpi_node_commit`
      step — so his blocked model host discarded a full set of nodes that had downloaded
      perfectly from GitHub. The drift check reads "no folder" as missing, so boot re-ran
      the same repair and discarded them again, every launch. Net effect: an engine that
      could never install one node, and generation dying on unknown `class_type`
      regardless of which weights were present.
- [x] **Fixed by deferring the throw.** The wait resolves with the failure, the nodes
      that landed are installed, then it throws. The error carries the `modelJob` because
      both engine-provision callers catch it and would otherwise leave `uwModelJob` null
      and skip `finishCustomNodeInstall` — the same lost-nodes bug one layer up. Both
      platforms swept (`_provisionWindowsEngine`, `_provisionUvEngine`).
- [x] **That failure also locked him out of the app.** `/engine/repair-deps` runs behind
      the boot gate, which releases on `engine:ready` and NOT on `engine:error`, and the
      error phase's only control was Retry — which failed identically every time. Repair
      now separates an outstanding NODE from an outstanding WEIGHT (nodes present →
      `engine:complete`, ComfyUI can run, let him in); a genuine node failure keeps the
      error and now carries a "Continue without them" escape on the new
      `engine:gate-release` event. Deliberately NOT `engine:install-skipped` — that means
      "I will use RunPod instead" and `MpiRunpodSettings` follows it.
- [x] **Corrected the shipped remedy copy.** It led with "set your DNS to 1.1.1.1" — the
      advice this very user tested and disproved. Now leads with a VPN for the whole
      download and says plainly that DNS alone is often not enough.

### VERIFIED LIVE — not by code reading

An isolated harness ran the REAL `startUniversalWorkflowInstall` against a throwaway
`CUBRIC_ENGINE_ROOT`, with one reachable github.com node and one weight on an
unreachable host (`.invalid`, RFC 2606) — the reporting user's exact split, with his real
engine untouched.

| | node folder | `.mpi_node_commit` | leftover zip |
|---|---|---|---|
| pre-fix (`7a6fdfe8`) | **NO — discarded** | **MISSING** | **yes** |
| post-fix (`f50f8629`) | YES (36 entries) | pinned SHA `69a43336` | no |

The pre-fix row is the on-disk fingerprint to expect on his machine: node **zips** present
in `custom_nodes/` with no matching folders. 305/305 suites on master, 301/301 on the
1.3.1 branch, eslint clean, `release:check` passes, notes re-approved.

Note: `ComfyUI-MpiNodes` in the local dev engine is a **symlink** to
`C:\AI\Mpi\ComfyUi-MpiNodes`. Never delete that folder to force a repair — it would
destroy the live node source repo. The harness above exists precisely to avoid it.

### Split off — done

The mirror was the only thing left here, and it is infra rather than an app bug. It became
**MPI-429** on 2026-08-02 and this card closed on the v1.3.1 release.
