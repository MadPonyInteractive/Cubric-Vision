# MPI-616 Checklist

## Measure first

The original plan here wanted a clean-install Windows 11 box with SAC enforced.
It turned out not to be needed — a signature census answers the go/no-go with no
SAC machine and no system changes. Superseded steps kept struck through so the
reasoning survives.

- [x] Census both trees with `Get-AuthenticodeSignature` — app 18/19 unsigned,
      engine 563/638 unsigned (2026-08-24, `validation.md`)
- [x] Establish which binaries can and cannot be signed by us
- [x] Decide without renting or borrowing a SAC box
- [ ] ~~Find/build a Windows 11 box with SAC enforced — clean install~~ — not required to decide
- [ ] ~~Download `CubricVision.exe` through a browser so it carries MOTW~~ — belongs to post-signing confirmation, not the decision

## Fix the release wording regardless of the outcome

- [x] `docs/releases/github-release-checklist.md`: hard-block branch added — no prompt, no "Run anyway", app never opens (§ "The third outcome")
- [x] Note that MOTW removal does **not** help against SAC
- [x] Note that SAC has no per-app allowlist
- [x] Correct the implication that one clean measurement generalises
- [x] Give release authors the CodeIntegrity query (3033/3076/3077/3118)

## Signing — gated on eligibility, not on further measurement

- [ ] **Confirm MadPony Interactive's registration status** — sole trader vs limited
      company. Public Trust **Individual** validation is US/Canada only, so the UK
      route is **Organization / DBA**. Needs: legal/trading name matching public
      records, a business identifier (a UK VAT number qualifies), a website on a
      domain the entity owns, and **two contact emails on that same domain**.
- [ ] Price it properly: $9.99/mo Basic (5,000 signatures/mo — 19 per release is
      nothing) plus Azure subscription, Entra tenant, app registration with an
      annually-rotated client secret, identity validation renewal every 2 years
- [ ] Decide with Fabio
- [ ] Wire the signing pass into `scripts/build-portable.mjs` — **after** the
      `electron.exe` → `CubricVision.exe` rename. `win.azureSignOptions` in
      `electron-builder.yml` is inert; electron-builder does not build the shipped
      artifact.
- [ ] RBAC trap: assign **Artifact Signing Certificate Profile Signer** to the
      **app registration**, not to the user account
- [ ] Re-run the census on a signed build — every app binary must read `Valid`
- [ ] Confirm on an SAC-enforced box, reading CodeIntegrity rather than trusting
      the absence of a dialog
- [ ] Only then drop the unsigned warning from the release notes

## Explicitly rejected

- [x] **A `.bat`/`.cmd` launcher is not an escape.** SAC hard-blocks scripts with no
      override (MPI-387 D — it is what broke clean Windows 11 installs, removed in
      1.3.0), and `.bat` cannot carry an Authenticode signature at all, so it has no
      path off the reputation lottery, ever. ComfyUI's `.bat` survives on enormous
      byte-identical download reputation that a per-release rebuild can never earn.
