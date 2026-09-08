# MPI-614 Validation

## CLOSED — REJECTED, 2026-08-25. Not built, and deliberately so.

Fabio:

> *"If the user uses a Wan LoRA on a text-to-image model, it's the user's fault, not ours.
> We can drop 614."*

The card had exactly one recorded occurrence, and **MPI-619 removed the condition that
produced it**: both Klein cards were named "FLUX.2 Klein" and told apart only by an L/B size
badge, so nothing on screen said which tier was loaded. They now read "FLUX.2 Klein 4B" and
"FLUX.2 Klein 9B", and the LoRA folders are already `styles/4b/` and `styles/9b/`.

What is left after that is a user loading a weight that plainly does not belong to the model
they are running. That is user error, and the app does not owe a guard for it. Building
detection would have meant either a sibling-repo node change plus a pin bump, or new
dual-engine log plumbing — real cost against a failure the rename already prevents.

**Do not re-open this without a NEW occurrence** that is not explained by a mislabelled
model. The investigation below is kept because it is accurate and was expensive to get;
the conclusion is that it does not justify the work.

---


## Scope decision, 2026-08-24 - filtering is OUT, detection is the card

Fabio, on being shown a filtering design:

> *"How is that even important or relevant? We already have subfolders for each model, and if
> the user drops a LoRA onto the UI, it just goes to the root. We would have to give the user
> a system to create new folders as well [...] the user already has a way of having LoRA
> folders. His own LoRA folders."*

**Defect 1 in the card's brief ("the picker offers a weight the running model cannot load")
is dropped.** Reasons, recorded so it is not re-proposed:

- Users organise their own LoRA folders. Filtering by model would hide a user's own files.
- A LoRA dropped on the UI lands in the root, so filtering would require *also* building
  folder creation and a "which model is this for" prompt - a feature, not a bug fix.
- The card's own brief already called defect 2 *"the bigger one"* and the part that
  *"generalises beyond Klein"*.

Detection alone covers strictly more than filtering would: cross-tier Klein, a corrupt file,
a foreign LoRA (an SDXL LoRA on Qwen), and anything hand-dropped. It adds no fields, no
folder UI, and hides nothing.

## The two candidate sites

### A - loader-side pre-flight, in our own nodes (recommended)

Every LoRA in this app is loaded by a **first-party** node, so the truth is available at the
source. Counted across `comfy_workflows/`:

| node | uses | owner |
|---|---|---|
| `MpiLoraModel` | 144 | `ComfyUi-MpiNodes/loras.py` |
| `MpiLoraModelClip` | 126 | `ComfyUi-MpiNodes/loras.py` |
| `MpiStyleLoras` | 19 | `ComfyUi-MpiNodes/loras.py` |
| `LoraLoaderModelOnly` | 20 | ComfyUI core |

All five `apply_lora` paths funnel into one call, `comfy.sd.load_lora_for_models(...)`
(`loras.py:56, 59, 105, 237, 294`), so there is a single choke point to guard.

**Important mechanic:** in the Klein case the key *names* match - `single_blocks.7.linear1.weight`
exists in both tiers - and only the *shapes* differ (4B rank 3072 vs 9B 4096). So counting
matched keys after `load_lora` would NOT catch it; `load_lora` returns a full patch dict and
the failure surfaces later, in `calculate_weight` at sampling time, as
`ERROR lora ... shape ... is invalid`. The pre-flight therefore has to compare a
representative LoRA tensor dim against the model's, not just count key hits.

- Pro: engine-agnostic (identical local and remote), fails at the source with a clear
  message, no log scraping, catches corrupt/foreign LoRAs too.
- Con: sibling repo. Needs `/mpi-nodes-sync` -> commit -> push -> pin in
  `dev_configs/node_lock.json`. Does not cover the 20 core `LoraLoaderModelOnly` uses.

### B - app-side, read the run's log after the fact

Scrape `ERROR lora ... shape ... is invalid` from the engine log and toast.

- Pro: stays in this repo; covers core loader nodes too.
- Con: the app reads `/internal/logs/raw` **nowhere today** - new plumbing. And it is
  dual-engine (local 48188 vs the Pod wrapper), so it has to be built and proven twice; that
  is the exact "half-wire" shape `.claude/rules/comfy_engine.md` warns about. Also
  after-the-fact: the user has already paid for the generation.

**Recommendation: A**, with B considered only if the core-loader gap matters.

## Investigation notes (kept - true, but no longer actionable here)

The LoRA picker applies **no** type filter: `_mountLoraSlots` / `_mountStagedLoraSlots`
(`MpiModelSettings.js:406`, `:497`) both take a `modelType` parameter and never reference it;
options come raw from `state.availableLoras`. Per the scope decision above this is
**intended behaviour, not a defect** - the user picks from their own folders.

`modelType` being passed to both functions and unused is dead-ish parameter noise. Left
alone deliberately (not this card's mess).

Related, and NOT swept: `_filterByType` at `:57` is real and applied only to **upscalers**
(`:370`). Its doc comment claims subfolders under `loras/` are named after `model.type`,
which is false for 9 of the 12 models carrying LoRA deps (`klein`->`flux2-klein`,
`krea2`->`krea-2`, `ltx`->`ltx-2.3`, `h3`->`minimax-h3`, `wan5b`->`wan-2.2-5b`). That only
matters to the upscaler path, which is out of scope here - noted so the stale comment is not
trusted by the next reader.

## Checks this card must pass

| check | how | result |
|---|---|---|
| Klein 9B LoRA on a 4B run is reported | deliberate cross-tier pick | pending |
| a correctly-matched LoRA still loads silently | any normal Klein run | pending |
| holds on the LOCAL engine | 48188 | pending |
| holds on the REMOTE Pod | Pod run | pending |
