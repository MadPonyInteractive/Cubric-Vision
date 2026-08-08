# MPI-485 — the orphan Pod sweep reaps by NAME

## The code

`routes/remotePodLifecycle.js:930`

```js
async function _sweepOrphanPods(key, keepPodId) {
  const keep = new Set([keepPodId, _startedPodId, _mode.podId].filter(Boolean).map(String));
  ...
  const orphans = pods.filter(
    (p) => p && p.name === 'cubric-vision' && !keep.has(String(p.id))
  );
  for (const p of orphans) { await client.deletePod(key, p.id); }
```

Ownership is inferred from a **shared constant name**. `keep` holds only what *this
process* started. Every Cubric Vision instance names its Pods `cubric-vision`, so a
second instance sees the first's healthy, in-use Pod and cannot tell it from a stray.

## What it cost, live

2026-08-08 05:58:34 — a desktop-test Electron quit and its teardown sweep deleted
`fkbqtzs8htgvtw`, the CPU download Pod of the MPI-467 smoke fill, mid-download at model
9 of 12.

```
[runpod] orphan sweep deleted 1 stray Pod(s): fkbqtzs8htgvtw
```

The runner then polled a Pod that no longer existed. **The symptom was a wall of
progress dots** — indistinguishable from a slow download, because the runner's stall
watchdog measures bytes, and a deleted Pod moves no bytes in exactly the way a stalled
one doesn't. The cause was only known because the agent that did it reported it.

## The part that is worse than the incident

The sweep is **not** teardown-only. It runs on the happy path:

- `:803` — `await _sweepOrphanPods(key, null)`, immediately **before** creating a Pod,
  with a `null` keep-id.
- `:899` — again after create, with the new `podId`.
- `POST /remote/pod/cleanup-orphans` (`:1557`) — the teardown path that fired here.

So instance B merely **connecting to the remote engine** destroys instance A's Pod. It
does not have to quit. Any fix that covers only the teardown route is half-wired.

## Not just an agent problem

Two installs sharing one RunPod key — desktop and laptop, or a portable build beside a
dev run — reap each other mid-generation. The victim sees a stall with no error, no
dialog and nothing in `app.log` naming a deletion.

## It corrects MPI-458

MPI-458 closed hours earlier concluding parallel instances are *"safe, but not free"*
given their own profile and their own `CUBRIC_PORT`. That is incomplete: profile and
port isolate **local** state. They do not isolate the shared **RunPod account**.
MPI-458's own finding (the single-instance lock is not stolen) still stands.

## Fix direction

Ownership must be **provable**, not inferred from a shared name.

- Stamp a per-installation id at create — a Pod name suffix, or an env var alongside
  the existing per-instance `CUBRIC_TOKEN` — and reap only Pods carrying **this**
  installation's id.
- **A Pod whose owner cannot be established must be LEFT ALONE.** The cost of a stray
  Pod is money; the cost of a false reap is destroyed work. The asymmetry is the whole
  design constraint.
- Check whether `client.listPods` returns pod `env` before relying on it —
  `GET /runpod/pods/:id` does, the list may not.

Do **not** fix this by disabling the sweep at teardown only. The create path is the
more dangerous of the two.

## Acceptance

1. Two app instances, one RunPod key: B connects and creates its own Pod while A's Pod
   is live. A's Pod survives.
2. B quits. A's Pod still survives.
3. A genuine stray — a Pod from a killed process with this installation's id — is still
   reaped, so the sweep has not simply been neutered.
