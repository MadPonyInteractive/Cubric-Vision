# MPI-595 — 1.5 release readiness umbrella

**There is no "pre-release" tier.** The project has ONE release flow — bump, build in CI,
publish a GitHub Release (`project_release_model_github_only`, the `mpi-release` skill). So
this card IS the pre-release: the gate list that must read clear before `/mpi-version-bump`
stamps `1.5.0`. Nothing here is a new feature; every gate exists because 1.5 either **claims**
something unverified, **ships an artifact that lies about itself**, or **breaks on the very
surface the notes headline**.

Same shape as MPI-450, which did this for 1.4. Like MPI-450, this card **does not re-parent
anything** — every member keeps its own umbrella (MPI-553, MPI-560, MPI-527, MPI-559). This is
a gate list, not a fold.

## Where 1.5 stands (measured 2026-08-21)

- Version on disk `1.4.2`; **163 commits** since the `v1.4.2` tag; 3 unpushed.
- `npm run release:check` → **passed**.
- `docs/releases/UNRELEASED.md`: **5 whatIsNew, 0 importantChanges, 7 fixes**. Feature bullets
  present → second digit → **1.5.0**.
- The feature surface: **Flows leave the dev gate** (Head Swap, Extend Video, Add Foley,
  Upscale Video, Character Sheet, plus Outpaint landing now), **Character Sheet** and its
  Krea 2 / Krea 2 NSFW model pick, the **LTX Video upscaler as the first real plugin** with
  plugin-owned controls and a Flow-declared plugin requirement, out-of-frame Head Swap boxes,
  and the **agent HTTP surface** (`/connector/*`).
- Board: **0 doing, 67 todo, 119 done** (MPI-594, MPI-520 and MPI-531 all closed 2026-08-21).

The risk in this release is concentrated in two places: **the Flow surface**, which goes from
dev-gated to the headline feature in one version, and the **release pipeline itself**, which
has a CI-red guard and a stale update manifest sitting in `todo` from the 1.4 close-out.

---

## Gate A — must fix (code)

> **Two of the original seven cleared on 2026-08-21** (MPI-531, and MPI-520 + MPI-594 in
> Gate B). What remains is the PiD chain, the release pipeline, and the two live-surface bugs.

| Card | Why it gates 1.5 |
|---|---|
| **MPI-515** (umbrella MPI-553) | The only card on the board labelled **1.5 BLOCKER** by its own text. PiD carries the deprecation badge shipped in 1.4 (MPI-514); 1.5 is where the `nvidia-pid` ModelDef leaves `models.js` and the Model Library. It is blocked behind **MPI-507** (PiD as four upscale-dropdown plugins) — a removal cannot land before its replacement exists, so the real gate is **MPI-507 → MPI-515**. If 507 slips, the badge lies for a second consecutive release. **HARD RULE carried from the card: do NOT delete the `pid-*` / `vae-*` / `pid-gemma` dep entries** — `_orphanedDepIds` walks `DEPS` and can only reclaim a weight that still has one. |
| ~~**MPI-531**~~ **CLEARED 2026-08-21** | Was the second 1.5 blocker. Acceptance is met and verified in code: `js/data/flowsRegistry.js` holds **zero** `uiComponent` occurrences across all six Flows, and `MpiFlowHeadSwap` no longer exists — deleted by `64279953` *"feat(MPI-572): flows declare their controls — uiComponent is gone"*. The port surface the card fought to hold at one component is now **zero**. Items 1, 3 and 4 landed; item 2 (`steps[].image`, a per-step intro image) was never built, is **not** part of acceptance, and carries to MPI-560. |
| **MPI-527** (members MPI-522 + MPI-523) | The release pipeline ships artifacts that lie about themselves. **MPI-522:** `assertNoDanglingSymlinks` misses on a CI Windows runner AND its test reports PASS locally while testing nothing (this box cannot create symlinks, so it hits its own skip path and counts green) — a false green is why the broken guard survived. **MPI-523:** an in-place update never refreshes the installed `update-manifest.json`. Both cost real diagnosis time at the 1.4.0 close-out; both are still open going into a bigger release. |
| **MPI-516** | **Explicitly deferred TO 1.5 by Fabio on 2026-08-10.** A prompt destroyed mid-flight hangs the app forever: progress bar frozen, no error, no toast, nothing in the log — and on a Pod the user is billed watching a dead generation. 1.5 multiplies the dispatch surface (six Flows plus the agent HTTP route), which multiplies the ways this fires. It is a **port**, not a design problem: `scripts/smoke-workflows.mjs` already has the three-signal detector (absent from history AND absent from the queue AND the engine answering). **Port it WITH its guard** — MPI-450 found a false-positive path in that same detector on 2026-08-10. |
| **MPI-575** | The LTX latent preview flashes junk frames on **foley and extend** — two of the Flows this release headlines. It flashes identically in the Gallery card, the Flow result pane and the History viewer, which places it upstream of the ring, in the frames. Root read is already written (KJNodes `LTX2SamplingPreviewOverride` slicing the latent before decode) but **not measured on a live run** — budget the measurement, do not fix from the brief. Shipping "Flows are out of preview" with a broken preview on the audio flows is the wrong headline. |

**Any Gate A card that is not fixed must be written into the release notes as a known issue.**
Silently open is not an option — that is the whole point of this card.

---

## Gate B — must verify (no code expected)

| Item | Why it gates 1.5 |
|---|---|
| ~~**MPI-520**~~ **CLEARED 2026-08-21** | The live-generation gate closed **on evidence, not on say-so**: `flowLtxExtend_001.mp4` is a real app-dispatched extend output and is the source clip of the foley `/history` readback in MPI-531's validation, which also records an extend run carrying dispatched (not baked) prompt values. MPI-581 then built the Extend Video hero from real output (`44a4843d`) and MPI-582 added the describe step the live flow was missing (`db17b39c`). `Input_Width`/`Input_Height` as `MpiInt` stays deliberately deferred — it needs a bench re-export and the flow is coherent without it. |
| ~~**MPI-594**~~ **CLEARED 2026-08-21** | Outpaint Flow closed by session `87018060`: both preview assets shipped (`flow-outpaint.webp` 896×1120, `flow-outpaint.mp4` 1280×800/5.00s), reuse-across-restart verified in a fresh process, 657/657 tests, `release:check` passed. **Left open by design:** the NSFW arm has never RUN through this flow, only resolved — Fabio's call. Outpaint is therefore a real sixth Flow for the notes (Gate C). |
| **MPI-559 phase 1 — the Linux leg** | **Not blocked** (a Linux desktop has been on hand since 2026-07-30; the umbrella says explicitly this must not re-block it). Extract the real `CubricVision-linux-x64-v1.5.0.tar.gz`, let the LOCAL engine provision, install nodes, run one model per family. **A RunPod run does not substitute.** The macOS leg stays blocked on the missing Mac and becomes a Gate C known-issue decision. |
| **Both test suites** | `npm test` and `npm run test:desktop` green. They gate `mpi-version-bump` step 6 and CI runs them on every push — run them here so a red suite is not discovered at bump time. The desktop suite does **not** need the app closed (MPI-448). |
| **Smoke evidence** | `release:check` REFUSES a bumped engine with no `dev_configs/smoke-evidence.json` (MPI-465/467). **No engine bump is planned for 1.5**, so confirm the pin is unchanged rather than assuming it — and decide whether the new Flow/plugin ops still warrant a `node scripts/smoke-workflows.mjs --plan` pass on the ops 1.5 adds. |

---

## Gate C — must decide (cheap, but the notes are false without it)

| Item | Decision |
|---|---|
| **Claim audit of `UNRELEASED.md`** | Read all 12 bullets against what actually shipped. This release's own close-outs already caught three wrong claims (MPI-588's specificity count, and two in MPI-592/MPI-593), so the audit is not theoretical. Same pass folds the file into `RELEASE_NOTES['1.5.0']`. Apply Gate 0 from `.claude/skills/mpi-release/references/copy-review.md`: check every "used to / previously / no longer" against `git show v1.4.2:<path>`. |
| **The shipped Flow list** | The notes currently name five Flows. **Outpaint (MPI-594) is a sixth landing now.** Freeze the list before the notes freeze — a Flow named in the notes and absent from the build is the worst failure mode here. |
| **MPI-515's fate** | If MPI-507 does not land, 1.5 ships with a deprecated ModelDef still in the Model Library. That needs an explicit known-issue line, not silence. |
| **The macOS leg (MPI-559 / MPI-416)** | Still no Mac. Carry the 1.4 known-issue line forward (`xcode-select --install` first) or drop macOS from the claim surface. Decide, do not inherit by accident. |
| **Toast cards — in or out** | MPI-543 (notification history), MPI-544 (install-toast spam, never reproduced), MPI-569 (wrong toast on an exempt Enhance op). None blocks 1.5. Decide once so they stop being re-read every close-out. |

---

## Gate D — hygiene before the bump

- **3 unpushed commits** — push before the cut.
- **Working tree is dirty** — `js/data/flowsRegistry.js`, `js/data/modelConstants/models.js`,
  `docs/playbooks/add-flow/06-preview-image.md`, two new `comfy_workflows/display/flow-outpaint.*`
  assets, plus kanban state. Committed by explicit pathspec, never `git add -A`.
- **`python scripts/overtaken-cards.py`** — lists `todo` cards whose id appears in a commit dated
  after the card's own `updated_at`. Found two already-finished cards at the 1.4 close-out.
- ~~Three stale-blocked cards~~ — **MPI-557 and MPI-518 corrected 2026-08-21** (below). The Flow-card
  adoption into MPI-560 is still open.
- **`/mpi-version-bump` stamps 1.5.0** — second digit: this release adds features, ops and a new
  entity (plugins).

---

## Found by this sweep — not gates, but fix them here

These surfaced while building the gate list and cost nothing to correct:

- ~~**MPI-557 (Video face detailer) is stale-blocked**~~ — **FIXED 2026-08-21.** Its text said
  "NOW BLOCKED ON MPI-579 INSTEAD"; MPI-579 (LTX Video upscaler plugin) **and** MPI-580 (the
  plugin entity, which supplies the Flow-declares-a-plugin mechanism it names) are both `done`.
  Maturity `blocked` → `planned`. What is left to bench narrowed too: the LTX arm is now a
  known quantity, so the only open question is whether it beats SeedVR2 and plain `.pth`
  **at face-crop scale**.
- ~~**MPI-518 (H3 w4a8 DiTs) is stale-blocked**~~ — **FIXED 2026-08-21.** It was blocked on
  "the 1.4 release AND GPU availability"; 1.4 shipped 2026-08-10 and 1.4.2 followed on 08-15,
  so only the GPU half survives. Stays `blocked`, on that alone.
- **STILL OPEN — six Flow cards sit outside MPI-560**, whose own text says "every Flow-related
  card lives in one place": MPI-594 (Outpaint, now `done`), MPI-586 (Prop Sheet), MPI-567
  (Scribble-to-object), MPI-591 (Extend Video + H3), MPI-557 (Video face detailer — Fabio: "it
  is a flow"), MPI-355 (4K/8K localized-edit Flow). Adopt them into MPI-560 or the umbrella's
  claim is false. **Awaiting Fabio's go.**
- **MPI-531 item 2 (`steps[].image`) has no home yet** — it left MPI-531 on close and belongs
  in MPI-560 with the adoption above. Do not let it evaporate: it is a manifest field, so it is
  cheap now and awkward after the 1.6 format freezes.

---

## Not in 1.5 (recorded so it is a decision, not an oversight)

- **MPI-591** (Extend Video takes H3) — deferred on purpose by Fabio, and hard-blocked: the two
  core nodes are on ComfyUI **master only**, in no tagged release.
- **MPI-578** (LTX 2.5 upscaler) — blocked on the same engine bump.
- **MPI-532** (community flow packages) — 1.6 by design; 1.5 only pays for the authoring shape.
- **MPI-573** (audio as an output media type) — its own track.
