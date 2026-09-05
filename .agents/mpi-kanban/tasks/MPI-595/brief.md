# MPI-595 — 2.0 release readiness umbrella

**There is no "pre-release" tier.** The project has ONE release flow — bump, build in CI,
publish a GitHub Release (`project_release_model_github_only`, the `mpi-release` skill). So
this card IS the pre-release: the gate list that must read clear before `/mpi-version-bump`
stamps the next version. Nothing here is a new feature; every gate exists because the release
either **claims** something unverified, **ships an artifact that lies about itself**, or
**breaks on the very surface the notes headline**.

Same shape as MPI-450, which did this for 1.4. Like MPI-450, this card **does not re-parent
anything** — every member keeps its own umbrella (MPI-553, MPI-560, MPI-527, MPI-559). This is
a gate list, not a fold.

## RETARGETED 1.5 → 2.0 on 2026-08-26

The card was written on 2026-08-21 against a `1.5.0` cut. **The next release is 2.0** —
`docs/releases/UNRELEASED.md` says so in its own header (Fabio, 2026-08-26): *"the next bump is
intended as 2.0 — a major release, and Flows are what makes it one"*. Every `1.5` reference in
this card was a version label, never a gate.

**Why the card survived the retarget rather than being deleted:** all seven Gate A cards are
untouched since 2026-08-21 — MPI-507, MPI-515, MPI-527, MPI-522, MPI-523, MPI-516 and MPI-575
are each still `todo` with an `updated_at` older than this card. Nothing on the gate list was
fixed, so nothing on it went stale. What went stale was the measured snapshot, which is why
there is no longer one (below).

**This card does NOT need 2.0's date or its contents frozen to be valid.** It is a gate
MECHANISM, not a content manifest: "these must read clear before the bump" holds whether the
bump is next week or next quarter, and whether 2.0 ships eight Flows or eighteen. The one thing
it must not do is carry stale numbers, so it carries none.

## Where the release stands — MEASURE ON PICKUP, do not read it here

The 2026-08-21 snapshot (commit count, `UNRELEASED.md` bullet counts, board column counts) was
**deleted on 2026-08-26 rather than refreshed**. It was five days old and already wrong on
every line — 163 commits had become 356, five Flows had become eight in the notes and nine in
the registry. A number in this file rots faster than the card is read.

`checklist.md` § ON PICKUP is the re-measure list. Run it; do not trust prose.

What is stable enough to state: the feature surface is **Flows leaving the dev gate**, which is
what makes this a major version — plus Character Sheet and its Krea 2 model pick, the LTX Video
upscaler as the first real plugin, and the agent HTTP surface (`/connector/*`).

The risk is concentrated in two places: **the Flow surface**, which goes from dev-gated to the
headline feature in one version, and the **release pipeline itself**, which has a CI-red guard
and a stale update manifest sitting in `todo` since the 1.4 close-out.

---

## Gate A — must fix (code)

> **Two of the original seven cleared on 2026-08-21** (MPI-531, and MPI-520 + MPI-594 in
> Gate B). **Re-verified 2026-08-26: the remaining five are all still open and all untouched.**
> What remains is the PiD chain, the release pipeline, and the two live-surface bugs.

| Card | Why it gates the release |
|---|---|
| **MPI-515** (umbrella MPI-553) | The only card on the board labelled a release **BLOCKER** by its own text. PiD carries the deprecation badge shipped in 1.4 (MPI-514); this release is where the `nvidia-pid` ModelDef leaves `models.js` and the Model Library. It is blocked behind **MPI-507** (PiD as four upscale-dropdown plugins) — a removal cannot land before its replacement exists, so the real gate is **MPI-507 → MPI-515**. If 507 slips, the badge lies for a second consecutive release. **HARD RULE carried from the card: do NOT delete the `pid-*` / `vae-*` / `pid-gemma` dep entries** — `_orphanedDepIds` walks `DEPS` and can only reclaim a weight that still has one. |
| ~~**MPI-531**~~ **CLEARED 2026-08-21** | Was the second blocker. Acceptance is met and verified in code: `js/data/flowsRegistry.js` holds **zero** `uiComponent` occurrences across every Flow, and `MpiFlowHeadSwap` no longer exists — deleted by `64279953` *"feat(MPI-572): flows declare their controls — uiComponent is gone"*. The port surface the card fought to hold at one component is now **zero**. Items 1, 3 and 4 landed; item 2 (`steps[].image`, a per-step intro image) was never built, is **not** part of acceptance, and carries to MPI-560. |
| **MPI-527** (members MPI-522 + MPI-523) | The release pipeline ships artifacts that lie about themselves. **MPI-522:** `assertNoDanglingSymlinks` misses on a CI Windows runner AND its test reports PASS locally while testing nothing (this box cannot create symlinks, so it hits its own skip path and counts green) — a false green is why the broken guard survived. **MPI-523:** an in-place update never refreshes the installed `update-manifest.json`. Both cost real diagnosis time at the 1.4.0 close-out; both are still open going into a bigger release. |
| **MPI-516** | **Explicitly deferred by Fabio on 2026-08-10 to the next feature release** (then 1.5, now 2.0 — the deferral was to the release, not to the digit). A prompt destroyed mid-flight hangs the app forever: progress bar frozen, no error, no toast, nothing in the log — and on a Pod the user is billed watching a dead generation. This release multiplies the dispatch surface (eight-plus Flows plus the agent HTTP route), which multiplies the ways this fires. It is a **port**, not a design problem: `scripts/smoke-workflows.mjs` already has the three-signal detector (absent from history AND absent from the queue AND the engine answering). **Port it WITH its guard** — MPI-450 found a false-positive path in that same detector on 2026-08-10. |
| **MPI-575** | The LTX latent preview flashes junk frames on **foley and extend** — two of the Flows this release headlines. It flashes identically in the Gallery card, the Flow result pane and the History viewer, which places it upstream of the ring, in the frames. Root read is already written (KJNodes `LTX2SamplingPreviewOverride` slicing the latent before decode) but **not measured on a live run** — budget the measurement, do not fix from the brief. Shipping "Flows are out of preview" with a broken preview on the audio flows is the wrong headline. |

**Any Gate A card that is not fixed must be written into the release notes as a known issue.**
Silently open is not an option — that is the whole point of this card.

---

## Gate B — must verify (no code expected)

| Item | Why it gates the release |
|---|---|
| ~~**MPI-520**~~ **CLEARED 2026-08-21** | The live-generation gate closed **on evidence, not on say-so**: `flowLtxExtend_001.mp4` is a real app-dispatched extend output and is the source clip of the foley `/history` readback in MPI-531's validation, which also records an extend run carrying dispatched (not baked) prompt values. MPI-581 then built the Extend Video hero from real output (`44a4843d`) and MPI-582 added the describe step the live flow was missing (`db17b39c`). `Input_Width`/`Input_Height` as `MpiInt` stays deliberately deferred — it needs a bench re-export and the flow is coherent without it. |
| ~~**MPI-594**~~ **CLEARED 2026-08-21** | Outpaint Flow closed by session `87018060`: both preview assets shipped (`flow-outpaint.webp` 896×1120, `flow-outpaint.mp4` 1280×800/5.00s), reuse-across-restart verified in a fresh process, 657/657 tests, `release:check` passed. **Left open by design:** the NSFW arm has never RUN through this flow, only resolved — Fabio's call. |
| **MPI-559 phase 1 — the Linux leg** | **Not blocked** (a Linux desktop has been on hand since 2026-07-30; the umbrella says explicitly this must not re-block it). Extract the real Linux tarball for whatever version is being cut, let the LOCAL engine provision, install nodes, run one model per family. **A RunPod run does not substitute.** The macOS leg stays blocked on the missing Mac and becomes a Gate C known-issue decision. |
| **Both test suites** | `npm test` and `npm run test:desktop` green. They gate `mpi-version-bump` step 6 and CI runs them on every push — run them here so a red suite is not discovered at bump time. The desktop suite does **not** need the app closed (MPI-448). |
| **Smoke evidence** | `release:check` REFUSES a bumped engine with no `dev_configs/smoke-evidence.json` (MPI-465/467). **Confirm the pin in `dev_configs/node_lock.json` against the last release rather than assuming it** — the original card said "no engine bump is planned", which was true on 2026-08-21 and is not a claim this file can keep making across 350-plus commits. Also decide whether the ops added since the last cut warrant a `node scripts/smoke-workflows.mjs --plan` pass. |
| **Flows must ENTER the smoke matrix — 2.0 is the release that ships them** | Added 2026-09-05 (Fabio). The matrix is `model × supportedOps`, so the 14 `flow_*.json` graphs get **static coverage only** — `engine-floor-check` reads all 53 workflows and confirms 0 missing `class_types`, and nothing ever executes one. A green matrix today says **nothing** about whether a Flow runs. That was tolerable while Flows were dev-gated; 2.0 is the release that makes them the beginner surface, so it stops being tolerable here. Needs a runner that can take a Flow as a unit (its own descriptor, media I/O and `uiComponent`), not just a model id — the runner's `--models` selector has no Flow equivalent. Until then, say it out loud in the release notes rather than letting a green matrix imply coverage it does not have. |

---

## Gate C — must decide (cheap, but the notes are false without it)

| Item | Decision |
|---|---|
| **Claim audit of `UNRELEASED.md`** | Read every bullet against what actually shipped. This release's own close-outs already caught three wrong claims (MPI-588's specificity count, and two in MPI-592/MPI-593), so the audit is not theoretical. Same pass folds the file into `RELEASE_NOTES['2.0.0']`. Apply Gate 0 from `.claude/skills/mpi-release/references/copy-review.md`: check every "used to / previously / no longer" against `git show v1.4.2:<path>`. **The 2.0 framing adds a second trap the header already names: a "fix" to a Flow is not a fix to anything a user ever had**, because no shipped release note has ever mentioned Flows. |
| **The shipped Flow list — RECONCILE LATE, do not freeze early** | **More Flows are coming before 2.0 cuts (Fabio, 2026-08-26). This is an actively growing list and no number in this card, or in `UNRELEASED.md`, can be trusted until the notes freeze.** So the gate is NOT "pick a number now" — it is a **mechanical reconcile run once, immediately before the notes freeze**: diff the flow ids in `js/data/flowsRegistry.js` against the Flows named in `UNRELEASED.md`, and make the count sentence ("Eight to start with") match whatever the diff says on that day. Every new Flow that lands between now and the cut re-breaks this, which is exactly why it runs last and only once. **Current instance of the drift, recorded as the worked example, NOT as the answer:** on 2026-08-26 the notes named eight (Head Swap, Extend Video, Add Foley, Upscale Video, Draw It In, Scribble, Character Sheet, Outpaint) while the registry held nine — the extra being **`voice-changer`**, in no bullet. A Flow named in the notes and absent from the build, or in the build and absent from the notes, is the worst failure mode here. |
| **MPI-515's fate** | If MPI-507 does not land, the release ships with a deprecated ModelDef still in the Model Library. That needs an explicit known-issue line, not silence. |
| **The macOS leg (MPI-559 / MPI-416)** | Still no Mac. Carry the 1.4 known-issue line forward (`xcode-select --install` first) or drop macOS from the claim surface. Decide, do not inherit by accident. |
| **Toast cards — in or out** | MPI-543 (notification history), MPI-544 (install-toast spam, never reproduced), MPI-569 (wrong toast on an exempt Enhance op). None blocks the release. Decide once so they stop being re-read every close-out. |
| ~~**Is a major digit anything but a label here?**~~ **ANSWERED by Fabio 2026-08-26** | **Yes — Flows make it major, and the reason is audience, not code.** No migration or compat note is owed: nothing in `mpi-version-bump` or the update path keys off the major digit. What justifies it is that Flows **open the app to a user who could not use it before** — someone for whom the workspace UI was out of reach or simply hard. Flows are extremely simple and straightforward, so they pull in a different kind of user entirely. **And the second half, which is a competitive claim and belongs in the notes copy:** some of these Flows **do not exist anywhere else, or exist only behind proprietary websites.** Write the release body to that — a major version here means a new front door and capabilities with no free equivalent, not a breaking change. |

---

## Gate D — hygiene before the bump

- **Push anything unpushed** — count it at pickup, do not read a number from this file.
- **Commit the working tree by explicit pathspec**, never `git add -A` (`.claude/rules/git.md`).
- **`python scripts/overtaken-cards.py`** — lists `todo` cards whose id appears in a commit dated
  after the card's own `updated_at`. Found two already-finished cards at the 1.4 close-out, and
  350-plus commits have landed since this card was written, so expect hits.
- ~~Three stale-blocked cards~~ — **MPI-557 and MPI-518 corrected 2026-08-21** (below). The Flow-card
  adoption into MPI-560 is still open.
- **`/mpi-version-bump` stamps `2.0.0`**, then `/mpi-release`.

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
- **STILL OPEN — Flow cards sit outside MPI-560**, whose own text says "every Flow-related
  card lives in one place": MPI-586 (Prop Sheet), MPI-591 (Extend Video + H3), MPI-557 (Video
  face detailer — Fabio: "it is a flow"), MPI-355 (4K/8K localized-edit Flow). **MPI-594
  (Outpaint) and MPI-567 (Scribble-to-object) are now `done`** and no longer need adopting —
  MPI-567 closed 2026-08-24, after this card was written. Adopt the four survivors into MPI-560
  or the umbrella's claim is false. **Awaiting Fabio's go.**
- **MPI-531 item 2 (`steps[].image`) has no home yet** — it left MPI-531 on close and belongs
  in MPI-560 with the adoption above. Do not let it evaporate: it is a manifest field, so it is
  cheap now and awkward after the next format freeze.

---

## Not in this release (recorded so it is a decision, not an oversight)

- **MPI-591** (Extend Video takes H3) — deferred on purpose by Fabio, and hard-blocked: the two
  core nodes are on ComfyUI **master only**, in no tagged release.
- **MPI-578** (LTX 2.5 upscaler) — blocked on the same engine bump.
- **MPI-532** (community flow packages) — post-2.0 by design; 2.0 only pays for the authoring shape.
- **MPI-573** (audio as an output media type) — its own track. **Now `done`** — re-read it at
  pickup before repeating "its own track", because if it landed it may owe a notes bullet.

> These four were listed on 2026-08-21 and have NOT been re-adjudicated for a 2.0 scope. A major
> version is a bigger container than the 1.5 they were excluded from — ask Fabio whether any
> should come back in, rather than inheriting a 1.5-era exclusion by accident.
