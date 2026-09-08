# MPI-357 — checklist

Derived from [`plan.md`](plan.md) § Design. Evidence for every ticked item →
[`validation.md`](validation.md).

- [x] `licences.js` — `verify: {repoId, probePath}` on the `LicenceDescriptor` typedef,
      with the measured reason `LICENSE.md` may never be the target
- [x] `licences.js` — the FLUX.2 Klein 9B descriptor beside `MINIMAX_H3`, keyed `klein-9b`
- [x] `licences.js` — `hasAcceptedLicence` demands `verified` for a `verify` licence;
      `recordLicenceAcceptance(id, {verified})` writes it, and never the token
- [x] `routes/licences.js` — `POST /licences/verify` → upstream HEAD with Bearer,
      `{ok, status, errorCode, reason}`; token never logged
- [x] `server.js` — one mount line
- [x] `MpiLicenceGate` — token step + probe, shown only when `licence.verify` exists;
      resolves `true` only on a passing probe, stays open and explains on a failure
- [x] `licences/flux2-klein-9b/LICENSE.txt` — the §3.a copy, 18,158 bytes
- [x] `licences/flux2-klein-9b/NOTICE.txt` — the §3.b Attribution Notice verbatim
- [x] `MpiModelManager` — `Licence required` chip in place of `Install`, and a
      `Verify licence` primary button in the detail drawer
- [x] `docs/model-library.md` + `docs/download-manager.md` — the new install state and the
      descriptor contract
- [x] `tests/licence-gate.test.cjs` — verify-receipt semantics, probe-target ban, and a
      live gate re-measurement (skipped on CI)
- [x] **A passing probe with a real granted HF token** — Fabio accepted on
      Mad-Pony-Interactive 2026-08-21; 200 granted, receipt `verified: true`, second
      install skips the dialog
- [ ] Rewrite acceptance criterion 4 on the card (it describes a probe that passes every
      user) — at close-out
