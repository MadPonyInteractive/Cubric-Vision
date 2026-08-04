# MPI-344 — Vast.ai as a second remote-engine provider: viability investigation

Investigated 2026-07-23. Four parallel research agents (platform/sentiment, API parity,
networking+storage risk, codebase coupling map) + own verification of the load-bearing claims.
**No code written. No live Vast account created. This is a decision document.**

---

## Verdict

**Viable, and cheaper than feared — but ONLY as an ephemeral-Pod provider, and the whole
thing hinges on one unproven engineering question (how the app discovers the Pod's HTTPS
endpoint).** Two prerequisite refactors are unavoidable first.

The fear going in was that Vast would need an architecture redesign. It does not, because
**we already ship the shape Vast requires** — the MPI-78 "Any region (no volume)" ephemeral
Pod (`remotePodLifecycle.js:554-635`, UI string at `MpiRunpodSettings.js:1021`: *"Ephemeral —
models download per session, no storage bill between sessions"*). Vast maps onto that path,
not onto the volume path.

The premise that triggered this card — users migrating from RunPod — is **UNCONFIRMED**.
See § "Why users might be moving".

---

## 1. What Vast.ai is

Two-sided GPU marketplace (~20k GPUs, 68 GPU types, 40+ locations). Supply is a mix of
solo miners/hobbyists, small colos, and real Tier-3/4 datacenters. Three rental types:
on-demand (fixed price, host cannot reclaim mid-contract), interruptible (bid/spot,
reclaimable), reserved (1/3/6mo prepay). Per-host reliability score, `datacenter` boolean,
and a "verified" tier with ISO 27001 / Tier-3+ requirements.

It is **not** RunPod-with-different-branding. RunPod sells managed pods on infrastructure it
brokers centrally; Vast sells you a specific stranger's machine. Every provider-level
guarantee we rely on (a proxy, a portable volume, a placement filter) is on Vast either
absent, per-host, or something you build yourself inside the container.

---

## 2. PROS

| Pro | Detail |
|---|---|
| **Price** | 15-50% cheaper on like hardware. 4090 ~$0.29-0.50/hr vs RunPod $0.34 community / $0.59 secure; L40S $0.40-0.70 vs $0.79; H100 SXM $0.90-1.87 vs $2.69. *(Figures largely from SEO review sites — indicative, not proven.)* |
| **Supply depth during scarcity** | 2025-26 GPU crunch hit everyone. A marketplace of 20k GPUs across 68 types is a different supply pool from RunPod's. When a card is out of stock on RunPod, our `_startGpuWait` polling loop is all we have. A second provider is a genuine answer to "no stock". |
| **CUDA driver floor is SOLVED** | This was the biggest feared blocker. Vast's offer search has `driver_version: {"gte":"535.00.00"}` and `cuda_max_good: {"gte":13.0}` as first-class filter fields. Direct equivalent to RunPod's `allowedCudaVersions` (MPI-188). Arguably better — it filters on the actual driver, not an enum. |
| **Richer placement filters than RunPod** | `reliability`, `datacenter`, `geolocation`, `inet_down`/`inet_up`, `static_ip`, `direct_port_count`, `dph_total` price ceiling, `cpu_ram`, `disk_space`. Our `minMemoryInGb` RAM floor (MPI-160) and its GraphQL-fallback hack both become plain search fields. |
| **Clean REST API, full parity on lifecycle** | `PUT /asks/{offer_id}/` create, `GET /instances/{id}`, `PUT /instances/{id}/ {state}` stop/resume, `DELETE /instances/{id}/`. Bearer auth. 5 endpoints is the whole surface we need. |
| **Scoped API keys** | 10 permission scopes AND parameter-level restrictions (`eq`/`lte`/`gte` on e.g. instance id). RunPod has no equivalent. This directly mitigates the env-var leak in § Cons. |
| **Arbitrary Docker image + env + onstart** | Docker Hub, GHCR, GCR, nvcr.io. `env` (docker-flag format), `onstart` bash (4048 char cap, gzip+base64 for longer). Our image and our whole R2-floated runtime story work unchanged. |
| **No vendor lock** | Redundancy against RunPod pricing moves, card delistings, or an outage. |
| **~40% of our remote layer needs zero changes** | `remoteProxyForward.js`, `remoteModels.js`, `remotePodState.js`, `remoteHeaders.js`, `remoteProxy.js` = 1,380 of 5,261 lines, provider-agnostic. The wrapper HTTP contract is ours and travels. |

---

## 3. CONS

Ordered by how much they hurt *this* product.

### 3.1 No network volumes — CONFIRMED, and it is permanent-for-now (SEVERE)

Verified against the primary doc, [docs.vast.ai/documentation/instances/storage/types](https://docs.vast.ai/documentation/instances/storage/types):
both storage types are host-local. Volumes are *"Local only: Tied to the physical machine
where created"*, *"Cannot migrate between different physical machines"*, *"Can only attach
to instances on the same host"*. Network volumes were announced "coming soon" in the
Apr-May 2025 product update and are **absent from the storage docs entirely** as of
2026-07-23 — not shipped, not even listed as pending.

Impact: our whole volume design (`docs/runpod-remote-engine.md` §5 — one DC-locked network
volume holds the model library, portable across every card the image runs, *"users never
reinitialize the volume to switch cards"*) **has no Vast equivalent.** A Vast local volume
survives instance-destroy but dies with the host. Host leaves the marketplace → the user's
entire model library is gone with no recovery path and no SLA.

**Consequence: Vast is an EPHEMERAL-ONLY provider.** Which we already support. But it means
Vast can never be the "I keep 100GB of models parked in the cloud" option — it is the
"spin up, download what this job needs, generate, tear down" option. That is a different
product promise and the UI must say so plainly, not bury it.

### 3.2 Bandwidth is billed per byte, host-variable, rate not published (SEVERE, UNVERIFIED)

RunPod has no egress fees. Vast bills per byte up AND down at a host-set rate. Ephemeral
mode means re-downloading model weights **every session** — our weights run 10-40GB per
model wave (LTX transformer alone is 41GB). If bandwidth is meaningfully priced this
silently eats the entire GPU-hour saving and users find out on their invoice.

**This is the sharpest unknown in the whole study and it is cheap to settle:** create one
Vast instance, download 20GB, read the invoice line. Do that before writing any code.

### 3.3 Host operator can read container env on unverified hosts (SEVERE, mitigable)

Vast's own security FAQ concedes host operators have Docker daemon access and advises
against storing credentials inside instances. We currently inject `RUNPOD_API_KEY` into Pod
env (`remotePodLifecycle.js:579`) so the wrapper's idle watchdog can self-stop
(`wrapper.py` → `rest.runpod.io/v1/pods/{id}/stop`). Ported naively, that hands a
stranger's box the user's **Vast API key** → their credits, their instances.

Also relevant: the [symlink exploit](https://theodoreehrenborg.substack.com/p/symlink-exploit-in-vastai)
(found Mar 2025, fully patched Jul 2025) — a client-reads-host escape, promptly fixed, but
it establishes that container isolation on the platform is not assumed-perfect.

Mitigation exists and is good: mint a **parameter-restricted** API key scoped to
`instance_write` on that one instance id, inject only that. Vast supports this natively;
RunPod does not. Alternatively drop the in-Pod watchdog for Vast and rely on app teardown
+ a `--duration`-style contract expiry.

Also: our proprietary image itself is readable by the host operator. Filter to
`datacenter: true` + verified if that matters commercially.

### 3.4 The endpoint-discovery problem (MODERATE — but it is the main engineering risk)

RunPod hands us `https://<podId>-<port>.proxy.runpod.net`: always-on, valid cert,
NAT-traversing, WSS-capable, zero setup, and a **pure function of podId** — which is why
`proxyUrl()` is one line at `routes/remoteEngine.js:91` and everything downstream is simple.

Vast has no such thing. Three options, none free:

- **(a) Cloudflare Quick Tunnel** — what Vast's own templates do. `cloudflared` inside the
  container produces `https://<random-words>.trycloudflare.com` with a **valid Cloudflare CA
  cert**, and Cloudflare tunnels pass WebSockets including binary frames. Solves TLS, WSS and
  NAT in one move. Costs: (i) our image is a custom `nvidia/cuda:13.0.3-runtime` build, NOT
  `vastai/base-image` — we must bake `cloudflared`+Caddy ourselves; (ii) **the subdomain is
  random on every boot**, so `proxyUrl()` stops being a pure function and becomes a discovery
  step; (iii) **chicken-and-egg** — the URL is printed inside the container, and we can't
  reach the container until we have the URL. The likely answer is polling Vast's instance-log
  endpoint for the `cloudflared` stdout line. **UNVERIFIED — needs a live probe.** A named
  tunnel gives a stable URL but needs a Cloudflare Zero Trust account + a token per concurrent
  instance = infra we'd have to host. Not viable to push onto end users.
- **(b) Direct IP:port + our own TLS** — filter `static_ip: true` + `direct_port_count >= 1`,
  read `public_ipaddr` and the port map straight from the instance API. Deterministic, no log
  scraping, no Cloudflare dependency. Cert problem is smaller than it looks *because of our
  backend-proxy topology*: ~95% of traffic is Express→Pod in Node, which can pin a self-signed
  cert trivially. The one renderer-direct exception is the binary-preview WSS (§1 of the arch
  doc). Either accept that limitation on Vast, or —
- **(c) Move the preview WS behind Express** — the arch doc asserts binary latent frames
  "can't tunnel cleanly through Express". That is a recorded decision, not a proven law. If it
  re-tests as workable, option (b) becomes clean: plain IP:port, one pinned cert in Node, no
  Cloudflare, no discovery loop, `proxyUrl()` stays nearly pure.

**Recommendation: probe (b)+(c) before committing to (a).** (a) adds Cloudflare to the
critical path of every generation and a log-scraping discovery loop; (b) is boring and boring
is what we want in the transport layer.

### 3.5 Host-pinned resume that loses data (MODERATE)

A stopped Vast instance is host-pinned; on resume, if the host's GPU went to another renter
it hangs in `scheduling` indefinitely (docs: stuck >30s ⇒ make a new instance). We already
have exactly this failure mode and self-heal on RunPod (arch doc §2: delete + recreate on
host-pinned start failure). **Difference: on RunPod the recreate keeps the volume. On Vast
the recreate loses everything.** Same code path, much worse consequence.

### 3.6 Everything else

- **No SLA, no failover, no migration.** Host goes offline → wait, or destroy and rebuild
  elsewhere. Documented user reports of verified hosts offline for days with no credit.
- **No official JS/TS SDK.** Only `vastai` on PyPI, plus one stale unofficial npm package
  (`@sschepis/vast-node`, ~9mo untouched) — do not depend on it. Wrapping 5 REST endpoints
  ourselves is half a day, so this is noise.
- **Rate limits undocumented.** 429 with a text body, **no `Retry-After` header** — we must
  bring our own exponential backoff.
- **Storage bills while stopped**, only `destroy` stops the meter. (RunPod is not innocent
  here — Feb 2026 doubled idle-volume rate to $0.20/GB/mo.)
- **`GET /instances/` paginates at 25/page from Apr 2026** — affects our orphan sweep.
- **Perf variance.** Reviews report throttled GPUs on cheap hosts; the standing advice is to
  benchmark each new host. ClusterMAX rates the platform Bronze on predictability.
- **`onstart` capped at 4048 chars** (gzip+base64 to go longer).
- **Image pull progress not exposed** — only `actual_status: loading`. Same blind spot we
  already have on RunPod (arch doc §11: "NO image-pull progress field exists anywhere").

---

## 4. Why users might be moving (the premise) — UNCONFIRMED

No Reddit/HN/Discord thread documenting a RunPod→Vast exodus was found. Counter-evidence:
RunPod reported **$120M ARR / 500k developers** ([TechCrunch, 2026-01-16](https://techcrunch.com/2026/01/16/ai-cloud-startup-Runpod-hits-120m-in-arr-and-it-started-with-a-reddit-post)),
5× growth since May 2024. Not a platform being abandoned.

Two real push factors did surface:
1. **RunPod doubled idle network-volume pricing in Feb 2026** ($0.10 → $0.20/GB/mo for
   volumes on stopped pods). That hits our exact design — a user parking 100GB pays
   ~$20/mo to keep models between sessions. This is a plausible and specific reason
   Cubric-shaped users would go shopping. *(Source quality: SEO review sites. Worth
   confirming on RunPod's own pricing page before treating as fact.)*
2. **2025-26 GPU scarcity** industry-wide — availability, not price.

Most plausible reading: cost-sensitive individuals mention Vast in Discords because raw
$/hr is lower; that is a market split, not a migration. **The user has direct Discord
evidence I could not reach — their read of the sentiment should outweigh this section.**

---

## 5. Integration difficulty

### 5.1 Coupling map (verified: 5,261 lines across the remote layer)

`wc -l`: `runpodRemote.js` 344 · `remoteEngine.js` 157 · `remoteHeaders.js` 25 ·
`remoteModels.js` 699 · `remotePodLifecycle.js` 1424 · `remotePodState.js` 213 ·
`remoteProxy.js` 30 · `remoteProxyForward.js` 413 · `remoteEngineClient.js` 210 ·
`MpiRunpodSettings.js` 1746.

**Zero changes needed (~1,380 lines):** `remoteProxyForward.js`, `remoteModels.js`,
`remotePodState.js`, `remoteHeaders.js`, `remoteProxy.js`. Plus `comfyController.js`,
`server.js`, `main.js` — they only ever speak through `remoteEngineClient` / a teardown
endpoint. The whole `/wrapper/*` contract, manifest gate, node-install protocol, SSE relay,
hot-store and model-upload paths are ours and provider-neutral.

**Replace wholesale:** `runpodRemote.js` (344 lines) — the `client` object is already a
clean boundary. Write `vastRemote.js` beside it exposing the same methods.

**Heaviest surgery:** `remotePodLifecycle.js` (1,424 lines). `_createPodInternal`'s spec
builder is pure RunPod vocabulary (`gpuTypeIds`, `dataCenterIds`, `networkVolumeId`,
`volumeMountPath`, `minMemoryInGb`, `allowedCudaVersions`, `cloudType:'SECURE'`,
`ports:['8889/http']`). Status vocabulary (`EXITED`/`TERMINATED`/`RUNNING`) vs Vast's
(`running`/`loading`/`scheduling`/`stopped`/`exited`/`offline`). `_sweepOrphanPods` matches
on Pod name. Cost field `costPerHr` vs `dph_total`. Maintenance detection has no Vast
equivalent. This file wants splitting into a generic orchestrator + per-provider backends —
`if (provider === 'vast')` branches through 1,424 lines is a maintenance trap.

### 5.2 Three prerequisites (do these first, they are not optional)

1. **Extract a provider interface** behind the `client` object and `_createPodInternal`'s
   spec builder, before any Vast branch exists.
2. **Rename `runpodConfig` → `remoteConfig`** across `state.js`, `js/core/storage.js`,
   `storageKeys.js` (`mpi_runpod_config`), `normalizeRunpodConfig()`, plus
   `main/secretsStore.js` (`runpod-secrets.json`, `data.runpodApiKey`). Add
   `provider: 'runpod'|'vast'`. **Needs a migration guard** — existing users have stored
   configs and OS-keychain-backed keys.
3. **Generalize `proxyUrl()`** (`routes/remoteEngine.js:91`) from a pure podId function into
   an endpoint resolver. Good news: verified there are only **4** occurrences of
   `proxy.runpod.net` in the whole tree, and 3 are a dev link, a comment and a JSDoc —
   line 91 is the only real construction site.

Also: `secretRedaction.js` scrubs the `rpa_` RunPod key prefix — needs the Vast format added,
or scrubbing goes silently blind on the new key. And `runpodErrorClassify.js`'s
`isStockRefusal()` regex is written against RunPod's refusal strings.

### 5.3 Settings UI

`MpiRunpodSettings.js` is 1,746 lines of RunPod vocabulary: section title, referral link,
"RunPod API key", Data Center picker, Network Volume picker, `console.runpod.io` links, the
`<podId>-8188.proxy.runpod.net` dev ComfyUI link, Pod-worded error copy. A Vast panel needs
a genuinely different shape — no DC, no volume, instead an **offer picker** (the marketplace
concept has no RunPod analogue: you pick a specific machine at a specific price with a
specific reliability score). Cleanest is a provider selector + two sibling panels sharing a
connect/disconnect/status core.

### 5.4 Pod-side runtime

Small, and **not an image rebuild** — `wrapper.py`/`start.sh` are R2-floated (arch doc §5).
Only the idle watchdog is RunPod-aware (`RUNPOD_API_KEY` + `RUNPOD_POD_ID` →
`rest.runpod.io/.../stop`). Needs a Vast branch or removal. Adding `cloudflared` to the image
IS a rebuild — but only if we go with tunnel option (a).

### 5.5 Effort

- Prerequisite refactor (the 3 items): **~1 week**
- `vastRemote.js` client + offer search: **~3-4 days**
- Endpoint/TLS strategy incl. live probing: **~1-1.5 weeks** ← the risk sits here
- Settings UI second panel: **~1 week**
- Wrapper watchdog + scoped-key handling: **~1-2 days**
- Live hardening on marketplace hosts: **open-ended**

**~3 weeks to a working prototype, ~5-6 to RunPod-equivalent robustness.** The last line is
the honest one: RunPod hardening was MPI-64 plus eight follow-up cards, and that was against
a *uniform* provider. Vast's per-host variance means more failure modes, not fewer.

---

## 6. Open questions (cheap to settle, settle before coding)

1. **Bandwidth cost.** One instance, download 20GB, read the invoice. Decides whether
   ephemeral-only is economically sane. *(Highest value per minute spent.)*
2. **Endpoint discovery.** Can the app read the `cloudflared` URL from Vast's instance-log
   endpoint? Or does direct IP:port + `static_ip` + pinned self-signed cert work end-to-end?
3. **Preview WSS through Express** — re-test the assertion in arch doc §1. If it holds up,
   option (b) is clean and Cloudflare drops out of the design entirely.
4. **RunPod's Feb 2026 idle-volume price** — confirm on RunPod's own pricing page. If real,
   it is the strongest argument *for* this card and should be said in those terms.
5. **Does a Vast host with `driver_version >= 580` actually boot our cu130 image?** One
   create, watch it come up. Cheap, and it validates the whole placement-filter story.

## 7. Recommendation

**Do the probe (items 1, 2, 5 — a few hours on one instance, under $5), then decide.**

Don't start the refactor first. The three prerequisites are worth doing *anyway* for
hygiene, but committing 5-6 weeks before knowing the bandwidth number would be backwards —
bandwidth alone can make ephemeral-only Vast economically pointless, and if it does, nothing
downstream matters.

If the probe comes back clean, this is a real feature: a second supply pool, better
placement filters than RunPod's, and it lands on the ephemeral path we already ship.
