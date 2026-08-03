# MPI-429 — validation

All four phases verified 2026-08-03. Commits: `94b13361` (the failover defect),
`8d101a18` (phase 2 upload), `e766b123` (phases 3-4), `e642ba21` (the last single-route
dep + the `origin` rule).

## What was proven, and how

| Claim | Evidence | Verdict |
| --- | --- | --- |
| The 31 re-hosted weights are on HF and are OUR bytes | every dep path re-read off the hub tree; 31/31 LFS oids equal the recorded `sha256` | PASS |
| The largest upload is byte-identical to R2 | `curl -I` the resolve URL: 302 -> 200, `X-Linked-Size: 13148974712` = the R2 object, `X-Linked-ETag` = the dep sha256 | PASS |
| Shipped v1.0.1 still works | the 9 flat root files re-listed after the upload — all present, none moved | PASS |
| EVERY R2 dep has a working second route | all 97 mirrors HEAD-checked live, `X-Linked-ETag` == recorded sha256 | PASS 97/97 |
| A blocked download actually completes | dep pointed at a dead origin -> ENOTFOUND -> failed over to huggingface.co -> 21,344,827 bytes -> SHA256 verify passed. **Shipped default, no env override** | PASS |
| The Pod path cannot regress | `_mirrorUrlsFor` / `mirrorUrl` appear nowhere outside `downloadManager.js` + the dep data; the wrapper has no mirror path | PASS |
| Nothing else broke | `node --test "tests/*.test.cjs"` | 318/318 |

Scripts, all in the session scratchpad: `sweep6.mjs` (classification, persisted as
`rehost.json` / `located.json` on this card), `push.py` (the upload, also on this card),
`gen-mirrors.mjs` (the 65 per-dep entries), `verify-mirrors.mjs` (the 97-dep live check),
`prove-failover.cjs` (the end-to-end run).

## Regressions the validation itself caught

Not one of these was predicted by the plan; each would have shipped silently.

1. **`_mirrorUrlsFor` was fed the MUTATED `depJob.url`.** A mirror pathname already carries
   the previous base's prefix, so hop two double-prefixed it and the multi-mirror walk
   broke outright. Caught by the pre-existing MPI-427 test — which is the whole argument
   for having written that test before the mirror existed.
2. **A failing mirror COST the blocked user his diagnosis.** R2 fails transport (remedy:
   tunnel), the mirror answers 404 (not transport), and the second failure overwrote the
   message with "status code 404" and cleared `networkBlocked`. The failover made the
   error worse than no failover.
3. **The engine archive and node zips share `FileDownloader`** and come from github.com;
   the rewrite would have handed them an HF URL that 404s.

## Limit — state it, do not bury it

**Unproven against the original reporter's transfer-stage DPI.** He is unreachable. This
defeats FQDN-, domain- and provider-keyed blocking, which is a different claim from
defeating deep-packet interference that kills a stream at ~20%. If he ever resurfaces,
that is the one open question.

`MPI-430` (CivitAI redistribution) remains a separate card and is NOT closed by this.
