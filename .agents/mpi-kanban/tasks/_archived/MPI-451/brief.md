# MPI-451 Brief - licence gate for gated model downloads

## Why this exists

Some model licences oblige US to bind the END USER before they receive the weights.

**MiniMax H3** is the forcing case. Our authorization is granted "subject to and conditioned
upon continued compliance" with the commitments we made, one of which is:

> If we provide any product, service, or hosted service incorporating [the Works], we will
> bind each recipient or user to terms at least as protective as the relevant restrictions
> and notify them that such restrictions apply.

**Flux** is the next known consumer - the non-commercial licence on the dev weights carries
its own user-facing terms. Anything with a bespoke licence lands here too.

Licence request/authorization detail is held OUTSIDE this repo (public repo + a
confidentiality undertaking): `C:/AI/Mpi/_private/minimax-h3-licence/`. Do not copy it in.

## What is missing today

A Model Library tile calls straight into `routes/downloadManager.js`. There is no acceptance
step anywhere in that path and no per-model licence record.

## Suggested first step — one email that may delete a step from this card

Before building the gate, send the licensor the design-confirmation question: **does our
authorization already extend to end users in the excluded territories, or should each hold
their own?**

- If **each user needs their own** — build the referral step as described below.
- If **ours already covers them** — the referral comes out entirely and the gate is just a
  terms-acceptance dialog. Roughly half the UX of this card disappears.

Either answer is cheap to implement; the point is not to build the harder one and then learn
it was unnecessary. A draft is ready — **kept out of this repo** because it is licence
correspondence: `C:/AI/Mpi/_private/minimax-h3-licence/` (last section supersedes the
earlier one). Not a blocker: if no reply comes, build the referral version, which is correct
under either answer.

## Design intent

- A **licence descriptor on the ModelDef**. Absent = today's behaviour, untouched. Present =
  gated. Carries the terms (or a link), the restrictions summary, and optionally an
  authorization URL.
- A gate in front of install **for gated models only**: show terms -> explicit accept ->
  persist -> allow download.
- **Territory-restricted licences route to the remedy, they do not disclaim.** For H3 the
  correct copy is roughly:

  > This model is licensed by MiniMax and is not open-weight in the EU, UK, US or South Korea.
  > If you are in one of those regions, request your own authorization: <licensor form URL>
  > [ ] I have authorization, or I am outside those regions
  > [ ] I accept the Use Restrictions and Acceptable Use Policy

  A bare "if you are in these countries it is your responsibility" notice is explicitly NOT
  what we ship. It transfers blame without transferring rights, and it reads as knowingly
  routing users into unlicensed use - which cuts against our own grant.
- A reachable misuse-reporting route. The existing Discord link plausibly satisfies
  "reasonably accessible mechanism for reporting suspected violations".

Read `docs/model-library.md` and `.claude/rules/downloads.md` before designing. Keep
non-gated models untouched - a modal in front of every install would be a regression.

## Also required for an H3 release (small, same area)

- Ship the model's licence text and make it reachable from the app.
- A `NOTICE` file carrying the licensor's exact required string.
- Attribution on the product surface where the licence asks for it.

## Related

- MPI-449 - H3 bench research, the card that surfaced this
- MPI-452 - H3 model wiring, BLOCKED by this card
