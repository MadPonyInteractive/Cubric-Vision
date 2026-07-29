# MPI-385 Brief — the RunPod verification sweep

**This card is a QUEUE, not a feature.** Shipped work keeps ending with one identical
leftover: *"and it should be run once on a Pod."* Spinning a Pod per card is absurd, so they
queue here and clear in **one session**.

Standing rule from here on: when a card's only remaining check needs a remote engine, close
that card on its local evidence and **add a line to this brief** instead of parking the card
in `validating` forever.

---

## How to run it

Pod session mechanics live in `docs/runpod-remote-engine.md` (§2 Pod lifecycle, §5 volume /
data-centre rules, §10 troubleshooting). Do not re-derive them here.

1. Connect once. Walk the list below top to bottom.
2. Write each finding into the **member card's** `validation.md` — this card holds the list,
   the members hold the evidence.
3. Close a member card only when **its own** item passed. A green session that skipped an
   item closes nothing.
4. Tear down once at the end.

Run the **install-path items first** (item 1). If a newly-added `engineAsset` does not reach
the Pod, several of the items below cannot run at all, and finding that out last wastes the
whole session.

---

## The queue

### 1. MPI-380 — SAM3 points on a Pod

- **FIRST, and the likeliest failure:** does the remote model-install path pick up a **newly
  added `engineAsset`**? The local path does (`checkUniversalWorkflowDepsStatus` →
  repair-deps); the remote path is unproven. That card's own validation.md flags this.
- Place points, Detect, confirm a mask comes back.
- Confirm **no points PNG reaches staging** — MPI-380 deleted the dot-image upload, and a
  regression here is silent (it would just work, slower).
- No image rebuild needed: `SAM3_Detect` is core ComfyUI 0.28 and the dev tag is already
  0.28. The weight is a normal R2 dep. **Released users are a separate matter** — stable is
  its own tag and still needs the 0.28 promotion. That is a release decision, not this card.

### 2. MPI-384 — SAM3 text on a Pod

- Type a name, Detect, confirm chips. The prompt must arrive as **text**.
- `CLIPTextEncode` is not in `comfyController`'s `PATH_MEDIA_CLASSES`, so this *should* be a
  non-event — but MPI-380 hit exactly this trap on the points branch (`MpiString` was media-
  staged), which is why it is worth one run rather than an assumption.
- Everything else on that card is user-verified locally; this is the last item.

### 3. MPI-346 — krea2edit v1.1 → v1.2.2

- Does the **`.mpi_node_commit` drift ladder** reinstall the node at the new commit on
  connect? Untested since the bump.
- Then run **one Krea2 edit and one describe through the app** (not the raw graph — nothing
  has gone through Cubric Vision yet). If both land, the card closes.
- Bonus if the session allows: two-reference edits under the new symmetric framing. The
  "two-ref inverts" finding was measured on the OLD asymmetric geometry.

### 4. MPI-135 — DC-steer (**has no card, anywhere**)

Absent from the board *and* from `tasks/_archived/`. Half of it (`b48ac2b`) is
**logic-verified only** and needs a maintenance host. Detail: `docs/runpod-remote-engine.md`
§11. Carried here so it stops being lost; if it turns out to need real work rather than a
check, card it properly and drop this line.

### 5. MPI-328 — remote status fail-open (**closed locally 2026-07-29, opportunistic check only**)

Fixed + unit-tested locally; closed on local evidence per the standing rule. The only
Pod-observable bit: during a Pod boot (the wrapper 404s for a few seconds before it answers
`/wrapper/models/status`), confirm the log shows `[runpod] models/status short answer for <id>`
and that **no** model flips to installed while the volume is untouched. Zero setup — just watch
the log on the connect you are already doing. If a model does flip, reopen MPI-328.

---

## NOT on this card — a Pod cannot settle these

Listing them is half the point. Each has been mistaken for Pod-verifiable before.

| Card | Why a Pod proves nothing |
|---|---|
| **MPI-198** | Loader-path separator heal on a **LOCAL** engine on Linux/mac. A Pod is a *remote* engine — different code path entirely. Needs a Linux/mac portable build with a LOCAL engine and a subfoldered LoRA. |
| **MPI-370** | macOS install (`onnxruntime-gpu` has no macOS wheel, ever). Needs a real Mac. |
| **MPI-369** | Fatal-boot logging + update-bundle packaging. Local, and needs a deliberate throw-smoke. |
