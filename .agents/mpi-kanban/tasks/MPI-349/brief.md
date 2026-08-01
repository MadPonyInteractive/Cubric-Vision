# MPI-349 - Revisit RunPod Deploy-When-Available API + network-volume steering

Status: WATCH card. Nothing to build on 2026-07-25. This is the breadcrumb so a future
session does not re-derive the API check.

Trigger: two RunPod `#announcements` posts surfaced by the user 2026-07-25.

---

## Part 1 - "Deploy when available" (18 Jun 2026, GA)

### What they shipped

Queue for any GPU spec that is out of capacity instead of refreshing or sniping. Requires the
New Pod deploy page under Early Access (`console.runpod.io/user/early-access`). When the spec
frees up the Pod deploys automatically **and starts billing immediately, whenever that is,
even if the user is away**. A "subscription window" limits the valid deploy times. Notification
via console or email (SMS promised). The spec must be something that could feasibly become
available.

### Why it is a no-op for us TODAY (verified, not assumed)

- REST `POST /pods` request body has **no** queue / schedule / wait-for-capacity /
  subscription field. Full field list from the live OpenAPI schema
  (`docs.runpod.io/api-reference/pods/POST/pods`): `allowedCudaVersions, cloudType,
  computeType, containerDiskInGb, containerRegistryAuthId, countryCodes, cpuFlavorIds,
  cpuFlavorPriority, dataCenterIds, dataCenterPriority, dockerEntrypoint, dockerStartCmd,
  env, globalNetworking, gpuCount, gpuTypeIds, gpuTypePriority, imageName, interruptible,
  locked, minDiskBandwidthMBps, minDownloadMbps, minRAMPerGPU, minUploadMbps, minVCPUPerGPU,
  name, networkVolumeId, ports, supportPublicIp, templateId, vcpuCount, volumeInGb,
  volumeMountPath`.
- `docs.runpod.io/pods/manage-pods` documents immediate deploy only for UI, `runpodctl`, and
  REST. No deferred/conditional deploy anywhere in the public docs.
- Our create path is REST `POST /pods` with a GraphQL `podFindAndDeployOnDemand` fallback
  (`routes/runpodRemote.js` `createPod` / `createPodGraphql`). Neither exposes the feature.

Conclusion: console-only. Zero surface to integrate.

### We already ship the equivalent

`autoRetry` (MPI-110), default OFF:
- `js/core/storage.js` (~line 62-65) - pref + normalizer.
- `js/components/Compounds/LandingPages/MpiRunpodSettings/MpiRunpodSettings.js:444, 502, 537,
  563, 1194, 1237` - picker also lists out-of-stock cards; Connect polls until stock appears.
- `js/shell.js:523` - boot-time auto-retry when `autoConnectOnStart` AND `autoRetry`.

Honest comparison:
- **Ours wins on billing safety.** It only runs while the app is open, so there is no pod
  billing at 3am while the user sleeps.
- **Theirs wins on placement.** A server-side reservation beats a client-side poll; against a
  real queue our poll loses the race on every capacity blip. RunPod's stated goal was killing
  snipers, and `autoRetry` *is* a sniper.

### Re-open condition

The queue field appears in the REST schema or a GraphQL mutation. Then:
1. Wire it as the create path when the picked GPU is out of stock.
2. **Do NOT fold it into `autoRetry` silently.** Their version bills with the app closed, which
   `autoRetry` never does. Needs its own pref, the subscription window surfaced in the UI, and
   explicit consent ("this may start billing while Cubric is closed").
3. Likely fixes the known reconnect-deletes-warm-pod churn (transient stock-out at reconnect
   deletes a recoverable warm Pod, then the recreate also fails) and the "Selected GPU
   unavailable" dead end.

Probing sooner is possible without waiting for docs: the console uses GraphQL, so the
subscription mutation likely exists undocumented. The RunPod live-API-probe technique
(temp route in `runpodRemote.js`, restart, curl, revert) would find it. Not done - the
billing-consent design work outweighs the win while `autoRetry` covers the common case.

---

## Part 2 - the network-volume message (03 Jun 2026) - the real signal

RunPod, verbatim intent:
- The availability crunch is stressing network-volume topology; a volume is only as useful as
  the compute you can attach to it.
- Deploy When Ready (beta at the time, now GA) is the fix they are building for it.
- **They will not issue credits** for difficulty using a network volume when the cause is low
  supply.
- "If a network volume isn't serving you right now, don't force it. For a lot of workloads it
  makes more sense to keep your data in offsite cloud storage and pull it in with Cloudsync or
  other methods as you need it."

### Why that points at us

Our remote engine is volume-pinned by design (`docs/runpod-remote-engine.md` section 5): a
network volume at `/workspace` holds models plus per-model custom nodes, one volume per data
center, **locked to its DC**, switching DC means delete plus re-download, and Connect is gated
on both a GPU and a volume being selected. That is precisely the topology RunPod says is
hardest to schedule during a crunch.

### But the escape hatch already exists

- Weights already live in **Cloudflare R2** and are aria2-pulled - the "offsite storage" half
  is done.
- **Ephemeral "Any region" pods already work** (MPI-78): models root on the container disk, no
  volume, no DC pin. `start.sh` exports `CUBRIC_VOLUME_MOUNT=$CUBRIC_ROOT` so the disk bar
  measures `/cubric-data`; `resolveDiskTotalBytes` falls back to `containerDiskInGb`.
- MPI-329 already stages weights volume -> container disk anyway, and sizes the container disk
  to mirror the volume + 5 GB.

So volume-less is a configuration path, not a rewrite. Cost is a re-download per session -
time only, since RunPod does not bill bandwidth (unlike Vast, see below).

### What to actually do when this card is picked up

1. Measure the real cost of ephemeral-first for a typical user: cold-boot to first generation
   with an R2 pull of one model set, versus the volume path. That number decides whether
   ephemeral becomes the recommended default during crunches.
2. Decide whether the Settings copy should steer new users to Any-region rather than
   volume-first when their picked DC is chronically dry.
3. No credits are coming for volume pain - do not build any user-facing "ask RunPod for a
   refund" affordance.

---

## Part 3 - knock-on for MPI-344 (Vast.ai, parked)

MPI-344 penalised Vast for having **no network volumes** (ephemeral only). RunPod is now
steering its own users off volumes, so that gap narrowed. It does **not** unpark MPI-344: Vast's
per-byte bandwidth billing is still the red flag, and re-downloads on RunPod are free. Worth one
line in `docs/vast-ai-research/README.md` so the next reader does not over-weight the volume
advantage.

---

## Sources

- https://docs.runpod.io/api-reference/pods/POST/pods (field list above, checked 2026-07-25)
- https://docs.runpod.io/pods/manage-pods
- RunPod Discord `#announcements`, 18 Jun 2026 and 03 Jun 2026 (screenshots supplied by user)


## Merged in 2026-08-01

- **MPI-344** - Vast.ai as a second option to runpod. Original card text: `tasks/MPI-344/task.json`.

Why one card: Both are watch/research on the same question - how the app gets a GPU when RunPod cannot give it one. Deploy-when-available, the network-volume availability crunch and a second provider are three answers to that question and get decided together, not one at a time.
