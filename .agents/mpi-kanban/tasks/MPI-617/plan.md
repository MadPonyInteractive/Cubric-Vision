# MPI-617 Plan

Umbrella plan over MPI-614, MPI-613, MPI-612. Read `brief.md` first - it carries the shared
root cause and the verified open-state of all three members.

Order is by urgency: a silent wrong result outranks friction, and friction outranks cleanup
that cannot legally start yet.

---

## Phase 1 - MPI-614 - CLOSED 2026-08-25, REJECTED, not built

**Superseded by MPI-619**, which is not in the original three: both Klein cards were named
"FLUX.2 Klein" and separated only by an L/B size badge, so nothing on screen said which tier
was loaded. Renaming them to "FLUX.2 Klein 4B" / "FLUX.2 Klein 9B" removed the condition
behind the card's single recorded occurrence. Fabio: *"If the user uses a Wan LoRA on a
text-to-image model, it's the user's fault, not ours."* Full reasoning:
`tasks/MPI-614/validation.md`.

The original framing is kept below because the investigation is accurate and the umbrella's
brief refers to it - it is simply not work anyone should pick up.

<details>

**Was:** a user selects a LoRA, the run finishes with two images, and the LoRA did
nothing. The failure mode is not "an error the user must decode" - it is *no signal at all*,
which reads as "the rack is not wired". It already cost that misreading once.

**Scope corrected by Fabio, 2026-08-24: detection only.** The card's brief listed a second
defect - "the picker offers a weight the running model cannot load" - and proposed filtering
the LoRA list by model. **That half is dropped.** Users organise their own LoRA folders, a
dropped LoRA lands in the root, and filtering would mean also building folder creation and a
"which model is this for" prompt. It would hide a user's own files to solve a problem
detection already covers. Full reasoning: `tasks/MPI-614/validation.md` § Scope decision.

Detection alone covers strictly more than filtering would: cross-tier Klein, a corrupt file,
a foreign LoRA (an SDXL LoRA on Qwen), and anything hand-dropped.

### The mechanic that decides the design

In the Klein case the key *names* match across tiers - `single_blocks.7.linear1.weight`
exists in both - and only the *shapes* differ (4B rank 3072, 9B 4096). So counting matched
keys after `load_lora` does **not** catch it: `load_lora` returns a full patch dict and the
failure surfaces later, at sampling, as `ERROR lora ... shape ... is invalid`. Any pre-flight
must compare a representative LoRA tensor dim against the model's, not count key hits.

### Two candidate sites - pick one, record it in `validation.md`

- **A (recommended) - loader-side pre-flight in our own nodes.** Every LoRA here is loaded by
  a first-party node (`MpiLoraModel` 144 uses, `MpiLoraModelClip` 126, `MpiStyleLoras` 19),
  and all five `apply_lora` paths funnel into one `comfy.sd.load_lora_for_models(...)` call
  in `ComfyUi-MpiNodes/loras.py`. One choke point, engine-agnostic, fails at the source.
  Cost: sibling repo, so `/mpi-nodes-sync` -> commit -> push -> pin in
  `dev_configs/node_lock.json`. Does not cover the 20 core `LoraLoaderModelOnly` uses.
- **B - app-side log read.** Scrape `ERROR lora ... shape ... is invalid` after the run.
  Stays in this repo and covers core loaders, but the app reads `/internal/logs/raw` nowhere
  today, and it is dual-engine - build and prove it twice, the exact half-wire shape
  `.claude/rules/comfy_engine.md` warns about. Also after-the-fact: the user already paid for
  the generation.

### Verify
- A deliberately mismatched LoRA produces a user-visible signal, not a green run.
- A correctly-matched LoRA still loads with no new noise.
- Holds on BOTH engines - a Pod run never proves the local branch, or vice versa.

</details>

---

## Phase 2 - MPI-613: move the cogwheel to the run slide  <- THE LIVE PHASE

With phase 1 closed and phase 3 release-gated, this is the only phase anyone should be
working. It is also the one Fabio actually reported friction on.

- Render the cogwheels from `flowLoraPhases(flow)` on the flow's final/run slide, one per
  rack-bearing slot, keeping the slide-over's per-slot labelling so two are never ambiguous.
- Generic in `MpiBaseFlow`, driven off the flow's declared racks. No FlowDef edits, no graph
  edits. Both current two-rack flows (`character-sheet`, `scribble-object`) get it for free.
- **Open question for the user, ask once:** does the slide-over keep its cogwheels as well,
  or do they move outright? Fabio said "should be on the final stage"; he did not say
  "remove it from the library". Duplicating is one resolver and two mount points.
- **The inherited trap:** `ui:open-model-settings` has exactly two listeners, both workspace
  Blocks (`MpiGalleryBlock:1549`, `MpiGroupHistoryBlock:1134`). The landing page mounts
  neither, and the Flow Library is reachable straight from the landing page. A cogwheel
  pressed with no project open emits into nothing - no panel, no error, no log. Verify
  whether a flow can be opened and run with no project; if it can, this phase owns the fix.

### Verify
- `tests/desktop/flow-lora-button.spec.js` re-pointed at the new surface and green. This is
  the spec that was left red for a whole card cycle when MPI-608 moved this control the
  first time - do not repeat that.
- `tests/flow-lora-rack.test.cjs` updated for the new placement.
- `docs/playbooks/add-flow/ui/lora-rack.md` no longer says the opener lives in the Flow
  Library detail panel.

---

## Phase 3 - MPI-612: GC the pre-rename weights (RELEASE-GATED, do not start)

**Blocked by a calendar gate, not by phases 1-2.** MPI-609's rename is not in any release
yet (v1.4.2 predates it by 280 commits). The card wants two-three releases *after* the one
carrying MPI-609. Re-check before touching anything:

```bash
git merge-base --is-ancestor 2e263c2f v<latest> && echo "shipped" || echo "not shipped"
```

Three legs, each with its own hazard - the member card's `brief.md` holds the full key lists
and is the file to work from:

1. **R2**, 15 flat keys under `.../loras/flux2-klein/styles/`. `rclone` needs
   `--s3-no-check-bucket` or every call 403s naming `CreateBucket` while write access is
   fine. Deletion needs **explicit Fabio approval at the time**.
2. **Hugging Face**, 7 flat-root 9B files. Load the write token explicitly from
   `C:/Users/Fabio/.secrets/hf.txt` - the ambient token is a different account and silently
   has no write here.
3. **User disks**, up to 0.72 GB of 4B weights. Ponytail default: **do nothing**, they are
   inert and invisible to the orphan sweep. Do NOT widen the orphan sweep to delete unknown
   files - that is how MPI-310 destroyed 5.24 GB.

### Verify
- `styles/` in R2 lists only `4b/` and `9b/`, no flat keys.
- All 15 `url` and 7 `mirrorUrl` values in `loraDeps.js` still HEAD 200 afterwards.
- `node --test tests/style-rack-deps-resolve.test.cjs` green.

---

## Parallel Batch

Phases 1 and 2 are disjoint and may run concurrently. Phase 3 is excluded - it is gated and
touches no application code.

### Task: MPI-614 - a LoRA that binds nothing must not finish green
Ownership depends on the site chosen above, so it is deliberately not fixed here yet:
- **site A** - `c:\AI\Mpi\ComfyUi-MpiNodes\loras.py` (+ `help_funcs.py`), then
  `dev_configs/node_lock.json` for the pin. Sibling repo: `git -C`, and it does NOT run in
  parallel with any other card touching MpiNodes.
- **site B** - `js/services/comfyController.js` + a new engine-log route.

Touches **no** file MPI-613 owns under either option, so the two stay parallel-safe.

### Task: MPI-613 - cogwheel on the run slide
Ownership:
- `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js`
- `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js`
- `docs/playbooks/add-flow/ui/lora-rack.md`
- `tests/flow-lora-rack.test.cjs`
- `tests/desktop/flow-lora-button.spec.js`

**Shared read-only, owned by neither:** `js/data/flowsRegistry.js` (`flowLoraPhases`) and
`js/data/modelRegistry.js`. If either phase needs to *edit* one of those, it files an
`mpi-message` and stops that line of work rather than editing - both phases read them.

### Excluded from the batch
- **MPI-612** - release-gated (see phase 3). Not startable, not parallelisable, and starting
  it early is the one way this umbrella does damage.
