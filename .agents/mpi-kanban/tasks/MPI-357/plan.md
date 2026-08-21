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

## Current State

Card moved `todo → doing` 2026-08-21, claim written, plan written. **No code yet.**
The design above is settled and grounded in a live probe of the Hugging Face API taken
the same day; nothing in it is assumed. Next session implements, starting at
`licences.js`.

Fabio, 2026-08-21, two directions that bound this card:

- **Do not wire the Klein 9B ModelDef.** The other session is bench-testing **4B**, not
  9B. A 9B bench pass may happen later; until it does, this card ships the gate alone.
- **Settle the gate.** That is the deliverable — the mechanism, proven end to end, with
  9B as the descriptor it is written against rather than a model we install.
