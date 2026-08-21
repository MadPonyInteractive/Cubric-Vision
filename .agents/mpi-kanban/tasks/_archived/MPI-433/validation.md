# MPI-433 — validation

Closed 2026-08-10. Every acceptance criterion below was checked by running something,
not by reading the diff back.

## 1. The window is open — the gate that had to pass first

The card's step 1 was never a formality: the whole deferral existed so a paid-early-access
weight was not redistributed one day early. **Fabio checked CivitAI 573152 himself and
confirmed coyotte has opened LUSTIFY V10 to the public**, and noted the release ships on
the 11th regardless. Agent-side confirmation was impossible (CivitAI region-blocks the UK,
`WebFetch` can never reach it) so the human check IS the evidence here.

Date independently grounded, because the VPN skews this machine's clock: `gh api rate_limit`
returned `Mon, 10 Aug 2026 04:18:22 GMT` and `date -u` agreed — no skew, no VPN, the gate
date genuinely reached.

## 2. The file is live and the bytes are the right bytes

Uploaded to the SAME object path, which is the entire mechanism —
`vision/models/diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors` — so the
generic prefix rewrite reaches it with no hand-written `mirrorUrl` (which
`docs/download-manager.md` forbids).

Verified by HASH, three independent ways, never by filename:

| Check | Result |
|---|---|
| `CommitOperationAdd.upload_info.sha256` (pre-commit gate) | `f165d4db…` = dep's recorded sha256 |
| `curl -sIL` the resolve URL | `302 Found` → `200 OK`, `X-Linked-Size: 13148974712`, `X-Linked-ETag: "f165d4db…"` |
| HF tree API `lfs.oid` | `f165d4db…`, size `13148974712` |

Source was the local copy at `G:/CubricModels/diffusion_models/…`, byte-count identical to
the dep's `bytes` before the transfer started.

**The upload took 1 second, not the ~70 minutes the 3 MiB/s cap implied — and the reason
is worth carrying forward.** Deleting a file from an HF repo removes the repo's POINTER,
not the LFS object behind it. So `resolve` 404s (which is exactly why `noMirror` was
needed, and what was measured on 2026-08-03) while the bytes sit in HF storage. Re-adding
identical content hits preupload dedup: no transfer, nothing for a bandwidth cap to pace.
Recorded in `docs/download-manager.md`. The cap was armed correctly either way —
`HF_HUB_DISABLE_XET=1` set and `HF_HUB_ENABLE_HF_TRANSFER` unset, per MPI-429, since both
accelerators bypass the file object and silently defeat the throttle.

Note on credentials: the ambient `~/.cache/huggingface/token` is `fabio_get` — fine-grained
and scoped to the **different** account `MadPonyInteractive`, so it cannot write to
`Mad-Pony-Interactive/cubric-studio`. The write token at `C:/Users/Fabio/.secrets/hf.txt`
was loaded explicitly, as the capability contract requires.

## 3. `noMirror` is gone and the mirror actually derives

Not just "the flag was deleted" — the rewrite was run against the live dep:

```
noMirror = undefined
mirrors  = ["https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/
             vision/models/diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors"]
```

That derived string is character-identical to the URL proven `302 → 200` above.
`npx eslint js/data/modelConstants/modelDeps.js` exits 0.

## 4. The counts in the docs are TRUE, not merely rolled back

Counted off the live catalogue rather than trusting the card's expected numbers:

- **generic prefix rewrite = 31** ✔ (the doc's `30 → 31`)
- **`noMirror` = 3, and they are exactly `taesdxl-decoder`, `taef1-decoder`,
  `taef2-decoder`** ✔ — krea2 has left that set, so the model-dep column is `0` (the doc's
  `1 → 0`)
- Catalogue-wide: 124 deps, 104 R2-hosted, 31 generic / 70 explicit `mirrorUrl` / 3
  `noMirror`.

**One number I did not prove: the `66` column.** It is pre-existing, untouched by this
card, and I could not reproduce its scope directly — the doc's "97 model deps" grouping does
not map to a file boundary (`modelDeps` + `loraDeps` = 72). It reconciles arithmetically
(104 R2-hosted − 7 non-model = 97; 70 explicit − 4 non-model = 66) and there is no
`engineAssets` symbol in the code to filter on, so I left it rather than "fix" a number I
had not verified. Flagged, not silently patched.

## 5. Docs and the test no longer cite this dep as the single-route case

- `docs/download-manager.md` — table now 31 / 66 / 0; the "deliberately single-route until
  2026-08-10" paragraph rewritten as RESOLVED with the verification evidence; the
  `noMirror` set in § failover now names only the three TAESD decoders.
- `docs/models/krea2/licences.md` — the R2-ONLY section marked resolved. The reusable
  distinction is kept deliberately: the gate was never the calendar, it was whether the paid
  window had closed. The Acquisition section above it is untouched — it is accurate history.
- `tests/transport-error-message.test.cjs` — the `noMirror` test now cites the TAESD
  decoders (a permanent, by-nature case) instead of this dep. `node --test` on that file:
  **15 passed, 0 failed.**
- `docs/releases/UNRELEASED.md` — "Four files still have a single route" → "Three files",
  and the "one large model whose licence does not allow us to publish a second copy yet"
  clause dropped.

**`.claude/rules/downloads.md` needed NO edit** — the card's acceptance expected a dated
R2-ONLY note there, but the only reference (line 183) is the generic `noMirror` rule, which
is still correct and still has three live users. The card's expectation was wrong, not the
file.

## Co-ownership

`js/data/modelConstants/modelDeps.js` is also on MPI-508's `files.json`, and MPI-508 had
unstaged work in `docs/releases/UNRELEASED.md` (its true-RGB preview bullet). No live peer
session existed (`state/index.json`: `active_sessions: []`, `active_file_claims: []`).
This card's `modelDeps.js` change is one dep block; the UNRELEASED.md hunk was staged with
the filtered-patch recipe from `.claude/rules/git.md` § Co-owned files, leaving MPI-508's
bullet uncommitted in the working tree.
