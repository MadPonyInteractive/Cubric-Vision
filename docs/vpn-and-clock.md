# VPN, CivitAI and the skewed clock

> Moved out of `CLAUDE.md` 2026-08-28 (token diet). **Read this BEFORE asking for the VPN, and
> before blaming the VPN for a bad timestamp.**

## Why the VPN exists here

CivitAI **region-blocks the UK**, so anything that hits `civitai.com` from this machine — the
SHA256 licence lookups in `docs/models/klein/licences.md`, a community LoRA page, a shared
workflow JSON — needs **Fabio's VPN on: ask, wait, then run**, and tell him when you're done
so he can turn it off.

Agent `WebFetch` / `WebSearch` can never reach CivitAI (Anthropic-side egress, also UK); only
shell tools go through his VPN. The block reads as intermittent — the licence method worked
bare on 2026-07-26 and needed the VPN on 2026-07-27 — so **check for `REGION_BLOCKED` before
concluding an API changed.**

## Cost 1 — the clock, and why it corrupts files

The VPN can skew the system clock, and that is the part that damages records. Measured
2026-07-29 in a sibling repo: `date -u` read `01:30Z` while the true time was `15:29Z` — ~14
hours off, inside one session. While the VPN is on, `date`, the session's "today", file mtimes
and `git commit` timestamps are all untrustworthy.

A 14h skew keeps the same calendar date only by luck — near midnight it flips the **date**,
which is what silently corrupts a card.

- **Ground truth is `gh api rate_limit -i` → the `Date:` header** — GitHub's clock, unaffected
  by this machine.
- Derive the offset **once** at the start of a VPN session and apply it to every stamp that
  lands in a file: kanban `created_at` / `updated_at`, event `at`, doc dates, research dates.
  Don't re-derive per write.

### CHECK THE CLOCK BEFORE BLAMING THE VPN

**The reflex this section trains is wrong more often than it is right.** Compare
`gh api rate_limit -i`'s `Date:` against `date -u`. Agree to the second → the clock is FINE
and a bad timestamp has another cause.

The common other cause is an agent **TYPING** an `at` field rather than reading a clock, whose
tell is round `:00` seconds (`.claude/rules/kanban.md` § Timestamps). Ask whether the VPN is
even on before asserting it is: on 2026-08-21 a session blamed an 8h50m gap on skew while the
VPN had been off for three to four days and the clock was accurate to one second.

## Cost 2 — bandwidth

Measured 2026-07-27 (MPI-354): the VPN throttled an R2 upload **~15x** (4.4 MiB/s → ~300
KiB/s). Do the CivitAI half with the VPN on, then have it turned off **before** staging
weights to R2.
