# GPU Availability & Data Center Selection — RunPod Remote Engine (MPI-64)

**Status:** Decision record. Verified live against the RunPod GraphQL API 2026-06-11
with a real account key. Supplements `volume-manifest-schema.md` and
`pod-lifecycle-policy.md`.

---

## The problem (raised by user)

A network volume locks to ONE data center, and each data center offers a different,
**fluctuating** set of GPUs. If the app lets a user pick a card that is out of stock,
Pod creation fails. OneTrainer sidesteps this by just linking the user to the RunPod
console to see availability. We can do better — the API exposes availability.

## The API DOES expose availability

RunPod has TWO APIs:
- **REST** `https://rest.runpod.io/v1/` — Pods CRUD (create/start/stop/delete/list). Used
  for lifecycle. `/v1/gpuTypes` does NOT exist here (404).
- **GraphQL** `https://api.runpod.io/graphql?api_key=<KEY>` — catalog + availability.

Availability query (verified working):

```graphql
query {
  dataCenters {
    id
    name
    gpuAvailability {
      available
      gpuTypeId
      stockStatus
    }
  }
}
```

GPU catalog query:

```graphql
query {
  gpuTypes { id displayName memoryInGb secureCloud communityCloud }
}
```

### Field semantics (IMPORTANT — verified)

- `available: true` — the DC OFFERS this card and it is deployable. `available: false`
  / absent — not offered here.
- `stockStatus` — real-time stock rating. Observed values: **`High`, `Medium`, `Low`,
  `null`**. Distribution across all DCs at probe time: High=3, Medium=1, Low=50, null=74.
- **`stockStatus: null` does NOT mean unavailable.** Several `available:true` cards have
  `null` stock (e.g. EUR-IS-1 RTX 4090). `null` = "not stock-rated", still deployable.
- The authoritative deploy gate is `available`. `stockStatus` is a *likelihood-of-success
  right now* hint, not a hard gate. Stock can change between fetch and deploy.

## App design (better than OneTrainer's link-only approach)

1. On entering RunPod settings, fetch `dataCenters` + `gpuTypes` via GraphQL with the
   user's key.
2. Filter to **Secure Cloud** GPUs (`secureCloud: true`) intersected with the chosen
   volume's data center (`available: true` in that DC).
3. Render each selectable card with a `stockStatus` badge: High / Medium / Low / "—"
   (for null). Sort High→Low.
4. Soft-warn on `Low`; do not hard-block (Low cards do deploy, just less reliably).
5. Keep a "View live availability on RunPod" deep link as a fallback (stock drifts).
6. On deploy failure due to stock (`POST /pods` availability error), surface the
   `pod-lifecycle-policy.md` "GPU unavailable" state: clear message + "pick another GPU"
   + "try again" + "use local engine". Never a silent failure.
7. Because the volume is DC-locked, the **data-center picker comes BEFORE the GPU
   picker**, and the GPU list is scoped to that DC. Changing DC later = volume
   delete/recreate (the `pod-lifecycle-policy.md` volume-delete flow).

## Verified GPU facts (Secure Cloud), 2026-06-11

| GPU | gpuTypeId | VRAM | Secure |
|---|---|---|---|
| RTX 5090 | `NVIDIA GeForce RTX 5090` | 32 GB | yes |
| RTX A6000 | `NVIDIA RTX A6000` | 48 GB | yes |
| RTX 4090 | `NVIDIA GeForce RTX 4090` | 24 GB | yes |
| RTX A4000 | `NVIDIA RTX A4000` | 16 GB | yes |
| L4 | `NVIDIA L4` | 24 GB | yes |
| RTX 5080 | `NVIDIA GeForce RTX 5080` | 16 GB | **no (community only)** |

`gpuTypeId` is the exact string the REST `POST /pods` `gpuTypeIds` field expects.

## Data-center note (corrects an earlier wrong assumption)

The `available` boolean alone is misleading without `stockStatus`. A first pass that
read only `available` wrongly suggested EU-RO-1 had both 5090 + A6000 in stock; the live
console showed EU-RO-1's real stock was different and let the user down before. **Always
read `stockStatus`, and treat the live RunPod console as ground truth for a final check.**

For the MPI-64 live test: **EUR-IS-1** (Iceland) is the working DC — confirmed live to
offer RTX 5090 (test/real), plus cheap **RTX A4000** and **L4** for low-cost test Pods,
all `available:true`. The 150 GB volume for the live test goes in **EUR-IS-1**.

## Open follow-up

- Confirm the exact REST `POST /pods` error code/shape when a selected GPU is out of
  stock at deploy time, so the lifecycle "GPU unavailable" mapping is precise. (Do during
  the first live deploy.)
