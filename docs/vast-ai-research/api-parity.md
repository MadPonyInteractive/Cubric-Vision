# Vast.ai REST API + RunPod→Vast parity (external facts)

> Backlog research for **MPI-344** — see [README.md](README.md) for status (PARKED) and the
> decision. This file is the reusable external reference: API surface, filters, networking.
> All dated 2026-07-23; sources are docs.vast.ai + github.com/vast-ai/base-image.

## Auth
- `Authorization: Bearer <VAST_API_KEY>` (primary; `?api_key=` also accepted).
- Base URL `https://console.vast.ai/api/v0`.
- **10 permission scopes** (`instance_read/write`, `billing_*`, `machine_*`, `misc`, `team_*`)
  **plus parameter-level restrictions** (`eq`/`lte`/`gte` on e.g. an instance id). RunPod has
  no scoping — this is a Vast advantage we should use for the in-Pod watchdog key.
- Teams/orgs with custom roles (since May 2025).

## Offer search — `POST /api/v0/bundles`
Marketplace-first: you search for a specific machine (an "offer"), then create on its id.
Filter DSL: each field takes an operator object, e.g. `{"gte":0.99}`, `{"in":["US","DE"]}`.
Operators: `eq neq gt lt gte lte in notin`.

Key filter fields:
| Field | Meaning |
|---|---|
| `gpu_name` | exact model string, e.g. `"RTX 4090"` |
| `num_gpus`, `gpu_ram` (MB), `cpu_ram` (MB), `disk_space` (GB) | sizing |
| **`driver_version`** (`{"gte":"535.00.00"}`), **`cuda_max_good`** (`{"gte":13.0}`) | **the CUDA floor — equivalent to RunPod `allowedCudaVersions`** |
| `compute_cap` | CUDA compute cap ×100 |
| `reliability` (0-1), `datacenter` (bool) | host quality |
| `geolocation` (ISO country), `inet_down`/`inet_up` (Mbps) | placement |
| `static_ip` (bool), `direct_port_count` (int) | **reachability — see Networking** |
| `dph_total` | $/hr ceiling |

Response `{"offers":[…]}`; each offer's `id` feeds create.

## Lifecycle
| Action | Endpoint | Notes |
|---|---|---|
| Create | `PUT /api/v0/asks/{offer_id}/` | returns `{"success":true,"new_contract":<id>}` (note: `new_contract`, not `id`) |
| Status | `GET /api/v0/instances/{id}` | poll `actual_status` |
| List | `GET /api/v0/instances/` | **paginates at 25/page from Apr 2026** — affects an orphan sweep |
| Stop/Resume | `PUT /api/v0/instances/{id}/` | body `{"state":"stopped"}` / `{"state":"running"}` |
| Destroy | `DELETE /api/v0/instances/{id}/` | permanent, deletes all data |

`actual_status` values: `running` · `loading` (image pull, **not billed**) · `scheduling`
(waiting for GPU) · `stopped` · `exited` (crash) · `unknown` (no heartbeat) · `offline`
(host down). Contrast RunPod `EXITED`/`TERMINATED`/`RUNNING`/`CREATED`.

**Host-pinned resume failure:** a stopped instance is tied to one physical machine. On resume,
if that GPU was rented out, it hangs in `scheduling` (docs: stuck >30s ⇒ make a new instance).
We already self-heal this on RunPod (delete+recreate) — but on Vast the recreate LOSES the
local data. Same code path, worse consequence.

## Create body — image / env / onstart
| Field | Notes |
|---|---|
| `image` | `registry/image:tag`. Docker Hub, GHCR, GCR, nvcr.io all supported |
| `env` | docker-flag format `-e FOO=bar` |
| `onstart` | bash, **4048 char cap** (gzip+base64 for longer) |
| `runtype` | `ssh`/`jupyter`/`args`/`ssh_proxy`/`jupyter_proxy` |
| `disk` | GB, fixed at creation |
| `target_state` | `"running"` or `"stopped"` |
| `volume_info` | volume create/link at launch (host-local only — see README) |
Private-registry creds via template or account-level env vars. **Image-pull progress not
exposed** (only `actual_status:loading`) — same blind spot we already have on RunPod.

## Networking — THE crux (no `proxy.runpod.net` equivalent)
RunPod gives `https://<podId>-<port>.proxy.runpod.net`: always-on, valid cert, NAT-traversing,
WSS-capable, and a **pure function of podId**. Vast has nothing equivalent. Three options:

- **(a) Cloudflare Quick Tunnel** — what Vast's own templates do (`cloudflared`+Caddy in the
  container → `https://<random-words>.trycloudflare.com`, **valid Cloudflare CA cert**,
  WebSockets incl. binary frames pass, NAT-traversing). Costs: our image is a custom
  `nvidia/cuda:13.0.3-runtime` build, NOT `vastai/base-image`, so we bake `cloudflared`
  ourselves (an image rebuild); **the subdomain is random per boot** so the URL must be
  DISCOVERED not computed; and it's chicken-and-egg — the URL is printed inside the container
  we can't yet reach (likely answer: poll the instance-log endpoint for the cloudflared line).
  A named tunnel gives a stable URL but needs a Cloudflare Zero-Trust account + a token per
  instance = infra we'd host. **UNVERIFIED end-to-end — needs a live probe.**
- **(b) Direct IP:port + our own pinned cert** — filter `static_ip:true` +
  `direct_port_count>=1`, read `public_ipaddr` + the port map from the instance API
  (deterministic, no log scraping). Cert problem is small *because of our backend-proxy
  topology*: ~95% of traffic is Express→Pod in Node, which pins a self-signed cert trivially.
  Only the renderer-direct binary-preview WSS is exposed.
- **(c) Move the preview WSS behind Express** — the arch doc §1 says binary latent frames
  "can't tunnel cleanly through Express"; that's a recorded decision, not a proven law. If it
  re-tests workable, (b) becomes fully clean and Cloudflare drops out of the design.

**Recommendation: probe (b)+(c) before committing to (a).** Boring transport is the goal.

## Storage — see [README.md](README.md) § Verdict. Both types host-local, no network volumes.

## Billing
Prepay credits, per-second compute while running, storage continuous (stops only on
`destroy`), **`loading` phase not billed**, host-offline not billed. $0 balance → instances
stop.

## SDK / limits
- Official **`vastai` PyPI** SDK/CLI (`search_offers`, `create_instance`, `show_instance`,
  `stop_instance`, `destroy_instance`, `copy`, …). **No official JS/TS SDK** — one stale
  unofficial npm pkg (`@sschepis/vast-node`), do not depend on it. Wrap 5 REST endpoints
  ourselves (~half a day).
- **Rate limits undocumented** — 429 text body, **no `Retry-After`** → bring our own backoff.
- REST reference: https://docs.vast.ai/api-reference/introduction . OpenAPI/Swagger URL
  referenced but not found — UNVERIFIED.

## RunPod → Vast capability parity (gap: NONE / MINOR / BLOCKER)
| RunPod | Vast | Gap |
|---|---|---|
| Bearer auth, scoped keys | Bearer + 10 scopes + param restrictions | NONE (Vast better) |
| create/status/start/stop/delete | `PUT /asks`, `GET`/`PUT`/`DELETE /instances` | MINOR (offer-first create) |
| GraphQL `podFindAndDeployOnDemand` fallback | REST search+create (2 calls) | MINOR |
| `allowedCudaVersions` | `driver_version` + `cuda_max_good` | NONE |
| GPU/VRAM/reliability/DC/geo filters | richer equivalents | NONE (Vast better) |
| `*.proxy.runpod.net` TLS proxy | none — CF tunnel or direct IP+cert | **MINOR→the main risk** |
| WSS binary through proxy | CF tunnel passes it; unproven under sustained load | MINOR |
| arbitrary image + env + onstart | full support | NONE |
| **network volume (cross-instance, portable)** | **host-local only, none shipped** | **BLOCKER for a persistent library → ephemeral-only** |
| STOPPED retains disk + resumes | yes, but host-pinned, resume can fail + lose data | MINOR |
| prepay billing | identical | NONE |
| free egress | **per-byte, host-set, unpublished** | **red flag (see README)** |
