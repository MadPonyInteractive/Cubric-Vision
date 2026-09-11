# Where a proprietary cloud model would actually land in Cubric Vision

Written 2026-09-11. This is the INTERNAL half of the proprietary-model research: what in
this codebase would have to change. The other files in this folder cover the external half
(who sells what, at what price, under what contract).

**Read this before costing any of the external options.** Several of them look cheap on a
pricing page and expensive here, and one of them (bring your own key) is already a shipped
pattern in this app rather than new work.

---

## 1. The dispatch seam already exists, and it is not the problem

`docs/generation-lifecycle.md` § "An agent is the THIRD producer" is the map. Three things
produce into the queue today: the Gallery/History blocks, `flowService`, and
`js/shell/agentDispatch.js`. All three go through `enqueueGeneration`, never around it.

A cloud model is **not a fourth producer**. It enters at the same `enqueueGeneration` call.
What changes is what happens AFTER the enqueue: today every path bottoms out in
`commandExecutor` building a ComfyUI graph and posting it to a local or Pod-hosted ComfyUI.
A cloud model needs a second executor beside that one.

So the shape of the change is an **executor split**, not a new producer, not a new route.
`POST /connector/generate` is unaffected: the route is the contract, and a cloud model is
just another `modelId` the caller names.

## 2. A ModelDef is ComfyUI-shaped all the way down

`js/data/modelConstants/models.js` (1827 lines, one `MODELS` array). Every entry declares:

| Field | What a local model puts there | What a cloud model has |
|---|---|---|
| `workflows` | op key -> ComfyUI workflow `.json` filename | nothing. There is no graph |
| `commonDeps` / `operations[].deps` / `dependencies` | dep ids resolved to weights on disk | nothing to download |
| `installed` | resolved at runtime by the server stat-ing disk | always true, or "true if a key/credit balance exists" |
| `sizeTier`, `footprint`, `gpuArch` | VRAM and disk planning | meaningless |
| `supportedOps` | ops from `commandRegistry.js` | still meaningful, and still the right vocabulary |

`supportedOps` is the part that survives. Everything about weights does not. That means a
cloud model needs a discriminator on the ModelDef (call it `provider: 'cloud'` or
`runtime: 'remote-api'`) and every consumer of the dep/install machinery has to branch on it.

**Do not model a cloud model as a Flow to dodge this.** Flows are equally ComfyUI-bound:
`flowsRegistry.js` declares `workflow` (a ComfyUI workflow filename from
`universal_workflows.js`) and `requiredModels` (local model ids). A Flow dispatches with
`model.id: null` but still lands in a graph. The Flow Library is the right SURFACE for a
beginner-facing paid model, but it is not an escape hatch from the executor split.

## 3. The install gate is the main sweep surface

`docs/generation-lifecycle.md` § "An UNINSTALLED operation is undispatchable" names every
place that asks "is this installed":

- `isOperationInstalled` (checks `supportedOps` membership BEFORE asking about weights)
- `deriveInstalledOps` in `js/data/modelConstants/resolveModelDeps.js` (the weights predicate)
- `installedOpsForContext(model)` -> the `installedOps` ctx key `getAvailableCommands` filters on
- `firstInstalledOp(model)` -> what a fallback seeds
- the hard net in `commandExecutor`, beside the MPI-209 arch-weight guard

All five reach the weights predicate through `modelRegistry`. A cloud model must answer
these WITHOUT a dep-status cache entry. Note the existing contract that makes this delicate:
`installedOpsForContext` returns `null` (meaning unknown, fall back to static `supportedOps`)
rather than `[]` when the cache is unseeded. A cloud model that returned `[]` from
`deriveInstalledOps` would be invisible; one that returned `null` would be indistinguishable
from a cold boot. It needs its own branch, taken before the cache is consulted.

The Model Library UI is the other half: install buttons, download size, the L/B/H tier badge
and the orphan sweep all assume weights. A cloud model card shows a price instead.

## 4. Bring-your-own-key is ALREADY SHIPPED, twice

This is the single most important internal fact for costing the options.

| Provider | Key stored where | Used by |
|---|---|---|
| RunPod | `main/secretsStore.js`, Electron `safeStorage` with an AES-256-GCM fallback | `routes/remotePodLifecycle.js`, whole remote-pod lifecycle |
| DeepInfra | same store, `secrets:get-deepinfra-key-request` over the fork bridge, falls back to `DEEPINFRA_API_KEY` env | `routes/llm.js`, prompt enhancement |
| Pod wrapper token | same store | remote engine auth |

The full pattern is in place: encrypted at rest in the user-data partition, fetched over the
fork bridge (`routes/forkBridge.js`), never in argv, and `routes/secretRedaction.js` scrubs
`api_key=` out of logs. `main.js` and `routes/remoteEngine.js` are the other touch points.

So **"user pastes their own Kling key" is a third instance of an existing pattern, not new
architecture.** No server, no accounts, no billing, no legal entity, no margin.

One caveat: `secretsStore.js` is not generic. The file is `runpod-secrets.json` and the
fallback key material hardcodes `cubric-runpod`. DeepInfra was added as another named field
rather than by generalising it. A fourth, fifth and sixth provider key wants a real keyed
API (`get(service)` / `set(service, value)`) before the named-field pattern collapses.

## 5. The licence-acceptance gate is the right place for "this costs money"

`js/data/modelConstants/licences.js` already has per-model licence gates with persisted
receipts (`recordLicenceAcceptance`, `Storage.getLicenceReceipts`), filed under the LICENCE
rather than the model so one receipt covers every model that agreement governs. It already
handles a `verify` licence that probes a gated Hugging Face repo, deliberately keeping no
credential at rest.

A paid cloud model needs exactly this shape: show the provider's terms, record that the user
accepted them, and note which model prompted it. Reuse it, do not invent a second gate.

## 6. Progress and cancellation are the real engineering cost

`docs/generation-lifecycle.md` § "Progress pipeline" is blunt: **ComfyUI stdout is the truth,
WS events are useless.** `js/data/progressStages.js` maps a model's graph to named stages.
None of that exists for a cloud provider, which typically returns a job id and expects
polling or a webhook.

So a cloud executor needs its own progress adapter, and the per-gen identity doctrine
(§ "stop/cancel + two lanes", MPI-195/203/208/245) has to be honoured by it: a cancel has to
mean something. Most providers bill on submit, so cancel is a UI affordance, not a refund.
That has to be said in the UI or it reads as a bug.

Exception worth knowing: Google is explicit that Veo bills only on successful generation
(see `02-direct-provider-apis.md`). Assume the opposite everywhere else until checked.

Also relevant: § "Dispatch guard, empty-media ops never reach ComfyUI" and the media staging
contract. Cloud providers take images as a URL or base64, so a masked edit that today passes
a local file path has to upload the bytes somewhere the provider can read. That is a new
outbound data path with privacy consequences worth stating plainly to users.

## 7. What does NOT change

- `POST /connector/generate` and the agent/CLI seam.
- The project format, sidecars, and the gallery. A cloud generation lands as a normal card.
- The local and BYO-RunPod paths. This is additive; the free paths stay.
- The prompt enhancer, which already talks to a cloud LLM.

## 8. Rough internal effort, by option

Ranked lazy-first. These are the internal-only costs; the external files cover money and law.

| Option | Internal work | Notes |
|---|---|---|
| **BYO key, one provider** | secrets field + a cloud executor + progress adapter + ModelDef discriminator + the five install-gate branches | No server, no billing, no entity. Smallest thing that puts Kling in the app |
| **BYO key, via one aggregator** | same, but ONE integration covers many models | Strictly better than per-provider if an aggregator's terms permit end-user keys |
| **Credit system, our key** | all of the above, PLUS a proxy service, user identity, a credit ledger, payments, spend caps, abuse controls, support load | This is the option that changes what Cubric Vision IS |

The jump in cost is between rows 2 and 3, and it is not mostly code. Rows 1 and 2 leave the
app exactly as it is today: free, accountless, no vendor server.

## Open questions

- Does a cloud model get a Model Library card, a Flow card, or both? The Library is
  weights-shaped; the Flow Library is the beginner surface and already dev-gated.
- Should a cloud model be visible at all when no key and no credits exist, or hidden? A
  visible-but-locked card is an advert, which is a product decision, not a technical one.
- Where do cloud outputs get stored, and does the provider retain the input image? Needs a
  per-provider answer before any of this ships.
- If a proxy is ever built, does the Pod wrapper token pattern generalise to it, or is that
  a second auth system?

## Sources

Internal only, read 2026-09-11:
- `docs/generation-lifecycle.md` (whole file, esp. the THIRD producer and install-gate sections)
- `js/data/modelRegistry.js`, `js/data/modelConstants/models.js`, `resolveModelDeps.js`
- `js/data/flowsRegistry.js` (FlowDef typedef)
- `js/data/modelConstants/licences.js`
- `main/secretsStore.js`, `routes/llm.js`, `routes/forkBridge.js`, `routes/secretRedaction.js`
- `routes/remotePodLifecycle.js` (key handling pattern)
