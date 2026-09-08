# MPI-601 — validation

Closed 2026-08-22. Every claim below was checked against the live artifact, not against
what the commit says it did.

## Licence lands on the pack

| Claim | Evidence |
|---|---|
| `LICENSE` exists and is AGPL-3.0 | 661 lines, fetched from `gnu.org/licenses/agpl-3.0.txt`, header reads `GNU AFFERO GENERAL PUBLIC LICENSE Version 3` |
| `pyproject.toml` points at a real file | was `license = "LICENSE"` (a literal string), now `license = { file = "LICENSE" }` |
| The registry stopped serving the dangling pointer | `GET api.comfy.org/nodes/ComfyUi-MpiNodes` → `license: {"file": "LICENSE"}` (was `{"text": "LICENSE"}` for 928 downloads) |
| README states the licence and its boundary | `## License` section names AGPL-3.0, notes GPLv3 §13 compatibility with ComfyUI, and states plainly that **1.2.6 and earlier remain MIT** |
| The relicence was ours to make | 65 commits all `MadPonyInteractive`, GitHub contributors = 1, PRs ever = **0**. Sole copyright holder, no third-party code |

The relicence was from a **stated MIT** (README line 213), not from a blank — found
mid-task and confirmed with Fabio before the push.

## Release reached the registry

| Step | Evidence |
|---|---|
| Version bumped | `pyproject.toml` 1.2.6 → 1.2.7, trigger comment updated |
| README synced to changelog | 24 nodes named in the 1.2.7 entries checked against README rows; only `MpiStageLatents` was missing, row added from its source `DESCRIPTION` |
| Next cycle opened | `# Version: V1.2.8` appended to `changelog.md` |
| Pushed | `38b3a27..ee85c98 main -> main` |
| Publish workflow | `Publish to Comfy registry` — **completed / success** on `ee85c98` |
| Version exists on registry | `1.2.7`, created `2026-08-22T13:24:58` |
| Changelog delivered | `PUT .../versions/1.2.7` → **HTTP 200**, all 29 entries |

**Not a gate:** promotion from `Pending` to current is asynchronous and can take hours.
Fabio confirmed this is normal registry behaviour. The 19 consecutive `Banned` versions
(1.0.5 → 1.2.5, April–July 2026) were a separate scanner problem he resolved with support
before this release.

A second push (`ee85c98..3e455e8`) corrected the README node count from "~60 utilities" to
"over 100" — 109 registered node classes, 96 documented rows. That push does **not**
re-trigger the publish workflow (it only fires on `pyproject.toml` changes), so the
registry listing carries the old count until the next version publish.

## Playbook

`docs/playbooks/upstream-contributions/README.md` — fork-first so an upstream PR never sits
on our release critical path, licence hygiene (never vendor GPL source into a first-party
repo), and the attribution rule.

**Self-applied:** `git log -1 --format='%an <%ae>'` on `ee85c98` returns
`MadPonyInteractive <fabiogoncalves@live.co.uk>` with **no `Co-Authored-By` trailer** — the
playbook's own rule, honoured by the commit that introduced it.

## Known-good scope boundary

The playbook was written for the LanPaint/LTX 2.5 case but no fork exists yet. That work is
MPI-602, deliberately not started here.
