---
rules_dir: .claude/rules
critical_snapshot_file: CLAUDE.md
critical_snapshot_anchor: critical-rules-snapshot-applies-to-all-agents-always-no-file-read-required
rules:
  - name: behaviour
    file: behaviour.md
  - name: kanban
    file: kanban.md
  - name: dos_and_donts
    file: dos_and_donts.md
  - name: components
    file: components.md
  - name: events
    file: events.md
  - name: state
    file: state.md
  - name: workspaces
    file: workspaces.md
  - name: downloads
    file: downloads.md
  - name: versioning
    file: versioning.md
  - name: comfy_engine
    file: comfy_engine.md
  - name: comfy_injection
    file: comfy_injection.md
  - name: component-mounts
    file: component-mounts.md
  - name: component-events
    file: component-events.md
  - name: component-state
    file: component-state.md
  - name: component-comfy
    file: component-comfy.md
  - name: component-events-primitives
    file: component-events-primitives.md
  - name: component-events-blocks
    file: component-events-blocks.md
  - name: component-events-organisms
    file: component-events-organisms.md
  - name: component-events-lifecycle
    file: component-events-lifecycle.md
bundles:
  - name: frontend-worker
    rules: [behaviour, kanban, dos_and_donts, components, events, state]
  - name: comfy-worker
    rules: [behaviour, kanban, dos_and_donts, comfy_engine, comfy_injection]
  - name: component-maps
    rules: [behaviour, component-mounts, component-events, component-state, component-comfy]
gpu_command_patterns:
  - "scripts/pre_release_test\.py"
  - "scripts/smoke-workflows\.mjs(?!.*(--plan|--self-check))"
  - "127\.0\.0\.1:(8188|48188)/prompt"
  - "/connector/generate"
---

# mpi-brief-rule config

Config for `/mpi-brief-rule <name>` — CLAUDE.md § Sub-Agent Dispatch step 1.
Without this file `loadConfig()` returns `null` and the MANDATORY briefing step
emits "No mpi-kanban config found" and stops for every rule name. It was missing
until 2026-08-08, so every sub-agent dispatched before that date started with no
briefing at all.

`behaviour` is first in every bundle: generic agent conduct (claims discipline,
shell style, multi-agent isolation, four-bullet reporting), true in every repo.
`kanban` follows because it carries this repo's § File claims and card contract.

The `.claude/agents/*.md` worker archetypes are named for the three bundles and
tell the dispatcher which one to resolve.

Rules with no `## Sub-Agent Briefing` section, so deliberately unlisted:
`README.md` (index), `comfy_injection_multistage.md`, `git.md` (its content is
carried by the kanban briefing).

## `gpu_command_patterns` — why these four

Added 2026-08-19. `guard-gpu` is opt-in: with no list it exits 0 and enforces
nothing, which is how this repo ran until now. The lease behind it
(`<mpi-lib>/scripts/gpu_lease.py`) is **machine-global** —
`~/.mpi-kanban/gpu/<index>.lock`, one file per NVIDIA device, held by a kernel
exclusive lock for the command's lifetime. So it serialises agents across
*every* repo on this box, not just this one, and the kernel drops the lock on
exit, crash, Ctrl-C or `TaskStop` — no TTL, no stale lease to reclaim.

Wrap a matched command as a BACKGROUND Bash call so the waiting costs no tokens:

```
python "${CLAUDE_PLUGIN_ROOT}/skills/mpi-lib/scripts/gpu_lease.py" run -- <command>
python "${CLAUDE_PLUGIN_ROOT}/skills/mpi-lib/scripts/gpu_lease.py" status
```

The four patterns are the commands that actually *execute* a generation from the
shell. They are deliberately narrow — the guard blocks on a regex hit with no
"this one is fine" escape, so a broad pattern taxes ordinary work:

- `scripts/pre_release_test\.py` — submits every op to a running ComfyUI. Local card, long.
- `scripts/smoke-workflows\.mjs` — a minimal generation per op. Pod GPU, and real money.
- `127\.0\.0\.1:(8188|48188)/prompt` — direct dispatch to the bench (8188) or the app engine (48188).
- `/connector/generate` — the app route that lands a real gallery card.

Deliberately NOT matched, and each for a reason:

- Read-only probes (`/queue`, `/history`, `/object_info`) — leasing a card to ask
  a question is pure friction.
- Booting the app (`npm start`, `npm run app:isolated`) — that loads a server, it
  does not compute. Leasing it would hold a device for a whole session.
- `/proxy/prompt` — remote Pod, not the local device. Pod collisions are
  `guard-runpod-create.py`'s job.

**The enforcement is per-repo, the lock is not.** Agents here now take the lease;
agents in a repo with no `gpu_command_patterns` still walk straight onto the card.
Add the same block there to close the loop.
