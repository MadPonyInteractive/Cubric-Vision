# Vast.ai integration — what changes in OUR code (internal facts)

> Backlog research for **MPI-344** — see [README.md](README.md) for status (PARKED). This is
> the coupling map + effort estimate, verified by hand against the tree on 2026-07-23.
> Provider-agnostic architecture is in `../runpod-remote-engine.md`.

## The good news
Remote layer = **5,261 lines** (`wc -l`): `runpodRemote.js` 344 · `remoteEngine.js` 157 ·
`remoteHeaders.js` 25 · `remoteModels.js` 699 · `remotePodLifecycle.js` 1424 ·
`remotePodState.js` 213 · `remoteProxy.js` 30 · `remoteProxyForward.js` 413 ·
`remoteEngineClient.js` 210 · `MpiRunpodSettings.js` 1746.

**~1,380 lines need ZERO changes:** `remoteProxyForward.js`, `remoteModels.js`,
`remotePodState.js`, `remoteHeaders.js`, `remoteProxy.js`. Plus `comfyController.js`,
`server.js`, `main.js` — they speak only through `remoteEngineClient` or a teardown endpoint.
The whole `/wrapper/*` contract, manifest gate, node-install protocol, SSE relay, hot-store
and model-upload are ours and provider-neutral — they travel to Vast unchanged.

**`proxy.runpod.net` appears in only 4 places** in the whole tree; 3 are a dev link, a comment
and a JSDoc. The only real construction site is **`routes/remoteEngine.js:91`**.

## Three prerequisite refactors (do FIRST, not optional — but only AFTER the probe)
1. **Extract a provider interface** behind the `client` object (`runpodRemote.js`) and
   `_createPodInternal`'s spec builder, before any Vast branch exists. `client` is already a
   clean boundary — write `vastRemote.js` beside it exposing the same methods.
2. **Rename `runpodConfig` → `remoteConfig`** across `js/state.js`, `js/core/storage.js`,
   `js/core/storageKeys.js` (`mpi_runpod_config`), `normalizeRunpodConfig()`, and
   `main/secretsStore.js` (`runpod-secrets.json`, `data.runpodApiKey`). Add
   `provider:'runpod'|'vast'`. **Needs a migration guard** — existing users have stored
   configs + OS-keychain keys that must survive the upgrade.
3. **Generalize `proxyUrl()`** (`remoteEngine.js:91`) from a pure podId function into an
   endpoint resolver (Vast's endpoint is discovered per-boot, not computed — see
   [api-parity.md](api-parity.md) § Networking).

## Heaviest surgery — `remotePodLifecycle.js` (1,424 lines)
`_createPodInternal`'s spec builder is pure RunPod vocabulary: `gpuTypeIds`, `dataCenterIds`,
`networkVolumeId`, `volumeMountPath`, `minMemoryInGb`, `allowedCudaVersions`,
`cloudType:'SECURE'`, `ports:['8889/http']`. Also: status vocabulary
(`EXITED`/`TERMINATED`/`RUNNING`), `_sweepOrphanPods` matches on Pod name, cost field
`costPerHr` vs Vast `dph_total`, maintenance detection has no Vast equivalent. **Split into a
generic orchestrator + per-provider backends** — `if (provider==='vast')` through 1,424 lines
is a maintenance trap.

## Smaller, must-not-forget
- `routes/secretRedaction.js` scrubs the `rpa_` RunPod key prefix — **add the Vast key format
  or the log scrubber goes silently blind** on the new key.
- `js/utils/runpodErrorClassify.js` `isStockRefusal()` regex is written against RunPod refusal
  strings; Vast returns different capacity-failure text.
- `js/services/remoteEngineClient.js` `wsUrl()` builds `wss://<pod>-8889.proxy.runpod.net`;
  `arch()` reads `state.runpodConfig?.gpuType` — both need the provider-neutral config.
- `js/shell.js` boot auto-reconnect + GPU-wait loop read `runpodConfig` fields directly and
  call `/runpod/gpu-availability`.

## Pod-side runtime — small, NOT an image rebuild (unless tunnel)
`wrapper.py`/`start.sh` are R2-floated (arch doc §5). Only the **idle watchdog** is
RunPod-aware: it reads `RUNPOD_API_KEY` + `RUNPOD_POD_ID` (injected at
`remotePodLifecycle.js:579`) and calls `rest.runpod.io/v1/pods/{id}/stop`. On Vast:
- **Do NOT inject a full API key** — a host operator on an unverified box reads container env.
  Mint a **Vast parameter-restricted key** scoped to `instance_write` on that one instance id
  (Vast supports this; RunPod does not), OR drop the in-Pod watchdog and rely on app teardown +
  contract expiry.
Adding `cloudflared` to the image for tunnel option (a) **would** be a rebuild — the only
image-rebuild trigger in the whole port.

## Settings UI — `MpiRunpodSettings.js` (1,746 lines)
Pure RunPod vocabulary: section title, referral link, "RunPod API key", **Data Center picker,
Network Volume picker** (neither exists on Vast), `console.runpod.io` links, the
`<podId>-8188.proxy.runpod.net` dev link, Pod-worded error copy. Vast needs a genuinely
different shape — no DC, no volume; instead an **offer picker** (pick a specific machine at a
specific price + reliability — a marketplace concept with no RunPod analogue). Cleanest: a
provider selector + two sibling panels sharing a connect/disconnect/status core.

## Effort
| Piece | Estimate |
|---|---|
| 3 prerequisite refactors | ~1 week |
| `vastRemote.js` client + offer search | ~3-4 days |
| Endpoint/TLS strategy incl. live probing | ~1-1.5 weeks ← risk sits here |
| Settings UI second panel | ~1 week |
| Wrapper watchdog + scoped-key handling | ~1-2 days |
| Live hardening on marketplace hosts | open-ended |

**~3 weeks to a working prototype; ~5-6 to RunPod-equivalent robustness.** RunPod hardening
was MPI-64 + eight follow-up cards against a *uniform* provider — Vast's per-host variance
means MORE failure modes, not fewer.
