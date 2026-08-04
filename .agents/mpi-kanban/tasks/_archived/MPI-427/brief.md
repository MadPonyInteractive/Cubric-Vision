# MPI-427 — A blocked model host must be a readable error, not an error loop

## The report

User "micha", Windows 11, v1.3.0 portable on `D:`, RTX 3070 Ti. "Error after error,
can't install the app." Log supplied as `user-data/logs/app.log` (238 KB, 1347 lines,
covering 2026-08-01T17:48Z → 2026-08-02T13:16Z).

## What the log actually proves

The install is **fine**. The portable roots all resolved onto `D:` correctly:

```
[main] portable roots: {"portable":"D:/CubricVision-windows-x64-v1.3.0", "engine":".../engine",
                        "models":".../models", "resources":".../resources"}
```

The ComfyUI engine archive (~1.7 GB) downloaded, extracted, and every pip install ran
against the embedded Python on `D:`. All six universal custom-node zips downloaded and
extracted. D: is NOT the bug and neither is the portable layout.

The split is absolute, and it is by HOST:

| Host | References | Outcome |
| --- | --- | --- |
| `github.com` | 45 | every download succeeded |
| `models.cubric.studio` | 44 | **zero** succeeded, 100% failure |

Every single R2 download dies in 85-160 ms with:

```
[ERROR] [system] Unhandled promise rejection (server stays up): Error: write EPROTO
  108544:error:100000f7:SSL routines:OPENSSL_internal:WRONG_VERSION_NUMBER:
  ..\..\third_party\boringssl\src\ssl\tls_record.cc:127:
    at WriteWrap.onWriteComplete [as oncomplete] (node:internal/stream_base_commons:87:19)
```

`WRONG_VERSION_NUMBER` = we sent a TLS ClientHello and the peer answered with something
that is not a TLS record. Sub-200ms means it never left his network. The origin is
healthy — probed 2026-08-02 from a UK machine:
`HTTP/1.1 200 OK, Content-Length: 364855188, Server: cloudflare, CF-RAY: ...-LHR`.

So: a DNS hijack / filtering resolver / SNI-intercepting middlebox on the user's side,
resolving or intercepting that one hostname and answering port 443 with non-TLS bytes.
Note that AV HTTPS-scanning is a poor fit — that MITMs every host and yields cert errors
(`SELF_SIGNED_CERT_IN_CHAIN`), not `WRONG_VERSION_NUMBER` on one host while GitHub is clean.

Plausible triggers: `cubric.studio` is a young domain (many filters block uncategorised
domains), and the payload names include `lustify-v10-krea-raw-int8_convrot.safetensors`.

## Why the user experienced it as "error after error"

Three defects turn one recoverable network condition into an unrecoverable loop.

### 1. The error is unreadable and names nothing (root cause of the report)

`routes/downloadManager.js` line ~660 forwards `err.message` verbatim to
`download:failed`. The user sees raw BoringSSL internals with no hostname, no cause and
no next step. Nothing in the app says "your network is refusing models.cubric.studio".
The same failure also escapes as an **unhandled promise rejection** — the throw happens
on a socket write inside node-downloader-helper, outside the `error` event our handler
binds — so the log fills with `[ERROR] [system] Unhandled promise rejection` noise that
reads like an app crash rather than a network refusal.

### 2. Retry is structurally broken — the store rejects the requeue

`routes/install/installStore.js` line ~70 makes `FAILED` terminal with an empty
allowed-set, but `routes/downloadManager.js` line ~1229 deliberately resets a terminal
dep back to `queued` on retry. The store rejects it:

```
[WARN] [installStore] Illegal transition krea2-raw-transformer-nsfw: failed -> queued (local reset requeue) - rejected
[INFO] [download]     Starting download for krea2-raw-transformer-nsfw from https://models.cubric.studio/...
```

The maps requeue and the download really runs, but the store — which is the READ path
feeding the status endpoint and the UI snapshot — stays `failed` forever. **Even on a
healthy network the UI would keep reporting failure after any one dep fails once.** This
is engine-independent and hits every user who ever has a transient download failure.

### 3. `app.getPath('documents')` throwing kills the whole app at boot

The user's first two launches hard-exited before the window ever appeared:

```
[FATAL] [main] uncaughtException: Error: Failed to get 'documents' path
    at startServer (main.js:637:29)
```

`main.js:637` calls `app.getPath('documents')` unguarded; an Electron known-folder lookup
that throws (redirected/OneDrive-managed/not-yet-ready Documents) takes down the process
via the MPI-369 fatal handler and shows an error box. `routes/shared.js:63` and `:81`
ALREADY guard on `if (process.env.APP_DOCUMENTS)` and have a fallback, so main can catch
and pass an empty string and the server copes. Third launch succeeded unaided, so it is
intermittent — which is exactly the shape that reads to a user as "it just keeps failing".

## Scope for 1.3.1

Third digit = bug fixes (`.claude/rules/versioning.md`). All three above qualify.

1. Classify download transport failures on the model host and surface a plain-language,
   actionable message naming the host and the likely cause (DNS / network filter / security
   software), with the DNS-change remedy. Catch the unhandled rejection path so the raw
   BoringSSL string never reaches a toast or the log as an app-level error.
2. Make `failed -> queued` a legal dep transition for an explicit retry (and `failed ->`
   for models), or give the store a dedicated `requeue()` that clears the terminal. Sweep
   BOTH the dep and model tables and every `_setDepStatus`/`transitionDep` caller — this is
   a shared primitive, a one-caller fix is a false done.
3. Guard `app.getPath('documents')` in `main.js` `startServer()`; fall through to the
   existing `routes/shared.js` fallback instead of exiting.

Non-issues found in the same log, deliberately NOT in scope — do not "fix" them:

- `MODULE_TYPELESS_PACKAGE_JSON` — Node noise, logged at ERROR only because the child's raw
  stderr is relayed under `[server]`. Cosmetic.
- `cupy-wheel` build failure (`ModuleNotFoundError: No module named 'pkg_resources'`) — an
  OPTIONAL CUDA extra inside ComfyUI-Frame-Interpolation's own installer; the custom command
  still reported success and the node installed.
- `Server process exited with code 1073807364` = `0x40010004` DBG_TERMINATE_PROCESS — the
  user closed the app or rebooted mid-pip on Aug 1. Not a crash.

## CONFIRMED ISP interception — a tunnel fixes it (user-verified 2026-08-02)

The user tried the Cloudflare WARP client himself and reported, in order:

> "that would be perfect and yeah my internet provider is a pain in the ass"
> "i can try cloud faire on clinet for dns and stuff"
> "oh wow im cloudfaire wont even work"   ← first attempt
> **"btw cloudflaire worked but i will turn it off after and help u trouble shoot if u want"**

**With WARP on, the downloads work.** That is the decisive datapoint and it settles the
diagnosis: his ISP is tampering with the DIRECT path to `models.cubric.studio`, and
tunnelling around it succeeds. It is NOT a Cloudflare-wide block — `models.cubric.studio`
is a Cloudflare custom domain (`104.21.20.96`, `Server: cloudflare`, `CF-RAY: ...-LHR`,
verified 2026-08-02) and it downloads fine once the ISP is bypassed.

A midway reading of this thread — that Cloudflare itself was blocked, from the
"wont even work" line alone — was WRONG and briefly went out to the user as advice. It
was retracted. Do not re-derive it: read the whole exchange, the later line reverses it.

**So the cheap mirror is back on the table.** If the interception is keyed to the hostname
(SNI or DNS), a SECOND public hostname on the same `cubric-models` bucket dodges it, and
costs nothing: R2 egress is free, one bucket means no duplicate storage, and custom domains
carry no per-domain charge. That is the first thing to try.

### DNS alone is NOT enough — disproven by the user, 2026-08-02

He ran the exact test: WARP off, DNS set to Google `8.8.8.8`/`8.8.4.4`, app restarted.

> "yes it was working with cloudflare i turned it off closed the app typed in ur settings
> u gave me then opend the app it worked for a bit then threw that erorr and loss the %
> it went up to"
> "it got 20% with cloud fair off — Failed to download plugin:image-describer: Download
> stalled — no data received. Failed to download Krea 2 NSFW: write EPROTO ...
> WRONG_VERSION_NUMBER ..."

Two things this rules out and one it reveals:

- **A DNS switch is not a workable remedy.** Do not ship it as the advice.
- **It is not a clean SNI block at handshake either** — that is what the ORIGINAL log
  showed (every attempt dead under 200 ms). Here it reached ~20% and then died, and one
  dep died as `Download stalled — no data received` (the MPI-120 30s socket timeout).
- So the ISP is interfering with the **sustained data stream** — DPI/traffic management on
  large transfers — not merely resolving or refusing the address. Only a tunnel defeats it.

That weakens, but does not kill, the cheap same-provider mirror: a different hostname may
still dodge SNI-keyed DPI, and it costs nothing to try. But it can no longer be assumed to
work, so the honest fallback ladder is: try a second `cubric.studio` hostname first (free,
one DNS record), and if DPI follows it, move to an off-Cloudflare host — GitHub Releases
(proven to reach this exact user in this exact log; 2 GB per-asset cap forces splitting the
big transformers), Hugging Face, or Backblaze B2.

Current user workaround, confirmed working: **Cloudflare WARP on for the whole download.**

App side, wherever the mirror lands: failover is a host swap at request time in
`downloadManager` when `_describeTransportError` fires, NOT a second `url` field per dep —
the URLs are hardcoded literals across `js/data/modelConstants/assetDeps.js` and
`dependencies.js` and must not be duplicated 200+ times.

Any Cloudflare-side change remains approval-gated (`c:/AI/Mpi/MadPony-Identity/capabilities/
cloudflare-r2/README.md` § Approval Gates). **Needs Fabio's explicit go, and should be its
own card — it is infra + app, not a 1.3.1 bug fix.**

### What 1.3.1 does and does not do for this user

1.3.1 makes the failure **readable and actionable** — it names the host, says it is a
network condition, and stops nudging a GitHub bug report. It does **not** make his download
succeed. Do not tell the user 1.3.1 fixes him; the mirror is what fixes him.

## Immediate user unblock

GUI-only, no terminal. **Do NOT send Cloudflare DNS** — the first draft of this advice said
`1.1.1.1`/`1.0.0.1` and was pulled before sending once the user reported Cloudflare itself
does not work on his line. Sent instead: Settings → Network & internet → Wi-Fi/Ethernet →
Hardware properties → DNS server assignment → Edit → Manual → IPv4 on → `8.8.8.8` /
`8.8.4.4` (Google) → Save, restart the app, retry.

Fallback probe: phone mobile hotspot, start one download only far enough to see the bar
move (the weights are GB-scale — not a full download over mobile data). Bytes moving =
confirmed ISP-side, and the off-Cloudflare mirror above is the answer.
