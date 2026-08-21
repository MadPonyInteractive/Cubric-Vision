# MPI-357 — Licence-verified install: plan

Moved `todo → doing` 2026-08-21. Umbrella: [MPI-528](../MPI-528/plan.md).
Read [`brief.md`](brief.md) first — it carries the FLUX NCL v2.1 reading and the
user's 5-step spec, both still correct. This plan adds only what was measured today.

## What is already shipped (MPI-451) — do not rebuild it

| Piece | Where |
|---|---|
| Descriptor map + `getModelLicence` / `hasAcceptedLicence` / `recordLicenceAcceptance` | `js/data/modelConstants/licences.js` |
| Consent dialog + `showLicenceGate(licence) → Promise<boolean>` | `js/components/Compounds/MpiLicenceGate/` |
| Receipts (survive restart, keyed by LICENCE id) | `js/core/storage.js` `getLicenceReceipts` / `setLicenceReceipts` |
| Install gate | `js/services/downloadService.js` `start()` |
| Licence shown in the detail drawer | `MpiModelManager.js:928` |
| Bundled licence-copy precedent | `licences/minimax-h3/{LICENSE.txt,NOTICE.txt}` |

Wired today for two ids, both MiniMax H3. What is MISSING is only the PROOF step.

## The measurement that changes the design

Acceptance criterion 4 on the card says *"authenticated probe of the gated repo
returns 200 vs 403"*. Measured against the live API, **2026-08-21, unauthenticated**:

| Request | Result |
|---|---|
| `GET /api/models/black-forest-labs/FLUX.2-klein-9B` | **200** — public metadata, `gated: "auto"` |
| `GET /black-forest-labs/FLUX.2-klein-9B/resolve/main/LICENSE.md` | **200**, `text/plain`, 18,158 bytes |
| `GET /black-forest-labs/FLUX.2-klein-9B/resolve/main/flux-2-klein-9b.safetensors` | **401**, `X-Error-Code: GatedRepo` |
| control: `.../FLUX.2-klein-4B/resolve/main/LICENSE.md` (ungated) | 200 |

**Probing "the repo", or its LICENSE, passes for everybody.** Hugging Face serves
licence text unauthenticated on purpose — you must be able to read terms before
accepting them. A probe built to the criterion as written would return 200 for a user
who never accepted anything, and the gate would be decorative.

The probe must target **a real weight file** and read the `X-Error-Code` header, not
the body. Rewrite that criterion when the card closes.

Free side-benefit: the 18,158-byte `LICENSE.md` is fetchable with no token, so the §3
"provide a copy" obligation is satisfied by bundling it exactly as MiniMax H3 was.

## Design

Descriptor gains one optional block; everything else follows from it.

```js
verify: {
    repoId:    'black-forest-labs/FLUX.2-klein-9B',
    probePath: 'flux-2-klein-9b.safetensors',   // a WEIGHT. never LICENSE.md — see above
}
```

1. `licences.js` — typedef + `verify` block + the FLUX.2 Klein 9B descriptor.
2. `MpiLicenceGate` — when `licence.verify` is present, the accept step also asks for an
   HF access token and runs the probe. Resolves `true` only on a passing probe.
3. `routes/licences.js` (new) + one mount line in `server.js` —
   `POST /licences/verify {repoId, probePath, token}` → upstream `HEAD` with
   `Authorization: Bearer` → `{ok, status, errorCode}`. Server-side so the token never
   reaches a renderer log.
4. `licences/flux2-klein-9b/{LICENSE.txt,NOTICE.txt}` — the §3 copy + Attribution Notice.
5. `MpiModelManager.js` — "Licence verification required" badge in place of Install.
6. `docs/model-library.md` — document the new install state.

### `downloadService.js` needs no change

`start()` already routes a gated model through `showLicenceGate` and only calls
`_start` when it resolves `true`. Make the probe a precondition of that `true` and the
install path, the R2 delivery, the Pod path and the receipt all stay exactly as they are.
Claimed anyway in `files.json` in case the badge needs a state read.

### The token is never stored

Card open question — *"Where does the token live?"* Answer: **nowhere.** Probe once,
persist only the receipt (`verified` + timestamp) that already exists. On a later 403 at
download time, ask again. No `safeStorage`, no IPC, no credential at rest, no new
surface to leak — and it matches the card's own instinct that on-403 is "probably right".

## Open question that needs Fabio's HF token to settle

Two failure modes are indistinguishable without a real token in hand:

- valid token, terms NOT accepted → expected **403** `GatedRepo`
- bad or revoked token → expected **401** invalid credentials

Both are handled in code from the start; only the user-facing COPY depends on which is
which. Settle it at test time — it does not block the build.

## Not in scope, deliberately

**This card does not wire the Klein 9B ModelDef.** Another session is bench-testing **4B**
as an edit model (Fabio, 2026-08-21); a 9B bench pass may follow but has not started. The
longer-term product intent is a Flow offering 4B or 9B as a user choice, traded on speed
vs licence — that comes later. `models.js` and `modelDeps.js` are therefore left out of
`files.json` — this card delivers the GATE the 9B entry will need, not the entry.

`js/components/types.js` (the `MpiLicenceGateProps` typedef, line 1830) is held by a live
MPI-454 claim. If the gate's props change, file an `mpi-message` — do not edit it.

## Completed (2026-08-21, session 8aae0c15)

All six design steps shipped. Evidence → [`validation.md`](validation.md).

1. `licences.js` — `verify` block on the typedef, `FLUX2_KLEIN_9B` descriptor,
   `licenceAccessUrl` / `HF_TOKEN_URL`, and the two receipt functions taught the
   difference between consent and proof (`hasAcceptedLicence` demands `verified` for a
   `verify` licence; `recordLicenceAcceptance(id, {verified})`).
2. `routes/licences.js` + one mount line in `server.js` — `POST /licences/verify`.
3. `MpiLicenceGate` — token step + probe, rendered only when `licence.verify` exists;
   resolves `true` only on a passing probe, stays OPEN on a failure.
4. `licences/flux2-klein-9b/{LICENSE.txt,NOTICE.txt}` — the §3.a copy (18,158 bytes,
   byte-identical to the repo) and the §3.b Attribution Notice verbatim.
5. `MpiModelManager` — `Licence required` chip and a `Verify licence` primary button,
   both off `_needsLicenceProof(model)`.
6. `docs/model-library.md` § "Licence required" + the `verify` bullet in
   `docs/download-manager.md` § the licence gate.

Plus `tests/licence-gate.test.cjs` — four new tests, including a live one (skipped on CI)
that re-measures the gate rather than trusting this plan.

## Plan Drift

- **2026-08-21 — the 401/403 split is REAL, and this plan had it right.** A detour worth
  recording, because the wrong conclusion was reached confidently and from real data.
  Measuring with junk tokens only, a gated repo answers **401 `GatedRepo`** to a bad token
  exactly as it does to no token — from which the session concluded the two failures were
  indistinguishable and added a `GET /api/whoami-v2` fallback to separate them. Then
  Fabio's real token was tried: **403**. A valid credential without the grant is a
  different status, which is what this plan assumed from the start. The `whoami` call was
  deleted; the route classifies on status alone. **The lesson is not about Hugging Face:
  every token available was fake, so only one side of the split could ever appear, and
  "measured" felt like proof.**
  Now verified in BOTH directions — junk → 401 → *"That token was rejected"*; real token
  without the grant → 403 → *"Hugging Face has not granted your account access yet"*.
- **2026-08-21 — probe target moved from the weight to `model_index.json`.** Same gate
  (measured 401 `GatedRepo`), but it is not an LFS pointer, so an authorised HEAD answers
  200 directly instead of a 302 into the CDN. `LICENSE.md`/`README.md` remain the trap and
  are now banned by a test.
- **2026-08-21 — no separate sidebar verification button** (card criterion 3). The
  existing Install button relabels to `Verify licence` and runs the same
  `downloadService.start()` chokepoint. A second entry point would be a second gate to
  keep correct, for no user gain.
- **2026-08-21 — `report` is now optional on a descriptor.** The FLUX NCL has no
  misuse-reporting obligation; H3 §V.5 does. The unconditional assert in
  `tests/licence-gate.test.cjs` would otherwise have failed on the new descriptor.

## Current State

**Shipped and verified except one thing, which needs Fabio.** `npm test` 667/668 — the one
failure is `tests/orphan-sweep.test.cjs`, pre-existing on master and in no module this card
touches. Every FAILURE path of the gate is proven live (route harness on a spare port, and
the real dialog driven in an own-profile app instance on :62237). The token is never
stored; a failed probe writes no receipt.

**Next action: a real Hugging Face token from an account BFL has granted.** That is the
only unproven branch — expected `{ok:true, status:200, reason:'granted'}`, receipt with
`verified: true`, install proceeds from R2. Everything else is done.

At close-out: **rewrite acceptance criterion 4** (it describes a probe that passes every
user) and note that criterion 8 is deliberately unmet — the Klein 9B ModelDef is out of
scope by Fabio's direction, so the `Licence required` chip has no model to render on yet.

Fabio, 2026-08-21, two directions that bound this card:

- **Do not wire the Klein 9B ModelDef.** The other session is bench-testing **4B**, not
  9B. A 9B bench pass may happen later; until it does, this card ships the gate alone.
- **Settle the gate.** That is the deliverable — the mechanism, proven end to end, with
  9B as the descriptor it is written against rather than a model we install.
