# MPI-593 Brief

> Agreed with Fabio 2026-08-21 and parked on the backlog deliberately - the plan is
> settled, the work is not scheduled. Written from the planning session that closed
> MPI-592; the four questions at the bottom are still open and are the first thing to
> resolve when this card is picked up.

---

# The agent interface for Cubric Vision — CLI first, docs second

## Context

Fabio wants a user with an agentic workflow — Gemini CLI, Codex, Claude, whatever
— to say *"generate me an image in Cubric Vision"* and have their agent know what
to do. Not developers in this repo: **end users driving an installed build**.

Three things exist today and none of them serve that user:

| Channel | Serves | State |
|---|---|---|
| Broker / connector envelope (`@cubric/connector`) | Sibling Cubric apps — Prompt today, Studio later | Built, working, not an agent problem |
| `.claude/skills/cubric-vision/SKILL.md` | Coding agents inside this repo | 531 lines, and **excluded from the portable build** ([build-portable.mjs:104](scripts/build-portable.mjs#L104), `.claude` in `APP_COPY_EXCLUDES`) |
| 137 HTTP routes on loopback | Anyone who already knows they exist | No auth, no SDK — genuinely agent-neutral, genuinely undiscoverable |

So an end user's agent has no way to *know* Vision is there, and no way to *act*
that does not start with someone hand-delivering a 531-line markdown file.

MCP is out, and the instinct is right for a concrete reason: MCP loads every tool
schema into context at session start whether or not it is used. With this surface
that is permanent per-conversation overhead. A CLI's `--help` is pay-per-use, and
every agent can run a shell command — not every agent speaks MCP.

## Recommendation

**Stop making one artifact serve three consumers.** Leave the broker alone. Then:

1. **A small Node CLI is the act layer.** ~10 verbs, not 137 routes.
2. **`cubric skill` is the know layer** — the CLI prints its own agent guide to
   stdout. One command, any agent, no vendor file format, no MCP.
3. **`llms.txt` is the discovery layer** — it already exists on the docs site and
   says nothing about the API. One section fixes that.

### Why Node, not the Python CLI-Anything emits

[cli-anything.md](.agents/mpi-kanban/tasks/MPI-546/research/cli-anything.md) left
this as "Fabio's call": it emits a Click package on PyPI, and Vision is
Node/Electron with no Python in the user story. It is answerable now —

**The shipped artifact is already used as a Node runtime.** The Windows online
updater runs `win-update.cjs` *through `CubricVision.exe` as node* — the in-app
update button and `update.bat` both take that path, deliberately, so no blocked
script sits in the chain ([build-portable.mjs:555-556](scripts/build-portable.mjs#L555-L556)).
So a JS CLI ships *inside* the app at zero runtime cost, and the same source
publishes as `@cubric/cli` for `npx`. Python would mean asking every end user to
install a second runtime to talk to a desktop app they already have.

> Cited as `build-portable.mjs:87` when this card was written, corrected
> 2026-08-21 by the close-out claim audit. Line 87 is a comment about why the
> *old update applier* cannot delete `app/` — true, and about the updater, not
> about the shipped app. The conclusion is unchanged; only the evidence moved.

Still worth running `/cli-anything` against the finished surface as a **draft
generator** — it will name endpoints and flags worth stealing. Treat the output
as a sketch to port, not the artifact.

### v1 verb scope

The user story is "make me an image / a video, in a project". That is:

```
cubric status                      # is the app up, is the engine ready
cubric projects list
cubric projects create <name>
cubric projects open <folderPath>  # MPI-592 — the one that makes the rest land right
cubric generate --model krea2 --op t2i --prompt "..."
cubric media list [--project <p>]
cubric media get <id> [--out <path>]
cubric prompt-of <image>           # recover prompt/model/settings from the sidecar
cubric skill                       # print the agent guide to stdout
```

Everything else stays raw HTTP for whoever wants it. Wrapping 137 routes is how
this turns into a maintenance project instead of a feature.

Two rules the CLI must carry from the skill, because they are correctness, not
style:

- **`open` before `generate`.** Without it a generation lands in whatever project
  is open and reports `ok: true` either way (MPI-592).
- **Whole prompts, never fragments.** `prompt-of` prints positive and negative as
  two complete blocks, ready to paste over.

### The skill split

531 lines today. Measured sections:

| Section | Lines |
|---|---|
| The on-disk format | 149 |
| Projects | 80 |
| Dispatching a generation | 75 |
| everything else (10 sections) | 227 |

Split the same way CLAUDE.md already routes this repo — a thin entry that points
at deeper files, each ≤200 lines:

- **entry** (~80 lines): base URL, liveness check, the whole-prompts rule, what
  exists, where to go. Once the CLI ships, "how to call it" collapses to
  `cubric --help` and this shrinks again.
- **`on-disk-format.md`** (149): reference, read only when working offline.
- **`generating.md`**: dispatch + reference slots + the model-id trap.
- **`engine-and-remote.md`**: engine control, RunPod, system.

## Files

| Path | Change |
|---|---|
| new `packages/cli/` (or a sibling repo — see Questions) | The Node CLI. Thin client over the routes; no logic of its own |
| [scripts/build-portable.mjs](scripts/build-portable.mjs) | Ship the CLI + its guide into the artifact. `.claude` stays excluded — the guide gets its own home, it does not ride along in a vendor folder |
| [.claude/skills/cubric-vision/SKILL.md](.claude/skills/cubric-vision/SKILL.md) | Split to a thin entry + on-demand files |
| `c:\AI\Mpi\Cubric Studio (Docs)\llms.txt` | Add an "Agent Interface" section naming the CLI, the install line, and the guide URL. **That repo is a hard no-push** — leave the commit to Fabio |
| [docs/releases/portable-distribution-contract.md](docs/releases/portable-distribution-contract.md) | Record the CLI in the artifact contract |

## Verification

The test is not "does the command run" — it is *can a foreign agent do this cold*:

1. `npm run app:isolated`, then drive the CLI end to end:
   `cubric projects create` → `cubric projects open` → `cubric generate` →
   confirm the image lands under the **new** project's `Media/`. Same assertion
   that closed MPI-592; the file path is the proof, never the exit code.
2. `cubric skill | wc -l` — non-empty, and it is the guide, not `--help`.
3. **Cold-agent test.** Open a Codex or Gemini session with no Cubric context,
   give it one line — *"Cubric Vision is installed; run `cubric skill` and then
   make me an image of a red bicycle"* — and watch whether it gets there without
   help. That is the actual product requirement, and it is the only test that
   measures it.
4. `npm test` + `npm run test:desktop` unaffected.

## Sequencing

Card as an umbrella with three children, in this order:

1. **Split the skill.** Days, no new artifact, and it makes the guide small enough
   to be worth shipping. Do this first regardless of what happens to the CLI.
2. **The CLI**, scoped to the verbs above, plus `cubric skill`.
3. **Ship + discover** — into the portable build, into `llms.txt`, into the docs
   site with a stable URL.

Step 1 has value even if the CLI never ships. Step 3 is worthless without a
decision on step 2, which is why the doc's home is not being settled twice.

## Questions

- **Where does the CLI live, and is it published?** `@cubric/cli` on npm is
  discoverable and gives `npx` zero-install, but a published package is a public
  maintenance commitment. Bundled-only is private and free. My lean: **both, one
  source** — bundled for the portable user, npm for the agent that would rather
  `npx`. Repo-wise it belongs beside `@cubric/connector` in Cubric-Studio
  `packages/`, since the hub already owns the shared packages.
- **Is that verb list right for v1?** Notably absent: media *inputs* to
  `generate` — the route rejects them today (`MEDIA_UNSUPPORTED`), so i2i / v2v
  are out until that lands. Fine for v1, or is "make a video from this image" a
  day-one requirement?
- **Running app only, or headless?** The research doc is clear that headless
  needs dispatch out of the renderer — 3,670 lines of `generationService` /
  `commandExecutor` bound to `MpiToast`, `PromptBoxControls`, `state`. Separate
  project. Confirming v1 is remote-control only.
- **One umbrella or three loose cards?**
