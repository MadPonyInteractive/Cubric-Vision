# MPI-120 Brief — Offline detection + user-facing popup

## Goal

When the user has no internet, the two network-dependent flows should detect it
and show a clear **"you're offline"** popup, instead of hanging, failing silently,
or throwing a confusing error:

1. **Model / engine downloads** (HuggingFace, GitHub release assets, node zips)
2. **RunPod connect** (remote engine activation — REST API to RunPod)

## Origin

Surfaced 2026-06-20 during MPI-118 engine-bump testing — the user's internet
dropped for ~20 min and it prompted the question: "do we accommodate offline at
all?" Not yet investigated; behavior today is unknown (may hang, may error
cryptically). Carded rather than mixed into the bump.

## First step — INVESTIGATE current behavior (do not assume)

Before designing the popup, find out what actually happens TODAY when offline:

- **Downloads:** `ResumableDownloader` / NDH (`routes/downloadManager.js`,
  memory `project_ndh_resumable_downloads`). Does a failed DNS/connect emit a
  usable error event, or hang on retry? Check the retry/timeout config.
- **RunPod:** the REST proxy (`routes/remoteProxy.js`). Does an offline `fetch`
  to the RunPod API reject fast with a clear error, or stall? Note: there's
  already `wrapperFetch` 502/503/504 retry logic (memory
  `project_wrapper_fetch_502_retry`) — distinguish "RunPod proxy transient" from
  "host has no internet at all."
- Is there ANY existing offline/connectivity check in the app? Grep
  `navigator.onLine`, `online`/`offline` events, connectivity, `ENOTFOUND`,
  `getaddrinfo`.

## Design direction (after investigation)

- Detection: `navigator.onLine` is the cheap first gate (renderer) but unreliable
  alone (reports LAN, not real internet). A real check = a lightweight HEAD/ping
  to a known endpoint before starting a download / RunPod connect. Decide which.
- UI: reuse the existing toast/dialog convention — per memory
  `feedback_error_dialog_vs_toast`, "you're offline" is an **expected, actionable**
  state → **toast/warning**, NOT the GitHub-report error dialog. Confirm against
  that rule when implementing.
- Scope both entry points: pre-flight check before (a) starting any download and
  (b) RunPod activation. A mid-download drop is a separate, harder case — decide
  whether to handle now or defer (NDH may already resume on reconnect).

## Out of scope (for now)

- Mid-generation network loss on a live Pod (different failure surface).
- Full offline mode / queuing downloads for later.

## Related memory
- `project_ndh_resumable_downloads` — downloader facts.
- `project_wrapper_fetch_502_retry` — RunPod transient-retry (don't conflate with offline).
- `feedback_error_dialog_vs_toast` — toast vs dialog decision.
- `project_runpod_branch_v110` — RunPod work lands on RunPod branch only.
