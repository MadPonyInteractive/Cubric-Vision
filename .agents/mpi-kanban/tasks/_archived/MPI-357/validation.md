# MPI-357 — validation

## What was proven, and how

### 1. The probe classifies every branch correctly (route, live)

`routes/licences.js` mounted on a spare port (harness, no app, no port 3000), real requests
to Hugging Face:

| case | HTTP | body |
|---|---|---|
| no token | 400 | `{ok:false, reason:'no-token'}` |
| malformed repo id | 400 | `{ok:false, reason:'bad-request'}` |
| `..` in probePath | 400 | `{ok:false, reason:'bad-request'}` |
| junk token, GATED repo | 200 | `{ok:false, status:401, errorCode:'GatedRepo', reason:'bad-token'}` |
| real token, GATED repo, **no grant** | 200 | `{ok:false, status:403, errorCode:'GatedRepo', reason:'not-granted'}` |
| real token, GATED repo, **granted** | 200 | `{ok:true, status:200, reason:'granted'}` |
| real token, UNGATED repo | 200 | `{ok:true, status:307, reason:'granted'}` |

All four probe branches measured against the live API. The granted case answers **200
directly, not a 302** — which is the payoff for pointing `probePath` at a non-LFS config
file instead of the weight.

Run with Fabio's real token (`C:\Users\Fabio\.secrets\hf.txt`, account
`Mad-Pony-Interactive`) on 2026-08-21. **401 vs 403 is the load-bearing line** and it is
now measured from both sides: a dead credential 401s, a live credential without the grant
403s. See `plan.md` § Plan Drift for the detour where only fake tokens were available and
the split looked like it did not exist.

The log line carries `repoId` and status only — the token is never handed to the logger.

### 2. The dialog runs (real DOM, own app instance on :62237)

Mounted `showLicenceGate(MODEL_LICENCES['klein-9b'])` through a live import; the user's app
on :3000 was untouched and answered 200 after the instance was killed by PID.

- verify block rendered, both links present (`Request access on Hugging Face`,
  `Create a read token`), password field present, 2 acknowledgements, primary button reads
  **Verify and install**.
- After scroll-to-end + both boxes + a junk token: Accept enabled.
- Clicking it: dialog **stayed open**, message
  *"That token was rejected. Check you pasted a current token with read access."*, error
  styling on, button re-enabled for a retry.
- `localStorage.mpi_model_licence_accepted` → **null**. A failed probe writes no receipt.

### 3. Unit pins (`tests/licence-gate.test.cjs`, 10 tests, all green)

- consent alone on a `verify` licence → `hasAcceptedLicence` **false**; with
  `{verified:true}` → **true**.
- H3 (no `verify`) still clears on consent alone — the flag is per-descriptor.
- receipt keys are exactly `acceptedVia | at | verified | version` — no token at rest.
- `probePath` may not be `LICENSE.md` / `README.md` (offline pin).
- live: `model_index.json` answers **401** unauthenticated while `LICENSE.md` answers
  **200** — re-measured by the test itself, skipped on CI.

`npm test`: 667 passed. One unrelated pre-existing failure, see below.

## The card's acceptance criteria, re-read

- **Criterion 4 is WRONG as written** — *"authenticated probe of the gated repo returns 200
  vs 403"*. Measured: the repo metadata endpoint and `LICENSE.md` both return **200 with no
  token at all**, so a probe built to that wording passes every user. It must target a file
  the gate actually covers. **Rewrite before close-out.**
- **Criterion 3 assumed a sidebar button** — shipped as the existing Install button relabelled
  `Verify licence`, because `downloadService.start()` is already the one chokepoint every
  install path funnels through. A second entry point would have been a second gate to keep
  correct.
- **Criterion 8 (first consumer wired end-to-end) is deliberately NOT met.** Fabio,
  2026-08-21: the Klein 9B ModelDef is out of scope; this card ships the gate. Consequence:
  the `Licence required` tile chip has no model to render on yet, so it is verified by
  reading `_needsLicenceProof`, not by eye.

### 4. The whole chain, through `downloadService` (real DOM + real token + real grant)

Fabio accepted the FLUX licence on `Mad-Pony-Interactive` at 17:44Z. Then, in an
own-profile app instance on :54815 — **calling `downloadService.start('klein-9b', [])`
itself**, not a re-implementation of it:

- gate opened, primary button `Verify and install`, `localStorage` receipt **null**
- real token entered into the password field (never echoed to a shell or a log)
- click → probe → **dialog closed on its own**, i.e. `showLicenceGate` resolved `true`
- receipt written, keyed by LICENCE id, not model id:
  `flux-non-commercial-v2.1 → {version:1, at:'2026-08-21T17:45:27.225Z',
  acceptedVia:'klein-9b', verified:true}`
- **no token at rest** — every `localStorage` value scanned for an `hf_…` pattern, none
  found; the whole store is 115 bytes
- calling `start('klein-9b', [])` a second time: `hasAcceptedLicence` true, **no dialog** —
  the receipt is honoured

That closes the last branch. Nothing in this card is now unproven.

## Not this card — pre-existing failure

`tests/orphan-sweep.test.cjs` → *collects a dep no installed model wants* fails on master,
alone and in the suite. It imports `downloadManager.js`, `dependencies.js`, `models.js`,
`resolveModelDeps.js`, `shared.js` — none of which this card touches. Reported, not chased.
