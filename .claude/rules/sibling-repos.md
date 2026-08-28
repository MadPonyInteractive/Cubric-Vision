# Sibling repos — access WITHOUT loading their config

> Moved out of `CLAUDE.md` 2026-08-28 (token diet). Read before touching anything under
> `c:\AI\Mpi\` that is not Cubric-Vision.

Cubric-Vision is **master** (has `.claude/`, kanban, jsconfig, CLAUDE.md). The siblings under
`c:\AI\Mpi\` — `Cubric-Studio`, `MadPony-Identity`, `mpi-ci`, `Cubric-Prompt`,
`Cubric Studio Brand Assets` — are reachable via `permissions.additionalDirectories` in
`.claude/settings.json`, **deliberately NOT VS Code workspace folders.**

Related on-disk siblings in neither list: `CubricStudio_Redesign` (design playground,
intentionally no git), `Cubric Studio (Website)` and `Cubric Studio (Docs)` (separate repos).

## Why, and do not undo it

A workspace folder behaves as `--add-dir`, which also loads that repo's `.claude/skills/`,
`.claude/agents/` and its settings' `enabledPlugins` / `extraKnownMarketplaces`. Measured
2026-07-29 in the reverse direction: a Cubric-Prompt session holding this repo as a workspace
folder was running **10 Vision skills + 4 Vision commands**, plus MadPony-Identity's rival
`mpi-end` and Vision's `enabledPlugins`.

`permissions.additionalDirectories` grants the same read/edit access with **none** of that
config loading. So: **never re-add the siblings to `Cubric-Vision.code-workspace`, and never
`/add-dir` them mid-session.** Expect a workspace-trust dialog on first start — declining it
leaves the grant inert.

**The two halves propagate differently.** `Cubric-Vision.code-workspace` is **gitignored** (by
the `*.code-workspace` glob in `.gitignore`), so stripping the folders is a local-only edit
that a fresh clone or a second machine will not inherit. `.claude/settings.json` **is**
committed, so the grant travels. If the siblings reappear in the workspace, this is why.

## Rules when working across roots

1. **Master kanban lives here only.** Cross-folder work is tracked in
   `.agents/mpi-kanban/`; entries pointing at sibling folders MUST include the absolute path
   in the body.
2. **CLAUDE.md + `.claude/rules/` auto-load for Cubric-Vision only.** Working in a sibling =
   brief sub-agents manually with the relevant rules.
3. **Absolute paths** in tool calls targeting siblings — relative paths resolve against
   Cubric-Vision.
4. **Sibling git repos are separate.** Never run `git` from Cubric-Vision against sibling
   paths — use `git -C <path>` or `cd` first.
5. **Design source of truth for the Website/Docs sites:** `c:\AI\Mpi\CubricStudio_Redesign\`
   (edit freely as playground; apply final design to the Website/Docs repos).
6. **DOCS WEBSITE PUSH BLOCK (hard rule):** never run `git push` (or any equivalent) in
   `c:\AI\Mpi\Cubric Studio (Docs)`. **The block still stands — but its original reason no
   longer holds, so do not repeat that reason.** Production now serves the REAL Vision docs
   (sidebar, Installation / Getting Started / Settings, embedded videos), verified live
   2026-07-30 — not the coming-soon page the rule was first written around. What the block
   protects now is simply that the local tree can be ahead of, behind, or divergent from what
   is deployed, and nobody has confirmed which. If asked to push: refuse, explain that the
   live site is real and a push could regress it, and ask the user to confirm the local tree
   is the intended deploy. Lifted only when the user explicitly says so.
