# MPI-617 Validation

## Closed REJECTED 2026-08-25 — the grouping dissolved, it was not completed

Fabio: *"The umbrella can fuck off, and we can close 617."*

`rejected`, not `complete`, and the distinction is load-bearing: **phase 3 never ran.**
Marking an umbrella complete while one of its three members is still open would put a false
claim on the board — exactly the kind a later reader trusts.

## Where the three members actually landed

| member | outcome |
|---|---|
| **MPI-613** — cogwheel on the run stage | **DONE.** Shipped in `29f4f017`, placement approved by Fabio. |
| **MPI-614** — a cross-tier LoRA binds nothing | **REJECTED, not built.** Superseded by MPI-619; the residual case is user error. |
| **MPI-612** — GC the pre-rename Klein weights | **STILL OPEN, in `todo`, release-gated.** Untouched by this closure. |

Plus one card the umbrella did not start with and which turned out to be the real fix:
**MPI-619** renamed the Klein cards, which is what removed the condition behind MPI-614.

## Nothing is lost by closing this

MPI-612 is a complete, self-contained card: its own `brief.md` carries all 15 R2 keys, the 7
HF files, the `--s3-no-check-bucket` trap, the write-token trap, the MPI-310 warning against
widening the orphan sweep, and its own verify steps. It never needed the umbrella to be
actionable, and it does not need it now.

**The gate that still applies to MPI-612**, repeated here so closing this card cannot lose it:

> Do not start before the release carrying MPI-609 is two-three releases old. As of
> 2026-08-25 it has shipped in **zero** releases —
> `git merge-base --is-ancestor 2e263c2f v1.4.2` says NO, and v1.4.2 was stamped 2026-08-15,
> 280+ commits back. Deleting early 404s a style-LoRA install for every live user.

## What the umbrella was actually worth

It did not organise the work — two of its three phases resolved by other means. What it did
buy was the investigation that reframed the cluster: tracing MPI-614's evidence found that
both Klein cards were named "FLUX.2 Klein" and separated only by an L/B tier badge, which is
what made a 9B LoRA a reasonable pick for a 4B run. That produced MPI-619, a two-string fix
that removed the cause instead of detecting the symptom.

Worth remembering the shape: the umbrella's own plan proposed a model-card refactor for
MPI-614 and was wrong. The cheap fix came from Fabio asking why the two models shared a name.
